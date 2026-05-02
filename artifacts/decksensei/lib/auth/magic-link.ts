import crypto from "crypto";
import { db, magicTokensTable, eq, sql, and, isNull, gt } from "@workspace/db";

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
  const now = new Date();

  const rows = await db
    .select()
    .from(magicTokensTable)
    .where(
      and(
        eq(magicTokensTable.tokenHash, tokenHash),
        isNull(magicTokensTable.usedAt),
        gt(magicTokensTable.expiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db
    .update(magicTokensTable)
    .set({ usedAt: sql`NOW()` })
    .where(eq(magicTokensTable.tokenHash, tokenHash));

  return row.userId;
}
