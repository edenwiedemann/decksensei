import { db, metaArchetypeEvidencesTable } from "@workspace/db";
import type { NewMetaArchetypeEvidence } from "@workspace/db";
import { sql } from "drizzle-orm";

export type NewEvidence = Omit<
  NewMetaArchetypeEvidence,
  "id" | "importedAt"
>;

/**
 * Insere ou atualiza uma evidência pelo índice único (sourceId, eventLabel, archetypeId).
 *
 * Em caso de conflito, atualiza todos os campos EXCETO os de verificação
 * (verified, verifiedBy, verifiedAt, verificationNote) — para preservar
 * revisões manuais.
 */
export async function upsertEvidence(ev: NewEvidence): Promise<void> {
  await db
    .insert(metaArchetypeEvidencesTable)
    .values(ev)
    .onConflictDoUpdate({
      target: [
        metaArchetypeEvidencesTable.sourceId,
        metaArchetypeEvidencesTable.eventLabel,
        metaArchetypeEvidencesTable.archetypeId,
      ],
      set: {
        gameId: ev.gameId,
        eventDate: ev.eventDate,
        url: ev.url,
        data: ev.data,
        importedAt: sql`now()`,
      },
    });
}
