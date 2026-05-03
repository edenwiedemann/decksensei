export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";
import type { CardApiConfig, GameConfig } from "@/lib/game-config";

interface CardResult {
  code: string;
  name: string;
  imageUrl: string | null;
  type: string | null;
  color: string | null;
}

const CODE_RE = /^[A-Za-z]{1,4}-?\d+/;

/** Resolve dot-notation path no objeto da resposta. */
function getByDotPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Mapeia campos de um item da resposta usando field_mapping do config. */
function mapCard(
  item: Record<string, unknown>,
  cfg: CardApiConfig,
  requestedQuery: string,
): CardResult {
  const m = cfg.field_mapping;
  const get = (k: string): unknown => m[k] ? getByDotPath(item, m[k]) : undefined;

  const imageRaw = get("imageUrl");
  let imageUrl: string | null = null;
  if (imageRaw && cfg.image_url_template) {
    imageUrl = cfg.image_url_template.replace("{imageUrl}", String(imageRaw));
  } else if (typeof imageRaw === "string") {
    imageUrl = imageRaw;
  }

  return {
    code: (get("code") as string) ?? requestedQuery,
    name: (get("name") as string) ?? "",
    imageUrl,
    type: (get("type") as string) ?? null,
    color: (get("color") as string) ?? null,
  };
}

/** Resolve response_path ($ = root, $[N] = index, $.field = nested). */
function resolvePath(data: unknown, path: string): unknown {
  if (path === "$") return data;
  const arrMatch = /^\$\[(\d+)\]$/.exec(path);
  if (arrMatch) {
    return Array.isArray(data) ? data[parseInt(arrMatch[1], 10)] : null;
  }
  const norm = path.startsWith("$.") ? path.slice(2) : path.replace(/^\$/, "");
  return norm
    ? norm.split(".").reduce<unknown>((cur, p) => {
        if (cur == null || typeof cur !== "object") return null;
        return (cur as Record<string, unknown>)[p];
      }, data)
    : data;
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const gameId = url.searchParams.get("game")?.trim() ?? "digimon";

  if (q.length < 2) return Response.json({ results: [] });

  // Busca config do jogo no banco
  const row = await pool.query<{ config: unknown }>(
    "SELECT config FROM games WHERE id = $1",
    [gameId],
  );
  const gameConfig = row.rows[0]?.config as GameConfig | undefined;
  const cfg = gameConfig?.card_api;

  if (!cfg) return Response.json({ results: [] });

  const isCode = CODE_RE.test(q);
  let apiUrl: string;
  if (isCode) {
    apiUrl = cfg.url_template.replace("{code}", encodeURIComponent(q));
  } else if (cfg.search_url_template) {
    apiUrl = cfg.search_url_template.replace("{query}", encodeURIComponent(q));
  } else {
    // Fallback: usa url_template como busca por nome se não houver search_url
    apiUrl = cfg.url_template.replace("{code}", encodeURIComponent(q));
  }

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json", ...(cfg.headers ?? {}) },
    });

    if (!res.ok) return Response.json({ results: [] });

    const raw: unknown = await res.json();

    // Normaliza resposta: pode ser array ou item único
    let items: unknown[];
    if (Array.isArray(raw)) {
      items = raw;
    } else {
      const resolved = resolvePath(raw, cfg.response_path);
      items = Array.isArray(resolved)
        ? resolved
        : resolved != null
          ? [resolved]
          : [];
    }

    const results: CardResult[] = items
      .slice(0, 15)
      .map((item) => mapCard(item as Record<string, unknown>, cfg, q));

    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
