import { Resend } from "resend";
import { env } from "@/lib/env";
import { emailShell, BRAND_FROM } from "@/lib/email-templates";

/**
 * Envia alerta por email ao admin quando um pipeline falha ou retorna
 * estrutura inesperada (broken) ou erro de importação (import_error).
 */
export async function sendPipelineAlert(
  sourceId: string,
  status: "broken" | "import_error",
  failures: string[],
): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY);

  const statusLabel =
    status === "broken" ? "estrutura quebrada" : "erro de importação";

  const failuresList = failures
    .map(
      (f) =>
        `<li style="margin-bottom:6px;color:#f87171;font-family:monospace;font-size:12px;">${escapeHtml(f)}</li>`,
    )
    .join("");

  const adminUrl = `${env.APP_URL}/admin/pipelines/${encodeURIComponent(sourceId)}`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#f1f5f9;">
      Pipeline <code style="background:#1f2937;padding:2px 6px;border-radius:4px;font-size:13px;">${escapeHtml(sourceId)}</code>
      falhou com status: <strong style="color:#f87171;">${escapeHtml(statusLabel)}</strong>
    </p>

    ${
      failures.length > 0
        ? `<div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Falhas detectadas</p>
        <ul style="margin:0;padding-left:20px;">${failuresList}</ul>
      </div>`
        : ""
    }

    <div style="text-align:center;margin:24px 0;">
      <a href="${adminUrl}"
         style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
        Ver detalhes no painel →
      </a>
    </div>
  `;

  const footerHtml = `
    <p style="font-size:11px;color:#4b5563;margin:0;text-align:center;">
      Deck Sensei · alerta automático de pipeline ·
      <a href="${env.APP_URL}/admin" style="color:#6366f1;">painel admin</a>
    </p>
  `;

  const html = emailShell({
    title: `[Deck Sensei] Pipeline ${sourceId} ${status}`,
    bodyHtml,
    footerHtml,
  });

  try {
    await resend.emails.send({
      from: BRAND_FROM,
      to: env.ADMIN_EMAIL,
      subject: `[Deck Sensei] Pipeline ${sourceId} — ${statusLabel}`,
      html,
    });
  } catch (err) {
    console.error(
      `[pipeline-alert] falha ao enviar email para ${sourceId}:`,
      err,
    );
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
