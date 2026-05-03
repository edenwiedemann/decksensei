import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import { getGames } from "@/lib/games/list";
import GameSelector from "../_components/GameSelector";
import CreateSnapshotButton from "./_components/CreateSnapshotButton";
import SnapshotRollbackButton, { type SnapshotCandidate } from "./_components/SnapshotRollbackButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SnapshotRow {
  id: number;
  version: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  n_archetypes: string;
  analyses_count: string;
}

async function getSnapshots(gameId: string): Promise<SnapshotRow[]> {
  const r = await pool.query<SnapshotRow>(
    `SELECT
       ms.id,
       ms.version,
       ms.active,
       ms.notes,
       ms.created_at::text,
       jsonb_array_length(ms.json_content->'archetypes')::text AS n_archetypes,
       COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL)::text   AS analyses_count
     FROM meta_snapshots ms
     LEFT JOIN analyses a ON a.meta_snapshot_id = ms.id
     WHERE ms.game_id = $1 AND ms.scope = 'global'
     GROUP BY ms.id
     ORDER BY ms.created_at DESC`,
    [gameId],
  );
  return r.rows;
}

export default async function MetaListPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  await requireAdminCookie();

  const [sp, games] = await Promise.all([searchParams, getGames()]);
  const gameId = sp.game ?? games[0]?.id;
  if (!gameId) notFound();

  const snapshots = await getSnapshots(gameId);
  const activeSnap = snapshots.find((s) => s.active);
  const gameName = games.find((g) => g.id === gameId)?.label ?? gameId;

  const rollbackCandidates: SnapshotCandidate[] = snapshots
    .filter((s) => !s.active)
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      version: s.version,
      notes: s.notes,
      analyses_count: s.analyses_count,
      n_archetypes: s.n_archetypes,
      created_at: s.created_at,
    }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Admin
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold text-foreground">
            Meta global — <span className="text-primary">{gameName}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <GameSelector games={games} current={gameId} />
          {activeSnap && (
            <SnapshotRollbackButton
              gameId={gameId}
              activeVersion={activeSnap.version}
              candidates={rollbackCandidates}
            />
          )}
          <CreateSnapshotButton
            gameId={gameId}
            activeSnapshotId={activeSnap?.id ?? null}
            activeSnapshotVersion={activeSnap?.version ?? null}
          />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {snapshots.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card/40 px-8 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma snapshot cadastrada ainda para <strong>{gameName}</strong>.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/40 bg-card/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  {["Versão", "Criado em", "Status", "Arquetipos", "Análises geradas", "Ações"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border/20 transition-colors hover:bg-card/60 ${i === snapshots.length - 1 ? "border-b-0" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-sm font-medium text-foreground">{s.version}</span>
                        {s.notes && (
                          <span className="max-w-[220px] truncate text-xs text-muted-foreground/60">{s.notes}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground/70">
                      {new Date(s.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      {s.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400">● ativa</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground/50">rascunho</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-foreground/80">{s.n_archetypes ?? "0"}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-foreground/80">{s.analyses_count ?? "0"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/meta/${s.id}`}
                        className="rounded-md border border-border/40 px-2.5 py-1 text-xs text-muted-foreground transition-all hover:border-border/70 hover:text-foreground"
                      >
                        Ver / Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
