/**
 * Validador de decklist para Digimon Card Game.
 * Regras: main deck = 50 cartas, egg deck = 0-5, máx 4 cópias por código.
 */

import type { DeckValidator, ParsedDeck, ValidationResult } from "../types";

export class DigimonDeckValidator implements DeckValidator {
  validate(_deck: ParsedDeck): ValidationResult {
    throw new Error(
      "DigimonDeckValidator.validate: não implementado (Épico 2)",
    );
  }
}
