"use client";

import { useState } from "react";
import { computeDeckGrade } from "@/lib/deck-score";

interface Analysis {
  id: string;
  analysisText: string;
  deckName: string | null;
  createdAt: Date;
  similarArchetypeId: string | null;
}

interface Props {
  analyses: Analysis[];
  game: string;
}

function excerpt(md: string, maxLen = 120): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/##?\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, maxLen);
}

const GRADE_COLORS = {
  A: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  B: "text-sky-400 bg-sky-400/10 border-sky-400/30",
  C: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  D: "text-rose-400 bg-rose-400/10 border-rose-400/30",
} as const;

export default function HistoricoList({ analyses, game }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? analyses.filter((a) => {
        const q = query.toLowerCase();
        return (
          (a.deckName ?? "").toLowerCase().includes(q) ||
          (a.similarArchetypeId ?? "").toLowerCase().includes(q)
        );
      })
    : analyses;

  return (
    <>
      <div className="mb-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar pelo nome do deck..."
          className="w-full rounded-lg border border-border/50 bg-card/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? "Nenhuma análise encontrada para essa busca."
              : "Você ainda não fez nenhuma análise com essa conta."}
          </p>
          {!query.trim() && (
            <a
              href={`/${game}`}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Analisar deck
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((a) => {
            const date = a.createdAt.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            const grade = computeDeckGrade(a.analysisText)?.grade ?? null;
            return (
              <a
                key={a.id}
                href={`/${game}/a/${a.id}`}
                className="group block rounded-xl border border-border/40 bg-card/60 px-5 py-4 transition-colors hover:border-primary/30 hover:bg-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {a.similarArchetypeId && (
                      <span className="mb-1.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/80 ring-1 ring-inset ring-primary/20">
                        {a.similarArchetypeId}
                      </span>
                    )}
                    <p className="text-sm font-medium leading-snug text-foreground">
                      {a.deckName ?? "Deck sem nome"}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground/70 line-clamp-1">
                      {excerpt(a.analysisText, 80)}…
                    </p>
                  </div>
                  <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                    <span className="text-xs text-muted-foreground/60">
                      {date}
                    </span>
                    {grade && (
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded border text-sm font-black tabular-nums ${GRADE_COLORS[grade]}`}
                      >
                        {grade}
                      </span>
                    )}
                    <div className="text-xs text-primary/60 opacity-0 transition-opacity group-hover:opacity-100">
                      Ver →
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
