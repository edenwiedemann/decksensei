export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { db, pool, analysesTable, analysisFeedbackTable, eq, and, isNull } from "@workspace/db";
import { checkRateLimit } from "@/lib/rate-limit";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { analysisId, rating, comment } = body as {
    analysisId?: unknown;
    rating?: unknown;
    comment?: unknown;
  };

  // ── Validação dos campos ───────────────────────────────────────────────────
  if (typeof analysisId !== "string" || !analysisId.trim()) {
    return Response.json({ error: "analysisId é obrigatório." }, { status: 400 });
  }
  if (rating !== "up" && rating !== "down") {
    return Response.json(
      { error: "rating deve ser 'up' ou 'down'." },
      { status: 400 },
    );
  }
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string") {
      return Response.json({ error: "comment deve ser string." }, { status: 400 });
    }
    if (comment.length > 500) {
      return Response.json(
        { error: "Comentário deve ter no máximo 500 caracteres." },
        { status: 400 },
      );
    }
  }

  const id = analysisId.trim();

  // ── Rate limit: 10 votos / IP / análise por 30 dias ───────────────────────
  const ip = getClientIp(req);
  const rlKey = `feedback:${id}:${ip}`;
  let rlResult: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    rlResult = await checkRateLimit(rlKey, 60 * 60 * 24 * 30, 10);
  } catch {
    rlResult = { allowed: true };
  }

  if (!rlResult.allowed) {
    return Response.json(
      { error: "rate_limit", message_pt: "Muitos votos para essa análise." },
      { status: 429 },
    );
  }

  // ── Valida que a análise existe e não foi deletada ─────────────────────────
  const existing = await db
    .select({ id: analysesTable.id })
    .from(analysesTable)
    .where(and(eq(analysesTable.id, id), isNull(analysesTable.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  }

  // ── Persiste o feedback ────────────────────────────────────────────────────
  await db.insert(analysisFeedbackTable).values({
    analysisId: id,
    rating: rating as "up" | "down",
    comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
    ip,
  });

  return Response.json({ ok: true });
}
