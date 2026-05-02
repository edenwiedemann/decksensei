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
import { cookies } from "next/headers";
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
import { checkRateLimit } from "@/lib/rate-limit";

// ─── Configuração do modelo ───────────────────────────────────────────────────

const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2500;
const TEMPERATURE = 0.4;

const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

// ─── Rate limit config ────────────────────────────────────────────────────────

const WINDOW_SEC = 3600; // 1 hora
const LIMIT_ANON = 5;
const LIMIT_AUTH = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

function formatMinutes(sec: number): string {
  const m = Math.ceil(sec / 60);
  return m === 1 ? "1 minuto" : `${m} minutos`;
}

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
  const cookieStore = await cookies();
  const isAuthenticated = !!cookieStore.get("session_token")?.value;

  // ── 0. Rate limiting ──────────────────────────────────────────────────────
  const ip = getClientIp(request);
  const rateLimitKey = isAuthenticated ? `auth:${ip}` : `anon:${ip}`;
  const maxRequests = isAuthenticated ? LIMIT_AUTH : LIMIT_ANON;

  let rlResult: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    rlResult = await checkRateLimit(rateLimitKey, WINDOW_SEC, maxRequests);
  } catch (err) {
    // Se o check falhar (DB down, etc.) deixa passar — não bloqueia o usuário
    console.error("[analyze] rate limit check falhou:", err);
    rlResult = { allowed: true };
  }

  if (!rlResult.allowed) {
    const retryAfterSec = rlResult.retryAfterSec;
    return Response.json(
      {
        error: "rate_limit",
        message_pt: `Limite de análises atingido — tente novamente em ${formatMinutes(retryAfterSec)}.`,
        retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  // ── 1. Auth gate ──────────────────────────────────────────────────────────
  let shouldSetCountCookie = false;

  if (!isAuthenticated) {
    const count = parseInt(cookieStore.get("analyses_count")?.value ?? "0", 10);
    if (count >= 1) {
      return Response.json(
        {
          error: "auth_required",
          message_pt:
            "Faz o cadastro com seu email pra continuar — leva 30 segundos.",
        },
        { status: 401 },
      );
    }
    shouldSetCountCookie = true;
  }

  // ── 2. Parse e valida o body ────────────────────────────────────────────
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

  // ── 2b. Validação estrutural mínima do deck ────────────────────────────
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

  // ── 3. Monta o prompt ─────────────────────────────────────────────────
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

  // ── 3b. Mapa de cores dos arquetipos para o frontend ──────────────────
  const colorMap: Record<string, string> = {};
  for (const arch of built.archetypes) {
    if (arch.colors[0]) colorMap[arch.name_pt] = arch.colors[0];
  }
  const colorMapHeader = encodeURIComponent(JSON.stringify(colorMap));

  // ── 4. Streaming via Anthropic SDK ────────────────────────────────────
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

        const finalMessage = await stream.finalMessage();
        const responseTimeMs = Date.now() - startTime;
        const inputTokens = finalMessage.usage.input_tokens;
        const outputTokens = finalMessage.usage.output_tokens;
        const costUsd = (
          inputTokens * INPUT_COST_PER_TOKEN +
          outputTokens * OUTPUT_COST_PER_TOKEN
        ).toFixed(6);

        // ── 5. Persiste análise e custo no DB (best-effort) ───────────
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
          console.error("[analyze] falha ao salvar no DB:", dbErr);
        }
      } catch (err) {
        logAnthropicError(analysisId, err);
        controller.error(new Error("stream_error"));
        return;
      }

      controller.close();
    },
  });

  const responseHeaders = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache, no-store",
    "X-Analysis-Id": analysisId,
    "X-Meta-Color-Map": colorMapHeader,
  });

  if (shouldSetCountCookie) {
    responseHeaders.set(
      "Set-Cookie",
      "analyses_count=1; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  }

  return new Response(readableStream, { headers: responseHeaders });
}
