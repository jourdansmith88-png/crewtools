import type { ContractAnswerCard, ParsedScenarioFacts } from "../../types/contractCopilot.ts";
import type { ContractDocumentChunk, ContractSearchMatch } from "../retrieval/contracts/documentTypes.ts";
import type { GoverningSectionCandidate, GoverningSectionRoute } from "../retrieval/contracts/governingSections.ts";
import type { SectionAwareGroundingPacket } from "../retrieval/types.ts";
import type { RetrievedContractSnippet } from "../workflows/contractCopilot/retrieval.ts";

export type ContractBrainToolType =
  | "contractCopilot"
  | "reroutePayCalculator"
  | "timecardDecoder"
  | "pbsBidAssistant"
  | "pbXdayCalculator"
  | "genericContractTool";

export type ContractBrainSourcePreference =
  | "pwa_first"
  | "compensation_first"
  | "scheduler_first"
  | "balanced";

export type ContractBrainDocumentIndex = {
  pwaChunks: ContractDocumentChunk[];
  compensationChunks: ContractDocumentChunk[];
  schedulerChunks: ContractDocumentChunk[];
  hasPwaIndex: boolean;
  hasCompensationIndex: boolean;
  hasSchedulerIndex: boolean;
};

export type ContractBrainSupportCandidate = {
  id: string;
  kind: "match" | "packet" | "snippet";
  sourceName: string;
  section: string;
  title?: string;
  quoteSnippet?: string;
  note?: string;
  confidence: "high" | "medium" | "low";
  matchReason: string;
  matchedTerms?: string[];
};

export type RetrieveContractSupportInput = {
  question: string;
  toolType: ContractBrainToolType;
  contractIndex: ContractBrainDocumentIndex;
  knownFacts?: ParsedScenarioFacts;
  desiredAnchors?: string[];
  sourcePreference?: ContractBrainSourcePreference;
  deterministicScenario?: string;
  scenarioFamily?: string | null;
  matchedInteractionRules?: unknown[];
  maxMatches?: number;
};

export type RetrieveContractSupportOutput = {
  searchableChunks: ContractDocumentChunk[];
  constrainedSearchChunks: ContractDocumentChunk[];
  primaryMatches: ContractSearchMatch[];
  expandedMatches: ContractSearchMatch[];
  linkedMatches: ContractSearchMatch[];
  governingSectionCandidates: GoverningSectionCandidate[];
  governingSectionRoute: GoverningSectionRoute;
  sectionPackets: SectionAwareGroundingPacket[];
  seededRetrievedSupport: RetrievedContractSnippet[];
  candidateSupport: ContractBrainSupportCandidate[];
  exactSectionAnchors: string[];
  sourceNames: string[];
  confidence: "high" | "medium" | "low";
  matchReason: string;
  searchMode: "constrained" | "global" | "constrained_then_global";
  routingFallbackOccurred: boolean;
};

export type SelectGoverningSectionsInput = {
  question: string;
  toolType: ContractBrainToolType;
  scenarioType?: string;
  knownFacts?: ParsedScenarioFacts;
  candidateSupport?: RetrieveContractSupportOutput;
};

export type SelectGoverningSectionsOutput = {
  governingSections: string[];
  controllingSource?: string;
  missingSourceWarnings: string[];
  governingSectionRoute?: GoverningSectionRoute;
};

export type BuildSupportCardsInput = {
  governingSections: string[];
  candidateSupport: ContractBrainSupportCandidate[];
  answerText?: string;
};

export type BuildSupportCardsOutput = {
  visibleSupportCards: Array<{
    sourceName: string;
    section: string;
    title?: string;
    quoteSnippet?: string;
    note?: string;
  }>;
  exactQuotes: string[];
  whatControls?: string;
  sourceLimitationNotes: string[];
};

export type VerifyToolAnswerInput = {
  toolType: ContractBrainToolType;
  question: string;
  proposedAnswer: ContractAnswerCard;
  calculatedResult?: unknown;
  supportCards: BuildSupportCardsOutput["visibleSupportCards"];
  knownFacts?: ParsedScenarioFacts;
};

export type VerifyToolAnswerOutput = {
  trustLevel: "resolved" | "caution" | "warning";
  truthGuardNotes: string[];
  unsupportedClaims: string[];
  missingFacts: string[];
  finalSafetyNotes: string[];
  verifierResult?: unknown;
};

export type ContractBrainSmokeFixture = {
  id: string;
  toolType: ContractBrainToolType;
  question: string;
  expectedSection: string;
};
