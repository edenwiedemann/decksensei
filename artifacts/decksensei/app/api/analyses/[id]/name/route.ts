export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, analysesTable, eq, and, isNull } from "@workspace/db";
import { getSessionUser } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const user = await getSessionUser(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let rawName: unknown;
  try {
    const body = (await req.json()) as { name?: unknown };
    rawName = body.name;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const name =
    typeof rawName === "string"
      ? rawName.trim().slice(0, 60) || null
      : null;

  // ── Ownership check ────────────────────────────────────────────────────────
  const [row] = await db
    .select({ userId: analysesTable.userId })
    .from(analysesTable)
    .where(and(eq(analysesTable.id, id), isNull(analysesTable.deletedAt)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Análise não encontrada." }, { status: 404 });
  }
  if (row.userId !== user.id) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  await db
    .update(analysesTable)
    .set({ deckName: name })
    .where(eq(analysesTable.id, id));

  return NextResponse.json({ ok: true, name });
}
