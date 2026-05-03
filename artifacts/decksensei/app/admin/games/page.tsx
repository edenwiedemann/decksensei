export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import Link from "next/link";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";

interface GameRow {
  id: string;
  name: string;
  created_at: string;
  prompt_count: string;
  snapshot_count: string;
  analysis_count: string;
}

async function getGamesWithStats(): Promise<GameRow[]> {
  const r = await pool.query<GameRow>(`
    SELECT
      g.id,
      g.name,
      g.created_at::text,
      COALESCE(p.cnt, 0)::text  AS prompt_count,
      COALESCE(s.cnt, 0)::text  AS snapshot_count,
      COALESCE(a.cnt, 0)::text  AS analysis_count
    FROM games g
    LEFT JOIN (SELECT game_id, COUNT(*) AS cnt FROM prompts         GROUP BY game_id) p ON p.game_id = g.id
    LEFT JOIN (SELECT game_id, COUNT(*) AS cnt FROM meta_snapshots  GROUP BY game_id) s ON s.game_id = g.id
    LEFT JOIN (SELECT game_id, COUNT(*) AS cnt FROM analyses        GROUP BY game_id) a ON a.game_id = g.id
    ORDER BY g.created_at ASC
  `);
  return r.rows;
}

export default async function AdminGamesPage() {
  await requireAdminCookie();
  const games = await getGamesWithStats();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Admin
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Jogos
          </h1>
        </div>
        <Link
          href="/admin/games/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Novo jogo
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {games.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card/40 px-6 py-16 text-center">
            <p className="text-muted-foreground">Nenhum jogo cadastrado ainda.</p>
            <Link
              href="/admin/games/new"
              className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Cadastrar primeiro jogo
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-card/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    ID / Nome
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Prompts
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Snapshots
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Análises
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {games.map((g, i) => (
                  <tr
                    key={g.id}
                    className={`border-b border-border/30 ${i % 2 === 0 ? "bg-card/20" : "bg-card/30"}`}
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">{g.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                        {g.id}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-foreground">
                      {g.prompt_count}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-foreground">
                      {g.snapshot_count}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-foreground">
                      {g.analysis_count}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/admin/games/${g.id}/edit`}
                        className="rounded-md border border-border/50 bg-card/50 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                      >
                        Editar
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
