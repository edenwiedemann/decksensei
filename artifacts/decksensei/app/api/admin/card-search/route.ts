export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

interface DigimonApiCard {
  id?: string;
  name?: string;
  color?: string;
  type?: string;
  pretty_url?: string | null;
}

interface CardResult {
  code: string;
  name: string;
  imageUrl: string | null;
  type: string | null;
  color: string | null;
}

const CODE_RE = /^[A-Za-z]{1,4}-?\d+/;

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ results: [] });
  }

  const isCode = CODE_RE.test(q);
  const apiUrl = isCode
    ? `https://digimoncard.io/api-public/search?card=${encodeURIComponent(q)}`
    : `https://digimoncard.io/api-public/search?name=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return Response.json({ results: [] });

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return Response.json({ results: [] });

    const results: CardResult[] = (data as DigimonApiCard[])
      .slice(0, 15)
      .map((c) => ({
        code:     c.id    ?? "",
        name:     c.name  ?? "",
        imageUrl: c.pretty_url ? `https://digimoncard.io/images/cards/${c.pretty_url}.jpg` : null,
        type:     c.type  ?? null,
        color:    c.color ?? null,
      }));

    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
