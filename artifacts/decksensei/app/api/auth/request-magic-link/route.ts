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
import {
  emailShell,
  emailButton,
  emailFallbackLink,
  BRAND_NAME,
  BRAND_FROM,
} from "@/lib/email-templates";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resend = new Resend(env.RESEND_API_KEY);

const OK = NextResponse.json({ ok: true }, { status: 200 });

// ─── Email HTML de autenticação ───────────────────────────────────────────────

function buildMagicLinkEmail(link: string, email: string): { html: string; text: string } {
  const bodyHtml = `
    <h1 style="font-size:22px;font-weight:700;color:#f1f5f9;margin:0 0 12px;letter-spacing:-0.3px;">
      Seu link de acesso chegou
    </h1>
    <p style="font-size:15px;line-height:1.65;color:#94a3b8;margin:0 0 28px;">
      Clica no botão abaixo para entrar no Deck Sensei.
    </p>
    ${emailButton(link, `Entrar no ${BRAND_NAME} →`)}
    ${emailFallbackLink(link)}
  `;

  const footerHtml = `
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:0 0 6px;">
      O link expira em <strong style="color:#9ca3af;">15 minutos</strong> e só pode ser usado uma vez.
      Se não foi você que pediu, ignore este email — nenhuma ação é necessária.
    </p>
    <p style="font-size:11px;color:#6b7280;margin:0;">
      Enviado para ${email} · ${BRAND_NAME}
    </p>
  `;

  const html = emailShell({
    title: `Seu link de acesso — ${BRAND_NAME}`,
    bodyHtml,
    footerHtml,
  });

  const text = [
    "Olá!",
    "",
    `Seu link de acesso ao ${BRAND_NAME}:`,
    link,
    "",
    "Esse link expira em 15 minutos e só pode ser usado uma vez.",
    "Se não foi você, ignore esse email.",
    "",
    `— ${BRAND_NAME}`,
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
        from: BRAND_FROM,
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
