import crypto from "crypto";
import {
  db,
  sessionsTable,
  usersTable,
  eq,
  and,
  gt,
  sql,
} from "@workspace/db";
import type { User } from "@/lib/db/users";

export const SESSION_COOKIE = "session_token";

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE = SESSION_TTL_DAYS * 24 * 60 * 60; // segundos

export async function createSession(userId: number): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessionsTable).values({ id: sessionId, userId, expiresAt });

  return sessionId;
}

export async function getSessionUser(sessionId: string): Promise<User | null> {
  const rows = await db
    .select({ user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0]?.user ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
}

export async function touchLastSeen(userId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ lastSeenAt: sql`NOW()` })
    .where(eq(usersTable.id, userId));
}
