import { pool } from "@workspace/db";

export interface GameListItem {
  id: string;
  label: string;
}

export async function getGames(): Promise<GameListItem[]> {
  const r = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM games ORDER BY name",
  );
  return r.rows.map((g) => ({ id: g.id, label: g.name }));
}
