export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db, promptsTable, eq } from "@workspace/db";

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

  const existing = await db
    .select()
    .from(promptsTable)
    .where(eq(promptsTable.id, numericId))
    .limit(1);

  if (existing.length === 0) {
    return Response.json({ error: "Prompt não encontrado." }, { status: 404 });
  }

  const source = existing[0];
  const newVersion = `${source.version}-cópia`;

  const [created] = await db
    .insert(promptsTable)
    .values({
      gameId: source.gameId,
      version: newVersion,
      systemContent: source.systemContent,
      notes: source.notes ? `Cópia de ${source.version}. ${source.notes}` : `Cópia de ${source.version}.`,
      active: false,
    })
    .returning({ id: promptsTable.id, version: promptsTable.version });

  return Response.json({ ok: true, id: created.id, version: created.version });
}
