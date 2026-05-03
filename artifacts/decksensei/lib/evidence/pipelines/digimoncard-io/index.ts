/**
 * Pipeline DigimonCard.io (sourceId: "digimoncard-io", peso 25, self-reported).
 *
 * Tenta consumir a API interna do digimoncard.io para obter os arquetipos mais
 * representados em top placements de torneios (3 meses, Tier 2+).
 *
 * Endpoint-alvo: GET /api/tier-list/archetypes
 * Resposta: { success: true, archetypes: [{ archetype, percentage, archetype_image_url }] }
 *
 * LIMITAÇÃO CONHECIDA: A API interna é protegida por Cloudflare e retorna 403
 * quando chamada server-side (Node.js). O fingerprint usa apenas o endpoint
 * público /api-public/search (que não tem Cloudflare). O import registra warning
 * gracioso quando a API está bloqueada — não marca o pipeline como "broken".
 *
 * "percentage" = % de top placements nos últimos 3 meses (não win rate).
 * Como não há sample_size numérico, usamos min_share_pct como limiar
 * (config: evidence_sources[id=digimoncard-io].min_share_pct ?? 1.0).
 *
 * verified = false (self-reported, sem verificação editorial).
 */

import { pool } from "@workspace/db";
import type { EvidencePipeline, FingerprintCheck, PipelineRun } from "../../types";
import { upsertEvidence } from "../../upsert";
import { formatWeek } from "../../utils";
import { mapDeckNameToArchetypeId, type AliasMap } from "../bandai/shared";

const GAME_ID = "digimon";
const SOURCE_ID = "digimoncard-io";
const BASE = "https://digimoncard.io";
const TIER_LIST_API = `${BASE}/api/tier-list/archetypes`;
const CARD_SEARCH_API = `${BASE}/api-public/search?card=BT13-040`;
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": `${BASE}/`,
  "Origin": BASE,
  "Accept": "application/json, */*",
};

// ─── Config helpers ───────────────────────────────────────────────────────────

interface GameConfig {
  archetype_aliases?: AliasMap;
  evidence_sources?: Array<{ id: string; min_sample_size?: number; min_share_pct?: number }>;
}

async function getGameConfig(): Promise<GameConfig> {
  const r = await pool.query<{ config: GameConfig }>(
    `SELECT config FROM games WHERE id = $1 LIMIT 1`,
    [GAME_ID],
  );
  return r.rows[0]?.config ?? {};
}

// ─── DigimonCard.io API types ─────────────────────────────────────────────────

interface TierListApiResponse {
  success: boolean;
  archetypes: Array<{
    archetype: string;
    percentage: number;
    archetype_image_url?: string;
  }>;
}

// ─── DigimonCardIoPipeline ────────────────────────────────────────────────────

export class DigimonCardIoPipeline implements EvidencePipeline {
  sourceId = SOURCE_ID;

  async validateFingerprint(): Promise<FingerprintCheck> {
    const failures: string[] = [];

    // Check: usa o endpoint público /api-public/search (sem Cloudflare)
    // para confirmar que o domínio está up. A API de tier-list (/api/tier-list/archetypes)
    // é protegida por Cloudflare server-side e não é usada no fingerprint.
    try {
      const res = await fetch(CARD_SEARCH_API, {
        headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        failures.push(`DigimonCard.io card API retornou ${res.status} — domínio pode estar fora do ar`);
      } else {
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          failures.push("DigimonCard.io card API retornou resposta inesperada — schema mudou");
        }
      }
    } catch (err) {
      failures.push(`DigimonCard.io inacessível: ${String(err)}`);
    }

    return { ok: failures.length === 0, failures };
  }

  async import(): Promise<PipelineRun> {
    const config = await getGameConfig();
    const aliases: AliasMap = config.archetype_aliases ?? {};

    const evSource = config.evidence_sources?.find((s) => s.id === SOURCE_ID);
    const minSharePct = evSource?.min_share_pct ?? 1.0;

    const warnings: string[] = [];
    let apiData: TierListApiResponse | null = null;

    // Tenta a API interna de tier-list. Pode retornar 403 (Cloudflare) server-side.
    try {
      const res = await fetch(TIER_LIST_API, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 403) {
        warnings.push(
          "DigimonCard.io tier-list API bloqueada por Cloudflare (403) — " +
          "dados não disponíveis server-side nesta execução",
        );
      } else if (!res.ok) {
        warnings.push(`DigimonCard.io tier-list API retornou ${res.status}`);
      } else {
        const parsed = await res.json() as TierListApiResponse;
        if (parsed.success && Array.isArray(parsed.archetypes) && parsed.archetypes.length > 0) {
          apiData = parsed;
        } else {
          warnings.push(
            `DigimonCard.io API: success=${parsed.success}, ${parsed.archetypes?.length ?? 0} arquetipos`,
          );
        }
      }
    } catch (err) {
      warnings.push(`Erro ao acessar DigimonCard.io tier-list: ${String(err)}`);
    }

    if (!apiData) {
      return { itemsImported: 0, archetypesUpdated: [], warnings };
    }

    const eventLabel = `DigimonCard.io tier-list ${formatWeek(new Date())}`;
    const eventDate = new Date().toISOString().slice(0, 10);

    let itemsImported = 0;
    const archetypesUpdated: string[] = [];

    for (const arch of apiData.archetypes) {
      if (arch.percentage < minSharePct) continue;

      const archetypeId = mapDeckNameToArchetypeId(arch.archetype, aliases);
      if (!archetypeId) {
        warnings.push(`DigimonCard.io: "${arch.archetype}" não mapeado`);
        continue;
      }

      await upsertEvidence({
        gameId: GAME_ID,
        archetypeId,
        sourceId: SOURCE_ID,
        eventLabel,
        eventDate,
        url: `${BASE}/tier-list`,
        data: {
          share_pct: arch.percentage,
          image_url: arch.archetype_image_url ?? null,
          win_rate: null,
          sample_size: null,
        },
        verified: false,
      });

      itemsImported++;
      if (!archetypesUpdated.includes(archetypeId)) {
        archetypesUpdated.push(archetypeId);
      }
    }

    return { itemsImported, archetypesUpdated, warnings };
  }
}
