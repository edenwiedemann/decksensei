import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import MarkdownViewer from "../_components/MarkdownViewer";
import MarkFeaturedForm from "./_components/MarkFeaturedForm";
import ReplayPanel from "./_components/ReplayPanel";
import SoftDeleteModal from "./_components/SoftDeleteModal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AnalysisDetail {
  id: string;
  game_id: string;
  deck_text: string;
  deck_parsed: Record<string, unknown>;
  analysis_text: string;
  response_time_ms: number | null;
  is_featured: boolean;
  featured_player_name: string | null;
  admin_note: string | null;
  similar_archetype_id: string | null;
  created_at: Date;
  user_email: string | null;
  prompt_version: string | null;
  prompt_system: string | null;
  prompt_id: number | null;
  feedback_rating: string | null;
  feedback_comment: string | null;
  total_tokens: string;
  cost_usd: string;
}

async function getAnalysis(id: string): Promise<AnalysisDetail | null> {
  const res = await pool.query<AnalysisDetail>(
    `SELECT
      a.id,
      a.game_id,
      a.deck_text,
      a.deck_parsed,
      a.analysis_text,
      a.response_time_ms,
      a.is_featured,
      a.featured_player_name,
      a.admin_note,
      a.similar_archetype_id,
      a.created_at,
      u.email AS user_email,
      p.version AS prompt_version,
      p.system_content AS prompt_system,
      p.id AS prompt_id,
      fb.rating AS feedback_rating,
      fb.comment AS feedback_comment,
      COALESCE(SUM(c.input_tokens + c.output_tokens), 0)::text AS total_tokens,
      COALESCE(SUM(c.cost_usd::numeric), 0)::text AS cost_usd
    FROM analyses a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN prompts p ON p.id = a.prompt_version_id
    LEFT JOIN LATERAL (
      SELECT rating, comment FROM analysis_feedback
      WHERE analysis_id = a.id ORDER BY id DESC LIMIT 1
    ) fb ON true
    LEFT JOIN api_costs c ON c.analysis_id = a.id
    WHERE a.id = $1 AND a.deleted_at IS NULL
    GROUP BY a.id, u.email, p.version, p.system_content, p.id, fb.rating, fb.comment`,
    [id],
  );
  return res.rows[0] ?? null;
}

function fmtDateBR(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAnalysisDetailPage({ params }: PageProps) {
  const auth = await requireAdminCookie();
  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-destructive">Acesso negado.</p>
      </div>
    );
  }

  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (!analysis) notFound();

  const tokens = parseInt(analysis.total_tokens, 10);
  const cost = parseFloat(analysis.cost_usd);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Breadcrumb */}
      <header className="flex items-center gap-2 border-b border-border/40 px-6 py-4 text-xs">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
          Admin
        </Link>
        <span className="text-border/60">/</span>
        <Link href="/admin/analyses" className="text-muted-foreground hover:text-foreground transition-colors">
          Análises
        </Link>
        <span className="text-border/60">/</span>
        <span className="font-mono text-muted-foreground/60">{analysis.id}</span>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        {/* Header card */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-6 rounded-xl border border-border/50 bg-card/40 p-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
                {analysis.game_id}
              </span>
              {analysis.is_featured && (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  ★ exemplo home
                </span>
              )}
              {analysis.similar_archetype_id && (
                <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300">
                  {analysis.similar_archetype_id}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{fmtDateBR(analysis.created_at)}</p>

            <dl className="mt-1 grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground/60">Usuário</dt>
                <dd className="text-foreground/80">{analysis.user_email ?? <span className="italic text-muted-foreground/50">anônimo</span>}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground/60">Tempo</dt>
                <dd className="tabular-nums text-foreground/80">
                  {analysis.response_time_ms != null
                    ? `${(analysis.response_time_ms / 1000).toFixed(1)}s`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground/60">Tokens</dt>
                <dd className="tabular-nums text-foreground/80">{tokens.toLocaleString("pt-BR")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground/60">Custo</dt>
                <dd className="tabular-nums text-foreground/80">${cost.toFixed(5)}</dd>
              </div>
            </dl>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-start gap-3">
            <SoftDeleteModal analysisId={analysis.id} />
          </div>
        </div>

        {/* Mark as featured (digimon only per MVP) */}
        {analysis.game_id === "digimon" && (
          <div className="mb-6 rounded-xl border border-border/50 bg-card/40 p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Exemplo na home
            </p>
            <MarkFeaturedForm
              gameId={analysis.game_id}
              analysisId={analysis.id}
              currentFeaturedPlayerName={analysis.featured_player_name ?? ""}
              isFeatured={analysis.is_featured}
            />
          </div>
        )}

        {/* Feedback */}
        {(analysis.feedback_rating != null) && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-5 py-3">
            <span className="text-lg">
              {analysis.feedback_rating === "up" ? "👍" : "👎"}
            </span>
            <div>
              <p className="text-xs font-medium text-foreground/80">
                Feedback {analysis.feedback_rating === "up" ? "positivo" : "negativo"}
              </p>
              {analysis.feedback_comment && (
                <p className="text-xs text-muted-foreground">{analysis.feedback_comment}</p>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Deck text */}
          <section className="rounded-xl border border-border/50 bg-card/40">
            <div className="border-b border-border/30 px-5 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Decklist completa
              </p>
            </div>
            <div className="px-5 py-4">
              <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/75">
                {analysis.deck_text}
              </pre>
            </div>
          </section>

          {/* Prompt used */}
          <section className="rounded-xl border border-border/50 bg-card/40">
            <div className="flex items-center justify-between border-b border-border/30 px-5 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Prompt utilizado
              </p>
              {analysis.prompt_version && (
                <span className="rounded-full bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  v{analysis.prompt_version}
                </span>
              )}
            </div>
            <div className="px-5 py-4">
              {analysis.prompt_system ? (
                <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground/70">
                  {analysis.prompt_system}
                </pre>
              ) : (
                <p className="text-xs italic text-muted-foreground/40">
                  Prompt não encontrado (versão removida).
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Analysis response */}
        <section className="mt-6 rounded-xl border border-border/50 bg-card/40">
          <div className="border-b border-border/30 px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
              Resposta da análise
            </p>
          </div>
          <div className="px-5 py-4">
            <MarkdownViewer content={analysis.analysis_text} />
          </div>
        </section>

        {/* Replay */}
        <section className="mt-6">
          <ReplayPanel
            gameId={analysis.game_id}
            deckParsed={analysis.deck_parsed}
          />
        </section>
      </main>
    </div>
  );
}
