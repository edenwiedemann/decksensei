/**
 * Adapter de API de cartas para Digimon Card Game.
 *
 * Fonte: digimoncard.io/api-public
 * Endpoint: https://digimoncard.io/api-public/search?card={code}
 *
 * Regras:
 * - Rate limit: 15 req / 10 s (fila serial com intervalo mínimo de 700 ms)
 * - Cache em memória (Map) — cartas não mudam entre sets
 * - Erros são silenciosos: carta fica com data = null, deck continua válido
 * - NÃO persistir dados em DB própria (licença da API)
 */

import type { CardAPI, CardData, EnrichedCard, EnrichedDeck, ParsedCard } from "../types";

// ─── Rate limiter (serial queue, 15 req / 10 s) ──────────────────────────────

const RATE_MAX = 15;
const RATE_WINDOW_MS = 10_000;
const MIN_INTERVAL_MS = Math.ceil(RATE_WINDOW_MS / RATE_MAX); // 667 ms

class SerialRateLimiter {
  /** Encadeia promessas para garantir execução serial com intervalo mínimo. */
  private chain: Promise<void> = Promise.resolve();
  private lastFiredAt = 0;

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(async (): Promise<T> => {
      const elapsed = Date.now() - this.lastFiredAt;
      if (elapsed < MIN_INTERVAL_MS) {
        await sleep(MIN_INTERVAL_MS - elapsed);
      }
      this.lastFiredAt = Date.now();
      return fn();
    });

    // A próxima tarefa espera apenas que esta COMECE (não que termine),
    // garantindo o intervalo entre disparos sem serializar o tempo de resposta.
    this.chain = result.then(
      () => {},
      () => {},
    );

    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── API response mapping ─────────────────────────────────────────────────────

// Campos reais da API (snake_case). Verificado em 2025-05.
interface DigimonApiCard {
  id?: string;           // código da carta, ex: "BT1-010"
  name?: string;
  color?: string;
  color2?: string | null;
  type?: string;         // "Digimon" | "Tamer" | "Option"
  level?: number | string | null;
  play_cost?: number | string | null;
  dp?: number | string | null;
  attribute?: string | null;
  digi_type?: string | null;
  form?: string | null;
  main_effect?: string | null;
  source_effect?: string | null;
  alt_effect?: string | null;
  pretty_url?: string | null;
  set_name?: string[] | null;
}

function mapApiCard(raw: DigimonApiCard, requestedCode: string): CardData {
  return {
    cardCode: raw.id ?? requestedCode,
    name: raw.name ?? "Unknown",
    color: raw.color ?? null,
    type: raw.type ?? null,
    level: raw.level != null ? Number(raw.level) : null,
    playCost: raw.play_cost != null ? Number(raw.play_cost) : null,
    dp: raw.dp != null ? Number(raw.dp) : null,
    attribute: raw.attribute ?? null,
    mainEffect: raw.main_effect || null,
    inheritedEffect: raw.source_effect || null,
    // A API pública não expõe image_url diretamente;
    // construído via pretty_url quando disponível.
    imageUrl: raw.pretty_url
      ? `https://digimoncard.io/images/cards/${raw.pretty_url}.jpg`
      : null,
  };
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class DigimonCardAPI implements CardAPI {
  /** Cache permanente: código normalizado → CardData | null */
  private readonly cache = new Map<string, CardData | null>();
  private readonly limiter = new SerialRateLimiter();

  async fetchCard(cardCode: string): Promise<CardData | null> {
    const key = cardCode.toUpperCase();

    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    const data = await this.limiter.schedule(() => this._fetchFromApi(key));
    this.cache.set(key, data);
    return data;
  }

  async fetchDeck(deck: ParsedCard[]): Promise<EnrichedDeck> {
    const enriched = await Promise.all(
      deck.map(async (card): Promise<EnrichedCard> => {
        const data = await this.fetchCard(card.cardCode);
        return { ...card, data };
      }),
    );

    const unknownCodes = enriched
      .filter((c) => c.data === null)
      .map((c) => c.cardCode);

    return {
      mainDeck: enriched,
      auxDecks: {},
      unknownCodes,
    };
  }

  private async _fetchFromApi(cardCode: string): Promise<CardData | null> {
    try {
      const url = `https://digimoncard.io/api-public/search?card=${encodeURIComponent(cardCode)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: { Accept: "application/json" },
      });

      if (!res.ok) return null;

      const data: unknown = await res.json();
      // Carta não encontrada: API retorna {"error":"No cards found..."} (não array)
      // Resultado vazio também cai aqui.
      if (!Array.isArray(data) || data.length === 0) return null;

      return mapApiCard(data[0] as DigimonApiCard, cardCode);
    } catch {
      // Timeout, rede indisponível ou JSON inválido — deck continua válido
      return null;
    }
  }
}
