/**
 * Constrói o prompt completo para o Claude.
 *
 * buildAnalysisPrompt({ gameId, deck, enrichedCards })
 *   → Promise<{ system, messages, promptVersionId, metaSnapshotId }>
 *
 * Todos os dados do DB são carregados internamente com cache de 60 s.
 */

import type { ParsedDeck, EnrichedCard } from "@/lib/games/types";
import {
  db,
  eq,
  and,
  gamesTable,
  promptsTable,
  metaSnapshotsTable,
} from "@workspace/db";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface BuiltPrompt {
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  promptVersionId: number;
  metaSnapshotId: number;
  /** Lista de arquetipos da snapshot global — usada para extrair similar_archetype_id após o stream. */
  archetypes: MetaArchetype[];
}

export class PromptBuildError extends Error {
  constructor(
    message: string,
    public readonly statusHint: 404 | 503 | 500 = 500,
  ) {
    super(message);
    this.name = "PromptBuildError";
  }
}

/** Mantido para compatibilidade com consumidores externos. */
export interface GameConfigForPrompt {
  card_code_pattern: string;
  card_code_examples: string[];
  deck_rules: {
    main_deck_size: number;
    egg_deck_min: number;
    egg_deck_max: number;
    max_copies_per_card: number;
    notes_pt?: string;
  };
}

// ─── Cache em memória (60 s TTL) ──────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60_000;

function fromCache<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.value as T;
  return null;
}

function toCache(key: string, value: unknown): void {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheHas(key: string): boolean {
  const entry = _cache.get(key);
  return !!(entry && Date.now() < entry.expiresAt);
}

// ─── Tipos de schema do DB ────────────────────────────────────────────────────

type GameRow = typeof gamesTable.$inferSelect;
type PromptRow = typeof promptsTable.$inferSelect;
type SnapshotRow = typeof metaSnapshotsTable.$inferSelect;

// ─── Fetch helpers com cache ──────────────────────────────────────────────────

async function getGame(gameId: string): Promise<GameRow> {
  const key = `game:${gameId}`;
  const cached = fromCache<GameRow>(key);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, gameId))
    .limit(1);

  if (!rows[0])
    throw new PromptBuildError(`Jogo não encontrado: ${gameId}`, 404);

  toCache(key, rows[0]);
  return rows[0];
}

async function getActivePrompt(gameId: string): Promise<PromptRow> {
  const key = `prompt:active:${gameId}`;
  const cached = fromCache<PromptRow>(key);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(promptsTable)
    .where(
      and(eq(promptsTable.gameId, gameId), eq(promptsTable.active, true)),
    )
    .limit(1);

  if (!rows[0])
    throw new PromptBuildError(
      `Nenhum prompt ativo para o jogo: ${gameId} — configure via /admin/prompts`,
      503,
    );

  toCache(key, rows[0]);
  return rows[0];
}

async function getActiveGlobalSnapshot(gameId: string): Promise<SnapshotRow> {
  const key = `snapshot:active:global:${gameId}`;
  const cached = fromCache<SnapshotRow>(key);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(metaSnapshotsTable)
    .where(
      and(
        eq(metaSnapshotsTable.gameId, gameId),
        eq(metaSnapshotsTable.scope, "global"),
        eq(metaSnapshotsTable.active, true),
      ),
    )
    .limit(1);

  if (!rows[0])
    throw new PromptBuildError(
      `Nenhuma snapshot de meta ativa para o jogo: ${gameId} — configure via /admin/meta`,
      503,
    );

  toCache(key, rows[0]);
  return rows[0];
}

/**
 * Busca a snapshot local ativa (ex: meta Recife).
 * Retorna null sem lançar erro caso não exista — a análise continua só com o meta global.
 */
async function getActiveLocalSnapshot(
  gameId: string,
): Promise<SnapshotRow | null> {
  const key = `snapshot:active:local:${gameId}`;
  // Usa cacheHas para distinguir "cache miss" de "cached null"
  if (cacheHas(key)) return fromCache<SnapshotRow | null>(key);

  const rows = await db
    .select()
    .from(metaSnapshotsTable)
    .where(
      and(
        eq(metaSnapshotsTable.gameId, gameId),
        eq(metaSnapshotsTable.scope, "local"),
        eq(metaSnapshotsTable.active, true),
      ),
    )
    .limit(1);

  const result = rows[0] ?? null;
  toCache(key, result);
  return result;
}

