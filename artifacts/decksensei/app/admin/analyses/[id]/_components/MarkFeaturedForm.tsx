"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Star, Check, Loader2 } from "lucide-react";

interface MarkFeaturedFormProps {
  gameId: string;
  analysisId: string;
  currentFeaturedPlayerName: string;
  isFeatured: boolean;
}

export default function MarkFeaturedForm({
  gameId,
  analysisId,
  currentFeaturedPlayerName,
  isFeatured,
}: MarkFeaturedFormProps) {
  const [featuredPlayerName, setFeaturedPlayerName] = useState(currentFeaturedPlayerName);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/featured/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, analysisId, featuredPlayerName: featuredPlayerName.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Erro ${res.status}`);
      }

      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 min-w-[260px]">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="featuredPlayerName">
          Nome do jogador (aparece na nota de exemplo)
        </label>
        <input
          id="featuredPlayerName"
          type="text"
          maxLength={100}
          required
          value={featuredPlayerName}
          onChange={(e) => setFeaturedPlayerName(e.target.value)}
          placeholder="Nome do jogador (ex: João Silva)"
          className="h-8 rounded-md border border-border/40 bg-muted/20 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <Button
        type="submit"
        size="sm"
        disabled={status === "loading"}
        className={
          status === "done"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
            : isFeatured
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15"
              : ""
        }
        variant={isFeatured ? "outline" : "default"}
      >
        {status === "loading" ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Salvando...
          </>
        ) : status === "done" ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Marcado como exemplo!
          </>
        ) : (
          <>
            <Star className="mr-1.5 h-3.5 w-3.5" />
            {isFeatured ? "Atualizar exemplo" : "Marcar como exemplo na home"}
          </>
        )}
      </Button>

      {status === "error" && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}
    </form>
  );
}
