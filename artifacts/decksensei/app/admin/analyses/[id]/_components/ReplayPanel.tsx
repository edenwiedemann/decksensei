"use client";

import { useState, useRef } from "react";
import MarkdownViewer from "../../_components/MarkdownViewer";

interface Props {
  gameId: string;
  deckParsed: Record<string, unknown>;
}

type Phase = "idle" | "streaming" | "done" | "error";

export default function ReplayPanel({ gameId, deckParsed }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function handleReplay() {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setPhase("streaming");
    setText("");
    setError("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({ gameId, deck: deckParsed, enrichedCards: [] }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message_pt?: string } | null;
        throw new Error(body?.message_pt ?? `Erro ${res.status}`);
      }

      if (!res.body) throw new Error("Sem stream.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abort.signal.aborted) { await reader.cancel(); return; }
        full += decoder.decode(value, { stream: true });
        setText(full);
      }

      setPhase("done");
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError((err as Error).message ?? "Erro inesperado.");
      setPhase("error");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setPhase("idle");
    setText("");
  }

  if (phase === "idle") {
    return (
      <button
        onClick={handleReplay}
        className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
      >
        ↺ Replay com prompt atual
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border/50 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/30 px-5 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Nova análise{phase === "streaming" && (
            <span className="ml-2 inline-flex items-center gap-1 text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              gerando…
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {phase === "streaming" && (
            <button onClick={handleCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          )}
          {(phase === "done" || phase === "error") && (
            <button onClick={handleReplay} className="text-xs text-primary hover:underline underline-offset-2">
              Repetir
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        {phase === "error" ? (
          <p className="text-xs text-destructive/80">{error}</p>
        ) : text ? (
          <MarkdownViewer content={text} />
        ) : (
          <p className="text-xs text-muted-foreground">Aguardando resposta…</p>
        )}
      </div>
    </div>
  );
}
