export const runtime = "nodejs";

/**
 * POST /api/analysis/[id]/email
 * Body: { email: string }
 *
 * Busca a análise pelo ID, formata em HTML e envia via Resend.
 * Rate-limit: 1 envio por (analysisId + email) por hora.
 */

import { type NextRequest } from "next/server";
import { db, analysesTable, gamesTable, eq, isNull, and } from "@workspace/db";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  emailShell,
  emailGameBadge,
  emailAnalysisCta,
  markdownToEmailHtml,
} from "@/lib/email-templates";

const resend = new Resend(env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function buildEmailHtml(
  htmlContent: string,
  analysisUrl: string,
  gameName: string,
): string {
  return emailShell({
    title: `Sua análise de deck ${gameName} — Deck Sensei`,
    badge: emailGameBadge(gameName),
    maxWidth: 600,
    bodyHtml: htmlContent + emailAnalysisCta(analysisUrl),
    footerHtml: `<p style="text-align:center;color:#4b5563;font-size:11px;margin:0;">Você recebeu este email porque pediu na análise do Deck Sensei.</p>`,
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  if (!id || id.length > 30) {
    return Response.json({ error: "ID inválido." }, { status: 400 });
  }

  let email: string;
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email !== "string" || !EMAIL_RE.test(body.email)) {
      return Response.json({ error: "Email inválido." }, { status: 400 });
    }
    email = body.email.toLowerCase().trim();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  // Rate limit: 1 envio por (analysisId + email) por hora
  try {
    const rl = await checkRateLimit(`email_analysis:${id}:${email}`, 3600, 1);
    if (!rl.allowed) {
      return Response.json(
        {
          error:
            "Você já recebeu essa análise por email. Aguarda 1 hora para reenviar.",
        },
        { status: 429 },
      );
    }
  } catch {
    // DB indisponível — permite enviar
  }

  // Busca análise
  const [row] = await db
    .select({
      id: analysesTable.id,
      analysisText: analysesTable.analysisText,
      gameId: analysesTable.gameId,
      gameName: gamesTable.name,
    })
    .from(analysesTable)
    .innerJoin(gamesTable, eq(gamesTable.id, analysesTable.gameId))
    .where(and(eq(analysesTable.id, id), isNull(analysesTable.deletedAt)))
    .limit(1);

  if (!row) {
    return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  }

  const analysisUrl = `${env.APP_URL}/${row.gameId}/a/${id}`;
  const htmlContent = markdownToEmailHtml(row.analysisText);
  const html = buildEmailHtml(htmlContent, analysisUrl, row.gameName);

  const from =
    process.env.RESEND_FROM_EMAIL ?? "Deck Sensei <onboarding@resend.dev>";

  const { error: resendError } = await resend.emails.send({
    from,
    to: [email],
    subject: `Sua análise de deck ${row.gameName} — Deck Sensei`,
    html,
    text: row.analysisText,
  });

  if (resendError) {
    console.error("[analysis/email] Resend error:", resendError);
    return Response.json(
      { error: "Não foi possível enviar o email. Tente novamente." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
