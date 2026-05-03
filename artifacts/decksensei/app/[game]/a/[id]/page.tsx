import { db, analysesTable, gamesTable, isNull, eq, and } from "@workspace/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AnalysisResult from "../../_components/AnalysisResult";

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

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function getAnalysis(id: string, gameId: string) {
  const [row] = await db
    .select({
      id: analysesTable.id,
      analysisText: analysesTable.analysisText,
      gameId: analysesTable.gameId,
      deckName: analysesTable.deckName,
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

  const description = plainText(analysis.analysisText);
  const title = analysis.deckName
    ? `${analysis.deckName} — Análise ${analysis.gameName} · Deck Sensei`
    : `Análise de deck ${analysis.gameName} — Deck Sensei`;
  const url = `https://decksensei.com.br/${game}/a/${id}`;

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
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: { canonical: url },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharedAnalysisPage({ params }: PageParams) {
  const { game, id } = await params;
  const analysis = await getAnalysis(id, game);

  if (!analysis) notFound();

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
      </header>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-3">
          <p className="hidden flex-1 text-sm text-muted-foreground sm:block">
            Quer analisar o seu próprio deck?
          </p>
          <a
            href={`/${game}`}
            className="ml-auto inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Analisar meu deck grátis →
          </a>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="mx-auto max-w-2xl px-6 py-12 pb-28">
        {/* Título do deck + badge read-only */}
        <div className="mb-6 flex flex-col gap-2">
          {analysis.deckName && (
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {analysis.deckName}
            </h1>
          )}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
              Análise compartilhada · somente leitura
            </span>
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
