export type RuleType = "contract" | "scheduler_practice" | "inference";

export type SupportLevel =
  | "contract_backed"
  | "manual_backed"
  | "mixed"
  | "inference_heavy";

export type CopilotScenarioFamily =
  | "status_basics"
  | "reroute_reassignment"
  | "sick_leave_interaction"
  | "premium_pickup"
  | "dispute_citation_helper";

export type ParsedQuestionIntent =
  | "what_happens"
  | "can_i"
  | "citation_help"
  | "dispute_help";

export type ContractSourceRef = {
  sourceId: "pwa" | "compensation_manual" | "scheduler_manual";
  section: string;
  title?: string;
  pageHint?: string;
  quoteSnippet?: string;
};

export type ContractRuleCondition = {
  field:
    | "status"
    | "assignmentType"
    | "pickupType"
    | "premiumType"
    | "interactionRelationship"
    | "contactWindow"
    | "processingCountsKnown"
    | "beforeReport"
    | "afterReport"
    | "eventTiming"
    | "rerouteOccurred"
    | "reassignmentOccurred"
    | "tripTouched"
    | "leaveType"
    | "sickUsed"
    | "sameDayInteraction"
    | "questionIntent";
  operator: "equals" | "not_equals" | "in" | "exists";
  value: string | string[] | boolean;
};

export type ContractRuleOutcome = {
  outcomeId: string;
  label: string;
  outcomeStatement: string;
  explanation: string;
  nextActionHint?: string;
  whatCouldChange?: string[];
  breakdown?: string[];
};

export type ContractRule = {
  id: string;
  scenario: CopilotScenarioFamily;
  subscenario?: string;
  title: string;
  summary: string;
  ruleType: RuleType;
  appliesTo: Array<"lineholder" | "reserve" | "both">;
  requiredFacts: Array<keyof ParsedScenarioFacts>;
  conditions: ContractRuleCondition[];
  outcomes: ContractRuleOutcome[];
  exceptions?: string[];
  priority: number;
  confidenceBase: "high" | "medium" | "low";
  references: ContractSourceRef[];
  relatedRuleIds?: string[];
};

export type ParsedScenarioFacts = {
  status?: "reserve" | "lineholder";
  assignmentType?: string;
  pickupType?: string;
  premiumType?: string;
  interactionRelationship?: "overlap" | "sequential";
  contactWindow?: "within_18_hours" | "outside_18_hours";
  processingCountsKnown?: boolean;
  beforeReport?: boolean;
  afterReport?: boolean;
  eventTiming?: string;
  rerouteOccurred?: boolean;
  reassignmentOccurred?: boolean;
  tripTouched?: boolean;
  leaveType?: string;
  sickUsed?: boolean;
  sameDayInteraction?: boolean;
  questionIntent?: ParsedQuestionIntent;
};

export type ContractCopilotEvidenceInputType =
  | "trip_screenshot"
  | "schedule_screenshot"
  | "timecard_screenshot"
  | "trip_text_paste";

export type ContractCopilotExtractedTripLeg = {
  id: string;
  legLabel?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  legType?: "operating" | "deadhead" | "unknown";
  originalDepartureTime?: string;
  changedDepartureTime?: string;
  originalArrivalTime?: string;
  changedArrivalTime?: string;
  changeTimestamp?: string;
  notes?: string;
};

export type ContractCopilotExtractedTripFacts = {
  summary: string;
  pairingNumber?: string;
  dutyDate?: string;
  dutyPeriodLabel?: string;
  reportTime?: string;
  releaseTime?: string;
  originalLegTiming?: string[];
  changedLegTiming?: string[];
  rerouteIndicators?: string[];
  reassignmentIndicators?: string[];
  visibleChangeTimestamps?: string[];
  legs: ContractCopilotExtractedTripLeg[];
  missingOrUnclear?: string[];
  confidence: "high" | "medium" | "low";
};

export type ContractCopilotPendingExtractionReview = {
  id: string;
  evidenceType: ContractCopilotEvidenceInputType;
  sourceName: string;
  extractedAtIso: string;
  imagePreviewDataUrl?: string;
  facts: ContractCopilotExtractedTripFacts;
  suggestedFactPatch: Partial<ParsedScenarioFacts>;
  status: "needs_confirmation" | "confirmed" | "rejected";
};

export type ContractCopilotAttachedEvidence = {
  id: string;
  evidenceType: ContractCopilotEvidenceInputType;
  sourceName?: string;
  createdAtIso: string;
  imagePreviewDataUrl?: string;
  status: "attached" | "extracting" | "added" | "failed";
  errorMessage?: string;
  facts?: ContractCopilotExtractedTripFacts;
  factPatchApplied?: Partial<ParsedScenarioFacts>;
};

