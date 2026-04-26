import type {
  ContractAnswerCard,
  ContractCopilotEvidenceInputType,
  ContractCopilotPendingExtractionReview,
  ContractCopilotSession,
  CopilotScenarioFamily,
} from "../../../types/contractCopilot.ts";
import { createSchema, expectObject, expectString, optionalString } from "../../core/validation.ts";

export type ContractCopilotApiRequest = {
  question: string;
  session?: Partial<
    Pick<ContractCopilotSession, "currentScenario" | "facts" | "clarificationCount" | "unresolvedQuestion">
  >;
};

export type ContractCopilotScreenshotExtractionRequest = {
  imageDataUrl: string;
  imageName: string;
  evidenceType?: ContractCopilotEvidenceInputType;
  questionHint?: string;
};

export type ContractCopilotScreenshotExtractionSuccessResponse = {
  ok: true;
  review: ContractCopilotPendingExtractionReview;
  meta: {
    modelUsed?: string;
  };
};

export type ContractCopilotFeedbackChoice =
  | "looks_right"
  | "answer_wrong"
  | "support_wrong"
  | "missing_source"
  | "needs_better_explanation";

export type ContractCopilotFeedbackDraft = {
  id: string;
  question: string;
  expectedLane: string;
  expectedSupportAnchors: Array<{
    source?: "PWA" | "Compensation Manual" | "Scheduler Manual";
    section?: string;
    terms?: string[];
    required?: boolean;
    role?: "primary" | "comparison" | "secondary";
  }>;
  mustInclude: string[];
  mustNotInclude: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  category: "beta_reported";
};

export type ContractCopilotFeedbackRequest = {
  question: string;
  answer: ContractAnswerCard;
  supportCards: ContractAnswerCard["references"];
  debugPayload?: Record<string, unknown> | null;
  userFeedback: ContractCopilotFeedbackChoice;
  correctedAnswer?: string;
  expectedSource?: string;
};

export type ContractCopilotFeedbackSuccessResponse = {
  ok: true;
  draftId: string;
  reportPath: string;
  draft: ContractCopilotFeedbackDraft;
};

