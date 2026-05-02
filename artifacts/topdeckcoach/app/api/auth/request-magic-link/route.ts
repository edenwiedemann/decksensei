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
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { env } from "@/lib/env";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hora

const resend = new Resend(env.RESEND_API_KEY);

const OK = NextResponse.json({ ok: true }, { status: 200 });

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

  // 2. Rate limit por email
  const { allowed } = checkRateLimit(
    `magic-link:${normalizedEmail}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
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

    try {
      await resend.emails.send({
        from: "Deck Sensei <noreply@decksensei.com.br>",
        to: normalizedEmail,
        subject: "Seu link de acesso ao Deck Sensei",
        text: [
          "Olá!",
          "",
          `Clica aqui pra entrar: ${link}`,
          "",
          "Esse link expira em 15 minutos.",
          "Se não foi você, ignore esse email.",
          "",
          "— Deck Sensei",
        ].join("\n"),
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
