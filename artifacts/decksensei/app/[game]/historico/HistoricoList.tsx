"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { computeDeckGrade } from "@/lib/deck-score";
import type { DeckGrade } from "@/lib/deck-score";

interface Analysis {
  id: string;
  analysisText: string;
  deckName: string | null;
  createdAt: Date | string;
  similarArchetypeId: string | null;
}

interface Props {
  initialItems: Analysis[];
  initialNextCursor: string | null;
  initialGrade: DeckGrade | null;
  game: string;
  gradeCounts: Record<DeckGrade, number>;
}

function excerpt(md: string, maxLen = 80): string {
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

const GRADE_COLORS: Record<DeckGrade, string> = {
  A: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  B: "text-sky-400 bg-sky-400/10 border-sky-400/30",
  C: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  D: "text-rose-400 bg-rose-400/10 border-rose-400/30",
};

const GRADES: DeckGrade[] = ["A", "B", "C", "D"];

const CHIP_BASE =
  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors";
const CHIP_ACTIVE = "border-primary/60 bg-primary/15 text-primary";
const CHIP_INACTIVE =
  "border-border/40 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground";

export default function HistoricoList({
  initialItems,
  initialNextCursor,
  initialGrade,
  game,
  gradeCounts,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<Analysis[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [activeGrade, setActiveGrade] = useState<DeckGrade | null>(initialGrade);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, startLoadMore] = useTransition();
  const [switching, startSwitch] = useTransition();

  const fetchPage = useCallback(
    async (grade: DeckGrade | null, cursor: string | null) => {
      const params = new URLSearchParams({ game });
      if (grade) params.set("grade", grade);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/analyses/history?${params}`);
      if (!res.ok) throw new Error("Falha ao carregar histórico.");
      return res.json() as Promise<{ items: Analysis[]; nextCursor: string | null }>;
    },
    [game],
  );

  function handleGradeChange(grade: DeckGrade | null) {
    setError(null);
    startSwitch(async () => {
      try {
        const data = await fetchPage(grade, null);
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setActiveGrade(grade);
        setQuery("");

        const next = new URLSearchParams(searchParams.toString());
        if (grade) {
          next.set("grade", grade);
        } else {
          next.delete("grade");
        }
        router.replace(`?${next.toString()}`, { scroll: false });
      } catch {
        setError("Não foi possível filtrar. Tente novamente.");
      }
    });
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setError(null);
    startLoadMore(async () => {
      try {
        const data = await fetchPage(activeGrade, nextCursor);
        setItems((prev) => [...prev, ...data.items]);
        setNextCursor(data.nextCursor);
      } catch {
        setError("Não foi possível carregar mais análises. Tente novamente.");
      }
    });
  }

  const filtered = query.trim()
    ? items.filter((a) => {
        const q = query.toLowerCase();
        return (
          (a.deckName ?? "").toLowerCase().includes(q) ||
          (a.similarArchetypeId ?? "").toLowerCase().includes(q)
        );
      })
    : items;

  const isSearching = query.trim().length > 0;
  const hasMorePages = nextCursor !== null;

  const totalWithGrade = GRADES.reduce((s, g) => s + gradeCounts[g], 0);

  return (
    <>
      {/* Resumo de notas */}
      {totalWithGrade > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {GRADES.filter((g) => gradeCounts[g] > 0).map((g, i) => (
            <span key={g} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-muted-foreground/30 select-none">·</span>
              )}
              <button
                onClick={() => handleGradeChange(g)}
                disabled={switching}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:opacity-80 ${
                  activeGrade === g ? CHIP_ACTIVE : GRADE_COLORS[g]
                }`}
              >
                <span className="tabular-nums">{gradeCounts[g]}</span>
                <span>{g}</span>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Mensagem de erro inline */}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Barra de busca */}
      <div className="mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar pelo nome do deck..."
          className="w-full rounded-lg border border-border/50 bg-card/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
        />
        {/* Aviso quando a busca é sobre um subconjunto das análises */}
        {isSearching && hasMorePages && (
          <p className="mt-1.5 text-xs text-muted-foreground/60">
            Buscando em {items.length} análises carregadas — carregue mais para busca completa.
          </p>
        )}
      </div>

      {/* Chips de filtro por grade */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => handleGradeChange(null)}
          disabled={switching}
          className={`${CHIP_BASE} ${activeGrade === null ? CHIP_ACTIVE : CHIP_INACTIVE}`}
        >
          Todas
        </button>
        {GRADES.map((g) => (
          <button
            key={g}
            onClick={() => handleGradeChange(g)}
            disabled={switching}
            className={`${CHIP_BASE} ${activeGrade === g ? CHIP_ACTIVE : CHIP_INACTIVE}`}
          >
            Nota {g}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {switching ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm text-muted-foreground animate-pulse">
            Carregando…
          </span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {isSearching || activeGrade
              ? "Nenhuma análise encontrada para esse filtro."
              : "Você ainda não fez nenhuma análise com essa conta."}
          </p>
          {!isSearching && !activeGrade && (
            <a
              href={`/${game}`}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Analisar deck
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {filtered.map((a) => {
              const date = new Date(a.createdAt).toLocaleDateString("pt-BR", {
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
                        {excerpt(a.analysisText)}…
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

          {/* Botão "Carregar mais" — visível mesmo durante busca */}
          {hasMorePages && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-lg border border-border/50 bg-card/60 px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
              >
                {loadingMore ? "Carregando…" : "Carregar mais"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