export type ContractCopilotApiSuccessResponse = {
  ok: true;
  mode: "ai" | "ai_unverified" | "fallback";
  answer: ContractAnswerCard;
  detectedScenario: CopilotScenarioFamily | null;
  nextSession: ContractCopilotSession;
  meta: {
    fallbackReason?: string;
    modelUsed?: string;
  };
  debug?: {
    mode: "ai" | "ai_unverified" | "fallback";
    fallbackReason?: string;
    validationError?: string;
    rawModelText?: string;
    parsedKeys?: string[];
    missingRequiredFields?: string[];
    weakResponseGateFired?: boolean;
    retrievedSnippetCount?: number;
    retrievedSections?: string[];
    knownInteractionRuleIds?: string[];
    matchedInteractionRuleId?: string;
    matchedInteractionRuleTitle?: string;
    matchedInteractionRuleGoverningSources?: string[];
    matchedInteractionRuleReasoningSteps?: string[];
    routedGoverningSections?: string[];
    searchMode?: "constrained" | "global" | "constrained_then_global";
    routingFallbackOccurred?: boolean;
    governingSectionsSelected?: string[];
    governingSectionUsed?: string;
    bottomLineMode?: "section_led" | "generic";
    bottomLineReflectsGoverningRule?: boolean;
    strongerRuleBasedAnswerAvailableButNotUsed?: boolean;
    classificationLevelOnly?: boolean;
    concreteRuleBasedAnswerAvailable?: boolean;
    finalAnswerUsedConcreteRule?: boolean;
    concreteInteractionRuleAvailable?: boolean;
    finalAnswerUsedConcreteInteractionRule?: boolean;
    answerStillGenericDespiteInteractionRule?: boolean;
    missingGatingFacts?: string[];
    answerIsConditional?: boolean;
    gatingQuestionUsed?: string;
    sectionExpansionUsed?: boolean;
    crossReferencesFollowed?: string[];
    contextPacketSummary?: {
      governingSections: string[];
      exceptionsNotes: string[];
      interactionRuleLinkedSections: string[];
      compensationSupport: string[];
      schedulerSupport: string[];
    };
    governingSourcePriorityUsed?: string[];
    reasoningMode?: "interaction_led" | "generic_retrieval_led";
    answerMode?: "section_led" | "generic";
    retrievedSnippets?: string[];
    groundingSource?: "retrieved_contract_snippets" | "deterministic_support" | "fallback";
    usedRetrievedSupport?: boolean;
    externalAllowed?: boolean;
    externalUsed?: boolean;
    externalReason?: string;
    externalSnippetCount?: number;
    externalLabels?: string[];
    hasPwaIndex?: boolean;
    hasCompensationIndex?: boolean;
    hasSchedulerIndex?: boolean;
    directLookupTriggered?: boolean;
    directLookupType?: "pay_rate";
    parsedEquipment?: string[];
    parsedSeat?: string;
    parsedLongevityYear?: number;
    compensationRowsAvailable?: number;
    lookupSource?: string;
    intentType?: "direct_lookup" | "calculation" | "contract_scenario" | "document_explanation" | "clarification_needed";
    selectedLane?: string;
    requiredFieldsFound?: string[];
    missingFields?: string[];
    toolsUsed?: string[];
    retrievalSourcesUsed?: string[];
    aiSynthesisUsed?: boolean;
    OPENAI_API_KEYPresent?: boolean;
    modelClientCalled?: boolean;
    modelClientSucceeded?: boolean;
    modelClientError?: string;
    aiSynthesisAttempted?: boolean;
    aiSynthesisRejected?: boolean;
    aiRejectionReason?: string;
    sourcesAvailable?: string[];
    sourcesUsed?: string[];
    pwaSectionsUsed?: string[];
    compensationChunksUsed?: string[];
    schedulerChunksUsed?: string[];
    structuredRowsUsed?: string[];
    missingSourceWarnings?: string[];
    laneEnforced?: boolean;
    expectedTool?: string;
    retrievalAttempted?: boolean;
    laneExecutionResult?: "success" | "controlled_failure" | "clarification";
    documentShortcutUsed?: boolean;
    clarificationReason?: string;
    fallbackUsed?: boolean;
    fallthroughPrevented?: boolean;
    retryAttempts?: string[];
    sourceAvailability?: {
      hasPwaIndex: boolean;
      hasCompensationIndex: boolean;
      hasSchedulerIndex: boolean;
      compensationRowsAvailable: number;
    };
    retrievalPassCounts?: {
      primary: number;
      expanded: number;
      linked: number;
    };
    verifierRan?: boolean;
    verifierPassed?: boolean;
    verifierWarnings?: string[];
    verifierFailureReasons?: string[];
    verifierAdjustedAnswer?: boolean;
    finalSafetyPipelineRan?: boolean;
    truthGuardRan?: boolean;
    definitionApplicationGuardRan?: boolean;
    strongClaimsDetected?: string[];
    strongClaimsSupported?: string[];
    strongClaimsDowngraded?: string[];
    definitionSectionUsed?: boolean;
    operationalSectionUsed?: boolean;
    definitionOverrodeOperation?: boolean;
    definitionBasedAnswer?: boolean;
    applicationClaimDetected?: boolean;
    applicationClaimSupported?: boolean;
    applicationClaimDowngraded?: boolean;
    supportRerankerRan?: boolean;
    supportQualityGateRan?: boolean;
    answerDowngradedToCaution?: boolean;
    downgradeReasons?: string[];
    supportCandidatesBefore?: number;
    supportCandidatesAfter?: number;
    supportTopScores?: Array<{ section: string; score: number }>;
    supportWeakMatchWarning?: boolean;
    supportMatchedTerms?: string[];
    supportMatchedSections?: string[];
    supportMatchedAnswerTerms?: string[];
    supportMatchedAnswerSections?: string[];
    supportCardsFilteredOut?: number;
    supportDroppedReasons?: string[];
    supportPrimaryAnchorMissing?: boolean;
    primarySupportForcedByExactAnchor?: boolean;
    primarySupportAnchorUsed?: string;
    visibleSupportAnchorPromoted?: boolean;
    visibleSupportOriginalSection?: string[];
    visibleSupportPromotedSection?: string[];
    finalVisibleSupportSections?: string[];
    finalVisibleSupportPromotionApplied?: boolean;
    supportFinalRankingReason?: string;
    answerReferencedSections?: string[];
    supportInjectedFromAnswer?: boolean;
    supportMissingForReferencedSection?: boolean;
    controllingSectionLocked?: boolean;
    controllingSectionDisplay?: string;
    controllingSectionQuoteAttached?: boolean;
    controllingSectionQuote?: string;
    controllingSectionMissingExactText?: boolean;
    silverSlipPrimarySupportFound?: boolean;
    greenSlipComparisonSupportFound?: boolean;
    silverSlipSupportMissing?: boolean;
    xDayScenario?: boolean;
    xDayAnchorFound?: boolean;
    xDayGroupingScenario?: boolean;
    xDayGroupingAnchorFound?: boolean;
    xDayGroupingMissingSupportReason?: string;
    pbRerouteXdayScenario?: boolean;
    pbAnchorFound?: boolean;
    pbProcessingAnchorFound?: boolean;
    notificationAnchorFound?: boolean;
    pbScenarioMissingSupportReason?: string;
    futureRotationChangeScenario?: boolean;
    futureRotationChangeAnchorFound?: boolean;
    cpoOverrideAnchorFound?: boolean;
    knownAbsenceAnchorFound?: boolean;
    payProtectionAnchorFound?: boolean;
    futureRotationMissingSupportReason?: string;
    governingSectionIncludesXDay?: boolean;
    pcsSwapScenario?: boolean;
    pcsSwapAnchorFound?: boolean;
    pcsSwapMissingSupportReason?: string;
    pickupLimitScenario?: boolean;
    pickupLimitAnchorFound?: boolean;
    pickupLimitMissingSupportReason?: string;
    finalSupportReorderedForSpecificAnchor?: boolean;
    genericPrimaryDemotedReason?: string;
    governingSectionIncludesPcsSwap?: boolean;
    pcsSwapVisibleSupportTerms?: string[];
    pcsSwapSupportPromoted?: boolean;
    pcsSwapSupportMissingAnchors?: string[];
    vacationBankScenario?: boolean;
    vacationBankAnchorFound?: boolean;
    governingSectionIncludesVacationBank?: boolean;
    vacationBankVisibleSupportTerms?: string[];
    vacationBankSupportPromoted?: boolean;
    vacationBankSupportMissingAnchors?: string[];
    vacationBankMissingSupportReason?: string;
    domicileLayoverScenario?: boolean;
    domicileLayoverAnchorFound?: boolean;
    domicileLayoverMissingSupportReason?: string;
    sickLookbackScenario?: boolean;
    sickLookbackAnchorFound?: boolean;
    sickLookbackMissingSupportReason?: string;
    payCreditConsistencyScenario?: boolean;
    payCreditAnchorFound?: boolean;
    payCreditMissingSupportReason?: string;
    silverSlipStatusScenario?: boolean;
    gsTimeOffScenario?: boolean;
    restLegalityScenario?: boolean;
    restLegalityAnchorFound?: boolean;
    restLegalityMissingSupportReason?: string;
    farVsPwaIssueDetected?: boolean;
    deadheadRerouteConsequenceScenario?: boolean;
    deadheadRerouteAnchorFound?: boolean;
    deadheadRerouteMissingSupportReason?: string;
    processLookupScenario?: boolean;
    twentyThreeM7LogLookupScenario?: boolean;
    friendSwapUndoScenario?: boolean;
    rerouteConsistencyScenario?: boolean;
    rerouteAnchorFound?: boolean;
    rerouteMissingSupportReason?: string;
    qsCallOrderScenario?: boolean;
    qsCallOrderAnchorFound?: boolean;
    qsCallOrderMissingSupportReason?: string;
    oeNotificationScenario?: boolean;
    oeNotificationAnchorFound?: boolean;
    oeNotificationMissingSupportReason?: string;
    oeNotificationSupportRejectedReasons?: string[];
    oeNotificationVisibleSupportTerms?: string[];
    contactabilityScenario?: boolean;
    contactabilityAnchorFound?: boolean;
    contactabilityMissingSupportReason?: string;
    inferredPilotStatus?: string;
    shortCallNotificationScenario?: boolean;
    shortCallNotificationAnchorFound?: boolean;
    shortCallNotificationMissingSupportReason?: string;
    shortCallNotificationVisibleSupportTerms?: string[];
    apdDiagnosticScenario?: boolean;
    apdThresholdExplained?: boolean;
    apdDriftDetected?: boolean;
    shortCallDutyScenario?: boolean;
    shortCallDutyAnchorFound?: boolean;
    governingSectionIncludesDutyLegality?: boolean;
    evidenceParsingAttempted?: boolean;
    evidenceParsingSucceeded?: boolean;
    evidenceParsingForcedFallback?: boolean;
    evidenceParsingIgnoredReason?: string;
    scenarioProceedWithPartialContext?: boolean;
  };
};

