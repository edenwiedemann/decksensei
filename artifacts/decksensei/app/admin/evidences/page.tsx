import Link from "next/link";
import { Suspense } from "react";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import VerifyRejectButtons from "./_components/VerifyRejectButtons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Source metadata ──────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; weight: number; color: string }> = {
  "bandai-worlds-final":      { label: "World Final",    weight: 100, color: "text-yellow-400 border-yellow-500/40 bg-yellow-950/20" },
  "bandai-regionals":         { label: "Regional",       weight: 90,  color: "text-orange-400 border-orange-500/40 bg-orange-950/20" },
  "bandai-ultimate-cup":      { label: "Ultimate Cup",   weight: 85,  color: "text-orange-400 border-orange-500/40 bg-orange-950/20" },
  "bandai-store-championship":{ label: "Store Champ.",   weight: 75,  color: "text-amber-400 border-amber-500/40 bg-amber-950/20"   },
  "digimonmeta-review":       { label: "DigimonMeta",   weight: 70,  color: "text-sky-400 border-sky-500/40 bg-sky-950/20"         },
  "limitless-tcg":            { label: "Limitless",      weight: 50,  color: "text-violet-400 border-violet-500/40 bg-violet-950/20"},
  "digimoncard-io":           { label: "DigimonCard.io", weight: 25,  color: "text-slate-400 border-slate-500/40 bg-slate-900/20"   },
};

// ─── Queries ──────────────────────────────────────────────────────────────────

interface EvidenceRow {
  id: number;
  game_id: string;
  archetype_id: string;
  source_id: string;
  event_label: string;
  event_date: string;
  url: string | null;
  sample_size: number | null;
  win_rate: number | null;
  share_pct: number | null;
  imported_at: Date;
}

interface Filters {
  source?: string;
  archetype?: string;
  game?: string;
}

async function getPendingEvidences(f: Filters): Promise<EvidenceRow[]> {
  const conditions: string[] = ["verified = false"];
  const values: unknown[] = [];
  let i = 1;

  if (f.game && f.game !== "all") {
    conditions.push(`game_id = $${i++}`);
    values.push(f.game);
  }
  if (f.source && f.source !== "all") {
    conditions.push(`source_id = $${i++}`);
    values.push(f.source);
  }
  if (f.archetype && f.archetype !== "all") {
    conditions.push(`archetype_id = $${i++}`);
    values.push(f.archetype);
  }

  const r = await pool.query<EvidenceRow>(
    `SELECT
       id, game_id, archetype_id, source_id, event_label, event_date::text,
       url,
       (data->>'sample_size')::int      AS sample_size,
       (data->>'win_rate')::numeric      AS win_rate,
       (data->>'share_pct')::numeric     AS share_pct,
       imported_at
     FROM meta_archetype_evidences
     WHERE ${conditions.join(" AND ")}
     ORDER BY imported_at DESC
     LIMIT 50`,
    values,
  );
  return r.rows;
}

async function getFilterOptions(): Promise<{ sources: string[]; archetypes: string[]; games: string[] }> {
  const [s, a, g] = await Promise.all([
    pool.query<{ source_id: string }>("SELECT DISTINCT source_id FROM meta_archetype_evidences WHERE verified = false ORDER BY 1"),
    pool.query<{ archetype_id: string }>("SELECT DISTINCT archetype_id FROM meta_archetype_evidences WHERE verified = false ORDER BY 1"),
    pool.query<{ game_id: string }>("SELECT DISTINCT game_id FROM meta_archetype_evidences ORDER BY 1"),
  ]);
  return {
    sources: s.rows.map((r) => r.source_id),
    archetypes: a.rows.map((r) => r.archetype_id),
    games: g.rows.map((r) => r.game_id),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ sourceId }: { sourceId: string }) {
  const m = SOURCE_META[sourceId];
  if (!m) return <span className="text-xs text-muted-foreground/50">{sourceId}</span>;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${m.color}`}>
      {m.label} <span className="ml-1 opacity-60">·{m.weight}</span>
    </span>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 text-xs font-medium text-emerald-400">verified</span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/20 px-2 py-0.5 text-xs font-medium text-amber-400">pending</span>
  );
}

function fmtAge(d: Date | string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days === 0) return "hoje";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}

// ─── Filters client component ─────────────────────────────────────────────────

function FiltersBar({
  sources, archetypes, games, current,
}: {
  sources: string[]; archetypes: string[]; games: string[];
  current: Filters;
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-3">
      <select name="game" defaultValue={current.game ?? "all"} className="rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none">
        <option value="all">Todos os jogos</option>
        {games.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <select name="source" defaultValue={current.source ?? "all"} className="rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none">
        <option value="all">Todas as fontes</option>
        {sources.map((s) => <option key={s} value={s}>{SOURCE_META[s]?.label ?? s}</option>)}
      </select>
      <select name="archetype" defaultValue={current.archetype ?? "all"} className="rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none">
        <option value="all">Todos os arquetipos</option>
        {archetypes.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <button type="submit" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
        Filtrar
      </button>
      <Link href="/admin/evidences" className="text-xs text-muted-foreground hover:text-foreground">
        Limpar
      </Link>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EvidencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminCookie();
  const sp = await searchParams;
  const filters: Filters = { source: sp.source, archetype: sp.archetype, game: sp.game };

  const [rows, options] = await Promise.all([
    getPendingEvidences(filters).catch(() => [] as EvidenceRow[]),
    getFilterOptions().catch(() => ({ sources: [], archetypes: [], games: [] })),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Admin
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold text-foreground">Curadoria de evidências</h1>
        <span className="ml-auto rounded-full bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {rows.length} pendente{rows.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
        <div className="mb-6">
          <Suspense fallback={null}>
            <FiltersBar
              sources={options.sources}
              archetypes={options.archetypes}
              games={options.games}
              current={filters}
            />
          </Suspense>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                {["Arquetipo", "Fonte", "Evento", "Sample", "WR", "Idade", "Status", "Ações"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Nenhuma evidência pendente.
                  </td>
                </tr>
              ) : (
                rows.map((ev) => (
                  <tr key={ev.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-medium text-foreground/80">{ev.archetype_id}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <SourceBadge sourceId={ev.source_id} />
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <span className="block truncate text-xs text-muted-foreground" title={ev.event_label}>
                        {ev.event_label}
                      </span>
                      {ev.url && (
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary/60 hover:text-primary"
                        >
                          ver fonte ↗
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {ev.sample_size ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {ev.win_rate != null ? `${Number(ev.win_rate).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtAge(ev.imported_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <VerifiedBadge verified={false} />
                    </td>
                    <td className="px-3 py-2.5">
                      <VerifyRejectButtons
                        evidenceId={ev.id}
                        initialUrl={ev.url ?? ""}
                      />
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
