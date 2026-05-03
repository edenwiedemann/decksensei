"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getParser, getCardAPI, getValidator } from "@/lib/games";
import type { GameConfig } from "@/lib/game-config";
import type { EnrichedCard, ParsedCard } from "@/lib/games/types";
import { computeDeckGrade, type DeckGrade } from "@/lib/deck-score";
import AnalysisStream from "./AnalysisStream";
import FeaturedModal from "./FeaturedModal";
import AuthRequiredModal from "./AuthRequiredModal";

interface DeckInputProps {
  placeholder: string;
  gameConfig: GameConfig;
  featuredAnalysis?: { text: string; playerName: string };
  autoResume?: boolean;
  /** Deck de exemplo pré-preenchido quando não há cache de análise anterior. */
  defaultDeck?: string;
  /** Dias desde o último snapshot de meta ativo. Exibe aviso se > 14. */
  metaSnapshotAgeDays?: number;
}

function sumQty(cards: { quantity: number }[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

function httpErrorMessage(status: number, serverMessage?: string): string {
  if (status === 422) return serverMessage ?? "Verifica os problemas no deck antes de analisar.";
  if (status === 503) return "A análise está temporariamente indisponível — aguarda um instante e tenta de novo.";
  if (status === 404) return "Jogo não encontrado — verifique se o endereço está correto.";
  if (status >= 500) return "Algo deu errado no servidor. Tenta de novo em alguns segundos.";
  return "Ocorreu um problema inesperado. Tenta de novo.";
}

// ─── State machine ────────────────────────────────────────────────────────────

type AnalysisPhase = "idle" | "enriching" | "streaming" | "done" | "error";

interface AnalysisState {
  phase: AnalysisPhase;
  text: string;
  error: string;
  validationErrors: string[];
  colorMap: Record<string, string>;
  analysisId: string;
  enrichProgress: { done: number; total: number } | null;
  enrichmentPct: number | null;
  retryAfterSec: number;
  elapsedSec: number | null;
  /** Cartas que falharam no enriquecimento (mesmo após retry). */
  failedCards: string[];
  /** Grade calculado do texto da análise atual. */
  currentGrade: DeckGrade | null;
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
  failedCards: [],
  currentGrade: null,
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
  // deck inicia vazio — preenchido no useEffect (localStorage ou defaultDeck)
  const [deck, setDeck] = useState("");
  // true enquanto o deck não foi tocado pelo usuário e é o exemplo pré-preenchido
  const [isUntouchedExample, setIsUntouchedExample] = useState(false);
  // grade da análise anterior (lido do localStorage; para mostrar diff)
  const [previousGrade, setPreviousGrade] = useState<DeckGrade | null>(null);

  const [analysis, setAnalysis] = useState<AnalysisState>(IDLE);
  const [showFeatured, setShowFeatured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingResume, setPendingResume] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const [tournamentMode, setTournamentMode] = useState(false);
  const [usageCount, setUsageCount] = useState<{ used: number; limit: number; isAuthenticated: boolean } | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [deckName, setDeckName] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const analysisAreaRef = useRef<HTMLDivElement>(null);

  // ── Auto-resume após magic-link ───────────────────────────────────────────
  useEffect(() => {
    if (!autoResume) return;
    try {
      const saved = localStorage.getItem(`pending_deck_${gameConfig.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { deck?: string; deckName?: string; tournamentMode?: boolean };
          if (parsed.deck) setDeck(parsed.deck);
          if (parsed.deckName) setDeckName(parsed.deckName);
          if (parsed.tournamentMode) setTournamentMode(parsed.tournamentMode);
        } catch {
          setDeck(saved);
        }
        setPendingResume(true);
        localStorage.removeItem(`pending_deck_${gameConfig.id}`);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restaura localStorage (análise + deck) ou exibe deck de exemplo ───────
  useEffect(() => {
    if (autoResume) return;
    try {
      // Carrega grade anterior para mostrar diff
      const prevGradeRaw = localStorage.getItem(`ds_prev_grade_${gameConfig.id}`);
      if (prevGradeRaw && ["A", "B", "C", "D"].includes(prevGradeRaw)) {
        setPreviousGrade(prevGradeRaw as DeckGrade);
      }

      const cacheKey = `ds_analysis_${gameConfig.id}`;
      const cached = localStorage.getItem(cacheKey);

      if (!cached) {
        // Sem cache: mostra deck de exemplo
        if (defaultDeck) { setDeck(defaultDeck); setIsUntouchedExample(true); }
        return;
      }

      const data = JSON.parse(cached) as {
        text?: string;
        analysisId?: string;
        colorMap?: Record<string, string>;
        enrichmentPct?: number | null;
        elapsedSec?: number | null;
        deckText?: string;
        savedAt?: number;
      };

      const MAX_AGE_MS = 24 * 60 * 60 * 1000;
      if (!data.savedAt || Date.now() - data.savedAt > MAX_AGE_MS) {
        localStorage.removeItem(cacheKey);
        if (defaultDeck) { setDeck(defaultDeck); setIsUntouchedExample(true); }
        return;
      }

      if (data.text) {
        if (data.deckText) setDeck(data.deckText);
        setAnalysis({
          ...IDLE,
          phase: "done",
          text: data.text,
          analysisId: data.analysisId ?? "",
          colorMap: data.colorMap ?? {},
          enrichmentPct: data.enrichmentPct ?? null,
          elapsedSec: data.elapsedSec ?? null,
          currentGrade: computeDeckGrade(data.text)?.grade ?? null,
        });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Título da aba dinâmico ─────────────────────────────────────────────────
  useEffect(() => {
    const PHASE_TITLES: Partial<Record<AnalysisPhase, string>> = {
      enriching: "Carregando cartas... — Deck Sensei",
      streaming: "Analisando... — Deck Sensei",
      done: "Análise pronta ✓ — Deck Sensei",
    };
    document.title = PHASE_TITLES[analysis.phase] ?? "Deck Sensei";
    return () => { document.title = "Deck Sensei"; };
  }, [analysis.phase]);

  // ── Busca uso atual na API (anon: limite de 5 por hora) ──────────────────
  useEffect(() => {
    fetch("/api/my-usage")
      .then((r) => r.json() as Promise<{ used: number; limit: number; isAuthenticated: boolean }>)
      .then(setUsageCount)
      .catch(() => {});
  }, []);

  // ── Verifica suporte a clipboard.readText (principalmente mobile) ─────────
  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && "clipboard" in navigator && "readText" in navigator.clipboard);
  }, []);

  // ── Auto-scroll para área de análise quando inicia ────────────────────────
  useEffect(() => {
    if (analysis.phase === "enriching") {
      setTimeout(() => {
        analysisAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, [analysis.phase]);

  // ── Countdown de rate limit ───────────────────────────────────────────────
  useEffect(() => {
    if (analysis.retryAfterSec <= 0) { setCountdownSec(0); return; }
    setCountdownSec(analysis.retryAfterSec);
    const interval = setInterval(() => {
      setCountdownSec((prev) => {
        if (prev <= 1) { clearInterval(interval); setAnalysis(IDLE); return 0; }
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

  useEffect(() => {
    if (pendingResume && parsed && isReady) {
      setPendingResume(false);
      handleAnalyze();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume, isReady]);

  const mainStatus: "ok" | "low" | "high" =
    !parsed || mainDeckCount === 0 ? "low"
    : mainDeckCount === main_deck_size ? "ok"
    : mainDeckCount > main_deck_size ? "high"
    : "low";

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setAnalysis(IDLE);
    setIsUntouchedExample(false);
    try { localStorage.removeItem(`ds_analysis_${gameConfig.id}`); } catch {}
  }, [gameConfig.id]);

  const handleDeckChange = useCallback(
    (value: string) => {
      setDeck(value);
      setIsUntouchedExample(false);
      if (analysis.phase === "done" || analysis.phase === "error") setAnalysis(IDLE);
    },
    [analysis.phase],
  );

  const handleClearExample = useCallback(() => {
    setDeck("");
    setIsUntouchedExample(false);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!parsed || !isReady) return;

    abortRef.current?.abort();
    setIsUntouchedExample(false);
    try { localStorage.removeItem(`ds_analysis_${gameConfig.id}`); } catch {}
    const abort = new AbortController();
    abortRef.current = abort;

    // Validação do deck
    const validator = getValidator(gameConfig.validator);
    const validation = validator.validate(parsed);
    if (!validation.valid) {
      setAnalysis({ ...IDLE, phase: "error", validationErrors: validation.errors });
      return;
    }

    try {
      // ── Enriquecimento de cartas ──────────────────────────────────────
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
      const failedCards: string[] = [];

      const enrichTotal = uniqueCards.length;
      let enrichDone = 0;
      setAnalysis({ ...IDLE, phase: "enriching", enrichProgress: { done: 0, total: enrichTotal } });

      // Pool de 5 workers (a API já tem retry embutido no GenericCardAPI)
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
            if (data === null) failedCards.push(card.cardCode);
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

      // ── Streaming ────────────────────────────────────────────────────
      const streamStartMs = Date.now();
      setAnalysis({ ...IDLE, phase: "streaming", failedCards });

      let res: Response;
      try {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({ gameId: gameConfig.id, deck: parsed, enrichedCards, tournamentMode, deckName: deckName.trim() || null }),
        });
      } catch (fetchErr) {
        if ((fetchErr as { name?: string }).name === "AbortError") return;
        setAnalysis({ ...IDLE, phase: "error", error: "Não consegui conectar agora — tenta de novo em alguns segundos.", failedCards });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const bodyTyped = body as { error?: string; message_pt?: string; retryAfterSec?: number } | null;

        if (res.status === 401 && bodyTyped?.error === "auth_required") {
          try { localStorage.setItem(`pending_deck_${gameConfig.id}`, JSON.stringify({ deck, deckName: deckName.trim() || null, tournamentMode })); } catch {}
          setAnalysis(IDLE);
          setShowAuthModal(true);
          return;
        }
        if (res.status === 429) {
          const retryAfterSec = bodyTyped?.retryAfterSec ?? parseInt(res.headers.get("Retry-After") ?? "60", 10);
          setAnalysis({ ...IDLE, phase: "error", error: bodyTyped?.message_pt ?? "Limite de análises atingido.", retryAfterSec, failedCards });
          return;
        }
        setAnalysis({ ...IDLE, phase: "error", error: httpErrorMessage(res.status, bodyTyped?.error), failedCards });
        return;
      }

      if (!res.body) {
        setAnalysis({ ...IDLE, phase: "error", error: "Resposta inesperada do servidor — tenta de novo.", failedCards });
        return;
      }

      let colorMap: Record<string, string> = {};
      try {
        const raw = res.headers.get("X-Meta-Color-Map");
        if (raw) colorMap = JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
      } catch {}
      const analysisId = res.headers.get("X-Analysis-Id") ?? "";
      const enrichmentPctRaw = res.headers.get("X-Enrichment-Coverage");
      const enrichmentPct = enrichmentPctRaw !== null ? parseInt(enrichmentPctRaw, 10) : null;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abort.signal.aborted) { await reader.cancel(); return; }
        fullText += decoder.decode(value, { stream: true });
        setAnalysis({ ...IDLE, phase: "streaming", text: fullText, colorMap, analysisId, enrichmentPct, failedCards });
      }

      const elapsedSec = Math.round((Date.now() - streamStartMs) / 1000);
      const currentGrade = computeDeckGrade(fullText)?.grade ?? null;

      // Persiste grade atual como "anterior" para a próxima sessão
      if (currentGrade) {
        try { localStorage.setItem(`ds_prev_grade_${gameConfig.id}`, currentGrade); } catch {}
      }

      setAnalysis({ ...IDLE, phase: "done", text: fullText, colorMap, analysisId, enrichmentPct, elapsedSec, failedCards, currentGrade });

      // Salva análise + deck no localStorage (24h)
      try {
        localStorage.setItem(
          `ds_analysis_${gameConfig.id}`,
          JSON.stringify({ text: fullText, analysisId, colorMap, enrichmentPct, elapsedSec, deckText: deck, savedAt: Date.now() }),
        );
      } catch {}
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      console.error("[analyze]", err);
      setAnalysis({ ...IDLE, phase: "error", error: "A conexão caiu no meio da análise — tenta de novo em alguns segundos." });
    }
  }, [parsed, isReady, gameConfig.id, gameConfig.deck_rules, deck, deckName, tournamentMode]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const { phase } = analysis;
  const isAnalyzing = phase === "enriching" || phase === "streaming";
  const showAnalysisArea = phase === "enriching" || phase === "streaming" || phase === "done";
  const isRateLimited = phase === "error" && analysis.retryAfterSec > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Banner: deck de exemplo pré-preenchido */}
      {isUntouchedExample && phase === "idle" && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary/80">
          <span>Deck de exemplo — substitua pelo seu ou clique em Analisar para ver como funciona.</span>
          <button
            onClick={handleClearExample}
            className="ml-3 shrink-0 rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors hover:bg-border/30"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Colar da área de transferência — útil no mobile */}
      {canPaste && phase === "idle" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text.trim()) handleDeckChange(text);
              } catch {}
            }}
            className="text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
          >
            ↓ Colar da área de transferência
          </button>
        </div>
      )}

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

      {/* Nome do deck (opcional) — entre o textarea e os controles */}
      {(phase === "idle" || phase === "error") && (
        <input
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          maxLength={60}
          placeholder="Nome do deck (opcional) — ex: Agumon OTK, Blue Hybrid…"
          className="w-full rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
          aria-label="Nome do deck"
        />
      )}

      {/* Deck parse preview */}
      {parsed !== null && (phase === "idle" || phase === "error") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
            {!hasRecognized ? (
              <span className="text-muted-foreground">Nenhuma carta reconhecida — verifique o formato</span>
            ) : (
              <>
                <Stat label="total" value={totalCards} />
                <Divider />
                <span className={mainStatus === "ok" ? "text-green-400" : mainStatus === "high" ? "text-amber-400" : "text-muted-foreground"}>
                  main deck: <span className="font-semibold tabular-nums">{mainDeckCount}</span>
                  <span className="text-muted-foreground/60">/{main_deck_size}</span>
                </span>
                {hasEggDeck && (
                  <>
                    <Divider />
                    <span className="text-muted-foreground">egg deck: <span className="font-semibold tabular-nums text-foreground">{eggDeckCount}</span></span>
                  </>
                )}
                {mainStatus === "low" && mainDeckCount > 0 && (
                  <><Divider /><span className="text-amber-400/80">faltam {main_deck_size - mainDeckCount}</span></>
                )}
                {mainStatus === "high" && (
                  <><Divider /><span className="text-amber-400/80">{mainDeckCount - main_deck_size} a mais</span></>
                )}
              </>
            )}
          </div>
          {parsed.errors.length > 0 && (
            <ul className="flex flex-col gap-0.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              {parsed.errors.map((err, i) => <li key={i} className="text-xs text-destructive/80">{err}</li>)}
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
                <span className="mt-0.5 shrink-0 text-amber-400/70">→</span>{msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rate limit */}
      {isRateLimited && (
        <div className="rounded-lg border border-orange-500/25 bg-orange-500/5 px-4 py-3">
          <p className="text-xs font-medium text-orange-400/90">{analysis.error}</p>
          {countdownSec > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Liberando em <span className="tabular-nums font-semibold text-orange-300/80">{formatCountdown(countdownSec)}</span>…
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
              <Button size="lg" disabled={!isReady || isRateLimited} className="w-full sm:w-auto" onClick={handleAnalyze}>
                {isRateLimited
                  ? countdownSec > 0 ? `Aguarde ${formatCountdown(countdownSec)}` : "Analisar deck"
                  : phase === "error" ? "Tentar de novo" : "Analisar deck"}
              </Button>
              {phase === "idle" && isReady && (
                <span className="text-xs text-muted-foreground/50 hidden sm:block">ou ⌘↵</span>
              )}
            </div>

            {/* Modo torneio + uso restante */}
            {phase === "idle" && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer select-none items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tournamentMode}
                    onChange={(e) => setTournamentMode(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border/50 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground/60">Modo torneio</span>
                </label>
                {usageCount && !usageCount.isAuthenticated && (
                  <span className="ml-auto text-xs text-muted-foreground/40 tabular-nums">
                    {usageCount.used}/{usageCount.limit} análises usadas
                  </span>
                )}
              </div>
            )}

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
      {(phase === "streaming" || phase === "done") && analysis.enrichmentPct !== null && analysis.enrichmentPct < 100 && (
        <div className={analysis.enrichmentPct < 50
          ? "rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-300/90"
          : "rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
        }>
          <span>
            Análise gerada com{" "}
            <span className="font-semibold tabular-nums">{analysis.enrichmentPct}%</span>{" "}
            de cobertura de cartas.
          </span>
          {analysis.failedCards.length > 0 && (
            <details className="mt-1.5">
              <summary className="cursor-pointer list-none text-muted-foreground/70 hover:text-muted-foreground transition-colors">
                {analysis.failedCards.length} carta{analysis.failedCards.length !== 1 ? "s" : ""} não encontrada{analysis.failedCards.length !== 1 ? "s" : ""} ▾
              </summary>
              <ul className="mt-1 flex flex-wrap gap-1.5 pl-2">
                {analysis.failedCards.map((code) => (
                  <li key={code} className="rounded bg-border/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
                    {code}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Área de análise */}
      {showAnalysisArea && (
        <div ref={analysisAreaRef} className="border-t border-border/30 pt-4">
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
            currentGrade={analysis.currentGrade}
            previousGrade={previousGrade}
          />
        </div>
      )}

      {showFeatured && featuredAnalysis && (
        <FeaturedModal
          analysisText={featuredAnalysis.text}
          playerName={featuredAnalysis.playerName}
          onClose={() => setShowFeatured(false)}
        />
      )}

      <AuthRequiredModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function formatCountdown(sec: number): string {
  if (sec >= 60) { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; }
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
