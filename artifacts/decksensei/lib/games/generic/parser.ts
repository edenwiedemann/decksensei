/**
 * Parser de decklist genérico dirigido por config.
 *
 * Lê ParserConfig do games.config.parser e aplica:
 * - line_patterns: lista de regex (tentados em ordem) para reconhecer linhas de carta
 * - groups: índices dos capture groups para quantity, code e name opcional
 * - section_markers: mapa de seção → lista de strings que a ativam (case-insensitive)
 * - comment_prefixes: prefixos que marcam linha como comentário
 */

import type { DeckParser, ParseResult, ParsedCard } from "../types";
import type { ParserConfig } from "../../game-config";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class GenericDeckParser implements DeckParser {
  private readonly patterns: RegExp[];
  private readonly groups: { quantity: number; code: number; name?: number };
  private readonly sectionMarkers: Record<string, RegExp[]>;
  private readonly commentPrefixes: string[];

  constructor(config: ParserConfig) {
    this.patterns = config.line_patterns.map((p) => new RegExp(p, "i"));
    this.groups = config.groups;
    this.commentPrefixes = config.comment_prefixes;

    this.sectionMarkers = {};
    for (const [section, markers] of Object.entries(config.section_markers)) {
      this.sectionMarkers[section] = markers.map(
        (m) => new RegExp(escapeRegex(m), "i"),
      );
    }
  }

  parse(text: string): ParseResult {
    const mainDeck: ParsedCard[] = [];
    const auxDecks: Record<string, ParsedCard[]> = {};
    const errors: string[] = [];
    let currentSection = "main";

    // Inicializa todas as seções auxiliares definidas no config
    for (const section of Object.keys(this.sectionMarkers)) {
      auxDecks[section] = [];
    }

    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      if (!line) continue;

      // Comentário
      if (this.commentPrefixes.some((p) => line.startsWith(p))) continue;

      // Tenta reconhecer como carta
      let matched = false;
      for (const pattern of this.patterns) {
        const m = pattern.exec(line);
        if (m) {
          const qty = parseInt(m[this.groups.quantity], 10);
          const code = m[this.groups.code].toUpperCase();
          const name =
            this.groups.name != null
              ? m[this.groups.name]?.trim() || undefined
              : undefined;

          const card: ParsedCard = {
            quantity: qty,
            cardCode: code,
            ...(name ? { cardName: name } : {}),
          };

          if (currentSection === "main") {
            mainDeck.push(card);
          } else {
            auxDecks[currentSection] ??= [];
            auxDecks[currentSection].push(card);
          }
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Tenta reconhecer como marcador de seção auxiliar
      let sectionFound = false;
      for (const [section, regexes] of Object.entries(this.sectionMarkers)) {
        if (regexes.some((r) => r.test(line))) {
          currentSection = section;
          sectionFound = true;
          break;
        }
      }
      if (sectionFound) continue;

      // Palavra "main" retorna ao deck principal
      if (/\bmain\b/i.test(line)) {
        currentSection = "main";
        continue;
      }

      // Linha não reconhecida
      const preview = line.length > 40 ? line.slice(0, 40) + "…" : line;
      errors.push(
        `Linha ${lineNum}: "${preview}" — formato não reconhecido.`,
      );
    }

    // Remove seções vazias do resultado
    for (const key of Object.keys(auxDecks)) {
      if (auxDecks[key].length === 0) delete auxDecks[key];
    }

    return { mainDeck, auxDecks, errors };
  }
}
