import Link from "next/link";
import { Suspense } from "react";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import AnalysesFilters from "./_components/AnalysesFilters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmtDateBR(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

interface AnalysisRow {
  id: string;
  game_id: string;
  created_at: Date;
  deck_preview: string;
  response_time_ms: number | null;
  similar_archetype_id: string | null;
  email: string | null;
  rating: string | null;
  total_tokens: string;
  cost_usd: string;
}

interface Filters {
  from?: string;
  to?: string;
  feedback?: string;
  archetype?: string;
  auth?: string;
  game?: string;
}

async function getAnalyses(f: Filters): Promise<AnalysisRow[]> {
  const conditions: string[] = ["a.deleted_at IS NULL"];
  const values: unknown[] = [];
  let i = 1;

  if (f.from) {
    conditions.push(`a.created_at >= $${i++}::date`);
    values.push(f.from);
  }
  if (f.to) {
    conditions.push(`a.created_at < ($${i++}::date + interval '1 day')`);
    values.push(f.to);
  }
  if (f.game && f.game !== "all") {
    conditions.push(`a.game_id = $${i++}`);
    values.push(f.game);
  }
  if (f.auth === "logged") {
    conditions.push("a.user_id IS NOT NULL");
  }
  if (f.archetype && f.archetype !== "all") {
    conditions.push(`a.similar_archetype_id = $${i++}`);
    values.push(f.archetype);
  }

  const feedbackHaving =
    f.feedback === "up"   ? "fb.rating = 'up'" :
    f.feedback === "down" ? "fb.rating = 'down'" :
    f.feedback === "none" ? "fb.rating IS NULL" : null;

  const query = `
    SELECT
      a.id,
      a.game_id,
      a.created_at,
      LEFT(a.deck_text, 60) AS deck_preview,
      a.response_time_ms,
      a.similar_archetype_id,
      u.email,
      fb.rating,
      COALESCE(SUM(c.input_tokens + c.output_tokens), 0)::text AS total_tokens,
      COALESCE(SUM(c.cost_usd::numeric), 0)::text AS cost_usd
    FROM analyses a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN LATERAL (
      SELECT rating FROM analysis_feedback
      WHERE analysis_id = a.id ORDER BY id DESC LIMIT 1
    ) fb ON true
    LEFT JOIN api_costs c ON c.analysis_id = a.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY a.id, u.email, fb.rating
    ${feedbackHaving ? `HAVING ${feedbackHaving}` : ""}
    ORDER BY a.created_at DESC
    LIMIT 100
  `;

  const res = await pool.query<AnalysisRow>(query, values);
  return res.rows;
}

async function getFilterOptions() {
  const [archetypesRes, gamesRes] = await Promise.all([
    pool.query<{ id: string }>(
      "SELECT DISTINCT similar_archetype_id AS id FROM analyses WHERE similar_archetype_id IS NOT NULL ORDER BY 1"
    ),
    pool.query<{ id: string }>(
      "SELECT DISTINCT game_id AS id FROM analyses WHERE deleted_at IS NULL ORDER BY 1"
    ),
  ]);
  return {
    archetypes: archetypesRes.rows.map((r) => r.id),
    games: gamesRes.rows.map((r) => r.id),
  };
}

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function AdminAnalysesPage({ searchParams }: PageProps) {
  await requireAdminCookie();
  const sp = await searchParams;
  const filters: Filters = {
    from: sp.from, to: sp.to,
    feedback: sp.feedback, archetype: sp.archetype,
    auth: sp.auth, game: sp.game,
  };

  const [rows, { archetypes, games }] = await Promise.all([
    getAnalyses(filters).catch(() => [] as AnalysisRow[]),
    getFilterOptions().catch(() => ({ archetypes: [] as string[], games: [] as string[] })),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Admin
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold text-foreground">Análises</h1>
        <span className="ml-auto rounded-full bg-muted/30 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {rows.length} resultado{rows.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
        <div className="mb-6">
          <Suspense
            fallback={<div className="h-9 w-96 animate-pulse rounded-lg bg-muted/30" />}
          >
            <AnalysesFilters archetypes={archetypes} games={games} />
          </Suspense>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                {[
                  "Data", "Jogo", "Usuário", "Deck (prévia)",
                  "ms", "Tokens", "Custo USD", "Feedback", "Arquetipo", "",
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma análise encontrada.
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-xs text-muted-foreground">
                      {fmtDateBR(a.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                      {a.game_id}
                    </td>
                    <td className="max-w-[130px] truncate px-3 py-2.5 text-xs">
                      {a.email ? (
                        <span className="text-foreground/80" title={a.email}>
                          {a.email}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground/40">anônimo</span>
                      )}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-3 py-2.5 font-mono text-xs text-muted-foreground/70"
                      title={a.deck_preview}
                    >
                      {a.deck_preview}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-xs text-muted-foreground">
                      {a.response_time_ms != null
                        ? a.response_time_ms.toLocaleString("pt-BR")
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-xs text-muted-foreground">
                      {parseInt(a.total_tokens, 10).toLocaleString("pt-BR")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-xs text-muted-foreground">
                      ${parseFloat(a.cost_usd).toFixed(5)}
                    </td>
                    <td className="px-3 py-2.5 text-sm">
                      {a.rating === "up"
                        ? "👍"
                        : a.rating === "down"
                          ? "👎"
                          : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {a.similar_archetype_id ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {a.similar_archetype_id}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/admin/analyses/${a.id}`}
                        className="whitespace-nowrap text-xs font-medium text-primary hover:underline underline-offset-2"
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
