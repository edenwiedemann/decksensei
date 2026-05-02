import { db, usersTable, eq, sql } from "@workspace/db";

export type User = typeof usersTable.$inferSelect;

export async function upsertUser({ email }: { email: string }): Promise<User> {
  const rows = await db
    .insert(usersTable)
    .values({ email })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { lastSeenAt: sql`NOW()` },
    })
    .returning();
  return rows[0];
}

export async function updateUserLocation(
  userId: number,
  city: string | null,
  state: string | null,
): Promise<void> {
  await db
    .update(usersTable)
    .set({ city, state })
    .where(eq(usersTable.id, userId));
}

export async function getUser(userId: number): Promise<User | null> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  return rows[0] ?? null;
}
