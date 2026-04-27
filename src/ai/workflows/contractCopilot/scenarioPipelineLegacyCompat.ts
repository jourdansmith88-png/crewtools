import {
  buildSupportCards,
  retrieveContractSupport,
  selectGoverningSections,
  verifyToolAnswer,
} from "../../contractBrain/index.ts";

type LegacyCompatScenarioArgs = {
  parsedRequest: any;
  session: any;
  contractIndex: any;
  intentResolution: any;
  intentDebugBase: Record<string, unknown>;
  laneExecution: any;
  isComplexScenarioQuestion: boolean;
  deps: Record<string, unknown>;
};

type LegacyCompatStageName =
  | "buildScenarioContext"
  | "runScenarioAI"
  | "verifyScenarioOutput"
  | "attachScenarioSupport"
  | "buildScenarioFallback";

type LegacyCompatStageDebug = Partial<
  Record<
    LegacyCompatStageName,
    {
      entered: boolean;
      completed?: boolean;
      details?: Record<string, unknown>;
      error?: string;
    }
  >
>;

function patchStageDebug(
  stageDebug: LegacyCompatStageDebug,
  stage: LegacyCompatStageName,
  patch: Partial<NonNullable<LegacyCompatStageDebug[LegacyCompatStageName]>>,
) {
  stageDebug[stage] = {
    entered: true,
    ...(stageDebug[stage] ?? {}),
    ...patch,
  };
}

function buildScenarioContext<T>(
  stageDebug: LegacyCompatStageDebug,
  details: Record<string, unknown>,
  fn: () => T,
): T {
  patchStageDebug(stageDebug, "buildScenarioContext", { details });
  try {
    const result = fn();
    patchStageDebug(stageDebug, "buildScenarioContext", { completed: true });
    return result;
  } catch (error) {
    patchStageDebug(stageDebug, "buildScenarioContext", {
      error: error instanceof Error ? error.message : "buildScenarioContext_failed",
    });
    throw error;
  }
}

async function runScenarioAI<T>(
  stageDebug: LegacyCompatStageDebug,
  details: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  patchStageDebug(stageDebug, "runScenarioAI", { details });
  try {
    const result = await fn();
    patchStageDebug(stageDebug, "runScenarioAI", { completed: true });
    return result;
  } catch (error) {
    patchStageDebug(stageDebug, "runScenarioAI", {
      error: error instanceof Error ? error.message : "runScenarioAI_failed",
    });
    throw error;
  }
}

function verifyScenarioOutput<T>(
  stageDebug: LegacyCompatStageDebug,
  details: Record<string, unknown>,
  fn: () => T,
): T {
  patchStageDebug(stageDebug, "verifyScenarioOutput", { details });
  try {
    const result = fn();
    patchStageDebug(stageDebug, "verifyScenarioOutput", { completed: true });
    return result;
  } catch (error) {
    patchStageDebug(stageDebug, "verifyScenarioOutput", {
      error: error instanceof Error ? error.message : "verifyScenarioOutput_failed",
    });
    throw error;
  }
}

function attachScenarioSupport<T>(
  stageDebug: LegacyCompatStageDebug,
  details: Record<string, unknown>,
  fn: () => T,
): T {
  patchStageDebug(stageDebug, "attachScenarioSupport", { details });
  try {
    const result = fn();
    patchStageDebug(stageDebug, "attachScenarioSupport", { completed: true });
    return result;
  } catch (error) {
    patchStageDebug(stageDebug, "attachScenarioSupport", {
      error: error instanceof Error ? error.message : "attachScenarioSupport_failed",
    });
    throw error;
  }
}

function buildScenarioFallback<T>(
  stageDebug: LegacyCompatStageDebug,
  details: Record<string, unknown>,
  fn: () => T,
): T {
  patchStageDebug(stageDebug, "buildScenarioFallback", { details });
  try {
    const result = fn();
    patchStageDebug(stageDebug, "buildScenarioFallback", { completed: true });
    return result;
  } catch (error) {
    patchStageDebug(stageDebug, "buildScenarioFallback", {
      error: error instanceof Error ? error.message : "buildScenarioFallback_failed",
    });
    throw error;
  }
}

function questionAllowsGreenSlipSupport(question: string) {
  return /\bgs\b/i.test(question) || /green slip/i.test(question) || /premium pay/i.test(question);
}

function isGreenSlipInferredReference(reference: { label?: string; section?: string; quoteSnippet?: string }) {
  const label = (reference.label ?? "").toLowerCase();
  const combined = `${reference.section ?? ""} ${reference.quoteSnippet ?? ""}`.toLowerCase();
  return label.includes("green slip (inferred)") || (label.includes("green slip") && combined.includes("inferred"));
}

function filterFinalVisibleSupportReferences<T extends { label?: string; section?: string; quoteSnippet?: string }>(
  question: string,
  references: T[],
) {
  if (questionAllowsGreenSlipSupport(question)) {
    return references;
  }
  return references.filter((reference) => !isGreenSlipInferredReference(reference));
}

