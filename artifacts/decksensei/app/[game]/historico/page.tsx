import { Suspense } from "react";
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
  lt,
  sql,
} from "@workspace/db";
import HistoricoList from "./HistoricoList";
import type { DeckGrade } from "@/lib/deck-score";

const PAGE_SIZE = 20;

const GRADE_REGEX: Record<DeckGrade, string> = {
  A: String.raw`similaridade aproximada\s*\*\*(8[0-9]|9[0-9]|100)%`,
  B: String.raw`similaridade aproximada\s*\*\*(6[5-9]|7[0-9])%`,
  C: String.raw`similaridade aproximada\s*\*\*(5[0-9]|6[0-4])%`,
  D: String.raw`similaridade aproximada\s*\*\*([0-9]|[1-4][0-9])%`,
};

const VALID_GRADES = new Set<string>(["A", "B", "C", "D"]);

interface PageParams {
  params: Promise<{ game: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HistoricoPage({ params, searchParams }: PageParams) {
  const { game } = await params;
  const { grade: gradeParam } = await searchParams;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return <LoginPrompt game={game} />;
  }

  const user = await getSessionUser(sessionToken);
  if (!user) {
    return <LoginPrompt game={game} />;
  }

  const grade: DeckGrade | null =
    typeof gradeParam === "string" && VALID_GRADES.has(gradeParam)
      ? (gradeParam as DeckGrade)
      : null;

  const [gameRow, rows] = await Promise.all([
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
          grade
            ? sql`${analysesTable.analysisText} ~ ${GRADE_REGEX[grade]}`
            : undefined,
        ),
      )
      .orderBy(desc(analysesTable.createdAt))
      .limit(PAGE_SIZE + 1),
  ]);

  if (!gameRow) notFound();

  const hasMore = rows.length > PAGE_SIZE;
  const initialItems = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const initialNextCursor = hasMore
    ? initialItems[initialItems.length - 1]!.createdAt.toISOString()
    : null;

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
          <h1 className="text-xl font-bold text-foreground">Suas análises</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {grade
              ? `Filtrando por nota ${grade}`
              : "Todas as suas análises salvas"}
          </p>
        </div>

        <Suspense fallback={null}>
          <HistoricoList
            initialItems={initialItems}
            initialNextCursor={initialNextCursor}
            initialGrade={grade}
            game={game}
          />
        </Suspense>

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
