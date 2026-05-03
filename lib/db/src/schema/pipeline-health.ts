import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const pipelineHealthTable = pgTable(
  "pipeline_health",
  {
    id: serial("id").primaryKey(),
    sourceId: varchar("source_id", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    itemsImported: integer("items_imported"),
    failures: jsonb("failures"),
    errorMessage: text("error_message"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pipeline_health_source_idx").on(t.sourceId, t.detectedAt),
  ],
);

export type PipelineHealth = typeof pipelineHealthTable.$inferSelect;
export type NewPipelineHealth = typeof pipelineHealthTable.$inferInsert;
