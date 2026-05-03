export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

interface CreateBody {
  id?: string;
  name?: string;
  config?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { id, name, config } = body;

  if (!id?.trim()) {
    return Response.json({ error: "id é obrigatório." }, { status: 400 });
  }
  if (!name?.trim()) {
    return Response.json({ error: "name é obrigatório." }, { status: 400 });
  }
  if (!config || typeof config !== "object") {
    return Response.json({ error: "config é obrigatório." }, { status: 400 });
  }

  // Validação mínima dos blocos obrigatórios
  if (!config.parser) {
    return Response.json({ error: "config.parser é obrigatório." }, { status: 400 });
  }
  if (!config.card_api) {
    return Response.json({ error: "config.card_api é obrigatório." }, { status: 400 });
  }
  if (!config.validator) {
    return Response.json({ error: "config.validator é obrigatório." }, { status: 400 });
  }

  const fullConfig = { id: id.trim(), name: name.trim(), ...config };

  try {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO games (id, name, config, created_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       RETURNING id`,
      [id.trim(), name.trim(), JSON.stringify(fullConfig)],
    );
    return Response.json({ ok: true, id: r.rows[0].id });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return Response.json(
        { error: `Jogo com id "${id}" já existe.` },
        { status: 409 },
      );
    }
    console.error("[POST /api/admin/games]", err);
    return Response.json({ error: "Erro ao criar jogo." }, { status: 500 });
  }
}
