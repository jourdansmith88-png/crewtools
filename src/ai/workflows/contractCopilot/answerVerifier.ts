import type { ContractAnswerCard } from "../../../types/contractCopilot.ts";
import type { ContractCopilotSelectedLane } from "./intentRouter.ts";

export type ContractCopilotAnswerVerifierInput = {
  question: string;
  selectedLane: ContractCopilotSelectedLane | string;
  answer: ContractAnswerCard;
  hasPwaIndex: boolean;
  hasCompensationIndex: boolean;
  hasSchedulerIndex: boolean;
  sourcesUsed: string[];
  pwaSectionsUsed: string[];
  compensationChunksUsed: string[];
  schedulerChunksUsed: string[];
  missingSourceWarnings: string[];
};

export type ContractCopilotAnswerVerifierResult = {
  verifierRan: true;
  verifierPassed: boolean;
  verifierWarnings: string[];
  verifierFailureReasons: string[];
  verifierAdjustedAnswer: boolean;
  truthGuardRan: boolean;
  strongClaimsDetected: string[];
  strongClaimsSupported: string[];
  strongClaimsDowngraded: string[];
  definitionSectionUsed: boolean;
  operationalSectionUsed: boolean;
  definitionOverrodeOperation: boolean;
  definitionBasedAnswer: boolean;
  applicationClaimDetected: boolean;
  applicationClaimSupported: boolean;
  applicationClaimDowngraded: boolean;
  answer: ContractAnswerCard;
};

