export const runtime = "nodejs";

import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { pool } from "@workspace/db";

interface RecentAnalysis {
  id: string;
  game_id: string;
  deck_preview: string;
  analysis_text: string;
  archetype_label: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") ?? "digimon";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 20);

  const rows = await pool.query<RecentAnalysis>(
    `SELECT
       a.id,
       a.game_id,
       LEFT(a.deck_text, 120)          AS deck_preview,
       COALESCE(a.analysis_text, '')   AS analysis_text,
       a.similar_archetype_id          AS archetype_label,
       a.created_at::text              AS created_at
     FROM analyses a
     WHERE a.game_id = $1
       AND a.deleted_at IS NULL
       AND a.analysis_text IS NOT NULL
     ORDER BY a.created_at DESC
     LIMIT $2`,
    [gameId, limit],
  );

  return Response.json({ analyses: rows.rows });
}
