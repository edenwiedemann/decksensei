"use client";

import { useState } from "react";

interface Props {
  sourceId: string;
}

type Phase = "idle" | "loading" | "done" | "error";

interface RunResult {
  status: string;
  details?: { itemsImported?: number; archetypesUpdated?: string[]; warnings?: string[] } | string;
}

export default function RunNowButton({ sourceId }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");

  async function handleRun() {
    if (!confirm(`Executar pipeline "${sourceId}" agora?`)) return;
    setPhase("loading");
    setResult(null);
    setError("");

    try {
      const res = await fetch(`/api/admin/pipelines/${encodeURIComponent(sourceId)}/run`, {
        method: "POST",
      });
      const data = await res.json() as RunResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setResult(data);
      setPhase("done");
      setTimeout(() => setPhase("idle"), 8000);
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
      setTimeout(() => setPhase("idle"), 5000);
    }
  }

  if (phase === "done" && result) {
    const det = typeof result.details === "object" && result.details !== null ? result.details : null;
    const items = det?.itemsImported ?? "?";
    return (
      <span className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
        ✓ {result.status} · {items} item{items !== 1 ? "s" : ""}
      </span>
    );
  }

  if (phase === "error") {
    return (
      <span className="inline-flex items-center rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive/80">
        {error.slice(0, 60)}
      </span>
    );
  }

  return (
    <button
      onClick={handleRun}
      disabled={phase === "loading"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
    >
      {phase === "loading" ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border border-primary/40 border-t-primary" />
          Rodando…
        </>
      ) : (
        "▶ Rodar agora"
      )}
    </button>
  );
}
