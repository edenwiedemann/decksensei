/**
 * POST /api/cron/evidences/test/[source]
 *
 * Endpoint de teste manual para executar uma pipeline específica isoladamente.
 * Protegido por cookie admin ou header x-admin-token — NÃO usa CRON_SECRET.
 *
 * Útil para debugar pipelines sem precisar disparar o cron completo.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { adminSessionValue } from "@/lib/auth/admin";
import { runPipeline } from "@/lib/evidence/runner";
import type { EvidencePipeline } from "@/lib/evidence/types";

/** Mapa de pipelines disponíveis para teste — populado nas sessões B-D. */
const PIPELINE_REGISTRY = new Map<string, EvidencePipeline>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  // ── Autenticação admin ────────────────────────────────────────────────────
  const authorized = await isAdminAuthorized(req);
  if (!authorized) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { source } = await params;
  const pipeline = PIPELINE_REGISTRY.get(source);

  if (!pipeline) {
    const available = [...PIPELINE_REGISTRY.keys()];
    return Response.json(
      {
        error: "pipeline_not_found",
        available,
        message: `Pipeline "${source}" não registrada. Disponíveis: ${available.join(", ") || "(nenhuma ainda — sessões B-D)"}`,
      },
      { status: 404 },
    );
  }

  const result = await runPipeline(pipeline);

  return Response.json({
    timestamp: new Date().toISOString(),
    pipeline: source,
    ...result,
  });
}

async function isAdminAuthorized(req: NextRequest): Promise<boolean> {
  // Via header x-admin-token
  const headerToken = req.headers.get("x-admin-token");
  if (headerToken) {
    try {
      const expected = adminSessionValue();
      return (
        headerToken.length === expected.length &&
        crypto.timingSafeEqual(
          Buffer.from(headerToken, "hex"),
          Buffer.from(expected, "hex"),
        )
      );
    } catch {
      return false;
    }
  }

  // Via cookie admin_session
  try {
    const cookieStore = await cookies();
    const adminCookie = cookieStore.get("admin_session")?.value ?? "";
    if (!adminCookie) return false;
    const expected = adminSessionValue();
    return (
      adminCookie.length === expected.length &&
      crypto.timingSafeEqual(
        Buffer.from(adminCookie, "hex"),
        Buffer.from(expected, "hex"),
      )
    );
  } catch {
    return false;
  }
}
