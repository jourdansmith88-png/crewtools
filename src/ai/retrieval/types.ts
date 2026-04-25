export type AIGroundingSourceLabel =
  | "PWA"
  | "Compensation Manual"
  | "Scheduler Manual"
  | "CrewTools Logic"
  | "Web Discussion"
  | "Forum / Unofficial";

export type AIGroundingTier =
  | "pwa"
  | "compensation_manual"
  | "scheduler_manual"
  | "crewtools_logic"
  | "web_discussion"
  | "forum_unofficial";

export type AIGroundingSnippet = {
  id: string;
  sourceLabel: AIGroundingSourceLabel;
  tier: AIGroundingTier;
  section: string;
  snippet: string;
  note?: string;
  relevanceScore: number;
  matchedTerms?: string[];
  metadata?: Record<string, string | number | boolean>;
};

export type SectionAwareGroundingPacket = {
  id: string;
  sourceLabel: AIGroundingSourceLabel;
  tier: AIGroundingTier;
  section: string;
  title?: string;
  packetType:
    | "governing_section"
    | "exception_note"
    | "worked_example"
    | "interaction_linked"
    | "compensation_support"
    | "scheduler_support";
  content: string;
  pages: number[];
  matchedTerms: string[];
  crossRefsFollowed: string[];
  usedSectionExpansion: boolean;
  note?: string;
  relevanceScore: number;
};

export type ExternalSearchUseWhen =
  | "internal_support_weak"
  | "interpretation_question"
  | "terminology_clarification"
  | "edge_case_context";

export type ExternalSearchPolicy = {
  enabled: boolean;
  maxSnippets: number;
  useWhen: ExternalSearchUseWhen[];
};

export type WorkflowGroundingPolicy = {
  internalOnly?: boolean;
  externalSearch?: ExternalSearchPolicy;
};

export type GroundingContextPack = {
  internal: {
    pwa: AIGroundingSnippet[];
    compensationManual: AIGroundingSnippet[];
    schedulerManual: AIGroundingSnippet[];
    crewtoolsLogic: AIGroundingSnippet[];
  };
  sectionPackets: {
    governingSections: SectionAwareGroundingPacket[];
    exceptionsNotes: SectionAwareGroundingPacket[];
    workedExamples: SectionAwareGroundingPacket[];
    interactionLinkedSections: SectionAwareGroundingPacket[];
    compensationSupport: SectionAwareGroundingPacket[];
    schedulerSupport: SectionAwareGroundingPacket[];
  };
  external: {
    webDiscussion: AIGroundingSnippet[];
    forumUnofficial: AIGroundingSnippet[];
  };
  retrievalMeta: {
    externalUsed: boolean;
    externalAllowed: boolean;
    externalReason?: ExternalSearchUseWhen;
    totalSnippetCount: number;
    governingSectionsSelected: string[];
    crossReferencesFollowed: string[];
    sectionExpansionUsed: boolean;
    sectionLed: boolean;
  };
};
