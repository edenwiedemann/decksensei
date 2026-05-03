/**
 * Adapter de Card API genérico dirigido por config.
 *
 * Lê CardApiConfig do games.config.card_api:
 * - url_template: URL com {code} substituído pelo código da carta
 * - response_path: "$" = root, "$[0]" = primeiro elemento, "$.campo" = campo aninhado
 * - field_mapping: mapeamento de campo interno → caminho na resposta (dot-notation)
 * - image_url_template: template de URL de imagem com {fieldName} substituído
 * - rate_limit: max req / window_sec
 * - headers: cabeçalhos HTTP adicionais
 * - timeout_ms: timeout da requisição (padrão 8000ms)
 */

import type { CardAPI, CardData, EnrichedDeck, ParsedCard } from "../types";
import type { CardApiConfig } from "../../game-config";
import { SerialRateLimiter } from "./rate-limiter";

// ─── Resolução de path simples (sem dependência externa) ──────────────────────

function resolvePath(data: unknown, path: string): unknown {
  if (path === "$") return data;

  // "$[N]" → array index
  const arrRootMatch = /^\$\[(\d+)\]$/.exec(path);
  if (arrRootMatch) {
    return Array.isArray(data) ? data[parseInt(arrRootMatch[1], 10)] : null;
  }

  // "$.field" ou "$.field[N].sub"
  const normalized = path.startsWith("$.") ? path.slice(2) : path.replace(/^\$/, "");
  const parts = normalized.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    const idxMatch = /^(\w+)\[(\d+)\]$/.exec(part);
    if (idxMatch) {
      const arr = (current as Record<string, unknown>)[idxMatch[1]];
      current = Array.isArray(arr) ? arr[parseInt(idxMatch[2], 10)] : null;
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

function getByDotPath(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class GenericCardAPI implements CardAPI {
  /** Cache permanente: código normalizado → CardData | null */
  private readonly cache = new Map<string, CardData | null>();
  private readonly limiter: SerialRateLimiter;

  constructor(private readonly config: CardApiConfig) {
    this.limiter = new SerialRateLimiter(
      config.rate_limit.max,
      config.rate_limit.window_sec * 1_000,
    );
  }

  async fetchCard(cardCode: string): Promise<CardData | null> {
    const key = cardCode.toUpperCase();
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const data = await this.limiter.schedule(() => this._fetchFromApi(key));
    this.cache.set(key, data);
    return data;
  }

  async fetchDeck(deck: ParsedCard[]): Promise<EnrichedDeck> {
    const enriched = await Promise.all(
      deck.map(async (card) => ({
        ...card,
        data: await this.fetchCard(card.cardCode),
      })),
    );
    return {
      mainDeck: enriched,
      auxDecks: {},
      unknownCodes: enriched
        .filter((c) => c.data === null)
        .map((c) => c.cardCode),
    };
  }

  private async _fetchFromApi(cardCode: string): Promise<CardData | null> {
    const result = await this._tryFetch(cardCode);
    if (result !== null) return result;
    // Retry único após 500 ms — cobre instabilidades transitórias da API
    await new Promise<void>((r) => setTimeout(r, 500));
    return this._tryFetch(cardCode);
  }

  private async _tryFetch(cardCode: string): Promise<CardData | null> {
    try {
      const url = this.config.url_template.replace(
        "{code}",
        encodeURIComponent(cardCode),
      );
      const headers: Record<string, string> = {
        ...(this.config.headers ?? {}),
      };
      const timeout = this.config.timeout_ms ?? 8_000;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers,
      });

      if (!res.ok) return null;

      const raw: unknown = await res.json();
      const item = resolvePath(raw, this.config.response_path);

      if (!item || typeof item !== "object") return null;

      return this._mapFields(item as Record<string, unknown>, cardCode);
    } catch {
      return null;
    }
  }

  private _mapFields(
    item: Record<string, unknown>,
    requestedCode: string,
  ): CardData {
    const m = this.config.field_mapping;
    const get = (path: string | undefined): unknown =>
      path ? getByDotPath(item, path) : undefined;

    // Imagem: aplica image_url_template se disponível
    const imageRaw = get(m["imageUrl"]);
    let imageUrl: string | null = null;
    if (imageRaw && this.config.image_url_template) {
      imageUrl = this.config.image_url_template.replace(
        "{imageUrl}",
        String(imageRaw),
      );
    } else if (typeof imageRaw === "string" && imageRaw) {
      imageUrl = imageRaw;
    }

    const num = (v: unknown): number | null =>
      v != null && v !== "" ? Number(v) || null : null;

    const str = (v: unknown): string | null =>
      v != null && v !== "" ? String(v) : null;

    return {
      cardCode: str(get(m["code"])) ?? requestedCode,
      name: str(get(m["name"])) ?? "Unknown",
      color: str(get(m["color"])),
      type: str(get(m["type"])),
      level: num(get(m["level"])),
      playCost: num(get(m["playCost"])),
      dp: num(get(m["dp"])),
      attribute: str(get(m["attribute"])),
      mainEffect: str(get(m["mainEffect"])),
      inheritedEffect: str(get(m["inheritedEffect"])),
      imageUrl,
    };
  }
}
