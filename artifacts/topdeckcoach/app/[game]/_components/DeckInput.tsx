"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getParser, getCardAPI, getValidator } from "@/lib/games";
import type { GameConfig } from "@/lib/game-config";
import type { EnrichedCard, ParsedCard } from "@/lib/games/types";
import AnalysisStream from "./AnalysisStream";
import FeaturedModal from "./FeaturedModal";
import AuthRequiredModal from "./AuthRequiredModal";

interface DeckInputProps {
  placeholder: string;
  gameConfig: GameConfig;
  featuredAnalysis?: { text: string; playerName: string };
  autoResume?: boolean;
}

function sumQty(cards: { quantity: number }[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

// ─── Mapeamento de erros HTTP → mensagem amigável ─────────────────────────────

function httpErrorMessage(status: number, serverMessage?: string): string {
  if (status === 422) {
    return (
      serverMessage ?? "Verifica os problemas no deck antes de analisar."
    );
  }
  if (status === 503 || status === 429) {
    return "A análise está temporariamente indisponível — aguarda um instante e tenta de novo.";
  }
  if (status === 404) {
    return "Jogo não encontrado — verifique se o endereço está correto.";
  }
  if (status >= 500) {
    return "Algo deu errado no servidor. Tenta de novo em alguns segundos.";
  }
  return "Ocorreu um problema inesperado. Tenta de novo.";
}

// ─── State machine ────────────────────────────────────────────────────────────

type AnalysisPhase = "idle" | "enriching" | "streaming" | "done" | "error";

interface AnalysisState {
  phase: AnalysisPhase;
  text: string;
  /** Mensagem genérica de erro (conexão, servidor). */
  error: string;
  /** Erros de validação do deck — quando preenchido, mostra lista coach-tone. */
  validationErrors: string[];
  /** Mapa nome_pt → cor primária do arquetipo, vindo do header X-Meta-Color-Map. */
  colorMap: Record<string, string>;
  /** ID da análise salva no DB (nanoid 24), vindo do header X-Analysis-Id. */
  analysisId: string;
}

const IDLE: AnalysisState = {
  phase: "idle",
  text: "",
  error: "",
  validationErrors: [],
  colorMap: {},
  analysisId: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeckInput({ placeholder, gameConfig, featuredAnalysis, autoResume }: DeckInputProps) {
  const [deck, setDeck] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisState>(IDLE);
  const [showFeatured, setShowFeatured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingResume, setPendingResume] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Auto-resume: restaura deck salvo no localStorage após magic-link verify ──
  useEffect(() => {
    if (!autoResume) return;
    try {
      const saved = localStorage.getItem(`pending_deck_${gameConfig.id}`);
      if (saved) {
        setDeck(saved);
        setPendingResume(true);
        localStorage.removeItem(`pending_deck_${gameConfig.id}`);
      }
    } catch {
      // localStorage indisponível (SSR, privado) — ignora silenciosamente
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Dispara análise automaticamente após restaurar o deck ──────────────────
  useEffect(() => {
    if (pendingResume && parsed && isReady) {
      setPendingResume(false);
      handleAnalyze();
    }
  // handleAnalyze é estável via useCallback — ok omitir
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume, isReady]);

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

    // ── Layer 3: Validação do deck (sem chamar a API) ─────────────────────
    const validator = getValidator(gameConfig.id);
    const validation = validator.validate(parsed, gameConfig.deck_rules);

    if (!validation.valid) {
      setAnalysis({
        phase: "error",
        text: "",
        error: "",
        validationErrors: validation.errors,
        colorMap: {},
        analysisId: "",
      });
      return;
    }

    try {
      // ── Enriquecer cartas via API externa ─────────────────────────────
      setAnalysis({ phase: "enriching", text: "", error: "", validationErrors: [], colorMap: {}, analysisId: "" });

      const allCards: ParsedCard[] = [
        ...parsed.mainDeck,
        ...Object.values(parsed.auxDecks).flat(),
      ];

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

      // ── Streaming da análise via /api/analyze ─────────────────────────
      setAnalysis({ phase: "streaming", text: "", error: "", validationErrors: [], colorMap: {}, analysisId: "" });

      // Layer 1: erro de rede na requisição inicial
      let res: Response;
      try {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            gameId: gameConfig.id,
            deck: parsed,
            enrichedCards,
          }),
        });
      } catch (fetchErr) {
        if ((fetchErr as { name?: string }).name === "AbortError") return;
        setAnalysis({
          phase: "error",
          text: "",
          error: "Não consegui conectar agora — tenta de novo em alguns segundos.",
          validationErrors: [],
          colorMap: {},
          analysisId: "",
        });
        return;
      }

      // Layer 2: erro HTTP do servidor
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const bodyTyped = body as { error?: string; message_pt?: string } | null;

        // Caso especial: cadastro necessário para continuar
        if (res.status === 401 && bodyTyped?.error === "auth_required") {
          try {
            localStorage.setItem(`pending_deck_${gameConfig.id}`, deck);
          } catch {
            // localStorage indisponível — ignora
          }
          setAnalysis(IDLE);
          setShowAuthModal(true);
          return;
        }

        setAnalysis({
          phase: "error",
          text: "",
          error: httpErrorMessage(res.status, bodyTyped?.error),
          validationErrors: [],
          colorMap: {},
          analysisId: "",
        });
        return;
      }

      if (!res.body) {
        setAnalysis({
          phase: "error",
          text: "",
          error: "Resposta inesperada do servidor — tenta de novo.",
          validationErrors: [],
          colorMap: {},
          analysisId: "",
        });
        return;
      }

      // ── Captura headers antes de ler o stream ────────────────────────
      let colorMap: Record<string, string> = {};
      try {
        const raw = res.headers.get("X-Meta-Color-Map");
        if (raw) colorMap = JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
      } catch {
        // header ausente ou malformado — análise continua sem cores de arquetipo
      }
      const analysisId = res.headers.get("X-Analysis-Id") ?? "";

      // ── Leitura do stream ─────────────────────────────────────────────
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
        setAnalysis({ phase: "streaming", text: fullText, error: "", validationErrors: [], colorMap, analysisId });
      }

      setAnalysis({ phase: "done", text: fullText, error: "", validationErrors: [], colorMap, analysisId });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      // Layer 1: erro de stream (conexão caiu durante a leitura)
      console.error("[analyze]", err);
      setAnalysis({
        phase: "error",
        text: "",
        error: "A conexão caiu no meio da análise — tenta de novo em alguns segundos.",
        validationErrors: [],
        colorMap: {},
        analysisId: "",
      });
    }
  }, [parsed, isReady, gameConfig.id, gameConfig.deck_rules]);

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

      {/* Erros de validação do deck — tom de coach, lista estruturada */}
      {phase === "error" && analysis.validationErrors.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-medium text-amber-400/90">
            Ajusta o deck antes de continuar:
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {analysis.validationErrors.map((msg, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-amber-400/70">→</span>
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Botão Analisar / erro de conexão ou servidor */}
      {(phase === "idle" || phase === "error") && (
        <>
          {phase === "error" && analysis.error && (
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
              {phase === "error" ? "Tentar de novo" : "Analisar deck"}
            </Button>
            {phase === "idle" && featuredAnalysis && (
              <button
                type="button"
                onClick={() => setShowFeatured(true)}
                className="text-center text-sm text-muted-foreground transition-colors hover:text-foreground underline underline-offset-4 sm:text-right"
              >
                ver análise de exemplo
              </button>
            )}
          </div>
        </>
      )}

      {/* Divider + análise em stream */}
      {showStream && (
        <div className="border-t border-border/30 pt-4">
          <AnalysisStream
            text={analysis.text}
            streaming={phase === "streaming"}
            colorMap={analysis.colorMap}
            analysisId={analysis.analysisId}
            gameId={gameConfig.id}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Modal de análise featured */}
      {showFeatured && featuredAnalysis && (
        <FeaturedModal
          analysisText={featuredAnalysis.text}
          playerName={featuredAnalysis.playerName}
          onClose={() => setShowFeatured(false)}
        />
      )}

      {/* Modal de cadastro obrigatório */}
      <AuthRequiredModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
      />
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
