/**
 * POST /api/analyses/claim
 *
 * Vincula uma análise anônima (user_id IS NULL) ao usuário autenticado.
 * Usado após o fluxo magic-link para resgatar a 1ª análise gratuita no histórico.
 *
 * Body: { analysisId: string }
 * Response: { ok: true, claimed: boolean }
 *   claimed=true  → análise atualizada com sucesso
 *   claimed=false → análise não existe, já tem dono, ou formato inválido
 */

import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { db, analysesTable, eq, and, isNull } from "@workspace/db";

const ANALYSIS_ID_RE = /^[A-Za-z0-9_-]{24}$/;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await getSessionUser(sessionToken);
  if (!user) {
    return Response.json({ error: "Sessão inválida." }, { status: 401 });
  }

  let analysisId: string;
  try {
    const body = (await req.json()) as { analysisId?: unknown };
    if (typeof body.analysisId !== "string" || !ANALYSIS_ID_RE.test(body.analysisId)) {
      return Response.json({ ok: true, claimed: false });
    }
    analysisId = body.analysisId;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const result = await db
    .update(analysesTable)
    .set({ userId: user.id })
    .where(
      and(
        eq(analysesTable.id, analysisId),
        isNull(analysesTable.userId),
        isNull(analysesTable.deletedAt),
      ),
    )
    .returning({ id: analysesTable.id });

  const claimed = result.length > 0;
  return Response.json({ ok: true, claimed });
}
