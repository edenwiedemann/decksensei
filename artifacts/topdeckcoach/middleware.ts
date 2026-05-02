import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware Next.js — protege /admin/* e /api/admin/* com admin_session cookie.
 *
 * Valida o cookie criptograficamente usando Web Crypto API (disponível no Edge
 * Runtime) computando SHA-256(email:token) e comparando com o cookie.
 */

async function expectedSession(): Promise<string> {
  const email = process.env.ADMIN_EMAIL ?? "";
  const token = process.env.ADMIN_TOKEN ?? "";
  const data = new TextEncoder().encode(`${email}:${token}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Permite acesso à página e API de login sem autenticação
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get("admin_session")?.value ?? "";
  const headerToken = req.headers.get("x-admin-token") ?? "";
  const adminToken = process.env.ADMIN_TOKEN ?? "";

  // 1. Header x-admin-token: comparação direta (API calls programáticas)
  const headerOk = headerToken.length > 0 && headerToken === adminToken;

  // 2. Cookie admin_session: valida hash criptograficamente
  const cookieOk =
    cookieValue.length > 0 && cookieValue === (await expectedSession());

  if (!headerOk && !cookieOk) {
    if (pathname.startsWith("/api/admin/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
