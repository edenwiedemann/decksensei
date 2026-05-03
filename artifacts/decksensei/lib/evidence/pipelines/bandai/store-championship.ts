import type { EvidencePipeline, PipelineRun } from "../../types";
import { validateBandaiFingerprint } from "./fingerprint";
import { discoverReports, importEventReport } from "./shared";

const SOURCE_ID = "bandai-store-championship";
const PATTERN = /store.*(cs|championship)/i;

export class BandaiStoreChampionshipPipeline implements EvidencePipeline {
  sourceId = SOURCE_ID;

  async validateFingerprint() {
    return validateBandaiFingerprint();
  }

  async import(): Promise<PipelineRun> {
    const reports = await discoverReports(SOURCE_ID, PATTERN);
    let itemsImported = 0;
    const archetypesUpdated = new Set<string>();
    const warnings: string[] = [];

    for (const url of reports) {
      try {
        const result = await importEventReport(SOURCE_ID, url);
        itemsImported += result.archetypeCount;
        result.archetypeIds.forEach((id) => archetypesUpdated.add(id));
        if (result.unmatched.length > 0) {
          warnings.push(
            `${url}: ${result.unmatched.length} deck names não mapeados — ${result.unmatched.join(", ")}`,
          );
        }
      } catch (err) {
        warnings.push(`Falha em ${url}: ${(err as Error).message}`);
      }
    }

    return { itemsImported, archetypesUpdated: [...archetypesUpdated], warnings };
  }
}
