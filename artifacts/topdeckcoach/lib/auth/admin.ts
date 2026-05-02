import crypto from "crypto";

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Comparação de strings em tempo constante.
 * Retorna false imediatamente quando os comprimentos diferem, mas ainda executa
 * uma comparação dummy para evitar timing leaks via branch prediction.
 */
function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // dummy — mantém timing uniforme
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Valor armazenado no cookie admin_session: SHA-256 do ADMIN_TOKEN.
 * Nunca expõe o token raw em cookie.
 */
export function adminSessionValue(): string {
  return crypto
    .createHash("sha256")
    .update(process.env.ADMIN_TOKEN ?? "")
    .digest("hex");
}

// ─── requireAdmin (API Routes / Route Handlers) ───────────────────────────────

/**
 * Valida autenticação admin a partir de um Request (NextRequest ou fetch Request).
 *
 * Aceita, em ordem de prioridade:
 *   1. Header `x-admin-token` com o ADMIN_TOKEN bruto
 *   2. Cookie `admin_session` com sha256(ADMIN_TOKEN)
 *
 * @returns `{ ok: true }` se autorizado, ou um `Response` 401 pronto para retornar.
 */
export function requireAdmin(req: Request): { ok: true } | Response {
  const adminToken = process.env.ADMIN_TOKEN ?? "";

  // 1. Header x-admin-token (API routes chamadas externamente)
  const headerToken = req.headers.get("x-admin-token") ?? "";
  if (headerToken && timingSafeEquals(headerToken, adminToken)) {
    return { ok: true };
  }

  // 2. Cookie admin_session (painel web autenticado via browser)
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const sessionValue = match?.[1] ?? "";
  if (sessionValue && timingSafeEquals(sessionValue, adminSessionValue())) {
    return { ok: true };
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}

// ─── requireAdminCookie (Server Components / Pages) ──────────────────────────

/**
 * Valida autenticação admin lendo o cookie `admin_session` via `next/headers`.
 * Use em Server Components e page.tsx.
 *
 * @returns `{ ok: true }` se autorizado, `null` se não autenticado.
 */
export async function requireAdminCookie(): Promise<{ ok: true } | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get("admin_session")?.value ?? "";
  if (!sessionValue) return null;
  return timingSafeEquals(sessionValue, adminSessionValue()) ? { ok: true } : null;
}
