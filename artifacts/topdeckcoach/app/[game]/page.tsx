import { db, analysesTable, gamesTable, eq, and, isNull } from "@workspace/db";
import { notFound } from "next/navigation";
import DeckInput from "./_components/DeckInput";
import type { GameConfig } from "@/lib/game-config";

interface GamePageProps {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ resume?: string }>;
}

const DECK_PLACEHOLDERS: Record<string, string> = {
  digimon: `Cole sua decklist aqui (formato Digimon padrão: 4 BT13-040 Magnamon)

Exemplo:
4 BT13-040 Magnamon
4 BT20-083 Omekamon
4 BT13-087 Dynasmon
3 BT13-019 Gankoomon
4 BT20-102 Omnimon (X Antibody)
...

Egg deck:
4 BT13-007 King Drasil_7D6`,
};

const GAME_BADGE_LABELS: Record<string, string> = {
  digimon: "Digimon",
};

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const { game } = await params;
  const { resume } = await searchParams;
  const autoResume = resume === "true";

  const [gameResults, featuredResults] = await Promise.all([
    db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.id, game))
      .limit(1),
    db
      .select({
        analysisText: analysesTable.analysisText,
        featuredPlayerName: analysesTable.featuredPlayerName,
      })
      .from(analysesTable)
      .where(
        and(
          eq(analysesTable.gameId, game),
          eq(analysesTable.isFeatured, true),
          isNull(analysesTable.deletedAt),
        ),
      )
      .limit(1),
  ]);

  const gameData = gameResults[0];
  if (!gameData) notFound();

  const featured = featuredResults[0] ?? null;

  const placeholder = DECK_PLACEHOLDERS[game] ?? "Cole sua decklist aqui...";
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
      <section className="mx-auto max-w-2xl px-6 pb-24">
        <div className="rounded-xl border border-border/60 bg-card/60 p-6 shadow-xl backdrop-blur-sm">
          <DeckInput
            placeholder={placeholder}
            gameConfig={gameConfig}
            featuredAnalysis={featuredAnalysis}
            autoResume={autoResume}
          />
        </div>
      </section>
    </div>
  );
}
