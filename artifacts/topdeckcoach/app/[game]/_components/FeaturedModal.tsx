"use client";

import { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import AnalysisResult from "./AnalysisResult";

interface FeaturedModalProps {
  analysisText: string;
  playerName: string;
  onClose: () => void;
}

export default function FeaturedModal({ analysisText, playerName, onClose }: FeaturedModalProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Painel deslizante */}
      <div
        className="relative mx-auto mt-12 flex h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border/40 bg-[hsl(224,40%,6%)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixo */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/30 px-6 py-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-0.5">
              Exemplo de análise
            </p>
            <p className="text-sm text-foreground leading-snug">
              Análise do deck atual de{" "}
              <span className="font-semibold text-primary">{playerName}</span>
              {" "}— exemplo do que você vai receber.
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnalysisResult
            text={analysisText}
            streaming={false}
            colorMap={{}}
          />
        </div>
      </div>
    </div>
  );
}
