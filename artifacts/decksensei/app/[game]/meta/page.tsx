import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { pool } from "@workspace/db";
import type { Metadata } from "next";
import type { MetaArchetype } from "@/lib/analysis-prompt";

interface PageParams {
  params: Promise<{ game: string }>;
}

interface SnapRow {
  game_id: string;
  version: string;
  created_at: string;
  json_content: { archetypes?: MetaArchetype[]; tier_legend_pt?: Record<string, string> };
}

interface GameRow {
  name: string;
}

async function fetchData(game: string) {
  const [snapResult, gameResult] = await Promise.all([
    pool.query<SnapRow>(
      `SELECT game_id, version, created_at::text, json_content
       FROM meta_snapshots
       WHERE game_id = $1 AND active = true AND scope = 'global'
       LIMIT 1`,
      [game],
    ),
    pool.query<GameRow>(
      `SELECT name FROM games WHERE id = $1 LIMIT 1`,
      [game],
    ),
  ]);
  return { snap: snapResult.rows[0] ?? null, gameName: gameResult.rows[0]?.name ?? game };
}

function getData(game: string) {
  return unstable_cache(
    () => fetchData(game),
    [`meta-snapshot-${game}`],
    { revalidate: 600, tags: [`meta-snapshot-${game}`] },
  )();
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { game } = await params;
  const { snap, gameName } = await getData(game);

  if (!snap) {
    return { title: `Meta ${gameName} — Deck Sensei` };
  }

  const archetypes: MetaArchetype[] = snap.json_content?.archetypes ?? [];
  const archetypeCount = archetypes.length;
  const date = new Date(snap.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const title = `Meta ${gameName} · Snapshot ${snap.version} — Deck Sensei`;
  const description = `Tier list atualizada de ${gameName} com ${archetypeCount} arquétipos, win rates e notas do coach. Snapshot ${snap.version} · ${date}.`;
  const url = `https://decksensei.com.br/${game}/meta`;
  const ogImage = `https://decksensei.com.br/opengraph.jpg`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Deck Sensei",
      type: "website",
      locale: "pt_BR",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    alternates: { canonical: url },
  };
}

const TIER_ORDER = ["S", "A", "B", "C", "D"];

const TIER_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  S: { border: "border-purple-400/30", bg: "bg-purple-400/10", text: "text-purple-400" },
  A: { border: "border-emerald-400/30", bg: "bg-emerald-400/10", text: "text-emerald-400" },
  B: { border: "border-sky-400/30", bg: "bg-sky-400/10", text: "text-sky-400" },
  C: { border: "border-amber-400/30", bg: "bg-amber-400/10", text: "text-amber-400" },
  D: { border: "border-rose-400/30", bg: "bg-rose-400/10", text: "text-rose-400" },
};

const DEFAULT_TIER = { border: "border-border/30", bg: "bg-muted/20", text: "text-muted-foreground" };

const DIGIMON_COLOR_DOT: Record<string, string> = {
  Red: "bg-red-400",
  Blue: "bg-blue-400",
  Yellow: "bg-yellow-400",
  Green: "bg-green-400",
  Black: "bg-zinc-400",
  Purple: "bg-purple-400",
  White: "bg-slate-300",
};

export default async function MetaPage({ params }: PageParams) {
  const { game } = await params;
  const { snap, gameName } = await getData(game);
  if (!snap) notFound();

  const archetypes: MetaArchetype[] = snap.json_content?.archetypes ?? [];
  const tierLegend = snap.json_content?.tier_legend_pt ?? {};
  const date = new Date(snap.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Group by tier
  const grouped = TIER_ORDER.reduce<Record<string, MetaArchetype[]>>((acc, t) => {
    acc[t] = archetypes.filter((a) => a.tier === t);
    return acc;
  }, {});
  const extraTiers = [...new Set(archetypes.map((a) => a.tier))].filter(
    (t) => !TIER_ORDER.includes(t),
  );
  for (const t of extraTiers) {
    grouped[t] = archetypes.filter((a) => a.tier === t);
  }

  const allTiers = [...TIER_ORDER, ...extraTiers].filter((t) => (grouped[t]?.length ?? 0) > 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-6 py-3 backdrop-blur-sm border-b border-border/40">
        <a href={`/${game}`} className="text-base font-semibold tracking-tight text-foreground hover:text-primary transition-colors">
          Deck Sensei
        </a>
        <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
          {gameName}
        </span>
        <nav className="ml-auto flex items-center gap-4">
          <a href={`/${game}/historico`} className="text-sm text-muted-foreground/50 hover:text-foreground transition-colors">Histórico</a>
          <a href={`/${game}`} className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
            Analisar deck
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 pb-24">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Meta atual</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Snapshot <span className="font-mono text-primary">{snap.version}</span> · atualizado em {date}
          </p>
          {Object.keys(tierLegend).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(tierLegend).map(([tier, desc]) => {
                const s = TIER_STYLES[tier] ?? DEFAULT_TIER;
                return (
                  <span key={tier} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${s.border} ${s.bg} ${s.text}`}>
                    <span className="font-bold">{tier}</span>
                    <span className="text-muted-foreground/70">— {desc}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Tier groups */}
        <div className="flex flex-col gap-8">
          {allTiers.map((tier) => {
            const tiered = grouped[tier] ?? [];
            const s = TIER_STYLES[tier] ?? DEFAULT_TIER;
            return (
              <section key={tier}>
                <div className={`mb-3 flex items-center gap-2`}>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg border text-sm font-black ${s.border} ${s.bg} ${s.text}`}>
                    {tier}
                  </span>
                  {tierLegend[tier] && (
                    <span className="text-xs text-muted-foreground/60">{tierLegend[tier]}</span>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {tiered.map((arch) => (
                    <ArchetypeCard key={arch.id} arch={arch} tier={tier} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-xl border border-border/40 bg-card/60 px-6 py-6 text-center">
          <p className="mb-1 text-base font-semibold text-foreground">Qual é o score do seu deck?</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Compare seu deck com esses arquétipos e receba uma análise completa com sugestões de melhoria.
          </p>
          <a
            href={`/${game}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Analisar meu deck grátis →
          </a>
        </div>
      </main>
    </div>
  );
}

function ArchetypeCard({ arch, tier }: { arch: MetaArchetype; tier: string }) {
  const s = TIER_STYLES[tier] ?? DEFAULT_TIER;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Name + colors */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{arch.name_pt}</h3>
            <div className="flex items-center gap-1">
              {arch.colors.map((c) => (
                <span
                  key={c}
                  className={`h-2.5 w-2.5 rounded-full ${DIGIMON_COLOR_DOT[c] ?? "bg-primary"}`}
                  title={c}
                />
              ))}
            </div>
          </div>
          {/* Play style */}
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {arch.play_style_pt}
          </p>
          {/* Key cards */}
          {arch.key_cards?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {arch.key_cards.slice(0, 5).map((kc) => (
                <span key={kc.code} className="rounded bg-border/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
                  {kc.code}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded border text-xs font-black ${s.border} ${s.bg} ${s.text}`}>
            {tier}
          </span>
          {arch.win_rate_pct > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground/60">
              {arch.win_rate_pct}% WR
            </span>
          )}
          {arch.meta_share_pct > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground/40">
              {arch.meta_share_pct}% meta
            </span>
          )}
        </div>
      </div>

      {/* Coach notes */}
      {arch.coach_notes_pt && (
        <p className="mt-3 border-t border-border/30 pt-3 text-xs leading-relaxed text-muted-foreground/70 italic">
          {arch.coach_notes_pt}
        </p>
      )}
    </div>
  );
}
