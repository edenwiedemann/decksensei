/**
 * cost-tracker.ts
 *
 * Centraliza cálculo de custo, gravação em api_costs e verificação dos caps
 * diários de gasto com a API Anthropic.
 *
 * Dois caps independentes:
 *   - Produção (is_test=false) → DAILY_COST_CAP_USD     (default: $10)
 *   - Testes   (is_test=true)  → TEST_DAILY_COST_CAP_USD (default: $2)
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

// ─── getDailyProductionCost / getDailyTestCost ────────────────────────────────

/**
 * Retorna a soma dos custos de produção (is_test=false) no dia especificado.
 * Usa o fuso horário America/Sao_Paulo para delimitar o dia.
 *
 * @param date Data de referência (default: hoje em SP)
 */
export async function getDailyProductionCost(date?: Date): Promise<number> {
  return _getDailyCostByType(false, date);
}

/**
 * Retorna a soma dos custos de teste (is_test=true) no dia especificado.
 * Usa o fuso horário America/Sao_Paulo para delimitar o dia.
 *
 * @param date Data de referência (default: hoje em SP)
 */
export async function getDailyTestCost(date?: Date): Promise<number> {
  return _getDailyCostByType(true, date);
}

/**
 * @deprecated Use getDailyProductionCost() ou getDailyTestCost().
 * Mantido para compatibilidade com chamadas legadas (ex: admin pages que filtram por data).
 */
export async function getDailyCost(date?: Date): Promise<number> {
  return _getDailyCostByType(null, date);
}

async function _getDailyCostByType(
  isTest: boolean | null,
  date?: Date,
): Promise<number> {
  const isTestClause =
    isTest === null ? "" : `AND is_test = ${isTest}`;

  let result: { rows: Array<{ total: string | null }> };

  if (date) {
    const dateStr = date.toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    result = await pool.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(cost_usd), 0)::text AS total
       FROM api_costs
       WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = $1
       ${isTestClause}`,
      [dateStr],
    );
  } else {
    result = await pool.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(cost_usd), 0)::text AS total
       FROM api_costs
       WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') =
             DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
       ${isTestClause}`,
    );
  }

  const raw = result.rows[0]?.total ?? "0";
  return parseFloat(raw);
}

// ─── Resultado de cap ─────────────────────────────────────────────────────────

export interface DailyCapResult {
  /** true se ainda há saldo disponível */
  allowed: boolean;
  /** gasto acumulado hoje em USD */
  currentUsd: number;
  /** limite configurado em USD */
  capUsd: number;
}

// ─── checkProductionCap ───────────────────────────────────────────────────────

/**
 * Verifica se o gasto de produção (is_test=false) está abaixo do cap
 * configurado em DAILY_COST_CAP_USD (default: $10).
 *
 * Em caso de falha no DB, retorna allowed=true para não bloquear usuários
 * por instabilidade de infraestrutura.
 */
export async function checkProductionCap(): Promise<DailyCapResult> {
  const capUsd = parseFloat(process.env.DAILY_COST_CAP_USD ?? "10");

  let currentUsd: number;
  try {
    currentUsd = await getDailyProductionCost();
  } catch (err) {
    console.error("[cost-tracker] falha ao ler custo de produção:", err);
    return { allowed: true, currentUsd: 0, capUsd };
  }

  return {
    allowed: currentUsd < capUsd,
    currentUsd,
    capUsd,
  };
}

/**
 * @deprecated Use checkProductionCap(). Alias para compatibilidade.
 */
export async function checkDailyCap(): Promise<DailyCapResult> {
  return checkProductionCap();
}

// ─── checkTestCap ─────────────────────────────────────────────────────────────

/**
 * Verifica se o gasto de testes (is_test=true) está abaixo do cap
 * configurado em TEST_DAILY_COST_CAP_USD (default: $2).
 *
 * Em caso de falha no DB, retorna allowed=true para não bloquear testes
 * por instabilidade de infraestrutura.
 */
export async function checkTestCap(): Promise<DailyCapResult> {
  const capUsd = parseFloat(process.env.TEST_DAILY_COST_CAP_USD ?? "2");

  let currentUsd: number;
  try {
    currentUsd = await getDailyTestCost();
  } catch (err) {
    console.error("[cost-tracker] falha ao ler custo de testes:", err);
    return { allowed: true, currentUsd: 0, capUsd };
  }

  return {
    allowed: currentUsd < capUsd,
    currentUsd,
    capUsd,
  };
}
