import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import PromptEditor from "../../_components/PromptEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PromptRow {
  id: number;
  game_id: string;
  version: string;
  system_content: string;
  notes: string | null;
  active: boolean;
  activated_at: string | null;
  activated_by: string | null;
  created_at: string;
}

async function getPrompt(id: number): Promise<PromptRow | null> {
  const r = await pool.query<PromptRow>(
    `SELECT id, game_id, version, system_content, notes, active,
            activated_at::text, activated_by, created_at::text
     FROM prompts WHERE id = $1 LIMIT 1`,
    [id],
  );
  return r.rows[0] ?? null;
}

async function getNextSuggestedVersion(gameId: string, currentVersion: string): Promise<string> {
  const r = await pool.query<{ version: string }>(
    `SELECT version FROM prompts WHERE game_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [gameId],
  );
  const last = r.rows[0]?.version ?? currentVersion;
  const match = last.match(/v(\d+)$/);
  if (match) return `v${parseInt(match[1], 10) + 1}`;
  return `${last}-2`;
}

export default async function EditPromptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  requireAdminCookie();

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) notFound();

  const prompt = await getPrompt(numericId);
  if (!prompt) notFound();

  const suggestedVersion = await getNextSuggestedVersion(prompt.game_id, prompt.version);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/prompts"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Prompts
          </Link>
          <span className="text-border/60">·</span>
          <h1 className="text-base font-semibold text-foreground">
            Versão{" "}
            <span className="font-mono text-primary">{prompt.version}</span>
          </h1>
          {prompt.active && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              ● ativa
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground/50">
          Criado em{" "}
          {new Date(prompt.created_at).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          {prompt.activated_by && (
            <span>
              {" "}· ativado por <strong className="text-muted-foreground/80">{prompt.activated_by}</strong>
              {prompt.activated_at && (
                <> em {new Date(prompt.activated_at).toLocaleDateString("pt-BR")}</>
              )}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <PromptEditor
          gameId={prompt.game_id}
          promptId={prompt.id}
          suggestedVersion={suggestedVersion}
          initialContent={prompt.system_content}
          initialVersion={suggestedVersion}
          initialNotes=""
          isCurrentlyActive={prompt.active}
        />
      </main>
    </div>
  );
}
