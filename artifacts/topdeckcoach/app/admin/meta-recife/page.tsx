import Link from "next/link";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import CreateSnapshotButton from "@/app/admin/meta/_components/CreateSnapshotButton";

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

async function getLocalSnapshots(gameId: string): Promise<SnapshotRow[]> {
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
     WHERE ms.game_id = $1 AND ms.scope = 'local'
     GROUP BY ms.id
     ORDER BY ms.created_at DESC`,
    [gameId],
  );
  return r.rows;
}

export default async function MetaRecifeListPage() {
  requireAdminCookie();

  const gameId = "digimon";
  const snapshots = await getLocalSnapshots(gameId);
  const activeSnap = snapshots.find((s) => s.active);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Admin
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold text-foreground">Meta local — Recife</h1>
        </div>
        <CreateSnapshotButton
          gameId={gameId}
          activeSnapshotId={activeSnap?.id ?? null}
          activeSnapshotVersion={activeSnap?.version ?? null}
          scope="local"
          redirectBase="/admin/meta"
        />
      </header>

      {/* Banner visual "META LOCAL — RECIFE" */}
      <div className="border-b border-amber-500/20 bg-amber-950/10 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-950/30 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-400">
            📍 META LOCAL — RECIFE
          </span>
          <p className="text-xs text-muted-foreground/50">
            Snapshots locais são injetadas no contexto da análise ao lado da meta global.
            Quando ativa, o coach considera ambos os metas.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {snapshots.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card/40 px-8 py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma snapshot local cadastrada ainda.</p>
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
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-400">● ativa</span>
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

        {/* Nota de orientação */}
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-950/10 p-5">
          <p className="text-xs font-medium text-amber-400/80">Como usar</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground/60">
            <li>• Adicione os arquetipos que são populares aqui em Recife (3–5 é suficiente)</li>
            <li>• Preencha WR%, share e notas do coach com o contexto local</li>
            <li>• Clique em "⚡ Ativar esta snapshot" quando quiser que o coach use esses dados</li>
            <li>• A meta global continua sendo usada — a local é um complemento</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
