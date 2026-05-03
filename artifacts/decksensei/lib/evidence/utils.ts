/**
 * Utilitários compartilhados entre pipelines de evidências.
 */

/**
 * Calcula o número da semana ISO 8601 (01–53) para uma data.
 */
function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Move para a quinta-feira mais próxima (ISO: semana começa na segunda)
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Formata uma data como "YYYY-WWW" (ano + semana ISO, zero-padded).
 * Ex: 2025-W03
 */
export function formatWeek(d: Date): string {
  const year = d.getUTCFullYear();
  const week = getISOWeek(d);
  return `${year}-W${week.toString().padStart(2, "0")}`;
}
