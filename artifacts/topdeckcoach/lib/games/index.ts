/**
 * Ponto de entrada dos adapters de jogo.
 * Retorna parser, cardAPI ou validator correto dado um gameId.
 * Adicionar novos jogos aqui quando implementados.
 */

import type { DeckParser, CardAPI, DeckValidator } from "./types";
import { DigimonDeckParser } from "./digimon/deck-parser";
import { DigimonCardAPI } from "./digimon/card-api";
import { DigimonDeckValidator } from "./digimon/deck-validator";

// Singletons — parser e validator são stateless; cardAPI mantém cache
const _digimonParser = new DigimonDeckParser();
const _digimonCardApi = new DigimonCardAPI();
const _digimonValidator = new DigimonDeckValidator();

const SUPPORTED = "digimon";

export function getParser(gameId: string): DeckParser {
  switch (gameId) {
    case "digimon":
      return _digimonParser;
    default:
      throw new Error(
        `getParser: jogo "${gameId}" não tem parser implementado. Jogos suportados: ${SUPPORTED}.`,
      );
  }
}

export function getCardAPI(gameId: string): CardAPI {
  switch (gameId) {
    case "digimon":
      return _digimonCardApi;
    default:
      throw new Error(
        `getCardAPI: jogo "${gameId}" não tem CardAPI implementado. Jogos suportados: ${SUPPORTED}.`,
      );
  }
}

export function getValidator(gameId: string): DeckValidator {
  switch (gameId) {
    case "digimon":
      return _digimonValidator;
    default:
      throw new Error(
        `getValidator: jogo "${gameId}" não tem DeckValidator implementado. Jogos suportados: ${SUPPORTED}.`,
      );
  }
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