function normalizeText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function compactSourceSummary(args: {
  pwaSectionsUsed: string[];
  compensationChunksUsed: string[];
  schedulerChunksUsed: string[];
}) {
  const parts = [
    args.pwaSectionsUsed.length > 0 ? `PWA: ${args.pwaSectionsUsed.slice(0, 2).join(", ")}` : null,
    args.compensationChunksUsed.length > 0
      ? `Compensation Manual: ${args.compensationChunksUsed.slice(0, 2).join(", ")}`
      : null,
    args.schedulerChunksUsed.length > 0 ? `Scheduler Manual: ${args.schedulerChunksUsed.slice(0, 2).join(", ")}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : "No indexed source packet was attached.";
}

function buildQuestionFamilySignals(question: string) {
  const lower = normalizeText(question);
  return {
    sickGs:
      (lower.includes("sick") || lower.includes("called in sick")) &&
      (lower.includes("greenslip") || lower.includes("green slip") || /\bgs\b/.test(lower) || lower.includes("pickup")),
    reroute:
      lower.includes("reroute") || lower.includes("deadhead") || lower.includes("before report") || lower.includes("after report"),
    apd: /\bapd\b/.test(lower) || lower.includes("authorized personal drop"),
    operationalApplication:
      /\b(assigned|assignment|report|timing|before|after|day one|pay|credit|reserve|lc|long call|short call|wocl|reroute)\b/i.test(
        question
      ),
  };
}

function buildAnswerFamilySignals(answer: ContractAnswerCard) {
  const haystack = normalizeText(
    [
      answer.shortAnswer,
      answer.plainEnglishExplanation,
      ...(answer.scenarioBreakdown ?? []),
      ...(answer.payBreakdown ?? []),
    ].join(" "),
  );

  return {
    sickGs:
      (haystack.includes("sick") || haystack.includes("replenish")) &&
      (haystack.includes("greenslip") || /\bgs\b/.test(haystack) || haystack.includes("green slip")),
    reroute: haystack.includes("reroute") || haystack.includes("deadhead") || haystack.includes("report"),
    apd: haystack.includes("apd") || haystack.includes("authorized personal drop") || haystack.includes("reserve threshold"),
  };
}

function makeCautiousShortAnswer(shortAnswer: string) {
  const trimmed = shortAnswer.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("based on the source support i found") ||
    lower.startsWith("from the source support i found") ||
    lower.startsWith("if ") ||
    lower.startsWith("because ")
  ) {
    return trimmed;
  }
  return `Based on the source support I found, ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

function hasStructuredScenarioFallback(explanation: string | undefined) {
  const text = explanation ?? "";
  return (
    (
      text.includes("What controls:") &&
      text.includes("How it likely applies here:") &&
      text.includes("What I can't confirm from available sources:") &&
      text.includes("Sources used:")
    ) ||
    (
      text.includes("What this depends on:") &&
      text.includes("Likely paths:") &&
      text.includes("What to check:") &&
      text.includes("Source limitation:")
    )
  );
}

function hasDecisionPathFallback(explanation: string | undefined) {
  const text = explanation ?? "";
  return (
    text.includes("What this depends on:") &&
    text.includes("Likely paths:") &&
    text.includes("What to check:") &&
    text.includes("Source limitation:")
  );
}

function normalizeSection(value: string | undefined) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function isDefinitionReference(reference: ContractAnswerCard["references"][number]) {
  const section = normalizeText(reference.section);
  const combined = normalizeText(`${reference.section} ${reference.label} ${reference.quoteSnippet}`);
  return (
    section.startsWith("section 2") ||
    /\b(glossary|definition|defined as| means )\b/.test(combined)
  );
}

function isOperationalReference(reference: ContractAnswerCard["references"][number]) {
  const section = normalizeText(reference.section);
  return (
    section.startsWith("section 23") ||
    section.startsWith("section 12") ||
    section.startsWith("section 4") ||
    section.startsWith("section 8") ||
    section.startsWith("section 14") ||
    reference.sourceId === "compensation_manual" ||
    reference.sourceId === "scheduler_manual"
  );
}

function answerMakesOperationalClaim(answer: ContractAnswerCard) {
  const haystack = normalizeText(
    [answer.shortAnswer, answer.plainEnglishExplanation, ...(answer.scenarioBreakdown ?? [])].join(" ")
  );
  return /\b(assigned|assignment|report|timing|before|after|day one|pay|credit|reserve|lc|long call|short call|wocl)\b/.test(
    haystack
  );
}

function extractSections(text: string | undefined) {
  const matches =
    text?.match(
      /\bsection\s+\d{1,2}(?:\s*[a-z](?:\.?\d+)?)?(?:\.\d+)?(?:\.[a-z])?|\b\d{1,2}\s*[a-z](?:\.?\d+)?\b|§\s*\d{1,2}(?:\s*[a-z](?:\.?\d+)?)?/gi
    ) ?? [];
  return Array.from(
    new Set(
      matches.map((item) =>
        item
          .replace(/^§\s*/i, "Section ")
          .replace(/\s+/g, " ")
          .replace(/(\d{1,2})([A-Z])/i, "$1 $2")
          .replace(/([A-Z])(\d+)/i, "$1.$2")
          .trim()
          .toUpperCase()
      )
    )
  );
}

const TRUTH_GUARD_TERMS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "wocl", patterns: [/\bwocl\b/i] },
  { key: "golden day", patterns: [/\bgolden day\b/i] },
  { key: "hard non-fly day", patterns: [/\bhard non-fly day\b/i] },
  { key: "short call", patterns: [/\bshort call\b/i] },
  { key: "qs", patterns: [/\bqs\b/i, /\bquick slip\b/i] },
  { key: "no op", patterns: [/\bno op\b/i, /\bnoop\b/i] },
  { key: "silver slip", patterns: [/\bsilver slip\b/i] },
  { key: "harmed pilot", patterns: [/\bharmed pilot\b/i] },
  { key: "auto accept", patterns: [/\bauto accept\b/i, /\bauto-accept\b/i] },
  { key: "x-day", patterns: [/\bx-?day\b/i, /\bx days?\b/i] },
  { key: "reroute", patterns: [/\breroute\b/i, /\brerouted\b/i] },
  { key: "pb", patterns: [/\bpb\b/i, /\bpayback\b/i] },
  { key: "lc", patterns: [/\blc\b/i, /\blong call\b/i] },
  { key: "8d3", patterns: [/\b8d3\b/i, /\b8 d\.?3\b/i] },
  { key: "23m7", patterns: [/\b23m7\b/i, /\b23 m\.?7\b/i] },
  { key: "23.i.10", patterns: [/\b23\.?i\.?10\b/i, /\b23 i\.?10\b/i] },
  { key: "apd", patterns: [/\bapd\b/i, /authorized personal drop/i] },
  { key: "assignment", patterns: [/\bassign(?:ed|ment|ments)?\b/i] },
];

