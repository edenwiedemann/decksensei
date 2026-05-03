/**
 * Helpers compartilhados para paginação e filtro de grade do histórico.
 * Usados pelo endpoint GET /api/analyses/history e pela page server component.
 */

import type { DeckGrade } from "@/lib/deck-score";

export const PAGE_SIZE = 20;

export const GRADE_REGEX: Record<DeckGrade, string> = {
  A: String.raw`similaridade aproximada\s*\*\*(8[0-9]|9[0-9]|100)%`,
  B: String.raw`similaridade aproximada\s*\*\*(6[5-9]|7[0-9])%`,
  C: String.raw`similaridade aproximada\s*\*\*(5[0-9]|6[0-4])%`,
  D: String.raw`similaridade aproximada\s*\*\*([0-9]|[1-4][0-9])%`,
};

export const VALID_GRADES = new Set<string>(["A", "B", "C", "D"]);

/** Encodes the last item of a page into a stable opaque cursor string. */
export function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

/** Parses an opaque cursor; returns null on malformed input. */
export function parseCursor(raw: string): { ts: Date; id: string } | null {
  const sep = raw.lastIndexOf("|");
  if (sep < 1) return null;
  const ts = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (isNaN(ts.getTime()) || !id) return null;
  return { ts, id };
}
