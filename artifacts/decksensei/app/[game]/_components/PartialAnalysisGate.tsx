"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import AnalysisResult from "./AnalysisResult";

interface PartialAnalysisGateProps {
  text: string;
  colorMap: Record<string, string>;
  onOpenAuth: () => void;
}

const LOCKED_SECTIONS = [
  "Plano de jogo",
  "Pontos fortes",
  "Vulnerabilidades",
  "Nota do deck (A/B/C/D)",
  "Comparação com o meta",
  "Sugestões de troca",
];

export default function PartialAnalysisGate({
  text,
  colorMap,
  onOpenAuth,
}: PartialAnalysisGateProps) {
  return (
    <div className="flex flex-col gap-0">
      {/* Preview parcial com fade gradiente */}
      <div className="relative">
        <AnalysisResult text={text} streaming={false} colorMap={colorMap} />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[hsl(240,30%,5%)] to-transparent" />
      </div>

      {/* Card de conversão */}
      <div className="mt-2 rounded-xl border border-primary/25 bg-card/80 px-6 py-6 shadow-lg shadow-primary/5">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            Veja a análise completa — é grátis
          </h3>
          <p className="text-xs text-muted-foreground/70">
            Crie sua conta em 30 segundos para desbloquear:
          </p>

          <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {LOCKED_SECTIONS.map((s) => (
              <li key={s} className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <span className="h-1 w-1 rounded-full bg-primary/40" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="w-full sm:w-auto min-w-[200px]"
            onClick={onOpenAuth}
          >
            Criar conta grátis →
          </Button>
          <p className="text-[11px] text-muted-foreground/50">
            Sem senha. Sem spam. Só você e seus decks.
          </p>
        </div>
      </div>
    </div>
  );
}
