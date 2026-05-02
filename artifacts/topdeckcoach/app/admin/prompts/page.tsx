import Link from "next/link";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import PromptRowActions from "./_components/PromptRowActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PromptRow {
  id: number;
  game_id: string;
  version: string;
  notes: string | null;
  active: boolean;
  activated_at: string | null;
  activated_by: string | null;
  created_at: string;
  analyses_count: string;
  feedback_pos_pct: string | null;
}

async function getPrompts(gameId: string): Promise<PromptRow[]> {
  const r = await pool.query<PromptRow>(
    `SELECT
       p.id,
       p.game_id,
       p.version,
       p.notes,
       p.active,
       p.activated_at::text  AS activated_at,
       p.activated_by,
       p.created_at::text    AS created_at,
       COUNT(DISTINCT a.id) FILTER (WHERE a.deleted_at IS NULL)::text AS analyses_count,
       ROUND(
         COUNT(af.id) FILTER (WHERE af.rating = 'up') * 100.0
         / NULLIF(COUNT(af.id), 0),
       1)::text AS feedback_pos_pct
     FROM prompts p
     LEFT JOIN analyses a ON a.prompt_version_id = p.id
     LEFT JOIN analysis_feedback af ON af.analysis_id = a.id
     WHERE p.game_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [gameId],
  );
  return r.rows;
}

export default async function PromptsListPage() {
  await requireAdminCookie();

  const gameId = "digimon";
  const prompts = await getPrompts(gameId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Admin
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold text-foreground">
            Prompts — {gameId}
          </h1>
        </div>
        <Link
          href="/admin/prompts/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
        >
          + Criar nova versão
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {prompts.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card/40 px-8 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum prompt cadastrado ainda.{" "}
              <Link href="/admin/prompts/new" className="text-primary hover:underline">
                Criar primeira versão →
              </Link>
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/40 bg-card/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  {[
                    "Versão",
                    "Criado em",
                    "Status",
                    "Análises",
                    "Feedback +",
                    "Ativado por",
                    "Ações",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prompts.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-border/20 transition-colors hover:bg-card/60 ${
                      i === prompts.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    {/* Versão */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {p.version}
                        </span>
                        {p.notes && (
                          <span className="max-w-[200px] truncate text-xs text-muted-foreground/60">
                            {p.notes}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Criado em */}
                    <td className="px-4 py-3 text-xs text-muted-foreground/70 tabular-nums">
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })
                        : "—"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {p.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          ● ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground/50">
                          inativa
                        </span>
                      )}
                    </td>

                    {/* Análises */}
                    <td className="px-4 py-3 text-sm tabular-nums text-foreground/80">
                      {p.analyses_count ?? "0"}
                    </td>

                    {/* Feedback + */}
                    <td className="px-4 py-3 text-sm tabular-nums">
                      {p.feedback_pos_pct != null ? (
                        <span
                          className={
                            parseFloat(p.feedback_pos_pct) >= 70
                              ? "text-emerald-400"
                              : parseFloat(p.feedback_pos_pct) >= 40
                                ? "text-amber-400"
                                : "text-red-400"
                          }
                        >
                          {p.feedback_pos_pct}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Ativado por */}
                    <td className="px-4 py-3 text-xs text-muted-foreground/60">
                      {p.activated_by ? (
                        <div className="flex flex-col gap-0.5">
                          <span>{p.activated_by}</span>
                          {p.activated_at && (
                            <span className="text-[10px] text-muted-foreground/40">
                              {new Date(p.activated_at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      <PromptRowActions
                        promptId={p.id}
                        isActive={p.active}
                        version={p.version}
                      />
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
