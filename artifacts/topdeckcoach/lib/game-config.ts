// DeckRules é a fonte canônica em lib/games/types.ts
export type { DeckRules } from "./games/types";

export interface GameConfig {
  id: string;
  name: string;
  card_code_pattern: string;
  card_code_examples?: string[];
  deck_rules: DeckRules;
}

export interface DeckParseResult {
  totalCards: number;
  mainDeckCount: number;
  eggDeckCount: number;
  linesRecognized: number;
}

/**
 * Parses a raw decklist string into card counts.
 * Egg deck section is detected by any header line containing "egg"
 * that doesn't itself look like a card line.
 */
export function parseDeckList(
  text: string,
  config: GameConfig,
): DeckParseResult {
  const codeCore = config.card_code_pattern
    .replace(/^\^/, "")
    .replace(/\$$/, "");
  const lineRegex = new RegExp(`^(\\d+)\\s+(${codeCore})(?:\\s+.*)?$`, "i");
  const eggHeaderRegex = /egg/i;

  let mainDeckCount = 0;
  let eggDeckCount = 0;
  let linesRecognized = 0;
  let inEggSection = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = lineRegex.exec(line);
    if (match) {
      const count = parseInt(match[1], 10);
      if (inEggSection) {
        eggDeckCount += count;
      } else {
        mainDeckCount += count;
      }
      linesRecognized++;
    } else if (eggHeaderRegex.test(line)) {
      inEggSection = true;
    }
  }

  return {
    totalCards: mainDeckCount + eggDeckCount,
    mainDeckCount,
    eggDeckCount,
    linesRecognized,
  };
}
