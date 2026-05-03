/**
 * POST /api/cron/evidences
 *
 * Entry point do cron de coleta semanal de evidências de meta.
 * Autenticado via Bearer CRON_SECRET (configurado como GitHub Actions secret).
 *
 * Por ora retorna lista vazia — pipelines concretas serão registradas
 * nas sessões B-D. Este arquivo só estabelece o entry point e a autenticação.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

import { env } from "@/lib/env";
import { runPipeline } from "@/lib/evidence/runner";
import type { EvidencePipeline } from "@/lib/evidence/types";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pipelines serão registradas nas sessões B-D
  const pipelines: EvidencePipeline[] = [];

  const results = await Promise.allSettled(
    pipelines.map((p) => runPipeline(p)),
  );

  return Response.json({
    timestamp: new Date().toISOString(),
    results: results.map((r, i) => ({
      pipeline: pipelines[i]?.sourceId,
      ...(r.status === "fulfilled"
        ? r.value
        : { status: "promise_rejected", details: String(r.reason) }),
    })),
  });
}
