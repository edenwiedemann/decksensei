import { db, analysesTable, gamesTable, eq, and, isNull } from "@workspace/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import MarkFeaturedForm from "./_components/MarkFeaturedForm";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function AdminAnalysisDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, { token }] = await Promise.all([params, searchParams]);

  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || token !== adminToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-destructive">Acesso negado.</p>
      </div>
    );
  }

  const [analysis] = await db
    .select({
      id: analysesTable.id,
      gameId: analysesTable.gameId,
      gameName: gamesTable.name,
      analysisText: analysesTable.analysisText,
      isFeatured: analysesTable.isFeatured,
      adminNote: analysesTable.adminNote,
      createdAt: analysesTable.createdAt,
      responseTimeMs: analysesTable.responseTimeMs,
    })
    .from(analysesTable)
    .innerJoin(gamesTable, eq(gamesTable.id, analysesTable.gameId))
    .where(
      and(
        eq(analysesTable.id, id),
        isNull(analysesTable.deletedAt),
      ),
    )
    .limit(1);

  if (!analysis) notFound();

  const date = new Date(analysis.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href={`/admin/analyses?token=${token}`} className="hover:text-foreground transition-colors">
            Análises
          </Link>
          <span>/</span>
          <span className="font-mono">{analysis.id}</span>
        </div>

        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {analysis.gameName}
              </span>
              {analysis.isFeatured && (
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                  ★ exemplo atual{analysis.adminNote && ` — ${analysis.adminNote}`}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{date}</p>
            {analysis.responseTimeMs && (
              <p className="text-xs text-muted-foreground">
                {(analysis.responseTimeMs / 1000).toFixed(1)}s de resposta
              </p>
            )}
          </div>

          {/* Formulário para marcar como featured */}
          <MarkFeaturedForm
            gameId={analysis.gameId}
            analysisId={analysis.id}
            currentPlayerName={analysis.adminNote ?? ""}
            isFeatured={analysis.isFeatured}
            token={token ?? ""}
          />
        </div>

        {/* Texto da análise */}
        <div className="rounded-xl border border-border/40 bg-card/60 p-6">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
            {analysis.analysisText}
          </pre>
        </div>
      </div>
    </div>
  );
}
