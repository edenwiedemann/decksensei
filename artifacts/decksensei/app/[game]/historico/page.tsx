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

interface PageParams {
  params: Promise<{ game: string }>;
}

function excerpt(md: string, maxLen = 120): string {
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

function computeGradeFromText(text: string): "A" | "B" | "C" | "D" | null {
  const m = text.match(/similaridade aproximada\s*\*\*(\d+)%/);
  if (!m) return null;
  const pct = parseInt(m[1], 10);
  return pct >= 80 ? "A" : pct >= 65 ? "B" : pct >= 50 ? "C" : "D";
}

const GRADE_COLORS = {
  A: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  B: "text-sky-400 bg-sky-400/10 border-sky-400/30",
  C: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  D: "text-rose-400 bg-rose-400/10 border-rose-400/30",
} as const;

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
      .limit(20),
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

        {analyses.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card/60 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Você ainda não fez nenhuma análise com essa conta.
            </p>
            <a
              href={`/${game}`}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Analisar deck
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {analyses.map((a) => {
              const date = a.createdAt.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });
              const grade = computeGradeFromText(a.analysisText);
              return (
                <a
                  key={a.id}
                  href={`/${game}/a/${a.id}`}
                  className="group block rounded-xl border border-border/40 bg-card/60 px-5 py-4 transition-colors hover:border-primary/30 hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {a.similarArchetypeId && (
                        <span className="mb-1.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/80 ring-1 ring-inset ring-primary/20">
                          {a.similarArchetypeId}
                        </span>
                      )}
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {a.deckName ?? "Deck sem nome"}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground/70 line-clamp-1">
                        {excerpt(a.analysisText, 80)}…
                      </p>
                    </div>
                    <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                      <span className="text-xs text-muted-foreground/60">
                        {date}
                      </span>
                      {grade && (
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded border text-sm font-black tabular-nums ${GRADE_COLORS[grade]}`}
                        >
                          {grade}
                        </span>
                      )}
                      <div className="text-xs text-primary/60 opacity-0 transition-opacity group-hover:opacity-100">
                        Ver →
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

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
