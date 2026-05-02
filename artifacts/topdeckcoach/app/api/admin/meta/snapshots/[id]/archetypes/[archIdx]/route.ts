export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";
import type { FormArchetype } from "@/app/admin/meta/_lib/types";
import { toDbArchetype } from "@/app/admin/meta/_lib/types";

type Params = { params: Promise<{ id: string; archIdx: string }> };

async function getSnapshot(numericId: number) {
  const r = await pool.query<{ json_content: unknown }>(
    "SELECT json_content FROM meta_snapshots WHERE id = $1 LIMIT 1",
    [numericId],
  );
  return r.rows[0]?.json_content as { archetypes?: unknown[] } | null;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id, archIdx } = await params;
  const numericId  = parseInt(id, 10);
  const numericIdx = parseInt(archIdx, 10);
  if (isNaN(numericId) || isNaN(numericIdx)) {
    return Response.json({ error: "ID ou índice inválido." }, { status: 400 });
  }

  let body: FormArchetype;
  try {
    body = (await req.json()) as FormArchetype;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const content = await getSnapshot(numericId);
  if (!content) {
    return Response.json({ error: "Snapshot não encontrada." }, { status: 404 });
  }

  const archetypes = [...(content.archetypes ?? [])];
  if (numericIdx < 0 || numericIdx >= archetypes.length) {
    return Response.json({ error: "Índice fora do intervalo." }, { status: 400 });
  }

  archetypes[numericIdx] = toDbArchetype(body);
  const updated = { ...content, archetypes };

  await pool.query(
    "UPDATE meta_snapshots SET json_content = $1 WHERE id = $2",
    [JSON.stringify(updated), numericId],
  );

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id, archIdx } = await params;
  const numericId  = parseInt(id, 10);
  const numericIdx = parseInt(archIdx, 10);
  if (isNaN(numericId) || isNaN(numericIdx)) {
    return Response.json({ error: "ID ou índice inválido." }, { status: 400 });
  }

  const content = await getSnapshot(numericId);
  if (!content) {
    return Response.json({ error: "Snapshot não encontrada." }, { status: 404 });
  }

  const archetypes = (content.archetypes ?? []).filter((_, i) => i !== numericIdx);
  const updated = { ...content, archetypes };

  await pool.query(
    "UPDATE meta_snapshots SET json_content = $1 WHERE id = $2",
    [JSON.stringify(updated), numericId],
  );

  return Response.json({ ok: true });
}
