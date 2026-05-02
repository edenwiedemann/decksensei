/**
 * Parser de decklist para Digimon Card Game.
 *
 * Formatos de linha suportados (insensível a maiúsculas):
 *   "4 BT4-016 Aldamon"      — quantidade  código  nome?
 *   "4x BT4-016 Aldamon"     — quantidade+ 'x' espaço código nome?
 *   "4xBT4-016"              — quantidade+'x' colado no código
 *   "BT4-016 x4"             — código  'x'+quantidade
 *   "BT4-016 4x"             — código  quantidade+'x'
 *
 * Prefixos de código válidos: BT, EX, ST, P, LM, RB
 *
 * Comentários: linhas começando com '#' ou '//' são ignoradas.
 * Seções: linha contendo "egg" (sem ser carta) inicia seção egg;
 *         linha contendo "main" retorna à seção principal.
 */

import type { DeckParser, ParseResult, ParsedCard } from "../types";

// ─── Regex ────────────────────────────────────────────────────────────────────

// \d* (zero ou mais) porque P-040 e LM-029 não têm dígitos de set antes do hífen
const CODE_PAT = `(?:BT|EX|ST|P|LM|RB)\\d*-\\d+`;

/** Valida isoladamente um código de carta. */
const CODE_ONLY_RE = new RegExp(`^(?:${CODE_PAT})$`, "i");

/** Linha: quantidade[x] código [nome] → grupos: [qty, code, name?] */
const FMT_QTY_FIRST_RE = new RegExp(
  `^(\\d+)x?\\s+(${CODE_PAT})(?:\\s+(.+))?$`,
  "i",
);

/** Linha: quantidade+'x' colado no código → grupos: [qty, code, name?] */
const FMT_QTY_ATTACHED_RE = new RegExp(
  `^(\\d+)x(${CODE_PAT})(?:\\s+(.+))?$`,
  "i",
);

/** Linha: código 'x'+quantidade [nome] → grupos: [code, qty, name?] */
const FMT_CODE_X_QTY_RE = new RegExp(
  `^(${CODE_PAT})\\s+x(\\d+)(?:\\s+(.+))?$`,
  "i",
);

/** Linha: código quantidade+'x' [nome] → grupos: [code, qty, name?] */
const FMT_CODE_QTY_SUFFIX_RE = new RegExp(
  `^(${CODE_PAT})\\s+(\\d+)x(?:\\s+(.+))?$`,
  "i",
);

/** Linha de seção egg: qualquer linha contendo 'egg' que não é carta. */
const EGG_SECTION_RE = /\begg\b/i;

/** Linha de seção main: permite retorno ao deck principal. */
const MAIN_SECTION_RE = /\bmain\b/i;

/** Linha de comentário: começa com '#' ou '//'. */
const COMMENT_RE = /^\s*(#|\/\/)/;

// ─── Parser ───────────────────────────────────────────────────────────────────

interface LineMatch {
  quantity: number;
  cardCode: string;
  cardName?: string;
}

function tryMatchLine(line: string): LineMatch | null {
  let m: RegExpExecArray | null;

  // "4x BT4-016" e "4 BT4-016" — testar antes de attached para não consumir o 'x'
  m = FMT_QTY_FIRST_RE.exec(line);
  if (m) {
    return {
      quantity: parseInt(m[1], 10),
      cardCode: m[2].toUpperCase(),
      cardName: m[3]?.trim() || undefined,
    };
  }

  // "4xBT4-016" — colado, sem espaço após o 'x'
  m = FMT_QTY_ATTACHED_RE.exec(line);
  if (m) {
    return {
      quantity: parseInt(m[1], 10),
      cardCode: m[2].toUpperCase(),
      cardName: m[3]?.trim() || undefined,
    };
  }

  // "BT4-016 x4"
  m = FMT_CODE_X_QTY_RE.exec(line);
  if (m) {
    return {
      quantity: parseInt(m[2], 10),
      cardCode: m[1].toUpperCase(),
      cardName: m[3]?.trim() || undefined,
    };
  }

  // "BT4-016 4x"
  m = FMT_CODE_QTY_SUFFIX_RE.exec(line);
  if (m) {
    return {
      quantity: parseInt(m[2], 10),
      cardCode: m[1].toUpperCase(),
      cardName: m[3]?.trim() || undefined,
    };
  }

  return null;
}

function isSectionHeader(line: string): boolean {
  // Uma linha de seção não começa com dígito nem com código de carta
  if (/^\d/.test(line)) return false;
  if (CODE_ONLY_RE.test(line.split(/\s/)[0])) return false;
  return true;
}

export class DigimonDeckParser implements DeckParser {
  parse(text: string): ParseResult {
    const mainDeck: ParsedCard[] = [];
    const eggDeck: ParsedCard[] = [];
    const errors: string[] = [];

    let currentSection: "main" | "egg" = "main";
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      const lineNum = i + 1;

      // Linha vazia
      if (!line) continue;

      // Comentário
      if (COMMENT_RE.test(line)) continue;

      // Tenta reconhecer como carta
      const match = tryMatchLine(line);
      if (match) {
        const card: ParsedCard = {
          quantity: match.quantity,
          cardCode: match.cardCode,
          ...(match.cardName ? { cardName: match.cardName } : {}),
        };

        if (currentSection === "egg") {
          eggDeck.push(card);
        } else {
          mainDeck.push(card);
        }
        continue;
      }

      // Tenta reconhecer como cabeçalho de seção
      if (isSectionHeader(line)) {
        if (EGG_SECTION_RE.test(line)) {
          currentSection = "egg";
          continue;
        }
        if (MAIN_SECTION_RE.test(line)) {
          currentSection = "main";
          continue;
        }
      }

      // Linha não reconhecida — gera erro descritivo
      const preview = line.length > 40 ? line.slice(0, 40) + "…" : line;
      errors.push(
        `Linha ${lineNum}: "${preview}" — formato não reconhecido. ` +
          `Use: "4 BT4-016 Nome", "4x BT4-016", ou "BT4-016 x4".`,
      );
    }

    const auxDecks: Record<string, ParsedCard[]> = {};
    if (eggDeck.length > 0) {
      auxDecks["egg"] = eggDeck;
    }

    return { mainDeck, auxDecks, errors };
  }
}
