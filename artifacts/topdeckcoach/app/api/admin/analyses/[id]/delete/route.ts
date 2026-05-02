export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db, analysesTable, eq, and, isNull } from "@workspace/db";

interface DeleteBody {
  adminNote?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const note = body.adminNote?.trim() ?? "";
  if (note.length < 10) {
    return Response.json(
      { error: "adminNote deve ter pelo menos 10 caracteres." },
      { status: 400 },
    );
  }

  const result = await db
    .update(analysesTable)
    .set({
      deletedAt: new Date(),
      adminNote: note,
    })
    .where(
      and(
        eq(analysesTable.id, id),
        isNull(analysesTable.deletedAt),
      ),
    )
    .returning({ id: analysesTable.id });

  if (result.length === 0) {
    return Response.json(
      { error: "Análise não encontrada ou já deletada." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, id });
}
