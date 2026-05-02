/**
 * Interfaces TCG-agnósticas para adapters específicos de cada jogo.
 * Cada jogo implementa estas interfaces em lib/games/<jogo>/.
 */

export interface ParsedCard {
  code: string;
  qty: number;
  section: "main" | "egg" | "side";
}

export interface EnrichedCard {
  code: string;
  qty: number;
  section: "main" | "egg" | "side";
  name: string;
  cost: number | null;
  color: string | null;
  type: string | null;
  attribute: string | null;
  effect: string | null;
  imageUrl: string | null;
}

export interface ParsedDeck {
  main: ParsedCard[];
  egg: ParsedCard[];
  side: ParsedCard[];
  raw: string;
}

export interface ValidationError {
  code: string;
  message_pt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface CardAPI {
  /** Busca dados de uma lista de códigos de carta. */
  fetchCards(codes: string[]): Promise<EnrichedCard[]>;
}

export interface DeckParser {
  /** Analisa o texto de uma decklist e retorna cartas estruturadas. */
  parse(deckText: string): ParsedDeck;
}

export interface DeckValidator {
  /** Valida uma decklist contra as regras do jogo. */
  validate(deck: ParsedDeck): ValidationResult;
}

export interface GameAdapter {
  cardApi: CardAPI;
  parser: DeckParser;
  validator: DeckValidator;
}
