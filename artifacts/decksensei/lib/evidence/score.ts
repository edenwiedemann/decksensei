/**
 * Computa a pontuação de confiança de um arquétipo a partir das evidências no DB.
 *
 * A função principal `computeArchetypeConfidence` é DB-aware e assíncrona:
 * busca as evidências do arquetipo, aplica decay temporal, multiplicador de
 * verificação e adequação de amostra, e retorna metadata completa de cada
 * evidência para que `buildArchetypeBlock` possa ordená-las por relevância.
 *
 * A função síncrona `computeConfidenceScore` é mantida para componentes que
 * já têm as evidências em memória (ex: EvidencesBlock no painel admin).
 */

import { pool } from "@workspace/db";

// ─── Pesos por fonte ──────────────────────────────────────────────────────────

export const SOURCE_WEIGHTS: Record<string, number> = {
  "bandai-worlds-final":       100,
  "bandai-regionals":           90,
  "bandai-ultimate-cup":        85,
  "bandai-store-championship":  75,
  "digimonmeta-review":         70,
  "limitless-tcg":              50,
  "digimoncard-io":             25,
};

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface EvidenceInput {
  eventDate: Date;
  verified: boolean;
  sampleSize: number;
  baseWeight: number;
}

export interface EvidenceWithMeta {
  id: number;
  source_id: string;
  event_label: string;
  event_date: Date;
  url: string | null;
  data: { sample_size?: number; win_rate?: number; appearances?: number } | null;
  verified: boolean;
  sourceWeight: number;
  recencyFactor: number;
}

export interface ArchetypeConfidenceResult {
  score: number;
  weightedWinRate: number | null;
  winRateRange: [number, number] | null;
  totalSampleSize: number;
  evidences: EvidenceWithMeta[];
}

// ─── Helpers puros ────────────────────────────────────────────────────────────

/**
 * Fator de decay temporal:
 *  - 0–30 dias: 1.0
 *  - 30–180 dias: linear de 1.0 → 0.5
 *  - 180–365 dias: linear de 0.5 → 0.3
 *  - > 365 dias: 0.3
 */
function temporalDecay(ageDays: number): number {
  if (ageDays <= 30) return 1.0;
  if (ageDays <= 180) return 1.0 - ((ageDays - 30) / 150) * 0.5;
  if (ageDays <= 365) return 0.5 - ((ageDays - 180) / 185) * 0.2;
  return 0.3;
}

/** Exportado para que o prompt builder possa usar na ordenação de evidências. */
export function computeRecencyFactor(eventDate: Date): number {
  const ageDays = (Date.now() - eventDate.getTime()) / 86_400_000;
  return temporalDecay(ageDays);
}

function verifiedMultiplier(verified: boolean): number {
  return verified ? 1.0 : 0.6;
}

function sampleAdequacy(sampleSize: number, minSample = 5): number {
  return Math.min(1, Math.max(0, sampleSize / minSample));
}

// ─── Versão síncrona (para callers com evidências já em memória) ──────────────

/**
 * Computa o score de confiança a partir de uma lista de EvidenceInput já
 * em memória. Usada pelo EvidencesBlock do painel admin.
 * Score normalizado: min(100, totalWeight / 1.5)
 */
export function computeConfidenceScore(
  evidences: EvidenceInput[],
  minSample = 5,
): number {
  let totalWeight = 0;
  for (const ev of evidences) {
    const ageDays = (Date.now() - ev.eventDate.getTime()) / 86_400_000;
    const decay = temporalDecay(ageDays);
    const verif = verifiedMultiplier(ev.verified);
    const adequacy = sampleAdequacy(ev.sampleSize, minSample);
    totalWeight += ev.baseWeight * decay * verif * adequacy;
  }
  return Math.min(100, totalWeight / 1.5);
}

// ─── Versão DB-aware (para o prompt builder) ──────────────────────────────────

/**
 * Busca as evidências do arquetipo no DB e computa o score de confiança.
 *
 * Retorna metadados por evidência (sourceWeight, recencyFactor) para que
 * buildArchetypeBlock possa ordenar e formatar evidências no contexto injetado
 * no prompt do Claude.
 */
export async function computeArchetypeConfidence(
  gameId: string,
  archetypeId: string,
): Promise<ArchetypeConfidenceResult> {
  const r = await pool.query<{
    id: number;
    source_id: string;
    event_label: string;
    event_date: Date;
    url: string | null;
    data: Record<string, unknown> | null;
    verified: boolean;
  }>(
    `SELECT id, source_id, event_label, event_date, url, data, verified
     FROM meta_archetype_evidences
     WHERE game_id = $1 AND archetype_id = $2`,
    [gameId, archetypeId],
  );

  if (r.rows.length === 0) {
    return {
      score: 0,
      weightedWinRate: null,
      winRateRange: null,
      totalSampleSize: 0,
      evidences: [],
    };
  }

  let totalWeight = 0;
  let weightedWrSum = 0;
  let wrWeightSum = 0;
  const winRates: number[] = [];
  let totalSampleSize = 0;

  const evidences: EvidenceWithMeta[] = r.rows.map((row) => {
    const sourceWeight = SOURCE_WEIGHTS[row.source_id] ?? 10;
    const eventDate = new Date(row.event_date);
    const recencyFactor = computeRecencyFactor(eventDate);
    const verif = verifiedMultiplier(row.verified);
    const data = row.data as {
      sample_size?: number;
      win_rate?: number;
      appearances?: number;
    } | null;
    const sampleSize = data?.sample_size ?? 0;
    const adequacy = sampleAdequacy(sampleSize);

    const weight = (sourceWeight / 100) * recencyFactor * verif * adequacy;
    totalWeight += weight;

    if (data?.win_rate != null) {
      winRates.push(data.win_rate);
      weightedWrSum += data.win_rate * weight;
      wrWeightSum += weight;
    }

    totalSampleSize += sampleSize;

    return {
      id: row.id,
      source_id: row.source_id,
      event_label: row.event_label,
      event_date: eventDate,
      url: row.url,
      data,
      verified: row.verified,
      sourceWeight,
      recencyFactor,
    };
  });

  const score = Math.min(100, Math.round(totalWeight / 1.5));
  const weightedWinRate = wrWeightSum > 0 ? weightedWrSum / wrWeightSum : null;
  const winRateRange: [number, number] | null =
    winRates.length >= 2
      ? [Math.min(...winRates), Math.max(...winRates)]
      : null;

  return { score, weightedWinRate, winRateRange, totalSampleSize, evidences };
}
