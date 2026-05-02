import Link from "next/link";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import PromptEditor from "../_components/PromptEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getNextSuggestedVersion(gameId: string): Promise<string> {
  const r = await pool.query<{ version: string }>(
    `SELECT version FROM prompts WHERE game_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [gameId],
  );
  const last = r.rows[0]?.version;
  if (!last) return "v2";
  const match = last.match(/v(\d+)$/);
  if (match) return `v${parseInt(match[1], 10) + 1}`;
  return `${last}-2`;
}

export default async function NewPromptPage() {
  requireAdminCookie();

  const gameId = "digimon";
  const suggestedVersion = await getNextSuggestedVersion(gameId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link
          href="/admin/prompts"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Prompts
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold text-foreground">
          Nova versão de prompt
        </h1>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <PromptEditor
          gameId={gameId}
          suggestedVersion={suggestedVersion}
          initialContent=""
          initialVersion={suggestedVersion}
          initialNotes=""
        />
      </main>
    </div>
  );
}
