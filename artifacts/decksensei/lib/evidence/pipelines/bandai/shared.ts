/**
 * Lógica compartilhada pelas 4 pipelines Bandai.
 *
 * Funções:
 *  - discoverReports     — descobre URLs de reports ainda não processados
 *  - parseReportPage     — extrai metadados de um report
 *  - parsePlayerListPage — parseia tabela de participantes
 *  - mapDeckNameToArchetypeId — normaliza e casa contra aliases
 *  - aggregateAppearances    — agrupa por arquétipo, conta aparições
 *  - importEventReport       — orquestra tudo e faz upsert das evidências
 */

import { pool } from "@workspace/db";
import { upsertEvidence } from "../../upsert";

const GAME_ID = "digimon";
const BANDAI_BASE = "https://world.digimoncard.com";
const BOT_HEADERS = { "User-Agent": "DeckSensei-Bot/1.0 (https://decksensei.com.br)" };

export type AliasMap = Record<string, string[]>;

interface ParsedReport {
  eventLabel: string;
  eventDate: string;
  playerListUrl: string | null;
}

interface Participant {
  playerName: string;
  area: string;
  deckName: string;
}

interface AppearanceResult {
  archetypeId: string;
  appearances: number;
  share_pct: number;
}

export interface ImportResult {
  archetypeCount: number;
  archetypeIds: string[];
  unmatched: string[];
}

// ─── discoverReports ──────────────────────────────────────────────────────────

/**
 * Busca a página de eventos da Bandai e retorna URLs de reports que:
 *  1. Casam com eventTypePattern (filtro por tipo de evento)
 *  2. Ainda NÃO foram processados para este sourceId
 */
export async function discoverReports(
  sourceId: string,
  eventTypePattern: RegExp,
): Promise<string[]> {
  const res = await fetch(`${BANDAI_BASE}/event/`, {
    signal: AbortSignal.timeout(15_000),
    headers: BOT_HEADERS,
  });
  if (!res.ok) throw new Error(`Event page returned ${res.status}`);
  const html = await res.text();

  const linkRegex = /href="(\/report\/[^"]+)"/g;
  const matched: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    if (m[1] && eventTypePattern.test(m[1])) {
      matched.push(`${BANDAI_BASE}${m[1]}`);
    }
  }

  if (matched.length === 0) return [];

  const existing = await pool.query<{ url: string }>(
    `SELECT DISTINCT url FROM meta_archetype_evidences
     WHERE source_id = $1 AND url IS NOT NULL`,
    [sourceId],
  );
  const seen = new Set(existing.rows.map((r) => r.url));

  return matched.filter((url) => !seen.has(url));
}

// ─── parseReportPage ──────────────────────────────────────────────────────────

