/**
 * Ponto de entrada dos adapters de jogo.
 * Retorna o parser correto dado um gameId.
 * Adicionar novos jogos aqui quando implementados.
 */

import type { DeckParser } from "./types";
import { DigimonDeckParser } from "./digimon/deck-parser";

const _digimonParser = new DigimonDeckParser();

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
          `Jogos suportados: digimon.`,
      );
  }
}

export type { DeckParser, ParseResult, ParsedCard } from "./types";
