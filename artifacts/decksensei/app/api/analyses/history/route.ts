export const runtime = "nodejs";

/**
 * GET /api/analyses/history
 *
 * Query params:
 *   game   — game_id (obrigatório)
 *   cursor — ISO timestamp do último item visto (paginação keyset)
 *   grade  — A | B | C | D (filtro opcional)
 *
 * Retorna: { items: AnalysisItem[], nextCursor: string | null }
 * Tamanho de página: 20 itens
 */

import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  db,
  analysesTable,
  eq,
  and,
  isNull,
  desc,
  lt,
  sql,
} from "@workspace/db";
import { getSessionUser } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/session";
import type { DeckGrade } from "@/lib/deck-score";

const PAGE_SIZE = 20;

const GRADE_REGEX: Record<DeckGrade, string> = {
  A: String.raw`similaridade aproximada\s*\*\*(8[0-9]|9[0-9]|100)%`,
  B: String.raw`similaridade aproximada\s*\*\*(6[5-9]|7[0-9])%`,
  C: String.raw`similaridade aproximada\s*\*\*(5[0-9]|6[0-4])%`,
  D: String.raw`similaridade aproximada\s*\*\*([0-9]|[1-4][0-9])%`,
};

const VALID_GRADES = new Set<string>(["A", "B", "C", "D"]);

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await getSessionUser(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const game = searchParams.get("game") ?? "";
  const cursorRaw = searchParams.get("cursor") ?? "";
  const gradeRaw = searchParams.get("grade") ?? "";

  if (!game) {
    return NextResponse.json({ error: "game obrigatório." }, { status: 400 });
  }

  const grade: DeckGrade | null =
    gradeRaw && VALID_GRADES.has(gradeRaw) ? (gradeRaw as DeckGrade) : null;

  const cursorDate = cursorRaw ? new Date(cursorRaw) : null;

  const conditions = [
    eq(analysesTable.gameId, game),
    eq(analysesTable.userId, user.id),
    isNull(analysesTable.deletedAt),
    ...(cursorDate && !isNaN(cursorDate.getTime())
      ? [lt(analysesTable.createdAt, cursorDate)]
      : []),
    ...(grade
      ? [sql`${analysesTable.analysisText} ~ ${GRADE_REGEX[grade]}`]
      : []),
  ];

  const rows = await db
    .select({
      id: analysesTable.id,
      analysisText: analysesTable.analysisText,
      deckName: analysesTable.deckName,
      createdAt: analysesTable.createdAt,
      similarArchetypeId: analysesTable.similarArchetypeId,
    })
    .from(analysesTable)
    .where(and(...conditions))
    .orderBy(desc(analysesTable.createdAt))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore
    ? items[items.length - 1]!.createdAt.toISOString()
    : null;

  return NextResponse.json({ items, nextCursor });
}
