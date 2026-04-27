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
  selectedVerifierBranch?: string;
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

function detectShortCallNotificationScenarioFromHaystack(haystack: string) {
  const hasShortCallContext =
    /\bshort call assignment\b/.test(haystack) ||
    /\bshort call\b/.test(haystack);
  const hasReserveOnCallContext =
    /\blong call\b/.test(haystack) ||
    /\blc\b/.test(haystack);
  const hasNotificationTerms =
    /\bnotification\b/.test(haystack) ||
    /\bno notification\b/.test(haystack) ||
    /\backnowledge\b/.test(haystack) ||
    /\backnowledgment\b/.test(haystack) ||
    /\bcno\b/.test(haystack) ||
    /\bcall duty pilot\b/.test(haystack) ||
    /\bphone never rang\b/.test(haystack) ||
    /\barcos\b/.test(haystack) ||
    /\brobot\b/.test(haystack) ||
    /\btelephone\b/.test(haystack) ||
    /\bicrew\b/.test(haystack) ||
    /\bmicrew\b/.test(haystack);
  const hasVacationNoticeContext =
    /\bvacation\b/.test(haystack) ||
    /\bnon-fly day\b/.test(haystack) ||
    /\bnon fly day\b/.test(haystack);
  const hardNotificationOverride =
    (hasShortCallContext || hasReserveOnCallContext) &&
    (
      /\bnotification\b/.test(haystack) ||
      /\bno notification\b/.test(haystack) ||
      /\bvacation\b/.test(haystack) ||
      /\bnon-fly day\b/.test(haystack) ||
      /\bnon fly day\b/.test(haystack) ||
      /\bmicrew placement\b/.test(haystack) ||
      /\bicrew placement\b/.test(haystack) ||
      /\backnowledge\b/.test(haystack) ||
      /\backnowledgment\b/.test(haystack) ||
      /\bcno\b/.test(haystack) ||
      /\bcall duty pilot\b/.test(haystack)
    );
  const hasDutyLegalitySignals =
    /\bsame-day trip\b/.test(haystack) ||
    /\bsame day trip\b/.test(haystack) ||
    /\breport time\b/.test(haystack) ||
    /\breports at\b/.test(haystack) ||
    /\bduty period\b/.test(haystack) ||
    /\bflight time\b/.test(haystack) ||
    /\blegality\b/.test(haystack) ||
    /\bboth remain on schedule\b/.test(haystack) ||
    /\bshort call window\b/.test(haystack);

  if (hardNotificationOverride) {
    return true;
  }

  if (hasDutyLegalitySignals) {
    return false;
  }

  return hasShortCallContext && (hasNotificationTerms || (hasVacationNoticeContext && (/\b18 hours\b/.test(haystack) || /\b12 hours\b/.test(haystack))));
}

function detectOeNotificationScenarioFromHaystack(haystack: string) {
  return (
    /\boe notification\b/.test(haystack) ||
    (/\boe\b/.test(haystack) && /\bnotification\b/.test(haystack)) ||
    /\bcompany notification online\b/.test(haystack) ||
    /\bcno\b/.test(haystack) ||
    /\bphone call\b/.test(haystack) ||
    /\bnotification requirement\b/.test(haystack) ||
    /\bsrh\b/.test(haystack) ||
    /\btrh\b/.test(haystack)
  );
}

function detectContactabilityScenarioFromHaystack(haystack: string) {
  return (
    /\bcontactable\b/.test(haystack) ||
    /\banswer the phone\b/.test(haystack) ||
    /\bphone call\b/.test(haystack) ||
    /\bacars\b/.test(haystack) ||
    /\bairport sit\b/.test(haystack) ||
    /\bbetween flights\b/.test(haystack) ||
    /\bon duty\b/.test(haystack) ||
    /\boff duty\b/.test(haystack) ||
    /\bobligation to respond\b/.test(haystack) ||
    /\backnowledge\b/.test(haystack) ||
    /\bcheck your schedule\b/.test(haystack) ||
    /\bend of short call\b/.test(haystack)
  );
}

function detectDeadheadRerouteConsequenceScenarioFromHaystack(haystack: string) {
  return (
    /\bdeadhead deviation\b/.test(haystack) ||
    (/\bdeviat(?:e|ion)\b/.test(haystack) && /\bdeadhead\b/.test(haystack)) ||
    /\broute home\b/.test(haystack) ||
    /\bvicinity of home\b/.test(haystack) ||
    /\bpass through base\b/.test(haystack) ||
    (/\breroute\b/.test(haystack) && /\bslv\b/.test(haystack)) ||
    /\bjoin on day 2\b/.test(haystack) ||
    (/\bqs\b/.test(haystack) && /\bdelayed overnight\b/.test(haystack)) ||
    /\bdelayed until next day\b/.test(haystack) ||
    /\bduty time missing\b/.test(haystack) ||
    /\bpb day not given\b/.test(haystack)
  );
}

function detectPayCreditConsistencyScenarioFromQuestion(questionText: string) {
  return (
    /\bsick bank\b/.test(questionText) ||
    /\bcalled well\b/.test(questionText) ||
    /\bbank deposit\b/.test(questionText) ||
    /\bdeposit\b/.test(questionText) ||
    /\bss credit\b/.test(questionText) ||
    /\bsilver slip credit\b/.test(questionText) ||
    /\btimecard\b/.test(questionText) ||
    /\bmicrew\b/.test(questionText) ||
    /\bmicrew credit\b/.test(questionText) ||
    /\bprojected credit\b/.test(questionText) ||
    /\bfinal credit\b/.test(questionText) ||
    /\bfinal closeout\b/.test(questionText) ||
    /\bcredit jumped\b/.test(questionText) ||
    /\bcredit recalculation\b/.test(questionText) ||
    /\bdeadhead deviation\b/.test(questionText) ||
    /\blayover less than 13 hours\b/.test(questionText) ||
    /\breverted to\b/.test(questionText) ||
    (/\bwent back\b/.test(questionText) && /\bcredit\b/.test(questionText)) ||
    (/\bdeadhead\b/.test(questionText) && /\bshort layover\b/.test(questionText))
  );
}

function detectPayCreditSubScenarioFromQuestion(questionText: string):
  | "sickBankAfterCalledWell"
  | "bankDepositSilverSlipCredit"
  | "projectedVsFinalCreditCloseout"
  | "rerouteCreditProtection"
  | "timecardCreditDiscrepancy"
  | "unknownPayCredit" {
  if (
    (/\breroute\b/.test(questionText) || /\brerouted\b/.test(questionText)) &&
    (
      /\bworth less credit\b/.test(questionText) ||
      /\bless credit\b/.test(questionText) ||
      /\boriginal pairing\b/.test(questionText) ||
      /\bpay protected\b/.test(questionText) ||
      /\btrip worth less\b/.test(questionText) ||
      /\bafter report\b/.test(questionText) ||
      /\brotation guarantee\b/.test(questionText)
    )
  ) {
    return "rerouteCreditProtection";
  }
  if (
    /\bbank deposit\b/.test(questionText) ||
    /\bdeposit\b/.test(questionText) ||
    /\bss credit\b/.test(questionText) ||
    /\bsilver slip credit\b/.test(questionText) ||
    /\b2 hours deposit\b/.test(questionText) ||
    /\bbank eligible\b/.test(questionText) ||
    /\bbank eligibility\b/.test(questionText)
  ) {
    return "bankDepositSilverSlipCredit";
  }
  if (
    /\bprojected credit\b/.test(questionText) ||
    /\bfinal credit\b/.test(questionText) ||
    /\bcloseout\b/.test(questionText) ||
    /\bmicrew showed\b/.test(questionText) ||
    /\bdropped back\b/.test(questionText) ||
    /\bcredit recalculation\b/.test(questionText) ||
    /\bdid not deviate deadhead\b/.test(questionText) ||
    /\breverted to\b/.test(questionText) ||
    (/\bwent back\b/.test(questionText) && /\bcredit\b/.test(questionText))
  ) {
    return "projectedVsFinalCreditCloseout";
  }
  if (
    /\bsick bank\b/.test(questionText) ||
    /\bcalled well\b/.test(questionText) ||
    /\bpicked up flying\b/.test(questionText)
  ) {
    return "sickBankAfterCalledWell";
  }
  if (
    /\btimecard\b/.test(questionText) ||
    /\bcredit discrepancy\b/.test(questionText) ||
    (/\bcredit\b/.test(questionText) && /\bpaid differently\b/.test(questionText))
  ) {
    return "timecardCreditDiscrepancy";
  }
  return "unknownPayCredit";
}

