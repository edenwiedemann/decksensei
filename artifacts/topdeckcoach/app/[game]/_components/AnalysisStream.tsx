"use client";

import { Button } from "@/components/ui/button";
import AnalysisResult from "./AnalysisResult";

interface AnalysisStreamProps {
  text: string;
  streaming: boolean;
  colorMap: Record<string, string>;
  onReset: () => void;
}

export default function AnalysisStream({
  text,
  streaming,
  colorMap,
  onReset,
}: AnalysisStreamProps) {
  const hasText = text.length > 0;

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
        <AnalysisResult text={text} streaming={streaming} colorMap={colorMap} />
      )}

      {/* Botão Nova análise — aparece quando o stream termina */}
      {!streaming && hasText && (
        <div className="pt-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            Nova análise
          </Button>
        </div>
      )}
    </div>
  );
}
