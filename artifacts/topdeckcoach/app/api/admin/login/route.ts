import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminSessionValue } from "@/lib/auth/admin";
import crypto from "crypto";

const ADMIN_SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE = 8 * 60 * 60; // 8 horas em segundos

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  let password: unknown;

  try {
    const body = (await req.json()) as { password?: unknown };
    password = body.password;
  } catch {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }

  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "password obrigatório" }, { status: 400 });
  }

  const adminToken = process.env.ADMIN_TOKEN ?? "";
  const valid = timingSafeEquals(password, adminToken);

  if (!valid) {
    // Delay fixo para dificultar brute-force por timing
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({ error: "senha incorreta" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, adminSessionValue(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