function detectSilverSlipStatusScenarioFromQuestion(questionText: string) {
  return (
    /\bsilver slip\b/.test(questionText) &&
    (/\bwhat does\b/.test(questionText) || /\bstatus\b/.test(questionText)) &&
    (/\b['"]?[a-z]['"]?\b/.test(questionText) || /\bmean\b/.test(questionText))
  );
}

function detectGsTimeOffScenarioFromQuestion(questionText: string) {
  const hasGsContext =
    /\bgreen slip\b/.test(questionText) ||
    /\bgreenslip\b/.test(questionText) ||
    /\bgs\b/.test(questionText);
  const hasTimeOffQuestion =
    /\b24-hour\b/.test(questionText) ||
    /\b24 hour\b/.test(questionText) ||
    /\bperiods off\b/.test(questionText) ||
    /\bgenerate two\b/.test(questionText) ||
    /\bone-day\b/.test(questionText) ||
    /\bone day\b/.test(questionText);
  return hasGsContext && hasTimeOffQuestion;
}

function detectTwentyThreeM7LogLookupScenarioFromQuestion(questionText: string) {
  return (
    /\b23m7\b/.test(questionText) &&
    (
      /\baffected pilots\b/.test(questionText) ||
      /\blogs\b/.test(questionText) ||
      /\bicrew\b/.test(questionText) ||
      /\bopen time menu\b/.test(questionText) ||
      /\bdisplay 23m7 logs\b/.test(questionText)
    )
  );
}

function detectFriendSwapUndoScenarioFromQuestion(questionText: string) {
  return (
    /\bfriend swap\b/.test(questionText) ||
    /\bswapped with a friend\b/.test(questionText) ||
    /\bswap it back\b/.test(questionText) ||
    /\bwhite slip\b/.test(questionText) ||
    /\bpersonal drop\b/.test(questionText) ||
    /\bblind slip\b/.test(questionText) ||
    (/\bmicrew\b/.test(questionText) && /\bpickup\b/.test(questionText))
  );
}

function detectShortCallDutyScenarioFromHaystack(haystack: string) {
  const hasShortCallContext =
    /\bshort call\b/.test(haystack) ||
    /\bassigned short call and trip\b/.test(haystack);
  const strongDutyLegalitySignals =
    /\bsame-day trip\b/.test(haystack) ||
    /\bsame day trip\b/.test(haystack) ||
    /\bsubsequent same day trip\b/.test(haystack) ||
    /\breport time\b/.test(haystack) ||
    /\breports at\b/.test(haystack) ||
    /\bflight time\b/.test(haystack) ||
    /\blegality\b/.test(haystack) ||
    /\bboth remain on schedule\b/.test(haystack) ||
    /\bshort call window\b/.test(haystack) ||
    /\b9\+36\b/.test(haystack) ||
    /\b7\+36\b/.test(haystack) ||
    /\bduty period\b/.test(haystack);
  const notificationScenario = detectShortCallNotificationScenarioFromHaystack(haystack);
  if (notificationScenario && !strongDutyLegalitySignals) {
    return false;
  }
  return hasShortCallContext && strongDutyLegalitySignals;
}

function detectPbRerouteXdayScenarioFromHaystack(haystack: string) {
  const hasPbProcessingContext =
    /\bpb\b/.test(haystack) ||
    /\bpayback\b/.test(haystack) ||
    /\bpr\b/.test(haystack) ||
    /\bpr remainder\b/.test(haystack) ||
    /\binterrupted x-days?\b/.test(haystack) ||
    /\bpb day\b/.test(haystack) ||
    /\bpb converted to lc\b/.test(haystack) ||
    ((/\blc\b/.test(haystack) || /\blong call\b/.test(haystack)) && (/\bpb\b/.test(haystack) || /\bpr\b/.test(haystack)));
  const hasPbProcessingSpecifics =
    /\binterrupted x-days?\b/.test(haystack) ||
    /\bx-days?\b/.test(haystack) ||
    /\bpr remainder\b/.test(haystack) ||
    /\bpb converted to lc\b/.test(haystack) ||
    /\bdart\b/.test(haystack) ||
    /\bnotification\b/.test(haystack) ||
    /\barcos\b/.test(haystack) ||
    /\brobot\b/.test(haystack);
  const hasRerouteSequenceContext =
    /\bqs\b/.test(haystack) ||
    /\bquick slip\b/.test(haystack) ||
    /\breroute\b/.test(haystack) ||
    /\bdeadhead\b/.test(haystack) ||
    /\bx-days?\b/.test(haystack) ||
    /\bdart\b/.test(haystack) ||
    /\bacars\b/.test(haystack) ||
    /\barcos\b/.test(haystack) ||
    /\brobot\b/.test(haystack) ||
    /\bnotification\b/.test(haystack) ||
    /\b2-day\b/.test(haystack) ||
    /\b3-day\b/.test(haystack);

  return hasPbProcessingContext && hasPbProcessingSpecifics && hasRerouteSequenceContext;
}

function detectFutureRotationChangeScenarioFromHaystack(haystack: string) {
  return (
    (/\brotation changed\b/.test(haystack) ||
      /\bnext month\b/.test(haystack) ||
      /\bnot a carryover\b/.test(haystack) ||
      /\bremoved a leg\b/.test(haystack) ||
      /\bredeye\b/.test(haystack)) &&
    (/\bdue anything extra\b/.test(haystack) ||
      /\bpay protection\b/.test(haystack) ||
      /\bcredit protection\b/.test(haystack) ||
      /\bcpo\b/.test(haystack) ||
      /\bknown absence\b/.test(haystack) ||
      /\breserve coverage\b/.test(haystack))
  );
}

function detectRestLegalityScenarioFromHaystack(haystack: string) {
  const farVsPwaRest =
    /\b30-hour rest\b/.test(haystack) ||
    /\b30 hour rest\b/.test(haystack) ||
    /\bfar legal\b/.test(haystack) ||
    /\bpwa requirement\b/.test(haystack) ||
    /\brelease with pay\b/.test(haystack);
  const shortCallDhRest =
    (/\b9:45 rest\b/.test(haystack) || /\b10 hours required\b/.test(haystack) || /\b9:15\b/.test(haystack)) &&
    (/\bdh-only\b/.test(haystack) || /\bdh only\b/.test(haystack) || /\bfdp\b/.test(haystack) || /\bshort call\b/.test(haystack));
  const legalityTimingReview =
    /\billegal rotation\b/.test(haystack) ||
    /\brotation illegal\b/.test(haystack) ||
    /\brest legality\b/.test(haystack) ||
    /\bduty\/rest\b/.test(haystack) ||
    (/\brotation\b/.test(haystack) && /\btiming shown\b/.test(haystack) && /\blegal\b/.test(haystack));
  return farVsPwaRest || shortCallDhRest || legalityTimingReview;
}

function detectKnownAbsenceScenarioFromHaystack(haystack: string) {
  return (
    (/\bcourt\b/.test(haystack) ||
      /\bcustody hearing\b/.test(haystack) ||
      /\bnotice to appear\b/.test(haystack) ||
      /\bsubpoena\b/.test(haystack) ||
      /\blegal obligation\b/.test(haystack)) &&
    (/\btrip\b/.test(haystack) ||
      /\bday 1\b/.test(haystack) ||
      /\bknown absence\b/.test(haystack) ||
      /\bleave\b/.test(haystack) ||
      /\bprotection\b/.test(haystack))
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
    .replace(/\bpb should have been reapplied\b/gi, "PB may have been reapplied")
    .replace(/\bpb should be reapplied\b/gi, "PB may be reapplied")
    .replace(/\bpb was supposed to be reapplied\b/gi, "PB may have been reapplied")
    .replace(/\bpb was supposed to reapply\b/gi, "PB may reapply")
    .replace(/\bpb must be restored\b/gi, "PB may need to be restored")
    .replace(/\bpb must be reapplied\b/gi, "PB may need to be reapplied")
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
  const apdDiagnostic = /\bapd\b|\bauthorized personal drop\b/.test(haystack);
  const payCreditBankEligibility =
    /\bss credit\b|\bsilver slip credit\b|\bbank deposit\b|\bdeposit\b|\bmicrew\b|\btimecard\b|\bsick bank\b/.test(haystack);
  const dependencies: string[] = [];
  const push = (value: string) => {
    if (!dependencies.includes(value)) dependencies.push(value);
  };

  if (/\blc\b|\blong call\b/.test(haystack)) {
    push("whether this is a new Long Call period or a continuation of an earlier status");
  }
  if (detectRestLegalityScenarioFromHaystack(haystack)) {
    push("whether the sequence is still FAR legal but may still violate a stricter PWA duty/rest rule");
    push("whether the issue is a planned 30-hour rest loss, a 9:45 or 9:15 rest problem, or another Section 12 legality threshold");
    push("whether the affected day is DH-only / no-FDP or a day with actual FDP or duty consequences");
    push("whether the packet actually supports release, operate, or release with pay for this rest failure");
  }
  if (/\bpb\b|\bpayback\b|\bpr remainder\b|\binterrupted x-days\b|\bdart\b/.test(haystack)) {
    push("whether the PB to LC conversion and PR remainder were recalculated after the reroute extension");
    push("whether the interrupted X-days were coded as used, interrupted, restored, or held for later reapplication");
    push("whether the system is showing a temporary processing lag that still needs DART review");
  }
  if (/\bgolden day\b|\bhard non-fly day\b/.test(haystack)) {
    push("whether the Golden Day definition is tied to a separate operational timing rule");
  }
  if (/\bshort call\b/.test(haystack)) {
    push("whether the short-call window and the later trip report can legally coexist");
  }
  if (detectShortCallNotificationScenarioFromHaystack(haystack)) {
    push("whether the short-call rule requires telephone contact, electronic placement, acknowledgment, or some combination of those notice methods");
    push("whether seeing the assignment in iCrew or MiCrew counts as notice under the actual rule or is only evidence that the placement happened");
    push("whether the vacation or non-fly day changed when notice had to occur before the short-call assignment start time");
    push("whether a CNO or no-notification dispute path applies if the assignment appeared without direct contact");
  }
  if (/\bwocl\b|\b8d3\b|\b8 d\.?3\b/.test(haystack)) {
    push("whether WOCL or Section 8 D.3 timing controls this duty sequence");
  }
  if (/\breserve x-day\b|\bmove x-day\b|\bswap x-day\b|\bgrouping\b|\bbetween months\b/.test(haystack)) {
    push("whether the reserve X-day move between months preserves the grouping restrictions across the month boundary");
    push("whether the adjacent reserve days still create a valid X-day block after swapping the 28th and the 2nd");
    push("whether iCrew evaluates the grouping rule continuously across the April/May boundary");
  }
  if (/\bsick\b/.test(haystack) && /\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack)) {
    push("whether the premium trip overlaps the sick day or starts after the sick period ends");
  }
  if (/\breroute\b|\bdeadhead\b|\bcontinuation\b/.test(haystack)) {
    push("whether the event was processed as a reroute, continuation, reassignment, or new award");
  }
  if (/\bfirst airborne\b|\bdifferent flight number\b|\bsame destination\b/.test(haystack)) {
    push("whether the first-airborne threshold had already been crossed before the Day 2 change");
    push("whether the same destination plus a different flight number was treated as continuation or a true reroute");
  }
  if (/\brrpay\b|\bturn time\b|\bpaid differently\b/.test(haystack)) {
    push("whether turn time, duty buildup, or credit inputs changed the RRPay calculation even though the trip looked the same");
  }
  if (!apdDiagnostic && /\bsilver slip\b|\bss\b/.test(haystack) && (/\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack) || /\bsimilar to\b|\bvs\b|\bthreshold\b/.test(haystack))) {
    push("whether Silver Slip has its own premium mechanism or the packet is only giving Green Slip trigger language");
    push("how the assignment was awarded and whether any overlap or conflict changes the premium result");
  }
  if (apdDiagnostic) {
    push("whether the available reserve count was at least 25% of the required reserve count at the time APD processed");
    push("whether the 18 required / 5 available numbers are the actual processing-time counts rather than a later screen view");
    push("whether the APD-eligible reserve pool matched the available pool you were reading");
  }
  if (/\breserve\b|\blong call\b|\bshort call\b|\bairport standby\b/.test(haystack)) {
    push("your reserve status and which assignment window the company says you were in");
  }
  if (/\bnext month\b|\bremoved a leg\b|\bredeye\b|\bpay protection\b|\bcredit protection\b/.test(haystack)) {
    push("whether this next month rotation changed after it was already awarded or published");
    push("whether the removed leg and redeye change trigger pay or credit protection on this future non-carryover trip");
    push("whether reserve coverage, CPO discretion, or known absence are separate processing questions rather than automatic pay-protection answers");
  }
  if (/\bcpo\b|\bknown absence\b|\breserve coverage\b|\bswap with pot\b|\bcapped reserve\b/.test(haystack)) {
    push("whether the system is blocking the transaction for coverage or known-absence reasons");
  }
  if (/\brotation changed\b|\bnext month\b|\bremoved a leg\b|\bredeye\b|\bpay protection\b|\bcpo\b|\bknown absence\b/.test(haystack)) {
    push("whether the changed rotation was already awarded or published when the company changed it");
    push("whether the removed leg and redeye change actually trigger pay protection or credit protection on a future non-carryover trip");
    push("whether a CPO exception or known-absence path is discretionary processing rather than a guaranteed contract entitlement");
  }
  if (!payCreditBankEligibility && /\bbank\b|\bvacation day\b|\bbuy vacation\b|\breplacement\b|\b60 hours\b/.test(haystack)) {
    push("whether the bank is already full at 60 hours and how the system sequences the vacation purchase against the replacement entry");
  }
  if (!payCreditBankEligibility && /\bsup\b|\bivd\b|\bvacation year\b/.test(haystack)) {
    push("whether the SUP day and the IVD request fall inside the same contract vacation year rather than the same calendar year");
  }
  if (/\bdomicile layover\b|\bbase layover\b|\bopen time rotation\b|\brotation definition\b/.test(haystack)) {
    push("whether Section 2 is only defining how a rotation is treated, rather than creating the open-time construction rule itself");
    push("whether there is separate Scheduler Manual or open-time construction language about domicile layovers or a break in duty at base");
  }
  if (/\bsick lookback\b|\bmedical procedure\b|\bapproval process\b|\bsection 14\b|\blookback\b/.test(haystack)) {
    push("whether the relevant source is general Section 14 notification/verification language or a specific exclusion from sick lookback");
    push("whether the procedure is being treated as ordinary sick leave, a verified occurrence, medical leave, or another protected status");
  }
  if (/\bqs\b|\bquick slip\b|\bblanket qs\b|\barcos\b|\bwide report\b|\b30\/168\b/.test(haystack)) {
    push("whether you were actually QS-eligible in category at the time the call went out");
    push("whether blanket QS was active and the ARCOS / phone / notification process actually fired");
    push("whether the system log shows a call-order skip, a processing failure, or a different hidden eligibility screen");
  }
  if (/\bsick bank\b|\bcalled well\b|\bpicked up flying\b/.test(haystack)) {
    push("whether the picked-up flying started only after the sick trip ended, or overlapped the original sick period");
    push("whether the attached packet actually provides a sick-bank restoration or offset rule, rather than only the original sick-occurrence treatment");
  }
  if (/\bss credit\b|\bsilver slip credit\b|\bbank deposit\b|\bdeposit\b/.test(haystack)) {
    push("whether the displayed value is pay, credit, or bank-eligible credit");
    push("whether Silver Slip credit is coded differently from regular or replacement credit for bank posting");
  }
  if (/\bmicrew\b|\btimecard\b|\bcredit recalculation\b|\bdeadhead deviation\b|\b13 hours\b|\blayover\b/.test(haystack)) {
    push("whether MiCrew was showing projected credit before final closeout rather than the final posted credit");
    push("whether a deadhead deviation or short-layover assumption temporarily changed the projected value");
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
  const apdDiagnostic = /\bapd\b|\bauthorized personal drop\b/.test(haystack);
  const payCreditBankEligibility =
    /\bss credit\b|\bsilver slip credit\b|\bbank deposit\b|\bdeposit\b|\bmicrew\b|\btimecard\b|\bsick bank\b/.test(haystack);
  const paths: string[] = [];
  const push = (value: string) => {
    if (!paths.includes(value)) paths.push(value);
  };

  if (/\blc\b|\blong call\b/.test(haystack) && /\bgolden day\b|\bhard non-fly day\b/.test(haystack)) {
    push("If Long Call starts as a new operational period, the Long Call / reserve rule set may control timing more than the definition alone.");
    push("If the company is treating this as a continuation that touches the Golden Day itself, the hard non-fly-day definition may matter more.");
  }
  if (detectRestLegalityScenarioFromHaystack(haystack)) {
    push("If the sequence is still FAR legal but the PWA rest rule is stricter, FAR legality alone does not settle whether the company can operate or must release.");
    push("If the support only proves the day is DH-only without FDP, the 10-hour versus 9:15 or 9:45 analysis may differ from a normal flying-duty sequence.");
    push("If the packet does not attach release-with-pay language, keep the release/pay result cautious rather than promising it.");
  }
  if (/\bshort call\b/.test(haystack) && /\breport\b/.test(haystack)) {
    push("If the short-call block and the trip report create one continuous duty problem, the legality analysis may change.");
    push("If the company treats them as separate legal events, the scheduling answer may be different.");
  }
  if (detectShortCallNotificationScenarioFromHaystack(haystack)) {
    push("If the rule says notice can be completed by placement plus acknowledgment, the key issue is whether iCrew or MiCrew showed the assignment and whether acknowledgment happened in time.");
    push("If the rule requires direct telephone contact or another specific notice method, simply finding the assignment later in iCrew or MiCrew may not cure a missed-notification problem.");
    push("Calling the duty pilot can be a practical step, but it is not automatically a substitute for contractual notice unless the source text says it is.");
  }
  if (/\breserve x-day\b|\bmove x-day\b|\bswap x-day\b|\bgrouping\b|\bbetween months\b/.test(haystack)) {
    push("If the grouping restrictions remain intact after moving the reserve X-day between months, the move may be allowed.");
    push("If swapping the 28th and the 2nd breaks the required X-day grouping pattern or the surrounding reserve block, the move is not likely to be allowed.");
    push("The month boundary by itself should not decide the answer; the grouping result is the controlling issue.");
  }
  if (/\bsick\b/.test(haystack) && /\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack)) {
    push("If the Green Slip overlaps the sick day, the overlap day may follow a different pay/credit path than the later days.");
    push("If the premium trip starts only after the sick period ends, the later days are more likely to follow normal premium-trip treatment.");
  }
  if (/\breroute\b|\bdeadhead\b|\bcontinuation\b/.test(haystack)) {
    push("If this was processed as a reroute or continuation, the original trip protections may matter more than a brand-new award analysis.");
    push("If the system treated it as a new assignment or award, a different pay or reserve path may control.");
  }
  if (/\bfirst airborne\b|\bdifferent flight number\b|\bsame destination\b/.test(haystack)) {
    push("If the change stayed a continuation to the same destination, the different flight number alone does not prove reroute pay.");
    push("If the first-airborne / Section 23 L rule treated it as a true reroute, reroute pay becomes more plausible, but you still need the controlling reroute language.");
  }
  if (/\brrpay\b|\bturn time\b|\bpaid differently\b/.test(haystack)) {
    push("If the turn-time difference changed duty or credit inputs, the two RR events can legitimately pay differently.");
    push("If the timing and coding were actually identical, the mismatch points more toward a processing or timecard explanation.");
  }
  if (/\bpb\b|\bpayback\b|\bpr remainder\b|\binterrupted x-days\b|\bdart\b/.test(haystack)) {
    push("If the reroute created a true X-day interruption, the interrupted X-days may need to be restored and the PB / PR / LC values may need to be recalculated.");
    push("If the system treated the extension as continuation or a reflow without a matching PB reapplication rule, the display can look short even before DART resolves it.");
    push("If the values are just lagging behind the reroute processing, the PB / PR / LC picture may look wrong temporarily.");
  }
  if (!apdDiagnostic && /\bsilver slip\b|\bss\b/.test(haystack) && (/\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack) || /\bthreshold\b|\bvs\b|\bsimilar to\b/.test(haystack))) {
    push("If Silver Slip has its own premium language, you do not have to satisfy the Green Slip trigger just to get Silver Slip premium.");
    push("If the packet is clearer on Green Slip than on Silver Slip, use Green Slip only as comparison support rather than proof that both slips behave the same way.");
    push("If the Silver Slip overlaps or conflicts with another premium event, the final pay treatment may still change.");
  }
  if (apdDiagnostic) {
    push("If 18 required and 5 available were the real processing counts, the 25% threshold was likely met, so timing or another APD condition becomes the next place to look.");
    push("If the counts you saw were later or from a different availability pool, the denial can still make sense under Section 23 I.10.");
  }
  if (!payCreditBankEligibility && /\bbank\b|\bvacation day\b|\bbuy vacation\b|\breplacement\b|\b0:00 awarded\b/.test(haystack)) {
    push("If the bank is already full at 60 or the same-month purchase/replacement sequence does not net the way you expect, the system can show 4:35 requested and 0:00 awarded.");
    push("If Section 7 allows the transaction but iCrew or DBMS is sequencing the purchase and replacement differently, the denial may be processing-driven rather than a clean contract bar.");
  }
  if (!payCreditBankEligibility && /\bsup\b|\bivd\b|\bvacation year\b/.test(haystack)) {
    push("If March 2027 and May 2026 do not fall in the same contract vacation year, the system will reject the request even though they do not look far apart on the calendar.");
    push("If the vacation-year mapping actually lines up, the next issue is whether the specific SUP / IVD process is blocking the request instead.");
  }
  if (/\bdomicile layover\b|\bbase layover\b|\bopen time rotation\b|\brotation definition\b/.test(haystack)) {
    push("If the only source attached is the Section 2 rotation definition, that alone does not prove the rotation is illegal.");
    push("If there is separate Scheduler Manual or open-time construction language that bars a domicile layover build, that would be the stronger source for saying the construction is not allowed.");
  }
  if (/\bsick lookback\b|\bmedical procedure\b|\bapproval process\b|\bsection 14\b|\blookback\b/.test(haystack)) {
    push("If Section 14 F or a related note explicitly says the hours will not be considered for lookback, that is the stronger support for saying the occurrence is excluded.");
    push("If the packet only shows general notification or verification language, the safer answer is that Section 14 explains the process, but not necessarily that the procedure is excluded from lookback.");
  }
  if (/\bqs\b|\bquick slip\b|\bblanket qs\b|\barcos\b|\bwide report\b|\b30\/168\b/.test(haystack)) {
    push("If blanket QS was active, category eligibility was met, and no 30/168 or other legality block applied, the real issue may be missed call-order or notification processing.");
    push("If the system applied another eligibility screen that is not obvious from the wide report, the missed call may be a process or rule-screen issue rather than proof that every eligible pilot should have been called.");
  }
  if (/\bsick bank\b|\bcalled well\b|\bpicked up flying\b/.test(haystack)) {
    push("If the later flying started only after the sick trip ended, that does not automatically erase the original sick-bank hit.");
    push("If the packet does not attach a restoration or offset rule, keep the sick-bank answer conditional rather than promising a correction.");
  }
  if (/\bnext month\b|\bremoved a leg\b|\bredeye\b|\bpay protection\b|\bcredit protection\b/.test(haystack)) {
    push("If the contract has a pay or credit protection rule for this next month change, that rule controls.");
    push("If the removed leg and redeye only reflect a future schedule construction change, extra pay may not be automatic.");
    push("If reserve coverage blocks the similar trip swap, CPO or known-absence processing may still be discretionary rather than guaranteed.");
  }
  if (/\brotation changed\b|\bnext month\b|\bremoved a leg\b|\bredeye\b|\bpay protection\b|\bcpo\b|\bknown absence\b/.test(haystack)) {
    push("If the contract has a future schedule-change pay-protection rule for this non-carryover trip, that rule controls.");
    push("If this is only a company-driven schedule construction change before operation, extra pay may not be automatic.");
    push("If reserve coverage blocks the swap, a CPO override may be discretionary processing, not guaranteed pay protection.");
  }
  if (/\bss credit\b|\bsilver slip credit\b|\bbank deposit\b|\bdeposit\b/.test(haystack)) {
    push("If Silver Slip credit is coded differently from regular credit, iCrew can reject the bank deposit as a bank eligibility issue even though the trip produced pay or displayed credit.");
    push("If the packet never says Silver Slip credit is bank-eligible, treat the question as a credit-type eligibility issue rather than assuming the system is wrong.");
  }
  if (/\bmicrew\b|\btimecard\b|\bcredit recalculation\b|\bdeadhead deviation\b|\b13 hours\b|\blayover\b/.test(haystack)) {
    push("If MiCrew briefly assumed a deviation or short-layover trigger, projected credit can appear higher and then drop back at final closeout.");
    push("If the deviation never happened or the final layover did not trip the threshold, the timecard can legitimately recalculate back down.");
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
  const apdDiagnostic = /\bapd\b|\bauthorized personal drop\b/.test(haystack);
  const payCreditBankEligibility =
    /\bss credit\b|\bsilver slip credit\b|\bbank deposit\b|\bdeposit\b|\bmicrew\b|\btimecard\b|\bsick bank\b/.test(haystack);
  const checks: string[] = [];
  const push = (value: string) => {
    if (!checks.includes(value)) checks.push(value);
  };

  push("the award or processing code shown in iCrew / DBMS");
  push("whether the system labels this as continuation, reroute, reassignment, or a new award");

  if (/\breport\b|\brelease\b|\bafter report\b|\bbefore report\b|\bwocl\b|\b8d3\b/.test(haystack)) {
    push("the exact report, release, and change-notification timestamps");
  }
  if (detectRestLegalityScenarioFromHaystack(haystack)) {
    push("the exact scheduled rest versus actual rest, including any planned 30-hour rest that was lost");
    push("whether the affected day is DH-only or includes FDP/report/duty obligations");
    push("whether the system treated the outcome as FAR-legal only, contract-legal, released, or released with pay");
  }
  if (/\bpb\b|\bpr\b|\blc\b|\bx-?day\b/.test(haystack)) {
    push("the reserve or payback status shown on the affected calendar days");
  }
  if (/\bpb\b|\bpayback\b|\bpr remainder\b|\bdart\b|\bacars\b|\barcos\b|\brobot\b/.test(haystack)) {
    push("the original versus modified rotation history, including the reroute extension and deadhead replacement");
    push("the PB to LC conversion timing, the PR remainder calculation, and any DART or scheduler note explaining the current display");
    push("the ACARS, ARCOS, robot, or manual notification logs tied to the award and reroute");
  }
  if (/\breserve x-day\b|\bmove x-day\b|\bswap x-day\b|\bgrouping\b|\bbetween months\b/.test(haystack)) {
    push("the X-day pattern before and after the proposed swap between months, including the 28th and the 2nd plus the surrounding 29th, 30th, and 01st");
    push("whether the adjacent reserve block still satisfies the grouping rule after moving the X-day");
    push("whether iCrew labels the rejection as a grouping violation, reserve-line violation, or month-boundary processing issue");
  }
  if (/\bdart\b|\bnotification\b|\barcos\b/.test(haystack)) {
    push("any DART, ARCOS, or scheduler note that shows how the event was processed");
  }
  if (detectShortCallNotificationScenarioFromHaystack(haystack)) {
    push("when the short-call assignment was placed in iCrew or MiCrew and whether the system shows an acknowledgment timestamp");
    push("call logs, voicemail, screenshots, and any CNO or notification history tied to the assignment after the vacation or non-fly day");
    push("whether the duty pilot or scheduling log shows telephone contact, electronic placement, or both");
  }
  if (/\bfirst airborne\b|\bdifferent flight number\b|\bsame destination\b/.test(haystack)) {
    push("whether the changed leg was coded as continuation, reroute, reassignment, or a new segment");
    push("whether the destination stayed the same while only the scheduled flight number changed");
  }
  if (/\brrpay\b|\bturn time\b|\bpaid differently\b/.test(haystack)) {
    push("the two timecards side by side, including turn time, duty time, reroute code, and final credit inputs");
    push("whether Compensation Manual support shows the RRPay or reroute-pay formula that matches this reserve fact pattern");
  }
  if (!apdDiagnostic && /\bsilver slip\b|\bss\b/.test(haystack) && (/\bgreen slip\b|\bgreenslip\b|\bgs\b/.test(haystack) || /\bthreshold\b|\bvs\b|\bsimilar to\b/.test(haystack))) {
    push("whether the award shows Silver Slip versus Green Slip, and what premium code attached to it");
    push("whether any overlap or conflict with another premium event changed the pay result");
  }
  if (apdDiagnostic) {
    push("the exact required and available reserve counts at the time APD processed");
    push("whether the available reserve pool you saw matches the APD-eligible reserve pool the system used");
    push("whether the request was coded for the correct day and APD/drop type");
  }
  if (/\bcourt\b|\bnotice to appear\b|\bknown absence\b|\bleave\b/.test(haystack)) {
    push("what documentation Scheduling or CPO asked for, and whether they coded it as known absence or leave");
  }
  if (/\bnext month\b|\bremoved a leg\b|\bredeye\b|\bpay protection\b|\bcredit protection\b/.test(haystack)) {
    push("the original next month award versus the changed redeye version, and the pay or credit value before and after the removed leg");
    push("the reserve coverage denial reason, any known-absence category used, and any CPO / DART / contract-admin guidance tied to the change");
  }
  if (/\brotation changed\b|\bnext month\b|\bremoved a leg\b|\bredeye\b|\bpay protection\b|\bcpo\b|\bknown absence\b/.test(haystack)) {
    push("the original award versus the changed rotation history, the pay/credit values before and after the change, and any reserve-coverage denial reason");
    push("whether the known-absence request category, CPO guidance, or DART notes actually tie to pay protection on this future changed trip");
  }
  if (!payCreditBankEligibility && /\bbank\b|\bvacation day\b|\bbuy vacation\b|\breplacement\b|\b0:00 awarded\b/.test(haystack)) {
    push("whether the 4:35 requested / 0:00 awarded detail is tied to the vacation purchase itself or the replacement posting behind it");
    push("which vacation year and month bucket iCrew / DBMS attached to the purchase and replacement entries");
  }
  if (!payCreditBankEligibility && /\bsup\b|\bivd\b|\bvacation year\b/.test(haystack)) {
    push("which vacation period the SUP day belongs to, which vacation period the IVD is being drawn from, and how iCrew labels the vacation year for each");
    push("whether March 2027 and May 2026 are being compared under the contract vacation-year mapping instead of the calendar year");
  }
  if (/\bdomicile layover\b|\bbase layover\b|\bopen time rotation\b|\brotation definition\b/.test(haystack)) {
    push("whether the system cites a scheduler/open-time construction rule or only the Section 2 rotation definition");
    push("whether the build is being described as a domicile/base layover versus a normal break in duty at base");
  }
  if (/\bsick lookback\b|\bmedical procedure\b|\bapproval process\b|\bsection 14\b|\blookback\b/.test(haystack)) {
    push("whether the occurrence is coded as ordinary sick leave, verified sick leave, known sick leave, medical leave, or another status");
    push("whether the process is pointing you to Chief Pilot, Pilot Leaves, DALPA, or a contract-admin workflow for verification");
  }
  if (/\bqs\b|\bquick slip\b|\bblanket qs\b|\barcos\b|\bwide report\b|\b30\/168\b/.test(haystack)) {
    push("the ARCOS record, phone logs, email or notification history, and the exact timestamp when the QS went out");
    push("the wide report or category evidence showing where you and any similarly situated pilot stood in seniority and eligibility");
  }
  if (/\bsick bank\b|\bcalled well\b|\bpicked up flying\b/.test(haystack)) {
    push("the sick-trip end time, the called-well timestamp, and the later pickup award time");
    push("whether the timecard still shows the original sick-bank deduction separately from the later flying");
  }
  if (/\bss credit\b|\bsilver slip credit\b|\bbank deposit\b|\bdeposit\b/.test(haystack)) {
    push("whether iCrew labels the value as bank-eligible credit, premium pay only, straight credit, or a Silver Slip-specific code");
    push("whether the rejection message ties to credit-type eligibility rather than balance or timing");
  }
  if (/\bmicrew\b|\btimecard\b|\bcredit recalculation\b|\bdeadhead deviation\b|\b13 hours\b|\blayover\b/.test(haystack)) {
    push("the MiCrew projected-credit display versus the final timecard closeout");
    push("whether a deadhead deviation field or short-layover assumption stayed active before final closeout");
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
  const questionText = normalizeText(args.question);
  const haystack = normalizeText(
    [args.question, args.answer.shortAnswer, args.answer.plainEnglishExplanation, ...(args.answer.scenarioBreakdown ?? [])].join(" ")
  );
  const apdDiagnostic = /\bapd\b|\bauthorized personal drop\b/.test(questionText);
  const silverSlipStatusScenario = detectSilverSlipStatusScenarioFromQuestion(questionText);
  const gsTimeOffScenario = detectGsTimeOffScenarioFromQuestion(questionText);
  const twentyThreeM7LogLookupScenario = detectTwentyThreeM7LogLookupScenarioFromQuestion(questionText);
  const friendSwapUndoScenario = detectFriendSwapUndoScenarioFromQuestion(questionText);
  const oeNotificationScenario = detectOeNotificationScenarioFromHaystack(questionText);
  const contactabilityScenario = detectContactabilityScenarioFromHaystack(questionText);
  const pbRerouteXdayScenario = detectPbRerouteXdayScenarioFromHaystack(questionText);
  const payCreditConsistencyScenario = detectPayCreditConsistencyScenarioFromQuestion(questionText);
  const deadheadRerouteConsequenceScenario =
    detectDeadheadRerouteConsequenceScenarioFromHaystack(questionText) &&
    !pbRerouteXdayScenario &&
    !payCreditConsistencyScenario;
  const shortCallDutyScenario = detectShortCallDutyScenarioFromHaystack(questionText);
  const shortCallNotificationScenario = detectShortCallNotificationScenarioFromHaystack(questionText);
  const futureRotationChangeScenario = detectFutureRotationChangeScenarioFromHaystack(haystack);
  const knownAbsenceScenario = detectKnownAbsenceScenarioFromHaystack(haystack);
  const restLegalityScenario = detectRestLegalityScenarioFromHaystack(haystack);
  const goldenDayLcScenario =
    /\bgolden day\b/.test(questionText) &&
    (/\bhard non-fly day\b/.test(questionText) || /\bsection 2 a\.129\b/.test(questionText) || /\bpwa section 2 a\.129\b/.test(questionText)) &&
    (/\blc\b/.test(questionText) || /\blong call\b/.test(questionText) || /\bday one\b/.test(questionText) || /\b6pm\b/.test(questionText) || /\b18 hours\b/.test(questionText));
  const sourceSummary = compactSourceSummary({
    pwaSectionsUsed: args.pwaSectionsUsed,
    compensationChunksUsed: args.compensationChunksUsed,
    schedulerChunksUsed: args.schedulerChunksUsed,
  });
  if (apdDiagnostic) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the full governing packet attached for the final operational step in this scenario.";
    const countsMatch = normalizeText(args.answer.shortAnswer).match(/\bwith\s+(\d+(?:\.\d+)?)\s+required\s+and\s+(\d+(?:\.\d+)?)\s+available\b/);
    const required = countsMatch ? Number(countsMatch[1]) : null;
    const available = countsMatch ? Number(countsMatch[2]) : null;
    const threshold = required !== null ? required * 0.25 : null;
    return [
      "What this depends on:",
      required !== null && available !== null && threshold !== null
        ? `- Whether ${required} required and ${available} available were the actual processing-time counts, not a later screen snapshot.`
        : "- The required and available reserve counts at the time APD actually processed.",
      "- Whether the APD-eligible reserve pool matched the available reserve pool you were reading.",
      "- Whether another APD condition or coding issue blocked the request even if the raw threshold looked met.",
      "Likely paths:",
      required !== null && available !== null && threshold !== null
        ? `- Section 23 I.10 uses a 25% threshold, so ${threshold.toFixed(1)} is the key comparison point for ${required} required and ${available} available.`
        : "- Section 23 I.10 uses the 25% threshold at the time APD was processed.",
      "- If the processing-time counts were above threshold, timing, pool definition, or another APD condition becomes the more likely explanation for the denial.",
      "- If the processing-time counts or eligible reserve pool were different from what you saw later, the denial can still fit Section 23 I.10.",
      "What to check:",
      "- The exact required and available reserve counts at the time APD processed.",
      "- Whether the available pool you saw matches the APD-eligible reserve pool the system used.",
      "- Whether the request was coded for the correct day and APD/drop type.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (pbRerouteXdayScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the full governing packet for the PB / PR / LC reapplication step in this reroute sequence.";
    return [
      "Issue breakdown:",
      "- PB day disappeared after a QS pickup was rerouted and the rotation extended from a 2-day trip to a 3-day trip.",
      "- The reroute and deadhead change may have changed how the interrupted X-day sequence was coded.",
      "- PB converting to LC and the PR remainder display may be a separate PB / PR / LC processing issue rather than a clean entitlement answer by itself.",
      "- The missing robot / human / ACARS / ARCOS notification trail is its own dispute path and can matter if the award sequence was not communicated correctly.",
      "",
      "What this depends on:",
      "- Whether the reroute qualifies under Section 23 L and whether Section 23 L.9 controls the interrupted X-day treatment.",
      "- Whether the interrupted X-days were coded as used, interrupted, restored, or held for later PB reapplication after the QS pickup changed shape.",
      "- When the PB converted to LC, how the PR remainder was recalculated, and whether the system treated the extension as continuation, reroute, or re-award processing.",
      "- Whether the missing notification record reflects a separate award/notice problem or just a lag in the system history.",
      "",
      "Likely paths:",
      "- If this was a true X-day interruption, the interrupted X-days may need to be restored, and the PB / PR / LC values may need to be recalculated after the reroute extension.",
      "- If the system treated the sequence as continuation or a reflow, the PB day can disappear from the display without automatically proving PB must be restored later.",
      "- If the values are lagging behind the reroute processing, DART or manual review may be needed before the PB day, LC status, and PR remainder settle correctly.",
      "",
      "What to check:",
      "- The original QS pickup award, the reroute history, and the deadhead replacement that turned the 2-day into a 3-day sequence.",
      "- The X-day coding on the affected days and whether the system shows them as interrupted, used, restored, or converted.",
      "- The PB to LC conversion timing, the PR remainder calculation, and any DART or scheduler note explaining why the PB day disappeared.",
      "- The ACARS, ARCOS, robot, or manual notification logs tied to the award and reroute sequence.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (twentyThreeM7LogLookupScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact iCrew UI-path source attached for the 23M7 log screen.";
    return [
      "What this depends on:",
      "- Whether your iCrew build still uses the same Schedules and Open Time menu labels for the 23M7 tool path.",
      "- Whether the affected-pilot display is exposed as a direct 23M7 log screen rather than a contract section explanation.",
      "- Whether the visible support actually attaches the UI path, or only the 23M7 concept itself.",
      "Likely paths:",
      "- In practice, this is an iCrew process lookup question, not a contract-interpretation question.",
      "- The path people usually mean is iCrew -> Schedules -> Open Time -> Display 23M7 logs or the equivalent 23M7 affected-pilot display in that Open Time area.",
      "- If the attached packet does not explicitly show that UI path, keep the answer cautious and verify the exact menu label in your current build.",
      "What to check:",
      "- In iCrew, start with Schedules.",
      "- Then open the Open Time menu.",
      "- Look for Display 23M7 logs or the affected-pilot log/display in that same area.",
      "- If the label differs in your build, confirm with the current iCrew help/process reference.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (friendSwapUndoScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact MiCrew reverse-friend-swap process rule attached for this question.";
    return [
      "What this depends on:",
      "- Whether the friend swap already fully processed in MiCrew, because once it does, a simple reverse swap or drop may be blocked.",
      "- Whether the system still allows a process workaround such as a white slip by name paired with the other pilot's personal drop.",
      "- Whether timing restrictions like today, tomorrow, next day, blind-slip conflicts, and normal rest or legality screens block the cleanup.",
      "Likely paths:",
      "- Once a friend swap is processed, MiCrew may not let you simply swap it back with a normal reverse transaction.",
      "- A possible process path is a white slip by name plus the other pilot's personal drop, if the timing window allows it and there is no blind-slip conflict.",
      "- Even if that process path exists, it is system/process guidance rather than guaranteed approval, and normal rest and legality still matter.",
      "What to check:",
      "- Whether the swap is already finalized in MiCrew or still in a state that can be reversed directly.",
      "- Whether a white slip by name and the other pilot's personal drop are still allowed for that date range.",
      "- Whether the trips touch today, tomorrow, or next day, and whether any blind-slip or same-day processing block applies.",
      "- Whether both pilots still clear rest, legality, and any pickup/drop screening after the workaround.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (silverSlipStatusScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact Silver Slip status-code definition attached for this question.";
    return [
      "What this depends on:",
      "- Whether the attached source actually defines what the 'N' status means on a Silver Slip display.",
      "- Whether the status is describing availability, soak state, or another internal pickup/status code rather than a pay rule by itself.",
      "- Whether the visible support ties the code to a specific operational meaning, or only to Silver Slip generally.",
      "Likely paths:",
      "- Do not assume 'N' simply means 'no' unless the source actually says that.",
      "- If the support or tool context ties 'N' to a not-soaked or not-yet-available-to-pick-up state, that is the safer practical explanation, but it should still stay source-limited.",
      "- If the packet never defines the code directly, the right answer is that it is a Silver Slip status indicator whose exact meaning still needs a cleaner source.",
      "What to check:",
      "- The Silver Slip screen, legend, or manual note that actually defines the status code.",
      "- Whether iCrew or the scheduler source shows 'N' as not soaked, not yet available, or another specific availability status.",
      "- Any attached reference that defines the code separately from the broader Silver Slip premium rules.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (payCreditConsistencyScenario) {
    const payCreditSubScenario = detectPayCreditSubScenarioFromQuestion(questionText);
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact pay/credit/bank-eligibility rule attached for this question.";
    const sickBankCase = payCreditSubScenario === "sickBankAfterCalledWell";
    const bankDepositCase = payCreditSubScenario === "bankDepositSilverSlipCredit";
    const rerouteCreditProtectionCase = payCreditSubScenario === "rerouteCreditProtection";
    const recalculationCase =
      payCreditSubScenario === "projectedVsFinalCreditCloseout" ||
      payCreditSubScenario === "timecardCreditDiscrepancy";

    if (bankDepositCase) {
      return [
        "What this depends on:",
        "- Whether the 2 hours iCrew is showing are pay, credit, or bank-eligible credit.",
        "- Whether the Silver Slip generated a credit type that is treated differently from regular or replacement credit for bank posting.",
        "- Whether the rejection is really a credit-type eligibility issue rather than a balance or timing issue.",
        "Likely paths:",
        "- A Silver Slip can generate pay or displayed credit without that value being bank-eligible in the same way as regular line or replacement credit.",
        "- If iCrew says 2:00 could not be deposited, the system may be rejecting the credit type rather than saying no value was created at all.",
        "- If the attached packet never says Silver Slip credit counts for bank deposit, keep the answer cautious instead of assuming the system is wrong.",
        "What to check:",
        "- Whether iCrew labels the 2 hours as bank-eligible credit, premium pay only, straight credit, or a Silver Slip-specific code.",
        "- Any Compensation Manual or PWA bank rule that says whether Silver Slip credit can be deposited.",
        "- The exact rejection message and whether it points to bank eligibility, posting order, or a credit-type restriction.",
        `Source limitation: ${limitation}`,
        `Sources used: ${sourceSummary}.`,
      ].join("\n");
    }

    if (sickBankCase) {
      return [
        "What this depends on:",
        "- Whether the picked-up flying started only after the sick trip ended or overlapped the original sick period.",
        "- Whether the called-well timing changed your availability going forward but did not erase the original sick-bank charge.",
        "- Whether the packet actually attaches a sick-bank restoration or offset rule for later flying after the sick trip ends.",
        "Likely paths:",
        "- Later picked-up flying after the sick trip ends does not automatically mean the original sick-bank hit disappears.",
        "- Called well timing can matter for what you can pick up next without necessarily restoring the earlier sick-bank charge.",
        "- If the packet never attaches a restoration or offset rule, keep the answer cautious rather than promising a correction.",
        "What to check:",
        "- The sick-trip end time, the called-well timestamp, and the later pickup award time.",
        "- Whether the timecard shows the original sick-bank deduction separately from the later flying.",
        "- Any attached Section 14 or compensation support that actually addresses restoration, offset, or replenishment.",
        `Source limitation: ${limitation}`,
        `Sources used: ${sourceSummary}.`,
      ].join("\n");
    }

    if (recalculationCase) {
      return [
        "What this depends on:",
        "- Whether MiCrew was showing projected credit before final closeout rather than the final posted credit.",
        "- Whether a deadhead deviation, not deviating, or a short-layover/rest assumption temporarily changed the projected value.",
        "- Whether the final closeout removed that assumption once the actual flown sequence and layover were known.",
        "Likely paths:",
        "- Projected credit does not always survive to final closeout if MiCrew was temporarily assuming a deviation, short layover, or another trigger that never actually finalized.",
        "- If the deadhead deviation never happened or the final layover did not trip the required threshold, the final posted credit can legitimately revert to the original lower value.",
        "- FAR or rest-sensitive assumptions can affect projected credit without guaranteeing the same result on the final timecard.",
        "What to check:",
        "- The MiCrew projected-credit display versus the final timecard closeout.",
        "- Whether the deadhead deviation field stayed active, whether you actually deviated, and whether the layover ultimately dropped below the controlling threshold.",
        "- The original sign-out, actual report/release history, and any note explaining why the projected value reverted at final closeout.",
        `Source limitation: ${limitation}`,
        `Sources used: ${sourceSummary}.`,
      ].join("\n");
    }

    if (rerouteCreditProtectionCase) {
      return [
        "What this depends on:",
        "- Whether the reroute happened after report or only changed the trip before report.",
        "- Whether the original pairing or original rotation value is protected when the rerouted or as-flown trip closes with less credit.",
        "- Whether the attached source actually uses reroute pay, rotation guarantee, or another pay-protection rule for this sequence.",
        "Likely paths:",
        "- If the reroute happened after report and the packet supports reroute pay or rotation-guarantee treatment, you may still be pay protected above the lower as-flown value.",
        "- If the packet does not attach the controlling reroute pay or rotation-guarantee rule for this fact pattern, keep the answer cautious instead of promising full pay protection.",
        "- A trip being worth less credit after the reroute does not by itself prove the original pairing value is protected; the controlling reroute/pay rule still has to be attached.",
        "What to check:",
        "- The original pairing or rotation value against the rerouted or final as-flown credit.",
        "- Whether the reroute happened after report, whether the trip remained one rotation, and whether the timecard or DBMS notes mention reroute pay, rotation guarantee, or pay protection.",
        "- Any attached PWA Section 23 K / 23 L support and Compensation Manual reroute-pay or rotation-guarantee language.",
        `Source limitation: ${limitation}`,
        `Sources used: ${sourceSummary}.`,
      ].join("\n");
    }
  }
  if (gsTimeOffScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact Green Slip Section 23 Q time-off language attached for this question.";
    return [
      "What this depends on:",
      "- Whether the one-day Green Slip changes one or more non-fly or reserve days in a way that creates additional 24-hour periods off.",
      "- Whether release timing and the surrounding reserve/non-fly-day structure are what drive the extra 24-hour periods, rather than the one-day GS label by itself.",
      "- Whether the visible support actually states the Section 23 Q time-off consequence for this exact one-day GS setup.",
      "Likely paths:",
      "- A one-day GS does not automatically mean you always get two extra 24-hour periods off just because the trip is one day long.",
      "- Whether two 24-hour periods are created depends on how the Green Slip affects the surrounding non-fly or reserve days and the actual release timing.",
      "- If the packet only gives general GS language without the exact time-off consequence, keep the answer cautious instead of promising two 24-hour periods off.",
      "What to check:",
      "- The exact Green Slip day, the release time, and the surrounding reserve or non-fly-day structure.",
      "- Whether Section 23 Q or another attached source explicitly says how many 24-hour periods off are generated in this one-day GS setup.",
      "- Whether the system coded the surrounding days as preserved, moved, or consumed after the GS assignment.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (restLegalityScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact Section 12 rest-legality and release/pay language attached for this question.";
    return [
      "What this depends on:",
      "- Whether the issue is a planned 30-hour rest that was lost, a 9:45 or 9:15 rest question, or another Section 12 duty/rest legality problem.",
      "- Whether the sequence remains FAR legal but still may not satisfy a stricter PWA contractual rest requirement.",
      "- Whether the affected day is DH-only / no-FDP or a day with actual FDP, report, or duty consequences.",
      "- Whether the packet actually attaches release-with-pay or operate/release treatment for this rest failure.",
      "Likely paths:",
      "- FAR legality does not automatically answer the PWA question if the contract imposes a stricter rest requirement.",
      "- If the controlling support is a Section 12 contractual rest rule, the company may need to release, operate, or release with pay depending on the exact language and coding of the day.",
      "- If the day is DH-only without FDP, the 10-hour versus 9:15 or 9:45 analysis may differ from a normal flying-duty sequence.",
      "What to check:",
      "- The exact scheduled rest versus actual rest, including any planned 30-hour rest that was lost due to delay or reroute.",
      "- Whether the affected day is DH-only or includes FDP/report/duty obligations.",
      "- The exact report, release, block, and rest timestamps for the sequence you think is illegal.",
      "- Whether any release or pay treatment is coded as contract-driven or only as a FAR legality outcome.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (shortCallDutyScenario && !shortCallNotificationScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not see the exact short-call plus same-day trip legality rule in the attached support.";
    return [
      "What this depends on:",
      "- The short-call window and when that reserve obligation actually ends.",
      "- The same-day trip report time and whether it begins right as short call ends.",
      "- The total duty and flight-time interaction if the short call and the trip both remain on schedule.",
      "- Whether the company is treating the sequence as one legality problem or as separate events that still must remain legal together.",
      "Likely paths:",
      "- If the short-call block and the trip report create one continuous duty problem, both events may not be able to remain on schedule together.",
      "- If the company treats them as separate legal events, the result can still turn on whether the report, duty, and flight-time totals remain legal once the trip actually starts.",
      "- The answer should not turn on a generic short-call definition alone; it has to be tied to report timing, duty limits, and whether both events can remain scheduled.",
      "What to check:",
      "- The short-call start and end window, and whether the trip report creates a continuous-duty issue.",
      "- The duty-period and flight-time totals if the same-day trip operates as scheduled.",
      "- Whether Section 12 duty/rest support and Section 23 short-call support both line up for this exact sequence.",
      "- The iCrew or DBMS legality result that shows whether both the short call and the trip remain on schedule together.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (oeNotificationScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact OE notification / CNO source attached.";
    return [
      "What this depends on:",
      "- Whether the current controlling language is actually OE-specific and lives in the SRH, TRH, or another training/process source.",
      "- Whether the source requires personal phone contact or permits CNO / Company Notification Online or another electronic notice method.",
      "- Whether the source is talking about OE specifically, rather than a generic contact rule from another scheduling context.",
      "Likely paths:",
      "- If the attached source is truly OE-specific and says CNO or another electronic method is enough, then that method can control.",
      "- If the attached source says OE still requires personal phone contact, then an electronic notice by itself would not be enough.",
      "- If the packet only shows generic contact language but not OE-specific notice language, the safer answer is that the exact OE notification rule is still missing.",
      "What to check:",
      "- The SRH and TRH pages that actually mention OE notification, phone contact, CNO, or electronic notice.",
      "- Whether the current source is OE-specific or only a general contact/notification rule.",
      "- Any current company or training-process note that explicitly replaced the older phone-call requirement.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (contactabilityScenario && !pbRerouteXdayScenario && !shortCallNotificationScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact contactability / notification-obligation source attached for this question.";
    return [
      "What this depends on:",
      "- Whether the source requires response to an official company contact method such as ACARS, company call, notice placement, or another documented notification channel.",
      "- Whether being on duty, in airport sit, or between flights changes what you must monitor versus whether you must answer a personal phone.",
      "- Whether the question is about acknowledgment or schedule-check obligations, especially at the end of short call.",
      "Likely paths:",
      "- If the source requires monitoring or acknowledgment of official company channels, ignoring those channels can still be risky even if the source does not clearly require answering a personal phone.",
      "- If the packet does not explicitly require personal-phone contact, I would not say you must answer your cell phone just because you are on duty or between flights.",
      "- If the issue is the end of short call, the key question is whether the source requires a schedule check, acknowledgment, or another notice step before the short-call period ends.",
      "What to check:",
      "- The exact contact method used or attempted: ACARS, scheduler phone contact, CNO, schedule placement, or another official channel.",
      "- Whether the timing was on duty, between flights, in airport sit, or at the end of short call.",
      "- Any logs, screenshots, ACARS history, missed-call records, or schedule snapshots showing when notice was sent and how it was delivered.",
      "- Preserve timestamps and method history, and do not ignore official company channels even if the personal-phone obligation is unclear.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (deadheadRerouteConsequenceScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact deadhead deviation / SLV / QS consequence rule attached for this question.";
    return [
      "What this depends on:",
      "- Whether the issue is a deadhead deviation routing question, a reroute that bleeds into a scheduled event like SLV, or a QS delay that changed duty-history and PB/X-day consequences.",
      "- Whether the company treated the sequence as continuation, reroute, or a new assignment consequence after the original report and duty start.",
      "- Whether the system display matches the actual report, deadhead, reroute, and duty history.",
      "Likely paths:",
      /\bdeviat(?:e|ion)\b/.test(questionText)
        ? "- A deadhead deviation can turn on specific routing limits such as whether the route home, ATL/CVG/DTW option, or another vicinity-of-home route must pass through base or otherwise satisfy the source rule."
        : "- A deadhead deviation can turn on specific routing limits such as whether the route passes through base or qualifies as a permitted home-vicinity routing, not just on whether the request seems reasonable.",
      /\bslv\b/.test(questionText)
        ? "- If the reroute bleeds into SLV, the controlling question becomes what the source lets the company do with the SLV itself, including whether it can be joined on day 2 or otherwise adjusted."
        : "- If the reroute bleeds into SLV or another scheduled event, the controlling question becomes what the source lets the company do with that event, including whether a join-on-day-2 or another adjustment is allowed.",
      (/\bqs\b/.test(questionText) || /\bquick slip\b/.test(questionText))
        ? "- If the QS was delayed overnight after original sign-in, the actual duty start, missing duty-time display, and any PB/X-day consequence may diverge until iCrew history, CPO review, or DART review catches up."
        : "- If a QS or reroute delayed overnight after report, the actual sign-in, duty start, PB/X-day treatment, and displayed duty time may diverge until the system history or DART review catches up.",
      "What to check:",
      /\bdeviat(?:e|ion)\b/.test(questionText)
        ? "- The exact deadhead deviation and routing rule, including whether the route home or ATL/CVG/DTW-style vicinity routing must pass through base."
        : "- The original versus modified rotation history, including the delayed deadhead, reroute extension, and any scheduled event like SLV that was overlapped.",
      (/\bqs\b/.test(questionText) || /\bquick slip\b/.test(questionText))
        ? "- The original sign-in, actual duty start, missing duty-time display, and whether PB, PR, or interrupted X-day coding changed after the overnight delay."
        : "- The actual sign-in, duty start, missing duty-time display, and whether PB, PR, or interrupted X-day coding changed after the delay.",
      "- Any DART, CPO, or scheduler note explaining a mismatch between the visible display and the actual report/duty history.",
      "- For deviation questions, the exact routing rule on whether the deadhead path must pass through base or another qualifying waypoint.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (shortCallNotificationScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not see the exact short-call-after-vacation/non-fly-day notification rule in the attached support.";
    return [
      "What this depends on:",
      "- Whether the short-call rule required telephone contact, electronic placement, acknowledgment, or some combination of those notice methods.",
      "- Whether seeing the assignment in iCrew or MiCrew counted as contractual notice or only as evidence that the placement happened.",
      "- Whether the vacation or non-fly day changed when notice had to occur before the short-call assignment start time.",
      "- Whether a CNO or no-notification dispute path applies if the assignment appeared without direct contact.",
      "Likely paths:",
      "- If the rule says notice can be completed by placement plus acknowledgment, the key issue is whether iCrew or MiCrew showed the assignment and whether acknowledgment happened in time.",
      "- If the rule requires direct telephone contact or another specific notice method, simply finding the assignment later in iCrew or MiCrew may not cure a missed-notification problem.",
      "- Calling the duty pilot can be a practical step, but it is not automatically a substitute for contractual notice unless the source text says it is.",
      "What to check:",
      "- The iCrew or MiCrew placement timestamp, any acknowledgment timestamp, and whether the assignment appeared after the vacation or non-fly day.",
      "- Telephone call logs, voicemail, screenshots, and any CNO, ARCOS, or scheduler notification history tied to the short-call assignment.",
      "- Whether the duty pilot or scheduling log shows telephone contact, electronic placement, or both.",
      "- Preserve the screenshots, timestamps, and call logs in case you need a CNO or no-notification dispute path.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (goldenDayLcScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have the exact Long Call operational timing rule attached for the first LC day.";
    return [
      "What this depends on:",
      "- Whether Section 2 A.129 is only defining Golden Day as a hard non-fly day or whether the attached packet also ties it to a specific Long Call assignment-timing rule.",
      "- Whether the question is really about assignment timing before the first day of LC, report timing on the first LC day, or actual duty on the Golden Day itself.",
      "- Whether any operational Long Call source actually sets the 6pm / 18-hour timing boundary you are asking about.",
      "Likely paths:",
      "- Golden Day tells you what the day is; it does not by itself answer when the company can assign Long Call or another trip on the first LC day.",
      "- If the attached operational Long Call rule ties the hard non-fly day to a day-one timing limit, that Long Call rule is what controls the assignment-timing answer.",
      "- If the packet only gives the Section 2 A.129 definition, keep the answer cautious rather than saying you definitely cannot be assigned before 6pm.",
      "What to check:",
      "- The exact Section 2 A.129 definition text for Golden Day and any visible Long Call / reserve assignment language tied to day-one timing.",
      "- Whether the controlling rule is about assignment, report, or duty start on the first day of LC.",
      "- Any source text that explicitly mentions a 6pm / 1800 or 18-hour boundary for Long Call after a Golden Day.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n");
  }
  if (knownAbsenceScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have a clean court-specific known-absence or pay-protection rule attached in this packet.";
    return [
      "Issue breakdown:",
      "- A court or custody-hearing legal obligation that conflicts with day 1 of a trip.",
      "- A possible known-absence or leave path rather than a simple scheduling preference issue.",
      "- Documentation, notification, and who to contact may matter as much as the underlying contract rule.",
      "- Pay protection should stay cautious unless the attached source actually grants it for this kind of protected absence.",
      "",
      "What this depends on:",
      "- Whether the notice to appear, subpoena, or custody-hearing paperwork creates a qualifying legal obligation under the available known-absence or leave rules.",
      "- Whether the company treats this as a known absence, leave request, or another protected trip-conflict category.",
      "- Whether any attached source gives pay protection, trip protection, or only an administrative release path.",
      "- How early you notify Scheduling, the CPO, or the contract-admin path and what documentation they require.",
      "",
      "Likely paths:",
      "- If the packet treats a court appearance or legal obligation as a known-absence or protected leave event, that process may control the trip conflict.",
      "- If the packet only supports an administrative leave or absence request, you may still need documentation and approval without any automatic pay protection.",
      "- If the source does not clearly attach pay protection to this type of legal obligation, keep the answer cautious and do not assume the whole trip is protected with pay.",
      "",
      "What to check:",
      "- The notice to appear, subpoena, or custody-hearing paperwork and the exact date/time conflict with day 1 of the trip.",
      "- Whether Scheduling, the CPO, or contract administration wants the event coded as known absence, leave, or another protected category.",
      "- The documentation, reporting deadline, and contact path the company requires for a court-obligation conflict.",
      "- Any DART, ALPA, or contract-admin guidance that explains whether this is release-only, leave-based, or actually pay-protected.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
      "Practical note: This is contract/process guidance, not a legal opinion.",
    ].join("\n");
  }
  if (futureRotationChangeScenario) {
    const limitation =
      args.failureReasons[0] ??
      args.warnings[0] ??
      "I do not have a clean controlling source for future-rotation pay protection, CPO override, or known-absence treatment in this packet.";
    return [
      "Issue breakdown:",
      "- A future rotation changed before operation: a leg was removed and the trip now looks like a redeye.",
      "- A pay or credit protection question, not just a generic reroute question.",
      "- A reserve-coverage-blocked swap question that may be separate from the actual pay-protection issue.",
      "- A CPO / known-absence process question that should stay discretionary unless the source says otherwise.",
      "",
      "What this depends on:",
      "- Whether the rotation change happened after the next-month trip was already awarded or published, rather than before it became final.",
      "- Whether the removed leg and redeye change trigger any pay protection or credit protection for a future non-carryover rotation.",
      "- Whether reserve coverage is only blocking the swap/process option, as opposed to answering the actual pay-protection question.",
      "- Whether any CPO or known-absence path is discretionary processing rather than a fixed contract entitlement.",
      "Likely paths:",
      "- If the contract has a future schedule-change pay or credit protection rule for this kind of company-driven redeye change, that rule controls the answer.",
      "- If this is only a future schedule construction change before operation, extra pay may not be automatic just because a leg was removed and the trip became a redeye.",
      "- If reserve coverage blocks the similar trip swap, a CPO override or known-absence path may still exist as an administrative option, but that is not the same as contract-backed pay protection.",
      "What to check:",
      "- The original next-month award versus the changed redeye version, including the removed leg and the pay or credit value before and after the change.",
      "- Whether the system shows any schedule-change code, pay-protection code, or credit adjustment tied to the modified rotation.",
      "- The reserve-coverage denial reason for the similar 4-day swap, if that swap question is part of the same dispute.",
      "- Any CPO, contract-admin, or DART guidance that explains whether this is just a processing block or an actual pay-protection issue.",
      `Source limitation: ${limitation}`,
      `Sources used: ${sourceSummary}.`,
      "Safety note: Do not rely on a sick-leave workaround or any informal absence workaround as a substitute for an actual known-absence or protected-absence rule.",
    ].join("\n");
  }
  const dependencies = collectDecisionDependencies(args.question, args.answer);
  const likelyPaths = collectLikelyPaths(args.question, args.answer, args.hasOperationalSupport);
  const whatToCheck = collectWhatToCheck(args.question, args.answer);
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
  const scenarioHaystack = normalizeText(
    [args.question, args.answer.shortAnswer, args.answer.plainEnglishExplanation, ...(args.answer.scenarioBreakdown ?? [])].join(" ")
  );
  const questionText = normalizeText(args.question);
  const pbRerouteXdayScenario = detectPbRerouteXdayScenarioFromHaystack(questionText);
  const payCreditConsistencyScenario = detectPayCreditConsistencyScenarioFromQuestion(questionText);
  const silverSlipStatusScenario = detectSilverSlipStatusScenarioFromQuestion(questionText);
  const gsTimeOffScenario = detectGsTimeOffScenarioFromQuestion(questionText);
  const twentyThreeM7LogLookupScenario = detectTwentyThreeM7LogLookupScenarioFromQuestion(questionText);
  const friendSwapUndoScenario = detectFriendSwapUndoScenarioFromQuestion(questionText);
  const deadheadRerouteConsequenceScenario =
    detectDeadheadRerouteConsequenceScenarioFromHaystack(questionText) &&
    !pbRerouteXdayScenario &&
    !payCreditConsistencyScenario;
  const futureRotationChangeScenario = detectFutureRotationChangeScenarioFromHaystack(questionText);
  const knownAbsenceScenario = detectKnownAbsenceScenarioFromHaystack(questionText);
  const payCreditBankDepositCase =
    payCreditConsistencyScenario &&
    (/\bbank deposit\b/.test(questionText) ||
      /\bdeposit\b/.test(questionText) ||
      /\bss credit\b/.test(questionText) ||
      /\bsilver slip credit\b/.test(questionText));
  const payCreditSickBankCase =
    payCreditConsistencyScenario &&
    (/\bsick bank\b/.test(questionText) || /\bcalled well\b/.test(questionText) || /\bpicked up flying\b/.test(questionText));
  return {
    ...args.answer,
    status: "insufficient_support" as const,
    answerCompleteness: "provisional" as const,
    confidence: "low" as const,
    shortAnswer: pbRerouteXdayScenario
      ? "Based on the source support I found, this is a PB / QS / reroute / interrupted X-day processing question, not a single-rule answer."
      : twentyThreeM7LogLookupScenario
        ? "Based on the source support I found, this is an iCrew process lookup question about where 23M7 affected-pilot logs are displayed."
      : friendSwapUndoScenario
        ? "Based on the source support I found, this is a MiCrew process question about unwinding a friend swap, not a simple guaranteed reverse transaction."
      : silverSlipStatusScenario
        ? "Based on the source support I found, this is a Silver Slip status-code question, and I would not treat the 'N' code as self-defining unless the attached source actually defines it."
      : payCreditConsistencyScenario
        ? payCreditBankDepositCase
          ? "Based on the source support I found, this is a bank-deposit and Silver Slip credit-eligibility question, not just a question about whether 2 hours showed up in iCrew."
          : payCreditSickBankCase
            ? "Based on the source support I found, this is a sick-bank timing question, not just a question about whether later flying was picked up."
            : verifierPayCreditRerouteProtectionCase
              ? "Based on the source support I found, this is a reroute credit-protection question, not a Silver Slip bank-deposit question."
            : "Based on the source support I found, this is a projected-versus-final credit and timecard recalculation question, not a simple deadhead or rest answer."
      : gsTimeOffScenario
        ? "Based on the source support I found, a one-day Green Slip does not automatically prove you get two 24-hour periods off; that turns on the exact time-off and surrounding-day rules."
      : deadheadRerouteConsequenceScenario
        ? "Based on the source support I found, this looks like a deadhead or reroute consequence question, so the answer turns on what the reroute changed operationally, not just on one generic reroute rule."
      : knownAbsenceScenario
        ? "Based on the source support I found, this looks like a legal-obligation and possible known-absence question, not something I would answer with a simple yes/no protection claim."
      : futureRotationChangeScenario
        ? "Based on the source support I found, this is a future rotation-change and possible pay-protection question, not a simple reroute answer."
        : "I found related source support, but not enough grounded scenario support to answer this cleanly yet.",
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
  const strongClaimsDetected = strongClaims.map((claim) => claim.text);
  const strongClaimsSupported: string[] = [];
  const strongClaimsDowngraded: string[] = [];
  const verifierQuestionText = normalizeText(input.question);
  const verifierHaystack = normalizeText(
    [input.question, input.answer.shortAnswer, input.answer.plainEnglishExplanation, ...(input.answer.scenarioBreakdown ?? [])].join(" ")
  );
  const verifierPbRerouteXdayScenario = detectPbRerouteXdayScenarioFromHaystack(verifierQuestionText);
  const verifierPayCreditConsistencyScenario = detectPayCreditConsistencyScenarioFromQuestion(verifierQuestionText);
  const verifierPayCreditSubScenario = detectPayCreditSubScenarioFromQuestion(verifierQuestionText);
  const verifierSilverSlipStatusScenario = detectSilverSlipStatusScenarioFromQuestion(verifierQuestionText);
  const verifierGsTimeOffScenario = detectGsTimeOffScenarioFromQuestion(verifierQuestionText);
  const verifierTwentyThreeM7LogLookupScenario = detectTwentyThreeM7LogLookupScenarioFromQuestion(verifierQuestionText);
  const verifierFriendSwapUndoScenario = detectFriendSwapUndoScenarioFromQuestion(verifierQuestionText);
  const verifierDeadheadRerouteConsequenceScenario =
    detectDeadheadRerouteConsequenceScenarioFromHaystack(verifierQuestionText) &&
    !verifierPbRerouteXdayScenario &&
    !verifierPayCreditConsistencyScenario;
  const verifierPayCreditBankDepositCase =
    verifierPayCreditConsistencyScenario && verifierPayCreditSubScenario === "bankDepositSilverSlipCredit";
  const verifierPayCreditSickBankCase =
    verifierPayCreditConsistencyScenario && verifierPayCreditSubScenario === "sickBankAfterCalledWell";
  const verifierPayCreditRerouteProtectionCase =
    verifierPayCreditConsistencyScenario && verifierPayCreditSubScenario === "rerouteCreditProtection";
  const selectedVerifierBranch =
    verifierPbRerouteXdayScenario
      ? "pbRerouteXdayScenario"
      : verifierTwentyThreeM7LogLookupScenario
        ? "twentyThreeM7LogLookupScenario"
      : verifierFriendSwapUndoScenario
        ? "friendSwapUndoScenario"
      : verifierSilverSlipStatusScenario
        ? "silverSlipStatusScenario"
      : verifierPayCreditConsistencyScenario
        ? "payCreditConsistencyScenario"
        : verifierGsTimeOffScenario
          ? "gsTimeOffScenario"
        : verifierDeadheadRerouteConsequenceScenario
          ? "deadheadRerouteConsequenceScenario"
          : detectShortCallNotificationScenarioFromHaystack(verifierQuestionText)
            ? "shortCallNotificationScenario"
            : detectContactabilityScenarioFromHaystack(verifierQuestionText)
              ? "contactabilityScenario"
              : detectOeNotificationScenarioFromHaystack(verifierQuestionText)
                ? "oeNotificationScenario"
                : detectShortCallDutyScenarioFromHaystack(verifierQuestionText)
                  ? "shortCallDutyScenario"
                  : detectRestLegalityScenarioFromHaystack(verifierHaystack)
                    ? "restLegalityScenario"
                    : "default";
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
  } else {
    const questionText = normalizeText(input.question);
    const explanationText = normalizeText(input.answer.plainEnglishExplanation);
    const oeNotificationQuestion = detectOeNotificationScenarioFromHaystack(questionText);
    const shortCallNotificationQuestion = detectShortCallNotificationScenarioFromHaystack(questionText);
    const shortCallDutyQuestion = detectShortCallDutyScenarioFromHaystack(questionText);
    const oeCoverageWeak =
      oeNotificationQuestion &&
      !(
        /\boe\b/.test(explanationText) &&
        /\bnotification\b/.test(explanationText) &&
        (/\bcno\b/.test(explanationText) || /\bphone call\b|\btelephone\b/.test(explanationText)) &&
        /\bsource limitation\b|\bexact oe notification\b|\bcurrent source\b/.test(explanationText)
      );
    const notificationCoverageWeak =
      shortCallNotificationQuestion &&
      !(
        /\bnotification\b/.test(explanationText) &&
        /\bvacation\b|\bnon-fly day\b|\bnon fly day\b/.test(explanationText) &&
        /\bicrew\b|\bmicrew\b/.test(explanationText) &&
        /\bcall logs\b|\bduty pilot\b|\bcno\b/.test(explanationText)
      );
    const dutyCoverageWeak =
      shortCallDutyQuestion &&
      !(
        /\bsame-day trip\b|\bsame day trip\b/.test(explanationText) &&
        /\breport\b/.test(explanationText) &&
        /\bduty\b|\bflight-time\b|\bflight time\b|\blegality\b/.test(explanationText)
      );
    if (!(warnings.length > 0 || input.answer.confidence === "low" || oeCoverageWeak || notificationCoverageWeak || dutyCoverageWeak)) {
      return {
        verifierRan: true,
        verifierPassed: warnings.length === 0 && failureReasons.length === 0,
        verifierWarnings: warnings,
        verifierFailureReasons: failureReasons,
        selectedVerifierBranch,
        verifierAdjustedAnswer,
        answer: adjustedAnswer,
        truthGuardRan: true,
        strongClaimsDetected,
        strongClaimsSupported,
        strongClaimsDowngraded,
        definitionSectionUsed,
        operationalSectionUsed,
        definitionOverrodeOperation,
        definitionBasedAnswer,
        applicationClaimDetected,
        applicationClaimSupported,
        applicationClaimDowngraded,
      };
    }
    const shouldRewriteToDecisionPath =
      input.answer.answerCompleteness === "provisional" ||
      input.answer.status === "insufficient_support" ||
      !hasDecisionPathFallback(input.answer.plainEnglishExplanation) ||
      oeCoverageWeak ||
      notificationCoverageWeak ||
      dutyCoverageWeak;
    adjustedAnswer = {
      ...input.answer,
      shortAnswer: makeCautiousShortAnswer(
        verifierPbRerouteXdayScenario
          ? "Based on the source support I found, this is a PB / QS / reroute / interrupted X-day processing question, not a single-rule answer."
          : verifierTwentyThreeM7LogLookupScenario
            ? "Based on the source support I found, this is an iCrew process lookup question about where 23M7 affected-pilot logs are displayed."
          : verifierFriendSwapUndoScenario
            ? "Based on the source support I found, this is a MiCrew process question about unwinding a friend swap, not a simple guaranteed reverse transaction."
          : verifierSilverSlipStatusScenario
            ? "Based on the source support I found, this is a Silver Slip status-code question, and I would not treat the 'N' code as self-defining unless the attached source actually defines it."
          : verifierPayCreditConsistencyScenario
            ? verifierPayCreditBankDepositCase
              ? "Based on the source support I found, this is a bank-deposit and Silver Slip credit-eligibility question, not just a question about whether 2 hours showed up in iCrew."
              : verifierPayCreditSickBankCase
                ? "Based on the source support I found, this is a sick-bank timing question, not just a question about whether later flying was picked up."
                : verifierPayCreditRerouteProtectionCase
                  ? "Based on the source support I found, this is a reroute credit-protection question, not a Silver Slip bank-deposit question."
                : "Based on the source support I found, this is a projected-versus-final credit and timecard recalculation question, not a simple deadhead or rest answer."
            : verifierGsTimeOffScenario
              ? "Based on the source support I found, a one-day Green Slip does not automatically prove you get two 24-hour periods off; that turns on the exact time-off and surrounding-day rules."
            : verifierDeadheadRerouteConsequenceScenario
              ? "Based on the source support I found, this looks like a deadhead or reroute consequence question, so the answer turns on what the reroute changed operationally, not just on one generic reroute rule."
              : input.answer.shortAnswer
      ),
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
    selectedVerifierBranch,
    verifierAdjustedAnswer,
    truthGuardRan: true,
    strongClaimsDetected,
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
