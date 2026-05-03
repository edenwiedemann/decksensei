/**
 * Computa a pontuação de confiança de um arquétipo a partir de evidências.
 *
 * Fatores:
 *  - Decay temporal: evidências mais antigas valem menos
 *  - Multiplicador de verificação: evidências verificadas valem mais
 *  - Sample adequacy: penaliza amostras muito pequenas
 *
 * Retorna um número entre 0 e 100.
 */

interface EvidenceInput {
  /** Data do evento (usado para calcular a idade em dias). */
  eventDate: Date;
  /** Se a evidência foi verificada manualmente. */
  verified: boolean;
  /** Número de amostras representado por esta evidência (ex: número de decks). */
  sampleSize: number;
  /** Peso base da evidência (ex: 1.0 para resultado de torneio, 0.5 para lista pública). */
  baseWeight: number;
}

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

/**
 * Multiplicador de verificação:
 *  - verified=true: 1.0
 *  - verified=false: 0.6
 */
function verifiedMultiplier(verified: boolean): number {
  return verified ? 1.0 : 0.6;
}

/**
 * Adequação de amostra: clamp(sampleSize / minSample, 0, 1)
 * minSample padrão = 5 (deck list mínima para ser estatisticamente relevante).
 */
function sampleAdequacy(sampleSize: number, minSample = 5): number {
  return Math.min(1, Math.max(0, sampleSize / minSample));
}

/**
 * Computa a confiança agregada de um arquétipo a partir de uma lista de evidências.
 * Score normalizado: min(100, totalWeight / 1.5)
 */
export function computeArchetypeConfidence(
  evidences: EvidenceInput[],
  minSample = 5,
): number {
  const now = Date.now();
  let totalWeight = 0;

  for (const ev of evidences) {
    const ageDays = (now - ev.eventDate.getTime()) / 86_400_000;
    const decay = temporalDecay(ageDays);
    const verif = verifiedMultiplier(ev.verified);
    const adequacy = sampleAdequacy(ev.sampleSize, minSample);
    totalWeight += ev.baseWeight * decay * verif * adequacy;
  }

  return Math.min(100, totalWeight / 1.5);
}
