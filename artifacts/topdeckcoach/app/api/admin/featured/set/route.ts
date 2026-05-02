import { NextRequest } from "next/server";
import { db, analysesTable, eq, and, isNull } from "@workspace/db";

function adminToken(): string | null {
  return process.env.ADMIN_TOKEN ?? null;
}

function isAuthorized(req: NextRequest): boolean {
  const token = adminToken();
  if (!token) return false;
  const header = req.headers.get("x-admin-token");
  return header === token;
}

export async function POST(req: NextRequest) {
  if (!adminToken()) {
    return Response.json(
      { error: "ADMIN_TOKEN não configurado no servidor." },
      { status: 503 },
    );
  }

  if (!isAuthorized(req)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

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
