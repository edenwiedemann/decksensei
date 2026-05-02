export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

type Params = { params: Promise<{ id: string; archIdx: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id, archIdx } = await params;
  const numericId  = parseInt(id, 10);
  const numericIdx = parseInt(archIdx, 10);
  if (isNaN(numericId) || isNaN(numericIdx)) {
    return Response.json({ error: "ID ou índice inválido." }, { status: 400 });
  }

  const r = await pool.query<{ json_content: unknown }>(
    "SELECT json_content FROM meta_snapshots WHERE id = $1 LIMIT 1",
    [numericId],
  );
  if (!r.rows[0]) {
    return Response.json({ error: "Snapshot não encontrada." }, { status: 404 });
  }

  const content = r.rows[0].json_content as { archetypes?: Record<string, unknown>[] };
  const archetypes = [...(content.archetypes ?? [])];

  if (numericIdx < 0 || numericIdx >= archetypes.length) {
    return Response.json({ error: "Índice fora do intervalo." }, { status: 400 });
  }

  const original = archetypes[numericIdx];
  const copy: Record<string, unknown> = {
    ...original,
    id:      `${String(original.id ?? "arch")}-copy-${Date.now()}`,
    name:    `${String(original.name ?? "")} (copia)`,
    name_pt: original.name_pt ? `${String(original.name_pt)} (copia)` : undefined,
  };

  archetypes.push(copy);
  const newIdx = archetypes.length - 1;
  const updated = { ...content, archetypes };

  await pool.query(
    "UPDATE meta_snapshots SET json_content = $1 WHERE id = $2",
    [JSON.stringify(updated), numericId],
  );

  return Response.json({ ok: true, archIdx: newIdx });
}
