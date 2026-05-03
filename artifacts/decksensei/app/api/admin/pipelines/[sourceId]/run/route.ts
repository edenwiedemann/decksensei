export const runtime = "nodejs";
export const maxDuration = 120;

import { type NextRequest } from "next/server";
import { requireAdminCookie } from "@/lib/auth/admin";
import { runPipeline } from "@/lib/evidence/runner";
import type { EvidencePipeline } from "@/lib/evidence/types";
import { BandaiWorldsFinalPipeline } from "@/lib/evidence/pipelines/bandai/worlds-final";
import { BandaiRegionalsPipeline } from "@/lib/evidence/pipelines/bandai/regionals";
import { BandaiUltimateCupPipeline } from "@/lib/evidence/pipelines/bandai/ultimate-cup";
import { BandaiStoreChampionshipPipeline } from "@/lib/evidence/pipelines/bandai/store-championship";
import { DigimonMetaPipeline } from "@/lib/evidence/pipelines/digimonmeta/index";
import { LimitlessPipeline } from "@/lib/evidence/pipelines/limitless/index";
import { DigimonCardIoPipeline } from "@/lib/evidence/pipelines/digimoncard-io/index";

const REGISTRY = new Map<string, EvidencePipeline>([
  ["bandai-worlds-final", new BandaiWorldsFinalPipeline()],
  ["bandai-regionals", new BandaiRegionalsPipeline()],
  ["bandai-ultimate-cup", new BandaiUltimateCupPipeline()],
  ["bandai-store-championship", new BandaiStoreChampionshipPipeline()],
  ["digimonmeta-review", new DigimonMetaPipeline()],
  ["limitless-tcg", new LimitlessPipeline()],
  ["digimoncard-io", new DigimonCardIoPipeline()],
]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  await requireAdminCookie();

  const { sourceId } = await params;
  const pipeline = REGISTRY.get(sourceId);

  if (!pipeline) {
    return Response.json(
      { error: `Pipeline "${sourceId}" não encontrada` },
      { status: 404 },
    );
  }

  const result = await runPipeline(pipeline);

  return Response.json({
    timestamp: new Date().toISOString(),
    pipeline: sourceId,
    ...result,
  });
}
