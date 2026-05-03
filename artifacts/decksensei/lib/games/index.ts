/**
 * Ponto de entrada dos adapters de jogo.
 *
 * Cada função recebe o bloco de config correspondente de games.config
 * e retorna a instância do adapter genérico.
 *
 * A config chega via prop do server component ([game]/page.tsx lê do DB e
 * passa GameConfig para DeckInput) — sem acesso a banco no cliente.
 */

import type { DeckParser, CardAPI, DeckValidator } from "./types";
import { GenericDeckParser } from "./generic/parser";
import { GenericCardAPI } from "./generic/card-api";
import { GenericDeckValidator } from "./generic/validator";
import type { ParserConfig, CardApiConfig, ValidatorConfig } from "../game-config";

export function getParser(config: ParserConfig): DeckParser {
  return new GenericDeckParser(config);
}

export function getCardAPI(config: CardApiConfig): CardAPI {
  return new GenericCardAPI(config);
}

export function getValidator(config: ValidatorConfig): DeckValidator {
  return new GenericDeckValidator(config);
}

export type {
  DeckParser,
  CardAPI,
  DeckValidator,
  ParseResult,
  ParsedDeck,
  ParsedCard,
  CardData,
  EnrichedCard,
  EnrichedDeck,
  DeckRules,
  ValidationResult,
} from "./types";
