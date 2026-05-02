import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";

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

interface UserDetail {
  id: number;
  email: string;
  city: string | null;
  state: string | null;
  created_at: Date;
  last_seen_at: Date;
}

interface AnalysisRow {
  id: string;
  game_id: string;
  deck_text: string;
  created_at: Date;
  similar_archetype_id: string | null;
  response_time_ms: number | null;
}

async function getUserDetail(id: number) {
  const [userRes, analysesRes] = await Promise.all([
    pool.query<UserDetail>(
      "SELECT id, email, city, state, created_at, last_seen_at FROM users WHERE id = $1",
      [id],
    ),
    pool.query<AnalysisRow>(
      `SELECT id, game_id, deck_text, created_at, similar_archetype_id, response_time_ms
       FROM analyses
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`,
      [id],
    ),
  ]);

  return {
    user: userRes.rows[0] ?? null,
    analyses: analysesRes.rows,
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requireAdminCookie();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);

  if (isNaN(id)) notFound();

  const { user, analyses } = await getUserDetail(id).catch(() => ({ user: null, analyses: [] }));

  if (!user) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Usuários
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold text-foreground truncate max-w-xs">
          {user.email}
        </h1>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 flex flex-col gap-8">
        {/* User info card */}
        <div className="rounded-xl border border-border/50 bg-card/50 px-6 py-5">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Dados do usuário
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="ID" value={String(user.id)} />
            <Field label="Email" value={user.email} />
            <Field label="Cidade" value={user.city ?? "—"} />
            <Field label="Estado" value={user.state ?? "—"} />
            <Field label="Cadastro" value={fmtDateBR(user.created_at)} />
            <Field label="Última atividade" value={fmtDateBR(user.last_seen_at)} />
          </dl>
        </div>

        {/* Analyses */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            Análises
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
              {analyses.length}
            </span>
          </h2>

          {analyses.length === 0 ? (
            <p className="rounded-xl border border-border/40 px-6 py-8 text-center text-sm text-muted-foreground">
              Nenhuma análise registrada.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {["Data", "Jogo", "Arquetipo detectado", "Tempo (ms)", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analyses.map((a) => (
                    <tr key={a.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {fmtDateBR(a.created_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{a.game_id}</td>
                      <td className="px-4 py-3">
                        {a.similar_archetype_id ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {a.similar_archetype_id}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {a.response_time_ms != null ? a.response_time_ms.toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/analyses/${a.id}`}
                          className="text-xs font-medium text-primary hover:underline underline-offset-2"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground/60">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-all">{value}</dd>
    </div>
  );
}
