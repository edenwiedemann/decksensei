import { type NextRequest, NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";

async function logout(req: NextRequest, game?: string): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    await deleteSession(sessionToken);
  }

  let redirectTo = game ? `/${game}` : "/";

  if (!game) {
    try {
      const referer = req.headers.get("referer");
      if (referer) {
        const url = new URL(referer);
        const parts = url.pathname.split("/").filter(Boolean);
        const first = parts[0] ?? "";
        if (first) redirectTo = `/${first}`;
      }
    } catch {
      // Malformed Referer — fall back to "/"
    }
  }

  const response = NextResponse.redirect(new URL(redirectTo, req.url), {
    status: 303,
  });

  response.cookies.set(SESSION_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return logout(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let game: string | undefined;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const method = params.get("_method");
      if (method && method.toUpperCase() !== "DELETE") {
        return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
      }
      const g = params.get("game");
      if (g) game = g;
    }
  } catch {
    // Ignore parse errors
  }
  return logout(req, game);
}
