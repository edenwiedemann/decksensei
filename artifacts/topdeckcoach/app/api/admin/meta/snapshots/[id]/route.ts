export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

export async function PATCH(
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

  let body: { notes?: string; version?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (body.notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(body.notes); }
  if (body.version !== undefined) { sets.push(`version = $${i++}`); vals.push(body.version); }

  if (sets.length === 0) {
    return Response.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  vals.push(numericId);
  await pool.query(
    `UPDATE meta_snapshots SET ${sets.join(", ")} WHERE id = $${i}`,
    vals,
  );

  return Response.json({ ok: true });
}