function hashQuestionText(question: string) {
  let hash = 2166136261;
  for (let index = 0; index < question.length; index += 1) {
    hash ^= question.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `q${(hash >>> 0).toString(16)}`;
}

function normalizeScenarioDetectionText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectAnswerScenarioFamilyFromAnswer(answer: { shortAnswer?: string; plainEnglishExplanation?: string; scenarioBreakdown?: string[] }) {
  const text = normalizeScenarioDetectionText(
    [
      answer.shortAnswer ?? "",
      answer.plainEnglishExplanation ?? "",
      ...(answer.scenarioBreakdown ?? []),
    ].join(" "),
  );
  if (
    /\bshort call\b/.test(text) &&
    /\bnotification\b/.test(text) &&
    (/\bvacation\b/.test(text) ||
      /\bnon-fly day\b/.test(text) ||
      /\bnon fly day\b/.test(text) ||
      /\bmicrew\b/.test(text) ||
      /\backnowledg/.test(text) ||
      /\bcno\b/.test(text))
  ) {
    return "shortCallNotificationScenario";
  }
  if (
    /\bprojected-versus-final credit\b/.test(text) ||
    /\bprojected credit\b/.test(text) ||
    /\bfinal credit\b/.test(text) ||
    /\btimecard recalculation\b/.test(text) ||
    /\bcredit recalculation\b/.test(text) ||
    /\bsick-bank timing\b/.test(text) ||
    /\bbank-deposit\b/.test(text) ||
    /\bsilver slip credit-eligibility\b/.test(text)
  ) {
    return "payCreditConsistencyScenario";
  }
  if (
    (/\bpb\b/.test(text) || /\bpr\b/.test(text) || /\blc\b/.test(text)) &&
    (/\bx-day\b/.test(text) || /\bx day\b/.test(text) || /\binterrupted\b/.test(text) || /\bdart\b/.test(text))
  ) {
    return "pbRerouteXdayScenario";
  }
  if (
    /\b30-hour rest\b/.test(text) ||
    /\b30 hour rest\b/.test(text) ||
    /\bfar legal\b/.test(text) ||
    /\bpwa\b/.test(text) && /\brelease with pay\b/.test(text) ||
    /\bdh-only\b/.test(text) ||
    /\b9:45 rest\b/.test(text) ||
    /\b10 hours\b/.test(text) ||
    /\billegal rotation\b/.test(text)
  ) {
    return "restLegalityScenario";
  }
  if (
    /\bdeadhead deviation\b/.test(text) ||
    /\broute home\b/.test(text) ||
    /\bvicinity of home\b/.test(text) ||
    /\bslv\b/.test(text) ||
    /\bqs delayed overnight\b/.test(text) ||
    /\bduty start\b/.test(text) && /\bpb day\b/.test(text)
  ) {
    return "deadheadRerouteConsequenceScenario";
  }
  return undefined;
}

function detectPayCreditSubScenarioFromQuestion(question: string):
  | "sickBankAfterCalledWell"
  | "bankDepositSilverSlipCredit"
  | "projectedVsFinalCreditCloseout"
  | "rerouteCreditProtection"
  | "timecardCreditDiscrepancy"
  | "unknownPayCredit" {
  const text = normalizeScenarioDetectionText(question);
  if (
    (/\breroute\b/.test(text) || /\brerouted\b/.test(text)) &&
    (
      /\bworth less credit\b/.test(text) ||
      /\bless credit\b/.test(text) ||
      /\boriginal pairing\b/.test(text) ||
      /\bpay protected\b/.test(text) ||
      /\btrip worth less\b/.test(text) ||
      /\bafter report\b/.test(text) ||
      /\brotation guarantee\b/.test(text)
    )
  ) {
    return "rerouteCreditProtection";
  }
  if (
    /\bbank deposit\b/.test(text) ||
    /\bdeposit\b/.test(text) ||
    /\bss credit\b/.test(text) ||
    /\bsilver slip credit\b/.test(text) ||
    /\b2 hours deposit\b/.test(text) ||
    /\bbank eligible\b/.test(text) ||
    /\bbank eligibility\b/.test(text)
  ) {
    return "bankDepositSilverSlipCredit";
  }
  if (
    /\bprojected credit\b/.test(text) ||
    /\bfinal credit\b/.test(text) ||
    /\bcloseout\b/.test(text) ||
    /\bmicrew showed\b/.test(text) ||
    /\bdropped back\b/.test(text) ||
    /\bcredit recalculation\b/.test(text) ||
    /\bdid not deviate deadhead\b/.test(text) ||
    /\breverted to\b/.test(text) ||
    (/\bwent back\b/.test(text) && /\bcredit\b/.test(text))
  ) {
    return "projectedVsFinalCreditCloseout";
  }
  if (/\bsick bank\b/.test(text) || /\bcalled well\b/.test(text) || /\bpicked up flying\b/.test(text)) {
    return "sickBankAfterCalledWell";
  }
  if (/\btimecard\b/.test(text) || /\bcredit discrepancy\b/.test(text) || (/\bcredit\b/.test(text) && /\bpaid differently\b/.test(text))) {
    return "timecardCreditDiscrepancy";
  }
  return "unknownPayCredit";
}

function detectPayCreditSubScenarioFromAnswer(answer: { shortAnswer?: string; plainEnglishExplanation?: string; scenarioBreakdown?: string[] }) {
  const text = normalizeScenarioDetectionText(
    [answer.shortAnswer ?? "", answer.plainEnglishExplanation ?? "", ...(answer.scenarioBreakdown ?? [])].join(" "),
  );
  if (/\bbank-eligibility question\b/.test(text) || /\bsilver slip credit\b/.test(text) || /\bbank-eligible credit\b/.test(text)) {
    return "bankDepositSilverSlipCredit";
  }
  if (/\bsick-bank timing question\b/.test(text) || /\boriginal sick-bank hit\b/.test(text)) {
    return "sickBankAfterCalledWell";
  }
  if (/\breroute credit-protection question\b/.test(text) || /\boriginal pairing\b/.test(text) || /\brerouted or as-flown value\b/.test(text) || /\brotation guarantee\b/.test(text)) {
    return "rerouteCreditProtection";
  }
  if (/\bprojected-versus-final credit\b/.test(text) || /\bprojected credit\b/.test(text) || /\bfinal closeout\b/.test(text) || /\btimecard recalculation\b/.test(text)) {
    return "projectedVsFinalCreditCloseout";
  }
  if (/\btimecard\b/.test(text) && /\bcredit\b/.test(text)) {
    return "timecardCreditDiscrepancy";
  }
  return "unknownPayCredit";
}

function detectPayCreditSubScenarioFromReferences(
  references: Array<{ label?: string; section?: string; quoteSnippet?: string; displaySourceLabel?: string }>,
) {
  const text = normalizeScenarioDetectionText(
    references
      .map((reference) =>
        [reference.displaySourceLabel ?? "", reference.label ?? "", reference.section ?? "", reference.quoteSnippet ?? ""].join(" "),
      )
      .join(" "),
  );
  if (/\bbank eligibility\b/.test(text) || /\bsilver slip\b/.test(text) || /\bss credit\b/.test(text) || /\bbank deposit\b/.test(text)) {
    return "bankDepositSilverSlipCredit";
  }
  if (/\bsick\b/.test(text) && /\bbank\b/.test(text)) {
    return "sickBankAfterCalledWell";
  }
  if (/\breroute pay\b/.test(text) || /\brotation guarantee\b/.test(text) || /\boriginal pairing\b/.test(text)) {
    return "rerouteCreditProtection";
  }
  if (/\bprojected credit\b/.test(text) || /\bfinal credit\b/.test(text) || /\btimecard\b/.test(text) || /\bdeadhead deviation\b/.test(text)) {
    return "projectedVsFinalCreditCloseout";
  }
  return "unknownPayCredit";
}

function detectSupportScenarioFamilyFromReferences(
  references: Array<{ label?: string; section?: string; quoteSnippet?: string; displaySourceLabel?: string }>,
) {
  const text = normalizeScenarioDetectionText(
    references
      .map((reference) =>
        [reference.displaySourceLabel ?? "", reference.label ?? "", reference.section ?? "", reference.quoteSnippet ?? ""].join(" "),
      )
      .join(" "),
  );
  if (
    /\bshort call\b/.test(text) &&
    /\bnotification\b/.test(text) &&
    (/\bvacation\b/.test(text) || /\bnon-fly day\b/.test(text) || /\bcno\b/.test(text) || /\bmicrew\b/.test(text))
  ) {
    return "shortCallNotificationScenario";
  }
  if (/\bprojected credit\b/.test(text) || /\bfinal credit\b/.test(text) || /\btimecard\b/.test(text) || /\bbank\b/.test(text)) {
    return "payCreditConsistencyScenario";
  }
  if ((/\bpb\b/.test(text) || /\bpr\b/.test(text) || /\blc\b/.test(text)) && /\bx-day\b|\bx day\b/.test(text)) {
    return "pbRerouteXdayScenario";
  }
  if (/\b30-hour rest\b/.test(text) || /\bfar\b/.test(text) || /\brelease with pay\b/.test(text) || /\bduty period\b/.test(text)) {
    return "restLegalityScenario";
  }
  if (/\bdeadhead\b/.test(text) || /\bslv\b/.test(text) || /\bdeviation\b/.test(text) || /\bqs\b/.test(text)) {
    return "deadheadRerouteConsequenceScenario";
  }
  return undefined;
}

function supportScenarioFamilyIsCompatible(selectedScenarioFamilyFinal: string | undefined, supportScenarioFamily: string | undefined) {
  if (!selectedScenarioFamilyFinal || !supportScenarioFamily) {
    return true;
  }
  return selectedScenarioFamilyFinal === supportScenarioFamily;
}

function isCoherenceSensitiveScenarioFamily(scenarioFamily: string | undefined) {
  return (
    scenarioFamily === "shortCallNotificationScenario" ||
    scenarioFamily === "payCreditConsistencyScenario"
  );
}

export async function executeScenarioPipelineLegacyCompat(args: LegacyCompatScenarioArgs): Promise<Response> {
  const {
    parsedRequest,
    session,
    contractIndex,
    intentResolution,
    intentDebugBase,
    laneExecution,
    isComplexScenarioQuestion,
  } = args;
  const {
    jsonResponse: baseJsonResponse,
    createOpenAIModelClient,
    consoleAIWorkflowLogger,
    sourceLabelFromReference,
    assembleContractGroundingContext,
    determineSourcePriorityForQuestion,
    getActiveKnownInteractionRules,
    runAIWorkflow,
    contractCopilotAIWorkflow,
    contractCopilotFinalSynthesisWorkflow,
    synthesizeContractCopilotTopAnswer,
    verifyContractScenarioAnswer,
    AIValidationError,
    runLegacyContractCopilot,
    buildRetrievalSourcesUsed,
    buildContractScenarioToolsUsed,
    buildSourceUsageDebug,
    augmentSourceUsageWithReferences,
    buildSafeScenarioFallbackAnswer,
    buildScenarioClarificationResponse,
    applyScenarioAnswerVerifier,
    finalizeScenarioSafetyPipeline,
    retrievedSnippetToAnswerReference,
    toGroundingSnippetFromDeterministic,
    toGroundingSnippetFromSeededRetrieved,
    selectVisibleContractReferences,
    buildFinalVisibleSupportDebug,
    applyComparisonSupportNote,
    rerankSupportReferences,
    buildSupportFocusedCandidates,
    selectDebugRetrievedSnippets,
    mergeAnswerReferencedSupport,
    buildControllingSectionLock,
    applyControllingSectionLock,
    selectPreferredGoverningPacket,
    selectPreferredWorkedExamplePacket,
    resolveScenarioValidation,
    inferPilotStatus,
    detectXDayGroupingScenario,
    detectPbRerouteXdayScenario,
    detectFutureRotationChangeScenario,
    detectPcsSwapScenario,
    detectVacationBankScenario,
    detectShortCallDutyScenario,
    filterClarifyingQuestionsForInference,
    mapScenarioLabelToFamily,
    inferClarifyingQuestion,
    aiResultFromPartial,
    normalizeExtractedFacts,
    isWeakContractCopilotAIResponse,
    buildGroundedReferences,
    tryParsePartialAIOutput,
    trimToTwoSentences,
    selectVisibleSupportLevel,
    buildBestGuessShortAnswer,
    buildRuleLedBottomLine,
    normalizeForComparison,
    bottomLineLooksGeneric,
    bottomLineIsClassificationOnly,
    bottomLineReflectsGoverningRule,
  } = args.deps as Record<string, any>;
  const stageDebug: LegacyCompatStageDebug = {};
  let supportFinalFilterRemoved = 0;
  const supportFinalFilterRemovedReasons: string[] = [];
  const turnId = `copilot-turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const questionHash = hashQuestionText(parsedRequest.question);
  let finalizePayloadForTurn: ((payload: any) => any) | null = null;

  const filterFinalVisibleSupportReferencesForTurn = <
    T extends { label?: string; section?: string; quoteSnippet?: string },
  >(
    question: string,
    references: T[],
  ) => {
    const filtered = filterFinalVisibleSupportReferences(question, references);
    const removed = references.length - filtered.length;
    if (removed > 0) {
      supportFinalFilterRemoved += removed;
      supportFinalFilterRemovedReasons.push("blocked_unrelated_green_slip_inferred_support");
    }
    return filtered;
  };

  const jsonResponse = (status: number, payload: any): Response => {
    if (payload && typeof payload === 'object') {
      const finalizedPayload = finalizePayloadForTurn ? finalizePayloadForTurn(payload) : payload;
      payload = finalizedPayload;
      const debug = payload.debug && typeof payload.debug === 'object' ? payload.debug : {};
      const selectedScenarioFamilyFinal =
        (debug.selectedScenarioFamilyFinal as string | undefined) ??
        (debug.scenarioFamilySelected as string | undefined);
      payload.debug = {
        ...debug,
        orchestratorOwnsScenarioPipeline: true,
        legacyCompatPipelineUsed: true,
        orchestratorStages: stageDebug,
        selectedScenarioFamilyFinal,
        turnId,
        questionHash,
        supportFinalFilterRemoved,
        supportFinalFilterRemovedReasons,
        pipelineLeakDetected: debug.orchestratorOwnsScenarioPipeline === true ? false : undefined,
      };
    }
    return baseJsonResponse(status, payload);
  };

  const scenarioContext = buildScenarioContext(
    stageDebug,
    {
      question: parsedRequest.question,
      selectedLane: intentResolution.selectedLane,
    },
    () => {
      const fallbackResult = runLegacyContractCopilot(parsedRequest.question, session);
      const knownInteractionRules = getActiveKnownInteractionRules({
        question: parsedRequest.question,
        facts: session.facts,
      });
      const matchedInteractionRule = knownInteractionRules[0];
      const contractBrainSupport = retrieveContractSupport({
        question: parsedRequest.question,
        toolType: "contractCopilot",
        contractIndex,
        knownFacts: session.facts,
        deterministicScenario: fallbackResult.answer.scenarioLabel,
        scenarioFamily: fallbackResult.detectedScenario,
        matchedInteractionRules: knownInteractionRules,
        maxMatches: 8,
      });
      const governingSectionSelection = selectGoverningSections({
        question: parsedRequest.question,
        toolType: "contractCopilot",
        scenarioType: fallbackResult.detectedScenario ?? undefined,
        knownFacts: session.facts,
        candidateSupport: contractBrainSupport,
      });
      const searchableChunks = contractBrainSupport.searchableChunks;
      const governingSectionRoute = contractBrainSupport.governingSectionRoute;
      const routedGoverningSections = governingSectionSelection.governingSections;
      const constrainedSearchChunks = contractBrainSupport.constrainedSearchChunks;
      const searchMode = contractBrainSupport.searchMode;
      const routingFallbackOccurred = contractBrainSupport.routingFallbackOccurred;
      const primaryMatches = contractBrainSupport.primaryMatches;
      const expandedMatches = contractBrainSupport.expandedMatches;
      const linkedMatches = contractBrainSupport.linkedMatches;
      const governingSectionCandidates = contractBrainSupport.governingSectionCandidates;
      const sectionPackets = contractBrainSupport.sectionPackets;
      const seededRetrievedSupport = contractBrainSupport.seededRetrievedSupport.map((item) => ({
        sourceLabel:
          item.ruleType === "inference"
            ? "Inference"
            : item.sourceId === "pwa"
              ? "PWA"
              : "Scheduler Manual",
        sourceId: item.sourceId,
        ruleType: item.ruleType,
        ruleId: item.ruleId,
        scenario: item.scenario,
        title: item.title,
        section: item.section,
        quoteSnippet: item.quoteSnippet,
        note: item.note,
        score: item.score,
        matchedTerms: item.matchedTerms,
      }));
      const deterministicGroundingSnippets = fallbackResult.answer.references.map(toGroundingSnippetFromDeterministic);
      const groundingPack = assembleContractGroundingContext({
        question: parsedRequest.question,
        primaryMatches,
        expandedMatches,
        linkedMatches,
        sectionPackets,
        supplementalSnippets: seededRetrievedSupport.map(toGroundingSnippetFromSeededRetrieved),
        deterministicSnippets: deterministicGroundingSnippets,
        policy: contractCopilotAIWorkflow.groundingPolicy,
      });
      const sourceUsageDebug = buildSourceUsageDebug({
        question: parsedRequest.question,
        intent: intentResolution,
        contractIndex,
        groundingPack,
      });
      return {
        fallbackResult,
        searchableChunks,
        knownInteractionRules,
        matchedInteractionRule,
        contractBrainSupport,
        governingSectionSelection,
        governingSectionRoute,
        routedGoverningSections,
        constrainedSearchChunks,
        searchMode,
        routingFallbackOccurred,
        primaryMatches,
        expandedMatches,
        linkedMatches,
        governingSectionCandidates,
        sectionPackets,
        seededRetrievedSupport,
        deterministicGroundingSnippets,
        groundingPack,
        sourceUsageDebug,
      };
    },
  );

  let {
    fallbackResult,
    searchableChunks,
    knownInteractionRules,
    matchedInteractionRule,
    routedGoverningSections,
    searchMode,
    routingFallbackOccurred,
    primaryMatches,
    expandedMatches,
    linkedMatches,
    governingSectionCandidates,
    sectionPackets,
    groundingPack,
    sourceUsageDebug,
    contractBrainSupport,
    governingSectionSelection,
  } = scenarioContext;

  const retrievedSupportBase = [
    ...groundingPack.internal.pwa,
    ...groundingPack.internal.compensationManual,
    ...groundingPack.internal.schedulerManual,
  ]
    .filter((item) => !item.metadata?.packetType)
    .slice(0, 6)
    .map((item) => ({
      sourceLabel: item.sourceLabel,
      sourceId:
        item.tier === "pwa"
          ? ("pwa" as const)
          : item.tier === "compensation_manual"
            ? ("compensation_manual" as const)
            : ("scheduler_manual" as const),
      ruleType:
        item.tier === "pwa"
          ? ("contract" as const)
          : item.tier === "compensation_manual"
            ? ("scheduler_practice" as const)
            : item.tier === "scheduler_manual"
            ? ("scheduler_practice" as const)
            : ("inference" as const),
      ruleId: String(item.metadata?.ruleId ?? item.id),
      scenario: String(item.metadata?.scenario ?? fallbackResult.answer.scenarioLabel),
      title: String(item.metadata?.title ?? item.note ?? item.section),
      section: item.section,
      quoteSnippet: item.snippet,
      note: item.note,
      score: item.relevanceScore,
      matchedTerms: item.matchedTerms ?? [],
    }));
  const supportFocusedCandidates = buildSupportFocusedCandidates({
    question: parsedRequest.question,
    answerText: `${fallbackResult.answer.shortAnswer} ${fallbackResult.answer.plainEnglishExplanation ?? ""}`,
    chunks: searchableChunks,
    scenarioLabel: fallbackResult.answer.scenarioLabel,
  });
  const supportFocusedReferences = supportFocusedCandidates.map(retrievedSnippetToAnswerReference);
  const retrievedSupport = [...retrievedSupportBase, ...supportFocusedCandidates]
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) =>
            candidate.sourceId === item.sourceId &&
            candidate.section === item.section &&
            candidate.quoteSnippet === item.quoteSnippet
        ) === index
    )
    .slice(0, 10);
  const governingSourcePriorityUsed = determineSourcePriorityForQuestion(parsedRequest.question).map(
    (item) => item.sourceLabel
  );
  const governingSectionsSelected = groundingPack.sectionPackets.governingSections.map(
    (item) => `${item.sourceLabel}:${item.section}`
  );
  const inferredPilotStatus = inferPilotStatus(parsedRequest.question);
  const xDayScenario =
    /\bx-days?\b/i.test(parsedRequest.question) ||
    /\bx days?\b/i.test(parsedRequest.question) ||
    /interrupted x-days?/i.test(parsedRequest.question) ||
    /lost x-day/i.test(parsedRequest.question) ||
    /x-day credit/i.test(parsedRequest.question);
  const governingSectionIncludesXDay = governingSectionsSelected.some((item) =>
    /23 l\.9|x-day/i.test(item)
  );
  const xDayGroupingScenario = detectXDayGroupingScenario(parsedRequest.question);
  const pbRerouteXdayScenario = detectPbRerouteXdayScenario(parsedRequest.question);
  const futureRotationChangeScenario = detectFutureRotationChangeScenario(parsedRequest.question);
  const pcsSwapScenario = detectPcsSwapScenario(parsedRequest.question);
  const governingSectionIncludesPcsSwap = governingSectionsSelected.some((item) =>
    /pcs|swap|bid period|reserve coverage|capped reserve|max pickup|carry-out|open time/i.test(item)
  );
  const vacationBankScenario = detectVacationBankScenario(parsedRequest.question);
  const governingSectionIncludesVacationBank = governingSectionsSelected.some((item) =>
    /section 7|vacation|bank|replacement|sup|ivd|vacation year/i.test(item)
  );
  const shortCallDutyScenario = detectShortCallDutyScenario(parsedRequest.question);
  const governingSectionIncludesDutyLegality = governingSectionsSelected.some((item) =>
    /23 s|section 12|short call/i.test(item)
  );
  const governingPacketUsed = selectPreferredGoverningPacket({
    question: parsedRequest.question,
    governingPackets: groundingPack.sectionPackets.governingSections,
  });
  const controllingSectionLock = buildControllingSectionLock({
    question: parsedRequest.question,
    governingPacket: governingPacketUsed,
    chunks: searchableChunks,
  });
  const workedExamplePacketUsed = selectPreferredWorkedExamplePacket({
    question: parsedRequest.question,
    workedExamples: groundingPack.sectionPackets.workedExamples,
  });
  const finalGoverningSectionUsed =
    governingPacketUsed ? `${governingPacketUsed.sourceLabel}:${governingPacketUsed.section}` : governingSectionsSelected[0];
  const contextPacketSummary = {
    governingSections: groundingPack.sectionPackets.governingSections.map(
      (item) => `${item.sourceLabel}:${item.section}`
    ),
    exceptionsNotes: groundingPack.sectionPackets.exceptionsNotes.map(
      (item) => `${item.sourceLabel}:${item.section}`
    ),
    workedExamples: groundingPack.sectionPackets.workedExamples.map(
      (item) => `${item.sourceLabel}:${item.section}`
    ),
    interactionRuleLinkedSections: groundingPack.sectionPackets.interactionLinkedSections.map(
      (item) => `${item.sourceLabel}:${item.section}`
    ),
    compensationSupport: groundingPack.sectionPackets.compensationSupport.map(
      (item) => `${item.sourceLabel}:${item.section}`
    ),
    schedulerSupport: groundingPack.sectionPackets.schedulerSupport.map(
      (item) => `${item.sourceLabel}:${item.section}`
    ),
  };

  console.log("=== RETRIEVED CONTRACT SNIPPETS ===");
  console.dir(
    {
      count: retrievedSupport.length,
      sections: retrievedSupport.map((item) => item.section),
      snippets: retrievedSupport.map((item) => ({
        section: item.section,
        sourceLabel: item.sourceLabel,
        quoteSnippet: item.quoteSnippet,
        score: item.score,
        matchedTerms: item.matchedTerms,
      })),
    },
    { depth: null }
  );
  console.log("=== GROUNDING PACK ===");
  console.dir(
    {
      hasPwaIndex: contractIndex.hasPwaIndex,
      hasCompensationIndex: contractIndex.hasCompensationIndex,
      hasSchedulerIndex: contractIndex.hasSchedulerIndex,
      compensationIndexPath: contractIndex.compensationIndexPath,
      schedulerIndexPath: contractIndex.schedulerIndexPath,
      pwaIndexPath: contractIndex.pwaIndexPath,
      retrievalPassCounts: {
        primary: primaryMatches.length,
        expanded: expandedMatches.length,
        linked: linkedMatches.length,
      },
      governingSectionCandidates: governingSectionCandidates.map((item) => ({
        source: item.source,
        section: item.section,
        reason: item.reason,
        priority: item.priority,
      })),
      sectionPackets: sectionPackets.map((item) => ({
        sourceLabel: item.sourceLabel,
        section: item.section,
        packetType: item.packetType,
        pages: item.pages,
        usedSectionExpansion: item.usedSectionExpansion,
        crossRefsFollowed: item.crossRefsFollowed,
      })),
      internalCounts: {
        pwa: groundingPack.internal.pwa.length,
        compensationManual: groundingPack.internal.compensationManual.length,
        schedulerManual: groundingPack.internal.schedulerManual.length,
        crewtoolsLogic: groundingPack.internal.crewtoolsLogic.length,
      },
      externalCounts: {
        webDiscussion: groundingPack.external.webDiscussion.length,
        forumUnofficial: groundingPack.external.forumUnofficial.length,
      },
      retrievalMeta: groundingPack.retrievalMeta,
    },
    { depth: null }
  );
  console.log("=== KNOWN INTERACTION RULES ===");
  console.dir(knownInteractionRules, { depth: null });

  const apiKey = process.env.OPENAI_API_KEY;
  let modelClientCalled = false;
  let modelClientSucceeded = false;
  let modelClientError: string | undefined;
  let aiSynthesisAttempted = false;
  let aiSynthesisUsedDebug = false;
  let aiSynthesisRejected = false;
  let aiRejectionReason: string | undefined;
  const documentShortcutUsed = intentResolution.selectedLane === "document_section_explanation";
  const clarificationReason =
    intentResolution.selectedLane === "clarification_needed"
      ? intentResolution.missingFields.join(", ")
      : undefined;
  const preAiScenarioValidation = resolveScenarioValidation({
    question: parsedRequest.question,
    facts: {
      ...fallbackResult.nextSession.facts,
      ...session.facts,
      ...(inferredPilotStatus && !session.facts.status ? { status: inferredPilotStatus } : {}),
    },
    governingPacket: governingPacketUsed,
    matchedInteractionRule,
  });
  const noEvidenceFactsAttached = Object.keys(session.facts ?? {}).length === 0;
  const scenarioGroundingThin =
    !governingPacketUsed ||
    retrievedSupport.length === 0 ||
    (sourceUsageDebug.sourcesUsed?.length ?? 0) === 0;
  const concreteScenarioFamilySelected = preAiScenarioValidation.scenarioFamilySelected !== "genericScenario";
  const trueAmbiguityDetected =
    !concreteScenarioFamilySelected &&
    Boolean(preAiScenarioValidation.gatingQuestion) &&
    preAiScenarioValidation.missingGatingFacts.length > 0 &&
    noEvidenceFactsAttached &&
    scenarioGroundingThin;

  finalizePayloadForTurn = (payload: any) => {
    if (!payload || typeof payload !== "object" || !payload.answer || typeof payload.answer !== "object") {
      return payload;
    }

    const incomingDebug =
      payload.debug && typeof payload.debug === "object" ? { ...payload.debug } : {};
    const selectedScenarioFamilyFinal =
      (incomingDebug.selectedScenarioFamilyFinal as string | undefined) ??
      (incomingDebug.scenarioFamilySelected as string | undefined);
    const selectedSubScenario =
      selectedScenarioFamilyFinal === "payCreditConsistencyScenario"
        ? detectPayCreditSubScenarioFromQuestion(parsedRequest.question)
        : undefined;
    const answerScenarioFamily =
      detectAnswerScenarioFamilyFromAnswer(payload.answer) ?? selectedScenarioFamilyFinal;
    const supportScenarioFamily = detectSupportScenarioFamilyFromReferences(payload.answer.references ?? []);
    const debugScenarioFamily = selectedScenarioFamilyFinal;
    const answerSubScenario =
      answerScenarioFamily === "payCreditConsistencyScenario"
        ? detectPayCreditSubScenarioFromAnswer(payload.answer)
        : undefined;
    const supportSubScenario =
      selectedScenarioFamilyFinal === "payCreditConsistencyScenario" || answerScenarioFamily === "payCreditConsistencyScenario"
        ? detectPayCreditSubScenarioFromReferences(payload.answer.references ?? [])
        : undefined;
    const debugSubScenario = selectedSubScenario;
    const mismatchReasons: string[] = [];
    const coherenceSensitive =
      isCoherenceSensitiveScenarioFamily(selectedScenarioFamilyFinal) ||
      isCoherenceSensitiveScenarioFamily(answerScenarioFamily);

    if (
      coherenceSensitive &&
      selectedScenarioFamilyFinal &&
      answerScenarioFamily &&
      answerScenarioFamily !== selectedScenarioFamilyFinal
    ) {
      mismatchReasons.push(`answer_family:${answerScenarioFamily}`);
    }
    if (coherenceSensitive && !supportScenarioFamilyIsCompatible(selectedScenarioFamilyFinal, supportScenarioFamily)) {
      mismatchReasons.push(`support_family:${supportScenarioFamily}`);
    }
    if (coherenceSensitive && debugScenarioFamily && selectedScenarioFamilyFinal && debugScenarioFamily !== selectedScenarioFamilyFinal) {
      mismatchReasons.push(`debug_family:${debugScenarioFamily}`);
    }
    if (selectedSubScenario && answerSubScenario && answerSubScenario !== selectedSubScenario) {
      mismatchReasons.push(`answer_subscenario:${answerSubScenario}`);
    }
    if (
      selectedSubScenario &&
      supportSubScenario &&
      supportSubScenario !== "unknownPayCredit" &&
      supportSubScenario !== selectedSubScenario
    ) {
      mismatchReasons.push(`support_subscenario:${supportSubScenario}`);
    }

    let nextAnswer = payload.answer;
    if (mismatchReasons.length > 0) {
      const cautiousMismatchAnswer = buildSafeScenarioFallbackAnswer({
        question: parsedRequest.question,
        answer: scenarioContext.fallbackResult.answer,
        retrievedSupport,
        sourceUsageDebug,
        missingGatingFacts: preAiScenarioValidation.missingGatingFacts,
      });
      nextAnswer = {
        ...payload.answer,
        shortAnswer: cautiousMismatchAnswer.shortAnswer,
        plainEnglishExplanation: cautiousMismatchAnswer.plainEnglishExplanation,
        scenarioBreakdown: cautiousMismatchAnswer.scenarioBreakdown,
        whatCouldChangeThisAnswer: cautiousMismatchAnswer.whatCouldChangeThisAnswer,
        caveats: Array.from(
          new Set([
            ...(payload.answer.caveats ?? []),
            ...(cautiousMismatchAnswer.caveats ?? []),
            "Answer was rebuilt from the selected scenario family before rendering.",
          ]),
        ),
        references: filterFinalVisibleSupportReferencesForTurn(
          parsedRequest.question,
          (payload.answer.references?.length ? payload.answer.references : cautiousMismatchAnswer.references) ?? [],
        ),
        supportLevel: cautiousMismatchAnswer.supportLevel,
        confidence: "low",
        status: "insufficient_support",
        answerCompleteness: "provisional",
      };
    }

    return {
      ...payload,
      answer: nextAnswer,
      debug: {
        ...incomingDebug,
        selectedScenarioFamilyFinal,
        payCreditSubScenario: selectedSubScenario,
        answerScenarioFamily:
          mismatchReasons.length > 0 ? selectedScenarioFamilyFinal : answerScenarioFamily,
        supportScenarioFamily:
          mismatchReasons.length > 0
            ? detectSupportScenarioFamilyFromReferences(nextAnswer.references ?? []) ?? selectedScenarioFamilyFinal
            : supportScenarioFamily,
        debugScenarioFamily,
        answerSubScenario:
          mismatchReasons.length > 0 && selectedSubScenario ? selectedSubScenario : answerSubScenario,
        supportSubScenario:
          mismatchReasons.length > 0 && selectedSubScenario
            ? detectPayCreditSubScenarioFromReferences(nextAnswer.references ?? [])
            : supportSubScenario,
        debugSubScenario,
        finalResponseCoherenceFailed: mismatchReasons.length > 0,
        finalResponseMismatchReason: mismatchReasons.length > 0 ? mismatchReasons.join(", ") : undefined,
      },
    };
  };

  if (trueAmbiguityDetected && session.clarificationCount < 2) {
    return buildScenarioClarificationResponse({
      question: parsedRequest.question,
      session,
      fallbackResult,
      scenarioValidation: preAiScenarioValidation,
      contractIndex,
      intentResolution,
      intentDebugBase,
    });
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  let lastAIOutput: ContractCopilotAIOutput | null = null;
  let weakResponseGateFired = false;

  try {
    aiSynthesisAttempted = true;
    modelClientCalled = true;
    if (!apiKey) {
      throw new Error("missing_api_key");
    }
    const modelClient = createOpenAIModelClient({
      apiKey,
      model,
      baseUrl: process.env.OPENAI_BASE_URL,
    });

    const aiResult = await runScenarioAI(
      stageDebug,
      { model, question: parsedRequest.question },
      async () =>
        await runAIWorkflow(
          contractCopilotAIWorkflow,
          {
            question: parsedRequest.question,
            rememberedFacts: session.facts,
            deterministicScenario: fallbackResult.answer.scenarioLabel,
            deterministicShortAnswer: fallbackResult.answer.shortAnswer,
            deterministicSupport: fallbackResult.answer.references.map((reference) => ({
              sourceLabel: sourceLabelFromReference(reference),
              section: reference.section,
              quoteSnippet: reference.quoteSnippet,
              note: reference.label,
            })),
            retrievedSupport,
            groundingPack,
            knownInteractionRules,
          },
          {
            modelClient,
            logger: consoleAIWorkflowLogger,
          }
        ),
    );

    console.log("=== AI OUTPUT AFTER WORKFLOW ===");
    console.dir(aiResult.output, { depth: null });
    modelClientSucceeded = true;
    lastAIOutput = aiResult.output;

    if (isWeakContractCopilotAIResponse(aiResult.output)) {
      weakResponseGateFired = true;
      console.log("=== WEAK RESPONSE GATE FAILED ===");
      console.dir(
        {
          shortAnswer: aiResult.output.shortAnswer,
          needsClarification: aiResult.output.needsClarification,
          clarifyingQuestion: aiResult.output.clarifyingQuestion,
        },
        { depth: null }
      );
      throw new Error("weak_ai_response");
    }

    const aiDetectedScenario = mapScenarioLabelToFamily(aiResult.output.detectedScenario);
    const aiFacts = normalizeExtractedFacts(aiResult.output.extractedFacts);
    const mergedFactsForValidation = {
      ...fallbackResult.nextSession.facts,
      ...session.facts,
      ...(inferredPilotStatus && !session.facts.status ? { status: inferredPilotStatus } : {}),
      ...aiFacts,
    };
    const scenarioValidation = resolveScenarioValidation({
      question: parsedRequest.question,
      facts: mergedFactsForValidation,
      governingPacket: governingPacketUsed,
      matchedInteractionRule,
    });
    const inferredClarifyingQuestions = inferClarifyingQuestion(
      aiResult.output,
      fallbackResult.answer.clarifyingQuestions,
      parsedRequest.question,
      session.clarificationCount
    );
    const scenarioValidationCanGateClarification =
      scenarioValidation.scenarioFamilySelected === "genericScenario" &&
      Boolean(scenarioValidation.gatingQuestion) &&
      session.clarificationCount < 2;
    const clarifyingQuestions = filterClarifyingQuestionsForInference(
      parsedRequest.question,
      aiResult.output.needsClarification
        ? inferredClarifyingQuestions
        : scenarioValidationCanGateClarification
          ? [scenarioValidation.gatingQuestion!]
          : inferredClarifyingQuestions
    );
    const shouldAskFollowUp =
      Boolean(clarifyingQuestions?.length) &&
      (aiResult.output.needsClarification || scenarioValidationCanGateClarification) &&
      session.clarificationCount < 2;

    const nextSession: ContractCopilotSession = {
      ...fallbackResult.nextSession,
      currentScenario: aiDetectedScenario ?? fallbackResult.nextSession.currentScenario,
      facts: {
        ...fallbackResult.nextSession.facts,
        ...(inferredPilotStatus && !fallbackResult.nextSession.facts.status ? { status: inferredPilotStatus } : {}),
        ...aiFacts,
      },
      clarificationCount:
        shouldAskFollowUp
          ? session.clarificationCount + 1
          : 0,
      unresolvedQuestion:
        shouldAskFollowUp
          ? (session.unresolvedQuestion ?? parsedRequest.question)
          : undefined,
      lastAskedClarifyingField: clarifyingQuestions?.[0]?.factField,
      lastClarifyingQuestionId: clarifyingQuestions?.[0]?.id,
      status:
        shouldAskFollowUp
          ? "awaiting_reply"
          : "answered",
    };

    const canAskFollowUp = shouldAskFollowUp;
    const nextAnswerStatus = canAskFollowUp
      ? "needs_clarification"
      : fallbackResult.answer.status;
    const preferredShortAnswer = buildBestGuessShortAnswer({
      aiShortAnswer: aiResult.output.shortAnswer,
      deterministicShortAnswer: fallbackResult.answer.shortAnswer,
      whatCouldChange: aiResult.output.whatCouldChange,
      needsClarification: aiResult.output.needsClarification,
    });
    const synthesizedTopAnswer = synthesizeContractCopilotTopAnswer({
      groundedShortAnswer: preferredShortAnswer,
      deterministicShortAnswer: fallbackResult.answer.shortAnswer,
      scenarioBreakdown: aiResult.output.scenarioBreakdown,
      payBreakdown: aiResult.output.payBreakdown,
      whatCouldChange: aiResult.output.whatCouldChange,
      whyItApplies: aiResult.output.whyItApplies,
      needsClarification: aiResult.output.needsClarification,
    });
    const strongerRuleBasedBottomLine = buildRuleLedBottomLine({
      question: parsedRequest.question,
      facts: mergedFactsForValidation,
      governingPacket: governingPacketUsed,
      workedExamplePacket: workedExamplePacketUsed,
      preferredShortAnswer: synthesizedTopAnswer,
      deterministicShortAnswer: fallbackResult.answer.shortAnswer,
      scenarioBreakdown: aiResult.output.scenarioBreakdown,
      payBreakdown: aiResult.output.payBreakdown,
      whyItApplies: aiResult.output.whyItApplies,
    });
    let finalSynthesis = {
      bottomLine: strongerRuleBasedBottomLine,
      scenarioBreakdown:
        aiResult.output.scenarioBreakdown && aiResult.output.scenarioBreakdown.length > 0
          ? aiResult.output.scenarioBreakdown
          : fallbackResult.answer.scenarioBreakdown ?? [],
      payBreakdown:
        aiResult.output.payBreakdown && aiResult.output.payBreakdown.length > 0
          ? aiResult.output.payBreakdown
          : fallbackResult.answer.payBreakdown ?? [],
      whatCouldChange:
        aiResult.output.whatCouldChange && aiResult.output.whatCouldChange.length > 0
          ? aiResult.output.whatCouldChange
          : fallbackResult.answer.whatCouldChangeThisAnswer ?? [],
      why:
        aiResult.output.whyItApplies && aiResult.output.whyItApplies.length > 0
          ? aiResult.output.whyItApplies
          : fallbackResult.answer.plainEnglishExplanation,
      contractSupport: aiResult.output.contractSupport,
      practicalBreakdown:
        aiResult.output.practicalBreakdown && aiResult.output.practicalBreakdown.length > 0
          ? aiResult.output.practicalBreakdown
          : fallbackResult.answer.breakItDown ?? [],
      followUpSuggestion:
        aiResult.output.followUpSuggestion && aiResult.output.followUpSuggestion.length > 0
          ? aiResult.output.followUpSuggestion
          : fallbackResult.answer.followUpSuggestion ?? "",
    };

    try {
      const synthesisResult = await runAIWorkflow(
        contractCopilotFinalSynthesisWorkflow,
      {
        question: parsedRequest.question,
        groundedReasoning: aiResult.output,
        governingSectionUsed: governingPacketUsed
            ? {
                sourceLabel: governingPacketUsed.sourceLabel,
                section: governingPacketUsed.section,
                title: governingPacketUsed.title,
              content: governingPacketUsed.content,
            }
          : undefined,
        scenarioValidation: {
          missingGatingFacts: scenarioValidation.missingGatingFacts,
          answerIsConditional: scenarioValidation.answerIsConditional,
          turningCondition: scenarioValidation.turningCondition,
          conditionalBottomLine: scenarioValidation.conditionalBottomLine,
          conditionalWhy: scenarioValidation.conditionalWhy,
          gatingQuestion: scenarioValidation.gatingQuestion?.prompt,
        },
      },
      {
        modelClient,
          logger: consoleAIWorkflowLogger,
        }
      );
      finalSynthesis = synthesisResult.output;
      aiSynthesisUsedDebug = true;
    } catch (synthesisError) {
      aiSynthesisRejected = true;
      aiRejectionReason = synthesisError instanceof Error ? synthesisError.message : "unknown_synthesis_error";
      console.log("=== FINAL SYNTHESIS FAILED ===");
      console.dir(
        {
          reason: synthesisError instanceof Error ? synthesisError.message : "unknown_error",
        },
        { depth: null }
      );
    }

    const strongerRuleBasedAnswerAvailableButNotUsed =
      Boolean(governingPacketUsed) &&
      normalizeForComparison(strongerRuleBasedBottomLine) !== normalizeForComparison(finalSynthesis.bottomLine) &&
      bottomLineLooksGeneric(finalSynthesis.bottomLine);
    const concreteRuleBasedAnswerAvailable =
      Boolean(governingPacketUsed) && !bottomLineIsClassificationOnly(strongerRuleBasedBottomLine);
    if (strongerRuleBasedAnswerAvailableButNotUsed) {
      finalSynthesis.bottomLine = strongerRuleBasedBottomLine;
    }
    if (!isComplexScenarioQuestion && scenarioValidation.answerIsConditional && scenarioValidation.conditionalBottomLine) {
      finalSynthesis.bottomLine = scenarioValidation.conditionalBottomLine;
    }
    if (!isComplexScenarioQuestion && scenarioValidation.answerIsConditional && scenarioValidation.conditionalWhy) {
      finalSynthesis.why = scenarioValidation.conditionalWhy;
    }
    const finalBottomLineMode =
      governingPacketUsed && !bottomLineLooksGeneric(finalSynthesis.bottomLine) ? "section_led" : "generic";
    const finalBottomLineReflectsGoverningRule = bottomLineReflectsGoverningRule({
      bottomLine: finalSynthesis.bottomLine,
      governingPacket: governingPacketUsed,
    });
    const classificationLevelOnly = bottomLineIsClassificationOnly(finalSynthesis.bottomLine);
    const finalAnswerUsedConcreteRule = concreteRuleBasedAnswerAvailable && !classificationLevelOnly;
    const concreteInteractionRuleAvailable =
      Boolean(matchedInteractionRule) && !bottomLineIsClassificationOnly(strongerRuleBasedBottomLine);
    const finalAnswerUsedConcreteInteractionRule =
      concreteInteractionRuleAvailable && !bottomLineLooksGeneric(finalSynthesis.bottomLine);
    const answerStillGenericDespiteInteractionRule =
      Boolean(matchedInteractionRule) && bottomLineLooksGeneric(finalSynthesis.bottomLine);

    const groundedSupport = buildGroundedReferences({
      aiSupportItems: finalSynthesis.contractSupport,
      retrievedSupport,
      fallbackReferences: fallbackResult.answer.references,
      preferredSection: workedExamplePacketUsed?.section ?? governingPacketUsed?.section,
      preferredPacket: workedExamplePacketUsed ?? governingPacketUsed,
    });
    const aiAnswerSupport = mergeAnswerReferencedSupport({
      answerText: `${finalSynthesis.bottomLine} ${finalSynthesis.why ?? ""}`,
      references: groundedSupport.references,
      chunks: searchableChunks,
    });
    const rerankedGroundedSupport = rerankSupportReferences({
      question: parsedRequest.question,
      answerText: `${finalSynthesis.bottomLine} ${finalSynthesis.why ?? ""}`,
      references: [
        ...aiAnswerSupport.references,
        ...(controllingSectionLock?.reference ? [controllingSectionLock.reference] : []),
        ...supportFocusedReferences,
      ],
      selectedLane: intentResolution.selectedLane,
    });
    const visibleGroundedReferences = filterFinalVisibleSupportReferencesForTurn(
      parsedRequest.question,
      selectVisibleContractReferences(rerankedGroundedSupport.references),
    );
    const groundedFinalVisibleSupportDebug = buildFinalVisibleSupportDebug(
      visibleGroundedReferences,
      rerankedGroundedSupport.debug as Record<string, unknown>
    );

    console.log("=== ACCEPTED AI ANSWER ===");
    console.dir(
      {
        detectedScenario: aiDetectedScenario,
        aiFacts,
        parsedKeys: Object.keys(aiResult.output),
      },
      { depth: null }
    );

    const aiAnswer: ContractAnswerCard = {
      ...fallbackResult.answer,
      status: nextAnswerStatus,
      answerCompleteness:
        aiResult.output.answerCompleteness === "resolved" || !canAskFollowUp ? "resolved" : "provisional",
      scenarioLabel: aiResult.output.detectedScenario || fallbackResult.answer.scenarioLabel,
      shortAnswer: finalSynthesis.bottomLine,
      plainEnglishExplanation:
        trimToTwoSentences(
          finalSynthesis.why && finalSynthesis.why.length > 0
            ? finalSynthesis.why
            : fallbackResult.answer.plainEnglishExplanation
        ),
      confidence: aiResult.output.confidence,
      supportLevel: selectVisibleSupportLevel(groundedSupport.references),
      references: visibleGroundedReferences,
      assumptions: Array.from(
        new Set([...(fallbackResult.answer.assumptions ?? []), ...(aiResult.output.assumptions ?? [])])
      ),
      scenarioBreakdown:
        finalSynthesis.scenarioBreakdown && finalSynthesis.scenarioBreakdown.length > 0
          ? finalSynthesis.scenarioBreakdown
          : fallbackResult.answer.scenarioBreakdown,
      payBreakdown:
        finalSynthesis.payBreakdown && finalSynthesis.payBreakdown.length > 0
          ? finalSynthesis.payBreakdown
          : fallbackResult.answer.payBreakdown,
      clarifyingQuestions,
      whatCouldChangeThisAnswer:
        finalSynthesis.whatCouldChange && finalSynthesis.whatCouldChange.length > 0
          ? finalSynthesis.whatCouldChange
          : fallbackResult.answer.whatCouldChangeThisAnswer,
      breakItDown: [],
      followUpSuggestion: undefined,
    };
    const verifiedAIAnswer = verifyScenarioOutput(
      stageDebug,
      { mode: "ai" },
      () =>
        applyScenarioAnswerVerifier({
          question: parsedRequest.question,
          selectedLane: intentResolution.selectedLane,
          answer: aiAnswer,
          contractIndex,
          sourceUsageDebug,
        }),
    );
    const finalizedAISupport = attachScenarioSupport(stageDebug, { mode: "ai" }, () => {
      const aiAnswerWithComparisonNote = applyComparisonSupportNote({
        question: parsedRequest.question,
        answer: verifiedAIAnswer.answer,
        references: verifiedAIAnswer.answer.references,
      });
      const aiAnswerWithControllingSection = applyControllingSectionLock({
        answer: aiAnswerWithComparisonNote,
        controllingSectionLock,
      });
      const finalizedAIScenarioAnswer = finalizeScenarioSafetyPipeline({
        question: parsedRequest.question,
        answer: aiAnswerWithControllingSection,
        verified: verifiedAIAnswer,
        supportDebug: {
          ...rerankedGroundedSupport.debug,
          ...groundedFinalVisibleSupportDebug,
          answerReferencedSections: aiAnswerSupport.answerReferencedSections,
          supportInjectedFromAnswer: aiAnswerSupport.supportInjectedFromAnswer,
          supportMissingForReferencedSection: aiAnswerSupport.missingSections.length > 0,
          controllingSectionLocked: Boolean(controllingSectionLock),
          controllingSectionDisplay: controllingSectionLock?.displaySection,
          controllingSectionQuoteAttached: Boolean(controllingSectionLock?.quoteSnippet),
          controllingSectionQuote: controllingSectionLock?.quoteSnippet,
          controllingSectionMissingExactText: controllingSectionLock?.exactAttached === false,
        },
      });
      return finalizedAIScenarioAnswer;
    });
    const finalizedAIScenarioAnswer = finalizedAISupport;
    const contractBrainSupportCards = buildSupportCards({
      governingSections: governingSectionSelection.governingSections,
      candidateSupport: contractBrainSupport.candidateSupport,
      answerText: finalizedAIScenarioAnswer.answer.shortAnswer,
    });
    const contractBrainAnswerVerification = verifyToolAnswer({
      toolType: "contractCopilot",
      question: parsedRequest.question,
      proposedAnswer: finalizedAIScenarioAnswer.answer,
      supportCards: contractBrainSupportCards.visibleSupportCards,
      knownFacts: session.facts,
    });

    return jsonResponse(200, {
      ok: true,
      mode: "ai",
      answer: finalizedAIScenarioAnswer.answer,
      detectedScenario: aiDetectedScenario ?? fallbackResult.detectedScenario,
      nextSession,
      meta: {
        modelUsed: model,
      },
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              mode: "ai",
              parsedKeys: Object.keys(aiResult.output),
              missingRequiredFields: [],
              weakResponseGateFired,
              retrievedSnippetCount: retrievedSupport.length,
              retrievedSections: retrievedSupport.map((item) => item.section),
              knownInteractionRuleIds: knownInteractionRules.map((item) => item.id),
              matchedInteractionRuleId: matchedInteractionRule?.id,
              matchedInteractionRuleTitle: matchedInteractionRule?.title,
              matchedInteractionRuleGoverningSources: matchedInteractionRule?.governingSources.map(
                (source) => `${source.source}:${source.section}`
              ),
              matchedInteractionRuleReasoningSteps: matchedInteractionRule?.reasoningSteps,
              routedGoverningSections,
              searchMode,
              routingFallbackOccurred,
              governingSectionsSelected,
              governingSectionUsed:
                visibleGroundedReferences[0]
                  ? `${visibleGroundedReferences[0].sourceId}:${visibleGroundedReferences[0].section}`
                  : finalGoverningSectionUsed,
              bottomLineMode: finalBottomLineMode,
              bottomLineReflectsGoverningRule: finalBottomLineReflectsGoverningRule,
              strongerRuleBasedAnswerAvailableButNotUsed,
              classificationLevelOnly,
              concreteRuleBasedAnswerAvailable,
              finalAnswerUsedConcreteRule,
              concreteInteractionRuleAvailable,
              finalAnswerUsedConcreteInteractionRule,
              answerStillGenericDespiteInteractionRule,
              scenarioFamilySelected: scenarioValidation.scenarioFamilySelected,
              aiPathUsed: true,
              fallbackUsed: false,
              reasonForFallback: undefined,
              missingGatingFacts: scenarioValidation.missingGatingFacts,
              missingRequiredFacts: scenarioValidation.missingGatingFacts,
              clarificationInsteadOfFallback: false,
              fallbackEntryReason: undefined,
              aiPathSkippedReason: undefined,
              modelValidationFailureReason: undefined,
              answerIsConditional: scenarioValidation.answerIsConditional,
              gatingQuestionUsed: clarifyingQuestions?.[0]?.prompt,
              sectionExpansionUsed: groundingPack.retrievalMeta.sectionExpansionUsed,
              crossReferencesFollowed: groundingPack.retrievalMeta.crossReferencesFollowed,
              contextPacketSummary,
              governingSourcePriorityUsed,
              reasoningMode: matchedInteractionRule ? "interaction_led" : "generic_retrieval_led",
              answerMode: finalBottomLineMode,
              retrievedSnippets: selectDebugRetrievedSnippets({
                question: parsedRequest.question,
                retrievedSupport,
                visibleReferences: finalizedAIScenarioAnswer.references,
              }),
              groundingSource: groundedSupport.usedRetrievedSupport
                ? "retrieved_contract_snippets"
                : "deterministic_support",
              usedRetrievedSupport: groundedSupport.usedRetrievedSupport,
              externalAllowed: groundingPack.retrievalMeta.externalAllowed,
              externalUsed: groundingPack.retrievalMeta.externalUsed,
              externalReason: groundingPack.retrievalMeta.externalReason,
              externalSnippetCount:
                groundingPack.external.webDiscussion.length + groundingPack.external.forumUnofficial.length,
              externalLabels: [
                ...groundingPack.external.webDiscussion.map((item) => item.section),
                ...groundingPack.external.forumUnofficial.map((item) => item.section),
              ],
              hasPwaIndex: contractIndex.hasPwaIndex,
              hasCompensationIndex: contractIndex.hasCompensationIndex,
              hasSchedulerIndex: contractIndex.hasSchedulerIndex,
              retrievalSourcesUsed: buildRetrievalSourcesUsed({
                groundingPack,
                usedRetrievedSupport: groundedSupport.usedRetrievedSupport,
              }),
              ...augmentSourceUsageWithReferences(sourceUsageDebug, finalizedAIScenarioAnswer.answer.references),
              structuredRowsUsed: sourceUsageDebug.structuredRowsUsed,
              aiSynthesisUsed: true,
              OPENAI_API_KEYPresent: Boolean(apiKey),
              modelClientCalled,
              modelClientSucceeded,
              modelClientError,
              aiSynthesisAttempted,
              aiSynthesisRejected,
              aiRejectionReason,
              laneEnforced: laneExecution.laneDebug.laneEnforced,
              expectedTool: laneExecution.laneDebug.expectedTool,
              retrievalAttempted: laneExecution.laneDebug.retrievalAttempted,
              laneExecutionResult: laneExecution.laneDebug.laneExecutionResult,
              documentShortcutUsed,
              clarificationReason,
              fallbackUsed: laneExecution.laneDebug.fallbackUsed,
              fallthroughPrevented: laneExecution.laneDebug.fallthroughPrevented,
              retryAttempts: laneExecution.laneDebug.retryAttempts,
              sourceAvailability: laneExecution.laneDebug.sourceAvailability,
              verifierRan: verifiedAIAnswer.verifierRan,
              verifierPassed: verifiedAIAnswer.verifierPassed,
              verifierWarnings: verifiedAIAnswer.verifierWarnings,
              verifierFailureReasons: verifiedAIAnswer.verifierFailureReasons,
              verifierAdjustedAnswer: verifiedAIAnswer.verifierAdjustedAnswer,
              finalSafetyPipelineRan: finalizedAIScenarioAnswer.debug.finalSafetyPipelineRan,
              truthGuardRan: verifiedAIAnswer.truthGuardRan,
              definitionApplicationGuardRan: finalizedAIScenarioAnswer.debug.definitionApplicationGuardRan,
              strongClaimsDetected: verifiedAIAnswer.strongClaimsDetected,
              strongClaimsSupported: verifiedAIAnswer.strongClaimsSupported,
              strongClaimsDowngraded: verifiedAIAnswer.strongClaimsDowngraded,
              definitionSectionUsed: verifiedAIAnswer.definitionSectionUsed,
              operationalSectionUsed: verifiedAIAnswer.operationalSectionUsed,
              definitionOverrodeOperation: verifiedAIAnswer.definitionOverrodeOperation,
              definitionBasedAnswer: verifiedAIAnswer.definitionBasedAnswer,
              applicationClaimDetected: verifiedAIAnswer.applicationClaimDetected,
              applicationClaimSupported: verifiedAIAnswer.applicationClaimSupported,
                  applicationClaimDowngraded: verifiedAIAnswer.applicationClaimDowngraded,
                  contractBrainWhatControls: contractBrainSupportCards.whatControls,
                  contractBrainVisibleSupportSections: contractBrainSupportCards.visibleSupportCards.map(
                    (card) => `${card.sourceName}:${card.section}`
                  ),
                  contractBrainSourceLimitationNotes: contractBrainSupportCards.sourceLimitationNotes,
                  contractBrainTrustLevel: contractBrainAnswerVerification.trustLevel,
                  contractBrainUnsupportedClaims: contractBrainAnswerVerification.unsupportedClaims,
                  answerDowngradedToCaution: finalizedAIScenarioAnswer.debug.answerDowngradedToCaution,
                  downgradeReasons: finalizedAIScenarioAnswer.debug.downgradeReasons,
                  answerReferencedSections: finalizedAIScenarioAnswer.debug.answerReferencedSections,
                  supportInjectedFromAnswer: finalizedAIScenarioAnswer.debug.supportInjectedFromAnswer,
                  supportMissingForReferencedSection:
                    finalizedAIScenarioAnswer.debug.supportMissingForReferencedSection,
                  controllingSectionLocked: finalizedAIScenarioAnswer.debug.controllingSectionLocked,
                  controllingSectionDisplay: finalizedAIScenarioAnswer.debug.controllingSectionDisplay,
                  controllingSectionQuoteAttached:
                    finalizedAIScenarioAnswer.debug.controllingSectionQuoteAttached,
                  controllingSectionQuote: finalizedAIScenarioAnswer.debug.controllingSectionQuote,
                  controllingSectionMissingExactText:
                    finalizedAIScenarioAnswer.debug.controllingSectionMissingExactText,
                  xDayScenario,
                  xDayAnchorFound: finalizedAIScenarioAnswer.debug.xDayAnchorFound,
                  xDayGroupingScenario,
                  xDayGroupingAnchorFound: finalizedAIScenarioAnswer.debug.xDayGroupingAnchorFound,
                  xDayGroupingMissingSupportReason:
                    finalizedAIScenarioAnswer.debug.xDayGroupingMissingSupportReason,
                  pbRerouteXdayScenario,
                  pbAnchorFound: finalizedAIScenarioAnswer.debug.pbAnchorFound,
                  pbProcessingAnchorFound: finalizedAIScenarioAnswer.debug.pbProcessingAnchorFound,
                  notificationAnchorFound: finalizedAIScenarioAnswer.debug.notificationAnchorFound,
                  pbScenarioMissingSupportReason:
                    finalizedAIScenarioAnswer.debug.pbScenarioMissingSupportReason,
                  futureRotationChangeScenario,
                  futureRotationChangeAnchorFound:
                    finalizedAIScenarioAnswer.debug.futureRotationChangeAnchorFound,
                  cpoOverrideAnchorFound: finalizedAIScenarioAnswer.debug.cpoOverrideAnchorFound,
                  knownAbsenceAnchorFound: finalizedAIScenarioAnswer.debug.knownAbsenceAnchorFound,
                  payProtectionAnchorFound: finalizedAIScenarioAnswer.debug.payProtectionAnchorFound,
                  futureRotationMissingSupportReason:
                    finalizedAIScenarioAnswer.debug.futureRotationMissingSupportReason,
                  governingSectionIncludesXDay,
                  pcsSwapScenario,
                  pcsSwapAnchorFound: finalizedAIScenarioAnswer.debug.pcsSwapAnchorFound,
                  pcsSwapMissingSupportReason: finalizedAIScenarioAnswer.debug.pcsSwapMissingSupportReason,
                  governingSectionIncludesPcsSwap,
                  vacationBankScenario,
                  vacationBankAnchorFound: finalizedAIScenarioAnswer.debug.vacationBankAnchorFound,
                  vacationBankMissingSupportReason:
                    finalizedAIScenarioAnswer.debug.vacationBankMissingSupportReason,
                  governingSectionIncludesVacationBank,
                  oeNotificationScenario: finalizedAIScenarioAnswer.debug.oeNotificationScenario,
                  oeNotificationAnchorFound: finalizedAIScenarioAnswer.debug.oeNotificationAnchorFound,
                  oeNotificationMissingSupportReason:
                    finalizedAIScenarioAnswer.debug.oeNotificationMissingSupportReason,
                  oeNotificationSupportRejectedReasons:
                    finalizedAIScenarioAnswer.debug.oeNotificationSupportRejectedReasons,
                  shortCallDutyScenario,
                  shortCallDutyAnchorFound: finalizedAIScenarioAnswer.debug.shortCallDutyAnchorFound,
                  governingSectionIncludesDutyLegality,
              ...rerankedGroundedSupport.debug,
              ...groundedFinalVisibleSupportDebug,
              ...intentDebugBase,
              toolsUsed: buildContractScenarioToolsUsed({
                intent: intentResolution,
                matchedInteractionRule,
                missingGatingFacts: scenarioValidation.missingGatingFacts,
                aiSynthesisUsed: true,
              }),
              retrievalPassCounts: {
                primary: primaryMatches.length,
                expanded: expandedMatches.length,
                linked: linkedMatches.length,
              },
            }
          : undefined,
    });
  } catch (error) {
    modelClientError = error instanceof Error ? error.message : "model_failure";
    if (!modelClientSucceeded) {
      aiSynthesisRejected = aiSynthesisAttempted;
      if (!aiRejectionReason) {
        aiRejectionReason = modelClientError;
      }
    }
    const partial =
      error instanceof AIValidationError
        ? tryParsePartialAIOutput(error.rawText, error.partialOutput)
        : lastAIOutput
          ? (lastAIOutput as Partial<ContractCopilotAIOutput>)
          : null;

    if (partial) {
      const partialShortAnswer =
        partial && typeof partial.shortAnswer === "string" && partial.shortAnswer.trim().length > 0
          ? partial.shortAnswer.trim()
          : null;

      if (partialShortAnswer) {
        const partialFacts = normalizeExtractedFacts(
          partial && partial.extractedFacts ? partial.extractedFacts : undefined
        );
        const partialScenarioValidation = resolveScenarioValidation({
          question: parsedRequest.question,
          facts: {
            ...fallbackResult.nextSession.facts,
            ...session.facts,
            ...(inferredPilotStatus && !session.facts.status ? { status: inferredPilotStatus } : {}),
            ...partialFacts,
          },
          governingPacket: governingPacketUsed,
          matchedInteractionRule,
        });
        const preferredPartialShortAnswer = buildBestGuessShortAnswer({
          aiShortAnswer: partialShortAnswer,
          deterministicShortAnswer: fallbackResult.answer.shortAnswer,
          whatCouldChange: Array.isArray(partial.whatCouldChange)
            ? partial.whatCouldChange.filter((item): item is string => typeof item === "string")
            : undefined,
          needsClarification: partial.needsClarification,
        });
        const synthesizedPartialTopAnswer = synthesizeContractCopilotTopAnswer({
          groundedShortAnswer: preferredPartialShortAnswer,
          deterministicShortAnswer: fallbackResult.answer.shortAnswer,
          scenarioBreakdown: Array.isArray(partial.scenarioBreakdown)
            ? partial.scenarioBreakdown.filter((item): item is string => typeof item === "string")
            : undefined,
          payBreakdown: Array.isArray(partial.payBreakdown)
            ? partial.payBreakdown.filter((item): item is string => typeof item === "string")
            : undefined,
          whatCouldChange: Array.isArray(partial.whatCouldChange)
            ? partial.whatCouldChange.filter((item): item is string => typeof item === "string")
            : undefined,
          whyItApplies:
            typeof partial.whyItApplies === "string" && partial.whyItApplies.trim().length > 0
              ? partial.whyItApplies.trim()
            : undefined,
          needsClarification: partial.needsClarification,
        });
        const strongerRuleBasedPartialBottomLine = buildRuleLedBottomLine({
          question: parsedRequest.question,
          facts: {
            ...fallbackResult.nextSession.facts,
            ...session.facts,
            ...(inferredPilotStatus && !session.facts.status ? { status: inferredPilotStatus } : {}),
            ...partialFacts,
          },
          governingPacket: governingPacketUsed,
          workedExamplePacket: workedExamplePacketUsed,
          preferredShortAnswer: synthesizedPartialTopAnswer,
          deterministicShortAnswer: fallbackResult.answer.shortAnswer,
          scenarioBreakdown: Array.isArray(partial.scenarioBreakdown)
            ? partial.scenarioBreakdown.filter((item): item is string => typeof item === "string")
            : undefined,
          payBreakdown: Array.isArray(partial.payBreakdown)
            ? partial.payBreakdown.filter((item): item is string => typeof item === "string")
            : undefined,
          whyItApplies:
            typeof partial.whyItApplies === "string" && partial.whyItApplies.trim().length > 0
              ? partial.whyItApplies.trim()
              : undefined,
        });
        const partialDetectedScenario = mapScenarioLabelToFamily(
          typeof partial.detectedScenario === "string" ? partial.detectedScenario : undefined
        );
        const partialAISupport = Array.isArray(partial.contractSupport)
          ? partial.contractSupport.flatMap((item) => {
              if (!item || typeof item !== "object") {
                return [];
              }
              const supportItem = item as Record<string, unknown>;
              const sourceLabel = supportItem.sourceLabel;
              const section = supportItem.section;
              if (typeof sourceLabel === "string" && typeof section === "string" && section.trim().length > 0) {
                return [
                  {
                    sourceLabel: sourceLabel.trim(),
                    section: section.trim(),
                    quoteSnippet:
                      typeof supportItem.quoteSnippet === "string" && supportItem.quoteSnippet.trim().length > 0
                        ? supportItem.quoteSnippet.trim()
                        : undefined,
                    note:
                      typeof supportItem.note === "string" && supportItem.note.trim().length > 0
                        ? supportItem.note.trim()
                        : undefined,
                  },
                ];
              }
              return [];
            })
          : [];
        const groundedPartialSupport = buildGroundedReferences({
          aiSupportItems: partialAISupport,
          retrievedSupport,
          fallbackReferences: fallbackResult.answer.references,
          preferredSection: workedExamplePacketUsed?.section ?? governingPacketUsed?.section,
          preferredPacket: workedExamplePacketUsed ?? governingPacketUsed,
        });

        const missingRequiredFields = [
          typeof partial.shortAnswer !== "string" ? "shortAnswer" : null,
          typeof partial.confidence !== "string" ? "confidence" : null,
        ].filter((item): item is string => Boolean(item));
        const strongerRuleBasedAnswerAvailableButNotUsed =
          Boolean(governingPacketUsed) &&
          normalizeForComparison(strongerRuleBasedPartialBottomLine) !==
            normalizeForComparison(synthesizedPartialTopAnswer) &&
          bottomLineLooksGeneric(synthesizedPartialTopAnswer);
        const concreteRuleBasedAnswerAvailable =
          Boolean(governingPacketUsed) && !bottomLineIsClassificationOnly(strongerRuleBasedPartialBottomLine);
        const finalPartialBottomLine = strongerRuleBasedAnswerAvailableButNotUsed
          ? strongerRuleBasedPartialBottomLine
          : synthesizedPartialTopAnswer;
        const conditionalPartialBottomLine =
          !isComplexScenarioQuestion &&
          partialScenarioValidation.answerIsConditional &&
          partialScenarioValidation.conditionalBottomLine
            ? partialScenarioValidation.conditionalBottomLine
            : finalPartialBottomLine;
        const partialBottomLineMode =
          governingPacketUsed && !bottomLineLooksGeneric(conditionalPartialBottomLine) ? "section_led" : "generic";
        const partialBottomLineReflectsGoverningRule = bottomLineReflectsGoverningRule({
          bottomLine: conditionalPartialBottomLine,
          governingPacket: governingPacketUsed,
        });
        const classificationLevelOnly = bottomLineIsClassificationOnly(conditionalPartialBottomLine);
        const finalAnswerUsedConcreteRule = concreteRuleBasedAnswerAvailable && !classificationLevelOnly;
        const concreteInteractionRuleAvailable =
          Boolean(matchedInteractionRule) && !bottomLineIsClassificationOnly(strongerRuleBasedPartialBottomLine);
        const finalAnswerUsedConcreteInteractionRule =
          concreteInteractionRuleAvailable && !bottomLineLooksGeneric(conditionalPartialBottomLine);
        const answerStillGenericDespiteInteractionRule =
          Boolean(matchedInteractionRule) && bottomLineLooksGeneric(conditionalPartialBottomLine);
        const partialAnswerSupport = mergeAnswerReferencedSupport({
          answerText: `${conditionalPartialBottomLine} ${
            typeof partial.whyItApplies === "string" ? partial.whyItApplies : ""
          }`,
          references: groundedPartialSupport.references,
          chunks: searchableChunks,
        });
        const rerankedPartialSupport = rerankSupportReferences({
          question: parsedRequest.question,
          answerText: `${conditionalPartialBottomLine} ${
            typeof partial.whyItApplies === "string" ? partial.whyItApplies : ""
          }`,
          references: [
            ...partialAnswerSupport.references,
            ...(controllingSectionLock?.reference ? [controllingSectionLock.reference] : []),
            ...supportFocusedReferences,
          ],
          selectedLane: intentResolution.selectedLane,
        });
        const visiblePartialReferences = filterFinalVisibleSupportReferencesForTurn(
          parsedRequest.question,
          selectVisibleContractReferences(rerankedPartialSupport.references),
        );
        const partialFinalVisibleSupportDebug = buildFinalVisibleSupportDebug(
          visiblePartialReferences,
          rerankedPartialSupport.debug as Record<string, unknown>
        );
        const partialClarifyingQuestions = filterClarifyingQuestionsForInference(
          parsedRequest.question,
          isComplexScenarioQuestion
            ? inferClarifyingQuestion(
                {
                  ...aiResultFromPartial(partial),
                },
                fallbackResult.answer.clarifyingQuestions,
                parsedRequest.question,
                session.clarificationCount
              )
            : partialScenarioValidation.gatingQuestion && session.clarificationCount < 2
              ? [partialScenarioValidation.gatingQuestion]
              : inferClarifyingQuestion(
                  {
                    ...aiResultFromPartial(partial),
                  },
                  fallbackResult.answer.clarifyingQuestions,
                  parsedRequest.question,
                  session.clarificationCount
                )
        );

        console.log("=== AI_UNVERIFIED AVAILABLE ===");
        console.dir(
          {
            validationError: error instanceof Error ? error.message : "unknown_error",
            parsedKeys: Object.keys(partial),
            missingRequiredFields,
            weakResponseGateFired,
          },
          { depth: null }
        );

        const aiUnverifiedAnswer: ContractAnswerCard = {
          ...fallbackResult.answer,
          status:
            !isComplexScenarioQuestion &&
            Boolean(partialClarifyingQuestions?.length) &&
            (partial.needsClarification || partialScenarioValidation.answerIsConditional) &&
            session.clarificationCount < 2
              ? "needs_clarification"
              : fallbackResult.answer.status,
          answerCompleteness:
            partial.answerCompleteness === "resolved" ||
            (!partial.needsClarification && !partialScenarioValidation.answerIsConditional) ||
            session.clarificationCount >= 2
              ? "resolved"
              : "provisional",
          shortAnswer: conditionalPartialBottomLine,
          confidence:
            partial.confidence === "high" || partial.confidence === "medium" || partial.confidence === "low"
              ? partial.confidence
              : fallbackResult.answer.confidence,
          scenarioLabel:
            typeof partial.detectedScenario === "string" && partial.detectedScenario.trim().length > 0
              ? partial.detectedScenario.trim()
              : fallbackResult.answer.scenarioLabel,
          references: visiblePartialReferences,
          supportLevel: selectVisibleSupportLevel(groundedPartialSupport.references),
          assumptions: Array.from(
            new Set([
              ...(fallbackResult.answer.assumptions ?? []),
              ...(Array.isArray(partial.assumptions) ? partial.assumptions.filter((item): item is string => typeof item === "string") : []),
              weakResponseGateFired
                ? "AI (unverified): this answer was shown for debugging after the weak-response gate rejected it."
                : "AI (unverified): this answer came from a model response that did not fully pass schema validation.",
            ])
          ),
          scenarioBreakdown:
            Array.isArray(partial.scenarioBreakdown) && partial.scenarioBreakdown.length > 0
              ? partial.scenarioBreakdown.filter((item): item is string => typeof item === "string")
              : fallbackResult.answer.scenarioBreakdown,
          payBreakdown:
            Array.isArray(partial.payBreakdown) && partial.payBreakdown.length > 0
              ? partial.payBreakdown.filter((item): item is string => typeof item === "string")
              : fallbackResult.answer.payBreakdown,
          plainEnglishExplanation:
            trimToTwoSentences(
              partialScenarioValidation.answerIsConditional && partialScenarioValidation.conditionalWhy
                ? partialScenarioValidation.conditionalWhy
                : typeof partial.whyItApplies === "string" && partial.whyItApplies.trim().length > 0
                ? partial.whyItApplies.trim()
                : fallbackResult.answer.plainEnglishExplanation
            ),
          whatCouldChangeThisAnswer:
            Array.isArray(partial.whatCouldChange)
              ? partial.whatCouldChange.filter((item): item is string => typeof item === "string")
              : fallbackResult.answer.whatCouldChangeThisAnswer,
          breakItDown: [],
          followUpSuggestion: undefined,
          clarifyingQuestions: partialClarifyingQuestions,
          caveats: Array.from(new Set([...(fallbackResult.answer.caveats ?? []), "AI (unverified)"])),
        };
        const verifiedAIUnverifiedAnswer = verifyScenarioOutput(
          stageDebug,
          { mode: "ai_unverified" },
          () =>
            applyScenarioAnswerVerifier({
              question: parsedRequest.question,
              selectedLane: intentResolution.selectedLane,
              answer: aiUnverifiedAnswer,
              contractIndex,
              sourceUsageDebug,
            }),
        );
        const finalizedAIUnverifiedScenarioAnswer = attachScenarioSupport(
          stageDebug,
          { mode: "ai_unverified" },
          () => {
            const aiUnverifiedAnswerWithComparisonNote = applyComparisonSupportNote({
              question: parsedRequest.question,
              answer: verifiedAIUnverifiedAnswer.answer,
              references: verifiedAIUnverifiedAnswer.answer.references,
            });
            const aiUnverifiedAnswerWithControllingSection = applyControllingSectionLock({
              answer: aiUnverifiedAnswerWithComparisonNote,
              controllingSectionLock,
            });
            return finalizeScenarioSafetyPipeline({
              question: parsedRequest.question,
              answer: aiUnverifiedAnswerWithControllingSection,
              verified: verifiedAIUnverifiedAnswer,
              supportDebug: {
                ...rerankedPartialSupport.debug,
                ...partialFinalVisibleSupportDebug,
                answerReferencedSections: partialAnswerSupport.answerReferencedSections,
                supportInjectedFromAnswer: partialAnswerSupport.supportInjectedFromAnswer,
                supportMissingForReferencedSection: partialAnswerSupport.missingSections.length > 0,
                controllingSectionLocked: Boolean(controllingSectionLock),
                controllingSectionDisplay: controllingSectionLock?.displaySection,
                controllingSectionQuoteAttached: Boolean(controllingSectionLock?.quoteSnippet),
                controllingSectionQuote: controllingSectionLock?.quoteSnippet,
                controllingSectionMissingExactText: controllingSectionLock?.exactAttached === false,
              },
            });
          },
        );

        return jsonResponse(200, {
          ok: true,
          mode: "ai_unverified",
          answer: finalizedAIUnverifiedScenarioAnswer.answer,
          detectedScenario: partialDetectedScenario ?? fallbackResult.detectedScenario,
          nextSession: {
            ...fallbackResult.nextSession,
            clarificationCount:
              Boolean(partialClarifyingQuestions?.length) &&
              (partial.needsClarification || partialScenarioValidation.answerIsConditional) &&
              session.clarificationCount < 2
                ? session.clarificationCount + 1
                : 0,
            unresolvedQuestion:
              Boolean(partialClarifyingQuestions?.length) &&
              (partial.needsClarification || partialScenarioValidation.answerIsConditional) &&
              session.clarificationCount < 2
                ? (session.unresolvedQuestion ?? parsedRequest.question)
                : undefined,
            lastAskedClarifyingField: partialClarifyingQuestions?.[0]?.factField,
            lastClarifyingQuestionId: partialClarifyingQuestions?.[0]?.id,
            status:
              Boolean(partialClarifyingQuestions?.length) &&
              (partial.needsClarification || partialScenarioValidation.answerIsConditional) &&
              session.clarificationCount < 2
                ? "awaiting_reply"
                : "answered",
          },
          meta: {
            fallbackReason: "partial_ai_output",
            modelUsed: model,
          },
          debug:
            process.env.NODE_ENV !== "production"
              ? {
                  mode: "ai_unverified",
                  fallbackReason: weakResponseGateFired ? "weak_ai_response" : "partial_ai_output",
                  validationError: error instanceof Error ? error.message : "unknown_error",
                  rawModelText:
                    error instanceof AIValidationError
                      ? error.rawText?.slice(0, 2000)
                      : undefined,
                  parsedKeys: Object.keys(partial),
                  missingRequiredFields,
                  weakResponseGateFired,
                  retrievedSnippetCount: retrievedSupport.length,
                  retrievedSections: retrievedSupport.map((item) => item.section),
                  knownInteractionRuleIds: knownInteractionRules.map((item) => item.id),
                  matchedInteractionRuleId: matchedInteractionRule?.id,
                  matchedInteractionRuleTitle: matchedInteractionRule?.title,
                  matchedInteractionRuleGoverningSources: matchedInteractionRule?.governingSources.map(
                    (source) => `${source.source}:${source.section}`
                  ),
                  matchedInteractionRuleReasoningSteps: matchedInteractionRule?.reasoningSteps,
                  routedGoverningSections,
                  searchMode,
                  routingFallbackOccurred,
                  governingSectionsSelected,
                  governingSectionUsed:
                    visiblePartialReferences[0]
                      ? `${visiblePartialReferences[0].sourceId}:${visiblePartialReferences[0].section}`
                      : finalGoverningSectionUsed,
                  bottomLineMode: partialBottomLineMode,
                  bottomLineReflectsGoverningRule: partialBottomLineReflectsGoverningRule,
                  strongerRuleBasedAnswerAvailableButNotUsed,
                  classificationLevelOnly,
                  concreteRuleBasedAnswerAvailable,
                  finalAnswerUsedConcreteRule,
                  concreteInteractionRuleAvailable,
                  finalAnswerUsedConcreteInteractionRule,
                  answerStillGenericDespiteInteractionRule,
                  scenarioFamilySelected: partialScenarioValidation.scenarioFamilySelected,
                  aiPathUsed: true,
                  fallbackUsed: true,
                  reasonForFallback: weakResponseGateFired ? "weak_ai_response" : "partial_ai_output",
                  missingGatingFacts: partialScenarioValidation.missingGatingFacts,
                  missingRequiredFacts: partialScenarioValidation.missingGatingFacts,
                  clarificationInsteadOfFallback: false,
                  fallbackEntryReason: weakResponseGateFired ? "weak_ai_response" : "partial_ai_output",
                  aiPathSkippedReason: weakResponseGateFired ? "weak_ai_response" : "partial_model_validation_failure",
                  modelValidationFailureReason: error instanceof Error ? error.message : "unknown_error",
                  answerIsConditional: partialScenarioValidation.answerIsConditional,
                  gatingQuestionUsed: partialClarifyingQuestions?.[0]?.prompt,
                  sectionExpansionUsed: groundingPack.retrievalMeta.sectionExpansionUsed,
                  crossReferencesFollowed: groundingPack.retrievalMeta.crossReferencesFollowed,
                  contextPacketSummary,
                  governingSourcePriorityUsed,
                  reasoningMode: matchedInteractionRule ? "interaction_led" : "generic_retrieval_led",
                  answerMode: partialBottomLineMode,
                  retrievedSnippets: selectDebugRetrievedSnippets({
                    question: parsedRequest.question,
                    retrievedSupport,
                    visibleReferences: finalizedAIUnverifiedScenarioAnswer.references,
                  }),
                  groundingSource: groundedPartialSupport.usedRetrievedSupport
                    ? "retrieved_contract_snippets"
                    : "deterministic_support",
                  usedRetrievedSupport: groundedPartialSupport.usedRetrievedSupport,
                  externalAllowed: groundingPack.retrievalMeta.externalAllowed,
                  externalUsed: groundingPack.retrievalMeta.externalUsed,
                  externalReason: groundingPack.retrievalMeta.externalReason,
                  externalSnippetCount:
                    groundingPack.external.webDiscussion.length + groundingPack.external.forumUnofficial.length,
                  externalLabels: [
                    ...groundingPack.external.webDiscussion.map((item) => item.section),
                    ...groundingPack.external.forumUnofficial.map((item) => item.section),
                  ],
                  hasPwaIndex: contractIndex.hasPwaIndex,
                  retrievalSourcesUsed: buildRetrievalSourcesUsed({
                    groundingPack,
                    usedRetrievedSupport: groundedPartialSupport.usedRetrievedSupport,
                  }),
                  ...augmentSourceUsageWithReferences(sourceUsageDebug, finalizedAIUnverifiedScenarioAnswer.answer.references),
                  structuredRowsUsed: sourceUsageDebug.structuredRowsUsed,
                  aiSynthesisUsed: true,
                  OPENAI_API_KEYPresent: Boolean(apiKey),
                  modelClientCalled,
                  modelClientSucceeded,
                  modelClientError,
                  aiSynthesisAttempted,
                  aiSynthesisRejected: true,
                  aiRejectionReason: weakResponseGateFired ? "weak_ai_response" : modelClientError,
                  laneEnforced: laneExecution.laneDebug.laneEnforced,
                  expectedTool: laneExecution.laneDebug.expectedTool,
                  retrievalAttempted: laneExecution.laneDebug.retrievalAttempted,
                  laneExecutionResult: laneExecution.laneDebug.laneExecutionResult,
                  documentShortcutUsed,
                  clarificationReason,
                  fallbackUsed: true,
                  fallthroughPrevented: laneExecution.laneDebug.fallthroughPrevented,
                  retryAttempts: laneExecution.laneDebug.retryAttempts,
                  sourceAvailability: laneExecution.laneDebug.sourceAvailability,
                  verifierRan: verifiedAIUnverifiedAnswer.verifierRan,
                  verifierPassed: verifiedAIUnverifiedAnswer.verifierPassed,
                  verifierWarnings: verifiedAIUnverifiedAnswer.verifierWarnings,
                  verifierFailureReasons: verifiedAIUnverifiedAnswer.verifierFailureReasons,
                  verifierAdjustedAnswer: verifiedAIUnverifiedAnswer.verifierAdjustedAnswer,
                  finalSafetyPipelineRan: finalizedAIUnverifiedScenarioAnswer.debug.finalSafetyPipelineRan,
                  truthGuardRan: verifiedAIUnverifiedAnswer.truthGuardRan,
                  definitionApplicationGuardRan: finalizedAIUnverifiedScenarioAnswer.debug.definitionApplicationGuardRan,
                  strongClaimsDetected: verifiedAIUnverifiedAnswer.strongClaimsDetected,
                  strongClaimsSupported: verifiedAIUnverifiedAnswer.strongClaimsSupported,
                  strongClaimsDowngraded: verifiedAIUnverifiedAnswer.strongClaimsDowngraded,
                  definitionSectionUsed: verifiedAIUnverifiedAnswer.definitionSectionUsed,
                  operationalSectionUsed: verifiedAIUnverifiedAnswer.operationalSectionUsed,
                  definitionOverrodeOperation: verifiedAIUnverifiedAnswer.definitionOverrodeOperation,
                  definitionBasedAnswer: verifiedAIUnverifiedAnswer.definitionBasedAnswer,
                  applicationClaimDetected: verifiedAIUnverifiedAnswer.applicationClaimDetected,
                  applicationClaimSupported: verifiedAIUnverifiedAnswer.applicationClaimSupported,
                  applicationClaimDowngraded: verifiedAIUnverifiedAnswer.applicationClaimDowngraded,
                  answerDowngradedToCaution: finalizedAIUnverifiedScenarioAnswer.debug.answerDowngradedToCaution,
                  downgradeReasons: finalizedAIUnverifiedScenarioAnswer.debug.downgradeReasons,
                  answerReferencedSections: finalizedAIUnverifiedScenarioAnswer.debug.answerReferencedSections,
                  supportInjectedFromAnswer: finalizedAIUnverifiedScenarioAnswer.debug.supportInjectedFromAnswer,
                  supportMissingForReferencedSection:
                    finalizedAIUnverifiedScenarioAnswer.debug.supportMissingForReferencedSection,
                  controllingSectionLocked: finalizedAIUnverifiedScenarioAnswer.debug.controllingSectionLocked,
                  controllingSectionDisplay: finalizedAIUnverifiedScenarioAnswer.debug.controllingSectionDisplay,
                  controllingSectionQuoteAttached:
                    finalizedAIUnverifiedScenarioAnswer.debug.controllingSectionQuoteAttached,
                  controllingSectionQuote: finalizedAIUnverifiedScenarioAnswer.debug.controllingSectionQuote,
                  controllingSectionMissingExactText:
                    finalizedAIUnverifiedScenarioAnswer.debug.controllingSectionMissingExactText,
                  xDayScenario,
                  xDayAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.xDayAnchorFound,
                  xDayGroupingScenario,
                  xDayGroupingAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.xDayGroupingAnchorFound,
                  xDayGroupingMissingSupportReason:
                    finalizedAIUnverifiedScenarioAnswer.debug.xDayGroupingMissingSupportReason,
                  pbRerouteXdayScenario,
                  pbAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.pbAnchorFound,
                  pbProcessingAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.pbProcessingAnchorFound,
                  notificationAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.notificationAnchorFound,
                  pbScenarioMissingSupportReason:
                    finalizedAIUnverifiedScenarioAnswer.debug.pbScenarioMissingSupportReason,
                  futureRotationChangeScenario,
                  futureRotationChangeAnchorFound:
                    finalizedAIUnverifiedScenarioAnswer.debug.futureRotationChangeAnchorFound,
                  cpoOverrideAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.cpoOverrideAnchorFound,
                  knownAbsenceAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.knownAbsenceAnchorFound,
                  payProtectionAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.payProtectionAnchorFound,
                  futureRotationMissingSupportReason:
                    finalizedAIUnverifiedScenarioAnswer.debug.futureRotationMissingSupportReason,
                  governingSectionIncludesXDay,
                  pcsSwapScenario,
                  pcsSwapAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.pcsSwapAnchorFound,
                  pcsSwapMissingSupportReason:
                    finalizedAIUnverifiedScenarioAnswer.debug.pcsSwapMissingSupportReason,
                  governingSectionIncludesPcsSwap,
                  vacationBankScenario,
                  vacationBankAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.vacationBankAnchorFound,
                  vacationBankMissingSupportReason:
                    finalizedAIUnverifiedScenarioAnswer.debug.vacationBankMissingSupportReason,
                  governingSectionIncludesVacationBank,
                  oeNotificationScenario: finalizedAIUnverifiedScenarioAnswer.debug.oeNotificationScenario,
                  oeNotificationAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.oeNotificationAnchorFound,
                  oeNotificationMissingSupportReason:
                    finalizedAIUnverifiedScenarioAnswer.debug.oeNotificationMissingSupportReason,
                  oeNotificationSupportRejectedReasons:
                    finalizedAIUnverifiedScenarioAnswer.debug.oeNotificationSupportRejectedReasons,
                  shortCallDutyScenario,
                  shortCallDutyAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.shortCallDutyAnchorFound,
                  governingSectionIncludesDutyLegality,
                  ...rerankedPartialSupport.debug,
                  ...partialFinalVisibleSupportDebug,
                  ...intentDebugBase,
                  toolsUsed: buildContractScenarioToolsUsed({
                    intent: intentResolution,
                    matchedInteractionRule,
                    missingGatingFacts: partialScenarioValidation.missingGatingFacts,
                    aiSynthesisUsed: true,
                  }),
                  hasCompensationIndex: contractIndex.hasCompensationIndex,
                  hasSchedulerIndex: contractIndex.hasSchedulerIndex,
                  retrievalPassCounts: {
                    primary: primaryMatches.length,
                    expanded: expandedMatches.length,
                    linked: linkedMatches.length,
                  },
                }
              : undefined,
        });
      }
    }

    console.log("=== FALLBACK CHOSEN BECAUSE ===");
    console.dir(
      {
        reason: error instanceof Error ? error.message : "model_failure",
        weakResponseGateFired,
        aiUnverifiedAvailable: Boolean(partial && typeof partial.shortAnswer === "string" && partial.shortAnswer.trim().length > 0),
      },
      { depth: null }
    );

    const fallbackScenarioValidation = resolveScenarioValidation({
      question: parsedRequest.question,
      facts: {
        ...fallbackResult.nextSession.facts,
        ...session.facts,
        ...(inferredPilotStatus && !session.facts.status ? { status: inferredPilotStatus } : {}),
      },
      governingPacket: governingPacketUsed,
      matchedInteractionRule,
    });

    const verifiedFallbackAnswer = verifyScenarioOutput(
      stageDebug,
      { mode: "fallback" },
      () =>
        applyScenarioAnswerVerifier({
          question: parsedRequest.question,
          selectedLane: intentResolution.selectedLane,
          answer: buildScenarioFallback(stageDebug, { reason: "model_fallback" }, () =>
            buildSafeScenarioFallbackAnswer({
              question: parsedRequest.question,
              answer: {
                ...fallbackResult.answer,
                assumptions: [
                  ...fallbackResult.answer.assumptions,
                  "AI fallback mode is active because the model response could not be used safely.",
                ],
              },
              retrievedSupport,
              sourceUsageDebug,
              missingGatingFacts: fallbackScenarioValidation.missingGatingFacts,
            }),
          ),
          contractIndex,
          sourceUsageDebug,
        }),
    );
    const fallbackAnswerSupport = mergeAnswerReferencedSupport({
      answerText: `${verifiedFallbackAnswer.answer.shortAnswer} ${verifiedFallbackAnswer.answer.plainEnglishExplanation}`,
      references: verifiedFallbackAnswer.answer.references,
      chunks: searchableChunks,
    });
    const rerankedFallbackSupport = rerankSupportReferences({
      question: parsedRequest.question,
      answerText: `${verifiedFallbackAnswer.answer.shortAnswer} ${verifiedFallbackAnswer.answer.plainEnglishExplanation}`,
      references: [
        ...fallbackAnswerSupport.references,
        ...(controllingSectionLock?.reference ? [controllingSectionLock.reference] : []),
        ...supportFocusedReferences,
      ],
      selectedLane: intentResolution.selectedLane,
    });
    const fallbackVisibleReferences = filterFinalVisibleSupportReferencesForTurn(
      parsedRequest.question,
      selectVisibleContractReferences(rerankedFallbackSupport.references),
    );
    const fallbackFinalVisibleSupportDebug = buildFinalVisibleSupportDebug(
      fallbackVisibleReferences,
      rerankedFallbackSupport.debug as Record<string, unknown>
    );
    const finalizedFallbackScenarioAnswer = attachScenarioSupport(
      stageDebug,
      { mode: "fallback" },
      () => {
        const fallbackAnswerWithComparisonNote = applyComparisonSupportNote({
          question: parsedRequest.question,
          answer: {
            ...verifiedFallbackAnswer.answer,
            references: fallbackVisibleReferences,
          },
          references: fallbackVisibleReferences,
        });
        const fallbackAnswerWithControllingSection = applyControllingSectionLock({
          answer: fallbackAnswerWithComparisonNote,
          controllingSectionLock,
        });
        return finalizeScenarioSafetyPipeline({
          question: parsedRequest.question,
          answer: fallbackAnswerWithControllingSection,
          verified: verifiedFallbackAnswer,
          supportDebug: {
            ...rerankedFallbackSupport.debug,
            ...fallbackFinalVisibleSupportDebug,
            answerReferencedSections: fallbackAnswerSupport.answerReferencedSections,
            supportInjectedFromAnswer: fallbackAnswerSupport.supportInjectedFromAnswer,
            supportMissingForReferencedSection: fallbackAnswerSupport.missingSections.length > 0,
            controllingSectionLocked: Boolean(controllingSectionLock),
            controllingSectionDisplay: controllingSectionLock?.displaySection,
            controllingSectionQuoteAttached: Boolean(controllingSectionLock?.quoteSnippet),
            controllingSectionQuote: controllingSectionLock?.quoteSnippet,
            controllingSectionMissingExactText: controllingSectionLock?.exactAttached === false,
          },
        });
      },
    );

    return jsonResponse(200, {
      ok: true,
      mode: "fallback",
      answer: finalizedFallbackScenarioAnswer.answer,
      detectedScenario: fallbackResult.detectedScenario,
      nextSession: fallbackResult.nextSession,
      meta: {
        fallbackReason: error instanceof Error ? error.message : "model_failure",
      },
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              mode: "fallback",
              fallbackReason: error instanceof Error ? error.message : "model_failure",
              validationError: error instanceof Error ? error.message : undefined,
              rawModelText: error instanceof AIValidationError ? error.rawText?.slice(0, 2000) : undefined,
              parsedKeys:
                error instanceof AIValidationError && error.partialOutput && typeof error.partialOutput === "object"
                  ? Object.keys(error.partialOutput as Record<string, unknown>)
                  : lastAIOutput && typeof lastAIOutput === "object"
                    ? Object.keys(lastAIOutput as Record<string, unknown>)
                  : undefined,
              missingRequiredFields:
                partial && typeof partial === "object"
                  ? [
                      typeof (partial as Record<string, unknown>).shortAnswer !== "string" ? "shortAnswer" : null,
                      typeof (partial as Record<string, unknown>).confidence !== "string" ? "confidence" : null,
                    ].filter((item): item is string => Boolean(item))
                  : undefined,
              weakResponseGateFired,
              retrievedSnippetCount: retrievedSupport.length,
              retrievedSections: retrievedSupport.map((item) => item.section),
              knownInteractionRuleIds: knownInteractionRules.map((item) => item.id),
              matchedInteractionRuleId: matchedInteractionRule?.id,
              matchedInteractionRuleTitle: matchedInteractionRule?.title,
              matchedInteractionRuleGoverningSources: matchedInteractionRule?.governingSources.map(
                (source) => `${source.source}:${source.section}`
              ),
              matchedInteractionRuleReasoningSteps: matchedInteractionRule?.reasoningSteps,
              routedGoverningSections,
              searchMode,
              routingFallbackOccurred,
              governingSectionsSelected,
              governingSectionUsed: finalGoverningSectionUsed,
              sectionExpansionUsed: groundingPack.retrievalMeta.sectionExpansionUsed,
              crossReferencesFollowed: groundingPack.retrievalMeta.crossReferencesFollowed,
              contextPacketSummary,
              governingSourcePriorityUsed,
              reasoningMode: matchedInteractionRule ? "interaction_led" : "generic_retrieval_led",
              answerMode: groundingPack.retrievalMeta.sectionLed ? "section_led" : "generic",
              retrievedSnippets: selectDebugRetrievedSnippets({
                question: parsedRequest.question,
                retrievedSupport,
                visibleReferences: finalizedFallbackScenarioAnswer.references,
              }),
              groundingSource: "fallback",
              usedRetrievedSupport: false,
              externalAllowed: groundingPack.retrievalMeta.externalAllowed,
              externalUsed: groundingPack.retrievalMeta.externalUsed,
              externalReason: groundingPack.retrievalMeta.externalReason,
              externalSnippetCount:
                groundingPack.external.webDiscussion.length + groundingPack.external.forumUnofficial.length,
              externalLabels: [
                ...groundingPack.external.webDiscussion.map((item) => item.section),
                ...groundingPack.external.forumUnofficial.map((item) => item.section),
              ],
              hasPwaIndex: contractIndex.hasPwaIndex,
              hasCompensationIndex: contractIndex.hasCompensationIndex,
              hasSchedulerIndex: contractIndex.hasSchedulerIndex,
              retrievalSourcesUsed: buildRetrievalSourcesUsed({
                groundingPack,
                usedRetrievedSupport: false,
              }),
              ...augmentSourceUsageWithReferences(sourceUsageDebug, finalizedFallbackScenarioAnswer.answer.references),
              structuredRowsUsed: sourceUsageDebug.structuredRowsUsed,
              aiSynthesisUsed: false,
              OPENAI_API_KEYPresent: Boolean(apiKey),
              modelClientCalled,
              modelClientSucceeded,
              modelClientError,
              aiSynthesisAttempted,
              aiSynthesisRejected: true,
              aiRejectionReason: aiRejectionReason ?? modelClientError,
              scenarioFamilySelected: fallbackScenarioValidation.scenarioFamilySelected,
              aiPathUsed: false,
              fallbackUsed: true,
              reasonForFallback: error instanceof Error ? error.message : "model_failure",
              missingGatingFacts: fallbackScenarioValidation.missingGatingFacts,
              missingRequiredFacts: fallbackScenarioValidation.missingGatingFacts,
              clarificationInsteadOfFallback: false,
              fallbackEntryReason: error instanceof Error ? error.message : "model_failure",
              aiPathSkippedReason: "model_fallback",
              modelValidationFailureReason: error instanceof Error ? error.message : "unknown_error",
              laneEnforced: laneExecution.laneDebug.laneEnforced,
              expectedTool: laneExecution.laneDebug.expectedTool,
              retrievalAttempted: laneExecution.laneDebug.retrievalAttempted,
              laneExecutionResult: laneExecution.laneDebug.laneExecutionResult,
              documentShortcutUsed,
              clarificationReason,
              fallbackUsed: true,
              fallthroughPrevented: laneExecution.laneDebug.fallthroughPrevented,
              retryAttempts: laneExecution.laneDebug.retryAttempts,
              sourceAvailability: laneExecution.laneDebug.sourceAvailability,
              verifierRan: verifiedFallbackAnswer.verifierRan,
              verifierPassed: verifiedFallbackAnswer.verifierPassed,
              verifierWarnings: verifiedFallbackAnswer.verifierWarnings,
              verifierFailureReasons: verifiedFallbackAnswer.verifierFailureReasons,
              verifierAdjustedAnswer: verifiedFallbackAnswer.verifierAdjustedAnswer,
              finalSafetyPipelineRan: finalizedFallbackScenarioAnswer.debug.finalSafetyPipelineRan,
              truthGuardRan: verifiedFallbackAnswer.truthGuardRan,
              definitionApplicationGuardRan: finalizedFallbackScenarioAnswer.debug.definitionApplicationGuardRan,
              strongClaimsDetected: verifiedFallbackAnswer.strongClaimsDetected,
              strongClaimsSupported: verifiedFallbackAnswer.strongClaimsSupported,
              strongClaimsDowngraded: verifiedFallbackAnswer.strongClaimsDowngraded,
              definitionSectionUsed: verifiedFallbackAnswer.definitionSectionUsed,
              operationalSectionUsed: verifiedFallbackAnswer.operationalSectionUsed,
              definitionOverrodeOperation: verifiedFallbackAnswer.definitionOverrodeOperation,
              definitionBasedAnswer: verifiedFallbackAnswer.definitionBasedAnswer,
              applicationClaimDetected: verifiedFallbackAnswer.applicationClaimDetected,
              applicationClaimSupported: verifiedFallbackAnswer.applicationClaimSupported,
              applicationClaimDowngraded: verifiedFallbackAnswer.applicationClaimDowngraded,
              answerDowngradedToCaution: finalizedFallbackScenarioAnswer.debug.answerDowngradedToCaution,
              downgradeReasons: finalizedFallbackScenarioAnswer.debug.downgradeReasons,
              answerReferencedSections: finalizedFallbackScenarioAnswer.debug.answerReferencedSections,
              supportInjectedFromAnswer: finalizedFallbackScenarioAnswer.debug.supportInjectedFromAnswer,
              supportMissingForReferencedSection:
                finalizedFallbackScenarioAnswer.debug.supportMissingForReferencedSection,
              controllingSectionLocked: finalizedFallbackScenarioAnswer.debug.controllingSectionLocked,
              controllingSectionDisplay: finalizedFallbackScenarioAnswer.debug.controllingSectionDisplay,
              controllingSectionQuoteAttached:
                finalizedFallbackScenarioAnswer.debug.controllingSectionQuoteAttached,
              controllingSectionQuote: finalizedFallbackScenarioAnswer.debug.controllingSectionQuote,
              controllingSectionMissingExactText:
                finalizedFallbackScenarioAnswer.debug.controllingSectionMissingExactText,
              xDayScenario,
              xDayAnchorFound: finalizedFallbackScenarioAnswer.debug.xDayAnchorFound,
              xDayGroupingScenario,
              xDayGroupingAnchorFound: finalizedFallbackScenarioAnswer.debug.xDayGroupingAnchorFound,
              xDayGroupingMissingSupportReason:
                finalizedFallbackScenarioAnswer.debug.xDayGroupingMissingSupportReason,
              pbRerouteXdayScenario,
              pbAnchorFound: finalizedFallbackScenarioAnswer.debug.pbAnchorFound,
              pbProcessingAnchorFound: finalizedFallbackScenarioAnswer.debug.pbProcessingAnchorFound,
              notificationAnchorFound: finalizedFallbackScenarioAnswer.debug.notificationAnchorFound,
              pbScenarioMissingSupportReason:
                finalizedFallbackScenarioAnswer.debug.pbScenarioMissingSupportReason,
              futureRotationChangeScenario,
              futureRotationChangeAnchorFound:
                finalizedFallbackScenarioAnswer.debug.futureRotationChangeAnchorFound,
              cpoOverrideAnchorFound: finalizedFallbackScenarioAnswer.debug.cpoOverrideAnchorFound,
              knownAbsenceAnchorFound: finalizedFallbackScenarioAnswer.debug.knownAbsenceAnchorFound,
              payProtectionAnchorFound: finalizedFallbackScenarioAnswer.debug.payProtectionAnchorFound,
              futureRotationMissingSupportReason:
                finalizedFallbackScenarioAnswer.debug.futureRotationMissingSupportReason,
              governingSectionIncludesXDay,
              pcsSwapScenario,
              pcsSwapAnchorFound: finalizedFallbackScenarioAnswer.debug.pcsSwapAnchorFound,
              pcsSwapMissingSupportReason: finalizedFallbackScenarioAnswer.debug.pcsSwapMissingSupportReason,
              governingSectionIncludesPcsSwap,
              vacationBankScenario,
              vacationBankAnchorFound: finalizedFallbackScenarioAnswer.debug.vacationBankAnchorFound,
              vacationBankMissingSupportReason:
                finalizedFallbackScenarioAnswer.debug.vacationBankMissingSupportReason,
              governingSectionIncludesVacationBank,
              oeNotificationScenario: finalizedFallbackScenarioAnswer.debug.oeNotificationScenario,
              oeNotificationAnchorFound: finalizedFallbackScenarioAnswer.debug.oeNotificationAnchorFound,
              oeNotificationMissingSupportReason:
                finalizedFallbackScenarioAnswer.debug.oeNotificationMissingSupportReason,
              oeNotificationSupportRejectedReasons:
                finalizedFallbackScenarioAnswer.debug.oeNotificationSupportRejectedReasons,
              shortCallDutyScenario,
              shortCallDutyAnchorFound: finalizedFallbackScenarioAnswer.debug.shortCallDutyAnchorFound,
              governingSectionIncludesDutyLegality,
              ...rerankedFallbackSupport.debug,
              ...fallbackFinalVisibleSupportDebug,
              ...intentDebugBase,
              toolsUsed: buildContractScenarioToolsUsed({
                intent: intentResolution,
                matchedInteractionRule,
                missingGatingFacts: fallbackScenarioValidation.missingGatingFacts,
                aiSynthesisUsed: false,
              }),
              retrievalPassCounts: {
                primary: primaryMatches.length,
                expanded: expandedMatches.length,
                linked: linkedMatches.length,
              },
            }
          : undefined,
    });
  }
}