function extractConceptTerms(text: string | undefined) {
  return TRUTH_GUARD_TERMS.filter((entry) => entry.patterns.some((pattern) => pattern.test(text ?? ""))).map((entry) => entry.key);
}

function getTruthGuardPassages(answer: ContractAnswerCard) {
  const explanationLines = String(answer.plainEnglishExplanation ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      return (
        !lower.startsWith("what controls:") &&
        !lower.startsWith("sources used:") &&
        !lower.startsWith("what i can't confirm from available sources:")
      );
    });

  return [
    answer.shortAnswer,
    ...explanationLines,
    ...(answer.scenarioBreakdown ?? []),
    ...(answer.payBreakdown ?? []),
  ].filter(Boolean);
}

function findStrongClaims(answer: ContractAnswerCard) {
  const passages = getTruthGuardPassages(answer)
    .filter(Boolean)
    .flatMap((text) => String(text).split(/(?<=[.!?])\s+/));
  const strongPattern =
    /\b(cannot|can't|must|always|never|no assignments allowed|no flying allowed|not allowed|will not|required to)\b/i;

  return passages
    .map((sentence) => sentence.trim())
    .filter((sentence) => strongPattern.test(sentence))
    .map((sentence) => ({
      text: sentence,
      sections: extractSections(sentence),
      terms: extractConceptTerms(sentence),
    }));
}

function sentenceHasSupport(sentence: { text: string; sections: string[]; terms: string[] }, references: ContractAnswerCard["references"]) {
  const supportedBy = references.find((reference) => {
    const combined = normalizeText(`${reference.section} ${reference.label} ${reference.quoteSnippet}`);
    const sectionSupported =
      sentence.sections.length === 0 ||
      sentence.sections.some((section) => {
        const normalized = normalizeSection(section);
        const refNorm = normalizeSection(reference.section);
        return refNorm.includes(normalized) || normalized.includes(refNorm);
      });
    const conceptSupported =
      sentence.terms.length > 0 &&
      sentence.terms.some((term) => combined.includes(term));
    return sectionSupported && conceptSupported;
  });
  return supportedBy;
}

function downgradeStrongClaimText(text: string) {
  return text
    .replace(/\bno assignments allowed\b/gi, "it likely limits assignments")
    .replace(/\bcannot\b/gi, "likely cannot")
    .replace(/\bcan't\b/gi, "likely cannot")
    .replace(/\bmust\b/gi, "likely must")
    .replace(/\balways\b/gi, "typically")
    .replace(/\bnever\b/gi, "typically does not")
    .replace(/\bwill not\b/gi, "likely will not")
    .replace(/\bnot allowed\b/gi, "not clearly allowed")
    .replace(/\brequired to\b/gi, "generally required to");
}

function appendUniqueLine(text: string | undefined, line: string) {
  const base = String(text ?? "").trim();
  if (!line.trim()) return base;
  if (base.toLowerCase().includes(line.trim().toLowerCase())) {
    return base;
  }
  return base.length > 0 ? `${base}\n${line}` : line;
}

function collectDecisionDependencies(question: string, answer: ContractAnswerCard) {
  const haystack = normalizeText(
    [question, answer.shortAnswer, answer.plainEnglishExplanation, ...(answer.scenarioBreakdown ?? [])].join(" ")
  );
  const dependencies: string[] = [];
  const push = (value: string) => {
    if (!dependencies.includes(value)) dependencies.push(value);
  };

  if (/\blc\b|\blong call\b/.test(haystack)) {
    push("whether this is a new Long Call period or a continuation of an earlier status");
  }
  if (/\bgolden day\b|\bhard non-fly day\b/.test(haystack)) {
    push("whether the Golden Day definition is tied to a separate operational timing rule");
  }
  if (/\bshort call\b/.test(haystack)) {
    push("whether the short-call window and the later trip report can legally coexist");
  }
  if (/\bwocl\b|\b8d3\b|\b8 d\.?3\b/.test(haystack)) {
    push("whether WOCL or Section 8 D.3 timing controls this duty sequence");
  }
  if (/\bsick\b/.test(haystack) && /\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack)) {
    push("whether the premium trip overlaps the sick day or starts after the sick period ends");
  }
  if (/\breroute\b|\bdeadhead\b|\bcontinuation\b/.test(haystack)) {
    push("whether the event was processed as a reroute, continuation, reassignment, or new award");
  }
  if (/\bsilver slip\b|\bss\b/.test(haystack) && (/\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack) || /\bsimilar to\b|\bvs\b|\bthreshold\b/.test(haystack))) {
    push("whether Silver Slip has its own premium mechanism or the packet is only giving Green Slip trigger language");
    push("how the assignment was awarded and whether any overlap or conflict changes the premium result");
  }
  if (/\breserve\b|\blong call\b|\bshort call\b|\bairport standby\b/.test(haystack)) {
    push("your reserve status and which assignment window the company says you were in");
  }
  if (/\bcpo\b|\bknown absence\b|\breserve coverage\b|\bswap with pot\b|\bcapped reserve\b/.test(haystack)) {
    push("whether the system is blocking the transaction for coverage or known-absence reasons");
  }
  if (/\bcourt\b|\bcustody hearing\b|\bnotice to appear\b|\bleave\b/.test(haystack)) {
    push("whether the event fits a known-absence or leave path under the available packet");
  }
  if (dependencies.length === 0) {
    push("how the company processed the event in iCrew or DBMS");
    push("the exact timing of report, release, and any later change notice");
  }

  return dependencies.slice(0, 4);
}

