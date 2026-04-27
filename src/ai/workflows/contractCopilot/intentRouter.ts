import type { PayEquipmentLabel, PaySeat } from "../../../data/payScales.ts";
import type { ParsedScenarioFacts } from "../../../types/contractCopilot.ts";

export type ContractCopilotIntentType =
  | "direct_lookup"
  | "calculation"
  | "contract_scenario"
  | "document_explanation"
  | "clarification_needed";

export type ContractCopilotSelectedLane =
  | "direct_pay_rate_lookup"
  | "direct_term_lookup"
  | "apd_threshold_calculation"
  | "document_section_explanation"
  | "contract_scenario_retrieval"
  | "clarification_needed";

export type ParsedPayRateQuestion = {
  isPayRateQuestion: boolean;
  seat?: PaySeat;
  longevityYear?: number;
  matchedEquipmentLabels: PayEquipmentLabel[];
};

export type ContractCopilotIntentResolution = {
  intentType: ContractCopilotIntentType;
  selectedLane: ContractCopilotSelectedLane;
  requiredFields: string[];
  requiredFieldsFound: string[];
  missingFields: string[];
  sourcePriority: string[];
  aiSynthesisAllowed: boolean;
  deterministicToolsFirst: boolean;
  toolsUsed: string[];
  parsedPayRateQuestion?: ParsedPayRateQuestion;
  requestedSection?: string;
};

function parseLongevityYear(question: string) {
  const lower = question.toLowerCase();
  const directMatch =
    lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?[- ]?year\b/) ??
    lower.match(/\byear\s+(\d{1,2})\b/) ??
    lower.match(/\b(\d{1,2})\s*yr\b/);

  if (!directMatch) {
    return null;
  }

  const parsed = Number(directMatch[1]);
  return Number.isInteger(parsed) ? parsed : null;
}

function parsePaySeat(question: string): PaySeat | undefined {
  const lower = question.toLowerCase();
  if (/\bfirst officer\b/.test(lower) || /\bfo\b/.test(lower) || /\bf\/o\b/.test(lower)) {
    return "First Officer";
  }
  if (/\bcaptain\b/.test(lower) || /\bca\b/.test(lower) || /\bcapt\b/.test(lower)) {
    return "Captain";
  }
  return undefined;
}

function detectPayEquipmentLabels(question: string): PayEquipmentLabel[] {
  const lower = question.toLowerCase();
  const matches = new Set<PayEquipmentLabel>();

  const aliasMap: Array<{ label: PayEquipmentLabel; patterns: RegExp[] }> = [
    { label: "A-220-300", patterns: [/\ba[- ]?220[- ]?300\b/, /\ba220[- ]?300\b/, /\b220[- ]?300\b/, /\b220[- ]?3\b/] },
    { label: "A-220-100", patterns: [/\ba[- ]?220[- ]?100\b/, /\ba220[- ]?100\b/, /\b220[- ]?100\b/] },
    { label: "A-321N", patterns: [/\ba321n\b/, /\ba[- ]?321n\b/, /\b321neo\b/, /\b321 neo\b/] },
    { label: "A-321", patterns: [/\ba321\b/, /\ba[- ]?321\b/] },
    { label: "A-320/319", patterns: [/\ba320\b/, /\ba319\b/, /\ba[- ]?320\b/, /\ba[- ]?319\b/] },
    { label: "A-330", patterns: [/\ba330\b/, /\ba[- ]?330\b/] },
    { label: "A-350", patterns: [/\ba350\b/, /\ba[- ]?350\b/] },
    { label: "B-717", patterns: [/\b717\b/, /\bb[- ]?717\b/] },
    { label: "B-737-900", patterns: [/\b737[- ]?900\b/, /\b73n\b/] },
    { label: "B-737-800/700", patterns: [/\b737[- ]?(800|700)\b/] },
    { label: "B-757", patterns: [/\b757\b/, /\bb[- ]?757\b/] },
    { label: "B-767-300ER", patterns: [/\b767[- ]?300er\b/, /\b765\b/] },
    { label: "B-767-400ER", patterns: [/\b767[- ]?400er\b/, /\b7er\b/] },
    { label: "B-777", patterns: [/\b777\b/, /\bb[- ]?777\b/] },
    { label: "B-787", patterns: [/\b787\b/, /\bb[- ]?787\b/] },
    { label: "EMB-195", patterns: [/\bemb[- ]?195\b/, /\be195\b/, /\b195\b/] },
    { label: "EMB-190/CRJ-900", patterns: [/\bemb[- ]?190\b/, /\be190\b/, /\bcrj[- ]?900\b/] },
  ];

  for (const entry of aliasMap) {
    if (entry.patterns.some((pattern) => pattern.test(lower))) {
      matches.add(entry.label);
    }
  }

  if (/\ba220\b/.test(lower) || /\ba[- ]?220\b/.test(lower)) {
    if (!matches.has("A-220-100") && !matches.has("A-220-300")) {
      matches.add("A-220-100");
      matches.add("A-220-300");
    }
  }

  return Array.from(matches);
}

