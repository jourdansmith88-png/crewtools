import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cwd = "/Users/StarJ/Desktop/Senority+";
const reportsDir = join(cwd, "reports");
const jsonReportPath = join(reportsDir, "contract-copilot-qa-report.json");
const mdReportPath = join(reportsDir, "contract-copilot-qa-report.md");
const supportOnlyMode = process.argv.includes("--support-only");

mkdirSync(reportsDir, { recursive: true });

function loadDotEnvLocal(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  const text = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const childScript = `
import { handleContractCopilotRoute } from ${JSON.stringify(new URL("../server/routes/ai/contractCopilotRoute.ts", import.meta.url).href)};
import { contractCopilotQATestBank } from ${JSON.stringify(new URL("../src/ai/workflows/contractCopilot/contractCopilotQATestBank.ts", import.meta.url).href)};
import { detectContractCopilotRedFlags } from ${JSON.stringify(new URL("../src/ai/workflows/contractCopilot/redFlagDetector.ts", import.meta.url).href)};

const supportOnlyMode = ${JSON.stringify(supportOnlyMode)};

console.log = () => {};
console.dir = () => {};

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/\\s+/g, " ").trim();
}

function normalizeSection(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function expandSectionVariants(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const upper = raw
    .replace(/^§\s*/i, "Section ")
    .replace(/\s+/g, " ")
    .replace(/(\d{1,2})([A-Z])/i, "$1 $2")
    .replace(/([A-Z])(\d+)/i, "$1.$2")
    .trim()
    .toUpperCase();
  const base = upper.startsWith("SECTION ") ? upper.replace(/^SECTION\s+/i, "").trim() : upper;
  const variants = new Set([upper, "SECTION " + base, base]);
  if (/^\d{1,2}\s+[A-Z](?:\.\d+)?$/.test(base)) {
    variants.add(base.replace(/\s+/g, ""));
    variants.add(base.replace(/\./g, ""));
  }
  return Array.from(variants);
}

function sectionMatches(expected, actual) {
  if (!expected) return true;
  const expectedVariants = expandSectionVariants(expected).map(normalizeSection);
  const actualVariants = expandSectionVariants(actual).map(normalizeSection);
  return expectedVariants.some((e) => actualVariants.some((a) => a.includes(e) || e.includes(a)));
}

function toSourceSet(debug) {
  const actual = new Set();
  for (const item of debug?.sourcesUsed ?? []) actual.add(item);
  if ((debug?.pwaSectionsUsed?.length ?? 0) > 0) actual.add("PWA");
  if ((debug?.compensationChunksUsed?.length ?? 0) > 0) actual.add("Compensation Manual");
  if ((debug?.schedulerChunksUsed?.length ?? 0) > 0) actual.add("Scheduler Manual");
  if (typeof debug?.lookupSource === "string" && debug.lookupSource.includes("compensationManualIndex")) {
    actual.add("Compensation Manual");
  }
  return Array.from(actual);
}

function getVisibleSupport(payload) {
  const visible = (payload.answer?.references ?? []).map((reference, index) => ({
    source: reference?.displaySourceLabel || (
      reference?.sourceId === "pwa"
        ? "PWA"
        : reference?.sourceId === "compensation_manual"
          ? "Compensation Manual"
          : reference?.sourceId === "scheduler_manual"
            ? "Scheduler Manual"
            : "Unknown"
    ),
    section: reference?.section ?? "",
    label: reference?.label ?? "",
    text: [reference?.section ?? "", reference?.label ?? "", reference?.quoteSnippet ?? ""].join(" "),
    index,
  }));
  const debug = payload.debug ?? {};
  const finalVisibleSections = Array.isArray(debug?.finalVisibleSupportSections) ? debug.finalVisibleSupportSections : [];
  for (let i = 0; i < visible.length; i += 1) {
    if (typeof finalVisibleSections[i] === "string" && finalVisibleSections[i].trim().length > 0) {
      visible[i].section = finalVisibleSections[i];
      visible[i].text = [visible[i].section ?? "", visible[i].label ?? "", visible[i].text ?? ""].join(" ");
    }
  }
  return visible;
}

function getSupportCandidatePool(payload) {
  const debug = payload.debug ?? {};
  const visible = getVisibleSupport(payload).map((item) => ({ ...item, location: "visible" }));
  const snippets = (debug.retrievedSnippets ?? []).map((snippet, index) => ({
    source: "Unknown",
    section: "",
    label: "",
    text: String(snippet ?? ""),
    index,
    location: "retrieval",
  }));
  const debugItems = [
    ...(debug?.supportMatchedSections ?? []).map((item, index) => ({
      source: "Unknown",
      section: String(item ?? ""),
      label: "",
      text: String(item ?? ""),
      index,
      location: "debug",
    })),
    ...(debug?.supportMatchedTerms ?? []).map((item, index) => ({
      source: "Unknown",
      section: "",
      label: "",
      text: String(item ?? ""),
      index,
      location: "debug",
    })),
    ...(debug?.retrievalSilverSlipAnchorsFound ?? []).map((item, index) => ({
      source: "Unknown",
      section: String(item ?? ""),
      label: "",
      text: String(item ?? ""),
      index,
      location: "debug",
    })),
    ...(debug?.retrievalGreenSlipAnchorsFound ?? []).map((item, index) => ({
      source: "Unknown",
      section: String(item ?? ""),
      label: "",
      text: String(item ?? ""),
      index,
      location: "debug",
    })),
    ...(debug?.finalVisibleSupportSections ?? []).map((item, index) => ({
      source: "Unknown",
      section: String(item ?? ""),
      label: "",
      text: String(item ?? ""),
      index,
      location: "debug",
    })),
    ...(debug?.visibleSupportPromotedSection ?? []).map((item, index) => ({
      source: "Unknown",
      section: String(item ?? ""),
      label: "",
      text: String(item ?? ""),
      index,
      location: "debug",
    })),
    ...(debug?.primarySupportAnchorUsed ? [{
      source: "Unknown",
      section: String(debug.primarySupportAnchorUsed),
      label: "",
      text: String(debug.primarySupportAnchorUsed),
      index: 0,
      location: "debug",
    }] : []),
  ];
  return [...visible, ...snippets, ...debugItems];
}

function termGroupMatches(text, terms) {
  if (!terms || terms.length === 0) return true;
  const haystack = normalize(text);
  return terms.some((term) => haystack.includes(normalize(term)));
}

function anchorMatchesItem(anchor, item) {
  const sourceOk = !anchor.source || item.source === anchor.source || item.source === "Unknown";
  if (!sourceOk) return false;
  const sectionOk =
    !anchor.section ||
    sectionMatches(anchor.section, item.section) ||
    sectionMatches(anchor.section, item.text);
  const termsOk = termGroupMatches(item.text, anchor.terms);
  return sectionOk && termsOk;
}

function evaluateSupportAnchors(test, payload) {
  const anchors = test.expectedSupportAnchors ?? [];
  if (anchors.length === 0) {
    return {
      supportAnchorMatch: undefined,
      primarySupportMatch: undefined,
      comparisonSupportMatch: undefined,
      wrongSupportPenalty: undefined,
      diagnostics: {
        missingAnchors: [],
        candidateOnlyAnchors: [],
        visibleAnchors: [],
        wrongPrimary: null,
        answerPassedButSupportFailed: false,
      },
    };
  }

  const visible = getVisibleSupport(payload);
  const pool = getSupportCandidatePool(payload);
  const debug = payload.debug ?? {};
  const sectionEvidence = [
    ...(debug?.finalVisibleSupportSections ?? []),
    ...(debug?.visibleSupportPromotedSection ?? []),
    ...(debug?.supportMatchedSections ?? []),
    ...(debug?.primarySupportAnchorUsed ? [debug.primarySupportAnchorUsed] : []),
    ...(payload.answer?.references ?? []).map((reference) => reference?.section ?? ""),
  ]
    .map((item) => String(item ?? ""))
    .filter(Boolean);
  const anchorStatuses = anchors.map((anchor) => {
    const visibleMatch = visible.find((item) => anchorMatchesItem(anchor, item));
    const candidateMatch = pool.find((item) => anchorMatchesItem(anchor, item));
    const sectionEvidenceMatch =
      anchor.section &&
      sectionEvidence.some((section) => sectionMatches(anchor.section, section));
    return {
      anchor,
      status: visibleMatch || sectionEvidenceMatch ? "visible" : candidateMatch ? "candidate" : "missing",
      visibleMatch,
      candidateMatch,
      sectionEvidenceMatch,
    };
  });

  const requiredAnchors = anchorStatuses.filter((item) => item.anchor.required !== false);
  const primaryAnchors = anchorStatuses.filter((item) => item.anchor.role === "primary");
  const comparisonAnchors = anchorStatuses.filter((item) => item.anchor.role === "comparison");
  const topVisible = visible[0];

  const supportAnchorMatch =
    requiredAnchors.length === 0
      ? "pass"
      : requiredAnchors.every((item) => item.status === "visible")
        ? "pass"
        : requiredAnchors.some((item) => item.status === "missing")
          ? "fail"
          : "warn";

  const primaryVisibleTop = primaryAnchors.find((item) => item.visibleMatch?.index === 0);
  const primaryVisibleAnywhere = primaryAnchors.find((item) => item.status === "visible");
  const expectedSpecificPrimary = primaryAnchors.some((item) => item.anchor.section || (item.anchor.terms?.length ?? 0) > 0);
  const topVisibleText = normalize([topVisible?.section ?? "", topVisible?.label ?? "", topVisible?.text ?? ""].join(" "));
  const genericPrimary = /scope|glossary|definitions?/.test(topVisibleText);

  const primarySupportMatch =
    primaryAnchors.length === 0
      ? "pass"
      : primaryVisibleTop
        ? "pass"
        : primaryVisibleAnywhere
          ? "warn"
          : topVisible
            ? "fail"
            : requiredAnchors.some((item) => item.status === "candidate")
              ? "warn"
              : "fail";

  const limitationText = normalize(payload.answer?.plainEnglishExplanation).includes("i found support for") ||
    normalize(payload.answer?.plainEnglishExplanation).includes("support note:");
  const comparisonSupportMatch =
    comparisonAnchors.length < 2
      ? undefined
      : comparisonAnchors.every((item) => item.status === "visible" || item.status === "candidate")
        ? "pass"
        : comparisonAnchors.some((item) => item.status === "missing")
          ? limitationText
            ? "warn"
            : "fail"
          : "warn";

  const wrongSupportPenalty =
    expectedSpecificPrimary && topVisible && genericPrimary && !primaryVisibleTop
      ? "fail"
      : "pass";

  return {
    supportAnchorMatch,
    primarySupportMatch,
    comparisonSupportMatch,
    wrongSupportPenalty,
    diagnostics: {
      missingAnchors: anchorStatuses.filter((item) => item.status === "missing").map((item) => item.anchor),
      candidateOnlyAnchors: anchorStatuses.filter((item) => item.status === "candidate").map((item) => item.anchor),
      visibleAnchors: anchorStatuses.filter((item) => item.status === "visible").map((item) => item.anchor),
      wrongPrimary: wrongSupportPenalty === "fail" ? topVisible?.section || topVisible?.label || "unknown" : null,
      anchorStatuses,
      answerPassedButSupportFailed: false,
    },
  };
}

function scoreTest(test, payload) {
  const debug = payload.debug ?? {};
  const actualSources = toSourceSet(debug);
  const missingSources = test.expectedSources.filter((source) => !actualSources.includes(source));
  const supportHaystack = [
    ...(payload.answer?.references ?? []).flatMap((reference) => [
      reference?.section ?? "",
      reference?.label ?? "",
      reference?.quoteSnippet ?? "",
    ]),
    ...(debug?.retrievedSections ?? []),
    ...((debug?.supportMatchedTerms ?? []).map((item) => String(item))),
    ...((debug?.supportMatchedSections ?? []).map((item) => String(item))),
  ]
    .join(" ")
    .toLowerCase();
  const answerHaystack = [
    payload.answer?.shortAnswer ?? "",
    payload.answer?.plainEnglishExplanation ?? "",
    ...(payload.answer?.clarifyingQuestions ?? []).map((item) => item?.prompt ?? ""),
    ...(payload.answer?.references ?? []).flatMap((reference) => [
      reference?.section ?? "",
      reference?.label ?? "",
      reference?.quoteSnippet ?? "",
    ]),
    ...(debug?.retrievedSnippets ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const missingSupportIncludes = (test.expectedSupportIncludes ?? []).filter(
    (item) => !supportHaystack.includes(item.toLowerCase()),
  );
  const missingMustInclude = (test.mustInclude ?? []).filter(
    (item) => !answerHaystack.includes(item.toLowerCase()),
  );
  const foundMustNotInclude = (test.mustNotInclude ?? []).filter(
    (item) => answerHaystack.includes(item.toLowerCase()),
  );
  const expectedVerifier = test.expectedLane === "contract_scenario_retrieval";
  const actualVerifier = debug.verifierRan === true;
  const scenarioSafetyExpected = test.expectedLane === "contract_scenario_retrieval";
  const scenarioSafetyPipelinePassed =
    !scenarioSafetyExpected ||
    (
      debug.finalSafetyPipelineRan === true &&
      debug.truthGuardRan === true &&
      debug.definitionApplicationGuardRan === true &&
      debug.supportQualityGateRan === true
    );
  const structuredSafeFallback =
    typeof payload.answer?.plainEnglishExplanation === "string" &&
    (
      (
        payload.answer.plainEnglishExplanation.includes("What controls:") &&
        payload.answer.plainEnglishExplanation.includes("How it likely applies here:") &&
        payload.answer.plainEnglishExplanation.includes("What I can't confirm from available sources:") &&
        payload.answer.plainEnglishExplanation.includes("Sources used:")
      ) ||
      (
        payload.answer.plainEnglishExplanation.includes("What this depends on:") &&
        payload.answer.plainEnglishExplanation.includes("Likely paths:") &&
        payload.answer.plainEnglishExplanation.includes("What to check:") &&
        payload.answer.plainEnglishExplanation.includes("Source limitation:")
      )
    );
  const explicitControllingSourceLimitation =
    (payload.answer?.plainEnglishExplanation ?? "").toLowerCase().includes(
      "i do not have a clean controlling source"
    );
  const redFlagResult = detectContractCopilotRedFlags({
    question: test.question,
    shortAnswer: payload.answer?.shortAnswer,
    plainEnglishExplanation: payload.answer?.plainEnglishExplanation,
    riskLevel: test.riskLevel,
    category: test.category,
    selectedLane: debug.selectedLane,
    aiSynthesisUsed: debug.aiSynthesisUsed,
    sourcesUsed: actualSources,
    pwaSectionsUsed: debug.pwaSectionsUsed,
    compensationChunksUsed: debug.compensationChunksUsed,
    schedulerChunksUsed: debug.schedulerChunksUsed,
    missingSourceWarnings: debug.missingSourceWarnings,
    referencesCount: Array.isArray(payload.answer?.references) ? payload.answer.references.length : 0,
    retrievedSnippets: debug.retrievedSnippets,
    fallbackReason: debug.fallbackReason,
    mustNotInclude: test.mustNotInclude,
  });

  const supportScores = evaluateSupportAnchors(test, payload);
  const realWorldScenario = test.category === "real_world_fb_scenarios";
  const displayedSupportText = [
    ...(payload.answer?.references ?? []).flatMap((reference) => [
      reference?.section ?? "",
      reference?.label ?? "",
      reference?.quoteSnippet ?? "",
    ]),
    ...((debug?.supportMatchedTerms ?? []).map((item) => String(item))),
    ...((debug?.supportMatchedSections ?? []).map((item) => String(item))),
  ]
    .join(" ")
    .toLowerCase();
  const supportHasKeySignal =
    (test.expectedSupportIncludes ?? []).some((item) => displayedSupportText.includes(item.toLowerCase())) ||
    (test.complexityTags ?? []).some((item) => displayedSupportText.includes(item.toLowerCase()));
  const clarificationAsked = (payload.answer?.clarifyingQuestions?.length ?? 0) > 0;
  const expectedGroupedClarification = test.clarificationStyle === "grouped";
  const groupedClarificationDetected =
    ((payload.answer?.clarifyingQuestions ?? []).length > 1) ||
    /\\b(and|also|first|second|separately|which of these)\\b/i.test(
      (payload.answer?.clarifyingQuestions ?? []).map((item) => item?.prompt ?? "").join(" "),
    );

  const laneMatch = debug.selectedLane === test.expectedLane ? "pass" : "fail";
  const strongClaimWithWeakSupport =
    scenarioSafetyExpected &&
    (debug.strongClaimsDetected?.length ?? 0) > 0 &&
    debug.supportWeakMatchWarning === true &&
    debug.answerDowngradedToCaution !== true;
  const sourceMatch =
    missingSources.length === 0 && missingSupportIncludes.length === 0
      ? "pass"
      : realWorldScenario && explicitControllingSourceLimitation
        ? "warn"
        : test.riskLevel === "critical" || test.riskLevel === "high"
          ? "fail"
          : "warn";
  const synthesisUnavailable =
    test.shouldUseAISynthesis &&
    debug.aiSynthesisUsed !== true &&
    (debug.fallbackReason === "missing_api_key" ||
      debug.fallbackReason === "model_failure" ||
      debug.fallbackReason === "partial_ai_output" ||
      debug.fallbackReason === "weak_ai_response" ||
      debug.fallbackReason === "fetch failed");
  const synthesisMatch =
    debug.aiSynthesisUsed === test.shouldUseAISynthesis
      ? "pass"
      : synthesisUnavailable && structuredSafeFallback
        ? "warn"
        : synthesisUnavailable
          ? "warn"
          : "fail";
  const verifierBehavior =
    scenarioSafetyExpected && !scenarioSafetyPipelinePassed
      ? "fail"
      : expectedVerifier === actualVerifier
      ? "pass"
      : expectedVerifier && !actualVerifier
        ? "fail"
        : "warn";
  const answerSafety =
    strongClaimWithWeakSupport
      ? "fail"
      : redFlagResult.severity === "none"
      ? "pass"
      : redFlagResult.severity === "low" || redFlagResult.severity === "medium"
        ? "warn"
        : "fail";
  const watchedRedFlags = test.redFlags.filter((flag) => redFlagResult.redFlags.includes(flag));
  const redFlagDetected =
    watchedRedFlags.length === 0 ? "pass" : test.riskLevel === "critical" || test.riskLevel === "high" ? "fail" : "warn";

  const complexityRecognized = realWorldScenario
    ? (test.complexityTags ?? []).filter((tag) => answerHaystack.includes(tag.toLowerCase())).length >=
      Math.max(2, Math.min(4, Math.ceil((test.complexityTags ?? []).length / 3)))
      ? "pass"
      : "warn"
    : undefined;
  const mustIncludeCoverage = realWorldScenario
    ? missingMustInclude.length === 0
      ? "pass"
      : missingMustInclude.length <= 2
        ? "warn"
        : "fail"
    : undefined;
  const oversimplificationAvoided = realWorldScenario
    ? redFlagResult.redFlags.includes("oversimplified_complex_scenario") ||
      redFlagResult.redFlags.includes("single_gating_question_only")
      ? "fail"
      : "pass"
    : undefined;
  const supportRelevance = realWorldScenario
    ? redFlagResult.redFlags.includes("irrelevant_support_primary") && !supportHasKeySignal
      ? "fail"
      : missingSupportIncludes.length > 0 && !supportHasKeySignal
        ? "fail"
        : supportHasKeySignal
          ? "pass"
          : "warn"
    : undefined;
  const safetyTone = realWorldScenario
    ? redFlagResult.redFlags.includes("unsupported_policy_certainty") ||
      redFlagResult.redFlags.includes("legal_advice_overreach") ||
      redFlagResult.redFlags.includes("suggests_policy_abuse") ||
      foundMustNotInclude.length > 0
      ? "fail"
      : "pass"
    : undefined;
  const clarificationQuality = realWorldScenario
    ? test.shouldAskClarification === false
      ? clarificationAsked
        ? "warn"
        : "pass"
      : expectedGroupedClarification
        ? clarificationAsked && groupedClarificationDetected
          ? "pass"
          : clarificationAsked
            ? "warn"
            : "warn"
        : clarificationAsked
          ? "pass"
          : "warn"
    : undefined;

  let finalScore = "PASS";
  const criticalFail =
    (test.riskLevel === "critical" && laneMatch === "fail") ||
    (test.expectedLane === "direct_pay_rate_lookup" && watchedRedFlags.includes("deterministic_mismatch")) ||
    (test.expectedLane === "apd_threshold_calculation" && watchedRedFlags.includes("deterministic_mismatch")) ||
    redFlagResult.severity === "critical";
  if (criticalFail) {
    finalScore = "CRITICAL_FAIL";
  } else if (
    [
      laneMatch,
      sourceMatch,
      synthesisMatch,
      verifierBehavior,
      answerSafety,
      redFlagDetected,
      complexityRecognized,
      mustIncludeCoverage,
      oversimplificationAvoided,
      supportRelevance,
      safetyTone,
      clarificationQuality,
    ].includes("fail")
  ) {
    finalScore = "FAIL";
  } else if (
    [
      laneMatch,
      sourceMatch,
      synthesisMatch,
      verifierBehavior,
      answerSafety,
      redFlagDetected,
      complexityRecognized,
      mustIncludeCoverage,
      oversimplificationAvoided,
      supportRelevance,
      safetyTone,
      clarificationQuality,
    ].includes("warn")
  ) {
    finalScore = "WARN";
  }

  const supportStatuses = [
    supportScores.supportAnchorMatch,
    supportScores.primarySupportMatch,
    supportScores.comparisonSupportMatch,
    supportScores.wrongSupportPenalty,
  ].filter(Boolean);
  let supportFinalScore = "PASS";
  if (supportStatuses.includes("fail")) {
    supportFinalScore = "FAIL";
  } else if (supportStatuses.includes("warn")) {
    supportFinalScore = "WARN";
  }

  supportScores.diagnostics.answerPassedButSupportFailed =
    (finalScore === "PASS" || finalScore === "WARN") && supportFinalScore === "FAIL";

  return {
    id: test.id,
    question: test.question,
    category: test.category,
    riskLevel: test.riskLevel,
    finalScore,
    supportFinalScore,
    checks: {
      laneMatch,
      sourceMatch,
      synthesisMatch,
      verifierBehavior,
      answerSafety,
      redFlagDetected,
      complexityRecognized,
      mustIncludeCoverage,
      oversimplificationAvoided,
      supportRelevance,
      safetyTone,
      clarificationQuality,
    },
    supportChecks: {
      supportAnchorMatch: supportScores.supportAnchorMatch,
      primarySupportMatch: supportScores.primarySupportMatch,
      comparisonSupportMatch: supportScores.comparisonSupportMatch,
      wrongSupportPenalty: supportScores.wrongSupportPenalty,
    },
    expected: {
      expectedLane: test.expectedLane,
      expectedSources: test.expectedSources,
      shouldUseAISynthesis: test.shouldUseAISynthesis,
      expectedSupportIncludes: test.expectedSupportIncludes ?? [],
      expectedSupportAnchors: test.expectedSupportAnchors ?? [],
      complexityTags: test.complexityTags ?? [],
      mustInclude: test.mustInclude ?? [],
      mustNotInclude: test.mustNotInclude ?? [],
      shouldAskClarification: test.shouldAskClarification,
      clarificationStyle: test.clarificationStyle,
      redFlags: test.redFlags,
    },
    actual: {
      mode: payload.mode,
      fallbackReason: debug.fallbackReason,
      shortAnswer: payload.answer?.shortAnswer,
      plainEnglishExplanation: payload.answer?.plainEnglishExplanation,
      intentType: debug.intentType,
      OPENAI_API_KEYPresent: debug.OPENAI_API_KEYPresent,
      modelClientCalled: debug.modelClientCalled,
      modelClientSucceeded: debug.modelClientSucceeded,
      modelClientError: debug.modelClientError,
      aiSynthesisAttempted: debug.aiSynthesisAttempted,
      aiSynthesisUsed: debug.aiSynthesisUsed,
      aiSynthesisRejected: debug.aiSynthesisRejected,
      aiRejectionReason: debug.aiRejectionReason,
      scenarioProceedWithPartialContext: debug.scenarioProceedWithPartialContext,
      selectedLane: debug.selectedLane,
      laneExecutionResult: debug.laneExecutionResult,
      laneEnforced: debug.laneEnforced,
      expectedTool: debug.expectedTool,
      toolsUsed: debug.toolsUsed ?? [],
      retrievalAttempted: debug.retrievalAttempted,
      retrievalSourcesUsed: debug.retrievalSourcesUsed ?? [],
      fallbackUsed: debug.fallbackUsed,
      fallthroughPrevented: debug.fallthroughPrevented,
      verifierRan: debug.verifierRan,
      finalSafetyPipelineRan: debug.finalSafetyPipelineRan,
      verifierPassed: debug.verifierPassed,
      verifierWarnings: debug.verifierWarnings ?? [],
      verifierFailureReasons: debug.verifierFailureReasons ?? [],
      truthGuardRan: debug.truthGuardRan,
      definitionApplicationGuardRan: debug.definitionApplicationGuardRan,
      strongClaimsDetected: debug.strongClaimsDetected ?? [],
      strongClaimsSupported: debug.strongClaimsSupported ?? [],
      strongClaimsDowngraded: debug.strongClaimsDowngraded ?? [],
      missingSourceWarnings: debug.missingSourceWarnings ?? [],
      documentShortcutUsed: debug.documentShortcutUsed,
      clarificationReason: debug.clarificationReason,
      supportRerankerRan: debug.supportRerankerRan,
      supportQualityGateRan: debug.supportQualityGateRan,
      supportMatchedSections: (payload.answer?.references ?? []).map((reference) => reference?.section).filter(Boolean),
      supportMatchedTerms: debug.supportMatchedTerms ?? [],
      retrievalSilverSlipAnchorsFound: debug.retrievalSilverSlipAnchorsFound ?? [],
      retrievalGreenSlipAnchorsFound: debug.retrievalGreenSlipAnchorsFound ?? [],
      retrievalComparisonMode: debug.retrievalComparisonMode ?? false,
      supportWeakMatchWarning: debug.supportWeakMatchWarning ?? false,
      answerDowngradedToCaution: debug.answerDowngradedToCaution ?? false,
      downgradeReasons: debug.downgradeReasons ?? [],
      primarySupportForcedByExactAnchor: debug.primarySupportForcedByExactAnchor ?? false,
      primarySupportAnchorUsed: debug.primarySupportAnchorUsed ?? "",
      xDayScenario: debug.xDayScenario ?? false,
      xDayAnchorFound: debug.xDayAnchorFound ?? false,
      governingSectionIncludesXDay: debug.governingSectionIncludesXDay ?? false,
      shortCallDutyScenario: debug.shortCallDutyScenario ?? false,
      shortCallDutyAnchorFound: debug.shortCallDutyAnchorFound ?? false,
      governingSectionIncludesDutyLegality: debug.governingSectionIncludesDutyLegality ?? false,
      visibleSupportAnchorPromoted: debug.visibleSupportAnchorPromoted,
      visibleSupportOriginalSection: debug.visibleSupportOriginalSection ?? [],
      visibleSupportPromotedSection: debug.visibleSupportPromotedSection ?? [],
      finalVisibleSupportSections: debug.finalVisibleSupportSections ?? [],
      finalVisibleSupportPromotionApplied: debug.finalVisibleSupportPromotionApplied,
      retrievedSnippets: debug.retrievedSnippets ?? [],
      sourcesUsed: actualSources,
      redFlags: redFlagResult.redFlags,
      redFlagSeverity: redFlagResult.severity,
      missingMustInclude,
      foundMustNotInclude,
      clarificationAsked,
      supportDiagnostics: supportScores.diagnostics,
    },
  };
}

const results = [];
for (const test of contractCopilotQATestBank) {
  const req = new Request("http://local.test/api/ai/contract-copilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: test.question, session: { facts: {}, clarificationCount: 0 } }),
  });
  const res = await handleContractCopilotRoute(req);
  const payload = await res.json();
  results.push(scoreTest(test, payload));
}

process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), supportOnlyMode, results }));
`;

const child = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--input-type=module", "--eval", childScript],
  {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      ...loadDotEnvLocal(join(cwd, ".env.local")),
    },
  },
);

