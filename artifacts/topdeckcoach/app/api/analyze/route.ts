/**
 * POST /api/analyze
 *
 * Recebe deck parseado + cartas enriquecidas, faz stream da análise via Claude
 * e persiste o resultado na tabela analyses ao final.
 *
 * Body: { gameId: string, deck: ParsedDeck, enrichedCards: EnrichedCard[] }
 * Response: text/plain stream (chunks de markdown conforme chegam do Claude)
 * Header extra: X-Analysis-Id — ID do registro salvo no DB
 */

import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import {
  db,
  eq,
  and,
  gamesTable,
  promptsTable,
  metaSnapshotsTable,
  analysesTable,
  apiCostsTable,
} from "@workspace/db";
import { buildAnalysisPrompt } from "@/lib/analysis-prompt";
import type { ParsedDeck, EnrichedCard } from "@/lib/games/types";
import type { GameConfigForPrompt } from "@/lib/analysis-prompt";

// ─── Configuração do modelo ───────────────────────────────────────────────────

/**
 * Verifique em docs.anthropic.com/en/docs/about-claude/models o model string
 * mais recente disponível. Atualizar aqui quando um Sonnet mais novo for
 * lançado — o alias abaixo sempre aponta para o mais recente disponível.
 */
const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2500;
const TEMPERATURE = 0.4;

/**
 * Custo aproximado por token para Claude Sonnet (atualizar conforme pricing).
 * Referência: https://www.anthropic.com/pricing
 */
const INPUT_COST_PER_TOKEN = 3 / 1_000_000; // $3 / MTok
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000; // $15 / MTok

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reconstrói texto legível da decklist a partir do ParsedDeck para armazenar. */
function deckToText(deck: ParsedDeck): string {
  const lines: string[] = deck.mainDeck.map(
    (c) => `${c.quantity} ${c.cardCode}${c.cardName ? ` ${c.cardName}` : ""}`,
  );
  const egg = deck.auxDecks["egg"] ?? [];
  if (egg.length > 0) {
    lines.push("", "Egg deck:");
    for (const c of egg) {
      lines.push(
        `${c.quantity} ${c.cardCode}${c.cardName ? ` ${c.cardName}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Parse e valida o body ────────────────────────────────────────────────
  let gameId: string;
  let deck: ParsedDeck;
  let enrichedCards: EnrichedCard[];

  try {
    const body = (await request.json()) as {
      gameId?: unknown;
      deck?: unknown;
      enrichedCards?: unknown;
    };

    if (typeof body.gameId !== "string" || !body.gameId) {
      return Response.json({ error: "gameId é obrigatório" }, { status: 400 });
    }
    if (!body.deck || typeof body.deck !== "object") {
      return Response.json({ error: "deck é obrigatório" }, { status: 400 });
    }

    gameId = body.gameId;
    deck = body.deck as ParsedDeck;
    enrichedCards = Array.isArray(body.enrichedCards)
      ? (body.enrichedCards as EnrichedCard[])
      : [];
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  // ── 2. Carrega game, prompt ativo e snapshot ativa em paralelo ──────────────
  const [gameRows, promptRows, snapshotRows] = await Promise.all([
    db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1),
    db
      .select()
      .from(promptsTable)
      .where(
        and(eq(promptsTable.gameId, gameId), eq(promptsTable.active, true)),
      )
      .limit(1),
    db
      .select()
      .from(metaSnapshotsTable)
      .where(
        and(
          eq(metaSnapshotsTable.gameId, gameId),
          eq(metaSnapshotsTable.scope, "global"),
          eq(metaSnapshotsTable.active, true),
        ),
      )
      .limit(1),
  ]);

  const game = gameRows[0];
  const prompt = promptRows[0];
  const snapshot = snapshotRows[0];

  if (!game) {
    return Response.json({ error: "Jogo não encontrado" }, { status: 404 });
  }
  if (!prompt) {
    return Response.json(
      { error: "Nenhum prompt ativo para este jogo — configure via /admin/prompts" },
      { status: 503 },
    );
  }
  if (!snapshot) {
    return Response.json(
      { error: "Nenhuma snapshot de meta ativa — configure via /admin/meta" },
      { status: 503 },
    );
  }

  // ── 3. Monta o prompt via lib/analysis-prompt.ts ────────────────────────────
  const gameConfig: GameConfigForPrompt =
    typeof game.config === "string"
      ? (JSON.parse(game.config) as GameConfigForPrompt)
      : (game.config as GameConfigForPrompt);

  let systemPrompt: string;
  let userMessage: string;

  try {
    const built = buildAnalysisPrompt({
      gameId,
      gameName: game.name,
      gameConfig,
      systemTemplate: prompt.systemContent,
      metaSnapshot: snapshot.jsonContent,
      deck,
      enrichedCards,
    });
    systemPrompt = built.systemPrompt;
    userMessage = built.userMessage;
  } catch (err) {
    console.error("[analyze] buildAnalysisPrompt falhou:", err);
    return Response.json(
      { error: "Erro interno ao montar o prompt" },
      { status: 500 },
    );
  }

  // ── 4. Streaming via Anthropic SDK ──────────────────────────────────────────
  const anthropic = new Anthropic({
    // Lê ANTHROPIC_API_KEY automaticamente do ambiente
  });

  const analysisId = nanoid(24);
  const promptVersionId = prompt.id;
  const metaSnapshotId = snapshot.id;
  const startTime = Date.now();
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      let fullText = "";

      try {
        const stream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

        // Encaminha chunks de texto ao client conforme chegam
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        // Recupera tokens reais após o stream terminar
        const finalMessage = await stream.finalMessage();
        const responseTimeMs = Date.now() - startTime;
        const inputTokens = finalMessage.usage.input_tokens;
        const outputTokens = finalMessage.usage.output_tokens;
        const costUsd = (
          inputTokens * INPUT_COST_PER_TOKEN +
          outputTokens * OUTPUT_COST_PER_TOKEN
        ).toFixed(6);

        // ── 5. Persiste análise e custo no DB (best-effort) ─────────────────
        try {
          await db.insert(analysesTable).values({
            id: analysisId,
            gameId,
            deckText: deckToText(deck),
            deckParsed: deck as unknown as Record<string, unknown>,
            analysisText: fullText,
            promptVersionId,
            metaSnapshotId,
            responseTimeMs,
          });

          await db.insert(apiCostsTable).values({
            analysisId,
            inputTokens,
            outputTokens,
            costUsd,
          });
        } catch (dbErr) {
          // Não fecha o stream — cliente já recebeu a análise completa
          console.error("[analyze] falha ao salvar no DB:", dbErr);
        }
      } catch (err) {
        console.error("[analyze] erro no stream Anthropic:", err);
        controller.error(err);
        return;
      }

      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache, no-store",
      "X-Analysis-Id": analysisId,
    },
  });
}
