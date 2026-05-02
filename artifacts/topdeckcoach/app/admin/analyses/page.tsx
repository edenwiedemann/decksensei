import { db, analysesTable, gamesTable, eq, desc, isNull } from "@workspace/db";
import { notFound } from "next/navigation";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AdminAnalysesPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || token !== adminToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-destructive">Acesso negado. Passe ?token=... na URL.</p>
      </div>
    );
  }

  const analyses = await db
    .select({
      id: analysesTable.id,
      gameId: analysesTable.gameId,
      gameName: gamesTable.name,
      isFeatured: analysesTable.isFeatured,
      adminNote: analysesTable.adminNote,
      createdAt: analysesTable.createdAt,
    })
    .from(analysesTable)
    .innerJoin(gamesTable, eq(gamesTable.id, analysesTable.gameId))
    .where(isNull(analysesTable.deletedAt))
    .orderBy(desc(analysesTable.isFeatured), desc(analysesTable.createdAt))
    .limit(100);

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Análises</h1>
          <span className="text-xs text-muted-foreground">{analyses.length} resultado(s)</span>
        </div>

        <div className="flex flex-col gap-2">
          {analyses.map((a) => (
            <Link
              key={a.id}
              href={`/admin/analyses/${a.id}?token=${token}`}
              className="flex items-center gap-4 rounded-lg border border-border/40 bg-card px-4 py-3 text-sm hover:border-border/70 transition-colors"
            >
              <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: a.isFeatured ? "#34d399" : "#3f3f46" }} />
              <span className="font-mono text-xs text-muted-foreground/70 shrink-0">{a.id}</span>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary shrink-0">
                {a.gameName}
              </span>
              {a.isFeatured && (
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400 shrink-0">
                  ★ exemplo
                  {a.adminNote && ` — ${a.adminNote}`}
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Link>
          ))}

          {analyses.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma análise encontrada.</p>
          )}
        </div>
      </div>
    </div>
  );
}
