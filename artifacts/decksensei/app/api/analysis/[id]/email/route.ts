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

const resend = new Resend(env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── Formatação markdown → HTML simplificado para email ──────────────────────

function markdownToEmailHtml(md: string): string {
  const stripped = md
    .replace(/```sugestoes[\s\S]*?```/g, "")
    .replace(/```[\s\S]*?```/g, "");

  const sections = stripped.split(/(?=^## )/m).filter((s) => s.trim());

  return sections
    .map((section) => {
      const firstNl = section.indexOf("\n");
      const rawTitle = firstNl > 0 ? section.slice(3, firstNl).trim() : "";
      const body = firstNl > 0 ? section.slice(firstNl + 1).trim() : "";

      const formattedBody = body
        .split(/\n{2,}/)
        .map((para) => {
          const para2 = para
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\*([^*]+)\*/g, "<em>$1</em>");

          const lines = para2.split("\n");
          const isList = lines.every((l) => l.match(/^[-*]\s/));
          if (isList) {
            const items = lines
              .map((l) =>
                `<li style="margin-bottom:6px;color:#9ca3af;">${l.replace(/^[-*]\s+/, "")}</li>`,
              )
              .join("");
            return `<ul style="padding-left:20px;margin:8px 0;">${items}</ul>`;
          }
          return `<p style="margin:0 0 10px;line-height:1.65;color:#9ca3af;">${para2.replace(/\n/g, " ")}</p>`;
        })
        .join("");

      return `
        <div style="margin-bottom:24px;">
          <h2 style="font-size:15px;font-weight:600;color:#f3f4f6;margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid #374151;">
            ${rawTitle}
          </h2>
          ${formattedBody}
        </div>`;
    })
    .join("");
}

function buildEmailHtml(
  htmlContent: string,
  analysisUrl: string,
  gameName: string,
): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0f1117;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;">

    <div style="padding:24px 0 20px;border-bottom:1px solid #1f2937;">
      <span style="font-size:18px;font-weight:700;color:#f9fafb;">Deck Sensei</span>
      <span style="display:inline-block;margin-left:10px;padding:2px 10px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:20px;font-size:11px;color:#818cf8;">${gameName}</span>
    </div>

    <div style="padding:28px 0 12px;">
      ${htmlContent}
    </div>

    <div style="background:#1f2937;border-radius:12px;padding:20px;text-align:center;margin-bottom:28px;">
      <p style="color:#9ca3af;font-size:13px;margin:0 0 14px;">Ver análise completa com sugestões visuais de troca</p>
      <a href="${analysisUrl}"
         style="display:inline-block;background:#6366f1;color:#fff;padding:10px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.01em;">
        Abrir análise →
      </a>
    </div>

    <p style="text-align:center;color:#4b5563;font-size:11px;margin:0;">
      Você recebeu este email porque pediu na análise do Deck Sensei.
    </p>

  </div>
</body>
</html>`;
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
