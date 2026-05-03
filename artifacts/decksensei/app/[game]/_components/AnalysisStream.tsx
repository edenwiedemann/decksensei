"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check } from "lucide-react";
import AnalysisResult from "./AnalysisResult";

interface AnalysisStreamProps {
  text: string;
  phase: "enriching" | "streaming" | "done";
  enrichProgress: { done: number; total: number } | null;
  colorMap: Record<string, string>;
  analysisId: string;
  gameId: string;
  onReset: () => void;
}

export default function AnalysisStream({
  text,
  phase,
  enrichProgress,
  colorMap,
  analysisId,
  gameId,
  onReset,
}: AnalysisStreamProps) {
  const hasText = text.length > 0;
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/${gameId}/a/${analysisId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copie o link:", url);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Fase 1 — carregando cartas */}
      {phase === "enriching" && (
        <div className="flex flex-col gap-3 py-4">
          <div className="flex items-center gap-3">
            <LoadingDots />
            <span className="text-sm text-muted-foreground">
              Carregando cartas do deck...
            </span>
          </div>
          {enrichProgress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                <span className="tabular-nums">
                  {enrichProgress.done} de {enrichProgress.total} cartas
                </span>
                <span className="tabular-nums">
                  {enrichProgress.total > 0
                    ? Math.round((enrichProgress.done / enrichProgress.total) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all duration-300 ease-out"
                  style={{
                    width:
                      enrichProgress.total > 0
                        ? `${(enrichProgress.done / enrichProgress.total) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fase 2 — aguardando primeiro token do Claude */}
      {phase === "streaming" && !hasText && (
        <div className="flex items-center gap-3 py-6">
          <LoadingDots />
          <span className="text-sm text-muted-foreground">
            Analisando estratégia...
          </span>
        </div>
      )}

      {/* Fase 3 — texto streamando / concluído */}
      {hasText && (
        <AnalysisResult
          text={text}
          streaming={phase === "streaming"}
          colorMap={colorMap}
          analysisId={analysisId || undefined}
        />
      )}

      {/* Ações pós-análise */}
      {phase === "done" && hasText && (
        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            Nova análise
          </Button>

          {analysisId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className={
                copied
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                  : ""
              }
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Copiado!
                </>
              ) : (
                <>
                  <Share2 className="mr-1.5 h-3.5 w-3.5" />
                  Compartilhar
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponente interno ────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <span className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-primary/70 animate-bounce"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}
