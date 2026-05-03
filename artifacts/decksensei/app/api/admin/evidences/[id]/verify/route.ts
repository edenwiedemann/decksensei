export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdminCookie } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdminCookie();

  const { id } = await params;
  const evidenceId = parseInt(id, 10);
  if (isNaN(evidenceId)) {
    return Response.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: { url?: string; verification_note?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body optional
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin";

  const result = await pool.query<{ id: number }>(
    `UPDATE meta_archetype_evidences
     SET verified = true,
         verified_by = $1,
         verified_at = NOW(),
         verification_note = COALESCE($2, verification_note),
         url = COALESCE($3, url)
     WHERE id = $4
     RETURNING id`,
    [adminEmail, body.verification_note ?? null, body.url ?? null, evidenceId],
  );

  if (result.rowCount === 0) {
    return Response.json({ error: "Evidência não encontrada" }, { status: 404 });
  }

  return Response.json({ ok: true, id: evidenceId });
}