if (child.status !== 0) {
  process.stderr.write(child.stderr || child.stdout || "Contract Copilot QA child process failed.\n");
  process.exit(child.status ?? 1);
}

const report = JSON.parse(child.stdout);
const results = report.results;

const summary = {
  PASS: results.filter((item) => item.finalScore === "PASS").length,
  WARN: results.filter((item) => item.finalScore === "WARN").length,
  FAIL: results.filter((item) => item.finalScore === "FAIL").length,
  CRITICAL_FAIL: results.filter((item) => item.finalScore === "CRITICAL_FAIL").length,
};

const supportSummary = {
  PASS: results.filter((item) => item.supportFinalScore === "PASS").length,
  WARN: results.filter((item) => item.supportFinalScore === "WARN").length,
  FAIL: results.filter((item) => item.supportFinalScore === "FAIL").length,
};

writeFileSync(
  jsonReportPath,
  JSON.stringify(
    {
      generatedAt: report.generatedAt,
      supportOnlyMode,
      summary,
      supportSummary,
      results,
    },
    null,
    2,
  ),
);

const failedTests = results.filter((item) => item.finalScore === "FAIL" || item.finalScore === "CRITICAL_FAIL");
const supportFailedTests = results.filter((item) => item.supportFinalScore === "FAIL");

