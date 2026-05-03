/**
 * POST /api/cron/evidences
 *
 * Entry point do cron de coleta semanal de evidências de meta.
 * Autenticado via Bearer CRON_SECRET (configurado como GitHub Actions secret).
 */

export const runtime = "nodejs";
export const maxDuration = 300;

import { env } from "@/lib/env";
import { runPipeline } from "@/lib/evidence/runner";
import type { EvidencePipeline } from "@/lib/evidence/types";
import { BandaiWorldsFinalPipeline } from "@/lib/evidence/pipelines/bandai/worlds-final";
import { BandaiRegionalsPipeline } from "@/lib/evidence/pipelines/bandai/regionals";
import { BandaiUltimateCupPipeline } from "@/lib/evidence/pipelines/bandai/ultimate-cup";
import { BandaiStoreChampionshipPipeline } from "@/lib/evidence/pipelines/bandai/store-championship";
import { LimitlessPipeline } from "@/lib/evidence/pipelines/limitless/index";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const pipelines: EvidencePipeline[] = [
    new BandaiWorldsFinalPipeline(),
    new BandaiRegionalsPipeline(),
    new BandaiUltimateCupPipeline(),
    new BandaiStoreChampionshipPipeline(),
    new LimitlessPipeline(),
  ];

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
