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

export interface EnrichedCard extends ParsedCard {
  name: string;
  cost: number | null;
  color: string | null;
  type: string | null;
  attribute: string | null;
  effect: string | null;
  imageUrl: string | null;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export interface ParseResult {
  /**
   * Cartas do deck principal.
   */
  mainDeck: ParsedCard[];
  /**
   * Decks auxiliares indexados por nome (ex: "egg", "side").
   * Cada jogo pode ter 0 ou mais.
   */
  auxDecks: Record<string, ParsedCard[]>;
  /**
   * Erros descritivos em PT para linhas não reconhecidas ou inválidas.
   */
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
  fetchCards(codes: string[]): Promise<EnrichedCard[]>;
}

// ─── Game adapter (agrega tudo) ──────────────────────────────────────────────

export interface GameAdapter {
  parser: DeckParser;
  validator: DeckValidator;
  cardApi: CardAPI;
}
