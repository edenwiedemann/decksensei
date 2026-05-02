export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db, promptsTable } from "@workspace/db";

interface CreateBody {
  gameId?: string;
  version?: string;
  systemContent?: string;
  notes?: string;
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

  const { gameId, version, systemContent, notes } = body;

  if (!gameId?.trim()) {
    return Response.json({ error: "gameId é obrigatório." }, { status: 400 });
  }
  if (!version?.trim()) {
    return Response.json({ error: "version é obrigatório." }, { status: 400 });
  }
  if (!systemContent?.trim()) {
    return Response.json({ error: "systemContent é obrigatório." }, { status: 400 });
  }

  const [created] = await db
    .insert(promptsTable)
    .values({
      gameId: gameId.trim(),
      version: version.trim(),
      systemContent: systemContent.trim(),
      notes: notes?.trim() || null,
      active: false,
    })
    .returning({ id: promptsTable.id, version: promptsTable.version });

  return Response.json({ ok: true, id: created.id, version: created.version });
}
