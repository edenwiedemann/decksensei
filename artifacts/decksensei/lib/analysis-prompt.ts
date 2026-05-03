/**
 * Constrói o prompt completo para o Claude.
 *
 * buildAnalysisPrompt({ gameId, deck, enrichedCards })
 *   → Promise<{ system, messages, promptVersionId, metaSnapshotId }>
 *
 * Todos os dados do DB são carregados internamente com cache de 60 s.
 *
 * v3: o contexto de arquetipos é gerado a partir das evidências em runtime,
 * não dos campos históricos win_rate_pct/meta_share_pct da snapshot.
 * Cada arquetipo recebe um bloco de confiança (score 0–100, evidências top 5).
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
import { computeArchetypeConfidence } from "@/lib/evidence/score";

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

/**
 * Constrói o bloco de texto de um único arquetipo substituindo os campos
 * históricos (win_rate_pct, meta_share_pct) pelo score de confiança e
 * evidências em runtime. Dados estáticos da snapshot (cores, key cards,
 * matchups, decklist exemplo, coach notes) são mantidos.
 *
 * Async porque consulta a tabela meta_archetype_evidences no DB.
 */
async function buildArchetypeBlock(
  arch: MetaArchetype,
  gameId: string,
  snapshotDate?: string,
): Promise<string> {
  const confidence = await computeArchetypeConfidence(gameId, arch.id);
  const lines: string[] = [];

  lines.push(`=== ${arch.name_pt} ===`);
  lines.push(`Tier: ${arch.tier}`);

  // ── Bloco de confiança (substitui WR/share históricos da snapshot) ──────────
  if (confidence.evidences.length === 0) {
    lines.push(`Confiança: 0/100 (sem evidências externas — dados apenas históricos)`);
    lines.push(`WR histórico (snapshot ${snapshotDate ?? "N/A"}): ${arch.win_rate_pct}%`);
    lines.push(`Share histórico (snapshot): ${arch.meta_share_pct}%`);
    lines.push(`AVISO: arquetipo sem evidências recentes. Trate como leitura provisória.`);
  } else {
    const conf = confidence.score;
    const confLabel = conf >= 70 ? "alta" : conf >= 40 ? "média" : "baixa";
    lines.push(`Confiança agregada: ${conf}/100 (${confLabel})`);

    if (confidence.weightedWinRate != null) {
      lines.push(`Win rate ponderado: ${confidence.weightedWinRate.toFixed(1)}%`);
      if (
        confidence.winRateRange &&
        confidence.winRateRange[1] - confidence.winRateRange[0] > 5
      ) {
        lines.push(
          `Range observado entre fontes: ${confidence.winRateRange[0].toFixed(1)}% — ${confidence.winRateRange[1].toFixed(1)}% (sensibilidade alta)`,
        );
      }
    }

    lines.push(`Sample combinado: ${confidence.totalSampleSize} partidas`);
    lines.push("");
    lines.push("Evidências (top 5 por relevância):");

    const sorted = [...confidence.evidences]
      .sort((a, b) => {
        const aScore =
          (a.sourceWeight ?? 0) * (a.recencyFactor ?? 1) * (a.verified ? 1 : 0.6);
        const bScore =
          (b.sourceWeight ?? 0) * (b.recencyFactor ?? 1) * (b.verified ? 1 : 0.6);
        return bScore - aScore;
      })
      .slice(0, 5);

    for (const ev of sorted) {
      const verifiedTag = ev.verified ? " ✓" : "";
      const sample = ev.data?.sample_size ?? "N/A";
      const wr =
        ev.data?.win_rate != null
          ? `WR ${ev.data.win_rate.toFixed(1)}%`
          : "";
      const apps =
        ev.data?.appearances != null ? `${ev.data.appearances} app` : "";
      const stats = [wr, apps, `sample ${sample}`].filter(Boolean).join(", ");
      lines.push(`  - ${ev.event_label}${verifiedTag}: ${stats}`);
    }
  }

  // ── Resto do contexto vem da snapshot (estático) ─────────────────────────────
  lines.push("");
  lines.push(`Cores: ${arch.colors.join(", ")}`);
  lines.push(`Estilo de jogo: ${arch.play_style_pt}`);
  lines.push("");

  if (arch.key_cards?.length > 0) {
    lines.push("Key cards:");
    for (const kc of arch.key_cards) {
      const note = kc.note_pt ? ` — ${kc.note_pt}` : "";
      lines.push(`  ${kc.code} ${kc.name} [${kc.role}]${note}`);
    }
    lines.push("");
  }

  // Matchups: usa da snapshot (tem dados detalhados; refatorar quando evidências cobrirem matchups)
  if (arch.good_matchups?.length > 0) {
    const good = arch.good_matchups
      .map((m) => `${m.vs} (${m.win_rate_pct}%)`)
      .join(", ");
    lines.push(`Matchups favoráveis: ${good}`);
  }
  if (arch.bad_matchups?.length > 0) {
    const bad = arch.bad_matchups
      .map((m) => `${m.vs} (${m.win_rate_pct}%)`)
      .join(", ");
    lines.push(`Matchups difíceis: ${bad}`);
  }
  if (arch.good_matchups?.length > 0 || arch.bad_matchups?.length > 0) {
    lines.push("");
  }

  // Decklist exemplo continua vindo da snapshot
  if (arch.example_decklist) {
    const mainCount = arch.example_decklist.main.reduce(
      (s, c) => s + c.qty,
      0,
    );
    lines.push(`Decklist exemplo — ${arch.example_decklist.source}:`);
    const mainCards = arch.example_decklist.main
      .map((c) => `${c.qty}×${c.code} ${c.name}`)
      .join(", ");
    lines.push(`  Main (${mainCount}): ${mainCards}`);
    if (arch.example_decklist.egg?.length > 0) {
      const eggCards = arch.example_decklist.egg
        .map((c) => `${c.qty}×${c.code} ${c.name}`)
        .join(", ");
      lines.push(`  Egg: ${eggCards}`);
    }
    lines.push("");
  }

  lines.push(`Coach: ${arch.coach_notes_pt}`);
  lines.push("");
  lines.push("──────────────────────────────────────────────────────────────");
  lines.push("");

  return lines.join("\n");
}