// ─── Tipos do JSON da snapshot ────────────────────────────────────────────────

interface MetaKeyCard {
  code: string;
  name: string;
  role: string;
  note_pt?: string;
}

interface MetaMatchup {
  vs: string;
  win_rate_pct: number;
}

interface MetaDecklistCard {
  qty: number;
  code: string;
  name: string;
}

export interface MetaArchetype {
  id: string;
  name: string;
  name_pt: string;
  colors: string[];
  play_style_pt: string;
  tier: string;
  meta_share_pct: number;
  win_rate_pct: number;
  record: string;
  key_cards: MetaKeyCard[];
  good_matchups: MetaMatchup[];
  bad_matchups: MetaMatchup[];
  example_decklist: {
    source: string;
    main: MetaDecklistCard[];
    egg: MetaDecklistCard[];
  };
  coach_notes_pt: string;
}

interface MetaSnapshotContent {
  format?: string;
  snapshot?: { fetched_at?: string; notes_pt?: string };
  tier_legend_pt?: Record<string, string>;
  archetypes: MetaArchetype[];
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

/**
 * Formata as regras do jogo como texto legível para substituição do placeholder
 * {{game_deck_rules}} no template.
 */
function formatDeckRules(rules: GameConfigForPrompt["deck_rules"]): string {
  const lines: string[] = [];
  if (rules.notes_pt) lines.push(rules.notes_pt);
  lines.push(
    `Tamanho do main deck: exatamente ${rules.main_deck_size} cartas`,
  );
  lines.push(
    `Egg deck (ovos): mínimo ${rules.egg_deck_min}, máximo ${rules.egg_deck_max} cartas`,
  );
  lines.push(
    `Limite de cópias por carta: ${rules.max_copies_per_card} cópias (mesmo código)`,
  );
  return lines.join("\n");
}

/**
 * Deriva o rótulo legível para um bloco de meta local a partir da versão da snapshot.
 * "recife-v1" → "META LOCAL (RECIFE)" | "sao-paulo-v2" → "META LOCAL (SAO PAULO)"
 */
function deriveLocalLabel(version: string): string {
  const parts = version.split("-").filter((p) => !/^v\d+$/i.test(p));
  const location = parts.map((p) => p.toUpperCase()).join(" ");
  return location ? `META LOCAL (${location})` : "META LOCAL";
}

/** Renderiza a lista de arquetipos em linhas de texto estruturado. */
function renderArchetypeList(archetypes: MetaArchetype[]): string[] {
  const lines: string[] = [];
  for (const arch of archetypes) {
    lines.push(`=== ${arch.name_pt} ===`);
    lines.push(
      `Tier ${arch.tier} | Share: ${arch.meta_share_pct}% | WR: ${arch.win_rate_pct}% | Record: ${arch.record}`,
    );
    lines.push(`Cores: ${arch.colors.join(", ")}`);
    lines.push(`Estilo de jogo: ${arch.play_style_pt}`);
    lines.push("");

    if (arch.key_cards.length > 0) {
      lines.push("Key cards:");
      for (const kc of arch.key_cards) {
        const note = kc.note_pt ? ` — ${kc.note_pt}` : "";
        lines.push(`  ${kc.code} ${kc.name} [${kc.role}]${note}`);
      }
      lines.push("");
    }

    if (arch.good_matchups.length > 0) {
      const good = arch.good_matchups
        .map((m) => `${m.vs} (${m.win_rate_pct}%)`)
        .join(", ");
      lines.push(`Matchups favoráveis: ${good}`);
    }
    if (arch.bad_matchups.length > 0) {
      const bad = arch.bad_matchups
        .map((m) => `${m.vs} (${m.win_rate_pct}%)`)
        .join(", ");
      lines.push(`Matchups difíceis: ${bad}`);
    }
    if (arch.good_matchups.length > 0 || arch.bad_matchups.length > 0) {
      lines.push("");
    }

    const mainCards = arch.example_decklist.main
      .map((c) => `${c.qty}×${c.code} ${c.name}`)
      .join(", ");
    const eggCards = arch.example_decklist.egg
      .map((c) => `${c.qty}×${c.code} ${c.name}`)
      .join(", ");
    const mainCount = arch.example_decklist.main.reduce(
      (s, c) => s + c.qty,
      0,
    );

    lines.push(`Decklist exemplo — ${arch.example_decklist.source}:`);
    lines.push(`  Main (${mainCount} cartas): ${mainCards}`);
    if (eggCards) lines.push(`  Egg: ${eggCards}`);
    lines.push("");

    lines.push(`Coach: ${arch.coach_notes_pt}`);
    lines.push("");
    lines.push("──────────────────────────────────────────────────────────────");
    lines.push("");
  }
  return lines;
}

/**
 * Formata os arquetipos como texto estruturado para o placeholder {{archetypes_context}}.
 *
 * Seção 1 — META GLOBAL (sempre presente).
 * Seção 2 — META LOCAL (opcional; só renderiza se `localSnapshot` existe e tem arquetipos).
 */
function formatArchetypesContext(
  globalContent: MetaSnapshotContent,
  localSnapshot?: SnapshotRow | null,
): string {
  const lines: string[] = [];

  if (globalContent.format) {
    lines.push(`Formato vigente: ${globalContent.format}`);
  }
  if (globalContent.snapshot?.fetched_at) {
    lines.push(`Dados de: ${globalContent.snapshot.fetched_at}`);
  }
  if (globalContent.snapshot?.notes_pt) {
    lines.push(`Nota: ${globalContent.snapshot.notes_pt}`);
  }
  lines.push("");
  lines.push("═══════════════════════════════════════");
  lines.push("   META GLOBAL");
  lines.push("═══════════════════════════════════════");
  lines.push("");
  lines.push(...renderArchetypeList(globalContent.archetypes ?? []));

  // Bloco local — só renderiza se a snapshot local tiver arquetipos preenchidos
  if (localSnapshot) {
    const localContent = localSnapshot.jsonContent as MetaSnapshotContent;
    const localArchetypes = localContent.archetypes ?? [];
    if (localArchetypes.length > 0) {
      const label = deriveLocalLabel(localSnapshot.version);
      lines.push("═══════════════════════════════════════");
      lines.push(`   ${label}`);
      lines.push("═══════════════════════════════════════");
      lines.push("");
      if (localContent.snapshot?.notes_pt) {
        lines.push(`Nota: ${localContent.snapshot.notes_pt}`);
        lines.push("");
      }
      lines.push(...renderArchetypeList(localArchetypes));
    }
  }

  return lines.join("\n");
}

/**
 * Formata o deck do usuário + cartas enriquecidas como mensagem do usuário
 * para o Claude.
 */
function formatUserMessage(
  deck: ParsedDeck,
  enrichedCards: EnrichedCard[],
  gameName: string,
): string {
  const enrichedMap = new Map(
    enrichedCards.map((c) => [c.cardCode, c.data]),
  );

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "…" : text;

  const formatCard = (card: {
    quantity: number;
    cardCode: string;
    cardName?: string;
  }): string[] => {
    const data = enrichedMap.get(card.cardCode) ?? null;
    const name = data?.name ?? card.cardName ?? card.cardCode;
    const cardLines: string[] = [];

    if (data) {
      const stats: string[] = [];
      if (data.level != null) stats.push(`Lv${data.level}`);
      if (data.color) stats.push(data.color);
      if (data.playCost != null) stats.push(`Custo ${data.playCost}`);
      if (data.dp != null) stats.push(`DP ${data.dp}`);
      if (data.attribute) stats.push(data.attribute);
      if (data.type) stats.push(data.type);

      const statsStr = stats.length > 0 ? ` | ${stats.join(" · ")}` : "";
      cardLines.push(`- ${card.quantity}× ${card.cardCode} ${name}${statsStr}`);

      if (data.mainEffect) {
        cardLines.push(`  Efeito: ${truncate(data.mainEffect, 150)}`);
      }
      if (data.inheritedEffect) {
        cardLines.push(`  Herdado: ${truncate(data.inheritedEffect, 100)}`);
      }
    } else {
      const fallbackName = card.cardName ? ` ${card.cardName}` : "";
      cardLines.push(
        `- ${card.quantity}× ${card.cardCode}${fallbackName} | (dados de carta indisponíveis)`,
      );
    }
    return cardLines;
  };

  const lines: string[] = [];
  lines.push(`Analise este deck de ${gameName}.`);
  lines.push("");

  // Main deck
  const mainCount = deck.mainDeck.reduce((s, c) => s + c.quantity, 0);
  lines.push(`## Main deck — ${mainCount} cartas`);
  lines.push("");
  for (const card of deck.mainDeck) {
    lines.push(...formatCard(card));
  }

  // Decks auxiliares (egg e outros)
  for (const [deckName, cards] of Object.entries(deck.auxDecks)) {
    if (!cards || cards.length === 0) continue;
    const total = cards.reduce((s, c) => s + c.quantity, 0);
    const label =
      deckName === "egg"
        ? `## Egg deck — ${total} ${total === 1 ? "ovo" : "ovos"}`
        : `## ${deckName.charAt(0).toUpperCase() + deckName.slice(1)} deck — ${total} cartas`;
    lines.push("");
    lines.push(label);
    lines.push("");
    for (const card of cards) {
      lines.push(...formatCard(card));
    }
  }

  // Cartas sem dados de API
  const allDeckCards = [
    ...deck.mainDeck,
    ...Object.values(deck.auxDecks).flat(),
  ];
  const missingCodes = allDeckCards
    .filter((c) => {
      const data = enrichedMap.get(c.cardCode);
      return data === undefined || data === null;
    })
    .map((c) => c.cardCode);

  const uniqueMissing = [...new Set(missingCodes)];
  if (uniqueMissing.length > 0) {
    lines.push("");
    lines.push(
      `## Cartas sem dados de API (${uniqueMissing.length}): ${uniqueMissing.join(", ")}`,
    );
  }

  return lines.join("\n");
}

// ─── Export principal ─────────────────────────────────────────────────────────

/**
 * Constrói todo o contexto de prompt para o Claude:
 * - Carrega game, prompt ativo, snapshot global e snapshot local (opcional) do DB (cache 60 s).
 * - Substitui {{placeholders}} no system template.
 * - Monta a mensagem do usuário com deck estruturado + cartas enriquecidas.
 *
 * Lança `PromptBuildError` (com statusHint) se o game ou a snapshot global não existirem.
 * A ausência de snapshot local não é erro — a análise continua só com o meta global.
 *
 * @returns Objeto pronto para passar ao Anthropic SDK:
 *   `{ system, messages, promptVersionId, metaSnapshotId }`
 */
export async function buildAnalysisPrompt({
  gameId,
  deck,
  enrichedCards,
}: {
  gameId: string;
  deck: ParsedDeck;
  enrichedCards: EnrichedCard[];
}): Promise<BuiltPrompt> {
  // Carrega todos os recursos em paralelo (cacheados 60 s após 1ª chamada)
  // A snapshot local pode retornar null sem lançar erro
  const [game, prompt, globalSnapshot, localSnapshot] = await Promise.all([
    getGame(gameId),
    getActivePrompt(gameId),
    getActiveGlobalSnapshot(gameId),
    getActiveLocalSnapshot(gameId),
  ]);

  const gameConfig =
    typeof game.config === "string"
      ? (JSON.parse(game.config) as GameConfigForPrompt)
      : (game.config as GameConfigForPrompt);

  const globalContent = globalSnapshot.jsonContent as MetaSnapshotContent;

  // Formata os blocos que substituem os placeholders
  const deckRulesText = formatDeckRules(gameConfig.deck_rules);
  const archetypesText = formatArchetypesContext(globalContent, localSnapshot);
  const cardCodeExamples = (gameConfig.card_code_examples ?? []).join(", ");

  // Substitui todos os {{placeholders}} no template do system
  const system = prompt.systemContent
    .replace(/\{\{game_name\}\}/g, game.name)
    .replace(/\{\{game_card_code_pattern\}\}/g, gameConfig.card_code_pattern ?? "")
    .replace(/\{\{game_card_code_examples\}\}/g, cardCodeExamples)
    .replace(/\{\{game_deck_rules\}\}/g, deckRulesText)
    .replace(/\{\{archetypes_context\}\}/g, archetypesText);

  const userMessage = formatUserMessage(deck, enrichedCards, game.name);

  return {
    system,
    messages: [{ role: "user", content: userMessage }],
    promptVersionId: prompt.id,
    metaSnapshotId: globalSnapshot.id,
    archetypes: globalContent.archetypes ?? [],
  };
}
