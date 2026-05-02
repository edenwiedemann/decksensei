/**
 * Ponto de entrada dos adapters de jogo.
 * Retorna o parser ou cardAPI correto dado um gameId.
 * Adicionar novos jogos aqui quando implementados.
 */

import type { DeckParser, CardAPI } from "./types";
import { DigimonDeckParser } from "./digimon/deck-parser";
import { DigimonCardAPI } from "./digimon/card-api";

// Singletons — parser é stateless; cardAPI mantém cache em memória
const _digimonParser = new DigimonDeckParser();
const _digimonCardApi = new DigimonCardAPI();

const SUPPORTED = "digimon";

/**
 * Retorna o DeckParser para o jogo especificado.
 * Lança erro se o jogo não for suportado.
 */
export function getParser(gameId: string): DeckParser {
  switch (gameId) {
    case "digimon":
      return _digimonParser;
    default:
      throw new Error(
        `getParser: jogo "${gameId}" não tem parser implementado. ` +
          `Jogos suportados: ${SUPPORTED}.`,
      );
  }
}

/**
 * Retorna o CardAPI para o jogo especificado.
 * Lança erro se o jogo não for suportado.
 */
export function getCardAPI(gameId: string): CardAPI {
  switch (gameId) {
    case "digimon":
      return _digimonCardApi;
    default:
      throw new Error(
        `getCardAPI: jogo "${gameId}" não tem CardAPI implementado. ` +
          `Jogos suportados: ${SUPPORTED}.`,
      );
  }
}

export type { DeckParser, CardAPI, ParseResult, ParsedCard, CardData, EnrichedCard, EnrichedDeck } from "./types";
