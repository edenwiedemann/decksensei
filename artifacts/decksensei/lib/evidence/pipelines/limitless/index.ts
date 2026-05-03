/**
 * Pipeline Limitless TCG (sourceId: "limitless-tcg", peso 50).
 *
 * Agrega dados estatísticos de win rate e matchups do Limitless para o
 * formato atual do Digimon Card Game. Não é auto_verified (dados agregados,
 * não listas individuais de torneios oficiais).
 */

import { pool } from "@workspace/db";
import type { EvidencePipeline, FingerprintCheck, PipelineRun } from "../../types";
import { upsertEvidence } from "../../upsert";
import { formatWeek } from "../../utils";
import { mapDeckNameToArchetypeId, type AliasMap } from "../bandai/shared";
import {
  fetchArchetypeList,
  fetchMatchups,
  fetchTopDecklist,
} from "./scraper";

const GAME_ID = "digimon";
const BASE = "https://play.limitlesstcg.com";

// ─── Config helpers ───────────────────────────────────────────────────────────

interface GameConfig {
  current_format?: string;
  archetype_aliases?: AliasMap;
  evidence_sources?: Array<{ id: string; min_sample_size?: number }>;
}

async function getGameConfig(): Promise<GameConfig> {
  const r = await pool.query<{ config: GameConfig }>(
    `SELECT config FROM games WHERE id = $1 LIMIT 1`,
    [GAME_ID],
  );
  return r.rows[0]?.config ?? {};
}

// ─── LimitlessPipeline ────────────────────────────────────────────────────────

export class LimitlessPipeline implements EvidencePipeline {
  sourceId = "limitless-tcg";

  async validateFingerprint(): Promise<FingerprintCheck> {
    const failures: string[] = [];

    const config = await getGameConfig();
    const currentFormat = config.current_format ?? "BT21";
    const url = `${BASE}/decks?game=DCG&format=standard&set=${encodeURIComponent(currentFormat)}`;

    // Check 1: página da listagem acessível
    let html = "";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        failures.push(`Limitless retornou ${res.status} para listagem`);
        return { ok: false, failures };
      }
      html = await res.text();
    } catch (err) {
      failures.push(`Limitless inacessível: ${String(err)}`);
      return { ok: false, failures };
    }

    // Check 2: links /decks/{slug}?game=DCG presentes
    if (!/href="\/decks\/[^"?]+\?[^"]*game=DCG/i.test(html)) {
      failures.push("Limitless: layout mudou — nenhum link /decks/{slug}?game=DCG encontrado");
    }

    // Check 3: amostra de decklist tem string mágica
    const archMatch = html.match(/href="(\/decks\/[^"?]+)\?/);
    if (archMatch) {
      try {
        const archRes = await fetch(
          `${BASE}${archMatch[1]}?game=DCG&format=standard&set=${encodeURIComponent(currentFormat)}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        const archHtml = await archRes.text();
        const declistLinkMatch = archHtml.match(
          /\/tournament\/[a-f0-9]+\/player\/[^"']+\/decklist/,
        );
        if (declistLinkMatch) {
          const declistRes = await fetch(`${BASE}${declistLinkMatch[0]}`, {
            signal: AbortSignal.timeout(10_000),
          });
          const declistHtml = await declistRes.text();
          if (!declistHtml.includes("const decklist = `")) {
            failures.push("Limitless: parser de decklist quebrou — string mágica ausente");
          }
        }
      } catch {
        // Falha silenciosa — não bloqueia se a sample não estiver disponível
      }
    }

    return { ok: failures.length === 0, failures };
  }

  async import(): Promise<PipelineRun> {
    const config = await getGameConfig();
    const currentFormat = config.current_format ?? "BT21";
    const aliases: AliasMap = config.archetype_aliases ?? {};

    const evSource = config.evidence_sources?.find((s) => s.id === "limitless-tcg");
    const minSample = evSource?.min_sample_size ?? 100;

    const archetypes = await fetchArchetypeList(currentFormat);

    let itemsImported = 0;
    const archetypesUpdated: string[] = [];
    const warnings: string[] = [];

    for (const arch of archetypes) {
      const sampleSize = arch.wins + arch.losses + arch.ties;

      // Pula arquétipos sem amostra mínima
      if (sampleSize < minSample) {
        continue;
      }

      const archetypeId = mapDeckNameToArchetypeId(arch.name, aliases);
      if (!archetypeId) {
        warnings.push(`Arquetipo "${arch.name}" não mapeado — adicionar alias`);
        continue;
      }

      // Coleta matchups (best-effort)
      let goodMatchups: Array<{ vs: string; win_rate_pct: number }> = [];
      let badMatchups: Array<{ vs: string; win_rate_pct: number }> = [];
      try {
        const matchups = await fetchMatchups(arch.slug, currentFormat);
        goodMatchups = matchups
          .filter((m) => m.win_rate_pct >= 50)
          .map((m) => ({ vs: m.vs, win_rate_pct: m.win_rate_pct }));
        badMatchups = matchups
          .filter((m) => m.win_rate_pct < 50)
          .map((m) => ({ vs: m.vs, win_rate_pct: m.win_rate_pct }));
      } catch {
        // matchups são opcionais
      }

      // Top decklist (best-effort)
      const exampleDecklist = await fetchTopDecklist(arch.slug, currentFormat).catch(() => null);

      const eventLabel = `Limitless agregado ${currentFormat} ${formatWeek(new Date())}`;
      const archUrl = `${BASE}/decks/${arch.slug}?game=DCG&format=standard&set=${encodeURIComponent(currentFormat)}`;

      await upsertEvidence({
        gameId: GAME_ID,
        archetypeId,
        sourceId: this.sourceId,
        eventLabel,
        eventDate: new Date().toISOString().slice(0, 10),
        url: archUrl,
        data: {
          sample_size: sampleSize,
          win_rate: arch.win_rate_pct,
          share_pct: arch.share_pct,
          record: `${arch.wins}-${arch.losses}-${arch.ties}`,
          good_matchups: goodMatchups,
          bad_matchups: badMatchups,
          example_decklist: exampleDecklist,
        },
        verified: false,
      });

      itemsImported++;
      archetypesUpdated.push(archetypeId);
    }

    return { itemsImported, archetypesUpdated, warnings };
  }
}
