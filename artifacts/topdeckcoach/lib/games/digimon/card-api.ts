/**
 * Adapter de API de cartas para Digimon Card Game.
 * Fonte: digimoncard.io/api-public
 * Limite: 15 req por 10s — usar com cache em runtime.
 * NÃO copiar dados para DB própria (licença da API).
 */

import type { CardAPI, EnrichedCard } from "../types";

export class DigimonCardAPI implements CardAPI {
  async fetchCards(_codes: string[]): Promise<EnrichedCard[]> {
    throw new Error("DigimonCardAPI.fetchCards: não implementado (Épico 2)");
  }
}
