export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

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

  const snap = await pool.query<{ game_id: string; scope: string }>(
    "SELECT game_id, scope FROM meta_snapshots WHERE id = $1 LIMIT 1",
    [numericId],
  );
  if (!snap.rows[0]) {
    return Response.json({ error: "Snapshot não encontrada." }, { status: 404 });
  }

  const { game_id, scope } = snap.rows[0];

  await pool.query("BEGIN");
  try {
    await pool.query(
      "UPDATE meta_snapshots SET active = false WHERE game_id = $1 AND scope = $2",
      [game_id, scope],
    );
    await pool.query(
      "UPDATE meta_snapshots SET active = true WHERE id = $1",
      [numericId],
    );
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("[meta/snapshots/activate]", err);
    return Response.json({ error: "Erro ao ativar snapshot." }, { status: 500 });
  }

  return Response.json({ ok: true, activatedId: numericId });
}
