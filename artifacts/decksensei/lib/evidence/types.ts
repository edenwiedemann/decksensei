export interface PipelineRun {
  itemsImported: number;
  archetypesUpdated: string[];
  warnings: string[];
}

export interface FingerprintCheck {
  ok: boolean;
  failures: string[];
}

export interface EvidencePipeline {
  sourceId: string;
  validateFingerprint(): Promise<FingerprintCheck>;
  import(): Promise<PipelineRun>;
}
