export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

interface CreateBody {
  gameId?: string;
  version?: string;
  notes?: string;
  copyFromId?: number;
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

  const { gameId = "digimon", version, notes, copyFromId } = body;

  if (!version?.trim()) {
    return Response.json({ error: "version é obrigatório." }, { status: 400 });
  }

  let jsonContent: Record<string, unknown>;

  if (copyFromId != null) {
    // Copia json_content da snapshot de origem
    const src = await pool.query<{ json_content: unknown }>(
      "SELECT json_content FROM meta_snapshots WHERE id = $1 LIMIT 1",
      [copyFromId],
    );
    if (!src.rows[0]) {
      return Response.json({ error: "Snapshot de origem não encontrada." }, { status: 404 });
    }
    jsonContent = src.rows[0].json_content as Record<string, unknown>;
  } else {
    // Nova snapshot vazia com estrutura mínima
    jsonContent = {
      format:    "BT21 Standard (EN)",
      snapshot:  { fetched_at: new Date().toISOString(), notes_pt: notes ?? "" },
      archetypes: [],
    };
  }

  const r = await pool.query<{ id: number }>(
    `INSERT INTO meta_snapshots (game_id, version, json_content, notes, scope, active)
     VALUES ($1, $2, $3, $4, 'global', false)
     RETURNING id`,
    [gameId, version.trim(), JSON.stringify(jsonContent), notes?.trim() ?? null],
  );

  return Response.json({ ok: true, id: r.rows[0].id });
}
