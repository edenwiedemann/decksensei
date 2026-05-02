import { pgTable, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";

export const gamesTable = pgTable("games", {
  id: varchar("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Game = typeof gamesTable.$inferSelect;
export type InsertGame = typeof gamesTable.$inferInsert;
