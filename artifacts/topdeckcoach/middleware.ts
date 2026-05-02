import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware Next.js — protege /admin/* e /api/admin/* com admin_session cookie.
 *
 * A validação criptográfica (timingSafeEqual + sha256) acontece dentro dos
 * route handlers e server components via `requireAdmin` / `requireAdminCookie`
 * de lib/auth/admin.ts (Node.js runtime).
 *
 * Aqui fazemos apenas o gate de presença do cookie, que é suficiente para
 * o Edge Runtime (sem crypto Node.js).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Permite acesso à página de login sem autenticação
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const hasSession =
    !!req.cookies.get("admin_session")?.value ||
    !!req.headers.get("x-admin-token");

  if (!hasSession) {
    // Rotas de API → 401 JSON (sem redirect)
    if (pathname.startsWith("/api/admin/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Páginas admin → redirect para login
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
