/**
 * Constrói o prompt completo para o Claude a partir dos dados carregados do DB.
 *
 * Implementado no prompt seguinte — este arquivo define a interface pública
 * que o route.ts já importa para garantir compilação correta antes da
 * implementação chegar.
 */

import type { ParsedDeck, EnrichedCard } from "@/lib/games/types";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface GameConfigForPrompt {
  id: string;
  name: string;
  deck_rules: {
    main_deck_size: number;
    egg_deck_min: number;
    egg_deck_max: number;
    max_copies_per_card: number;
    notes_pt?: string;
  };
  card_code_pattern: string;
  card_code_examples: string[];
}

export interface AnalysisContext {
  gameId: string;
  gameName: string;
  gameConfig: GameConfigForPrompt;
  /** Conteúdo bruto de prompts.system_content — contém {{placeholders}}. */
  systemTemplate: string;
  /** JSON completo de meta_snapshots.json_content. */
  metaSnapshot: unknown;
  deck: ParsedDeck;
  enrichedCards: EnrichedCard[];
}

export interface BuiltPrompt {
  /** Mensagem system enviada ao Claude (após substituição de placeholders). */
  systemPrompt: string;
  /** Mensagem do usuário com deck + cartas enriquecidas formatados. */
  userMessage: string;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Substitui todos os {{placeholders}} do template de system e monta a
 * mensagem do usuário com o deck estruturado + cartas enriquecidas + meta.
 *
 * TODO: implementar no próximo prompt.
 */
export function buildAnalysisPrompt(_ctx: AnalysisContext): BuiltPrompt {
  throw new Error(
    "buildAnalysisPrompt: não implementado ainda — chega no próximo prompt.",
  );
}
