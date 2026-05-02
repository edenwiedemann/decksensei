import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gamesTable } from "./games";

export const metaSnapshotsTable = pgTable(
  "meta_snapshots",
  {
    id: serial("id").primaryKey(),
    gameId: varchar("game_id", { length: 100 })
      .notNull()
      .references(() => gamesTable.id),
    version: varchar("version", { length: 100 }).notNull(),
    jsonContent: jsonb("json_content").notNull(),
    notes: text("notes"),
    scope: varchar("scope", { length: 50 }).notNull().default("global"),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("meta_snapshots_game_id_idx").on(t.gameId),
    uniqueIndex("meta_snapshots_one_active_per_game_scope_idx")
      .on(t.gameId, t.scope)
      .where(sql`${t.active} = true`),
  ],
);

export const promptsTable = pgTable(
  "prompts",
  {
    id: serial("id").primaryKey(),
    gameId: varchar("game_id", { length: 100 })
      .notNull()
      .references(() => gamesTable.id),
    version: varchar("version", { length: 100 }).notNull(),
    systemContent: text("system_content").notNull(),
    notes: text("notes"),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("prompts_game_id_idx").on(t.gameId),
    uniqueIndex("prompts_one_active_per_game_idx")
      .on(t.gameId)
      .where(sql`${t.active} = true`),
  ],
);

export type MetaSnapshot = typeof metaSnapshotsTable.$inferSelect;
export type InsertMetaSnapshot = typeof metaSnapshotsTable.$inferInsert;
export type Prompt = typeof promptsTable.$inferSelect;
export type InsertPrompt = typeof promptsTable.$inferInsert;
