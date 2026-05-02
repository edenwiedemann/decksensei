import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db, analysesTable, eq, and, isNull } from "@workspace/db";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { gameId, analysisId, playerName } = body as {
    gameId?: string;
    analysisId?: string;
    playerName?: string;
  };

  if (!gameId || !analysisId) {
    return Response.json(
      { error: "gameId e analysisId são obrigatórios." },
      { status: 400 },
    );
  }

  // 1. Remove featured de todas as análises desse jogo
  await db
    .update(analysesTable)
    .set({ isFeatured: false })
    .where(eq(analysesTable.gameId, gameId));

  // 2. Marca a análise específica como featured + salva nome do jogador
  await db
    .update(analysesTable)
    .set({
      isFeatured: true,
      adminNote: playerName?.trim() || null,
    })
    .where(
      and(
        eq(analysesTable.id, analysisId),
        eq(analysesTable.gameId, gameId),
        isNull(analysesTable.deletedAt),
      ),
    );

  return Response.json({ ok: true });
}
