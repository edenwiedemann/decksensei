import { db, analysesTable, gamesTable, metaSnapshotsTable, isNull, eq, and } from "@workspace/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import AnalysisResult from "../../_components/AnalysisResult";
import MetaOutdatedBanner from "../../_components/MetaOutdatedBanner";
import { computeDeckGrade } from "@/lib/deck-score";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import DeckNameEditor from "./_components/DeckNameEditor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Remove markdown para gerar descrição limpa para OG. */
function plainText(md: string, maxLen = 160): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/##?\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Extrai o nome do arquétipo mais próximo do texto da análise. */
function extractArchetype(text: string): string | null {
  const m = text.match(/Arquetipo mais pr[oó]ximo:\s*\*\*([^*]+)\*\*/);
  return m ? m[1].trim() : null;
}

/** Extrai o texto da seção Visão geral para usar como descrição OG. */
function extractOverview(text: string): string | null {
  const m = text.match(/## Visão geral\n([\s\S]*?)(?=\n## |$)/);
  return m ? plainText(m[1]) : null;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function getAnalysis(id: string, gameId: string) {
  const [row] = await db
    .select({
      id: analysesTable.id,
      analysisText: analysesTable.analysisText,
      gameId: analysesTable.gameId,
      userId: analysesTable.userId,
      deckName: analysesTable.deckName,
      deckText: analysesTable.deckText,
      similarArchetypeId: analysesTable.similarArchetypeId,
      metaSnapshotId: analysesTable.metaSnapshotId,
      createdAt: analysesTable.createdAt,
      gameName: gamesTable.name,
    })
    .from(analysesTable)
    .innerJoin(gamesTable, eq(gamesTable.id, analysesTable.gameId))
    .where(
      and(
        eq(analysesTable.id, id),
        eq(analysesTable.gameId, gameId),
        isNull(analysesTable.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function getActiveSnapshotId(gameId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: metaSnapshotsTable.id })
    .from(metaSnapshotsTable)
    .where(
      and(
        eq(metaSnapshotsTable.gameId, gameId),
        eq(metaSnapshotsTable.active, true),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

// ─── Metadata / Open Graph ────────────────────────────────────────────────────

interface PageParams {
  params: Promise<{ game: string; id: string }>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { game, id } = await params;
  const analysis = await getAnalysis(id, game);

  if (!analysis) {
    return { title: "Análise não encontrada — Deck Sensei" };
  }

  const grade = computeDeckGrade(analysis.analysisText);
  const archetype = extractArchetype(analysis.analysisText) ?? analysis.similarArchetypeId ?? null;
  const overview = extractOverview(analysis.analysisText);
  const description = overview ?? plainText(analysis.analysisText);

  const gradePrefix = grade ? `Nota ${grade.grade}` : null;
  const title = analysis.deckName
    ? `${analysis.deckName} — Análise ${analysis.gameName} · Deck Sensei`
    : [gradePrefix, archetype].filter(Boolean).join(" · ")
        ? `${[gradePrefix, archetype].filter(Boolean).join(" · ")} — Deck Sensei`
        : `Análise de deck ${analysis.gameName} — Deck Sensei`;
  const url = `https://decksensei.com.br/${game}/a/${id}`;
  const ogImage = `https://decksensei.com.br/api/og/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Deck Sensei",
      type: "article",
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharedAnalysisPage({ params }: PageParams) {
  const { game, id } = await params;

  const [analysis, activeSnapshotId, cookieStore] = await Promise.all([
    getAnalysis(id, game),
    getActiveSnapshotId(game),
    cookies(),
  ]);

  if (!analysis) notFound();

  const metaOutdated =
    activeSnapshotId !== null && analysis.metaSnapshotId !== activeSnapshotId;

  const grade = computeDeckGrade(analysis.analysisText);

  // Check ownership for inline edit
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  const sessionUser = sessionToken ? await getSessionUser(sessionToken) : null;
  const isOwner = !!sessionUser && analysis.userId === sessionUser.id;

  // Fallback title for the DeckNameEditor (shown when no deck name set)
  const fallbackTitle = analysis.similarArchetypeId
    ? `${analysis.similarArchetypeId}${grade ? ` — Deck ${grade.grade}` : ""}`
    : grade
      ? `Deck ${grade.grade} — ${analysis.gameName}`
      : `Análise de ${analysis.gameName}`;

  const date = analysis.createdAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-6 py-3 backdrop-blur-sm border-b border-border/40">
        <img src="/logo.png" alt="" className="h-8 w-auto" style={{ mixBlendMode: "screen" }} />
        <a
          href={`/${game}`}
          className="text-base font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
        >
          Deck Sensei
        </a>
        <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
          {analysis.gameName}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{date}</span>
        {isOwner && (
          <form action="/api/auth/session" method="post">
            <input type="hidden" name="_method" value="DELETE" />
            <input type="hidden" name="game" value={game} />
            <button
              type="submit"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Sair
            </button>
          </form>
        )}
      </header>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-primary/20 bg-gradient-to-r from-background/98 via-background/98 to-primary/5 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-3.5">
          <div className="hidden flex-1 flex-col sm:flex">
            <p className="text-sm font-medium text-foreground/90">
              {grade
                ? `Seu deck pode alcançar nota ${grade.grade}?`
                : "Quer analisar o seu próprio deck?"}
            </p>
            <p className="text-xs text-muted-foreground/60">Análise gratuita em 30 segundos</p>
          </div>
          <a
            href={`/${game}`}
            className="ml-auto inline-flex h-11 items-center justify-center rounded-lg bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/50 transition-all hover:bg-primary/90 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.99]"
          >
            Analisar meu deck grátis →
          </a>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="mx-auto max-w-2xl px-6 py-12 pb-28">
        {/* Banner de meta desatualizado */}
        {metaOutdated && (
          <MetaOutdatedBanner deckText={analysis.deckText} gameId={game} />
        )}

        {/* Título do deck */}
        <div className="mb-6 flex flex-col gap-2">
          {isOwner ? (
            <DeckNameEditor
              analysisId={analysis.id}
              initialName={analysis.deckName ?? null}
              fallbackTitle={fallbackTitle}
            />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {analysis.deckName
                ? `${analysis.deckName} — Análise`
                : fallbackTitle}
            </h1>
          )}
          <div className="flex items-center gap-2">
            {isOwner ? (
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                Sua análise · clique no lápis para renomear
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                Análise compartilhada · somente leitura
              </span>
            )}
          </div>
        </div>

        {/* Análise completa em modo estático (streaming=false, colorMap={}) */}
        <AnalysisResult
          text={analysis.analysisText}
          streaming={false}
          colorMap={{}}
        />

        {/* CTA no rodapé */}
        <div className="mt-10 rounded-xl border border-border/40 bg-card/60 px-6 py-5 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Quer analisar o seu próprio deck?
          </p>
          <a
            href={`/${game}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Analisar deck grátis
          </a>
        </div>
      </main>
    </div>
  );
}