function collectLikelyPaths(question: string, answer: ContractAnswerCard, hasOperationalSupport: boolean) {
  const haystack = normalizeText(
    [question, answer.shortAnswer, answer.plainEnglishExplanation, ...(answer.scenarioBreakdown ?? [])].join(" ")
  );
  const paths: string[] = [];
  const push = (value: string) => {
    if (!paths.includes(value)) paths.push(value);
  };

  if (/\blc\b|\blong call\b/.test(haystack) && /\bgolden day\b|\bhard non-fly day\b/.test(haystack)) {
    push("If Long Call starts as a new operational period, the Long Call / reserve rule set may control timing more than the definition alone.");
    push("If the company is treating this as a continuation that touches the Golden Day itself, the hard non-fly-day definition may matter more.");
  }
  if (/\bshort call\b/.test(haystack) && /\breport\b/.test(haystack)) {
    push("If the short-call block and the trip report create one continuous duty problem, the legality analysis may change.");
    push("If the company treats them as separate legal events, the scheduling answer may be different.");
  }
  if (/\bsick\b/.test(haystack) && /\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack)) {
    push("If the Green Slip overlaps the sick day, the overlap day may follow a different pay/credit path than the later days.");
    push("If the premium trip starts only after the sick period ends, the later days are more likely to follow normal premium-trip treatment.");
  }
  if (/\breroute\b|\bdeadhead\b|\bcontinuation\b/.test(haystack)) {
    push("If this was processed as a reroute or continuation, the original trip protections may matter more than a brand-new award analysis.");
    push("If the system treated it as a new assignment or award, a different pay or reserve path may control.");
  }
  if (/\bsilver slip\b|\bss\b/.test(haystack) && (/\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack) || /\bthreshold\b|\bvs\b|\bsimilar to\b/.test(haystack))) {
    push("If Silver Slip has its own premium language, you do not have to satisfy the Green Slip trigger just to get Silver Slip premium.");
    push("If the packet is clearer on Green Slip than on Silver Slip, use Green Slip only as comparison support rather than proof that both slips behave the same way.");
    push("If the Silver Slip overlaps or conflicts with another premium event, the final pay treatment may still change.");
  }
  if (paths.length === 0) {
    push("If the operational section directly addresses this timing or pay fact pattern, that operational rule controls.");
    push(
      hasOperationalSupport
        ? "If the available support only covers part of the sequence, the answer stays conditional until the missing step is grounded."
        : "If the available support is mostly definitional, it explains the term but does not settle timing, pay, or assignment treatment by itself."
    );
  }

  return paths.slice(0, 3);
}

