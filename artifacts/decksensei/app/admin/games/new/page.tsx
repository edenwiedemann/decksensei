export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import Link from "next/link";
import { requireAdminCookie } from "@/lib/auth/admin";
import GameForm from "../_components/GameForm";

export default async function NewGamePage() {
  await requireAdminCookie();

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
          Novo jogo
        </h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <GameForm mode="create" />
      </main>
    </div>
  );
}
