"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MetaArchetype } from "@/lib/analysis-prompt";

// Display sort order — does NOT affect DB indices
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "bg-amber-500/20",  text: "text-amber-400",  border: "border-amber-500/40" },
  A: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/40" },
  B: { bg: "bg-blue-500/20",   text: "text-blue-400",   border: "border-blue-500/40" },
  C: { bg: "bg-zinc-500/20",   text: "text-zinc-400",   border: "border-zinc-500/40" },
};

const COLOR_DOTS: Record<string, string> = {
  red:    "bg-red-500",
  blue:   "bg-blue-500",
  yellow: "bg-yellow-400",
  green:  "bg-green-500",
  black:  "bg-zinc-800 border border-zinc-600",
  purple: "bg-purple-500",
  white:  "bg-white",
};

interface Props {
  snapshotId: number;
  archetypes: MetaArchetype[]; // original DB order — must NOT be pre-sorted
}

export default function ArchetypeCardsList({ snapshotId, archetypes: initial }: Props) {
  const router = useRouter();
  const [archetypes, setArchetypes]     = useState(initial);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [addingNew, setAddingNew]       = useState(false);

  // Sorted copy for display only — original array keeps DB indices
  const displayed = [...archetypes].sort(
    (a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9),
  );

  const handleDelete = async (arch: MetaArchetype) => {
    if (!confirm(`Excluir arquetipo "${arch.name_pt || arch.name}"? Esta ação não pode ser desfeita.`)) return;

    // Index in original (unsorted) array = correct DB index
    const realIdx = initial.findIndex((a) => a.id === arch.id);
    if (realIdx === -1) return;

    setDeletingId(arch.id);
    try {
      const res = await fetch(`/api/admin/meta/snapshots/${snapshotId}/archetypes/${realIdx}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setArchetypes((prev) => prev.filter((a) => a.id !== arch.id));
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (arch: MetaArchetype) => {
    const realIdx = initial.findIndex((a) => a.id === arch.id);
    if (realIdx === -1) return;

    setDuplicatingId(arch.id);
    try {
      const res = await fetch(
        `/api/admin/meta/snapshots/${snapshotId}/archetypes/${realIdx}/duplicate`,
        { method: "POST" },
      );
      const data = (await res.json()) as { ok?: boolean; archIdx?: number };
      if (res.ok && data.ok && data.archIdx !== undefined) {
        router.push(`/admin/meta/${snapshotId}/archetype/${data.archIdx}/edit`);
      }
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleAddNew = async () => {
    setAddingNew(true);
    try {
      const res = await fetch(`/api/admin/meta/snapshots/${snapshotId}/archetypes`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; archIdx?: number };
      if (res.ok && data.ok && data.archIdx !== undefined) {
        router.push(`/admin/meta/${snapshotId}/archetype/${data.archIdx}/edit`);
      }
    } finally {
      setAddingNew(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          {archetypes.length} {archetypes.length === 1 ? "arquetipo" : "arquetipos"}
        </p>
        <button
          onClick={handleAddNew}
          disabled={addingNew}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-all hover:border-primary/70 hover:bg-primary/20 disabled:opacity-50"
        >
          {addingNew ? "Criando…" : "+ Adicionar arquetipo"}
        </button>
      </div>

      {archetypes.length === 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 px-8 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum arquetipo ainda.{" "}
            <button onClick={handleAddNew} className="text-primary hover:underline">
              Adicionar primeiro →
            </button>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayed.map((arch) => {
          const tierStyle = TIER_COLORS[arch.tier] ?? TIER_COLORS.C;
          // realIdx = index in original unsorted array = correct DB position
          const realIdx = initial.findIndex((a) => a.id === arch.id);

          return (
            <div
              key={arch.id}
              className="group relative flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-5 transition-all hover:border-border/80 hover:bg-card/70"
            >
              {/* Tier badge + colors */}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}
                >
                  {arch.tier}
                </span>
                <div className="flex items-center gap-1">
                  {(arch.colors ?? []).map((c) => (
                    <div
                      key={c}
                      title={c}
                      className={`h-3.5 w-3.5 rounded-full ${COLOR_DOTS[c] ?? "bg-zinc-500"}`}
                    />
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <p className="text-sm font-semibold text-foreground leading-snug">
                  {arch.name_pt || arch.name}
                </p>
                {arch.name_pt && arch.name !== arch.name_pt && (
                  <p className="mt-0.5 text-xs text-muted-foreground/50">{arch.name}</p>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex flex-col items-center">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {arch.win_rate_pct}%
                  </span>
                  <span className="text-muted-foreground/50">WR</span>
                </div>
                <div className="h-8 w-px bg-border/40" />
                <div className="flex flex-col items-center">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {arch.meta_share_pct}%
                  </span>
                  <span className="text-muted-foreground/50">Share</span>
                </div>
                {arch.record && (
                  <>
                    <div className="h-8 w-px bg-border/40" />
                    <span className="font-mono text-xs text-muted-foreground/60">{arch.record}</span>
                  </>
                )}
              </div>

              {/* Play style */}
              {arch.play_style_pt && (
                <p className="text-xs text-muted-foreground/60 line-clamp-1">{arch.play_style_pt}</p>
              )}

              {/* Actions */}
              <div className="mt-auto flex items-center gap-2 pt-1">
                <Link
                  href={`/admin/meta/${snapshotId}/archetype/${realIdx}/edit`}
                  className="flex-1 rounded-md border border-border/40 py-1.5 text-center text-xs text-muted-foreground transition-all hover:border-border/70 hover:text-foreground"
                >
                  Editar
                </Link>
                <button
                  onClick={() => handleDuplicate(arch)}
                  disabled={duplicatingId === arch.id}
                  title="Duplicar arquetipo"
                  className="rounded-md border border-border/40 px-2.5 py-1.5 text-xs text-muted-foreground/60 transition-all hover:border-border/70 hover:text-foreground disabled:opacity-40"
                >
                  {duplicatingId === arch.id ? "…" : "⧉"}
                </button>
                <button
                  onClick={() => handleDelete(arch)}
                  disabled={deletingId === arch.id}
                  title="Excluir arquetipo"
                  className="rounded-md border border-red-500/20 px-2.5 py-1.5 text-xs text-red-400/60 transition-all hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                >
                  {deletingId === arch.id ? "…" : "✕"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