export function parsePayRateQuestion(question: string): ParsedPayRateQuestion {
  const lower = question.toLowerCase();
  const payPatterns = [
    "pay rate",
    "hourly pay",
    "hourly block pay",
    "block pay rate",
    "hourly rate",
    "what do i make",
  ];
  const mentionsSpecificPayRate =
    payPatterns.some((phrase) => lower.includes(phrase));
  const mentionsCompBuckets =
    lower.includes("daily pay rate") ||
    lower.includes("monthly compensation") ||
    lower.includes("annual compensation") ||
    lower.includes("monthly guarantee") ||
    lower.includes("daily rate");
  const scenarioPaySignals =
    lower.includes("how should this pay") ||
    lower.includes("how will this pay") ||
    lower.includes("how does this pay") ||
    lower.includes("picked up") ||
    lower.includes("greenslip") ||
    lower.includes("green slip") ||
    /\bgs\b/.test(lower) ||
    lower.includes("sick") ||
    lower.includes("reroute") ||
    lower.includes("deadhead") ||
    lower.includes("inverse assignment");
  const seat = parsePaySeat(question);
  const longevityYear = parseLongevityYear(question);
  const matchedEquipmentLabels = detectPayEquipmentLabels(question);
  const hasStructuredPayFields = seat !== undefined && longevityYear !== null && matchedEquipmentLabels.length > 0;

  const isPayRateQuestion =
    (mentionsSpecificPayRate || hasStructuredPayFields) &&
    !scenarioPaySignals &&
    !lower.includes("guarantee") &&
    !lower.includes("alv") &&
    !lower.includes("adg");

  return {
    isPayRateQuestion,
    seat,
    longevityYear: longevityYear ?? undefined,
    matchedEquipmentLabels,
  };
}

function parseRequestedSection(question: string) {
  const sectionMatch =
    question.match(/\b(\d{1,2}[A-Z]\d+)\b/i) ??
    question.match(/\bsection\s+(\d{1,2}\s+[A-Z]\.?\d+)\b/i) ??
    question.match(/\bpwa\s+(\d{1,2}\s+[A-Z]\.?\d+)\b/i) ??
    question.match(/§\s*(\d{1,2}\s+[A-Z]\.?\d+)\b/i) ??
    question.match(/\bsection\s+(\d{1,2}(?:\s*\([A-Z]\)|\s+[A-Z](?:\.?\d+)?)?(?:\.\d+)?(?:\.[A-Z])?)/i) ??
    question.match(/\bpwa\s+(\d{1,2}(?:\s*\([A-Z]\)|\s+[A-Z](?:\.?\d+)?)?(?:\.\d+)?(?:\.[A-Z])?)/i) ??
    question.match(/§\s*(\d{1,2}(?:\s*\([A-Z]\)|\s+[A-Z](?:\.?\d+)?)?(?:\.\d+)?(?:\.[A-Z])?)/i) ??
    question.match(/\b(\d{1,2}\s*\([A-Z]\)|\d{1,2}\s+[A-Z](?:\.?\d+)?|(\d{1,2}\.[A-Z](?:\.\d+)?))\b/i);

  if (!sectionMatch) {
    return undefined;
  }

  const normalized = sectionMatch[1]
    .replace(/^(\d{1,2})([A-Z])(\d+)$/i, "$1 $2.$3")
    .replace(/\s*\(([A-Z])\)/i, " $1")
    .replace(/(\d{1,2})\.\s*([A-Z])/i, "$1 $2")
    .replace(/([A-Z])(\d+)/i, "$1.$2")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  return `Section ${normalized}`;
}

