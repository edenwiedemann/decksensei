export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

interface RollbackBody {
  toId: number;
  toVersion: string;
  fromVersion: string;
  gameId: string;
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: RollbackBody;
  try {
    body = (await req.json()) as RollbackBody;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { toId, toVersion, fromVersion, gameId } = body;

  if (!toId || !toVersion || !fromVersion || !gameId) {
    return Response.json({ error: "Campos obrigatórios ausentes." }, { status: 400 });
  }

  // Verifica que o prompt destino existe e pertence ao jogo
  const check = await pool.query<{ id: number }>(
    "SELECT id FROM prompts WHERE id = $1 AND game_id = $2 LIMIT 1",
    [toId, gameId],
  );
  if (!check.rows[0]) {
    return Response.json({ error: "Prompt não encontrado." }, { status: 404 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Desativa todos do jogo
    await client.query(
      "UPDATE prompts SET active = false WHERE game_id = $1",
      [gameId],
    );

    // Ativa o alvo
    await client.query(
      `UPDATE prompts
       SET active = true,
           activated_at = NOW(),
           activated_by = 'admin'
       WHERE id = $1`,
      [toId],
    );

    // Loga rollback em audit_log
    await client.query(
      `INSERT INTO audit_log (action, metadata)
       VALUES ('prompt.rollback', $1)`,
      [JSON.stringify({ game_id: gameId, from: fromVersion, to: toVersion })],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[prompts/rollback] transação falhou:", err);
    return Response.json({ error: "Erro ao fazer rollback." }, { status: 500 });
  } finally {
    client.release();
  }

  return Response.json({ ok: true });
}
