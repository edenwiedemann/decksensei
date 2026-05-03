export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { checkTestCap } from "@/lib/cost-tracker";
import { db, pool, analysesTable, eq, isNull, and } from "@workspace/db";
import { buildAnalysisPrompt, PromptBuildError } from "@/lib/analysis-prompt";
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
  AuthenticationError,
  APIError,
} from "@anthropic-ai/sdk";
import type { ParsedDeck } from "@/lib/games/types";

const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2500;
const TEMPERATURE = 0.4;

function logErr(err: unknown): void {
  if (err instanceof APIConnectionTimeoutError) {
    console.error("[prompts/test] Anthropic timeout");
  } else if (err instanceof APIConnectionError) {
    console.error("[prompts/test] Anthropic sem conexão:", (err as Error).message);
  } else if (err instanceof RateLimitError) {
    console.error("[prompts/test] Anthropic rate limit");
  } else if (err instanceof AuthenticationError) {
    console.error("[prompts/test] Anthropic autenticação falhou");
  } else if (err instanceof APIError) {
    console.error(`[prompts/test] Anthropic HTTP ${(err as APIError).status}`);
  } else {
    console.error("[prompts/test] erro inesperado:", err);
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: { gameId?: string; systemContent?: string; analysisId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { gameId, systemContent, analysisId } = body;

  if (!gameId?.trim()) {
    return Response.json({ error: "gameId é obrigatório." }, { status: 400 });
  }
  if (!systemContent?.trim()) {
    return Response.json({ error: "systemContent é obrigatório." }, { status: 400 });
  }
  if (!analysisId?.trim()) {
    return Response.json({ error: "analysisId é obrigatório." }, { status: 400 });
  }

  const capCheck = await checkTestCap();
  if (!capCheck.allowed) {
    return Response.json(
      { error: "daily_cap", message_pt: "Cap diário atingido — testes pausados pra preservar produção." },
      { status: 503 }
    );
  }

  // Carrega deck da análise escolhida
  const rows = await db
    .select({ deckParsed: analysesTable.deckParsed })
    .from(analysesTable)
    .where(
      and(
        eq(analysesTable.id, analysisId.trim()),
        isNull(analysesTable.deletedAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  }

  const deck = rows[0].deckParsed as unknown as ParsedDeck;

  let built: Awaited<ReturnType<typeof buildAnalysisPrompt>>;
  try {
    built = await buildAnalysisPrompt({
      gameId: gameId.trim(),
      deck,
      enrichedCards: [],
      systemContentOverride: systemContent.trim(),
    });
  } catch (err) {
    if (err instanceof PromptBuildError) {
      return Response.json({ error: err.message }, { status: err.statusHint });
    }
    return Response.json({ error: "Erro ao montar o prompt." }, { status: 500 });
  }

  const anthropic = new Anthropic();
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
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const finalMessage = await stream.finalMessage();
        const inputTokens = finalMessage.usage.input_tokens;
        const outputTokens = finalMessage.usage.output_tokens;

        // Rastreia custo como is_test=true, sem analysis_id
        await pool.query(
          `INSERT INTO api_costs (input_tokens, output_tokens, cost_usd, is_test)
           VALUES ($1, $2, $3, true)`,
          [
            inputTokens,
            outputTokens,
            ((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(6),
          ],
        );
      } catch (err) {
        logErr(err);
        controller.error(new Error("stream_error"));
        return;
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
    },
  });
}
