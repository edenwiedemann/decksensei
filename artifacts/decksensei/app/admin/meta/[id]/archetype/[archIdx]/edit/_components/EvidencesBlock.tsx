import { pool } from "@workspace/db";
import { computeConfidenceScore } from "@/lib/evidence/score";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvidenceRow {
  id: number;
  source_id: string;
  event_label: string;
  event_date: string;
  url: string | null;
  data: Record<string, unknown>;
  verified: boolean;
  verified_by: string | null;
  imported_at: Date;
}

interface SourceMeta {
  label: string;
  weight: number;
  color: string;
}

const SOURCE_META: Record<string, SourceMeta> = {
  "bandai-worlds-final":      { label: "World Final",    weight: 100, color: "text-yellow-400 border-yellow-500/40 bg-yellow-950/20" },
  "bandai-regionals":         { label: "Regional",       weight: 90,  color: "text-orange-400 border-orange-500/40 bg-orange-950/20" },
  "bandai-ultimate-cup":      { label: "Ultimate Cup",   weight: 85,  color: "text-orange-400 border-orange-500/40 bg-orange-950/20" },
  "bandai-store-championship":{ label: "Store Champ.",   weight: 75,  color: "text-amber-400 border-amber-500/40 bg-amber-950/20"   },
  "digimonmeta-review":       { label: "DigimonMeta",   weight: 70,  color: "text-sky-400 border-sky-500/40 bg-sky-950/20"         },
  "limitless-tcg":            { label: "Limitless",      weight: 50,  color: "text-violet-400 border-violet-500/40 bg-violet-950/20"},
  "digimoncard-io":           { label: "DigimonCard.io", weight: 25,  color: "text-slate-400 border-slate-500/40 bg-slate-900/20"   },
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getEvidences(gameId: string, archetypeId: string): Promise<EvidenceRow[]> {
  const r = await pool.query<EvidenceRow>(
    `SELECT id, source_id, event_label, event_date::text, url, data, verified, verified_by, imported_at
     FROM meta_archetype_evidences
     WHERE game_id = $1 AND archetype_id = $2
     ORDER BY event_date DESC
     LIMIT 50`,
    [gameId, archetypeId],
  );
  return r.rows;
}

// ─── Score computation ────────────────────────────────────────────────────────

function computeScore(evidences: EvidenceRow[]): {
  score: number;
  weightedWinRate: number | null;
  winRateRange: [number, number] | null;
  totalSampleSize: number;
  sourcesUsed: string[];
} {
  const inputs = evidences.map((ev) => {
    const sm = SOURCE_META[ev.source_id];
    const baseWeight = sm ? sm.weight / 100 : 0.25;
    const sampleSize = typeof ev.data.sample_size === "number" ? ev.data.sample_size : 1;
    return {
      eventDate: new Date(ev.event_date),
      verified: ev.verified,
      sampleSize,
      baseWeight,
    };
  });

  const score = Math.round(computeConfidenceScore(inputs));

  // Weighted win rate
  const withWR = evidences
    .map((ev) => {
      const wr = typeof ev.data.win_rate === "number" ? ev.data.win_rate : null;
      const sm = SOURCE_META[ev.source_id];
      const w = sm ? sm.weight / 100 : 0.25;
      return wr != null ? { wr, w } : null;
    })
    .filter((x): x is { wr: number; w: number } => x !== null);

  let weightedWinRate: number | null = null;
  let winRateRange: [number, number] | null = null;

  if (withWR.length > 0) {
    const totalW = withWR.reduce((s, x) => s + x.w, 0);
    weightedWinRate = withWR.reduce((s, x) => s + x.wr * x.w, 0) / totalW;
    const rates = withWR.map((x) => x.wr);
    winRateRange = [Math.min(...rates), Math.max(...rates)];
  }

  const totalSampleSize = evidences.reduce((s, ev) => {
    return s + (typeof ev.data.sample_size === "number" ? ev.data.sample_size : 0);
  }, 0);

  const sourcesUsed = [...new Set(evidences.map((ev) => ev.source_id))];

  return { score, weightedWinRate, winRateRange, totalSampleSize, sourcesUsed };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ sourceId }: { sourceId: string }) {
  const m = SOURCE_META[sourceId];
  if (!m) return <span className="text-xs text-muted-foreground/50">{sourceId}</span>;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${m.color}`}>
      {m.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  const label = score >= 70 ? "alta confiança" : score >= 40 ? "confiança parcial" : "pouca evidência";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 overflow-hidden rounded-full bg-border/30 h-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-bold tabular-nums text-foreground">{score}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  gameId: string;
  archetypeId: string;
}

export default async function EvidencesBlock({ gameId, archetypeId }: Props) {
  const evidences = await getEvidences(gameId, archetypeId).catch(() => [] as EvidenceRow[]);
  const stats = computeScore(evidences);

  const confidenceLabel =
    stats.score >= 70 ? "alta" : stats.score >= 40 ? "média" : "baixa";

  return (
    <div className="mt-10 space-y-6">
      <div className="border-t border-border/40 pt-8">
        <h2 className="mb-6 text-base font-semibold text-foreground">Evidências externas</h2>

        {/* Score card */}
        <div className="mb-6 rounded-xl border border-border/50 bg-card/40 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">
                Score de confiança
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                  {stats.score}
                </span>
                <span className="text-base text-muted-foreground">/100</span>
                <span className="text-sm text-muted-foreground">({confidenceLabel})</span>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground/60 space-y-1">
              <p>{evidences.length} evidência{evidences.length !== 1 ? "s" : ""}</p>
              <p>{stats.sourcesUsed.length} fonte{stats.sourcesUsed.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <ScoreBar score={stats.score} />

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
            <div>
              <p className="text-muted-foreground/60 mb-0.5">WR ponderado</p>
              <p className="font-medium text-foreground">
                {stats.weightedWinRate != null ? `${stats.weightedWinRate.toFixed(1)}%` : "—"}
              </p>
            </div>
            {stats.winRateRange && (
              <div>
                <p className="text-muted-foreground/60 mb-0.5">Range WR</p>
                <p className="font-medium text-foreground">
                  {stats.winRateRange[0].toFixed(1)}% — {stats.winRateRange[1].toFixed(1)}%
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground/60 mb-0.5">Sample combinado</p>
              <p className="font-medium text-foreground">
                {stats.totalSampleSize > 0 ? `${stats.totalSampleSize} partidas` : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground/60 mb-0.5">Fontes</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {stats.sourcesUsed.map((sid) => (
                  <span key={sid} className="rounded bg-muted/30 px-1.5 py-0.5 text-xs text-muted-foreground">
                    {SOURCE_META[sid]?.label ?? sid}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Evidence list */}
        {evidences.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma evidência externa para este arquetipo ainda.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/50">
              Execute uma pipeline de coleta para importar dados de fontes externas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["Fonte", "Evento", "Data", "Sample", "WR", "Status"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidences.map((ev) => {
                  const wr = typeof ev.data.win_rate === "number" ? ev.data.win_rate : null;
                  const sample = typeof ev.data.sample_size === "number" ? ev.data.sample_size : null;

                  return (
                    <tr key={ev.id} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="px-3 py-2.5">
                        <SourceBadge sourceId={ev.source_id} />
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5">
                        <span className="block truncate text-xs text-muted-foreground" title={ev.event_label}>
                          {ev.event_label}
                        </span>
                        {ev.url && (
                          <a href={ev.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary/50 hover:text-primary">
                            ver ↗
                          </a>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {ev.event_date}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                        {sample ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                        {wr != null ? `${Number(wr).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {ev.verified ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                            pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground/40">
          Para adicionar evidências manualmente, use o painel de curadoria em{" "}
          <a href="/admin/evidences" className="text-primary/60 hover:text-primary underline-offset-2 hover:underline">
            /admin/evidences
          </a>.
        </p>
      </div>
    </div>
  );
}
