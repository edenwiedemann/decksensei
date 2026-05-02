/**
 * cost-tracker.ts
 *
 * Centraliza cálculo de custo, gravação em api_costs e verificação do cap
 * diário de gasto com a API Anthropic.
 *
 * Preços Claude Sonnet (verificar em docs.anthropic.com/en/docs/about-claude/models):
 *   Input:  $3  / MTok
 *   Output: $15 / MTok
 */

import { db, apiCostsTable } from "@workspace/db";
import { pool } from "@workspace/db";

// ─── Preços por token ────────────────────────────────────────────────────────

export const PRICE_INPUT_PER_MTOK = 3; // USD por milhão de tokens de input
export const PRICE_OUTPUT_PER_MTOK = 15; // USD por milhão de tokens de output

function calcCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * PRICE_INPUT_PER_MTOK) / 1_000_000 +
    (outputTokens * PRICE_OUTPUT_PER_MTOK) / 1_000_000
  );
}

// ─── trackCost ───────────────────────────────────────────────────────────────

/**
 * Grava o custo de uma chamada na tabela api_costs.
 * Best-effort: erros de DB são logados mas não propagados.
 *
 * @param inputTokens  Tokens de input retornados pela API (usage.input_tokens)
 * @param outputTokens Tokens de output retornados pela API (usage.output_tokens)
 * @param analysisId   ID da análise associada (opcional)
 */
export async function trackCost(
  inputTokens: number,
  outputTokens: number,
  analysisId?: string,
): Promise<void> {
  const costUsd = calcCostUsd(inputTokens, outputTokens).toFixed(6);

  try {
    await db.insert(apiCostsTable).values({
      ...(analysisId ? { analysisId } : {}),
      inputTokens,
      outputTokens,
      costUsd,
    });
  } catch (err) {
    console.error("[cost-tracker] falha ao gravar custo:", err);
  }
}

// ─── getDailyCost ────────────────────────────────────────────────────────────

/**
 * Retorna a soma dos custos (em USD) registrados no dia especificado.
 * Usa o fuso horário UTC do servidor.
 *
 * @param date Data de referência (default: hoje)
 * @returns    Total em USD como número de ponto flutuante
 */
export async function getDailyCost(date?: Date): Promise<number> {
  const ref = date ?? new Date();
  // Formato YYYY-MM-DD
  const dateStr = ref.toISOString().slice(0, 10);

  const result = await pool.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(cost_usd), 0)::text AS total
     FROM api_costs
     WHERE DATE(created_at AT TIME ZONE 'UTC') = $1`,
    [dateStr],
  );

  const raw = result.rows[0]?.total ?? "0";
  return parseFloat(raw);
}

// ─── checkDailyCap ───────────────────────────────────────────────────────────

export interface DailyCapResult {
  /** true se ainda há saldo disponível */
  allowed: boolean;
  /** gasto acumulado hoje em USD */
  currentUsd: number;
  /** limite configurado em USD */
  capUsd: number;
}

/**
 * Verifica se o gasto diário está abaixo do cap configurado em
 * DAILY_COST_CAP_USD (default: 10).
 *
 * Em caso de falha no DB, retorna allowed=true para não bloquear usuários
 * por instabilidade de infraestrutura.
 */
export async function checkDailyCap(): Promise<DailyCapResult> {
  const capUsd = parseFloat(process.env.DAILY_COST_CAP_USD ?? "10");

  let currentUsd: number;
  try {
    currentUsd = await getDailyCost();
  } catch (err) {
    console.error("[cost-tracker] falha ao ler custo diário:", err);
    return { allowed: true, currentUsd: 0, capUsd };
  }

  return {
    allowed: currentUsd < capUsd,
    currentUsd,
    capUsd,
  };
}
