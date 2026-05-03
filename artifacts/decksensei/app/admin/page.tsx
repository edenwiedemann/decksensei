import Link from "next/link";
import { pool } from "@workspace/db";
import { getDailyProductionCost, getDailyTestCost } from "@/lib/cost-tracker";
import { requireAdminCookie } from "@/lib/auth/admin";
import { getGames } from "@/lib/games/list";
import GameSelector from "./_components/GameSelector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Queries ─────────────────────────────────────────────────────────────────

async function getTotalUsers(): Promise<number> {
  const r = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
  return parseInt(r.rows[0]?.count ?? "0", 10);
}

async function getAnalysesToday(): Promise<number> {
  const r = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM analyses
     WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') =
           DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
       AND deleted_at IS NULL`,
  );
  return parseInt(r.rows[0]?.count ?? "0", 10);
}

async function getPositiveFeedbackPct(): Promise<number | null> {
  const r = await pool.query<{ pct: string | null }>(
    `SELECT ROUND(
       COUNT(*) FILTER (WHERE rating = 'up') * 100.0
       / NULLIF(COUNT(*), 0),
     1)::text AS pct
     FROM analysis_feedback
     WHERE created_at >= NOW() - INTERVAL '7 days'`,
  );
  const raw = r.rows[0]?.pct;
  return raw != null ? parseFloat(raw) : null;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  await requireAdminCookie();

  const [sp, games] = await Promise.all([searchParams, getGames()]);
  const currentGame = sp.game ?? games[0]?.id ?? "digimon";

  const [totalUsers, analysesToday, feedbackPct, prodCostUsd, testCostUsd] =
    await Promise.all([
      getTotalUsers().catch(() => null),
      getAnalysesToday().catch(() => null),
      getPositiveFeedbackPct().catch(() => null),
      getDailyProductionCost().catch(() => null),
      getDailyTestCost().catch(() => null),
    ]);

  const prodCapUsd = parseFloat(process.env.DAILY_COST_CAP_USD ?? "10");
  const testCapUsd = parseFloat(process.env.TEST_DAILY_COST_CAP_USD ?? "2");

  const prodPct = prodCostUsd != null ? Math.min(100, (prodCostUsd / prodCapUsd) * 100) : 0;
  const testPct = testCostUsd != null ? Math.min(100, (testCostUsd / testCapUsd) * 100) : 0;

  function capColor(pct: number) {
    return pct >= 90 ? "bg-red-500" : pct >= 65 ? "bg-amber-400" : "bg-primary";
  }
  function capTextColor(pct: number) {
    return pct >= 90 ? "text-red-400" : pct >= 65 ? "text-amber-400" : "text-muted-foreground";
  }

  const NAV_LINKS = [
    { href: `/admin/games`,                           label: "Jogos",       desc: "Cadastrar e editar jogos suportados",  icon: "🎮" },
    { href: `/admin/analyses`,                        label: "Análises",    desc: "Histórico e moderação de análises",    icon: "🗂" },
    { href: `/admin/users`,                           label: "Usuários",    desc: "Cadastros, magic links e sessões",     icon: "👤" },
    { href: `/admin/feedback`,                        label: "Feedback",    desc: "Avaliações up/down das análises",      icon: "⭐" },
    { href: `/admin/prompts?game=${currentGame}`,     label: "Prompts",     desc: "Versões de prompt por jogo",           icon: "✏️" },
    { href: `/admin/meta?game=${currentGame}`,        label: "Meta global", desc: "Snapshots e arquetipos do meta",       icon: "🌐" },
    { href: `/admin/meta-recife?game=${currentGame}`, label: "Meta Recife", desc: "Ajustes locais do meta de Recife",     icon: "🦀" },
    { href: `/admin/pipelines`,                       label: "Pipelines",   desc: "Status e histórico de coleta de dados",icon: "⚙️" },
    { href: `/admin/evidences`,                       label: "Evidências",  desc: "Curadoria e verificação de evidências",icon: "🔍" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← App
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Deck Sensei Admin
          </h1>
        </div>
        <GameSelector games={games} current={currentGame} />
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* ── Stat cards 2×2 ──────────────────────────────────────────── */}
        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Usuários totais */}
          <StatCard title="Usuários totais" icon="👤">
            <BigNumber value={totalUsers} />
            <p className="mt-1 text-xs text-muted-foreground">cadastrados na plataforma</p>
          </StatCard>

          {/* Análises hoje */}
          <StatCard title="Análises hoje" icon="🗂">
            <BigNumber value={analysesToday} />
            <p className="mt-1 text-xs text-muted-foreground">desde meia-noite (Recife)</p>
          </StatCard>

          {/* % feedback positivo 7d */}
          <StatCard title="Feedback positivo (7 dias)" icon="⭐">
            <BigNumber
              value={feedbackPct != null ? `${feedbackPct}%` : null}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {feedbackPct != null
                ? "avaliações 👍 nos últimos 7 dias"
                : "sem dados de feedback ainda"}
            </p>
          </StatCard>

          {/* Custo produção hoje */}
          <StatCard title="Custo produção — hoje" icon="💲">
            <BigNumber
              value={prodCostUsd != null ? `$${prodCostUsd.toFixed(4)}` : null}
            />
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-border/30">
                <div
                  className={`h-full rounded-full transition-all ${capColor(prodPct)}`}
                  style={{ width: `${prodPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                cap:{" "}
                <span className="font-medium text-foreground">${prodCapUsd}</span>
                {prodCostUsd != null && (
                  <>
                    {" "}·{" "}
                    <span className={capTextColor(prodPct)}>
                      {prodPct.toFixed(1)}% usado
                    </span>
                  </>
                )}
              </p>
            </div>
          </StatCard>

          {/* Custo testes hoje */}
          <StatCard title="Custo testes — hoje" icon="🧪">
            <BigNumber
              value={testCostUsd != null ? `$${testCostUsd.toFixed(4)}` : null}
            />
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-border/30">
                <div
                  className={`h-full rounded-full transition-all ${capColor(testPct)}`}
                  style={{ width: `${testPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                cap:{" "}
                <span className="font-medium text-foreground">${testCapUsd}</span>
                {testCostUsd != null && (
                  <>
                    {" "}·{" "}
                    <span className={capTextColor(testPct)}>
                      {testPct.toFixed(1)}% usado
                    </span>
                  </>
                )}
              </p>
            </div>
          </StatCard>
        </div>

        {/* ── Navegação ────────────────────────────────────────────────── */}
        <div>
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
            Painéis
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-start gap-4 rounded-xl border border-border/50 bg-card/40 px-5 py-4 transition-all hover:border-primary/40 hover:bg-card/70"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg">
                  {link.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {link.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {link.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 px-6 py-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

function BigNumber({ value }: { value: string | number | null | undefined }) {
  if (value == null) {
    return (
      <p className="text-3xl font-bold tabular-nums text-muted-foreground/40">
        —
      </p>
    );
  }
  return (
    <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
      {value}
    </p>
  );
}
