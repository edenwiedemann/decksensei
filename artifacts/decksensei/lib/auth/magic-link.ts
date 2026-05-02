import crypto from "crypto";
import { db, magicTokensTable, sql } from "@workspace/db";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function generateToken(userId: number): Promise<string> {
  const token = crypto.randomUUID();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(magicTokensTable).values({ tokenHash, userId, expiresAt });

  return token;
}

export async function verifyToken(token: string): Promise<number | null> {
  const tokenHash = hashToken(token);
  const result = await db.execute(sql`
    UPDATE magic_tokens
    SET used_at = NOW()
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING user_id
  `);
  const rows = (result as unknown as { rows: Array<{ user_id: number }> }).rows;
  return rows[0]?.user_id ?? null;
}
