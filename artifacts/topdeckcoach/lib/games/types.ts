/**
 * Interfaces TCG-agnósticas para adapters específicos de cada jogo.
 * Cada jogo implementa estas interfaces em lib/games/<jogo>/.
 */

// ─── Card primitives ─────────────────────────────────────────────────────────

export interface ParsedCard {
  quantity: number;
  cardCode: string;
  cardName?: string;
}

/**
 * Dados brutos de uma carta vindos da API externa do jogo.
 * null quando a carta não foi encontrada ou houve erro na busca.
 */
export interface CardData {
  cardCode: string;
  name: string;
  color: string | null;
  type: string | null;
  level: number | null;
  playCost: number | null;
  dp: number | null;
  attribute: string | null;
  mainEffect: string | null;
  inheritedEffect: string | null;
  imageUrl: string | null;
}

/**
 * Carta parseada + dados enriquecidos da API.
 * data === null quando a busca falhou silenciosamente.
 */
export interface EnrichedCard extends ParsedCard {
  data: CardData | null;
}

/**
 * Deck completo com todas as seções enriquecidas.
 * unknownCodes lista os códigos cujo fetch retornou null.
 */
export interface EnrichedDeck {
  mainDeck: EnrichedCard[];
  auxDecks: Record<string, EnrichedCard[]>;
  unknownCodes: string[];
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export interface ParseResult {
  /** Cartas do deck principal. */
  mainDeck: ParsedCard[];
  /**
   * Decks auxiliares indexados por nome (ex: "egg", "side").
   * Cada jogo pode ter 0 ou mais.
   */
  auxDecks: Record<string, ParsedCard[]>;
  /** Erros descritivos em PT para linhas não reconhecidas ou inválidas. */
  errors: string[];
}

export interface DeckParser {
  parse(text: string): ParseResult;
}

// ─── Validator ───────────────────────────────────────────────────────────────

export interface ValidationError {
  code: string;
  message_pt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface DeckValidator {
  validate(result: ParseResult): ValidationResult;
}

// ─── Card API ─────────────────────────────────────────────────────────────────

export interface CardAPI {
  /**
   * Busca dados de uma carta pelo código.
   * Retorna null se a carta não for encontrada ou ocorrer erro.
   * Resultados são cacheados em memória.
   */
  fetchCard(cardCode: string): Promise<CardData | null>;

  /**
   * Enriquece uma lista de cartas parseadas buscando dados da API.
   * Respeita o rate limit do jogo. Erros são silenciosos (data = null).
   */
  fetchDeck(deck: ParsedCard[]): Promise<EnrichedDeck>;
}

// ─── Game adapter (agrega tudo) ──────────────────────────────────────────────

export interface GameAdapter {
  parser: DeckParser;
  validator: DeckValidator;
  cardApi: CardAPI;
}
