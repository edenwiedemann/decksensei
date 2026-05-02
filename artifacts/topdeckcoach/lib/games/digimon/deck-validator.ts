/**
 * Validador de decklist para Digimon Card Game.
 * Regras: main deck = 50 cartas, egg deck = 0-5, máx 4 cópias por código.
 * Implementação completa prevista no Épico 2.
 */

import type { DeckValidator, ParseResult, ValidationResult } from "../types";

export class DigimonDeckValidator implements DeckValidator {
  validate(_result: ParseResult): ValidationResult {
    throw new Error(
      "DigimonDeckValidator.validate: não implementado (Épico 2)",
    );
  }
}
