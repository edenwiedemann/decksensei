"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getParser, getCardAPI } from "@/lib/games";
import type { GameConfig } from "@/lib/game-config";
import type { EnrichedCard, ParsedCard } from "@/lib/games/types";
import AnalysisStream from "./AnalysisStream";

interface DeckInputProps {
  placeholder: string;
  gameConfig: GameConfig;
}

function sumQty(cards: { quantity: number }[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

// ─── State machine ────────────────────────────────────────────────────────────

type AnalysisPhase = "idle" | "enriching" | "streaming" | "done" | "error";

interface AnalysisState {
  phase: AnalysisPhase;
  text: string;
  error: string;
}

const IDLE: AnalysisState = { phase: "idle", text: "", error: "" };

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeckInput({ placeholder, gameConfig }: DeckInputProps) {
  const [deck, setDeck] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => {
    if (!deck.trim()) return null;
    const parser = getParser(gameConfig.id);
    return parser.parse(deck);
  }, [deck, gameConfig.id]);

  const { main_deck_size, egg_deck_max } = gameConfig.deck_rules;
  const hasEggDeck = egg_deck_max > 0;

  const mainDeckCount = parsed ? sumQty(parsed.mainDeck) : 0;
  const eggDeckCount = parsed ? sumQty(parsed.auxDecks["egg"] ?? []) : 0;
  const totalCards = mainDeckCount + eggDeckCount;
  const hasRecognized = parsed
    ? parsed.mainDeck.length + Object.values(parsed.auxDecks).flat().length > 0
    : false;

  const isReady = parsed !== null && mainDeckCount >= main_deck_size;

  const mainStatus: "ok" | "low" | "high" =
    !parsed || mainDeckCount === 0
      ? "low"
      : mainDeckCount === main_deck_size
        ? "ok"
        : mainDeckCount > main_deck_size
          ? "high"
          : "low";

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setAnalysis(IDLE);
  }, []);

  const handleDeckChange = useCallback(
    (value: string) => {
      setDeck(value);
      // Editar o deck enquanto análise está pronta reinicia o estado
      if (analysis.phase === "done" || analysis.phase === "error") {
        setAnalysis(IDLE);
      }
    },
    [analysis.phase],
  );

  const handleAnalyze = useCallback(async () => {
    if (!parsed || !isReady) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // ── 1. Enriquecer cartas via API externa ─────────────────────────────
      setAnalysis({ phase: "enriching", text: "", error: "" });

      const allCards: ParsedCard[] = [
        ...parsed.mainDeck,
        ...Object.values(parsed.auxDecks).flat(),
      ];

      // Deduplica por código para minimizar chamadas à API
      const seenCodes = new Set<string>();
      const uniqueCards = allCards.filter((c) => {
        if (seenCodes.has(c.cardCode)) return false;
        seenCodes.add(c.cardCode);
        return true;
      });

      const cardApi = getCardAPI(gameConfig.id);
      const enrichedMap = new Map<
        string,
        Awaited<ReturnType<typeof cardApi.fetchCard>>
      >();

      await Promise.all(
        uniqueCards.map(async (card) => {
          const data = await cardApi.fetchCard(card.cardCode);
          enrichedMap.set(card.cardCode, data);
        }),
      );

      if (abort.signal.aborted) return;

      const enrichedCards: EnrichedCard[] = allCards.map((card) => ({
        ...card,
        data: enrichedMap.get(card.cardCode) ?? null,
      }));

      // ── 2. Streaming da análise via /api/analyze ─────────────────────────
      setAnalysis({ phase: "streaming", text: "", error: "" });

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          gameId: gameConfig.id,
          deck: parsed,
          enrichedCards,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          (body as { error?: string } | null)?.error ??
          `Erro ${res.status} — tente novamente.`;
        setAnalysis({ phase: "error", text: "", error: msg });
        return;
      }

      if (!res.body) {
        setAnalysis({
          phase: "error",
          text: "",
          error: "Resposta inválida do servidor.",
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abort.signal.aborted) {
          await reader.cancel();
          return;
        }
        fullText += decoder.decode(value, { stream: true });
        setAnalysis({ phase: "streaming", text: fullText, error: "" });
      }

      setAnalysis({ phase: "done", text: fullText, error: "" });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      console.error("[analyze]", err);
      setAnalysis({
        phase: "error",
        text: "",
        error: "Erro de conexão. Verifique sua internet e tente novamente.",
      });
    }
  }, [parsed, isReady, gameConfig.id]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const { phase } = analysis;
  const isAnalyzing = phase === "enriching" || phase === "streaming";
  const showStream = phase === "streaming" || phase === "done";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Textarea — read-only durante análise em progresso */}
      <Textarea
        value={deck}
        onChange={(e) => handleDeckChange(e.target.value)}
        placeholder={placeholder}
        rows={12}
        className="font-mono text-sm leading-relaxed"
        aria-label="Decklist"
        readOnly={isAnalyzing}
      />

      {/* Deck parse preview — só aparece quando idle/error */}
      {parsed !== null && (phase === "idle" || phase === "error") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
            {!hasRecognized ? (
              <span className="text-muted-foreground">
                Nenhuma carta reconhecida — verifique o formato
              </span>
            ) : (
              <>
                <Stat label="total" value={totalCards} />
                <Divider />

                <span
                  className={
                    mainStatus === "ok"
                      ? "text-green-400"
                      : mainStatus === "high"
                        ? "text-amber-400"
                        : "text-muted-foreground"
                  }
                >
                  main deck:{" "}
                  <span className="font-semibold tabular-nums">
                    {mainDeckCount}
                  </span>
                  <span className="text-muted-foreground/60">
                    /{main_deck_size}
                  </span>
                </span>

                {hasEggDeck && (
                  <>
                    <Divider />
                    <span className="text-muted-foreground">
                      egg deck:{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {eggDeckCount}
                      </span>
                    </span>
                  </>
                )}

                {mainStatus === "low" && mainDeckCount > 0 && (
                  <>
                    <Divider />
                    <span className="text-amber-400/80">
                      faltam {main_deck_size - mainDeckCount}
                    </span>
                  </>
                )}

                {mainStatus === "high" && (
                  <>
                    <Divider />
                    <span className="text-amber-400/80">
                      {mainDeckCount - main_deck_size} a mais
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {parsed.errors.length > 0 && (
            <ul className="flex flex-col gap-0.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              {parsed.errors.map((err, i) => (
                <li key={i} className="text-xs text-destructive/80">
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Indicador de enriquecimento de cartas */}
      {phase === "enriching" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" />
          Buscando dados das cartas...
        </div>
      )}

      {/* Botão Analisar / erro */}
      {(phase === "idle" || phase === "error") && (
        <>
          {phase === "error" && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/80">
              {analysis.error}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              size="lg"
              disabled={!isReady}
              className="w-full sm:w-auto"
              onClick={handleAnalyze}
            >
              Analisar deck
            </Button>
            <a
              href="#exemplo"
              className="text-center text-sm text-muted-foreground transition-colors hover:text-foreground underline underline-offset-4 sm:text-right"
            >
              ver análise de exemplo
            </a>
          </div>
        </>
      )}

      {/* Divider + análise em stream */}
      {showStream && (
        <div className="border-t border-border/30 pt-4">
          <AnalysisStream
            text={analysis.text}
            streaming={phase === "streaming"}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-muted-foreground">
      {label}:{" "}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function Divider() {
  return <span className="text-border">·</span>;
}
