/**
 * Pipeline DigimonMeta (sourceId: "digimonmeta-review", peso 70, editorial).
 *
 * Consome a WP REST API do digimonmeta.com e importa artigos de deck review
 * publicados após a última execução bem-sucedida. Evidências editoriais são
 * auto-verificadas (verified = true).
 *
 * Fingerprint: categoria "deckreview" com ID 280 ainda existe na WP REST API.
 */

import { pool } from "@workspace/db";
import type { EvidencePipeline, FingerprintCheck, PipelineRun } from "../../types";
import { upsertEvidence } from "../../upsert";
import type { AliasMap } from "../bandai/shared";

const GAME_ID = "digimon";
const SOURCE_ID = "digimonmeta-review";
const WP_BASE = "https://digimonmeta.com/wp-json/wp/v2";
const EXPECTED_CATEGORY_ID = 280;

// ─── Config helpers ───────────────────────────────────────────────────────────

interface GameConfig {
  archetype_aliases?: AliasMap;
}

async function getGameConfig(): Promise<GameConfig> {
  const r = await pool.query<{ config: GameConfig }>(
    `SELECT config FROM games WHERE id = $1 LIMIT 1`,
    [GAME_ID],
  );
  return r.rows[0]?.config ?? {};
}

async function getLastSuccessfulRunDate(): Promise<Date> {
  const r = await pool.query<{ imported_at: Date }>(
    `SELECT imported_at FROM meta_archetype_evidences
     WHERE source_id = $1
     ORDER BY imported_at DESC
     LIMIT 1`,
    [SOURCE_ID],
  );
  return r.rows[0]?.imported_at ?? new Date("2024-01-01");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Tenta identificar o archetypeId pelo título do post, buscando aliases
 * da configuração do jogo. Começa pelo título (alta confiança) — sem fallback
 * de content por ora (muitos falso-positivos).
 */
function detectArchetypeFromTitle(title: string, aliases: AliasMap): string | null {
  const titleLower = title.toLowerCase();
  for (const [archetypeId, names] of Object.entries(aliases)) {
    for (const name of names) {
      if (titleLower.includes(name.toLowerCase())) {
        return archetypeId;
      }
    }
  }
  return null;
}

/** Remove tags HTML simples de uma string. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Conta referências a códigos de carta (ex: BT21-040, EX5-001). */
function countCardMentions(contentHtml: string): number {
  return (contentHtml.match(/[A-Z]{1,3}\d+-\d+/g) ?? []).length;
}

// ─── DigimonMetaPipeline ─────────────────────────────────────────────────────

export class DigimonMetaPipeline implements EvidencePipeline {
  sourceId = SOURCE_ID;

  async validateFingerprint(): Promise<FingerprintCheck> {
    const failures: string[] = [];

    let catData: unknown;
    try {
      const res = await fetch(
        `${WP_BASE}/categories?slug=deckreview`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) {
        failures.push(`WP REST API retornou ${res.status} para /categories?slug=deckreview`);
        return { ok: false, failures };
      }
      catData = await res.json();
    } catch (err) {
      failures.push(`DigimonMeta inacessível: ${String(err)}`);
      return { ok: false, failures };
    }

    if (
      !Array.isArray(catData) ||
      catData.length === 0 ||
      (catData[0] as { id: number }).id !== EXPECTED_CATEGORY_ID
    ) {
      const found = Array.isArray(catData) && catData.length > 0
        ? ` (encontrado ID ${(catData[0] as { id: number }).id})`
        : "";
      failures.push(
        `Categoria "deckreview" não encontrada com ID ${EXPECTED_CATEGORY_ID}${found} — pode ter sido renomeada/deletada`,
      );
    }

    return { ok: failures.length === 0, failures };
  }

  async import(): Promise<PipelineRun> {
    const config = await getGameConfig();
    const aliases: AliasMap = config.archetype_aliases ?? {};

    const since = await getLastSuccessfulRunDate();
    const sinceISO = since.toISOString();

    const url =
      `${WP_BASE}/posts` +
      `?categories=${EXPECTED_CATEGORY_ID}` +
      `&per_page=20` +
      `&after=${encodeURIComponent(sinceISO)}` +
      `&_fields=id,date,title,content,slug,link`;

    let posts: Array<{
      id: number;
      date: string;
      title: { rendered: string };
      content: { rendered: string };
      slug: string;
      link: string;
    }>;

    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return {
          itemsImported: 0,
          archetypesUpdated: [],
          warnings: [`DigimonMeta WP API retornou ${res.status}`],
        };
      }
      posts = await res.json();
    } catch (err) {
      return {
        itemsImported: 0,
        archetypesUpdated: [],
        warnings: [`Erro ao buscar posts: ${String(err)}`],
      };
    }

    if (!Array.isArray(posts)) {
      return {
        itemsImported: 0,
        archetypesUpdated: [],
        warnings: ["DigimonMeta WP API retornou resposta inesperada (não é array)"],
      };
    }

    let itemsImported = 0;
    const archetypesUpdated: string[] = [];
    const warnings: string[] = [];

    for (const post of posts) {
      const titleText = stripHtml(post.title?.rendered ?? "");
      const contentHtml = post.content?.rendered ?? "";

      const archetypeId = detectArchetypeFromTitle(titleText, aliases);
      if (!archetypeId) {
        warnings.push(`Post "${titleText.slice(0, 60)}" não mapeado para arquetipo`);
        continue;
      }

      const cardMentions = countCardMentions(contentHtml);
      const authorSlug = (post.slug ?? "").split("-")[0] ?? null;

      await upsertEvidence({
        gameId: GAME_ID,
        archetypeId,
        sourceId: SOURCE_ID,
        eventLabel: titleText.slice(0, 200),
        eventDate: new Date(post.date).toISOString().slice(0, 10),
        url: post.link,
        data: {
          type: "review_article",
          cards_mentioned: cardMentions,
          author_slug: authorSlug,
          wp_post_id: post.id,
        },
        verified: true,
        verifiedBy: "digimonmeta-auto-import",
      });

      itemsImported++;
      if (!archetypesUpdated.includes(archetypeId)) {
        archetypesUpdated.push(archetypeId);
      }
    }

    return { itemsImported, archetypesUpdated, warnings };
  }
}
