export const runtime = "nodejs";

/**
 * GET /api/analyses/history
 *
 * Query params:
 *   game   — game_id (obrigatório)
 *   cursor — cursor composto "createdAt_ISO|id" do último item da página anterior
 *   grade  — A | B | C | D (filtro opcional)
 *
 * Paginação keyset estável: ORDER BY created_at DESC, id DESC.
 * O cursor composto evita que itens com o mesmo timestamp sejam pulados.
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
  or,
  isNull,
  desc,
  lt,
  sql,
} from "@workspace/db";
import { getSessionUser } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/session";
import type { DeckGrade } from "@/lib/deck-score";
import {
  PAGE_SIZE,
  GRADE_REGEX,
  VALID_GRADES,
  encodeCursor,
  parseCursor,
} from "@/lib/history-helpers";

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

  const cursor = cursorRaw ? parseCursor(cursorRaw) : null;

  // Keyset condition for ORDER BY created_at DESC, id DESC:
  //   (created_at < cursor.ts) OR (created_at = cursor.ts AND id < cursor.id)
  const cursorCondition = cursor
    ? or(
        lt(analysesTable.createdAt, cursor.ts),
        and(
          sql`${analysesTable.createdAt} = ${cursor.ts.toISOString()}`,
          sql`${analysesTable.id} < ${cursor.id}`,
        ),
      )
    : undefined;

  const rows = await db
    .select({
      id: analysesTable.id,
      analysisText: analysesTable.analysisText,
      deckName: analysesTable.deckName,
      createdAt: analysesTable.createdAt,
      similarArchetypeId: analysesTable.similarArchetypeId,
    })
    .from(analysesTable)
    .where(
      and(
        eq(analysesTable.gameId, game),
        eq(analysesTable.userId, user.id),
        isNull(analysesTable.deletedAt),
        cursorCondition,
        grade
          ? sql`${analysesTable.analysisText} ~ ${GRADE_REGEX[grade]}`
          : undefined,
      ),
    )
    .orderBy(desc(analysesTable.createdAt), desc(analysesTable.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;

  return NextResponse.json({ items, nextCursor });
}
