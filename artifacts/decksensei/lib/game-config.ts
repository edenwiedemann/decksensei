// DeckRules é a fonte canônica em lib/games/types.ts
import type { DeckRules } from "./games/types";
export type { DeckRules };

// ─── Novos blocos de config ────────────────────────────────────────────────────

export interface ParserConfig {
  /**
   * Lista de regex com capture groups para reconhecer linhas de carta.
   * Tentados em ordem — o primeiro que casar é usado.
   */
  line_patterns: string[];
  /** Índices dos capture groups (1-based, como em regex). */
  groups: { quantity: number; code: number; name?: number };
  /**
   * Mapeamento de nome interno da seção auxiliar → lista de strings que a ativam.
   * Ex: { "egg": ["egg deck", "digi-egg deck", "ovos"] }
   */
  section_markers: Record<string, string[]>;
  /** Prefixos que marcam a linha como comentário. Ex: ["#", "//"] */
  comment_prefixes: string[];
}

export interface CardApiConfig {
  /** URL da carta com {code} substituído pelo código. */
  url_template: string;
  /** URL de busca por nome com {query} substituído. */
  search_url_template?: string;
  /**
   * Caminho na resposta JSON até o objeto da carta.
   * "$" = root, "$[0]" = primeiro elemento de array, "$.data" = campo aninhado.
   */
  response_path: string;
  /**
   * Mapeamento campo interno → caminho dot-notation na resposta.
   * Campos internos: code, name, color, type, level, playCost, dp,
   *                  attribute, mainEffect, inheritedEffect, imageUrl
   */
  field_mapping: Record<string, string>;
  /** Template de URL de imagem. Usa {imageUrl} substituído pelo campo mapeado. */
  image_url_template?: string;
  /** Rate limit: max requisições por janela de window_sec segundos. */
  rate_limit: { max: number; window_sec: number };
  /** Headers HTTP adicionais. Ex: { "Accept": "application/json" } */
  headers?: Record<string, string>;
  /** Timeout da requisição em ms. Padrão: 8000. */
  timeout_ms?: number;
}

export interface ValidatorConfig {
  /** Tamanho válido do deck principal. */
  main_deck_size: { min: number; max: number };
  /** Tamanhos válidos de cada deck auxiliar. Chave = nome interno da seção. */
  aux_decks: Record<string, { min: number; max: number }>;
  /** Máximo de cópias do mesmo código em qualquer seção combinada. */
  max_copies_per_card: number;
  /** Aviso quando main deck usa mais que N cores distintas. Padrão: 3. */
  color_warning_threshold?: number;
}

// ─── GameConfig completo ───────────────────────────────────────────────────────

export interface GameConfig {
  id: string;
  name: string;
  card_code_pattern: string;
  card_code_examples?: string[];
  deck_rules: DeckRules;
  card_data_source?: { name: string; license_notes_pt?: string };
  parser: ParserConfig;
  card_api: CardApiConfig;
  validator: ValidatorConfig;
}

// ─── parseDeckList (mantida para compatibilidade) ─────────────────────────────

export interface DeckParseResult {
  totalCards: number;
  mainDeckCount: number;
  eggDeckCount: number;
  linesRecognized: number;
}

/**
 * Versão simplificada para contagem rápida de cartas.
 * Para parsing completo use getParser() de lib/games/index.ts.
 */
export function parseDeckList(
  text: string,
  config: GameConfig,
): DeckParseResult {
  const codeCore = config.card_code_pattern
    .replace(/^\^/, "")
    .replace(/\$$/, "");
  const lineRegex = new RegExp(`^(\\d+)\\s+(${codeCore})(?:\\s+.*)?$`, "i");
  const eggHeaderRegex = /egg/i;

  let mainDeckCount = 0;
  let eggDeckCount = 0;
  let linesRecognized = 0;
  let inEggSection = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = lineRegex.exec(line);
    if (match) {
      const count = parseInt(match[1], 10);
      if (inEggSection) {
        eggDeckCount += count;
      } else {
        mainDeckCount += count;
      }
      linesRecognized++;
    } else if (eggHeaderRegex.test(line)) {
      inEggSection = true;
    }
  }

  return {
    totalCards: mainDeckCount + eggDeckCount,
    mainDeckCount,
    eggDeckCount,
    linesRecognized,
  };
}
