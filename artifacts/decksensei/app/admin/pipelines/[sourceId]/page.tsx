import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import RunNowButton from "../_components/RunNowButton";
import PauseButton from "../_components/PauseButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Source metadata ──────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; weight: number }> = {
  "bandai-worlds-final":      { label: "Bandai — World Championship Final", weight: 100 },
  "bandai-regionals":         { label: "Bandai — Regionals",                weight: 90  },
  "bandai-ultimate-cup":      { label: "Bandai — Ultimate Cup",             weight: 85  },
  "bandai-store-championship":{ label: "Bandai — Store Championship",       weight: 75  },
  "digimonmeta-review":       { label: "DigimonMeta (editorial)",           weight: 70  },
  "limitless-tcg":            { label: "Limitless TCG (agregador)",         weight: 50  },
  "digimoncard-io":           { label: "DigimonCard.io (self-reported)",    weight: 25  },
};

// ─── Queries ──────────────────────────────────────────────────────────────────

interface HealthRow {
  id: number;
  source_id: string;
  status: string;
  items_imported: number | null;
  failures: string[] | null;
  error_message: string | null;
  detected_at: Date;
}

async function getHistory(sourceId: string): Promise<HealthRow[]> {
  const r = await pool.query<HealthRow>(
    `SELECT id, source_id, status, items_imported, failures, error_message, detected_at
     FROM pipeline_health
     WHERE source_id = $1
     ORDER BY detected_at DESC
     LIMIT 30`,
    [sourceId],
  );
  return r.rows;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok:           "border-emerald-500/30 bg-emerald-950/20 text-emerald-400",
    broken:       "border-red-500/30 bg-red-950/20 text-red-400",
    import_error: "border-amber-500/30 bg-amber-950/20 text-amber-400",
    skipped:      "border-sky-500/30 bg-sky-950/20 text-sky-400",
    paused:       "border-border/40 bg-muted/20 text-muted-foreground",
  };
  const cls = map[status] ?? "border-border/30 bg-muted/10 text-muted-foreground/60";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  await requireAdminCookie();

  const { sourceId } = await params;
  const meta = SOURCE_META[sourceId];
  if (!meta) notFound();

  const history = await getHistory(sourceId).catch(() => [] as HealthRow[]);
  const latest = history[0];
  const isPaused = latest?.status === "paused";

  const isBroken =
    latest && (latest.status === "broken" || latest.status === "import_error");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/pipelines" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Pipelines
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold text-foreground">{meta.label}</h1>
          <span className="rounded-full bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
            peso {meta.weight}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RunNowButton sourceId={sourceId} />
          <PauseButton sourceId={sourceId} isPaused={isPaused} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Fingerprint status box */}
        {isBroken && latest && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-5">
            <p className="mb-3 text-sm font-semibold text-red-400">
              Fingerprint quebrado — detalhes do último run
            </p>
            <div className="space-y-1.5">
              {(Array.isArray(latest.failures) ? latest.failures : [latest.error_message]).filter(Boolean).map((f, i) => (
                <p key={i} className="font-mono text-xs text-red-300/80">
                  • {String(f)}
                </p>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Detectado em {fmtDate(latest.detected_at)}
            </p>
          </div>
        )}

        {/* History table */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Histórico (últimos {history.length} runs)
          </p>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["Timestamp", "Status", "Itens importados", "Detalhes"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      Nenhum run registrado para esta pipeline.
                    </td>
                  </tr>
                ) : (
                  history.map((row) => {
                    const failures = Array.isArray(row.failures) ? row.failures : [];
                    const hasDetails = failures.length > 0 || !!row.error_message;

                    return (
                      <tr key={row.id} className="border-b border-border/20 hover:bg-muted/10">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {fmtDate(row.detected_at)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                          {row.items_imported ?? "—"}
                        </td>
                        <td className="px-4 py-3 max-w-sm">
                          {hasDetails ? (
                            <details className="cursor-pointer">
                              <summary className="text-xs text-primary hover:underline">
                                Ver detalhes ({failures.length > 0 ? failures.length : 1})
                              </summary>
                              <div className="mt-2 space-y-1">
                                {failures.map((f, i) => (
                                  <p key={i} className="font-mono text-xs text-red-300/70">• {f}</p>
                                ))}
                                {row.error_message && (
                                  <p className="font-mono text-xs text-amber-300/70">• {row.error_message}</p>
                                )}
                              </div>
                            </details>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
