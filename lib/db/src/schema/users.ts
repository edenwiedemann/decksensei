import {
  pgTable,
  serial,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    city: varchar("city", { length: 255 }),
    state: varchar("state", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

export const magicTokensTable = pgTable("magic_tokens", {
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  userId: serial("user_id")
    .notNull()
    .references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const sessionsTable = pgTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: serial("user_id")
    .notNull()
    .references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
export type MagicToken = typeof magicTokensTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
