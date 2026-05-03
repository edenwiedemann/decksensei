import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import type { MetaArchetype } from "@/lib/analysis-prompt";
import SnapshotActions from "./_components/SnapshotActions";
import ArchetypeCardsList from "./_components/ArchetypeCardsList";
import ActiveSnapshotBanner from "./_components/ActiveSnapshotBanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SnapRow {
  id: number;
  game_id: string;
  version: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  json_content: { archetypes?: MetaArchetype[] };
}

async function getSnapshot(id: number): Promise<SnapRow | null> {
  const r = await pool.query<SnapRow>(
    `SELECT id, game_id, version, active, notes, created_at::text, json_content
     FROM meta_snapshots WHERE id = $1 LIMIT 1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export default async function SnapshotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminCookie();

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) notFound();

  const snap = await getSnapshot(numericId);
  if (!snap) notFound();

  // Pass original DB order — ArchetypeCardsList sorts for display internally
  const archetypes: MetaArchetype[] = snap.json_content?.archetypes ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/meta" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Meta
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold text-foreground">
            Snapshot{" "}
            <span className="font-mono text-primary">{snap.version}</span>
          </h1>
          {snap.active && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              ● ativa
            </span>
          )}
        </div>
        <SnapshotActions
          snapshotId={snap.id}
          isActive={snap.active}
          gameId={snap.game_id}
          currentVersion={snap.version}
        />
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Stat bar */}
        <div className="mb-6 flex items-center gap-6 text-xs text-muted-foreground/60">
          <span>{archetypes.length} arquetipos</span>
          <span>·</span>
          <span>criado em {new Date(snap.created_at).toLocaleDateString("pt-BR")}</span>
          {snap.notes && <><span>·</span><span className="max-w-xs truncate">{snap.notes}</span></>}
        </div>

        {/* Banner de só leitura para snapshot ativa */}
        {snap.active && (
          <ActiveSnapshotBanner
            snapshotId={snap.id}
            currentVersion={snap.version}
            gameId={snap.game_id}
          />
        )}

        <ArchetypeCardsList
          snapshotId={snap.id}
          archetypes={archetypes}
          isActive={snap.active}
        />
      </main>
    </div>
  );
}
