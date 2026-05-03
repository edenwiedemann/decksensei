export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import type { ParserConfig, CardApiConfig, ValidatorConfig } from "@/lib/game-config";
import { GenericDeckParser } from "@/lib/games/generic/parser";
import { GenericCardAPI } from "@/lib/games/generic/card-api";
import { GenericDeckValidator } from "@/lib/games/generic/validator";

interface TestBody {
  parser?: ParserConfig;
  card_api?: CardApiConfig;
  validator?: ValidatorConfig;
  sample_decklist?: string;
  sample_card_code?: string;
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const results: {
    parser?: unknown;
    card?: unknown;
    validation?: unknown;
    errors: string[];
  } = { errors: [] };

  // ── Teste do parser ────────────────────────────────────────────────────────
  if (body.parser && body.sample_decklist) {
    try {
      const parser = new GenericDeckParser(body.parser);
      const parsed = parser.parse(body.sample_decklist);
      results.parser = {
        mainDeck: parsed.mainDeck.slice(0, 5),
        mainCount: parsed.mainDeck.reduce((a, c) => a + c.quantity, 0),
        auxDeckKeys: Object.keys(parsed.auxDecks),
        parseErrors: parsed.errors.slice(0, 5),
      };
    } catch (err) {
      results.errors.push(`Parser: ${(err as Error).message}`);
    }
  }

  // ── Teste da Card API ──────────────────────────────────────────────────────
  if (body.card_api && body.sample_card_code) {
    try {
      const api = new GenericCardAPI(body.card_api);
      const card = await api.fetchCard(body.sample_card_code);
      results.card = card;
    } catch (err) {
      results.errors.push(`Card API: ${(err as Error).message}`);
    }
  }

  // ── Teste do validator ─────────────────────────────────────────────────────
  if (body.validator && body.parser && body.sample_decklist) {
    try {
      const parser = new GenericDeckParser(body.parser);
      const parsed = parser.parse(body.sample_decklist);
      const validator = new GenericDeckValidator(body.validator);
      results.validation = validator.validate(parsed);
    } catch (err) {
      results.errors.push(`Validator: ${(err as Error).message}`);
    }
  }

  return Response.json(results);
}
