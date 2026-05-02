"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check } from "lucide-react";
import AnalysisResult from "./AnalysisResult";

interface AnalysisStreamProps {
  text: string;
  streaming: boolean;
  colorMap: Record<string, string>;
  analysisId: string;
  gameId: string;
  onReset: () => void;
}

export default function AnalysisStream({
  text,
  streaming,
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
      // Fallback para browsers sem permissão de clipboard
      window.prompt("Copie o link:", url);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Indicador "Analisando..." — pulsa até chegar o primeiro token */}
      {streaming && !hasText && (
        <div className="flex items-center gap-3 py-6">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-primary/70 animate-bounce"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
          <span className="text-sm text-muted-foreground">
            Analisando seu deck...
          </span>
        </div>
      )}

      {/* Cards de seção — aparecem progressivamente durante o stream */}
      {hasText && (
        <AnalysisResult
          text={text}
          streaming={streaming}
          colorMap={colorMap}
          analysisId={analysisId || undefined}
        />
      )}

      {/* Ações pós-análise */}
      {!streaming && hasText && (
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
