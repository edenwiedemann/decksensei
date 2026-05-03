export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdminCookie } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdminCookie();

  const { id } = await params;
  const evidenceId = parseInt(id, 10);
  if (isNaN(evidenceId)) {
    return Response.json({ error: "ID inválido" }, { status: 400 });
  }

  const result = await pool.query(
    `DELETE FROM meta_archetype_evidences WHERE id = $1`,
    [evidenceId],
  );

  if (result.rowCount === 0) {
    return Response.json({ error: "Evidência não encontrada" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
