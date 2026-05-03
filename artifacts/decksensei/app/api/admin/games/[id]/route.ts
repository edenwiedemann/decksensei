export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

interface UpdateBody {
  name?: string;
  config?: Record<string, unknown>;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { name, config } = body;

  if (!name?.trim()) {
    return Response.json({ error: "name é obrigatório." }, { status: 400 });
  }
  if (!config || typeof config !== "object") {
    return Response.json({ error: "config é obrigatório." }, { status: 400 });
  }
  if (!config.parser) {
    return Response.json({ error: "config.parser é obrigatório." }, { status: 400 });
  }
  if (!config.card_api) {
    return Response.json({ error: "config.card_api é obrigatório." }, { status: 400 });
  }
  if (!config.validator) {
    return Response.json({ error: "config.validator é obrigatório." }, { status: 400 });
  }

  const fullConfig = { id, name: name.trim(), ...config };

  const r = await pool.query(
    `UPDATE games SET name = $1, config = $2::jsonb WHERE id = $3`,
    [name.trim(), JSON.stringify(fullConfig), id],
  );

  if (r.rowCount === 0) {
    return Response.json({ error: "Jogo não encontrado." }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  const r = await pool.query(`DELETE FROM games WHERE id = $1`, [id]);

  if (r.rowCount === 0) {
    return Response.json({ error: "Jogo não encontrado." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
