/** Tipos e helpers de score de deck — usados em DeckInput e AnalysisResult. */

export type DeckGrade = "A" | "B" | "C" | "D";

/**
 * Extrai o percentual de similaridade do texto da análise e devolve
 * o grade correspondente.
 * Retorna null se a seção de comparação ainda não chegou (streaming).
 */
export function computeDeckGrade(
  text: string,
): { grade: DeckGrade; pct: number } | null {
  const m = text.match(/similaridade aproximada\s*\*\*(\d+)%\*?\*?/);
  if (!m) return null;
  const pct = parseInt(m[1], 10);
  return {
    grade: pct >= 80 ? "A" : pct >= 65 ? "B" : pct >= 50 ? "C" : "D",
    pct,
  };
}

/** Converte um título de seção em slug para âncora HTML. */
export function sectionSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
