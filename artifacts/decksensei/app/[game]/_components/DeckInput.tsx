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
  /** Deck de exemplo pré-preenchido (editável). */
  defaultDeck?: string;
  /** Dias desde o último snapshot de meta ativo. Exibe aviso se > 14. */
  metaSnapshotAgeDays?: number;
}

function sumQty(cards: { quantity: number }[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

// ─── Mapeamento de erros HTTP → mensagem amigável ─────────────────────────────

function httpErrorMessage(status: number, serverMessage?: string): string {
  if (status === 422) {
    return serverMessage ?? "Verifica os problemas no deck antes de analisar.";
  }
  if (status === 503) {
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
  /** Progresso do enriquecimento de cartas. null = fase não iniciada. */
  enrichProgress: { done: number; total: number } | null;
  /** Percentual de cartas enriquecidas (0–100). null = não recebido ainda. */
  enrichmentPct: number | null;
  /** Quando > 0: rate limit ativo — segundos até expirar. */
  retryAfterSec: number;
  /** Segundos de geração do streaming (início → fim). null = não calculado. */
  elapsedSec: number | null;
}

const IDLE: AnalysisState = {
  phase: "idle",
  text: "",
  error: "",
  validationErrors: [],
  colorMap: {},
  analysisId: "",
  enrichProgress: null,
  enrichmentPct: null,
  retryAfterSec: 0,
  elapsedSec: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeckInput({
  placeholder,
  gameConfig,
  featuredAnalysis,
  autoResume,
  defaultDeck,
  metaSnapshotAgeDays,
}: DeckInputProps) {
  const [deck, setDeck] = useState(defaultDeck ?? "");
  const [analysis, setAnalysis] = useState<AnalysisState>(IDLE);
  const [showFeatured, setShowFeatured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingResume, setPendingResume] = useState(false);

  /** Segundos restantes no countdown de rate limit — decrementado a cada 1s. */
  const [countdownSec, setCountdownSec] = useState(0);

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
      // localStorage indisponível — ignora
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restaura última análise do localStorage (válida por 24h) ─────────────
  useEffect(() => {
    if (autoResume) return;
    try {
      const cacheKey = `ds_analysis_${gameConfig.id}`;
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return;
      const data = JSON.parse(cached) as {
        text?: string;
        analysisId?: string;
        colorMap?: Record<string, string>;
        enrichmentPct?: number | null;
        elapsedSec?: number | null;
        savedAt?: number;
      };
      const MAX_AGE_MS = 24 * 60 * 60 * 1000;
      if (!data.savedAt || Date.now() - data.savedAt > MAX_AGE_MS) {
        localStorage.removeItem(cacheKey);
        return;
      }
      if (data.text) {
        setAnalysis({
          ...IDLE,
          phase: "done",
          text: data.text,
          analysisId: data.analysisId ?? "",
          colorMap: data.colorMap ?? {},
          enrichmentPct: data.enrichmentPct ?? null,
          elapsedSec: data.elapsedSec ?? null,
        });
      }
    } catch {
      // localStorage indisponível ou JSON inválido
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Título da aba dinâmico por fase ──────────────────────────────────────
  useEffect(() => {
    const PHASE_TITLES: Partial<Record<AnalysisPhase, string>> = {
      enriching: "Carregando cartas... — Deck Sensei",
      streaming: "Analisando... — Deck Sensei",
      done: "Análise pronta ✓ — Deck Sensei",
    };
    document.title = PHASE_TITLES[analysis.phase] ?? "Deck Sensei";
    return () => { document.title = "Deck Sensei"; };
  }, [analysis.phase]);

  // ── Countdown de rate limit ───────────────────────────────────────────────
  useEffect(() => {
    if (analysis.retryAfterSec <= 0) {
      setCountdownSec(0);
      return;
    }
    setCountdownSec(analysis.retryAfterSec);
    const interval = setInterval(() => {
      setCountdownSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setAnalysis(IDLE);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [analysis.retryAfterSec]);

  const parsed = useMemo(() => {
    if (!deck.trim()) return null;
    const parser = getParser(gameConfig.parser);
    return parser.parse(deck);
  }, [deck, gameConfig.parser]);

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
    try { localStorage.removeItem(`ds_analysis_${gameConfig.id}`); } catch {}
  }, [gameConfig.id]);

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
    try { localStorage.removeItem(`ds_analysis_${gameConfig.id}`); } catch {}
    const abort = new AbortController();
    abortRef.current = abort;

    // ── Validação do deck (sem chamar a API) ──────────────────────────────
    const validator = getValidator(gameConfig.validator);
    const validation = validator.validate(parsed);

    if (!validation.valid) {
      setAnalysis({ ...IDLE, phase: "error", validationErrors: validation.errors });
      return;
    }

    try {
      // ── Enriquecer cartas via API externa ─────────────────────────────
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

      const cardApi = getCardAPI(gameConfig.card_api);
      const enrichedMap = new Map<string, Awaited<ReturnType<typeof cardApi.fetchCard>>>();

      const enrichTotal = uniqueCards.length;
      let enrichDone = 0;
      setAnalysis({ ...IDLE, phase: "enriching", enrichProgress: { done: 0, total: enrichTotal } });

      // Pool de 5 workers máx — evita burst de conexões em decks grandes
      const ENRICH_CONCURRENCY = 5;
      const queue = [...uniqueCards];
      const workers = Array.from(
        { length: Math.min(ENRICH_CONCURRENCY, enrichTotal) },
        async () => {
          while (true) {
            const card = queue.shift();
            if (!card) break;
            const data = await cardApi.fetchCard(card.cardCode);
            enrichedMap.set(card.cardCode, data);
            enrichDone += 1;
            const snapshot = enrichDone;
            setAnalysis((prev) => ({
              ...prev,
              phase: "enriching" as const,
              enrichProgress: { done: snapshot, total: enrichTotal },
            }));
          }
        },
      );
      await Promise.all(workers);

      if (abort.signal.aborted) return;

      const enrichedCards: EnrichedCard[] = allCards.map((card) => ({
        ...card,
        data: enrichedMap.get(card.cardCode) ?? null,
      }));

      // ── Streaming da análise via /api/analyze ─────────────────────────
      const streamStartMs = Date.now();
      setAnalysis({ ...IDLE, phase: "streaming" });

      let res: Response;
      try {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({ gameId: gameConfig.id, deck: parsed, enrichedCards }),
        });
      } catch (fetchErr) {
        if ((fetchErr as { name?: string }).name === "AbortError") return;
        setAnalysis({
          ...IDLE,
          phase: "error",
          error: "Não consegui conectar agora — tenta de novo em alguns segundos.",
        });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const bodyTyped = body as { error?: string; message_pt?: string; retryAfterSec?: number } | null;

        if (res.status === 401 && bodyTyped?.error === "auth_required") {
          try { localStorage.setItem(`pending_deck_${gameConfig.id}`, deck); } catch {}
          setAnalysis(IDLE);
          setShowAuthModal(true);
          return;
        }

        if (res.status === 429) {
          const retryAfterSec =
            bodyTyped?.retryAfterSec ??
            parseInt(res.headers.get("Retry-After") ?? "60", 10);
          setAnalysis({
            ...IDLE,
            phase: "error",
            error: bodyTyped?.message_pt ?? "Limite de análises atingido — tente de novo em instantes.",
            retryAfterSec,
          });
          return;
        }

        setAnalysis({ ...IDLE, phase: "error", error: httpErrorMessage(res.status, bodyTyped?.error) });
        return;
      }

      if (!res.body) {
        setAnalysis({ ...IDLE, phase: "error", error: "Resposta inesperada do servidor — tenta de novo." });
        return;
      }

      // ── Captura headers antes de ler o stream ────────────────────────
      let colorMap: Record<string, string> = {};
      try {
        const raw = res.headers.get("X-Meta-Color-Map");
        if (raw) colorMap = JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
      } catch {}
      const analysisId = res.headers.get("X-Analysis-Id") ?? "";
      const enrichmentPctRaw = res.headers.get("X-Enrichment-Coverage");
      const enrichmentPct = enrichmentPctRaw !== null ? parseInt(enrichmentPctRaw, 10) : null;

      // ── Leitura do stream ─────────────────────────────────────────────
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abort.signal.aborted) { await reader.cancel(); return; }
        fullText += decoder.decode(value, { stream: true });
        setAnalysis({ ...IDLE, phase: "streaming", text: fullText, colorMap, analysisId, enrichmentPct });
      }

      const elapsedSec = Math.round((Date.now() - streamStartMs) / 1000);
      setAnalysis({ ...IDLE, phase: "done", text: fullText, colorMap, analysisId, enrichmentPct, elapsedSec });

      // Persiste no localStorage (24h)
      try {
        localStorage.setItem(
          `ds_analysis_${gameConfig.id}`,
          JSON.stringify({ text: fullText, analysisId, colorMap, enrichmentPct, elapsedSec, savedAt: Date.now() }),
        );
      } catch {}
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      console.error("[analyze]", err);
      setAnalysis({
        ...IDLE,
        phase: "error",
        error: "A conexão caiu no meio da análise — tenta de novo em alguns segundos.",
      });
    }
  }, [parsed, isReady, gameConfig.id, gameConfig.deck_rules, deck]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const { phase } = analysis;
  const isAnalyzing = phase === "enriching" || phase === "streaming";
  const showAnalysisArea = phase === "enriching" || phase === "streaming" || phase === "done";
  const isRateLimited = phase === "error" && analysis.retryAfterSec > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Textarea */}
      <Textarea
        value={deck}
        onChange={(e) => handleDeckChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && isReady && !isAnalyzing && !isRateLimited) {
            e.preventDefault();
            void handleAnalyze();
          }
        }}
        placeholder={placeholder}
        rows={12}
        className="font-mono text-sm leading-relaxed"
        aria-label="Decklist"
        readOnly={isAnalyzing}
      />

      {/* Deck parse preview */}
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
                  <span className="font-semibold tabular-nums">{mainDeckCount}</span>
                  <span className="text-muted-foreground/60">/{main_deck_size}</span>
                </span>

                {hasEggDeck && (
                  <>
                    <Divider />
                    <span className="text-muted-foreground">
                      egg deck:{" "}
                      <span className="font-semibold tabular-nums text-foreground">{eggDeckCount}</span>
                    </span>
                  </>
                )}

                {mainStatus === "low" && mainDeckCount > 0 && (
                  <>
                    <Divider />
                    <span className="text-amber-400/80">faltam {main_deck_size - mainDeckCount}</span>
                  </>
                )}

                {mainStatus === "high" && (
                  <>
                    <Divider />
                    <span className="text-amber-400/80">{mainDeckCount - main_deck_size} a mais</span>
                  </>
                )}
              </>
            )}
          </div>

          {parsed.errors.length > 0 && (
            <ul className="flex flex-col gap-0.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              {parsed.errors.map((err, i) => (
                <li key={i} className="text-xs text-destructive/80">{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Erros de validação */}
      {phase === "error" && analysis.validationErrors.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-medium text-amber-400/90">Ajusta o deck antes de continuar:</p>
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

      {/* Rate limit — mensagem + countdown */}
      {isRateLimited && (
        <div className="rounded-lg border border-orange-500/25 bg-orange-500/5 px-4 py-3">
          <p className="text-xs font-medium text-orange-400/90">{analysis.error}</p>
          {countdownSec > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Liberando em{" "}
              <span className="tabular-nums font-semibold text-orange-300/80">
                {formatCountdown(countdownSec)}
              </span>
              …
            </p>
          )}
        </div>
      )}

      {/* Botão Analisar */}
      {(phase === "idle" || phase === "error") && (
        <>
          {phase === "error" && analysis.error && !isRateLimited && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/80">
              {analysis.error}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button
                size="lg"
                disabled={!isReady || isRateLimited}
                className="w-full sm:w-auto"
                onClick={handleAnalyze}
              >
                {isRateLimited
                  ? countdownSec > 0 ? `Aguarde ${formatCountdown(countdownSec)}` : "Analisar deck"
                  : phase === "error" ? "Tentar de novo" : "Analisar deck"}
              </Button>
              {phase === "idle" && isReady && (
                <span className="text-xs text-muted-foreground/50 hidden sm:block">
                  ou ⌘↵
                </span>
              )}
            </div>
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

      {/* Banner de cobertura de enriquecimento */}
      {(phase === "streaming" || phase === "done") &&
        analysis.enrichmentPct !== null &&
        analysis.enrichmentPct < 100 && (
          <div
            className={
              analysis.enrichmentPct < 50
                ? "rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-300/90"
                : "rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
            }
          >
            Análise gerada com{" "}
            <span className="font-semibold tabular-nums">{analysis.enrichmentPct}%</span>{" "}
            de cobertura de cartas.
          </div>
        )}

      {/* Área de análise */}
      {showAnalysisArea && (
        <div className="border-t border-border/30 pt-4">
          <AnalysisStream
            text={analysis.text}
            phase={phase as "enriching" | "streaming" | "done"}
            enrichProgress={analysis.enrichProgress}
            colorMap={analysis.colorMap}
            analysisId={analysis.analysisId}
            gameId={gameConfig.id}
            onReset={handleReset}
            elapsedSec={analysis.elapsedSec}
            metaSnapshotAgeDays={metaSnapshotAgeDays}
          />
        </div>
      )}

      {/* Modal análise featured */}
      {showFeatured && featuredAnalysis && (
        <FeaturedModal
          analysisText={featuredAnalysis.text}
          playerName={featuredAnalysis.playerName}
          onClose={() => setShowFeatured(false)}
        />
      )}

      {/* Modal de cadastro obrigatório */}
      <AuthRequiredModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function formatCountdown(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${sec}s`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-muted-foreground">
      {label}: <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function Divider() {
  return <span className="text-border">·</span>;
}