function groupCount(items, labeler) {
  const map = new Map();
  for (const item of items) {
    const labels = labeler(item) ?? [];
    for (const label of labels) {
      map.set(label, (map.get(label) ?? 0) + 1);
    }
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

const missingAnchorGroups = groupCount(supportFailedTests, (item) =>
  (item.actual.supportDiagnostics?.missingAnchors ?? []).map((anchor) =>
    [anchor.source, anchor.section ?? "", ...(anchor.terms ?? [])].filter(Boolean).join(" | ")
  )
);
const wrongPrimaryGroups = groupCount(supportFailedTests, (item) =>
  item.actual.supportDiagnostics?.wrongPrimary ? [String(item.actual.supportDiagnostics.wrongPrimary)] : []
);
const topMissingTermsSections = missingAnchorGroups.slice(0, 10);
const answerPassedButSupportFailed = results.filter((item) => item.actual.supportDiagnostics?.answerPassedButSupportFailed);

const markdown = [
  "# Contract Copilot QA Report",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Answer QA Summary",
  "",
  `- PASS: ${summary.PASS}`,
  `- WARN: ${summary.WARN}`,
  `- FAIL: ${summary.FAIL}`,
  `- CRITICAL_FAIL: ${summary.CRITICAL_FAIL}`,
  "",
  "## Support QA Summary",
  "",
  `- PASS: ${supportSummary.PASS}`,
  `- WARN: ${supportSummary.WARN}`,
  `- FAIL: ${supportSummary.FAIL}`,
  "",
  "## Per-Test Results",
  "",
  "| ID | Answer Score | Support Score | Lane | AI | Sources |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results.map(
    (item) =>
      `| ${item.id} | ${item.finalScore} | ${item.supportFinalScore} | ${item.actual.selectedLane ?? "n/a"} | ${String(item.actual.aiSynthesisUsed)} | ${(item.actual.sourcesUsed ?? []).join(", ") || "none"} |`,
  ),
  "",
  "## Support Failures Grouped By Missing Anchor",
  "",
  ...(missingAnchorGroups.length === 0
    ? ["- None"]
    : missingAnchorGroups.map(([label, count]) => `- ${label}: ${count}`)),
  "",
  "## Support Failures Grouped By Wrong Primary Section",
  "",
  ...(wrongPrimaryGroups.length === 0
    ? ["- None"]
    : wrongPrimaryGroups.map(([label, count]) => `- ${label}: ${count}`)),
  "",
  "## Top 10 Missing Terms/Sections",
  "",
  ...(topMissingTermsSections.length === 0
    ? ["- None"]
    : topMissingTermsSections.map(([label, count]) => `- ${label}: ${count}`)),
  "",
  "## Tests Where Answer Passed But Support Failed",
  "",
  ...(answerPassedButSupportFailed.length === 0
    ? ["- None"]
    : answerPassedButSupportFailed.map((item) => `- ${item.id}: ${item.question}`)),
  "",
  "## Failed Answer Tests",
  "",
  ...(failedTests.length === 0
    ? ["- None"]
    : failedTests.map(
        (item) =>
          `- ${item.id}: ${item.question}\n  - Score: ${item.finalScore}\n  - Lane: ${item.actual.selectedLane ?? "n/a"}\n  - Red flags: ${(item.actual.redFlags ?? []).join(", ") || "none"}`,
      )),
  "",
  "## Support-Failed Tests",
  "",
  ...(supportFailedTests.length === 0
    ? ["- None"]
    : supportFailedTests.map(
        (item) =>
          `- ${item.id}: ${item.question}\n  - Support score: ${item.supportFinalScore}\n  - Support checks: ${Object.entries(item.supportChecks).map(([k, v]) => `${k}=${v ?? "n/a"}`).join(", ")}\n  - Missing anchors: ${(item.actual.supportDiagnostics?.missingAnchors ?? []).map((anchor) => [anchor.source, anchor.section ?? "", ...(anchor.terms ?? [])].filter(Boolean).join(" | ")).join("; ") || "none"}\n  - Wrong primary: ${item.actual.supportDiagnostics?.wrongPrimary ?? "none"}`,
      )),
].join("\n");

writeFileSync(mdReportPath, markdown);

const answerHeading = supportOnlyMode ? "Contract Support QA Summary" : "Contract Copilot QA Summary";
console.log(answerHeading);
if (!supportOnlyMode) {
  console.log(`PASS: ${summary.PASS}`);
  console.log(`WARN: ${summary.WARN}`);
  console.log(`FAIL: ${summary.FAIL}`);
  console.log(`CRITICAL_FAIL: ${summary.CRITICAL_FAIL}`);
}
console.log("Support summary:");
console.log(`PASS: ${supportSummary.PASS}`);
console.log(`WARN: ${supportSummary.WARN}`);
console.log(`FAIL: ${supportSummary.FAIL}`);
if (!supportOnlyMode && failedTests.length > 0) {
  console.log("Failed tests:");
  for (const item of failedTests) {
    console.log(`- ${item.id}: ${item.finalScore} :: ${item.question}`);
  }
}
if (supportFailedTests.length > 0) {
  console.log("Support-failed tests:");
  for (const item of supportFailedTests.slice(0, 20)) {
    console.log(`- ${item.id}: ${item.supportFinalScore} :: ${item.question}`);
  }
}
console.log(`JSON report: ${jsonReportPath}`);
console.log(`Markdown report: ${mdReportPath}`);
