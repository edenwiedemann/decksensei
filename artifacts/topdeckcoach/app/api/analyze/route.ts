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
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
  AuthenticationError,
  APIError,
} from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import { db, analysesTable, apiCostsTable } from "@workspace/db";
import {
  buildAnalysisPrompt,
  PromptBuildError,
  type MetaArchetype,
} from "@/lib/analysis-prompt";
import type { ParsedDeck, EnrichedCard } from "@/lib/games/types";

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

/**
 * Loga erros do SDK Anthropic com contexto suficiente para diagnóstico.
 * NUNCA expõe detalhes técnicos ao cliente — apenas para os logs do servidor.
 */
function logAnthropicError(analysisId: string, err: unknown): void {
  if (err instanceof APIConnectionTimeoutError) {
    console.error(`[analyze][${analysisId}] Anthropic timeout`);
  } else if (err instanceof APIConnectionError) {
    console.error(
      `[analyze][${analysisId}] Anthropic sem conexão: ${err.message}`,
    );
  } else if (err instanceof RateLimitError) {
    console.error(
      `[analyze][${analysisId}] Anthropic rate limit (${err.status}): ${err.message}`,
    );
  } else if (err instanceof AuthenticationError) {
    console.error(
      `[analyze][${analysisId}] Anthropic autenticação falhou — verificar ANTHROPIC_API_KEY nos Secrets`,
    );
  } else if (err instanceof APIError) {
    console.error(
      `[analyze][${analysisId}] Anthropic HTTP ${err.status}: ${err.message}`,
    );
  } else {
    console.error(`[analyze][${analysisId}] erro inesperado:`, err);
  }
}

/**
 * Extrai o ID do arquetipo mais próximo do texto da análise.
 * Procura o padrão gerado pelo Claude: `Arquetipo mais próximo: **[Nome]** — similaridade aproximada **X%**.`
 */
function extractSimilarArchetype(
  text: string,
  archetypes: MetaArchetype[],
): string | null {
  const match = text.match(
    /Arquetipo mais pr[oó]ximo:\s*\*\*([^*]+)\*\*\s*[—–\-]\s*similaridade aproximada\s*\*\*(\d+)%/,
  );
  if (!match) return null;
  const name = match[1].trim();
  return archetypes.find((a) => a.name === name || a.name_pt === name)?.id ?? null;
}

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

  // ── 1b. Validação estrutural mínima do deck ──────────────────────────────────
  if (!deck.mainDeck || deck.mainDeck.length === 0) {
    return Response.json(
      {
        error:
          "Cole a decklist no campo antes de analisar (ex: 4 BT13-040 Magnamon).",
        type: "validation",
      },
      { status: 422 },
    );
  }

  // ── 2. Monta o prompt (carrega game/prompt/snapshot do DB com cache 60 s) ────
  let built: Awaited<ReturnType<typeof buildAnalysisPrompt>>;

  try {
    built = await buildAnalysisPrompt({ gameId, deck, enrichedCards });
  } catch (err) {
    console.error("[analyze] buildAnalysisPrompt falhou:", err);
    if (err instanceof PromptBuildError) {
      return Response.json({ error: err.message }, { status: err.statusHint });
    }
    return Response.json(
      { error: "Erro interno ao montar o prompt" },
      { status: 500 },
    );
  }

  // ── 2b. Mapa de cores dos arquetipos para o frontend ────────────────────────
  const colorMap: Record<string, string> = {};
  for (const arch of built.archetypes) {
    if (arch.colors[0]) colorMap[arch.name_pt] = arch.colors[0];
  }
  const colorMapHeader = encodeURIComponent(JSON.stringify(colorMap));

  // ── 3. Streaming via Anthropic SDK ──────────────────────────────────────────
  const anthropic = new Anthropic();

  const analysisId = nanoid(24);
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
          system: built.system,
          messages: built.messages,
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
          const similarArchetypeId = extractSimilarArchetype(
            fullText,
            built.archetypes,
          );

          await db.insert(analysesTable).values({
            id: analysisId,
            gameId,
            deckText: deckToText(deck),
            deckParsed: deck as unknown as Record<string, unknown>,
            analysisText: fullText,
            promptVersionId: built.promptVersionId,
            metaSnapshotId: built.metaSnapshotId,
            similarArchetypeId,
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
        logAnthropicError(analysisId, err);
        // Fecha o stream com erro — o cliente receberá um DOMException na leitura
        // e exibirá mensagem genérica amigável (nunca expõe detalhes técnicos)
        controller.error(new Error("stream_error"));
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
      "X-Meta-Color-Map": colorMapHeader,
    },
  });
}
