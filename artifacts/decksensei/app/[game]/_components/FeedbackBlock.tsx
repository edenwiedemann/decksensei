"use client";

import { useState, useRef } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface Props {
  analysisId: string;
}

type Phase = "idle" | "loading" | "done" | "error";

export default function FeedbackBlock({ analysisId }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const commentRef = useRef<HTMLTextAreaElement>(null);

  async function submit(rating: "up" | "down") {
    if (phase === "loading" || phase === "done") return;
    const comment = commentRef.current?.value.trim() ?? "";

    setPhase("loading");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          rating,
          comment: comment || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message_pt?: string } | null;
        throw new Error(body?.message_pt ?? `Erro ${res.status}`);
      }

      setPhase("done");
    } catch {
      setPhase("idle");
    }
  }

  if (phase === "done") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <span className="text-emerald-400">✓</span>
        <p className="text-sm text-emerald-400/90">Obrigado pelo feedback!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card/40 px-5 py-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">Essa análise foi útil?</p>

        <button
          type="button"
          onClick={() => submit("up")}
          disabled={phase === "loading"}
          aria-label="Útil"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-muted/20 text-muted-foreground/60 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 disabled:pointer-events-none disabled:opacity-40"
        >
          <ThumbsUp className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => submit("down")}
          disabled={phase === "loading"}
          aria-label="Não útil"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-muted/20 text-muted-foreground/60 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400 disabled:pointer-events-none disabled:opacity-40"
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
      </div>

      <textarea
        ref={commentRef}
        maxLength={500}
        placeholder="deixe um comentário (opcional)"
        className="h-16 w-full resize-none rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-xs text-foreground/80 placeholder:text-muted-foreground/40 focus:border-border/70 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:pointer-events-none disabled:opacity-40"
        disabled={phase === "loading"}
      />
    </div>
  );
}
