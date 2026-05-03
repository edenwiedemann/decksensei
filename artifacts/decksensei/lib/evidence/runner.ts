import { db } from "@workspace/db";
import { pipelineHealthTable } from "@workspace/db";
import { sendPipelineAlert } from "./alert";
import type { EvidencePipeline } from "./types";

/**
 * Orquestrador de pipelines de evidências.
 *
 * Fluxo:
 *  1. Valida o fingerprint da fonte (estrutura, acessibilidade).
 *  2. Se inválido → salva status "broken" no DB + envia alerta.
 *  3. Se válido → executa a importação.
 *  4. Sucesso → salva status "ok" com contagem de itens.
 *  5. Erro na importação → salva status "import_error" + envia alerta.
 */
export async function runPipeline(pipeline: EvidencePipeline): Promise<{
  status: "ok" | "broken" | "import_error" | "skipped";
  details: unknown;
}> {
  const validation = await pipeline.validateFingerprint();

  if (!validation.ok) {
    await db.insert(pipelineHealthTable).values({
      sourceId: pipeline.sourceId,
      status: "broken",
      failures: validation.failures,
    });
    await sendPipelineAlert(pipeline.sourceId, "broken", validation.failures);
    return { status: "broken", details: validation.failures };
  }

  try {
    const result = await pipeline.import();
    await db.insert(pipelineHealthTable).values({
      sourceId: pipeline.sourceId,
      status: "ok",
      itemsImported: result.itemsImported,
    });
    return { status: "ok", details: result };
  } catch (err) {
    const errorMessage = (err as Error).message;
    await db.insert(pipelineHealthTable).values({
      sourceId: pipeline.sourceId,
      status: "import_error",
      errorMessage,
    });
    await sendPipelineAlert(pipeline.sourceId, "import_error", [errorMessage]);
    return { status: "import_error", details: errorMessage };
  }
}
