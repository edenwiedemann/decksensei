export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@workspace/db";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

const WINDOW_SEC = 3600;
const LIMIT_ANON = 5;
const LIMIT_AUTH = 30;

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const isAuthenticated = !!cookieStore.get("session_token")?.value;
  const ip = getClientIp(req);
  const key = isAuthenticated ? `auth:${ip}` : `anon:${ip}`;
  const limit = isAuthenticated ? LIMIT_AUTH : LIMIT_ANON;

  let used = 0;
  try {
    const result = await pool.query<{ count: number; window_start: string }>(
      `SELECT count, window_start FROM rate_limits WHERE key = $1 LIMIT 1`,
      [key],
    );
    if (result.rows[0]) {
      const row = result.rows[0];
      const windowStart = new Date(row.window_start);
      const windowEnd = new Date(windowStart.getTime() + WINDOW_SEC * 1000);
      if (Date.now() < windowEnd.getTime()) {
        used = Number(row.count);
      }
    }
  } catch {}

  return Response.json({ used, limit, isAuthenticated });
}
