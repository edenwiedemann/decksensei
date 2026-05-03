import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { gamesTable } from "./games";

export const metaArchetypeEvidencesTable = pgTable(
  "meta_archetype_evidences",
  {
    id: serial("id").primaryKey(),
    gameId: varchar("game_id", { length: 100 })
      .notNull()
      .references(() => gamesTable.id),
    archetypeId: varchar("archetype_id", { length: 100 }).notNull(),
    sourceId: varchar("source_id", { length: 100 }).notNull(),
    eventLabel: text("event_label").notNull(),
    eventDate: date("event_date").notNull(),
    url: text("url"),
    data: jsonb("data").notNull(),
    verified: boolean("verified").notNull().default(false),
    verifiedBy: varchar("verified_by", { length: 100 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationNote: text("verification_note"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("evidences_archetype_idx").on(t.gameId, t.archetypeId),
    index("evidences_source_idx").on(t.sourceId),
    index("evidences_event_date_idx").on(t.eventDate),
    uniqueIndex("evidences_unique_idx").on(
      t.sourceId,
      t.eventLabel,
      t.archetypeId,
    ),
  ],
);

export type MetaArchetypeEvidence =
  typeof metaArchetypeEvidencesTable.$inferSelect;
export type NewMetaArchetypeEvidence =
  typeof metaArchetypeEvidencesTable.$inferInsert;
