export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";
import { toDbArchetype, BLANK_ARCHETYPE } from "@/app/admin/meta/_lib/types";

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

  // Aceita um arquetipo no body ou cria um em branco
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as typeof body; } catch { /* blank */ }

  const newArch = toDbArchetype({
    ...BLANK_ARCHETYPE,
    id: `arch-${Date.now()}`,
    ...(body as object),
  });

  const r = await pool.query<{ json_content: unknown }>(
    "SELECT json_content FROM meta_snapshots WHERE id = $1 LIMIT 1",
    [numericId],
  );
  if (!r.rows[0]) {
    return Response.json({ error: "Snapshot não encontrada." }, { status: 404 });
  }

  const content = r.rows[0].json_content as { archetypes?: unknown[] };
  const archetypes = content.archetypes ?? [];
  const newIdx = archetypes.length;
  const updated = { ...content, archetypes: [...archetypes, newArch] };

  await pool.query(
    "UPDATE meta_snapshots SET json_content = $1 WHERE id = $2",
    [JSON.stringify(updated), numericId],
  );

  return Response.json({ ok: true, archIdx: newIdx });
}
