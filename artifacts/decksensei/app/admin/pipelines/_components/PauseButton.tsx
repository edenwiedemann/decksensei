"use client";

import { useState } from "react";

interface Props {
  sourceId: string;
  isPaused: boolean;
}

export default function PauseButton({ sourceId, isPaused: initialPaused }: Props) {
  const [isPaused, setIsPaused] = useState(initialPaused);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    const action = isPaused ? "ativar" : "pausar";
    if (!confirm(`Deseja ${action} a pipeline "${sourceId}"?`)) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/pipelines/${encodeURIComponent(sourceId)}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !isPaused }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setIsPaused(!isPaused);
    } catch (err) {
      setError((err as Error).message.slice(0, 80));
      setTimeout(() => setError(""), 4000);
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return <span className="text-xs text-destructive/80">{error}</span>;
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        isPaused
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-amber-500/40 hover:text-amber-400"
      }`}
    >
      {loading ? "…" : isPaused ? "⏵ Ativar" : "⏸ Pausar"}
    </button>
  );
}
