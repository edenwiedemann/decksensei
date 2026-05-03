"use client";

import { useState } from "react";
import { Lock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [email, setEmail] = useState("");
  const [formPhase, setFormPhase] = useState<"idle" | "loading" | "sent">("idle");
  const [fieldError, setFieldError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError("");

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError("Coloca um e-mail válido.");
      return;
    }

    setFormPhase("loading");

    try {
      await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // segue para "sent" mesmo em erro de rede — anti-enumeration
    }

    setFormPhase("sent");
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Preview parcial */}
      <div className="relative">
        <AnalysisResult text={text} streaming={false} colorMap={colorMap} />

        {/* Gradiente que "some" o texto */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[hsl(240,30%,5%)] to-transparent" />
      </div>

      {/* Card de conversão */}
      <div className="mt-2 rounded-xl border border-primary/25 bg-card/80 px-6 py-6 shadow-lg shadow-primary/5">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            Veja a análise completa — é grátis
          </h3>
          <p className="text-xs text-muted-foreground/70">
            Crie sua conta em 30 segundos para desbloquear:
          </p>

          {/* Seções bloqueadas */}
          <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {LOCKED_SECTIONS.map((s) => (
              <li key={s} className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <span className="h-1 w-1 rounded-full bg-primary/40" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        {formPhase === "sent" ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-4 py-4 text-center">
            <span className="text-2xl">✉</span>
            <p className="text-sm font-medium text-foreground">Confere o seu e-mail</p>
            <p className="text-xs text-muted-foreground">
              Mandei o link pro{" "}
              <span className="font-medium text-foreground">{email}</span> —
              clica nele pra ver a análise completa.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <div className="flex gap-2">
              <Input
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={formPhase === "loading"}
                className="flex-1"
                required
              />
              <Button
                type="submit"
                disabled={formPhase === "loading"}
                className="shrink-0 gap-1.5"
              >
                {formPhase === "loading" ? (
                  "Enviando..."
                ) : (
                  <>
                    Criar conta
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
            <p className="text-center text-[11px] text-muted-foreground/50">
              Sem senha. Sem spam. Só você e seus decks.
            </p>
          </form>
        )}

        {/* Opção alternativa: abrir modal completo */}
        {formPhase !== "sent" && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-xs text-muted-foreground/40 underline underline-offset-4 transition-colors hover:text-muted-foreground/70"
            >
              Quero informar cidade e estado também
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
