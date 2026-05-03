export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@workspace/db";
import { requireAdminCookie } from "@/lib/auth/admin";
import GameForm from "../../_components/GameForm";

async function getGame(id: string) {
  const r = await pool.query<{ id: string; name: string; config: unknown }>(
    "SELECT id, name, config FROM games WHERE id = $1",
    [id],
  );
  return r.rows[0] ?? null;
}

export default async function EditGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminCookie();
  const { id } = await params;
  const game = await getGame(id);

  if (!game) notFound();

  const configStr =
    typeof game.config === "string"
      ? game.config
      : JSON.stringify(game.config, null, 2);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      <header className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <Link
          href="/admin/games"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Jogos
        </Link>
        <span className="text-border/60">·</span>
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          Editar: {game.name}
        </h1>
        <span className="ml-1 font-mono text-xs text-muted-foreground">
          ({id})
        </span>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <GameForm
          mode="edit"
          initialId={id}
          initialName={game.name}
          initialConfig={configStr}
        />
      </main>
    </div>
  );
}
