"use client";

import { useState } from "react";

interface Props {
  snapshotId: number;
}

type Phase = "idle" | "loading" | "done" | "error";

export default function NotifyUsersButton({ snapshotId }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<{ sent: number; total: number } | null>(null);
  const [error, setError] = useState("");

  async function handleNotify() {
    if (!confirm("Enviar email de reengajamento para todos os usuários que analisaram nos últimos 30 dias?")) return;
    setPhase("loading");
    try {
      const res = await fetch(`/api/admin/meta/snapshots/${snapshotId}/notify`, {
        method: "POST",
      });
      const data = await res.json() as { ok?: boolean; sent?: number; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setResult({ sent: data.sent ?? 0, total: data.total ?? 0 });
      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
      setTimeout(() => setPhase("idle"), 4000);
    }
  }

  if (phase === "done" && result) {
    return (
      <span className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
        ✓ {result.sent} email{result.sent !== 1 ? "s" : ""} enviado{result.sent !== 1 ? "s" : ""} de {result.total}
      </span>
    );
  }

  if (phase === "error") {
    return (
      <span className="inline-flex items-center rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive/80">
        {error}
      </span>
    );
  }

  return (
    <button
      onClick={handleNotify}
      disabled={phase === "loading"}
      className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
    >
      {phase === "loading" ? "Enviando..." : "📧 Notificar usuários"}
    </button>
  );
}
