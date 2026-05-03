import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import {
  db,
  analysesTable,
  gamesTable,
  eq,
  and,
  isNull,
  desc,
} from "@workspace/db";
import HistoricoList from "./HistoricoList";

interface PageParams {
  params: Promise<{ game: string }>;
}

export default async function HistoricoPage({ params }: PageParams) {
  const { game } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return <LoginPrompt game={game} />;
  }

  const user = await getSessionUser(sessionToken);
  if (!user) {
    return <LoginPrompt game={game} />;
  }

  const [gameRow, analyses] = await Promise.all([
    db
      .select({ name: gamesTable.name })
      .from(gamesTable)
      .where(eq(gamesTable.id, game))
      .limit(1)
      .then((r) => r[0] ?? null),

    db
      .select({
        id: analysesTable.id,
        analysisText: analysesTable.analysisText,
        deckName: analysesTable.deckName,
        createdAt: analysesTable.createdAt,
        similarArchetypeId: analysesTable.similarArchetypeId,
      })
      .from(analysesTable)
      .where(
        and(
          eq(analysesTable.gameId, game),
          eq(analysesTable.userId, user.id),
          isNull(analysesTable.deletedAt),
        ),
      )
      .orderBy(desc(analysesTable.createdAt))
      .limit(200),
  ]);

  if (!gameRow) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="sticky top-0 z-50 flex items-center gap-3 px-6 py-3 backdrop-blur-sm border-b border-border/40">
        <a
          href={`/${game}`}
          className="text-base font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
        >
          Deck Sensei
        </a>
        <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
          {gameRow.name}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {user.email}
        </span>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 pb-24">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-foreground">
            Suas análises
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimas {analyses.length} análise{analyses.length !== 1 ? "s" : ""}{" "}
            salva{analyses.length !== 1 ? "s" : ""}
          </p>
        </div>

        <HistoricoList analyses={analyses} game={game} />

        <div className="mt-8 text-center">
          <a
            href={`/${game}`}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            ← Nova análise
          </a>
        </div>
      </main>
    </div>
  );
}

function LoginPrompt({ game }: { game: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(240,30%,5%)] to-[hsl(240,22%,9%)] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-card px-8 py-10 text-center">
        <h1 className="text-lg font-bold text-foreground">
          Faça login para ver seu histórico
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O histórico de análises fica disponível para usuários cadastrados.
        </p>
        <a
          href={`/${game}`}
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          Ir para o app
        </a>
      </div>
    </div>
  );
}