function hasComparisonApplicationCue(question: string) {
  const lower = question.toLowerCase();
  return (
    /\bvs\b/.test(lower) ||
    lower.includes("similar to") ||
    lower.includes("compare") ||
    lower.includes("doesn't that mean") ||
    lower.includes("does that mean") ||
    lower.includes("how does this apply") ||
    lower.includes("how does this compare") ||
    lower.includes("do i have to") ||
    lower.includes("do you need to") ||
    lower.includes("threshold") ||
    lower.includes("difference between")
  );
}

function hasRecognizableContractTerm(question: string) {
  const lower = question.toLowerCase();
  return (
    /\bgs\b/.test(lower) ||
    lower.includes("greenslip") ||
    lower.includes("green slip") ||
    lower.includes("gswc") ||
    lower.includes("silver slip") ||
    lower.includes("qs") ||
    lower.includes("quick slip") ||
    lower.includes("reserve") ||
    lower.includes("lc") ||
    lower.includes("long call") ||
    lower.includes("short call") ||
    lower.includes("airport standby") ||
    lower.includes("yellow slip") ||
    lower.includes("wocl") ||
    lower.includes("8d3") ||
    lower.includes("golden day") ||
    lower.includes("hard non-fly day") ||
    lower.includes("harmed pilot") ||
    lower.includes("auto accept") ||
    lower.includes("apd")
  );
}

function isDocumentExplanationQuestion(question: string) {
  const lower = question.toLowerCase();
  const operationalApplicationCue =
    hasComparisonApplicationCue(question) ||
    lower.includes("doesn't that mean") ||
    lower.includes("does that mean") ||
    lower.includes("how does this apply") ||
    lower.includes("can they") ||
    lower.includes("can i") ||
    lower.includes("can't be") ||
    lower.includes("assigned") ||
    lower.includes("before") ||
    lower.includes("after") ||
    lower.includes("day one") ||
    lower.includes("day before") ||
    lower.includes("hard non-fly day") ||
    lower.includes("worthless") ||
    lower.includes("am i due") ||
    lower.includes("do i get") ||
    lower.includes("what happens if");
  const asksAboutSection =
    lower.includes("what does section") ||
    lower.includes("what holidays does section") ||
    lower.includes("what does 23") ||
    lower.includes("what is section") ||
    lower.includes("what is pwa") ||
    lower.includes("what does it say") ||
    lower.includes("explain section") ||
    lower.startsWith("section ") ||
    lower.startsWith("pwa ") ||
    lower.startsWith("§") ||
    lower.includes("summarize section") ||
    lower.includes("tell me about section");
  const hasSectionReference =
    Boolean(parseRequestedSection(question)) ||
    /\b(section|pwa)\s+\d{1,2}/i.test(question) ||
    /§\s*\d{1,2}/i.test(question);
  const compactSectionProcessLookup =
    /\b23m7\b/i.test(question) &&
    (
      lower.includes("where are") ||
      lower.includes("affected pilots") ||
      lower.includes("logs") ||
      lower.includes("shown") ||
      lower.includes("icrew")
    );
  return (asksAboutSection && hasSectionReference && !operationalApplicationCue) || compactSectionProcessLookup;
}

