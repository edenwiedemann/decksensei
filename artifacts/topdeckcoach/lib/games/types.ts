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
 */
export interface EnrichedDeck {
  mainDeck: EnrichedCard[];
  auxDecks: Record<string, EnrichedCard[]>;
  unknownCodes: string[];
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Deck estruturado sem os erros de parsing.
 * É o subconjunto de ParseResult que o validator consome.
 * EnrichedDeck é estruturalmente compatível (pode ser passado como ParsedDeck).
 */
export interface ParsedDeck {
  mainDeck: ParsedCard[];
  auxDecks: Record<string, ParsedCard[]>;
}

export interface ParseResult extends ParsedDeck {
  /** Erros descritivos em PT para linhas não reconhecidas ou inválidas. */
  errors: string[];
}

export interface DeckParser {
  parse(text: string): ParseResult;
}

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Regras estruturais de um deck, lidas de games.config.deck_rules.
 * Nunca hardcodadas no código — vêm sempre do banco.
 */
export interface DeckRules {
  main_deck_size: number;
  egg_deck_min: number;
  egg_deck_max: number;
  max_copies_per_card: number;
}

export interface ValidationResult {
  valid: boolean;
  /** Erros que impedem o deck de ser legal para jogo oficial. */
  errors: string[];
  /** Avisos sobre possíveis problemas estratégicos ou incomuns. */
  warnings: string[];
}

export interface DeckValidator {
  /**
   * Valida deck contra regras do jogo.
   * Aceita tanto ParsedDeck como EnrichedDeck (estruturalmente compatível).
   * Quando passado EnrichedDeck, avisos adicionais baseados em dados de carta
   * (ex.: diversidade de cores) também são gerados.
   */
  validate(deck: ParsedDeck, rules: DeckRules): ValidationResult;
}

// ─── Card API ─────────────────────────────────────────────────────────────────

export interface CardAPI {
  fetchCard(cardCode: string): Promise<CardData | null>;
  fetchDeck(deck: ParsedCard[]): Promise<EnrichedDeck>;
}

// ─── Game adapter ─────────────────────────────────────────────────────────────

export interface GameAdapter {
  parser: DeckParser;
  validator: DeckValidator;
  cardApi: CardAPI;
}
