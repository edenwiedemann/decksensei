"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check, Mail } from "lucide-react";
import AnalysisResult from "./AnalysisResult";
import AnalysisErrorBoundary from "./AnalysisErrorBoundary";

interface AnalysisStreamProps {
  text: string;
  phase: "enriching" | "streaming" | "done";
  enrichProgress: { done: number; total: number } | null;
  colorMap: Record<string, string>;
  analysisId: string;
  gameId: string;
  onReset: () => void;
  /** Segundos de geração do streaming. Exibido discretamente após concluir. */
  elapsedSec?: number | null;
  /** Dias desde o último snapshot de meta ativo. Exibe aviso se > 14. */
  metaSnapshotAgeDays?: number;
}

export default function AnalysisStream({
  text,
  phase,
  enrichProgress,
  colorMap,
  analysisId,
  gameId,
  onReset,
  elapsedSec,
  metaSnapshotAgeDays,
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

  function handleEditAndReanalyze() {
    onReset();
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>("textarea");
      if (ta) {
        ta.focus();
        ta.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
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
                    : 0}%
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all duration-300 ease-out"
                  style={{
                    width: enrichProgress.total > 0
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
            Analisando estratégia…{" "}
            <span className="text-xs text-muted-foreground/50">(20–30s)</span>
          </span>
        </div>
      )}

      {/* Fase 3 — texto streamando / concluído */}
      {hasText && (
        <AnalysisErrorBoundary fallbackText={text}>
          <AnalysisResult
            text={text}
            streaming={phase === "streaming"}
            colorMap={colorMap}
            analysisId={analysisId || undefined}
          />
        </AnalysisErrorBoundary>
      )}

      {/* Badge de meta desatualizado */}
      {phase === "done" && hasText && !!metaSnapshotAgeDays && metaSnapshotAgeDays > 14 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400/80">
          <span className="shrink-0">⚠</span>
          <span>
            Meta de <span className="font-semibold">{metaSnapshotAgeDays} dias</span> atrás
            — a análise pode não refletir mudanças recentes no formato.
          </span>
        </div>
      )}

      {/* Ações pós-análise */}
      {phase === "done" && hasText && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            Nova análise
          </Button>

          <Button variant="ghost" size="sm" onClick={handleEditAndReanalyze}>
            Editar e reanalisar
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

          {analysisId && <EmailForm analysisId={analysisId} />}

          {!!elapsedSec && elapsedSec > 0 && (
            <span className="ml-auto text-xs tabular-nums text-muted-foreground/35">
              {elapsedSec}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── EmailForm ────────────────────────────────────────────────────────────────

type EmailPhase = "idle" | "input" | "sending" | "sent" | "error";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function EmailForm({ analysisId }: { analysisId: string }) {
  const [phase, setPhase] = useState<EmailPhase>("idle");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPhase("sending");
    try {
      const res = await fetch(`/api/analysis/${analysisId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Erro ao enviar. Tenta de novo.");
        setPhase("error");
        setTimeout(() => setPhase("input"), 3500);
        return;
      }
      setPhase("sent");
      setTimeout(() => { setPhase("idle"); setEmail(""); }, 4000);
    } catch {
      setErrorMsg("Sem conexão. Tenta de novo.");
      setPhase("error");
      setTimeout(() => setPhase("input"), 3500);
    }
  }

  if (phase === "sent") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        Enviado!
      </span>
    );
  }

  if (phase === "error") {
    return <span className="text-xs text-destructive/80">{errorMsg}</span>;
  }

  if (phase === "idle") {
    return (
      <Button variant="outline" size="sm" onClick={() => setPhase("input")}>
        <Mail className="mr-1.5 h-3.5 w-3.5" />
        Enviar por email
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="seu@email.com"
        disabled={phase === "sending"}
        autoFocus
        className="h-8 rounded-md border border-border/50 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
      />
      <Button size="sm" type="submit" disabled={phase === "sending" || !EMAIL_RE.test(email)}>
        {phase === "sending" ? "Enviando..." : "Enviar"}
      </Button>
      <button
        type="button"
        onClick={() => setPhase("idle")}
        disabled={phase === "sending"}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        Cancelar
      </button>
    </form>
  );
}

// ─── LoadingDots ──────────────────────────────────────────────────────────────

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