function isPureTermLookup(question: string) {
  const lower = question.toLowerCase();
  const shortCallNotificationOverride =
    (lower.includes("short call assignment") || lower.includes("short call") || lower.includes("long call") || /\blc\b/.test(lower)) &&
    (
      lower.includes("notification") ||
      lower.includes("no notification") ||
      lower.includes("vacation") ||
      lower.includes("non-fly day") ||
      lower.includes("non fly day") ||
      lower.includes("micrew placement") ||
      lower.includes("icrew placement") ||
      lower.includes("acknowledge") ||
      lower.includes("acknowledgment") ||
      lower.includes("cno") ||
      lower.includes("call duty pilot")
    );
  const silverSlipStatusLookup =
    lower.includes("silver slip") &&
    (lower.includes("what does") || lower.includes("status")) &&
    (/\b['"]?[a-z]['"]?\b/.test(lower) || lower.includes("mean"));
  const comparisonApplicationCue = hasComparisonApplicationCue(question) && hasRecognizableContractTerm(question);
  const contactabilityScenarioCue =
    lower.includes("contactable") ||
    lower.includes("answer the phone") ||
    lower.includes("phone call") ||
    lower.includes("acars") ||
    lower.includes("airport sit") ||
    lower.includes("between flights") ||
    lower.includes("on duty") ||
    lower.includes("off duty") ||
    lower.includes("obligation to respond") ||
    lower.includes("acknowledge") ||
    lower.includes("check your schedule") ||
    lower.includes("end of short call");
  const generalHypotheticalTermCue =
    lower.includes("if i never fly") ||
    lower.includes("if i do not get used") ||
    lower.includes("if i don't get used") ||
    lower.includes("if i never get called") ||
    lower.includes("if i do not get called") ||
    lower.includes("if i don't get called");
  const scenarioCue =
    (lower.includes("if i") && !generalHypotheticalTermCue) ||
    lower.includes("can i") ||
    lower.includes("can they") ||
    lower.includes("must they") ||
    lower.includes("is it legal") ||
    lower.includes("do you need 10 hours") ||
    lower.includes("how should") ||
    lower.includes("how does this apply") ||
    lower.includes("does that mean") ||
    lower.includes("doesn't that mean") ||
    lower.includes("what happens") ||
    lower.includes("what happens if") ||
    lower.includes("x-day") ||
    lower.includes("x day") ||
    lower.includes("overlap") ||
    lower.includes("overlaps") ||
    lower.includes("same day") ||
    lower.includes("starts that same day") ||
    lower.includes("picked up") ||
    lower.includes("called in sick") ||
    lower.includes("sick day") ||
    lower.includes("assigned") ||
    lower.includes("assignment") ||
    lower.includes("removed") ||
    lower.includes("replaced") ||
    lower.includes("specific timing") ||
    lower.includes("duration") ||
    lower.includes("far legal") ||
    lower.includes("release with pay") ||
    lower.includes("30-hour rest") ||
    lower.includes("30 hour rest") ||
    lower.includes("24-hour") ||
    lower.includes("24 hour") ||
    lower.includes("periods off") ||
    lower.includes("generate two") ||
    lower.includes("one-day gs") ||
    lower.includes("one day gs") ||
    lower.includes("illegal rotation") ||
    lower.includes("rotation illegal") ||
    /\b\d+\s*-\s*day\b/.test(lower) ||
    /\b\d+\s*day\b/.test(lower) ||
    /\b\d+\s*-\s*day\b/.test(lower) ||
    /\breserve\b/.test(lower) ||
    /\btrip\b/.test(lower);
  return !shortCallNotificationOverride && (silverSlipStatusLookup || (!comparisonApplicationCue && !contactabilityScenarioCue && (
    lower.includes("what is alv") ||
    lower.includes("average line value") ||
    lower.includes("how do i determine alv") ||
    lower.includes("how is alv used") ||
    lower.includes("what is adg") ||
    lower.includes("what is the minimum daily guarantee") ||
    lower.includes("what is the minimum guarantee") ||
    lower.includes("reserve guarantee") ||
    lower.includes("line guarantee") ||
    lower.includes("airport standby") ||
    lower.includes("yellow slip") ||
    lower.includes("yellowslip") ||
    (lower.includes("gswc") && !scenarioCue) ||
    (/\bgs\b/.test(lower) && !scenarioCue) ||
    (lower.includes("greenslip") && !scenarioCue) ||
    (lower.includes("short call") && !scenarioCue) ||
    (lower.includes("long call") && !scenarioCue) ||
    (generalHypotheticalTermCue &&
      (lower.includes("short call") ||
        lower.includes("airport standby") ||
        lower.includes("reserve guarantee") ||
        lower.includes("reserve")))
  )));
}

function extractApdCounts(question: string) {
  const lower = question.toLowerCase();
  const requiredPatterns = [
    /\brequired reserves?(?:\s+are|\s+is|\s+were|=)?\s*(\d+(?:\.\d+)?)/,
    /\breserves required(?:\s+for(?:\s+that)?\s+day)?(?:\s+are|\s+is|\s+were|=)?\s*(\d+(?:\.\d+)?)/,
    /\brequired\s+(\d+(?:\.\d+)?)/,
    /\brequired\s+is\s+(\d+(?:\.\d+)?)/,
    /\b(\d+(?:\.\d+)?)\s+required\b/,
    /\bneed\s+(\d+(?:\.\d+)?)\s+reserves?\b/,
    /\bneeds?\s+(\d+(?:\.\d+)?)\s+reserves?\b/,
    /\bcounts?\s+were\s+(\d+(?:\.\d+)?)\s+required\b/,
  ];
  const availablePatterns = [
    /\bavailable(?:\s+are|\s+is|\s+was|\s+were|=)?\s*(\d+(?:\.\d+)?)/,
    /\breserves available(?:\s+are|\s+is|\s+was|\s+were|=)?\s*(\d+(?:\.\d+)?)/,
    /\bhave\s+(\d+(?:\.\d+)?)\s+available\b/,
    /\bavailable\s+(\d+(?:\.\d+)?)/,
    /\b(\d+(?:\.\d+)?)\s+available\b/,
  ];
  const required = requiredPatterns
    .map((pattern) => lower.match(pattern))
    .find(Boolean)?.[1];
  const available = availablePatterns
    .map((pattern) => lower.match(pattern))
    .find(Boolean)?.[1];

  return {
    required: required ? Number(required) : null,
    available: available ? Number(available) : null,
  };
}

function isApdCalculation(question: string) {
  const lower = question.toLowerCase();
  const counts = extractApdCounts(question);
  const isDiagnosticOrScenario =
    lower.includes("why was") ||
    lower.includes("still be denied") ||
    lower.includes("holiday") ||
    lower.includes("restriction");
  return (
    (/\bapd\b/.test(lower) || lower.includes("authorized personal drop")) &&
    counts.required !== null &&
    counts.available !== null &&
    !isDiagnosticOrScenario
  );
}

function isContractScenarioQuestion(question: string, facts: ParsedScenarioFacts) {
  const lower = question.toLowerCase();
  const forcedRestLegalityScenario =
    lower.includes("30-hour rest") ||
    lower.includes("30 hour rest") ||
    lower.includes("far legal") ||
    lower.includes("pwa requirement") ||
    lower.includes("release with pay");
  const comparisonApplicationCue = hasComparisonApplicationCue(question) && hasRecognizableContractTerm(question);
  const generalHypotheticalTermCue =
    lower.includes("if i never fly") ||
    lower.includes("if i do not get used") ||
    lower.includes("if i don't get used") ||
    lower.includes("if i never get called") ||
    lower.includes("if i do not get called") ||
    lower.includes("if i don't get called");
  const scenarioWording =
    (lower.includes("if i") && !generalHypotheticalTermCue) ||
    lower.includes("can i") ||
    lower.includes("do i need") ||
    lower.includes("how should this pay") ||
    lower.includes("how should that pay") ||
    lower.includes("how will this pay") ||
    lower.includes("what happens if") ||
    lower.includes("which rule controls") ||
    lower.includes("how should this") ||
    lower.includes("what should i look at") ||
    lower.includes("how does this pay") ||
    lower.includes("how should it pay") ||
    lower.includes("why was") ||
    lower.includes("denied") ||
    lower.includes("stack") ||
    lower.includes("conflict") ||
    lower.includes("picked up") ||
    lower.includes("called in sick") ||
    lower.includes("sick day") ||
    lower.includes("same day") ||
    lower.includes("starts that same day") ||
    lower.includes("overlap") ||
    lower.includes("overlaps") ||
    lower.includes("inside my sick leave period") ||
    lower.includes("inside the sick period") ||
    lower.includes("assigned") ||
    lower.includes("assignment") ||
    lower.includes("reassigned") ||
    lower.includes("removed") ||
    lower.includes("replaced") ||
    lower.includes("driving in") ||
    lower.includes("contactable") ||
    lower.includes("answer the phone") ||
    lower.includes("between flights") ||
    lower.includes("airport sit") ||
    lower.includes("check your schedule") ||
    lower.includes("end of short call") ||
    lower.includes("where are") ||
    lower.includes("where can i find") ||
    lower.includes("swap it back") ||
    lower.includes("while i'm driving in") ||
    lower.includes("while i am driving in") ||
    lower.includes("before report") ||
    lower.includes("after report") ||
    lower.includes("report") ||
    lower.includes("assignment timing") ||
    lower.includes("pay protection") ||
    lower.includes("single pay no credit") ||
    lower.includes("crossover") ||
    /\b\d+\s*-\s*day\b/.test(lower) ||
    /\b\d+\s*day\b/.test(lower);
  const recognizableTopic =
    lower.includes("sick") ||
    lower.includes("greenslip") ||
    lower.includes("gswc") ||
    /\bgs\b/.test(lower) ||
    lower.includes("reroute") ||
    lower.includes("deadhead") ||
    lower.includes("inverse assignment") ||
    lower.includes("reassigned") ||
    lower.includes("long call") ||
    lower.includes("short call") ||
    lower.includes("airport standby") ||
    lower.includes("harmed pilot") ||
    lower.includes("auto accept") ||
    lower.includes("silver slip") ||
    lower.includes("quick slip") ||
    lower.includes("pickup") ||
    lower.includes("called in sick") ||
    lower.includes("apd") ||
    lower.includes("authorized personal drop") ||
    lower.includes("holiday") ||
    lower.includes("wocl") ||
    lower.includes("8d3") ||
    lower.includes("asterisk rotation") ||
    lower.includes("bid period crossover") ||
    lower.includes("bid period") ||
    lower.includes("far legal") ||
    lower.includes("release with pay") ||
    lower.includes("30-hour rest") ||
    lower.includes("30 hour rest") ||
    lower.includes("illegal rotation") ||
    lower.includes("rotation illegal") ||
    lower.includes("dh-only") ||
    lower.includes("dh only") ||
    lower.includes("fdp") ||
    lower.includes("rotation guarantee") ||
    lower.includes("acars") ||
    lower.includes("phone call") ||
    lower.includes("on duty") ||
    lower.includes("off duty") ||
    lower.includes("acknowledge") ||
    lower.includes("contactable") ||
    lower.includes("golden day") ||
    lower.includes("hard non-fly day") ||
    lower.includes("line check");
  const processToolTopic =
    lower.includes("23m7") ||
    lower.includes("affected pilots") ||
    (lower.includes("logs") && lower.includes("icrew")) ||
    lower.includes("open time menu") ||
    lower.includes("display 23m7 logs") ||
    lower.includes("friend swap") ||
    lower.includes("swapped with a friend") ||
    lower.includes("micrew") ||
    lower.includes("white slip") ||
    lower.includes("personal drop") ||
    lower.includes("blind slip");
  return (
    forcedRestLegalityScenario ||
    comparisonApplicationCue ||
    (processToolTopic && scenarioWording) ||
    (recognizableTopic && scenarioWording) ||
    lower.includes("called in sick") ||
    facts.rerouteOccurred === true ||
    facts.sickUsed === true
  );
}

export function resolveContractCopilotIntent(args: {
  question: string;
  facts: ParsedScenarioFacts;
}): ContractCopilotIntentResolution {
  const parsedPayRate = parsePayRateQuestion(args.question);

  if (parsedPayRate.isPayRateQuestion) {
    const requiredFields = ["equipment", "seat", "longevityYear"];
    const requiredFieldsFound = [
      parsedPayRate.matchedEquipmentLabels.length > 0 ? "equipment" : null,
      parsedPayRate.seat ? "seat" : null,
      parsedPayRate.longevityYear ? "longevityYear" : null,
    ].filter((value): value is string => value !== null);
    const missingFields = requiredFields.filter((field) => !requiredFieldsFound.includes(field));

    if (missingFields.length > 0) {
      return {
        intentType: "clarification_needed",
        selectedLane: "clarification_needed",
        requiredFields,
        requiredFieldsFound,
        missingFields,
        sourcePriority: ["compensation_manual_structured_rows"],
        aiSynthesisAllowed: false,
        deterministicToolsFirst: true,
        toolsUsed: ["pay_rate_parser"],
        parsedPayRateQuestion: parsedPayRate,
      };
    }

    return {
      intentType: "direct_lookup",
      selectedLane: "direct_pay_rate_lookup",
      requiredFields,
      requiredFieldsFound,
      missingFields: [],
      sourcePriority: ["compensation_manual_structured_rows"],
      aiSynthesisAllowed: false,
      deterministicToolsFirst: true,
      toolsUsed: ["pay_rate_parser", "structured_pay_rate_lookup"],
      parsedPayRateQuestion: parsedPayRate,
    };
  }

  if (isApdCalculation(args.question)) {
    const counts = extractApdCounts(args.question);
    const requiredFieldsFound = [
      counts.required !== null
        ? "requiredReserves"
        : null,
      counts.available !== null
        ? "availableReserves"
        : null,
    ].filter((value): value is string => value !== null);
    const requiredFields = ["requiredReserves", "availableReserves"];

    return {
      intentType: "calculation",
      selectedLane: "apd_threshold_calculation",
      requiredFields,
      requiredFieldsFound,
      missingFields: requiredFields.filter((field) => !requiredFieldsFound.includes(field)),
      sourcePriority: ["pwa", "scheduler_manual"],
      aiSynthesisAllowed: true,
      deterministicToolsFirst: true,
      toolsUsed: ["apd_threshold_parser"],
    };
  }

  if (isDocumentExplanationQuestion(args.question)) {
    return {
      intentType: "document_explanation",
      selectedLane: "document_section_explanation",
      requiredFields: ["section"],
      requiredFieldsFound: parseRequestedSection(args.question) ? ["section"] : [],
      missingFields: parseRequestedSection(args.question) ? [] : ["section"],
      sourcePriority: ["pwa", "compensation_manual", "scheduler_manual"],
      aiSynthesisAllowed: true,
      deterministicToolsFirst: false,
      toolsUsed: ["section_packet_retrieval"],
      requestedSection: parseRequestedSection(args.question),
    };
  }

  if (
    (/\bapd\b/.test(args.question.toLowerCase()) ||
      args.question.toLowerCase().includes("authorized personal drop")) &&
    (
      args.question.toLowerCase().includes("why was") ||
      args.question.toLowerCase().includes("still be denied") ||
      args.question.toLowerCase().includes("holiday")
    )
  ) {
    return {
      intentType: "contract_scenario",
      selectedLane: "contract_scenario_retrieval",
      requiredFields: ["question"],
      requiredFieldsFound: ["question"],
      missingFields: [],
      sourcePriority: ["pwa", "scheduler_manual", "compensation_manual", "crewtools_logic"],
      aiSynthesisAllowed: true,
      deterministicToolsFirst: false,
      toolsUsed: ["scenario_classifier", "section_aware_retrieval"],
    };
  }

  if (isContractScenarioQuestion(args.question, args.facts)) {
    return {
      intentType: "contract_scenario",
      selectedLane: "contract_scenario_retrieval",
      requiredFields: ["question"],
      requiredFieldsFound: ["question"],
      missingFields: [],
      sourcePriority: ["pwa", "compensation_manual", "scheduler_manual", "crewtools_logic"],
      aiSynthesisAllowed: true,
      deterministicToolsFirst: false,
      toolsUsed: ["scenario_classifier", "section_aware_retrieval"],
    };
  }

  if (isPureTermLookup(args.question)) {
    return {
      intentType: "direct_lookup",
      selectedLane: "direct_term_lookup",
      requiredFields: ["term"],
      requiredFieldsFound: ["term"],
      missingFields: [],
      sourcePriority: ["pwa", "compensation_manual"],
      aiSynthesisAllowed: true,
      deterministicToolsFirst: false,
      toolsUsed: ["term_lookup_router"],
    };
  }

  return {
    intentType: "clarification_needed",
    selectedLane: "clarification_needed",
    requiredFields: ["question_scope"],
    requiredFieldsFound: [],
    missingFields: ["question_scope"],
    sourcePriority: ["pwa", "compensation_manual", "scheduler_manual"],
    aiSynthesisAllowed: true,
    deterministicToolsFirst: false,
    toolsUsed: ["intent_router"],
  };
}