export async function parseReportPage(reportUrl: string): Promise<ParsedReport> {
  const res = await fetch(reportUrl, {
    signal: AbortSignal.timeout(15_000),
    headers: BOT_HEADERS,
  });
  if (!res.ok) throw new Error(`Report page ${reportUrl} returned ${res.status}`);
  const html = await res.text();

  // Event label: <h1> ou <title>
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const rawLabel = (h1 ?? title ?? reportUrl).replace(/\s+/g, " ");
  const eventLabel = rawLabel.slice(0, 200);

  // Data: procura YYYY-MM-DD ou variantes no conteúdo
  const dateMatch = html.match(/(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  let eventDate = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    const [, y, mo, d] = dateMatch;
    eventDate = `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // Link da lista de participantes
  const playerMatch = html.match(
    /href="([^"]*(?:player\.php|player-list|participant)[^"]*)"/i,
  );
  let playerListUrl: string | null = null;
  if (playerMatch?.[1]) {
    playerListUrl = playerMatch[1].startsWith("http")
      ? playerMatch[1]
      : `${BANDAI_BASE}${playerMatch[1]}`;
  }

  return { eventLabel, eventDate, playerListUrl };
}

// ─── parsePlayerListPage ──────────────────────────────────────────────────────

export async function parsePlayerListPage(
  playerListUrl: string,
): Promise<Participant[]> {
  const res = await fetch(playerListUrl, {
    signal: AbortSignal.timeout(20_000),
    headers: BOT_HEADERS,
  });
  if (!res.ok) throw new Error(`Player list page returned ${res.status}`);
  const html = await res.text();

  const participants: Participant[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    if (/<th/i.test(row)) continue;

    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    }

    if (cells.length >= 3) {
      participants.push({ playerName: cells[0]!, area: cells[1]!, deckName: cells[2]! });
    } else if (cells.length === 2) {
      participants.push({ playerName: cells[0]!, area: "", deckName: cells[1]! });
    }
  }

  return participants.filter((p) => p.deckName.trim().length > 0);
}

// ─── mapDeckNameToArchetypeId ─────────────────────────────────────────────────

export function mapDeckNameToArchetypeId(
  deckName: string,
  aliases: AliasMap,
): string | null {
  const normalized = deckName.trim().toLowerCase();
  if (!normalized) return null;

  for (const [archetypeId, aliasList] of Object.entries(aliases)) {
    // Exact alias match
    for (const alias of aliasList) {
      if (alias.toLowerCase() === normalized) return archetypeId;
    }
    // Partial containment (alias inside deckName)
    for (const alias of aliasList) {
      if (normalized.includes(alias.toLowerCase())) return archetypeId;
    }
    // archetypeId normalizado como fallback
    if (archetypeId.replace(/_/g, " ").toLowerCase() === normalized) {
      return archetypeId;
    }
  }

  return null;
}

// ─── aggregateAppearances ─────────────────────────────────────────────────────

export function aggregateAppearances(
  participants: Participant[],
  aliases: AliasMap,
): { appearances: AppearanceResult[]; unmatched: string[] } {
  const counts = new Map<string, number>();
  const unmatched: string[] = [];

  for (const p of participants) {
    const id = mapDeckNameToArchetypeId(p.deckName, aliases);
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    } else if (!unmatched.includes(p.deckName)) {
      unmatched.push(p.deckName);
    }
  }

  const total = participants.length;
  const appearances: AppearanceResult[] = [];
  for (const [archetypeId, count] of counts.entries()) {
    appearances.push({
      archetypeId,
      appearances: count,
      share_pct: total > 0 ? Math.round((count / total) * 10_000) / 100 : 0,
    });
  }

  return { appearances, unmatched };
}

// ─── Busca aliases do games.config ────────────────────────────────────────────

async function fetchAliases(): Promise<AliasMap> {
  const r = await pool.query<{ config: Record<string, unknown> }>(
    `SELECT config FROM games WHERE id = $1 LIMIT 1`,
    [GAME_ID],
  );
  const cfg = r.rows[0]?.config ?? {};
  return (cfg["archetype_aliases"] as AliasMap | undefined) ?? {};
}

// ─── importEventReport ────────────────────────────────────────────────────────

export async function importEventReport(
  sourceId: string,
  reportUrl: string,
): Promise<ImportResult> {
  const [aliases, report] = await Promise.all([
    fetchAliases(),
    parseReportPage(reportUrl),
  ]);

  if (!report.playerListUrl) {
    console.warn(`[bandai][${sourceId}] No player list URL: ${reportUrl}`);
    return { archetypeCount: 0, archetypeIds: [], unmatched: [] };
  }

  const participants = await parsePlayerListPage(report.playerListUrl);
  if (participants.length === 0) {
    console.warn(`[bandai][${sourceId}] No participants at: ${report.playerListUrl}`);
    return { archetypeCount: 0, archetypeIds: [], unmatched: [] };
  }

  const { appearances, unmatched } = aggregateAppearances(participants, aliases);

  if (unmatched.length > 0) {
    console.warn(
      `[bandai][${sourceId}] ${unmatched.length} unmatched deck names for "${report.eventLabel}":`,
      unmatched,
    );
  }

  const verifiedAt = new Date();
  const archetypeIds: string[] = [];

  for (const app of appearances) {
    await upsertEvidence({
      gameId: GAME_ID,
      archetypeId: app.archetypeId,
      sourceId,
      eventLabel: report.eventLabel,
      eventDate: report.eventDate,
      url: reportUrl,
      data: {
        appearances: app.appearances,
        share_pct: app.share_pct,
        sample_size: participants.length,
        placement: null,
        won_event: false,
      },
      verified: true,
      verifiedBy: "bandai-auto-import",
      verifiedAt,
    });
    archetypeIds.push(app.archetypeId);
  }

  return { archetypeCount: appearances.length, archetypeIds, unmatched };
}
