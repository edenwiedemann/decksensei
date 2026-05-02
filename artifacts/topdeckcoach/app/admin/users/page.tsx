import Link from "next/link";
import { Suspense } from "react";
import { pool } from "@workspace/db";
import SearchBar from "./_components/SearchBar";
import Pagination from "./_components/Pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_SIZE = 50;

function fmtDateBR(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

interface UserRow {
  id: number;
  email: string;
  city: string | null;
  state: string | null;
  created_at: Date;
  last_seen_at: Date;
  total_analyses: string;
}

async function getUsers(q: string, page: number) {
  const offset = (page - 1) * PAGE_SIZE;
  const like = q ? `%${q}%` : "%";

  const [rows, countRow] = await Promise.all([
    pool.query<UserRow>(
      `SELECT
         u.id, u.email, u.city, u.state, u.created_at, u.last_seen_at,
         COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL)::text AS total_analyses
       FROM users u
       LEFT JOIN analyses a ON a.user_id = u.id
       WHERE u.email ILIKE $1 OR u.city ILIKE $1 OR u.state ILIKE $1
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [like, PAGE_SIZE, offset],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(DISTINCT u.id)::text AS total
       FROM users u
       WHERE u.email ILIKE $1 OR u.city ILIKE $1 OR u.state ILIKE $1`,
      [like],
    ),
  ]);

  const total = parseInt(countRow.rows[0]?.total ?? "0", 10);
  return { rows: rows.rows, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const { q = "", page: pageStr = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageStr, 10) || 1);

  const { rows, total, totalPages } = await getUsers(q, page).catch(() => ({
    rows: [] as UserRow[],
    total: 0,
    totalPages: 1,
  }));

  const exportHref = `/api/admin/users/export${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(224,40%,5%)] via-[hsl(224,38%,7%)] to-[hsl(224,35%,10%)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Admin
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold text-foreground">Usuários</h1>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Toolbar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Suspense fallback={<div className="h-9 w-64 animate-pulse rounded-lg bg-muted/30" />}>
            <SearchBar defaultValue={q} />
          </Suspense>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              {total} usuário{total !== 1 ? "s" : ""}
            </span>
            <a
              href={exportHref}
              className="rounded-lg border border-border/60 bg-card/60 px-4 py-2 text-sm font-medium text-foreground hover:bg-card transition-colors"
            >
              Exportar CSV
            </a>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                {["Email", "Cidade", "Estado", "Criado em", "Última atividade", "Análises"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {q ? `Nenhum usuário encontrado para "${q}".` : "Nenhum usuário cadastrado ainda."}
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border/20 transition-colors hover:bg-muted/10"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {u.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.city ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.state ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmtDateBR(u.created_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmtDateBR(u.last_seen_at)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {u.total_analyses}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Suspense fallback={null}>
              <Pagination page={page} totalPages={totalPages} />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}
