"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CardSearchResult } from "@/app/admin/meta/_lib/types";

interface Props {
  onAdd: (card: CardSearchResult) => void;
  placeholder?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CardSearch({ onAdd, placeholder = "Nome ou código da carta (ex: Agumon, BT1-010)…" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 320);

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    fetch(`/api/admin/card-search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((d: { results: CardSearchResult[] }) => {
        setResults(d.results);
        setOpen(d.results.length > 0);
      })
      .catch(() => { setResults([]); })
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAdd = useCallback((card: CardSearchResult) => {
    onAdd(card);
    setQuery("");
    setResults([]);
    setOpen(false);
  }, [onAdd]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50 animate-pulse">
            buscando…
          </span>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border/60 bg-[hsl(224,40%,8%)] shadow-xl">
          {results.map((card) => (
            <button
              key={card.code}
              type="button"
              onClick={() => handleAdd(card)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-primary/10"
            >
              {/* Thumbnail */}
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  className="h-10 w-7 shrink-0 rounded object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="h-10 w-7 shrink-0 rounded bg-card/60 flex items-center justify-center text-[10px] text-muted-foreground/40">?</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground leading-snug truncate">{card.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-[10px] text-muted-foreground/60">{card.code}</span>
                  {card.type && <span className="text-[10px] text-muted-foreground/40">{card.type}</span>}
                  {card.color && <span className="text-[10px] text-muted-foreground/40">{card.color}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
