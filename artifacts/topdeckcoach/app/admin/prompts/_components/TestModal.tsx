"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Analysis {
  id: string;
  deck_preview: string;
  archetype_label: string | null;
  created_at: string;
  analysis_text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gameId: string;
  systemContent: string;
}

type Phase = "idle" | "loading" | "selecting" | "testing" | "done" | "error";

export default function TestModal({ open, onOpenChange, gameId, systemContent }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [originalText, setOriginalText] = useState<string>("");
  const [newText, setNewText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setSelectedId("");
    setNewText("");
    setOriginalText("");
    try {
      const res = await fetch(`/api/admin/analyses/recent?gameId=${encodeURIComponent(gameId)}&limit=10`);
      if (!res.ok) throw new Error("Erro ao carregar análises.");
      const data = (await res.json()) as { analyses: Analysis[] };
      setAnalyses(data.analyses);
      setPhase(data.analyses.length > 0 ? "selecting" : "error");
      if (data.analyses.length === 0) setErrorMsg("Nenhuma análise encontrada para este jogo.");
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Erro desconhecido.");
    }
  }, [gameId]);

  useEffect(() => {
    if (open) load();
    else {
      abortRef.current?.abort();
      setPhase("idle");
    }
  }, [open, load]);

  const runTest = useCallback(async () => {
    if (!selectedId) return;
    const analysis = analyses.find((a) => a.id === selectedId);
    if (!analysis) return;

    setOriginalText(analysis.analysis_text);
    setNewText("");
    setPhase("testing");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/admin/prompts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, systemContent, analysisId: selectedId }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase("error");
        setErrorMsg(d.error ?? `HTTP ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setPhase("error"); setErrorMsg("Sem stream."); return; }

      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setNewText(acc);
      }
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Erro desconhecido.");
    }
  }, [selectedId, analyses, gameId, systemContent]);

  const isTesting = phase === "testing";
  const showSideBySide = phase === "testing" || phase === "done";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        aria-describedby="test-modal-desc"
      >
        <DialogHeader className="shrink-0 border-b border-border/40 px-6 py-4">
          <DialogTitle className="text-base font-semibold">
            Testar rascunho com deck salvo
          </DialogTitle>
          <DialogDescription id="test-modal-desc" className="text-xs text-muted-foreground">
            Escolha uma análise existente. O sistema vai rodar seu rascunho de prompt com aquele deck e mostrar o resultado lado a lado com a análise original.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* Loading */}
          {phase === "loading" && (
            <p className="text-sm text-muted-foreground animate-pulse">Carregando análises recentes…</p>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Selecting */}
          {phase === "selecting" && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                Selecione uma análise para usar como base:
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {analyses.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                      selectedId === a.id
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/40 bg-card/40 text-muted-foreground hover:border-border/70 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground/60 shrink-0">{a.id}</span>
                      {a.archetype_label && (
                        <span className="text-xs font-medium text-primary/80 shrink-0">
                          {a.archetype_label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-snug">{a.deck_preview}…</p>
                    <p className="mt-1 text-xs text-muted-foreground/50">
                      {new Date(a.created_at).toLocaleString("pt-BR")}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Side-by-side */}
          {showSideBySide && (
            <div className="grid grid-cols-2 gap-4">
              {/* Original */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                  Análise original
                </p>
                <div className="rounded-lg border border-border/40 bg-card/30 p-4 text-sm overflow-y-auto max-h-[50vh]">
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {originalText || "*Carregando…*"}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* New */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    Resultado com rascunho
                  </p>
                  {isTesting && (
                    <span className="text-xs text-amber-400 animate-pulse">
                      gerando…
                    </span>
                  )}
                  {phase === "done" && (
                    <span className="text-xs text-emerald-400">✓ concluído</span>
                  )}
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm overflow-y-auto max-h-[50vh]">
                  <div className="prose prose-sm prose-invert max-w-none">
                    {newText ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {newText}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground/50 italic">Aguardando…</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border/40 px-6 py-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {phase === "selecting" && (
            <Button
              size="sm"
              disabled={!selectedId}
              onClick={runTest}
              className="bg-primary text-primary-foreground"
            >
              ▶ Rodar teste
            </Button>
          )}
          {phase === "done" && (
            <Button variant="outline" size="sm" onClick={load}>
              ↺ Testar outra análise
            </Button>
          )}
          {phase === "error" && (
            <Button variant="outline" size="sm" onClick={load}>
              Tentar novamente
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
