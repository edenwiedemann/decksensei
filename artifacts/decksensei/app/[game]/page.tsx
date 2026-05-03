import { unstable_cache } from "next/cache";
import {
  db,
  analysesTable,
  gamesTable,
  metaSnapshotsTable,
  eq,
  and,
  isNull,
} from "@workspace/db";
import { notFound } from "next/navigation";
import DeckInput from "./_components/DeckInput";
import type { GameConfig } from "@/lib/game-config";

interface GamePageProps {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ resume?: string }>;
}

// Cache da análise em destaque por jogo — revalida a cada 5 min ou por tag
const getCachedFeaturedAnalysis = unstable_cache(
  async (gameId: string) => {
    const results = await db
      .select({
        analysisText: analysesTable.analysisText,
        featuredPlayerName: analysesTable.featuredPlayerName,
      })
      .from(analysesTable)
      .where(
        and(
          eq(analysesTable.gameId, gameId),
          eq(analysesTable.isFeatured, true),
          isNull(analysesTable.deletedAt),
        ),
      )
      .limit(1);
    return results[0] ?? null;
  },
  ["featured-analysis"],
  { revalidate: 300, tags: ["featured-analysis"] },
);

const DECK_PLACEHOLDERS: Record<string, string> = {
  digimon: `Cole sua decklist aqui (formato Digimon padrão: 4 BT13-040 Magnamon)...`,
};

// Deck de exemplo pré-preenchido — editável, mostra o formato correto no primeiro acesso
const SAMPLE_DECKS: Record<string, string> = {
  digimon: `4 BT21-001 Agumon (2006)
4 BT21-002 Greymon (2006)
4 BT21-003 MetalGreymon (2006)
4 BT21-004 WarGreymon (2006)
3 BT21-009 ShineGreymon
3 BT21-010 ShineGreymon Burst Mode
4 BT20-007 Agumon -Yuki no Kizuna-
3 BT13-009 Agumon (Digimon Adventure:)
4 BT21-106 Taichi Yagami
4 BT21-107 Sora Takenouchi & Yamato Ishida
3 BT16-089 Taichi Yagami & Yamato Ishida
4 BT21-097 Booster Capsule (Orange)
4 BT13-093 Taichi Yagami & Agumon
2 BT21-098 Crest of Courage

Egg deck:
4 BT21-005 Koromon
4 BT21-006 Botamon`,
};

const GAME_BADGE_LABELS: Record<string, string> = {
  digimon: "Digimon",
};

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const { game } = await params;
  const { resume } = await searchParams;
  const autoResume = resume === "true";

  const [gameResults, featured, metaSnapshotRows] = await Promise.all([
    db.select().from(gamesTable).where(eq(gamesTable.id, game)).limit(1),
    getCachedFeaturedAnalysis(game),
    db
      .select({ createdAt: metaSnapshotsTable.createdAt })
      .from(metaSnapshotsTable)
      .where(and(eq(metaSnapshotsTable.gameId, game), eq(metaSnapshotsTable.active, true)))
      .limit(1),
  ]);

  const gameData = gameResults[0];
  if (!gameData) notFound();

  // Dias desde o último snapshot de meta ativo (para badge de aviso)
  const metaSnapshotAgeDays = metaSnapshotRows[0]?.createdAt
    ? Math.floor((Date.now() - metaSnapshotRows[0].createdAt.getTime()) / 86_400_000)
    : undefined;

  const placeholder = DECK_PLACEHOLDERS[game] ?? "Cole sua decklist aqui...";
  const defaultDeck = SAMPLE_DECKS[game];
  const badgeLabel = GAME_BADGE_LABELS[game] ?? gameData.name;

  const gameConfig: GameConfig =
    typeof gameData.config === "string"
      ? JSON.parse(gameData.config)
      : (gameData.config as GameConfig);

  const featuredAnalysis = featured
    ? { text: featured.analysisText, playerName: featured.featuredPlayerName ?? "jogador" }
    : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-6 py-3 backdrop-blur-sm border-b border-border/40">
        <img
          src="/logo.png"
          alt=""
          className="h-8 w-auto"
          style={{ mixBlendMode: "screen" }}
        />
        <span className="text-base font-semibold tracking-tight text-foreground">
          Deck Sensei
        </span>
        <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
          {badgeLabel}
        </span>
      </header>

      {/* Hero — 60vh */}
      <section className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          {/* Logo */}
          <img
            src="/logo.png"
            alt="Deck Sensei"
            className="mx-auto mb-6 h-52 w-auto"
            style={{ mixBlendMode: "screen" }}
          />

          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Seu deck de{" "}
            <span className="text-primary">{gameData.name}</span>,
            <br className="hidden sm:block" /> analisado por IA
          </h1>

          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg sm:leading-relaxed max-w-2xl mx-auto">
            Cole sua decklist e receba em 30 segundos uma análise estratégica
            completa: plano de jogo, pontos fortes, vulnerabilidades e sugestões
            de troca baseadas no meta atual.
          </p>
        </div>
      </section>

      {/* Form section */}
      <section className="mx-auto max-w-2xl px-6 pb-16">
        <div className="rounded-xl border border-border/60 bg-card/60 p-6 shadow-xl backdrop-blur-sm">
          <DeckInput
            placeholder={placeholder}
            gameConfig={gameConfig}
            featuredAnalysis={featuredAnalysis}
            autoResume={autoResume}
            defaultDeck={defaultDeck}
            metaSnapshotAgeDays={metaSnapshotAgeDays}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/20 px-6 py-6 text-center">
        <p className="text-xs text-muted-foreground/40">
          Deck Sensei · feito com carinho em Recife
          <span className="mx-2">·</span>
          <a href="/sobre" className="hover:text-muted-foreground transition-colors">
            Sobre
          </a>
        </p>
      </footer>
    </div>
  );
}
