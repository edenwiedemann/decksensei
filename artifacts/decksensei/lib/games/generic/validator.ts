/**
 * Validador de decklist genérico dirigido por config.
 *
 * Lê ValidatorConfig do games.config.validator:
 * - main_deck_size: { min, max } — tamanho válido do deck principal
 * - aux_decks: Record<nome, { min, max }> — tamanho de cada deck auxiliar
 * - max_copies_per_card: limite de cópias por código de carta
 * - color_warning_threshold: aviso quando main deck tem mais que N cores (default 3)
 *
 * Mensagens em PT-BR parametrizadas pelos valores do config.
 */

import type { DeckValidator, ParsedDeck, ParsedCard, ValidationResult } from "../types";
import type { ValidatorConfig } from "../../game-config";

function cardLabel(card: ParsedCard): string {
  return card.cardName ? `${card.cardCode} (${card.cardName})` : card.cardCode;
}

function totalQty(cards: ParsedCard[]): number {
  return cards.reduce((acc, c) => acc + c.quantity, 0);
}

export class GenericDeckValidator implements DeckValidator {
  constructor(private readonly cfg: ValidatorConfig) {}

  validate(deck: ParsedDeck): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const mainTotal = totalQty(deck.mainDeck);
    const { min: mainMin, max: mainMax } = this.cfg.main_deck_size;

    // ── Main deck ────────────────────────────────────────────────────────────
    if (mainTotal < mainMin) {
      const diff = mainMin - mainTotal;
      errors.push(
        `Seu deck principal tem ${mainTotal} carta${mainTotal !== 1 ? "s" : ""} — ` +
          `faltam ${diff} pra completar ${mainMin}.`,
      );
    } else if (mainTotal > mainMax) {
      const diff = mainTotal - mainMax;
      errors.push(
        `Seu deck principal tem ${mainTotal} cartas — o limite é ${mainMax} ` +
          `(remova ${diff} carta${diff !== 1 ? "s" : ""}).`,
      );
    }

    // ── Decks auxiliares ─────────────────────────────────────────────────────
    for (const [section, limits] of Object.entries(this.cfg.aux_decks)) {
      const aux = deck.auxDecks[section] ?? [];
      const auxTotal = totalQty(aux);
      if (limits.min > 0 && auxTotal < limits.min) {
        errors.push(
          `Seu ${section} deck tem ${auxTotal} — mínimo é ${limits.min}.`,
        );
      }
      if (auxTotal > limits.max) {
        const diff = auxTotal - limits.max;
        errors.push(
          `Seu ${section} deck tem ${auxTotal} cartas — o máximo é ${limits.max} ` +
            `(remova ${diff} carta${diff !== 1 ? "s" : ""}).`,
        );
      }
    }

    // ── Cópias por código (todas as seções) ──────────────────────────────────
    const copiesMap = new Map<string, { qty: number; card: ParsedCard }>();
    for (const section of [deck.mainDeck, ...Object.values(deck.auxDecks)]) {
      for (const card of section) {
        const existing = copiesMap.get(card.cardCode);
        if (existing) {
          existing.qty += card.quantity;
        } else {
          copiesMap.set(card.cardCode, { qty: card.quantity, card });
        }
      }
    }
    for (const [, { qty, card }] of copiesMap) {
      if (qty > this.cfg.max_copies_per_card) {
        errors.push(
          `Você tem ${qty} cópias de ${cardLabel(card)} no deck — ` +
            `o limite é ${this.cfg.max_copies_per_card}.`,
        );
      }
    }

    // ── Avisos ───────────────────────────────────────────────────────────────

    // Mesmo código no main e em qualquer aux deck
    const mainCodes = new Set(deck.mainDeck.map((c) => c.cardCode));
    for (const [section, auxCards] of Object.entries(deck.auxDecks)) {
      for (const card of auxCards) {
        if (mainCodes.has(card.cardCode)) {
          warnings.push(
            `${cardLabel(card)} aparece no deck principal e no ${section} deck — ` +
              `verifique se isso é intencional.`,
          );
        }
      }
    }

    // Diversidade de cores (só disponível com EnrichedDeck)
    const threshold = this.cfg.color_warning_threshold ?? 3;
    const colors = new Set<string>();
    for (const card of deck.mainDeck) {
      const enriched = card as ParsedCard & {
        data?: { color?: string | null } | null;
      };
      if (enriched.data?.color) colors.add(enriched.data.color);
    }
    if (colors.size > threshold) {
      warnings.push(
        `Seu deck principal usa ${colors.size} cores diferentes ` +
          `(${[...colors].join(", ")}) — muitas cores podem prejudicar a consistência.`,
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
