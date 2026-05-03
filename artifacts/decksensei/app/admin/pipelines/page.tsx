import Link from "next/link";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import RunNowButton from "./_components/RunNowButton";
import PauseButton from "./_components/PauseButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Source metadata ──────────────────────────────────────────────────────────

interface SourceMeta {
  label: string;
  weight: number;
}

const SOURCE_META: Record<string, SourceMeta> = {
  "bandai-worlds-final":      { label: "Bandai — World Championship Final", weight: 100 },
  "bandai-regionals":         { label: "Bandai — Regionals",                weight: 90  },
  "bandai-ultimate-cup":      { label: "Bandai — Ultimate Cup",             weight: 85  },
  "bandai-store-championship":{ label: "Bandai — Store Championship",       weight: 75  },
  "digimonmeta-review":       { label: "DigimonMeta (editorial)",           weight: 70  },
  "limitless-tcg":            { label: "Limitless TCG (agregador)",         weight: 50  },
  "digimoncard-io":           { label: "DigimonCard.io (self-reported)",    weight: 25  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Próxima segunda-feira às 03:00 BRT (UTC-3). */
function nextMondayBRT(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon…
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(6, 0, 0, 0); // 03:00 BRT = 06:00 UTC
  return next.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

interface HealthRow {
  source_id: string;
  status: string;
  items_imported: number | null;
  detected_at: Date | null;
}

async function getLatestRuns(): Promise<Map<string, HealthRow>> {
  const r = await pool.query<HealthRow>(
    `SELECT DISTINCT ON (source_id)
       source_id, status, items_imported, detected_at
     FROM pipeline_health
     ORDER BY source_id, detected_at DESC`,
  );
  return new Map(r.rows.map((row) => [row.source_id, row]));
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "sem dados";
  const map: Record<string, string> = {
    ok:           "border-emerald-500/30 bg-emerald-950/20 text-emerald-400",
    broken:       "border-red-500/30 bg-red-950/20 text-red-400",
    import_error: "border-amber-500/30 bg-amber-950/20 text-amber-400",
    skipped:      "border-sky-500/30 bg-sky-950/20 text-sky-400",
    paused:       "border-border/40 bg-muted/20 text-muted-foreground",
  };
  const cls = map[s] ?? "border-border/30 bg-muted/10 text-muted-foreground/60";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {s}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PipelinesPage() {
  await requireAdminCookie();

  const latestRuns = await getLatestRuns().catch(() => new Map<string, HealthRow>());

  const sources = Object.keys(SOURCE_META);
  const brokenSources = sources.filter((sid) => {
    const run = latestRuns.get(sid);
    return run && (run.status === "broken" || run.status === "import_error");
  });

  const nextRun = nextMondayBRT();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Admin
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold text-foreground">Pipelines de evidências</h1>
        <span className="ml-auto text-xs text-muted-foreground/50">
          próx. cron: <span className="font-mono text-muted-foreground">{nextRun}</span>
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Broken banner */}
        {brokenSources.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
            <span className="text-amber-400 text-sm">⚠</span>
            <div>
              <p className="text-sm font-medium text-amber-400">
                {brokenSources.length} pipeline{brokenSources.length > 1 ? "s" : ""} com problema
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {brokenSources.map((sid) => (
                  <Link
                    key={sid}
                    href={`/admin/pipelines/${encodeURIComponent(sid)}`}
                    className="text-xs text-amber-300/70 underline underline-offset-2 hover:text-amber-300"
                  >
                    {sid}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                {["Source ID", "Fonte / Peso", "Status", "Último run", "Itens", "Ações"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((sid) => {
                const meta = SOURCE_META[sid]!;
                const run = latestRuns.get(sid);
                const isPaused = run?.status === "paused";

                return (
                  <tr key={sid} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground/70">{sid}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground/80">{meta.label}</p>
                      <p className="text-xs text-muted-foreground/50">peso {meta.weight}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run?.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(run?.detected_at ?? null)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      {run?.items_imported ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/pipelines/${encodeURIComponent(sid)}`}
                          className="text-xs text-primary hover:underline underline-offset-2 whitespace-nowrap"
                        >
                          Histórico
                        </Link>
                        <RunNowButton sourceId={sid} />
                        <PauseButton sourceId={sid} isPaused={isPaused} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
