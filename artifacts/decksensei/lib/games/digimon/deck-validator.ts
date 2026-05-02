/**
 * Validador de decklist para Digimon Card Game.
 *
 * Regras lidas inteiramente de DeckRules (games.config.deck_rules):
 *   - Tamanho do main deck (default competitivo: 50)
 *   - Tamanho do egg deck (0–5)
 *   - Máximo de cópias por código de carta (4)
 *
 * Erros bloqueantes (deck ilegal):
 *   - Main deck com tamanho errado
 *   - Egg deck acima do máximo
 *   - Mais de max_copies_per_card cópias de um mesmo código
 *
 * Avisos (não bloqueantes):
 *   - Mesmo código presente no main deck e egg deck
 *   - Mais de 3 cores no main deck (requer EnrichedDeck — skipped se não disponível)
 *
 * Todas as mensagens em PT-BR amigável.
 */

import type {
  DeckValidator,
  DeckRules,
  ParsedCard,
  ParsedDeck,
  ValidationResult,
} from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formata nome da carta para uso em mensagens: "BT13-040 (Magnamon)" ou "BT13-040". */
function cardLabel(card: ParsedCard): string {
  return card.cardName ? `${card.cardCode} (${card.cardName})` : card.cardCode;
}

/** Soma as quantidades de uma lista de cartas. */
function totalQty(cards: ParsedCard[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

/** Monta um Map de código → quantidade total somando todas as seções recebidas. */
function countCopies(sections: ParsedCard[][]): Map<string, { qty: number; card: ParsedCard }> {
  const map = new Map<string, { qty: number; card: ParsedCard }>();
  for (const section of sections) {
    for (const card of section) {
      const existing = map.get(card.cardCode);
      if (existing) {
        existing.qty += card.quantity;
      } else {
        map.set(card.cardCode, { qty: card.quantity, card });
      }
    }
  }
  return map;
}

// ─── Validator ───────────────────────────────────────────────────────────────

export class DigimonDeckValidator implements DeckValidator {
  validate(deck: ParsedDeck, rules: DeckRules): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const eggDeck = deck.auxDecks["egg"] ?? [];
    const mainTotal = totalQty(deck.mainDeck);
    const eggTotal = totalQty(eggDeck);

    // ── Erros ────────────────────────────────────────────────────────────────

    // 1. Tamanho do main deck
    if (mainTotal < rules.main_deck_size) {
      const diff = rules.main_deck_size - mainTotal;
      errors.push(
        `Seu deck principal tem ${mainTotal} carta${mainTotal !== 1 ? "s" : ""} — ` +
          `faltam ${diff} pra completar ${rules.main_deck_size}.`,
      );
    } else if (mainTotal > rules.main_deck_size) {
      const diff = mainTotal - rules.main_deck_size;
      errors.push(
        `Seu deck principal tem ${mainTotal} cartas — o limite é ${rules.main_deck_size} ` +
          `(remova ${diff} carta${diff !== 1 ? "s" : ""}).`,
      );
    }

    // 2. Tamanho do egg deck
    if (eggTotal > rules.egg_deck_max) {
      const diff = eggTotal - rules.egg_deck_max;
      errors.push(
        `Seu egg deck tem ${eggTotal} cartas — o máximo permitido é ${rules.egg_deck_max} ` +
          `(remova ${diff} carta${diff !== 1 ? "s" : ""}).`,
      );
    }

    // 3. Cópias por código (main + todos os auxDecks — regra oficial Digimon)
    // Não incluir eggDeck separado: já está dentro de Object.values(deck.auxDecks)
    const allSections = [deck.mainDeck, ...Object.values(deck.auxDecks)];
    const copiesMap = countCopies(allSections);

    for (const [, { qty, card }] of copiesMap) {
      if (qty > rules.max_copies_per_card) {
        errors.push(
          `Você tem ${qty} cópias de ${cardLabel(card)} no deck — ` +
            `o limite é ${rules.max_copies_per_card}.`,
        );
      }
    }

    // ── Avisos ───────────────────────────────────────────────────────────────

    // 4. Mesmo código no main deck e egg deck
    const mainCodes = new Set(deck.mainDeck.map((c) => c.cardCode));
    for (const eggCard of eggDeck) {
      if (mainCodes.has(eggCard.cardCode)) {
        warnings.push(
          `${cardLabel(eggCard)} aparece no deck principal e no egg deck — ` +
            `verifique se isso é intencional.`,
        );
      }
    }

    // 5. Mais de 3 cores no main deck (disponível apenas com EnrichedDeck)
    //    EnrichedDeck é estruturalmente compatível com ParsedDeck, então
    //    verificamos se os cards têm a propriedade `data` de EnrichedCard.
    const colors = new Set<string>();
    for (const card of deck.mainDeck) {
      const enriched = card as ParsedCard & { data?: { color?: string | null } | null };
      if (enriched.data?.color) {
        colors.add(enriched.data.color);
      }
    }
    if (colors.size > 3) {
      warnings.push(
        `Seu deck principal usa ${colors.size} cores diferentes (${[...colors].join(", ")}) — ` +
          `muitas cores podem prejudicar a consistência.`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