/**
 * Constrói o contexto completo de arquetipos para o placeholder {{archetypes_context}}.
 *
 * Agora async: cada arquetipo consulta evidências no DB em paralelo via Promise.all.
 * Os campos win_rate_pct e meta_share_pct da snapshot são usados apenas como
 * fallback histórico — a "verdade atual" vem das evidências em runtime.
 *
 * Seção 1 — META GLOBAL (sempre presente).
 * Seção 2 — META LOCAL (opcional; só renderiza se `localSnapshot` existe e tem arquetipos).
 */
async function buildArchetypesContext(
  globalContent: MetaSnapshotContent,
  gameId: string,
  localSnapshot?: SnapshotRow | null,
): Promise<string> {
  const lines: string[] = [];

  if (globalContent.format) {
    lines.push(`Formato vigente: ${globalContent.format}`);
  }

  const snapshotDate = globalContent.snapshot?.fetched_at;
  if (snapshotDate) {
    lines.push(`Dados históricos de: ${snapshotDate}`);
    lines.push(
      `(Win rate e share abaixo são históricos quando sem evidências — meta atualizado vem das evidências em runtime)`,
    );
  }
  if (globalContent.snapshot?.notes_pt) {
    lines.push(`Nota: ${globalContent.snapshot.notes_pt}`);
  }
  lines.push("");
  lines.push("═══════════════════════════════════════");
  lines.push("   META GLOBAL");
  lines.push("═══════════════════════════════════════");
  lines.push(`(${globalContent.archetypes?.length ?? 0} arquetipos)`);
  lines.push("");

  // Processa todos os arquetipos em paralelo — cada um faz query de evidências
  const archetypeBlocks = await Promise.all(
    (globalContent.archetypes ?? []).map((arch) =>
      buildArchetypeBlock(arch, gameId, snapshotDate),
    ),
  );
  lines.push(...archetypeBlocks);

  // Bloco local — só renderiza se a snapshot local tiver arquetipos preenchidos
  if (localSnapshot) {
    const localContent = localSnapshot.jsonContent as MetaSnapshotContent;
    const localArchetypes = localContent.archetypes ?? [];
    if (localArchetypes.length > 0) {
      const label = deriveLocalLabel(localSnapshot.version);
      const localSnapshotDate = localContent.snapshot?.fetched_at;

      lines.push("═══════════════════════════════════════");
      lines.push(`   ${label}`);
      lines.push("═══════════════════════════════════════");
      lines.push("");
      if (localContent.snapshot?.notes_pt) {
        lines.push(`Nota: ${localContent.snapshot.notes_pt}`);
        lines.push("");
      }

      const localBlocks = await Promise.all(
        localArchetypes.map((arch) =>
          buildArchetypeBlock(arch, gameId, localSnapshotDate),
        ),
      );
      lines.push(...localBlocks);
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
 * Valores reais que substituem os placeholders em runtime.
 * Exportado para que o painel admin possa mostrar o preview com dados reais do banco.
 */
export interface PromptVariables {
  game_name: string;
  game_card_code_pattern: string;
  game_card_code_examples: string;
  game_deck_rules: string;
  archetypes_context: string;
}

/**
 * Carrega e formata os valores que substituem cada {{placeholder}} no template.
 * Não monta o prompt completo — apenas retorna os valores para cada variável.
 * Reutilizado internamente por buildAnalysisPrompt e pelo painel admin.
 *
 * Lança `PromptBuildError` se o game ou a snapshot global não existirem.
 */
export async function getPromptVariables(gameId: string): Promise<PromptVariables> {
  const [game, globalSnapshot, localSnapshot] = await Promise.all([
    getGame(gameId),
    getActiveGlobalSnapshot(gameId),
    getActiveLocalSnapshot(gameId),
  ]);

  const gameConfig =
    typeof game.config === "string"
      ? (JSON.parse(game.config) as GameConfigForPrompt)
      : (game.config as GameConfigForPrompt);

  const globalContent = globalSnapshot.jsonContent as MetaSnapshotContent;

  // buildArchetypesContext é async — busca evidências do DB em paralelo por arquetipo
  const archetypes_context = await buildArchetypesContext(
    globalContent,
    gameId,
    localSnapshot,
  );

  return {
    game_name: game.name,
    game_card_code_pattern: gameConfig.card_code_pattern ?? "",
    game_card_code_examples: (gameConfig.card_code_examples ?? []).join(", "),
    game_deck_rules: formatDeckRules(gameConfig.deck_rules),
    archetypes_context,
  };
}

/**
 * Constrói todo o contexto de prompt para o Claude:
 * - Carrega game, prompt ativo, snapshot global e snapshot local (opcional) do DB (cache 60 s).
 * - Substitui {{placeholders}} no system template.
 * - Monta a mensagem do usuário com deck estruturado + cartas enriquecidas.
 * - Injeta confiança e evidências em runtime por arquetipo (via buildArchetypesContext).
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
  systemContentOverride,
}: {
  gameId: string;
  deck: ParsedDeck;
  enrichedCards: EnrichedCard[];
  /**
   * Conteúdo do system prompt a usar em vez do ativo no DB.
   * Utilizado no endpoint de teste de rascunho (/api/admin/prompts/test).
   * Quando presente, o prompt ativo ainda é carregado para obter `promptVersionId`.
   */
  systemContentOverride?: string;
}): Promise<BuiltPrompt> {
  // Carrega em paralelo — tudo cacheado 60 s após 1ª chamada
  const [vars, prompt, globalSnapshot] = await Promise.all([
    getPromptVariables(gameId),
    getActivePrompt(gameId),
    getActiveGlobalSnapshot(gameId), // necessário para metaSnapshotId e archetypes
  ]);

  const globalContent = globalSnapshot.jsonContent as MetaSnapshotContent;

  const templateContent = systemContentOverride ?? prompt.systemContent;

  const system = templateContent
    .replace(/\{\{game_name\}\}/g, vars.game_name)
    .replace(/\{\{game_card_code_pattern\}\}/g, vars.game_card_code_pattern)
    .replace(/\{\{game_card_code_examples\}\}/g, vars.game_card_code_examples)
    .replace(/\{\{game_deck_rules\}\}/g, vars.game_deck_rules)
    .replace(/\{\{archetypes_context\}\}/g, vars.archetypes_context);

  const userMessage = formatUserMessage(deck, enrichedCards, vars.game_name);

  return {
    system,
    messages: [{ role: "user", content: userMessage }],
    promptVersionId: prompt.id,
    metaSnapshotId: globalSnapshot.id,
    archetypes: globalContent.archetypes ?? [],
  };
}
