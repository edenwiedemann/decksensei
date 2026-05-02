import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import type { MetaArchetype } from "@/lib/analysis-prompt";
import { toFormArchetype } from "@/app/admin/meta/_lib/types";
import ArchetypeEditForm from "./_components/ArchetypeEditForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SnapRow {
  id: number;
  game_id: string;
  version: string;
  active: boolean;
  json_content: { archetypes?: MetaArchetype[] };
}

async function getSnapshot(id: number): Promise<SnapRow | null> {
  const r = await pool.query<SnapRow>(
    "SELECT id, game_id, version, active, json_content FROM meta_snapshots WHERE id = $1 LIMIT 1",
    [id],
  );
  return r.rows[0] ?? null;
}

export default async function ArchetypeEditPage({
  params,
}: {
  params: Promise<{ id: string; archIdx: string }>;
}) {
  requireAdminCookie();

  const { id, archIdx } = await params;
  const snapshotId = parseInt(id, 10);
  const numericIdx = parseInt(archIdx, 10);
  if (isNaN(snapshotId) || isNaN(numericIdx)) notFound();

  const snap = await getSnapshot(snapshotId);
  if (!snap) notFound();

  const archetypes: MetaArchetype[] = snap.json_content?.archetypes ?? [];
  if (numericIdx < 0 || numericIdx >= archetypes.length) notFound();

  const dbArch = archetypes[numericIdx] as unknown as Record<string, unknown>;
  const formArch = toFormArchetype(dbArch);

  // Other archetypes for matchups dropdown
  const otherArchetypes = archetypes
    .filter((_, i) => i !== numericIdx)
    .map((a) => ({ id: a.id, name: a.name_pt || a.name }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/meta/${snapshotId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← {snap.version}
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold text-foreground">
            {formArch.name_pt || formArch.name || "Novo arquetipo"}
          </h1>
          {snap.active && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              ● snapshot ativa
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <ArchetypeEditForm
          snapshotId={snapshotId}
          archIdx={numericIdx}
          initialData={formArch}
          otherArchetypes={otherArchetypes}
          gameId={snap.game_id}
        />
      </main>
    </div>
  );
}
