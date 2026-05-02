import Link from "next/link";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface FeedbackRow {
  id: number;
  analysis_id: string;
  rating: "up" | "down";
  comment: string | null;
  ip: string | null;
  created_at: string;
  deck_preview: string | null;
  game_id: string | null;
}

async function getFeedback(page: number, rating?: string): Promise<{ rows: FeedbackRow[]; total: number }> {
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (rating && (rating === "up" || rating === "down")) {
    values.push(rating);
    conditions.push(`af.rating = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows, countRow] = await Promise.all([
    pool.query<FeedbackRow>(
      `SELECT
         af.id, af.analysis_id, af.rating, af.comment, af.ip,
         af.created_at::text,
         left(a.deck_text, 80) AS deck_preview,
         a.game_id
       FROM analysis_feedback af
       LEFT JOIN analyses a ON a.id = af.analysis_id
       ${where}
       ORDER BY af.created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      values,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM analysis_feedback af ${where}`,
      values,
    ),
  ]);

  return { rows: rows.rows, total: parseInt(countRow.rows[0]?.count ?? "0", 10) };
}

async function getSummary() {
  const r = await pool.query<{ rating: string; count: string }>(
    `SELECT rating, COUNT(*)::text AS count
     FROM analysis_feedback
     GROUP BY rating`,
  );
  const up   = parseInt(r.rows.find((x) => x.rating === "up")?.count   ?? "0", 10);
  const down = parseInt(r.rows.find((x) => x.rating === "down")?.count ?? "0", 10);
  return { up, down, total: up + down };
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; rating?: string }>;
}) {
  requireAdminCookie();

  const sp     = await searchParams;
  const page   = Math.max(1, parseInt(sp.page ?? "1", 10));
  const rating = sp.rating ?? "";

  const [{ rows, total }, summary] = await Promise.all([
    getFeedback(page, rating),
    getSummary(),
  ]);

  const totalPages = Math.ceil(total / 50);
  const upPct = summary.total > 0 ? Math.round((summary.up / summary.total) * 100) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Admin
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold text-foreground">Feedback</h1>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Summary */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/50 bg-card/50 px-6 py-5 text-center">
            <p className="text-3xl font-bold tabular-nums text-foreground">{summary.total}</p>
            <p className="mt-1 text-xs text-muted-foreground/60 uppercase tracking-wider">Total</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-6 py-5 text-center">
            <p className="text-3xl font-bold tabular-nums text-emerald-400">{summary.up}</p>
            <p className="mt-1 text-xs text-emerald-400/60 uppercase tracking-wider">👍 Positivos</p>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-5 text-center">
            <p className="text-3xl font-bold tabular-nums text-red-400">{summary.down}</p>
            <p className="mt-1 text-xs text-red-400/60 uppercase tracking-wider">👎 Negativos</p>
          </div>
        </div>

        {upPct != null && (
          <div className="mb-8">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground/60">
              <span>Aprovação geral</span>
              <span className="font-medium text-foreground">{upPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-border/30">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${upPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-xs text-muted-foreground/60">{total} registros</span>
          <div className="flex gap-2 ml-auto">
            {(["", "up", "down"] as const).map((r) => (
              <Link
                key={r}
                href={`/admin/feedback${r ? `?rating=${r}` : ""}`}
                className={`rounded-md border px-3 py-1.5 text-xs transition-all ${
                  rating === r
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/40 text-muted-foreground hover:border-border/70 hover:text-foreground"
                }`}
              >
                {r === "" ? "Todos" : r === "up" ? "👍 Positivos" : "👎 Negativos"}
              </Link>
            ))}
          </div>
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card/40 px-8 py-16 text-center">
            <p className="text-sm text-muted-foreground">Nenhum feedback encontrado.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-card/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Rating</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Comentário</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Deck (prévia)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Análise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {rows.map((row) => (
                  <tr key={row.id} className="bg-card/20 hover:bg-card/40 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground/60">
                      {new Date(row.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      {row.rating === "up" ? (
                        <span className="text-emerald-400">👍</span>
                      ) : (
                        <span className="text-red-400">👎</span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-foreground">
                      {row.comment ? (
                        <span className="line-clamp-2">{row.comment}</span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      {row.deck_preview ? (
                        <code className="block truncate text-xs text-muted-foreground/50">
                          {row.deck_preview}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/analyses/${row.analysis_id}`}
                        className="font-mono text-xs text-primary/70 hover:text-primary transition-colors"
                      >
                        {row.analysis_id.slice(0, 8)}…
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/admin/feedback?page=${page - 1}${rating ? `&rating=${rating}` : ""}`}
                className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground transition-all"
              >
                ← Anterior
              </Link>
            )}
            <span className="text-xs text-muted-foreground/60">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/admin/feedback?page=${page + 1}${rating ? `&rating=${rating}` : ""}`}
                className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground transition-all"
              >
                Próxima →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
