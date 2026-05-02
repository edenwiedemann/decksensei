/**
 * Parser de decklist para Digimon Card Game.
 * Formatos suportados: a definir no Épico 2.
 * Padrão de código válido: ^(BT|EX|ST|P|LM|RB)\d+-\d+$
 */

import type { DeckParser, ParsedDeck } from "../types";

export class DigimonDeckParser implements DeckParser {
  parse(_deckText: string): ParsedDeck {
    throw new Error("DigimonDeckParser.parse: não implementado (Épico 2)");
  }
}
