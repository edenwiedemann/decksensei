"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  analysisId: string;
  initialName: string | null;
  fallbackTitle: string;
}

export default function DeckNameEditor({ analysisId, initialName, fallbackTitle }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(name);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, name]);

  const displayTitle = name
    ? `${name} — Análise`
    : fallbackTitle;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() || null }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Erro ao salvar.");
      }
      setName(draft.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={60}
            placeholder="Nome do deck (ex: Agumon OTK)"
            className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xl font-bold tracking-tight text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            onClick={() => { setEditing(false); setError(null); }}
            className="inline-flex h-8 items-center rounded-md border border-border/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
          >
            Cancelar
          </button>
        </div>
        <div className="flex items-center justify-between">
          {error ? (
            <p className="text-xs text-rose-400">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Enter para salvar · Esc para cancelar</p>
          )}
          <span className="text-xs text-muted-foreground">{draft.length}/60</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {displayTitle}
      </h1>
      <button
        onClick={() => setEditing(true)}
        aria-label="Editar nome do deck"
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
  );
}
