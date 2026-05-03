import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  numeric,
  timestamp,
  check,
  index,
} from "drizzle-orm/pg-core";
import { gamesTable } from "./games";
import { usersTable } from "./users";
import { metaSnapshotsTable, promptsTable } from "./meta";

export const analysesTable = pgTable(
  "analyses",
  {
    id: varchar("id", { length: 24 }).primaryKey(),
    gameId: varchar("game_id", { length: 100 })
      .notNull()
      .references(() => gamesTable.id),
    userId: integer("user_id").references(() => usersTable.id),
    deckText: text("deck_text").notNull(),
    deckParsed: jsonb("deck_parsed").notNull(),
    analysisText: text("analysis_text").notNull(),
    promptVersionId: integer("prompt_version_id")
      .notNull()
      .references(() => promptsTable.id),
    metaSnapshotId: integer("meta_snapshot_id")
      .notNull()
      .references(() => metaSnapshotsTable.id),
    deckName: varchar("deck_name", { length: 80 }),
    similarArchetypeId: varchar("similar_archetype_id", { length: 100 }),
    responseTimeMs: integer("response_time_ms"),
    isFeatured: boolean("is_featured").notNull().default(false),
    featuredPlayerName: varchar("featured_player_name", { length: 100 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("analyses_game_id_idx").on(t.gameId),
    index("analyses_user_id_idx").on(t.userId),
    index("analyses_created_at_idx").on(t.createdAt),
    index("analyses_featured_idx")
      .on(t.gameId, t.isFeatured)
      .where(sql`${t.isFeatured} = true AND ${t.deletedAt} IS NULL`),
  ],
);

export const analysisFeedbackTable = pgTable(
  "analysis_feedback",
  {
    id: serial("id").primaryKey(),
    analysisId: varchar("analysis_id", { length: 24 })
      .notNull()
      .references(() => analysesTable.id),
    rating: varchar("rating", { length: 10 }).notNull(),
    comment: text("comment"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "analysis_feedback_rating_check",
      sql`${t.rating} IN ('up', 'down')`,
    ),
    index("analysis_feedback_analysis_id_idx").on(t.analysisId),
  ],
);

export const apiCostsTable = pgTable(
  "api_costs",
  {
    id: serial("id").primaryKey(),
    analysisId: varchar("analysis_id", { length: 24 }).references(
      () => analysesTable.id,
    ),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("api_costs_analysis_id_idx").on(t.analysisId)],
);

export const rateLimitsTable = pgTable(
  "rate_limits",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 255 }).notNull(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_key_idx").on(t.key)],
);

export type Analysis = typeof analysesTable.$inferSelect;
export type InsertAnalysis = typeof analysesTable.$inferInsert;
export type AnalysisFeedback = typeof analysisFeedbackTable.$inferSelect;
export type ApiCost = typeof apiCostsTable.$inferSelect;
export type RateLimit = typeof rateLimitsTable.$inferSelect;