function collectWhatToCheck(question: string, answer: ContractAnswerCard) {
  const haystack = normalizeText(
    [question, answer.shortAnswer, answer.plainEnglishExplanation, ...(answer.scenarioBreakdown ?? [])].join(" ")
  );
  const checks: string[] = [];
  const push = (value: string) => {
    if (!checks.includes(value)) checks.push(value);
  };

  push("the award or processing code shown in iCrew / DBMS");
  push("whether the system labels this as continuation, reroute, reassignment, or a new award");

  if (/\breport\b|\brelease\b|\bafter report\b|\bbefore report\b|\bwocl\b|\b8d3\b/.test(haystack)) {
    push("the exact report, release, and change-notification timestamps");
  }
  if (/\bpb\b|\bpr\b|\blc\b|\bx-?day\b/.test(haystack)) {
    push("the reserve or payback status shown on the affected calendar days");
  }
  if (/\bdart\b|\bnotification\b|\barcos\b/.test(haystack)) {
    push("any DART, ARCOS, or scheduler note that shows how the event was processed");
  }
  if (/\bsilver slip\b|\bss\b/.test(haystack) && (/\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack) || /\bthreshold\b|\bvs\b|\bsimilar to\b/.test(haystack))) {
    push("whether the award shows Silver Slip versus Green Slip, and what premium code attached to it");
    push("whether any overlap or conflict with another premium event changed the pay result");
  }
  if (/\bcourt\b|\bnotice to appear\b|\bknown absence\b|\bleave\b/.test(haystack)) {
    push("what documentation Scheduling or CPO asked for, and whether they coded it as known absence or leave");
  }

  return checks.slice(0, 4);
}

function buildDecisionPathExplanation(args: {
  question: string;
  answer: ContractAnswerCard;
  warnings: string[];
  failureReasons: string[];
  pwaSectionsUsed: string[];
  compensationChunksUsed: string[];
  schedulerChunksUsed: string[];
  hasOperationalSupport: boolean;
}) {
  const dependencies = collectDecisionDependencies(args.question, args.answer);
  const likelyPaths = collectLikelyPaths(args.question, args.answer, args.hasOperationalSupport);
  const whatToCheck = collectWhatToCheck(args.question, args.answer);
  const sourceSummary = compactSourceSummary({
    pwaSectionsUsed: args.pwaSectionsUsed,
    compensationChunksUsed: args.compensationChunksUsed,
    schedulerChunksUsed: args.schedulerChunksUsed,
  });
  const limitation =
    args.failureReasons[0] ??
    args.warnings[0] ??
    "I do not have the full governing packet attached for the final operational step in this scenario.";

  return [
    "What this depends on:",
    ...dependencies.map((item) => `- ${item}`),
    "Likely paths:",
    ...likelyPaths.map((item) => `- ${item}`),
    "What to check:",
    ...whatToCheck.map((item) => `- ${item}`),
    `Source limitation: ${limitation}`,
    `Sources used: ${sourceSummary}.`,
  ].join("\n");
}

function buildSaferFallbackAnswer(args: ContractCopilotAnswerVerifierInput & {
  warnings: string[];
  failureReasons: string[];
}) {
  return {
    ...args.answer,
    status: "insufficient_support" as const,
    answerCompleteness: "provisional" as const,
    confidence: "low" as const,
    shortAnswer: "I found related source support, but not enough grounded scenario support to answer this cleanly yet.",
    plainEnglishExplanation: buildDecisionPathExplanation({
      question: args.question,
      answer: args.answer,
      warnings: args.warnings,
      failureReasons: args.failureReasons,
      pwaSectionsUsed: args.pwaSectionsUsed,
      compensationChunksUsed: args.compensationChunksUsed,
      schedulerChunksUsed: args.schedulerChunksUsed,
      hasOperationalSupport:
        args.answer.references.some(isOperationalReference) ||
        args.pwaSectionsUsed.some((section) => /^section\s+(23|12|4|8|14)\b/i.test(section)),
    }),
    assumptions: Array.from(
      new Set([...(args.answer.assumptions ?? []), "Scenario answer verifier downgraded this answer to avoid overclaiming."]),
    ),
  };
}

