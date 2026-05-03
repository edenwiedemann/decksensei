/**
 * POST /api/auth/request-magic-link
 *
 * Body: { email: string, city?: string, state?: string }
 *
 * Fluxo:
 *   1. Valida formato do email
 *   2. Rate limit: 3 requests por email por hora
 *   3. upsertUser + updateUserLocation se city/state presentes
 *   4. generateToken(user.id)
 *   5. Envia email via Resend
 *   6. Retorna 200 sempre (anti-enumeration)
 */

import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { upsertUser, updateUserLocation } from "@/lib/db/users";
import { generateToken } from "@/lib/auth/magic-link";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resend = new Resend(env.RESEND_API_KEY);

const OK = NextResponse.json({ ok: true }, { status: 200 });

// ─── Email HTML de autenticação ───────────────────────────────────────────────

function buildMagicLinkEmail(link: string, email: string): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Seu link de acesso — Deck Sensei</title>
</head>
<body style="background:#0f1117;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:20px;">
  <div style="max-width:520px;margin:0 auto;">

    <!-- Header -->
    <div style="padding:28px 0 22px;border-bottom:1px solid #1f2937;">
      <span style="font-size:20px;font-weight:700;color:#f9fafb;letter-spacing:-0.3px;">Deck Sensei</span>
    </div>

    <!-- Body -->
    <div style="padding:36px 0 28px;">
      <h1 style="font-size:22px;font-weight:700;color:#f1f5f9;margin:0 0 12px;letter-spacing:-0.3px;">
        Seu link de acesso chegou
      </h1>
      <p style="font-size:15px;line-height:1.65;color:#94a3b8;margin:0 0 28px;">
        Clica no botão abaixo para entrar no Deck Sensei.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${link}"
           style="display:inline-block;background:#6366f1;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.01em;line-height:1;">
          Entrar no Deck Sensei →
        </a>
      </div>

      <!-- Fallback link -->
      <p style="font-size:12px;line-height:1.6;color:#4b5563;margin:0;text-align:center;">
        Botão não funcionou? Copia e cola esse link no navegador:<br>
        <a href="${link}" style="color:#6366f1;word-break:break-all;">${link}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #1f2937;padding:20px 0 0;">
      <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:0 0 6px;">
        O link expira em <strong style="color:#9ca3af;">15 minutos</strong> e só pode ser usado uma vez.
        Se não foi você que pediu, ignore este email — nenhuma ação é necessária.
      </p>
      <p style="font-size:11px;color:#6b7280;margin:0;">
        Enviado para ${email} · Deck Sensei
      </p>
    </div>

  </div>
</body>
</html>`;

  const text = [
    "Olá!",
    "",
    "Seu link de acesso ao Deck Sensei:",
    link,
    "",
    "Esse link expira em 15 minutos e só pode ser usado uma vez.",
    "Se não foi você, ignore esse email.",
    "",
    "— Deck Sensei",
  ].join("\n");

  return { html, text };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).email !== "string"
  ) {
    return NextResponse.json({ error: "email obrigatório" }, { status: 400 });
  }

  const { email, city, state } = body as {
    email: string;
    city?: string;
    state?: string;
  };

  // 1. Valida formato
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "formato de email inválido" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 2. Rate limit por email: 3 requests por hora (Postgres-backed)
  const { allowed } = await checkRateLimit(
    `magic-link:${normalizedEmail}`,
    3600,
    3,
  );

  if (!allowed) {
    // Retorna 200 para não vazar presença do email, mas não envia nada
    return OK;
  }

  try {
    // 3. Upsert user
    const user = await upsertUser({ email: normalizedEmail });

    if (
      typeof city === "string" && city.trim() !== "" ||
      typeof state === "string" && state.trim() !== ""
    ) {
      await updateUserLocation(
        user.id,
        typeof city === "string" && city.trim() !== "" ? city.trim() : null,
        typeof state === "string" && state.trim() !== "" ? state.trim() : null,
      );
    }

    // 4. Gera token
    const token = await generateToken(user.id);

    // 5. Envia email
    const link = `${env.APP_URL}/auth/verify?token=${token}`;
    const { html, text } = buildMagicLinkEmail(link, normalizedEmail);

    try {
      await resend.emails.send({
        from: "Deck Sensei <noreply@decksensei.com.br>",
        to: normalizedEmail,
        subject: "Seu link de acesso ao Deck Sensei",
        html,
        text,
      });
    } catch (emailErr) {
      console.error("[request-magic-link] Resend error:", emailErr);
      // Retorna 200 mesmo assim — não vaza falha de delivery
    }
  } catch (err) {
    console.error("[request-magic-link] internal error:", err);
    // Retorna 200 — anti-enumeration
  }

  return OK;
}