export type ContractCopilotApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export const contractCopilotScreenshotExtractionRequestSchema =
  createSchema<ContractCopilotScreenshotExtractionRequest>(
    "contractCopilotScreenshotExtractionRequest",
    (value) => {
      const object = expectObject(value, "Contract Copilot screenshot extraction request");
      return {
        imageDataUrl: expectString(object.imageDataUrl, "imageDataUrl"),
        imageName: expectString(object.imageName, "imageName"),
        evidenceType:
          object.evidenceType === "trip_screenshot" ||
          object.evidenceType === "schedule_screenshot" ||
          object.evidenceType === "timecard_screenshot" ||
          object.evidenceType === "trip_text_paste"
            ? object.evidenceType
            : "trip_screenshot",
        questionHint: optionalString(object.questionHint),
      };
    }
  );

export const contractCopilotApiRequestSchema = createSchema<ContractCopilotApiRequest>(
  "contractCopilotApiRequest",
  (value) => {
    const object = expectObject(value, "Contract Copilot API request");
    const session =
      object.session && typeof object.session === "object"
        ? (object.session as ContractCopilotApiRequest["session"])
        : undefined;

    return {
      question: expectString(object.question, "question"),
      session: session
        ? {
            currentScenario: (session.currentScenario as CopilotScenarioFamily | undefined) ?? undefined,
            facts: session.facts ?? {},
            clarificationCount:
              typeof session.clarificationCount === "number" ? session.clarificationCount : undefined,
            unresolvedQuestion:
              typeof session.unresolvedQuestion === "string" ? session.unresolvedQuestion : undefined,
          }
        : undefined,
    };
  }
);

export const contractCopilotFeedbackRequestSchema = createSchema<ContractCopilotFeedbackRequest>(
  "contractCopilotFeedbackRequest",
  (value) => {
    const object = expectObject(value, "Contract Copilot feedback request");
    const answer = expectObject(object.answer, "answer");
    const supportCards = Array.isArray(object.supportCards) ? object.supportCards : [];
    const userFeedback = expectString(object.userFeedback, "userFeedback");

    return {
      question: expectString(object.question, "question"),
      answer: answer as unknown as ContractAnswerCard,
      supportCards: supportCards as ContractAnswerCard["references"],
      debugPayload:
        object.debugPayload && typeof object.debugPayload === "object"
          ? (object.debugPayload as Record<string, unknown>)
          : undefined,
      userFeedback:
        userFeedback === "looks_right" ||
        userFeedback === "answer_wrong" ||
        userFeedback === "support_wrong" ||
        userFeedback === "missing_source" ||
        userFeedback === "needs_better_explanation"
          ? userFeedback
          : "needs_better_explanation",
      correctedAnswer: optionalString(object.correctedAnswer),
      expectedSource: optionalString(object.expectedSource),
    };
  }
);
