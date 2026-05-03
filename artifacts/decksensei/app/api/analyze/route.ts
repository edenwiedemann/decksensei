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
import crypto from "crypto";
import { adminSessionValue } from "@/lib/auth/admin";
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
  AuthenticationError,
  APIError,
} from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import { db, analysesTable } from "@workspace/db";
import {
  buildAnalysisPrompt,
  PromptBuildError,
  type MetaArchetype,
} from "@/lib/analysis-prompt";
import type { ParsedDeck, EnrichedCard } from "@/lib/games/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackCost, checkProductionCap } from "@/lib/cost-tracker";

// ─── Configuração do modelo ───────────────────────────────────────────────────

const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2500;
const TEMPERATURE = 0.4;

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

  // ── Admin bypass — pula rate limit e auth gate ────────────────────────────
  const adminCookie = cookieStore.get("admin_session")?.value ?? "";
  let isAdmin = false;
  if (adminCookie) {
    try {
      const expected = adminSessionValue();
      isAdmin =
        adminCookie.length === expected.length &&
        crypto.timingSafeEqual(
          Buffer.from(adminCookie, "hex"),
          Buffer.from(expected, "hex"),
        );
    } catch {
      isAdmin = false;
    }
  }

  const isAuthenticated = isAdmin || !!cookieStore.get("session_token")?.value;

  // Anônimos recebem análise parcial (só "## Visão geral") — gate de conversão
  const isPartialStream = !isAuthenticated && !isAdmin;

  // ── 0. Rate limiting ──────────────────────────────────────────────────────
  let shouldSetCountCookie = false;

  if (!isAdmin) {
    const ip = getClientIp(request);
    const rateLimitKey = isAuthenticated ? `auth:${ip}` : `anon:${ip}`;
    const maxRequests = isAuthenticated ? LIMIT_AUTH : LIMIT_ANON;

    let rlResult: Awaited<ReturnType<typeof checkRateLimit>>;
    try {
      rlResult = await checkRateLimit(rateLimitKey, WINDOW_SEC, maxRequests);
    } catch (err) {
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
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }

    // ── 1. Auth gate (DB-backed por IP — resistente a limpeza de cookie) ───
    if (!isAuthenticated) {
      let firstAllowed = true;
      try {
        // Janela de 365 dias = efetivamente permanente por IP
        const anonLimit = await checkRateLimit(
          `anon_first:${ip}`,
          365 * 24 * 3600,
          1,
        );
        firstAllowed = anonLimit.allowed;
      } catch (err) {
        // DB indisponível — fallback para cookie para não bloquear ninguém
        console.error("[analyze] anon DB limit falhou, fallback p/ cookie:", err);
        const count = parseInt(
          cookieStore.get("analyses_count")?.value ?? "0",
          10,
        );
        firstAllowed = count < 1;
      }

      if (!firstAllowed) {
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
  }

  // ── 2. Parse e valida o body ────────────────────────────────────────────
  let gameId: string;
  let deck: ParsedDeck;
  let enrichedCards: EnrichedCard[];
  let tournamentMode = false;
  let deckName: string | null = null;

  try {
    const body = (await request.json()) as {
      gameId?: unknown;
      deck?: unknown;
      enrichedCards?: unknown;
      tournamentMode?: unknown;
      deckName?: unknown;
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
    tournamentMode = body.tournamentMode === true;
    deckName =
      typeof body.deckName === "string" && body.deckName.trim()
        ? body.deckName.trim().slice(0, 60)
        : null;
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

  // ── 2c. Cobertura de enriquecimento ──────────────────────────────────
  const allDeckCards = [
    ...deck.mainDeck,
    ...Object.values(deck.auxDecks).flat(),
  ];
  const uniqueCodes = new Set(allDeckCards.map((c) => c.cardCode));
  const enrichedWithData = new Set(
    enrichedCards.filter((c) => c.data !== null).map((c) => c.cardCode),
  );
  const totalUnique = uniqueCodes.size;
  const enrichmentPct =
    totalUnique > 0
      ? Math.round((enrichedWithData.size / totalUnique) * 100)
      : 100;
  const lowCoverage = enrichmentPct < 50;

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

  // ── 3b. Injeta aviso de baixa cobertura no user message ──────────────
  if (lowCoverage && built.messages.length > 0) {
    const missingPct = 100 - enrichmentPct;
    const warning =
      `AVISO: ~${missingPct}% das cartas deste deck não puderam ser carregadas da API externa. ` +
      `Sua análise pode ser menos precisa. Tente novamente em alguns minutos.\n\n`;
    const firstMsg = built.messages[0];
    if (firstMsg) {
      built.messages[0] = { ...firstMsg, content: warning + firstMsg.content };
    }
  }

  // ── 3c. Injeta modo torneio no último user message ───────────────────
  if (tournamentMode && built.messages.length > 0) {
    const lastMsg = built.messages[built.messages.length - 1];
    if (lastMsg) {
      const tournamentNote =
        `\n\n**MODO TORNEIO ATIVO:** Além da análise padrão, priorize: ` +
        `(1) análise detalhada de matchups contra os decks mais presentes no meta, ` +
        `(2) sequência de mulligan recomendada, ` +
        `(3) sugestões específicas de cartas para ambiente competitivo presencial.`;
      built.messages[built.messages.length - 1] = {
        ...lastMsg,
        content: lastMsg.content + tournamentNote,
      };
    }
  }

  // ── 3d. Mapa de cores dos arquetipos para o frontend ──────────────────
  const colorMap: Record<string, string> = {};
  for (const arch of built.archetypes) {
    if (arch.colors[0]) colorMap[arch.name_pt] = arch.colors[0];
  }
  const colorMapHeader = encodeURIComponent(JSON.stringify(colorMap));

  // ── 3c. Verifica cap de custo diário ──────────────────────────────────
  let capCheck: Awaited<ReturnType<typeof checkProductionCap>>;
  try {
    capCheck = await checkProductionCap();
  } catch (err) {
    console.error("[analyze] checkProductionCap falhou:", err);
    capCheck = { allowed: true, currentUsd: 0, capUsd: 10 };
  }

  if (!capCheck.allowed) {
    console.warn(
      `[analyze] daily cap atingido — gasto: $${capCheck.currentUsd.toFixed(4)} / cap: $${capCheck.capUsd}`,
    );
    return Response.json(
      {
        error: "daily_cap",
        message_pt:
          "Atingimos o limite operacional do dia. Voltamos em algumas horas.",
      },
      { status: 503 },
    );
  }

  // ── 4. Streaming via Anthropic SDK ────────────────────────────────────
  const anthropic = new Anthropic();

  const analysisId = nanoid(24);
  const startTime = Date.now();
  const encoder = new TextEncoder();

  // Marcador que delimita o fim do preview gratuito para visitantes anônimos
  const PARTIAL_MARKER = "\n## Plano de jogo";
  // Fallback: se o marcador não aparecer até esta quantidade de chars enviados,
  // fecha o stream mesmo assim para impedir que a análise completa vaze.
  const PARTIAL_MAX_SENT = 5000;

  const readableStream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      let sentLength = 0;
      let streamTruncated = false;

      const anthropicStream = anthropic.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: built.system,
        messages: built.messages,
      });

      try {
        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullText += text;

            if (isPartialStream && !streamTruncated) {
              const markerIdx = fullText.indexOf(PARTIAL_MARKER);
              const hitGuard = sentLength >= PARTIAL_MAX_SENT;

              if (markerIdx !== -1 || hitGuard) {
                // Envia apenas o que ainda não foi enviado, até o marcador (ou guarda)
                const cutAt = markerIdx !== -1 ? markerIdx : sentLength;
                const toSend = fullText.slice(sentLength, cutAt);
                if (toSend) controller.enqueue(encoder.encode(toSend));
                streamTruncated = true;

                // Fecha o controller imediatamente — cliente recebe o preview completo
                controller.close();

                // Cancela o stream Anthropic para economizar tokens
                try { anthropicStream.abort(); } catch {}

                // Persiste o preview no DB (fire-and-forget — não bloqueia a resposta)
                const previewText = fullText.slice(0, cutAt);
                const responseTimeMs = Date.now() - startTime;
                db.insert(analysesTable)
                  .values({
                    id: analysisId,
                    gameId,
                    deckText: deckToText(deck),
                    deckParsed: deck as unknown as Record<string, unknown>,
                    analysisText: previewText,
                    promptVersionId: built.promptVersionId,
                    metaSnapshotId: built.metaSnapshotId,
                    similarArchetypeId: null,
                    responseTimeMs,
                    deckName,
                  })
                  .catch((e) =>
                    console.error("[analyze] partial DB insert failed:", e),
                  );

                return;
              }
            }

            controller.enqueue(encoder.encode(text));
            sentLength += text.length;
          }
        }

        // ── Análise completa (usuário autenticado ou parcial sem marcador) ──
        const finalMessage = await anthropicStream.finalMessage();
        const responseTimeMs = Date.now() - startTime;
        const inputTokens = finalMessage.usage.input_tokens;
        const outputTokens = finalMessage.usage.output_tokens;

        // ── 5. Persiste análise no DB (best-effort) ──────────────────────
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
            deckName,
          });
        } catch (dbErr) {
          console.error("[analyze] falha ao salvar análise no DB:", dbErr);
        }

        // ── 6. Rastreia custo com tokens reais da API ─────────────────────
        await trackCost(inputTokens, outputTokens, analysisId);
      } catch (err) {
        // Se o stream já foi fechado (truncado), ignora erros do abort
        if (streamTruncated) return;
        logAnthropicError(analysisId, err);
        controller.error(new Error("stream_error"));
        return;
      }

      if (!streamTruncated) controller.close();
    },
  });

  const responseHeaders = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache, no-store",
    "X-Analysis-Id": analysisId,
    "X-Meta-Color-Map": colorMapHeader,
    "X-Enrichment-Coverage": String(enrichmentPct),
    // Para visitantes anônimos (isPartialStream=true), o header é definido antes
    // do início do stream — não é possível alterá-lo após o início do body HTTP.
    // Na prática streamTruncated é sempre true para anônimos: ou o marcador é
    // encontrado (caminho normal) ou o fallback PARTIAL_MAX_SENT fecha o stream
    // antes de 5000 chars. O único edge-case seria uma resposta Anthropic de
    // < 5000 chars sem o marcador (improvável com os prompts atuais).
    "X-Partial-Analysis": isPartialStream ? "true" : "false",
  });

  if (shouldSetCountCookie) {
    responseHeaders.set(
      "Set-Cookie",
      "analyses_count=1; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  }

  return new Response(readableStream, { headers: responseHeaders });
}
