export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool, db, promptsTable, eq, and } from "@workspace/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return Response.json({ error: "ID inválido." }, { status: 400 });
  }

  // Verifica que o prompt existe
  const existing = await db
    .select({ id: promptsTable.id, gameId: promptsTable.gameId })
    .from(promptsTable)
    .where(eq(promptsTable.id, numericId))
    .limit(1);

  if (existing.length === 0) {
    return Response.json({ error: "Prompt não encontrado." }, { status: 404 });
  }

  const gameId = existing[0].gameId;

  // Transação: desativa todos do jogo → ativa o selecionado
  await pool.query("BEGIN");
  try {
    await pool.query(
      "UPDATE prompts SET active = false WHERE game_id = $1",
      [gameId],
    );
    await pool.query(
      `UPDATE prompts
       SET active = true,
           activated_at = NOW(),
           activated_by = 'admin'
       WHERE id = $1`,
      [numericId],
    );
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("[prompts/activate] transação falhou:", err);
    return Response.json({ error: "Erro ao ativar prompt." }, { status: 500 });
  }

  return Response.json({ ok: true, activatedId: numericId });
}
