import { db, pool } from "@workspace/db";
import { pipelineHealthTable } from "@workspace/db";
import { sendPipelineAlert } from "./alert";
import type { EvidencePipeline } from "./types";

/**
 * Orquestrador de pipelines de evidências.
 *
 * Fluxo:
 *  0. Verifica se a pipeline está pausada — se sim, retorna "skipped".
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
  // Passo 0: verifica pausa — a row mais recente com status="paused" pausa o source
  try {
    const pauseCheck = await pool.query<{ status: string }>(
      `SELECT status FROM pipeline_health
       WHERE source_id = $1
       ORDER BY detected_at DESC
       LIMIT 1`,
      [pipeline.sourceId],
    );
    if (pauseCheck.rows[0]?.status === "paused") {
      return { status: "skipped", details: "paused" };
    }
  } catch {
    // Falha silenciosa — se não conseguir checar, continua normalmente
  }

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