export type ContractCopilotScreenshotLifecycle = {
  stage:
    | "idle"
    | "selected"
    | "extracting"
    | "failed"
    | "added";
  sourceName?: string;
  message?: string;
  updatedAtIso: string;
};

export type ClarifyingQuestion = {
  id: string;
  prompt: string;
  factField: keyof ParsedScenarioFacts;
  required: boolean;
  quickReplies?: ContractQuickReply[];
};

export type ContractQuickReply = {
  id: string;
  label: string;
  factPatch?: Partial<ParsedScenarioFacts>;
  replyMessage?: string;
};

export type ContractAnswerCard = {
  status:
    | "answered"
    | "needs_clarification"
    | "partial_answer"
    | "insufficient_support"
    | "conflicting_rules";
  scenarioLabel: string;
  answerCompleteness?: "provisional" | "resolved";
  shortAnswer: string;
  plainEnglishExplanation: string;
  confidence: "high" | "medium" | "low";
  supportLevel: SupportLevel;
  assumptions: string[];
  scenarioBreakdown?: string[];
  payBreakdown?: string[];
  missingFacts?: Array<keyof ParsedScenarioFacts>;
  clarifyingQuestions?: ClarifyingQuestion[];
  evidenceSummary: string[];
  references: Array<{
    label: string;
    sourceId: "pwa" | "compensation_manual" | "scheduler_manual";
    displaySourceLabel?:
      | "PWA"
      | "Compensation Manual"
      | "Scheduler Manual"
      | "CrewTools Logic"
      | "Web Discussion"
      | "Forum / Unofficial";
    section: string;
    pageHint?: string;
    quoteSnippet?: string;
    ruleType: RuleType;
  }>;
  followUpSuggestion?: string;
  whatCouldChangeThisAnswer?: string[];
  breakItDown?: string[];
  caveats?: string[];
};

export type ContractCopilotTurn = {
  id: string;
  role: "pilot" | "copilot";
  message: string;
  timestampIso: string;
  answerCard?: ContractAnswerCard;
  debugSnapshot?: Record<string, unknown>;
  clarifyingQuestion?: string;
  clarifyingField?: keyof ParsedScenarioFacts;
  quickReplies?: ContractQuickReply[];
  factPatch?: Partial<ParsedScenarioFacts>;
  confirmedEvidenceSnapshot?: ContractCopilotAttachedEvidence[];
  source?: "free_text" | "quick_reply" | "typed_reply" | "image_attachment" | "system";
};

export type ContractCopilotSession = {
  sessionId: string;
  currentScenario?: CopilotScenarioFamily;
  facts: ParsedScenarioFacts;
  manualFacts?: ParsedScenarioFacts;
  pendingExtraction?: ContractCopilotPendingExtractionReview;
  confirmedEvidence?: ContractCopilotAttachedEvidence[];
  screenshotLifecycle?: ContractCopilotScreenshotLifecycle;
  unresolvedQuestion?: string;
  lastAskedClarifyingField?: keyof ParsedScenarioFacts;
  lastClarifyingQuestionId?: string;
  turns: ContractCopilotTurn[];
  status: "idle" | "awaiting_reply" | "answered";
  clarificationCount: number;
};

export type ContractCopilotThread = ContractCopilotSession & {
  threadId: string;
  rootQuestion?: string;
  createdAtIso: string;
  updatedAtIso: string;
  resolvedAtIso?: string;
};

export type ContractCopilotThreadViewState = {
  activeThreadId: string | null;
  supportOpenTurnIds: string[];
  evidenceOpenTurnIds: string[];
};

export type ScenarioCatalogEntry = {
  id: CopilotScenarioFamily;
  label: string;
  description: string;
  exampleQuestions: string[];
  requiredFacts: Array<keyof ParsedScenarioFacts>;
  preferredRuleOrder: RuleType[];
};

export type ParsedScenarioResult = {
  scenario: CopilotScenarioFamily | null;
  normalizedQuestion: string;
  extractedFacts: ParsedScenarioFacts;
  missingFacts: Array<keyof ParsedScenarioFacts>;
  confidence: "high" | "medium" | "low";
};

export type RetrievedRuleSet = {
  scenario: CopilotScenarioFamily | null;
  matchedRules: ContractRule[];
  supportingRules: ContractRule[];
  missingFacts: Array<keyof ParsedScenarioFacts>;
};

export type ResolvedContractOutcome = {
  status: ContractAnswerCard["status"];
  shortAnswer: string;
  plainEnglishExplanation: string;
  assumptions: string[];
  followUpSuggestion?: string;
  whatCouldChangeThisAnswer?: string[];
  breakItDown?: string[];
};
