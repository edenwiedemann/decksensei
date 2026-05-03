export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

interface RollbackBody {
  toId: number;
  toVersion: string;
  fromVersion: string;
  gameId: string;
  scope?: string;
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

  const { toId, toVersion, fromVersion, gameId, scope = "global" } = body;

  if (!toId || !toVersion || !fromVersion || !gameId) {
    return Response.json({ error: "Campos obrigatórios ausentes." }, { status: 400 });
  }

  // Verifica que a snapshot existe e pertence ao jogo/scope
  const check = await pool.query<{ id: number }>(
    "SELECT id FROM meta_snapshots WHERE id = $1 AND game_id = $2 AND scope = $3 LIMIT 1",
    [toId, gameId, scope],
  );
  if (!check.rows[0]) {
    return Response.json({ error: "Snapshot não encontrada." }, { status: 404 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Desativa todas do mesmo jogo+scope
    await client.query(
      "UPDATE meta_snapshots SET active = false WHERE game_id = $1 AND scope = $2",
      [gameId, scope],
    );

    // Ativa a alvo
    await client.query(
      "UPDATE meta_snapshots SET active = true WHERE id = $1",
      [toId],
    );

    // Loga rollback em audit_log
    await client.query(
      `INSERT INTO audit_log (action, metadata)
       VALUES ('snapshot.rollback', $1)`,
      [JSON.stringify({ game_id: gameId, scope, from: fromVersion, to: toVersion })],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[snapshots/rollback] transação falhou:", err);
    return Response.json({ error: "Erro ao fazer rollback." }, { status: 500 });
  } finally {
    client.release();
  }

  return Response.json({ ok: true });
}
