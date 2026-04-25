export type ContractDocumentSource = "pwa" | "compensation_manual" | "scheduler_manual";

export type ContractDocumentChunk = {
  id: string;
  source: ContractDocumentSource;
  page: number;
  section: string;
  title?: string;
  text: string;
  crossRefs: string[];
  sectionAnchors?: string[];
  tags: string[];
  nearbyIds: string[];
  isDefinition: boolean;
  isException: boolean;
};

export type ContractSearchMatch = {
  chunk: ContractDocumentChunk;
  score: number;
  reasons: string[];
  matchedTerms: string[];
};
