/**
 * Utilitário compartilhado de templates de email — Deck Sensei.
 *
 * Todos os emails transacionais devem usar as funções deste módulo para que
 * alterações de marca (cores, fonte, logo) se propaguem em um único lugar.
 */

// ─── Constantes de marca ──────────────────────────────────────────────────────

export const BRAND_NAME = "Deck Sensei";
export const BRAND_FROM = "Deck Sensei <noreply@decksensei.com.br>";

// ─── Tokens de design ─────────────────────────────────────────────────────────

const T = {
  bg: "#0f1117",
  bgCard: "#1f2937",
  border: "#1f2937",
  borderLight: "#374151",
  textPrimary: "#f9fafb",
  textHeading: "#f1f5f9",
  textBody: "#94a3b8",
  textMuted: "#6b7280",
  textFaint: "#4b5563",
  textFaintAlt: "#9ca3af",
  accent: "#6366f1",
  accentLight: "#818cf8",
  accentBg: "rgba(99,102,241,0.15)",
  accentBorder: "rgba(99,102,241,0.3)",
  font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

// ─── Componentes primitivos ───────────────────────────────────────────────────

/** Gera o HTML de uma badge de jogo para o cabeçalho. */
export function emailGameBadge(gameName: string): string {
  return `<span style="display:inline-block;margin-left:10px;padding:2px 10px;background:${T.accentBg};border:1px solid ${T.accentBorder};border-radius:20px;font-size:11px;color:${T.accentLight};">${gameName}</span>`;
}

/** Gera um botão CTA centralizado. */
export function emailButton(href: string, label: string): string {
  return `<div style="text-align:center;margin:0 0 28px;">
  <a href="${href}" style="display:inline-block;background:${T.accent};color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.01em;line-height:1;">${label}</a>
</div>`;
}

/** Gera um link de fallback em texto abaixo do botão. */
export function emailFallbackLink(href: string): string {
  return `<p style="font-size:12px;line-height:1.6;color:${T.textFaint};margin:0;text-align:center;">
  Botão não funcionou? Copia e cola esse link no navegador:<br>
  <a href="${href}" style="color:${T.accent};word-break:break-all;">${href}</a>
</p>`;
}

/** Gera um bloco de rodapé com CTA para ver análise no site. */
export function emailAnalysisCta(href: string, label = "Abrir análise →"): string {
  return `<div style="background:${T.bgCard};border-radius:12px;padding:20px;text-align:center;margin-bottom:28px;">
  <p style="color:${T.textBody};font-size:13px;margin:0 0 14px;">Ver análise completa com sugestões visuais de troca</p>
  <a href="${href}" style="display:inline-block;background:${T.accent};color:#fff;padding:10px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.01em;">${label}</a>
</div>`;
}

// ─── Shell do email ───────────────────────────────────────────────────────────

interface EmailShellOptions {
  /** Título da aba / <title> do documento. */
  title: string;
  /** Badge opcional ao lado do logo (ex: nome do jogo). */
  badge?: string;
  /** HTML do corpo principal (entre o header e o footer). */
  bodyHtml: string;
  /** HTML do rodapé (abaixo do body). */
  footerHtml: string;
  /** Largura máxima do container. Padrão: 560px */
  maxWidth?: number;
}

/** Monta o email completo com shell consistente de marca. */
export function emailShell({
  title,
  badge = "",
  bodyHtml,
  footerHtml,
  maxWidth = 560,
}: EmailShellOptions): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="background:${T.bg};font-family:${T.font};margin:0;padding:20px;">
  <div style="max-width:${maxWidth}px;margin:0 auto;">

    <!-- Header -->
    <div style="padding:28px 0 22px;border-bottom:1px solid ${T.border};">
      <span style="font-size:20px;font-weight:700;color:${T.textPrimary};letter-spacing:-0.3px;">Deck Sensei</span>${badge}
    </div>

    <!-- Body -->
    <div style="padding:32px 0 24px;">
      ${bodyHtml}
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid ${T.border};padding:20px 0 0;">
      ${footerHtml}
    </div>

  </div>
</body>
</html>`;
}

// ─── Conversão markdown → HTML (para emails de análise) ──────────────────────

/** Converte o markdown de análise em HTML para corpo de email. */
export function markdownToEmailHtml(md: string): string {
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
              .map(
                (l) =>
                  `<li style="margin-bottom:6px;color:${T.textFaintAlt};">${l.replace(/^[-*]\s+/, "")}</li>`,
              )
              .join("");
            return `<ul style="padding-left:20px;margin:8px 0;">${items}</ul>`;
          }
          return `<p style="margin:0 0 10px;line-height:1.65;color:${T.textFaintAlt};">${para2.replace(/\n/g, " ")}</p>`;
        })
        .join("");

      return `
        <div style="margin-bottom:24px;">
          <h2 style="font-size:15px;font-weight:600;color:${T.textPrimary};margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid ${T.borderLight};">
            ${rawTitle}
          </h2>
          ${formattedBody}
        </div>`;
    })
    .join("");
}