export function verifyContractScenarioAnswer(
  input: ContractCopilotAnswerVerifierInput,
): ContractCopilotAnswerVerifierResult {
  const warnings = [...input.missingSourceWarnings];
  const failureReasons: string[] = [];
  const strongClaims = findStrongClaims(input.answer);
  const strongClaimsSupported: string[] = [];
  const strongClaimsDowngraded: string[] = [];
  const questionSignals = buildQuestionFamilySignals(input.question);
  const answerSignals = buildAnswerFamilySignals(input.answer);
  const definitionSectionUsed = input.answer.references.some(isDefinitionReference);
  const operationalSectionUsed = input.answer.references.some(isOperationalReference);
  let definitionOverrodeOperation = false;
  const definitionBasedAnswer = definitionSectionUsed;
  const applicationClaimDetected = answerMakesOperationalClaim(input.answer);
  let applicationClaimSupported = operationalSectionUsed;
  let applicationClaimDowngraded = false;
  let adjustedAnswer = input.answer;
  let verifierAdjustedAnswer = false;

  if (input.selectedLane !== "contract_scenario_retrieval") {
    failureReasons.push("Selected lane changed after scenario retrieval.");
  }

  if (
    input.hasPwaIndex &&
    input.pwaSectionsUsed.length === 0 &&
    !input.answer.references.some((reference) => reference.sourceId === "pwa")
  ) {
    failureReasons.push("PWA is indexed, but the answer is not grounded in retrievable PWA support.");
  }

  const compensationRelevant = /(pay|credit|guarantee|bank|replenish)/i.test(input.question);
  if (
    compensationRelevant &&
    input.hasCompensationIndex &&
    input.compensationChunksUsed.length === 0 &&
    !input.answer.references.some((reference) => reference.sourceId === "compensation_manual")
  ) {
    warnings.push("Compensation Manual support is available but was not attached to this pay/credit-sensitive answer.");
  }

  const schedulerRelevant = /(reroute|deadhead|report|processing|assignment|apd)/i.test(input.question);
  if (
    schedulerRelevant &&
    input.hasSchedulerIndex &&
    input.schedulerChunksUsed.length === 0 &&
    !input.answer.references.some((reference) => reference.sourceId === "scheduler_manual")
  ) {
    warnings.push("Scheduler Manual support is available but was not attached to this processing-sensitive answer.");
  }

  if (questionSignals.sickGs && (answerSignals.apd || answerSignals.reroute) && !answerSignals.sickGs) {
    failureReasons.push("Answer drifted away from the sick plus Greenslip scenario.");
  }
  if (questionSignals.reroute && (answerSignals.apd || answerSignals.sickGs) && !answerSignals.reroute) {
    failureReasons.push("Answer drifted away from the reroute scenario.");
  }
  if (questionSignals.apd && (answerSignals.reroute || answerSignals.sickGs) && !answerSignals.apd) {
    failureReasons.push("Answer drifted away from the APD scenario.");
  }

  const definitionOnlyOperationalRisk =
    definitionSectionUsed &&
    !operationalSectionUsed &&
    questionSignals.operationalApplication &&
    answerMakesOperationalClaim(input.answer);

  if (definitionOnlyOperationalRisk) {
    definitionOverrodeOperation = true;
    applicationClaimSupported = false;
    applicationClaimDowngraded = true;
    warnings.push("Definition support is present, but this definition alone does not control assignment timing, pay, or other operational treatment.");
    const cautionLine =
      "This definition alone does not control assignment timing, pay, or other operational treatment.";
    const maybeUpdatedExplanation = hasDecisionPathFallback(input.answer.plainEnglishExplanation)
      ? appendUniqueLine(input.answer.plainEnglishExplanation, cautionLine)
      : appendUniqueLine(
          buildDecisionPathExplanation({
            question: input.question,
            answer: input.answer,
            warnings,
            failureReasons,
            pwaSectionsUsed: input.pwaSectionsUsed,
            compensationChunksUsed: input.compensationChunksUsed,
            schedulerChunksUsed: input.schedulerChunksUsed,
            hasOperationalSupport: operationalSectionUsed,
          }),
          cautionLine
        );

    adjustedAnswer = {
      ...adjustedAnswer,
      shortAnswer: makeCautiousShortAnswer(
        adjustedAnswer.shortAnswer.replace(/\b(cannot|can't|must|always|never|will not)\b/gi, (match) => {
          const lower = match.toLowerCase();
          if (lower === "cannot" || lower === "can't") return "likely cannot";
          if (lower === "must") return "likely must";
          if (lower === "always") return "typically";
          if (lower === "never") return "typically does not";
          if (lower === "will not") return "likely will not";
          return match;
        })
      ),
      plainEnglishExplanation: maybeUpdatedExplanation,
      confidence: "low",
      supportLevel:
        adjustedAnswer.supportLevel === "contract_backed" || adjustedAnswer.supportLevel === "manual_backed"
          ? "mixed"
          : adjustedAnswer.supportLevel,
      caveats: Array.from(
        new Set([...(adjustedAnswer.caveats ?? []), cautionLine])
      ),
    };
    verifierAdjustedAnswer = true;
  }

  if (failureReasons.length > 0) {
    adjustedAnswer = buildSaferFallbackAnswer({
      ...input,
      warnings,
      failureReasons,
    });
    verifierAdjustedAnswer = true;
  } else if (warnings.length > 0 || input.answer.confidence === "low") {
    const shouldRewriteToDecisionPath =
      input.answer.answerCompleteness === "provisional" ||
      input.answer.status === "insufficient_support" ||
      !hasDecisionPathFallback(input.answer.plainEnglishExplanation);
    adjustedAnswer = {
      ...input.answer,
      shortAnswer: makeCautiousShortAnswer(input.answer.shortAnswer),
      plainEnglishExplanation:
        !shouldRewriteToDecisionPath
          ? input.answer.plainEnglishExplanation
          : buildDecisionPathExplanation({
              question: input.question,
              answer: input.answer,
              warnings,
              failureReasons,
              pwaSectionsUsed: input.pwaSectionsUsed,
              compensationChunksUsed: input.compensationChunksUsed,
              schedulerChunksUsed: input.schedulerChunksUsed,
              hasOperationalSupport: operationalSectionUsed,
            }),
    };
    verifierAdjustedAnswer = adjustedAnswer.shortAnswer !== input.answer.shortAnswer;
  }

  if (failureReasons.length === 0 && strongClaims.length > 0) {
    for (const claim of strongClaims) {
      if (sentenceHasSupport(claim, adjustedAnswer.references)) {
        strongClaimsSupported.push(claim.text);
        continue;
      }
      strongClaimsDowngraded.push(claim.text);
    }

    if (strongClaimsDowngraded.length > 0) {
      adjustedAnswer = {
        ...adjustedAnswer,
        shortAnswer: downgradeStrongClaimText(adjustedAnswer.shortAnswer),
        plainEnglishExplanation: downgradeStrongClaimText(adjustedAnswer.plainEnglishExplanation),
        confidence: "low",
        supportLevel:
          adjustedAnswer.supportLevel === "contract_backed" || adjustedAnswer.supportLevel === "manual_backed"
            ? "mixed"
            : adjustedAnswer.supportLevel,
        caveats: Array.from(
          new Set([
            ...(adjustedAnswer.caveats ?? []),
            "Truth guard downgraded unsupported strong claim(s).",
          ]),
        ),
      };
      verifierAdjustedAnswer = true;
      warnings.push("Strong claim language was downgraded because the attached support did not explicitly ground it.");
    }
  }

  return {
    verifierRan: true,
    verifierPassed: failureReasons.length === 0,
    verifierWarnings: Array.from(new Set(warnings)),
    verifierFailureReasons: Array.from(new Set(failureReasons)),
    verifierAdjustedAnswer,
    truthGuardRan: true,
    strongClaimsDetected: strongClaims.map((claim) => claim.text),
    strongClaimsSupported: Array.from(new Set(strongClaimsSupported)),
    strongClaimsDowngraded: Array.from(new Set(strongClaimsDowngraded)),
    definitionSectionUsed,
    operationalSectionUsed,
    definitionOverrodeOperation,
    definitionBasedAnswer,
    applicationClaimDetected,
    applicationClaimSupported,
    applicationClaimDowngraded,
    answer: adjustedAnswer,
  };
}
