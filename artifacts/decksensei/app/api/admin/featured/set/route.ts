export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { pool, db, analysesTable, eq, and, isNull } from "@workspace/db";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { gameId, analysisId, featuredPlayerName } = body as {
    gameId?: string;
    analysisId?: string;
    featuredPlayerName?: string;
  };

  if (!gameId || !analysisId) {
    return Response.json(
      { error: "gameId e analysisId são obrigatórios." },
      { status: 400 },
    );
  }

  // Valida que a análise existe e não está soft-deleted
  const target = await db
    .select({ id: analysesTable.id })
    .from(analysesTable)
    .where(
      and(
        eq(analysesTable.id, analysisId),
        eq(analysesTable.gameId, gameId),
        isNull(analysesTable.deletedAt),
      ),
    )
    .limit(1);

  if (target.length === 0) {
    return Response.json(
      { error: "Análise não encontrada ou foi removida." },
      { status: 404 },
    );
  }

  const playerName = featuredPlayerName?.trim() || null;

  // Transação atômica: desfeaturar todas → marcar a nova
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE analyses SET is_featured = false WHERE game_id = $1",
      [gameId],
    );
    await client.query(
      `UPDATE analyses
       SET is_featured = true,
           featured_player_name = $1
       WHERE id = $2
         AND game_id = $3
         AND deleted_at IS NULL`,
      [playerName, analysisId, gameId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[featured/set] transação falhou:", err);
    return Response.json({ error: "Erro ao marcar análise como destaque." }, { status: 500 });
  } finally {
    client.release();
  }

  // Invalida cache da featured analysis para esse jogo
  revalidateTag("featured-analysis");
  revalidatePath(`/${gameId}`);

  return Response.json({ ok: true });
}
