import { createOpenAIModelClient } from "../../../src/ai/core/openAIModelClient.ts";
import { consoleAIWorkflowLogger } from "../../../src/ai/core/logger.ts";
import type { AIGroundingSnippet } from "../../../src/ai/retrieval/index.ts";
import type { SectionAwareGroundingPacket } from "../../../src/ai/retrieval/types.ts";
import {
  assembleContractGroundingContext,
  buildSectionAwarePackets,
  determineSourcePriorityForQuestion,
  expandContractMatches,
  filterChunksForGoverningRoute,
  getActiveKnownInteractionRules,
  hasUsableGoverningPackets,
  hasUsableRuleMatches,
  linkRelatedContractSections,
  resolveGoverningSections,
  searchContractDocuments,
} from "../../../src/ai/retrieval/contracts/index.ts";
import { runAIWorkflow } from "../../../src/ai/core/workflowRunner.ts";
import {
  contractCopilotAIWorkflow,
  contractCopilotFinalSynthesisWorkflow,
  contractCopilotApiRequestSchema,
  type ContractCopilotAIOutput,
  type ContractCopilotAIRetrievedSupportItem,
  type ContractCopilotApiErrorResponse,
  type ContractCopilotApiSuccessResponse,
  executeContractCopilotLane,
  type ContractCopilotIntentResolution,
  type ParsedPayRateQuestion,
  resolveContractCopilotIntent,
  retrieveContractCopilotSnippets,
  synthesizeContractCopilotTopAnswer,
  verifyContractScenarioAnswer,
} from "../../../src/ai/workflows/contractCopilot/index.ts";
import { AIValidationError } from "../../../src/ai/core/errors.ts";
import type {
  ClarifyingQuestion,
  ContractAnswerCard,
  ContractQuickReply,
  ContractCopilotSession,
  CopilotScenarioFamily,
  ParsedScenarioFacts,
  RuleType,
  SupportLevel,
} from "../../../src/types/contractCopilot.ts";
import { runContractCopilot } from "../../../src/utils/contractCopilot/contractCopilotEngine.ts";
import { validateWithSchema } from "../../../src/ai/core/validation.ts";
import { loadContractDocumentIndex } from "../../lib/contractSearch/loadContractIndex.ts";
import type { PayEquipmentLabel, PaySeat } from "../../../src/data/payScales.ts";
import type { ContractDocumentChunk } from "../../../src/ai/retrieval/contracts/documentTypes.ts";

const emptySession: ContractCopilotSession = {
  sessionId: "server-contract-copilot-session",
  facts: {},
  clarificationCount: 0,
  turns: [],
  status: "idle",
};

type StructuredPayRow = {
  equipmentLabel: string;
  seat: string;
  longevityYear: number;
  hourlyRate: number;
};

function findStructuredPayRate(args: {
  rows: StructuredPayRow[];
  seat: PaySeat;
  equipmentLabel: PayEquipmentLabel;
  longevityYear: number;
}) {
  return (
    args.rows.find(
      (row) =>
        row.seat === args.seat &&
        row.equipmentLabel === args.equipmentLabel &&
        row.longevityYear === args.longevityYear
    )?.hourlyRate ?? null
  );
}

function buildDirectPayRateResponse(args: {
  question: string;
  session: ContractCopilotSession;
  parsed: ParsedPayRateQuestion;
  compensationStructuredPayRows: StructuredPayRow[];
  hasCompensationIndex: boolean;
  intentDebug: Pick<
    NonNullable<ContractCopilotApiSuccessResponse["debug"]>,
    "intentType" | "selectedLane" | "requiredFieldsFound" | "missingFields" | "toolsUsed"
  >;
}): ContractCopilotApiSuccessResponse | null {
  if (!args.parsed.isPayRateQuestion || !args.parsed.seat || !args.parsed.longevityYear) {
    return null;
  }

  const nextSession: ContractCopilotSession = {
    ...args.session,
    unresolvedQuestion: undefined,
    status: "answered",
  };

  const references: ContractCopilotApiSuccessResponse["answer"]["references"] = [];
  const matchedEquipmentLabels = args.parsed.matchedEquipmentLabels;
  const rows = args.compensationStructuredPayRows;

  if (!args.hasCompensationIndex || rows.length === 0) {
    return {
      ok: true,
      mode: "fallback",
      answer: {
        status: "insufficient_support",
        scenarioLabel: "Direct pay rate lookup",
        answerCompleteness: "provisional",
        shortAnswer: "I can do exact pay-rate lookups once the compensation index is built, but it is missing right now.",
        plainEnglishExplanation: "Compensation index missing; rebuild with npm run build:compensation-index.",
        confidence: "low",
        supportLevel: "inference_heavy",
        assumptions: [],
        evidenceSummary: [],
        references: [],
      },
      detectedScenario: null,
      nextSession,
      meta: {
        fallbackReason: "missing_compensation_index",
      },
        debug:
          process.env.NODE_ENV !== "production"
            ? {
                mode: "fallback",
                fallbackReason: "Compensation index missing; rebuild with npm run build:compensation-index",
                groundingSource: "fallback",
                usedRetrievedSupport: false,
                hasCompensationIndex: false,
                directLookupTriggered: true,
                directLookupType: "pay_rate",
                parsedEquipment: matchedEquipmentLabels,
                parsedSeat: args.parsed.seat,
                parsedLongevityYear: args.parsed.longevityYear,
                compensationRowsAvailable: rows.length,
                lookupSource: "compensationManualIndex.json",
                retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
                aiSynthesisUsed: false,
                ...args.intentDebug,
              }
          : undefined,
    };
  }

  if (matchedEquipmentLabels.length === 1) {
    const equipmentLabel = matchedEquipmentLabels[0];
    const rate = findStructuredPayRate({
      rows,
      seat: args.parsed.seat,
      equipmentLabel,
      longevityYear: args.parsed.longevityYear,
    });

    if (rate !== null) {
      references.push({
        label: "Structured pay table",
        sourceId: "compensation_manual",
        displaySourceLabel: "Compensation Manual",
        section: "Section 3 B Pay Tables",
        quoteSnippet: `${equipmentLabel} ${args.parsed.seat} Year ${args.parsed.longevityYear}: $${rate.toFixed(2)}/hour`,
        ruleType: "scheduler_practice",
      });

      return {
        ok: true,
        mode: "fallback",
        answer: {
          status: "answered",
          scenarioLabel: "Direct pay rate lookup",
          answerCompleteness: "resolved",
          shortAnswer: `If you are a Year ${args.parsed.longevityYear} ${equipmentLabel} ${args.parsed.seat}, your hourly block pay rate is $${rate.toFixed(2)}.`,
          plainEnglishExplanation: "That is the exact hourly block rate from the structured compensation index.",
          confidence: "high",
          supportLevel: "manual_backed",
          assumptions: [],
          evidenceSummary: [],
          references,
        },
        detectedScenario: null,
        nextSession,
        meta: {
          fallbackReason: "direct_pay_rate_lookup",
        },
        debug:
          process.env.NODE_ENV !== "production"
            ? {
              mode: "fallback",
              fallbackReason: "direct_pay_rate_lookup",
              groundingSource: "fallback",
              usedRetrievedSupport: false,
              hasCompensationIndex: args.hasCompensationIndex,
              governingSectionUsed: "Compensation Manual:Section 3 B Pay Tables",
              directLookupTriggered: true,
              directLookupType: "pay_rate",
              parsedEquipment: matchedEquipmentLabels,
              parsedSeat: args.parsed.seat,
              parsedLongevityYear: args.parsed.longevityYear,
              compensationRowsAvailable: rows.length,
              lookupSource: "compensationManualIndex.json",
              retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
              aiSynthesisUsed: false,
              ...args.intentDebug,
            }
            : undefined,
      };
    }
  }

  if (
    matchedEquipmentLabels.length > 1 &&
    matchedEquipmentLabels.every((label) => label === "A-220-100" || label === "A-220-300")
  ) {
    const rates = matchedEquipmentLabels
      .map((equipmentLabel) => ({
        equipmentLabel,
        rate: findStructuredPayRate({
          rows,
          seat: args.parsed.seat as PaySeat,
          equipmentLabel,
          longevityYear: args.parsed.longevityYear as number,
        }),
      }))
      .filter((item): item is { equipmentLabel: PayEquipmentLabel; rate: number } => item.rate !== null);

    if (rates.length > 0) {
      references.push({
        label: "Structured pay table",
        sourceId: "compensation_manual",
        displaySourceLabel: "Compensation Manual",
        section: "Section 3 B Pay Tables",
        quoteSnippet: rates
          .map(
            (item) =>
              `${item.equipmentLabel} ${args.parsed.seat} Year ${args.parsed.longevityYear}: $${item.rate.toFixed(2)}/hour`
          )
          .join(" | "),
        ruleType: "scheduler_practice",
      });

      return {
        ok: true,
        mode: "fallback",
        answer: {
          status: "partial_answer",
          scenarioLabel: "Direct pay rate lookup",
          answerCompleteness: "provisional",
          shortAnswer: `I can narrow it to the A220, but I need the variant to give one exact rate. A Year ${args.parsed.longevityYear} ${args.parsed.seat} is $${rates[0].rate.toFixed(2)}/hour on the A-220-100 and $${rates[1]?.rate.toFixed(2) ?? rates[0].rate.toFixed(2)}/hour on the A-220-300.`,
          plainEnglishExplanation: "The structured compensation index splits the A220 into -100 and -300, so plain “A220” is still two different rates.",
          confidence: "medium",
          supportLevel: "manual_backed",
          assumptions: [],
          evidenceSummary: [],
          references,
          whatCouldChangeThisAnswer: ["Whether you are on the A-220-100 or the A-220-300"],
        },
        detectedScenario: null,
        nextSession,
        meta: {
          fallbackReason: "direct_pay_rate_lookup",
        },
        debug:
          process.env.NODE_ENV !== "production"
            ? {
              mode: "fallback",
              fallbackReason: "direct_pay_rate_lookup",
              groundingSource: "fallback",
              usedRetrievedSupport: false,
              hasCompensationIndex: args.hasCompensationIndex,
              governingSectionUsed: "Compensation Manual:Section 3 B Pay Tables",
              directLookupTriggered: true,
              directLookupType: "pay_rate",
              parsedEquipment: matchedEquipmentLabels,
              parsedSeat: args.parsed.seat,
              parsedLongevityYear: args.parsed.longevityYear,
              compensationRowsAvailable: rows.length,
              lookupSource: "compensationManualIndex.json",
              retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
              aiSynthesisUsed: false,
              ...args.intentDebug,
            }
            : undefined,
      };
    }
  }

  return null;
}

function buildIntentDebugBase(intent: ContractCopilotIntentResolution) {
  return {
    intentType: intent.intentType,
    selectedLane: intent.selectedLane,
    requiredFieldsFound: intent.requiredFieldsFound,
    missingFields: intent.missingFields,
    toolsUsed: intent.toolsUsed,
    scenarioProceedWithPartialContext: false,
  } as const;
}

function hasQuestionContent(question: string) {
  return question.trim().replace(/[^\w]+/g, "").length >= 8;
}

function looksLikeSectionQuestion(question: string) {
  const lower = question.toLowerCase();
  const operationalApplicationCue =
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
  return (
    !operationalApplicationCue &&
    (/\bsection\s+\d{1,2}/.test(lower) ||
      /\bpwa\s+\d{1,2}/.test(lower) ||
      lower.startsWith("section ") ||
      lower.startsWith("pwa ") ||
      lower.startsWith("§"))
  );
}

type ScenarioIssueTag = {
  label: string;
  patterns: RegExp[];
};

const SCENARIO_ISSUE_TAGS: ScenarioIssueTag[] = [
  { label: "PB", patterns: [/\bpb\b/, /\bpayback\b/] },
  { label: "PR", patterns: [/\bpr\b/, /\bpr remainder\b/] },
  { label: "LC", patterns: [/\blc\b/, /\blong call\b/] },
  { label: "QS", patterns: [/\bqs\b/, /\bquick slip\b/] },
  { label: "senior responder", patterns: [/\bsenior responder\b/] },
  { label: "same rotation", patterns: [/\bsame rotation\b/, /\bexact same rotation\b/] },
  { label: "duplicate award", patterns: [/\bduplicate award\b/, /\balready awarded\b/] },
  { label: "premium pay", patterns: [/\bpremium pay\b/, /\bquintuple\b/, /\bmultiple pay\b/] },
  { label: "MOU", patterns: [/\bmou\b/] },
  { label: "GS", patterns: [/\bgs\b/, /\bgreenslip\b/, /\bgreen slip\b/] },
  { label: "GSWC", patterns: [/\bgswc\b/, /\bgreen slip with conflict\b/] },
  { label: "silver slip", patterns: [/\bsilver slip\b/, /\bss\b/] },
  { label: "harmed pilot", patterns: [/\bharmed pilot\b/] },
  { label: "Auto Accept", patterns: [/\bauto accept\b/, /\bauto-accept\b/] },
  { label: "IOE", patterns: [/\bioe\b/] },
  { label: "court/legal obligation", patterns: [/\bcourt\b/, /\bcustody\b/, /\bhearing\b/] },
  { label: "notice to appear", patterns: [/\bnotice to appear\b/, /\bsubpoena\b/] },
  { label: "trip conflict", patterns: [/\btrip conflict\b/, /\bday 1 of (a )?\d+-?day trip\b/, /\bday 1 of a 4 day trip\b/] },
  { label: "leave", patterns: [/\bleave\b/, /\babsence\b/] },
  { label: "rotation change", patterns: [/\brotation changed\b/, /\bchanged for next month\b/, /\bremoved a leg\b/] },
  { label: "redeye", patterns: [/\bredeye\b/, /\bred eye\b/] },
  { label: "carryover", patterns: [/\bcarryover\b/, /\bcarry-over\b/, /\bnot a carryover\b/] },
  { label: "CPO", patterns: [/\bcpo\b/] },
  { label: "known absence", patterns: [/\bknown absence\b/] },
  { label: "capped reserve days", patterns: [/\bcapped rsv\b/, /\bcapped reserve days?\b/] },
  { label: "swap with pot", patterns: [/\bswap with (the )?pot\b/] },
  { label: "ARCOS", patterns: [/\barcos\b/] },
  { label: "DART", patterns: [/\bdart\b/] },
  { label: "STOP", patterns: [/\bstop\b/] },
  { label: "X-days", patterns: [/\bx-days?\b/, /\bx days?\b/, /\binterrupted x-days?\b/] },
  { label: "deadhead", patterns: [/\bdeadhead\b/, /\bdh\b/] },
  { label: "reroute", patterns: [/\breroute\b/, /\brerouted\b/] },
  { label: "reserve coverage", patterns: [/\breserve coverage\b/] },
  { label: "pay protection", patterns: [/\bpay protection\b/, /\bdue anything extra\b/] },
  { label: "notification", patterns: [/\bnotification\b/, /\brobot\b/, /\bnotice\b/] },
  { label: "golden day", patterns: [/\bgolden day\b/] },
  { label: "hard non-fly day", patterns: [/\bhard non-fly day\b/] },
  { label: "assignment timing", patterns: [/\b6pm\b/, /\b1800\b/, /\bday one\b/, /\bday before\b/, /\bearlier than\b/] },
  { label: "PCS", patterns: [/\bpcs\b/, /\b1200 pcs\b/] },
  { label: "bid period", patterns: [/\bbid period\b/, /\bapril\b/, /\bmay\b/] },
  { label: "carry-out", patterns: [/\bcarry-out\b/, /\bcarry out\b/] },
  { label: "black days", patterns: [/\bblack days?\b/] },
  { label: "max pickup", patterns: [/\bmax p\/?up\b/, /\bmax pickup\b/, /\bpickup limit\b/] },
  { label: "drop/add", patterns: [/\bdrop trip\b/, /\bdrop\b/, /\badd\b/, /\bpickup\b/] },
];

function detectScenarioIssueTags(question: string) {
  const lower = question.toLowerCase();
  return SCENARIO_ISSUE_TAGS.filter((entry) => entry.patterns.some((pattern) => pattern.test(lower))).map(
    (entry) => entry.label
  );
}

function detectScenarioIssueFamilies(question: string) {
  const lower = question.toLowerCase();
  const families = new Set<string>();
  if (/\bpb\b/.test(lower) || /\blc\b/.test(lower) || /\bpr\b/.test(lower) || lower.includes("payback")) {
    families.add("pb_lc_pr");
  }
  if (lower.includes("qs") || lower.includes("quick slip") || lower.includes("gs") || lower.includes("green slip")) {
    families.add("premium_pickup");
  }
  if (lower.includes("silver slip") || /\bss\b/.test(lower)) {
    families.add("silver_slip");
  }
  if (lower.includes("reroute") || lower.includes("rerouted") || lower.includes("deadhead") || lower.includes("dh")) {
    families.add("reroute_deadhead");
  }
  if (lower.includes("x-day") || lower.includes("x day") || lower.includes("interrupted x-days")) {
    families.add("x_day");
  }
  if (lower.includes("notification") || lower.includes("arcos") || lower.includes("auto accept") || lower.includes("called")) {
    families.add("notification_process");
  }
  if (lower.includes("dart") || lower.includes("system") || lower.includes("dispute") || lower.includes("denial")) {
    families.add("dispute_system");
  }
  if (lower.includes("sick") || lower.includes("called in sick")) {
    families.add("sick_leave");
  }
  if (lower.includes("reserve") || lower.includes("lc") || lower.includes("long call") || lower.includes("short call")) {
    families.add("reserve_status");
  }
  if (
    lower.includes("wocl") ||
    lower.includes("8d3") ||
    lower.includes("report") ||
    lower.includes("assigned") ||
    lower.includes("assignment") ||
    lower.includes("day one")
  ) {
    families.add("operational_timing");
  }
  if (
    lower.includes("swap with the pot") ||
    lower.includes("swap with pot") ||
    lower.includes("swap pot") ||
    lower.includes("capped rsv") ||
    lower.includes("capped reserve") ||
    lower.includes("bid period") ||
    /\bpcs\b/.test(lower) ||
    lower.includes("1200 pcs") ||
    lower.includes("carry-out") ||
    lower.includes("carry out") ||
    lower.includes("black days") ||
    lower.includes("max pickup") ||
    lower.includes("pickup limit") ||
    lower.includes("coverage works")
  ) {
    families.add("swap_bid_period");
  }
  if (lower.includes("ioe") || lower.includes("training")) {
    families.add("training_ioe");
  }
  if (lower.includes("court") || lower.includes("custody")) {
    families.add("court_conflict");
  }
  if (lower.includes("redeye") || lower.includes("removed a leg") || lower.includes("rotation changed")) {
    families.add("future_rotation_change");
  }
  return Array.from(families);
}

function detectPcsSwapScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("swap with pot") ||
    lower.includes("swap with the pot") ||
    lower.includes("swap pot") ||
    /\bpcs\b/.test(lower) ||
    lower.includes("1200 pcs") ||
    lower.includes("bid period") ||
    (lower.includes("april") && lower.includes("may")) ||
    lower.includes("carry-out") ||
    lower.includes("carry out") ||
    lower.includes("capped reserve days") ||
    lower.includes("capped rsv") ||
    lower.includes("black days") ||
    lower.includes("max pickup") ||
    lower.includes("pickup limit") ||
    lower.includes("drop trip for pickup") ||
    lower.includes("coverage works")
  );
}

function coerceClarificationIntent(args: {
  question: string;
  intent: ContractCopilotIntentResolution;
}) {
  const evidenceParsingAttempted = Object.keys(emptySession.facts).length >= 0;
  const issueFamilies = detectScenarioIssueFamilies(args.question);
  const looksComplex = issueFamilies.length >= 3;
  const recognizableScenarioSignals =
    issueFamilies.length > 0 ||
    /\b(wocl|8d3|report|assigned|assignment|reroute|reserve|gs|gswc|lc|long call|short call|deadhead)\b/i.test(
      args.question
    ) ||
    args.question.toLowerCase().includes("does that mean") ||
    args.question.toLowerCase().includes("doesn't that mean") ||
    args.question.toLowerCase().includes("how much notice") ||
    args.question.toLowerCase().includes("what happens");
  const shouldBypassQuestionScope =
    args.intent.selectedLane === "clarification_needed" &&
    args.intent.missingFields.length === 1 &&
    args.intent.missingFields[0] === "question_scope" &&
    hasQuestionContent(args.question) &&
    recognizableScenarioSignals;

  if (!shouldBypassQuestionScope) {
    return {
      intent: args.intent,
      evidenceDebug: {
        evidenceParsingAttempted,
        evidenceParsingSucceeded: false,
        evidenceParsingForcedFallback: args.intent.selectedLane === "clarification_needed",
        evidenceParsingIgnoredReason: undefined as string | undefined,
        scenarioProceedWithPartialContext: false,
      },
      issueFamilies,
      looksComplex,
    };
  }

  if (looksLikeSectionQuestion(args.question)) {
    return {
      intent: {
        ...args.intent,
        intentType: "document_explanation",
        selectedLane: "document_section_explanation",
        requiredFieldsFound: ["section"],
        missingFields: [],
        toolsUsed: Array.from(new Set([...(args.intent.toolsUsed ?? []), "question_scope_guard"])),
      } satisfies ContractCopilotIntentResolution,
      evidenceDebug: {
        evidenceParsingAttempted,
        evidenceParsingSucceeded: false,
        evidenceParsingForcedFallback: false,
        evidenceParsingIgnoredReason: "Ignored question_scope fallback because the original question contained a recognizable section request.",
        scenarioProceedWithPartialContext: false,
      },
      issueFamilies,
      looksComplex,
    };
  }

  if (issueFamilies.length > 0 || args.question.toLowerCase().includes("what happens") || args.question.toLowerCase().includes("how much notice")) {
    return {
      intent: {
        ...args.intent,
        intentType: "contract_scenario",
        selectedLane: "contract_scenario_retrieval",
        requiredFieldsFound: ["question"],
        missingFields: [],
        toolsUsed: Array.from(new Set([...(args.intent.toolsUsed ?? []), "question_scope_guard"])),
      } satisfies ContractCopilotIntentResolution,
      evidenceDebug: {
        evidenceParsingAttempted,
        evidenceParsingSucceeded: false,
        evidenceParsingForcedFallback: false,
        evidenceParsingIgnoredReason: "Ignored question_scope fallback because the original question already contained enough scenario information to continue safely.",
        scenarioProceedWithPartialContext: true,
      },
      issueFamilies,
      looksComplex,
    };
  }

  return {
    intent: args.intent,
    evidenceDebug: {
      evidenceParsingAttempted,
      evidenceParsingSucceeded: false,
      evidenceParsingForcedFallback: true,
      evidenceParsingIgnoredReason: undefined as string | undefined,
      scenarioProceedWithPartialContext: false,
    },
    issueFamilies,
    looksComplex,
  };
}

function buildRetrievalSourcesUsed(args: {
  groundingPack: ReturnType<typeof assembleContractGroundingContext>;
  usedRetrievedSupport: boolean;
}) {
  const sources = new Set<string>();
  if (args.groundingPack.internal.pwa.length > 0) {
    sources.add("PWA");
  }
  if (args.groundingPack.internal.compensationManual.length > 0) {
    sources.add("Compensation Manual");
  }
  if (args.groundingPack.internal.schedulerManual.length > 0) {
    sources.add("Scheduler Manual");
  }
  if (args.groundingPack.internal.crewtoolsLogic.length > 0) {
    sources.add("CrewTools Logic");
  }
  if (args.groundingPack.sectionPackets.workedExamples.length > 0) {
    sources.add("Worked examples");
  }
  if (args.usedRetrievedSupport) {
    sources.add("Retrieved contract snippets");
  }
  return Array.from(sources);
}

function buildContractScenarioToolsUsed(args: {
  intent: ContractCopilotIntentResolution;
  matchedInteractionRule?: { id: string } | undefined;
  missingGatingFacts: string[];
  aiSynthesisUsed: boolean;
}) {
  const tools = new Set<string>(args.intent.toolsUsed);
  tools.add("section_aware_retrieval");
  if (args.matchedInteractionRule) {
    tools.add("interaction_rule_ranking");
  }
  if (args.missingGatingFacts.length > 0) {
    tools.add("scenario_validation");
  }
  if (args.aiSynthesisUsed) {
    tools.add("openai_contract_synthesis");
  }
  return Array.from(tools);
}

function buildSourceUsageDebug(args: {
  question: string;
  intent: ContractCopilotIntentResolution;
  contractIndex: ReturnType<typeof loadContractDocumentIndex>;
  groundingPack: ReturnType<typeof assembleContractGroundingContext>;
}) {
  const pwaSectionsUsed = Array.from(
    new Set(
      [
        ...args.groundingPack.sectionPackets.governingSections.map((item) => item.section),
        ...args.groundingPack.internal.pwa.map((item) => item.section),
      ].filter((item) => item.trim().length > 0),
    ),
  );
  const compensationChunksUsed = Array.from(
    new Set(
      [
        ...args.groundingPack.sectionPackets.compensationSupport.map((item) => item.section),
        ...args.groundingPack.internal.compensationManual.map((item) => item.section),
      ].filter((item) => item.trim().length > 0),
    ),
  );
  const schedulerChunksUsed = Array.from(
    new Set(
      [
        ...args.groundingPack.sectionPackets.schedulerSupport.map((item) => item.section),
        ...args.groundingPack.internal.schedulerManual.map((item) => item.section),
      ].filter((item) => item.trim().length > 0),
    ),
  );
  const sourcesUsed = Array.from(
    new Set([
      pwaSectionsUsed.length > 0 ? "PWA" : null,
      compensationChunksUsed.length > 0 ? "Compensation Manual" : null,
      schedulerChunksUsed.length > 0 ? "Scheduler Manual" : null,
    ].filter((value): value is string => Boolean(value))),
  );
  const lower = args.question.toLowerCase();
  const compensationRelevant =
    args.intent.intentType === "calculation" ||
    lower.includes("pay") ||
    lower.includes("credit") ||
    lower.includes("guarantee") ||
    lower.includes("bank") ||
    lower.includes("replenish");
  const schedulerRelevant =
    args.intent.intentType === "contract_scenario" &&
    (lower.includes("reroute") ||
      lower.includes("report") ||
      lower.includes("deadhead") ||
      lower.includes("apd") ||
      lower.includes("processing"));
  const missingSourceWarnings = [
    args.contractIndex.hasCompensationIndex && compensationRelevant && compensationChunksUsed.length === 0
      ? "Compensation Manual is indexed but was not used for this pay/credit-sensitive lane."
      : null,
    args.contractIndex.hasSchedulerIndex && schedulerRelevant && schedulerChunksUsed.length === 0
      ? "Scheduler Manual is indexed but was not used for this processing-sensitive lane."
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    sourcesUsed,
    pwaSectionsUsed,
    compensationChunksUsed,
    schedulerChunksUsed,
    structuredRowsUsed: [] as string[],
    missingSourceWarnings,
  };
}

function summarizeRetrievedSupport(items: ContractCopilotAIRetrievedSupportItem[]) {
  return items
    .slice(0, 2)
    .map((item) => {
      const note = typeof item.quoteSnippet === "string" && item.quoteSnippet.trim().length > 0
        ? item.quoteSnippet.trim().replace(/\s+/g, " ").slice(0, 120)
        : item.note ?? "";
      return `${item.section}${note ? `: ${note}` : ""}`;
    })
    .join(" | ");
}

function buildSafeScenarioFallbackAnswer(args: {
  question: string;
  answer: ContractAnswerCard;
  retrievedSupport: ContractCopilotAIRetrievedSupportItem[];
  sourceUsageDebug: ReturnType<typeof buildSourceUsageDebug>;
  missingGatingFacts?: string[];
}) {
  const lower = args.question.toLowerCase();
  const issueFamilies = detectScenarioIssueFamilies(args.question);
  const issueTags = detectScenarioIssueTags(args.question);
  const isComplexScenario = issueFamilies.length >= 3;
  const sourceSummary =
    args.sourceUsageDebug.sourcesUsed.length > 0
      ? args.sourceUsageDebug.sourcesUsed.join(", ")
      : "available indexed sources";
  const snippetSummary = summarizeRetrievedSupport(args.retrievedSupport);
  const fallbackReferences = [...args.retrievedSupport]
    .sort((left, right) => {
      const specificityDelta =
        scoreVisibleReferenceSpecificity(right.section) - scoreVisibleReferenceSpecificity(left.section);
      if (specificityDelta !== 0) {
        return specificityDelta;
      }
      return (right.score ?? 0) - (left.score ?? 0);
    })
    .slice(0, 4)
    .map((item) => ({
      label: item.note || item.title,
      sourceId: item.sourceId,
      displaySourceLabel: item.sourceLabel,
      section: item.section,
      quoteSnippet: item.quoteSnippet,
      ruleType: item.ruleType,
    }));
  const supportText = normalizeSupportText(
    args.retrievedSupport
      .map((item) => `${item.section ?? ""} ${item.title ?? ""} ${item.note ?? ""} ${item.quoteSnippet ?? ""}`)
      .join(" ")
  );
  const silverSlipSupportFound =
    supportText.includes("silver slip") ||
    fallbackReferences.some((reference) => normalizeSupportText(reference.section).includes("silver slip"));
  const greenSlipSupportFound =
    supportText.includes("green slip") ||
    /\bgs\b/.test(supportText) ||
    fallbackReferences.some((reference) => /23 q/i.test(reference.section));

  let shortAnswer =
    "I found relevant contract support, but I cannot give a cleaner final answer from the available sources alone.";
  let likelyApplication =
    "The sources point to the right rule block, but the indexed packet does not fully lock the final outcome yet.";
  let issueThreadLines: string[] = [];
  if (isComplexScenario) {
    shortAnswer =
      "This looks like a multi-part scheduling and pay problem, not one single rule question.";
    likelyApplication =
      "The safest read is to break it into separate issue threads, answer what the current sources support, and flag the parts that still need confirmation or a DART/system review.";
    issueThreadLines = [
      `Issue map: ${issueTags.slice(0, 8).join(", ")}${issueTags.length > 8 ? ", ..." : ""}.`,
      "",
      "What facts matter:",
      lower.includes("pb") || lower.includes("lc") || lower.includes("pr")
        ? "- PB / LC / PR treatment: check whether the reserve-side restoration logic changed after the trip extended."
        : null,
      lower.includes("x-day") || lower.includes("x day")
        ? "- Interrupted X-days: check whether the extension changed how the interrupted day credit or restoration should be applied."
        : null,
      lower.includes("reroute") || lower.includes("deadhead") || lower.includes("dh")
        ? "- Reroute / deadhead change: check whether the added flying and delayed DH changed the applicable pay and protection pieces."
        : null,
      lower.includes("notification") || lower.includes("arcos") || lower.includes("robot")
        ? "- Notification/process: treat the missed call/notification issue separately from the pay result."
        : null,
      lower.includes("dart") || lower.includes("system")
        ? "- DART/system path: if the visible line and payback logic do not reconcile, that is a real system/dispute follow-up issue."
        : null,
      "",
      "What to check:",
      "- Check whether the reroute extension changed the trip treatment separately from the payback or restoration treatment.",
      "- Check whether the line display issue is a true contract miss or a system-processing problem that still needs DART backup.",
      "",
      "Practical next step:",
      "- Save the award timeline, the reroute timing, and any missing notifications, then compare those against the interrupted X-day and payback treatment before filing or updating DART.",
    ].filter((line): line is string => Boolean(line));
  } else if ((lower.includes("sick") || lower.includes("called in sick")) && (lower.includes("greenslip") || /\bgs\b/.test(lower))) {
    shortAnswer =
      "The overlap day may not be handled the same way as the later GS days, so I would treat this as a split-treatment scenario.";
    likelyApplication =
      "The overlap day likely follows separate pay, credit, and sick-bank treatment, while any later GS days are more likely to stand on their own if they were awarded and flown.";
  } else if (detectPcsSwapScenario(lower)) {
    shortAnswer =
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "This looks like a Silver Slip carry-out and May bid-period drop question, and the answer usually turns on how PCS processes the April carry-out against the overlapping May trip."
        : lower.includes("black days") || lower.includes("capped reserve") || lower.includes("capped rsv")
          ? "This looks like a swap-with-pot and capped-reserve-days question, and black days do not by themselves guarantee that a 2-day to 3-day extra-day pickup will process."
          : "This looks like a PCS / swap-with-pot processing question, and the answer usually turns on which bid period, PCS run, and reserve-coverage rule the system is evaluating.";
    likelyApplication =
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "The real issue is whether the Silver Slip carry-out still belongs to April processing even though it overlaps May, and whether PCS will let you drop the separate May bid-period trip against that overlap. That is a bid-period boundary and overlap/drop question, not just a generic Silver Slip question."
        : lower.includes("black days") || lower.includes("capped reserve") || lower.includes("capped rsv")
          ? "The real issue is whether the swap with pot is being blocked by reserve coverage or pickup-limit logic even though the days show black. A black-day display does not necessarily override capped reserve days, reserve coverage, or a pickup-limit check when the request adds an extra day."
          : "These requests are usually not controlled by one simple yes-or-no rule. The result often depends on whether the add and drop sit in the same processing run, whether the system is treating the request as crossover or carry-out processing, and whether capped reserve days, max pickup, or reserve coverage are blocking the request.";
    issueThreadLines = [
      "What this appears to be:",
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "- A Silver Slip carry-out from April that overlaps May, with a request to drop a separate May bid-period trip."
        : lower.includes("swap with pot") || lower.includes("swap with the pot") || lower.includes("swap pot")
          ? "- A swap-with-pot request that may be interacting with PCS run timing or bid-period crossover logic."
        : "- A PCS/bid-period processing question where the system may not be evaluating the request in the same month or run you expected.",
      "",
      "What this depends on:",
      /\bpcs\b/.test(lower) || lower.includes("1200 pcs")
        ? "- PCS run timing: whether the relevant April or May PCS run has actually executed yet."
        : null,
      lower.includes("bid period") || (lower.includes("april") && lower.includes("may"))
        ? "- Independent bid-period processing: whether the drop and add live in different bid periods or are being processed in different month buckets."
        : null,
      lower.includes("carry-out") || lower.includes("carry out")
        ? "- Carry-out handling: whether the trip is being treated as an April carry-out, May trip, or overlap that still belongs to the original month."
        : null,
      lower.includes("silver slip")
        ? "- Silver Slip carry-out treatment: whether the Silver Slip is coded and processed as an April carry-out rather than a clean May pickup."
        : null,
      lower.includes("capped reserve") || lower.includes("capped rsv") || lower.includes("reserve coverage")
        ? "- Reserve coverage / capped reserve days: whether the system is blocking the request even if the days look open or black."
        : null,
      lower.includes("max p/up") || lower.includes("max pickup") || lower.includes("pickup limit")
        ? "- Max pickup: whether the add would exceed your allowed pickup in the processing month even if the swap looks net-neutral to you."
        : null,
      lower.includes("actual") || lower.includes("qualified")
        ? "- Actual versus qualified treatment: whether the request is being checked under the actual trip state or a qualified/open-time state."
        : null,
      lower.includes("black days")
        ? "- Black days: black/open-looking days do not necessarily guarantee approval if another processing rule still blocks the request."
        : null,
      (lower.includes("black days") || lower.includes("capped reserve") || lower.includes("capped rsv")) && (lower.includes("2-day") || lower.includes("3-day") || lower.includes("extra day"))
        ? "- Extra-day pickup: changing a 2-day into a 3-day may still trip pickup-limit or reserve-coverage logic even when the pot looks open."
        : null,
      "",
      "Likely paths:",
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "- If PCS keeps the Silver Slip carry-out in April, the overlap with the May bid-period trip may still block a clean drop of the May trip."
        : "- If both sides of the request process in the same PCS run and the same bid-period bucket, it is more likely to behave like a normal drop/add or swap request.",
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "- If the system treats the Silver Slip carry-out and the May trip as separate month buckets, you may need to analyze the overlap/drop issue under bid-period boundary processing instead of a simple same-month swap."
        : "- If the add and drop cross April/May boundaries or a carry-out is involved, the system may evaluate them in separate runs or against different month rules.",
      (lower.includes("black days") || lower.includes("capped reserve") || lower.includes("capped rsv"))
        ? "- If you are seeing capped reserve days, black days alone do not override reserve-coverage logic."
        : null,
      (lower.includes("max p/up") || lower.includes("max pickup") || lower.includes("pickup limit") || lower.includes("2-day") || lower.includes("3-day") || lower.includes("extra day"))
        ? "- If max pickup is zero or capped, or the request adds an extra day, the system may still reject the longer pickup even when you think the swap should offset it."
        : "- If max pickup is zero or capped, the system may still reject a longer pickup even when you think the swap should offset it.",
      "",
      "What to check in iCrew/DBMS:",
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "- Check whether the Silver Slip is coded as an April carry-out, how the May bid-period trip is coded, and whether the overlap is treated as a drop issue or a processing conflict."
        : "- Check which month each side of the request is actually assigned to in iCrew, including any carry-out designation.",
      (lower.includes("capped reserve") || lower.includes("capped rsv") || lower.includes("black days"))
        ? "- Check whether the denial references capped reserve days, reserve coverage, black-day display, max pickup, or another PCS run/process restriction."
        : "- Check whether the denial references capped reserve days, max pickup, or another PCS run/process restriction.",
      "- Check whether the request is being evaluated as actual versus qualified, and whether the PCS run you expected has already occurred.",
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "- Check whether the request is really a May drop against an April carry-out overlap, not a normal same-month swap."
        : "- Check whether the request is truly drop/add in one month or a crossover between April and May processing buckets.",
      "",
      "Source limitation:",
      lower.includes("silver slip") && (lower.includes("carry-out") || lower.includes("carry out"))
        ? "- I do not have a fully explicit Silver Slip carry-out overlap/drop rule attached here, so the bid-period boundary answer stays cautious."
        : (lower.includes("capped reserve") || lower.includes("capped rsv") || lower.includes("black days"))
          ? "- I do not have direct indexed text that uses the exact capped reserve days or black days wording here, so that part of the answer stays cautious even though the pickup-limit and PCS processing support is relevant."
          : "- I do not see the exact PCS/swap-with-pot processing rule in the attached support unless the scheduler/process references are attached with this answer.",
      "",
      "Sources used:",
      "- Use Scheduler Manual processing language first for PCS/swap timing, then use direct PWA support only where the contract packet actually speaks to the underlying reserve/open-time constraint.",
    ].filter((line): line is string => Boolean(line));
  } else if (
    lower.includes("golden day") &&
    (lower.includes("hard non-fly day") || lower.includes("section 2 a.129") || lower.includes("pwa section 2 a.129")) &&
    (lower.includes("lc") || lower.includes("day one") || lower.includes("day before") || lower.includes("assigned"))
  ) {
    shortAnswer =
      "This looks like a golden-day application question, and the real issue is whether the hard non-fly-day definition blocks assignment timing before day one of LC or only protects the golden day itself.";
    likelyApplication =
      "Section 2 A.129 may define the golden day, but that definition alone may not answer the operational LC timing question unless the indexed packet also ties it to assignment timing, report timing, or a specific day-one LC restriction. I would not treat the day-before protection as worthless, but I also would not overclaim a 1800 cutoff without supporting language.";
    issueThreadLines = [
      "What this appears to be:",
      "- A scenario question about how the golden-day definition applies to assignment timing before day one of LC.",
      "",
      "What facts matter:",
      "- Whether Section 2 A.129 is only defining a golden day or also connected to a specific assignment or report-time limit.",
      "- Whether the operational question is about assignment, report, or actual duty start before day one of LC.",
      "- Whether there is any LC-specific source support that ties the hard non-fly day to a 6pm or 1800 boundary.",
      "",
      "Practical next step:",
      "- Read the golden-day definition together with any LC assignment or timing language before assuming the day before is worthless or that nothing can be assigned before 1800.",
      "",
      "Sources used / limitations:",
      "- I can anchor this to the golden-day definition, but if the indexed packet does not include the LC timing rule itself, the exact 6pm / day-one application stays cautious.",
    ];
  } else if (
    (lower.includes("rotation changed") ||
      lower.includes("changed for next month") ||
      lower.includes("removed a leg") ||
      lower.includes("redeye")) &&
    (lower.includes("next month") || lower.includes("not a carryover") || lower.includes("due anything extra"))
  ) {
    shortAnswer =
      "This looks like a future rotation-change question, and the main issue is whether the removed leg and redeye change trigger any pay or credit protection on a non-carryover trip.";
    likelyApplication =
      "This should be analyzed more like a future schedule-change or line-adjustment problem than a mid-rotation reroute. If it is not a carryover trip, that matters because you should not automatically treat it like a same-rotation reroute or continuation case.";
    issueThreadLines = [
      "What this appears to be:",
      "- A next-month rotation change on a trip you say is not a carryover.",
      "",
      "Pay/credit protection angle:",
      "- The first question is whether removing a leg and turning the trip into a redeye changes the trip value in a way that triggers pay protection, credit protection, or both.",
      "- If the governing language only protects certain removed or changed portions, that may matter more than the fact that the trip still exists.",
      "",
      lower.includes("cpo") || lower.includes("known absence") || lower.includes("reserve coverage") || lower.includes("similar")
        ? "Swap / reserve coverage angle:"
        : null,
      lower.includes("reserve coverage") || lower.includes("similar")
        ? "- If a similar trip exists the next day but reserve coverage blocks the swap, that is a separate processing constraint from the pay/credit question."
        : null,
      lower.includes("cpo")
        ? "- A CPO or manual-processing question is separate from whether the contract itself grants automatic pay or credit protection."
        : null,
      (lower.includes("known absence") || lower.includes("cpo")) ? "" : null,
      lower.includes("known absence") || lower.includes("cpo")
        ? "Known absence / CPO angle:"
        : null,
      lower.includes("known absence")
        ? "- If known-absence language applies, it may affect whether the trip can be reworked or protected, but that needs source support instead of assumption."
        : null,
      lower.includes("cpo")
        ? "- Even if a CPO can manually help process something, that does not automatically answer the contract pay-protection question."
        : null,
      lower.includes("known absence") || lower.includes("cpo")
        ? "- I do not have a clean controlling source for CPO override / known absence pay protection in this packet."
        : null,
      "",
      "What facts matter:",
      "- Whether the trip change happened before the bid period started or after it was already on your line.",
      "- Whether the removed leg reduced the trip's scheduled value or only changed the operating pattern into a redeye.",
      "- Whether you are asking about pay, credit, or both.",
      "",
      "Practical next step:",
      "- Save the original rotation, the changed rotation, and the value difference, then compare that against the schedule-change, known-absence, and pay-protection language before asking Crew Scheduling or the committee for a manual fix.",
    ].filter((line): line is string => Boolean(line));
  } else if (
    lower.includes("short call") &&
    (lower.includes("same day trip") || lower.includes("subsequent same day trip")) &&
    lower.includes("5:10pm")
  ) {
    shortAnswer =
      "This looks like a short-call plus same-day-trip legality question, and I would not assume both pieces can just stay on schedule unless the duty and assignment rules clearly allow it.";
    likelyApplication =
      "The real question is whether the short-call period, the 5:10pm report, and the total flight-duty footprint can legally coexist, or whether Scheduling is treating them as sequential pieces that still have to stay inside the applicable duty and reserve rules.";
    issueThreadLines = [
      "What this appears to be:",
      "- A reserve short-call period followed by a same-day trip that reports right when short call ends.",
      "",
      "What facts matter:",
      "- The short-call window you were given.",
      "- The same-day trip report at 5:10pm.",
      "- The scheduled 7+36 flight / 9+36 duty footprint.",
      "- Whether the issue is legality, assignment timing, or both.",
      "",
      "Practical next step:",
      "- Keep the short-call assignment, the trip report time, and the duty projection together and ask whether Scheduling is treating the pairing as legal under the reserve and duty rules, not just whether both items exist in the system.",
      "",
      "Sources used / limitations:",
      "- I can place this in the short-call / legality / scheduling-conflict bucket, but I do not have a clean controlling source in this packet that proves both can remain on schedule.",
    ];
  } else if (
    (lower.includes("qs") || lower.includes("quick slip")) &&
    (lower.includes("no op") || lower.includes("noop")) &&
    lower.includes("after report")
  ) {
    shortAnswer =
      "This looks like a QS no-op-after-report pay question, and I would separate the premium-award piece from what happens if the trip does not actually operate after report.";
    likelyApplication =
      "The key question is whether the indexed sources clearly say a QS keeps premium treatment after report when the flying no-ops, or whether the pay and credit treatment changes once the assigned flying never operates.";
    issueThreadLines = [
      "What this appears to be:",
      "- A quick-slip award followed by a no-op after report.",
      "",
      "What facts matter:",
      "- Whether you actually reported before the no-op.",
      "- Whether the question is about pay, credit, or premium treatment.",
      "- Whether the indexed QS support addresses a no-op after report directly.",
      "",
      "Practical next step:",
      "- Keep the QS award, the report event, and the no-op record together and compare them against the premium-pay and report-time language before assuming the original QS premium survives unchanged.",
      "",
      "Sources used / limitations:",
      "- I can place this in the QS / no-op / after-report pay bucket, but I do not have clean source text in this packet that fully locks the premium result.",
    ];
  } else if (
    (lower.includes("qs") || lower.includes("quick slip")) &&
    lower.includes("stop") &&
    (lower.includes("already awarded") ||
      lower.includes("same rotation") ||
      lower.includes("senior responder") ||
      lower.includes("duplicate"))
  ) {
    shortAnswer =
      "This looks like a QS STOP and duplicate-award question, and I would not assume the STOP was valid unless the QS or MOU language actually supports stopping the call for that reason.";
    likelyApplication =
      "The real issue is whether the stop reason fits the limited QS stop conditions, and whether already having the same rotation awarded earlier makes this a duplicate-award problem rather than a seniority problem. The premium-pay concern is a separate follow-on question, not proof that the STOP itself was correct.";
    issueThreadLines = [
      "What this appears to be:",
      "- A quick slip award that went STOP even though you believe you were the senior responder.",
      "",
      "QS award / senior responder issue:",
      "- The first question is whether the award should have continued to the senior responder, or whether the system had a valid reason to stop the QS before final award.",
      "",
      "Duplicate same-rotation issue:",
      "- If you had already been awarded the exact same rotation earlier, the system may have treated the second award as a duplicate same-rotation problem rather than a fresh QS seniority contest.",
      "",
      "Premium pay / multiple-award concern:",
      "- The premium-pay or quintuple-pay worry is separate from whether the STOP reason itself was contract-valid.",
      "- Do not assume the STOP was proper just because paying the same rotation twice would look odd.",
      "",
      "What facts matter:",
      "- Whether the earlier award was truly the exact same rotation number and date.",
      "- Whether the QS stop conditions or the MOU text specifically allow stopping for an already-awarded same rotation.",
      "- Whether the system marked this as a duplicate award or some other QS stop reason.",
      "",
      "Practical next step:",
      "- Save the QS timing, the earlier award timestamp, the STOP message, and the exact rotation number, then compare that against the QS stop language and any MOU text before assuming the denial was valid.",
    ];
    if (lower.includes("mou")) {
      issueThreadLines.splice(
        issueThreadLines.length - 2,
        0,
        "",
        "MOU / source limitation:",
        "- If the exact MOU text is not in the indexed packet, treat the MOU point as unresolved rather than assuming it clearly authorizes the STOP."
      );
    }
  } else if (
    (lower.includes("court") || lower.includes("custody") || lower.includes("notice to appear") || lower.includes("subpoena")) &&
    (lower.includes("trip") || lower.includes("day 1") || lower.includes("4 day"))
  ) {
    shortAnswer =
      "This looks like a court or custody-hearing trip-conflict question, and I would treat any protection as a possible known-absence or leave issue until the exact source language confirms more.";
    likelyApplication =
      "The important split is between having a real legal obligation or notice to appear, and whether the contract actually gives a known-absence, leave, or other trip-conflict path for it. I would not promise pay protection unless the indexed sources say so clearly.";
    issueThreadLines = [
      "What this appears to be:",
      "- A court or custody-hearing conflict that lands on day 1 of a trip.",
      "",
      "Known absence / leave angle:",
      "- The first thing to check is whether this can be treated as a known absence, leave, or another protected unavailability category rather than just a normal trip conflict.",
      "",
      "Pay protection uncertainty:",
      "- Do not assume that getting off the trip automatically means pay protection.",
      "- The source packet may support a leave or absence path without clearly guaranteeing pay for the removed trip.",
      "",
      "What facts matter:",
      "- Whether you have a formal court notice, subpoena, or other documentation showing the legal obligation.",
      "- Whether the event is truly on day 1 of the trip or can be worked around with another scheduling option.",
      "- Whether any known-absence or leave language applies before the trip is finalized.",
      "",
      "Practical next step:",
      "- Keep the court notice or custody-hearing paperwork, contact Crew Scheduling or the appropriate support channel early, and ask specifically whether they are treating this as a known absence, leave, or another protected conflict.",
      "",
      "Sources used / limitations:",
      "- I can place this in the known-absence and leave bucket from the indexed sources, but I do not see a clean court-specific protection rule in the current packet.",
    ];
  } else if (lower.includes("23m7") && lower.includes("auto accept") && lower.includes("harmed pilot")) {
    shortAnswer = "Based on the source support I found, this looks like a Section 23M7 harmed pilot / Auto Accept question.";
    likelyApplication =
      "The key issue is whether Section 23M7 itself ties harmed-pilot treatment to Auto Accept, not whether people are using the term loosely.";
  } else if (
    lower.includes("silver slip") &&
    (lower.includes("green slip") || /\bgs\b/.test(lower)) &&
    (lower.includes("double pay") || lower.includes("straight credit"))
  ) {
    shortAnswer =
      "No — a Silver Slip does not require hitting the Green Slip trigger to get premium pay.";
    likelyApplication =
      "Green Slip and Silver Slip should not be treated as the same premium mechanism. Green Slip premium is tied to its own trigger-based rules, while Silver Slip premium should be analyzed under its separate silver-slip or premium-pay language. I would still stay cautious if the packet is clearer on Green Slip than on the exact Silver Slip rule text.";
    issueThreadLines = [
      "Difference:",
      "- Green Slip: premium pay depends on the GS trigger or threshold condition under the Green Slip rule set, including Section 23 Q support when that is the governing GS section.",
      "- Silver Slip: premium pay is not driven by the Green Slip trigger. It should stand on separate Silver Slip or premium-pay support, not by importing GS trigger logic.",
      "",
      "What this still depends on:",
      "- How the Silver Slip was actually awarded and coded in the system.",
      "- Whether the assignment overlaps or conflicts with Green Slip or another premium event.",
      "- Whether the indexed packet includes the exact Silver Slip premium rule text for this fact pattern.",
      "",
      "Likely paths:",
      "- If the Silver Slip rule has its own premium language, you do not have to satisfy the Green Slip trigger just to get Silver Slip premium.",
      "- If the packet only gives Green Slip trigger language, you can use that as comparison support, but not as proof that Silver Slip behaves the same way.",
      "",
      "What to check:",
      "- The award type and pay code in iCrew or DBMS.",
      "- Whether the trip was processed as Silver Slip versus Green Slip.",
      "- Whether there was any overlap with another premium event that changes the pay treatment.",
      "",
      "Source limitation:",
      silverSlipSupportFound
        ? greenSlipSupportFound
          ? "- I have support for both Silver Slip and Green Slip in the packet, but the Green Slip trigger language is still the clearer of the two."
          : "- I have some Silver Slip support, but the packet is still thinner than I want on the exact premium trigger wording."
        : greenSlipSupportFound
          ? "- I have clearer support for Green Slip behavior than for the exact Silver Slip premium rule in this context."
          : "- I do not have clean Silver Slip governing text attached here, so the comparison stays cautious.",
    ];
  } else if (/\bapd\b/.test(lower) && /\bgs\b|\bgreenslip\b/.test(lower) && lower.includes("short call")) {
    shortAnswer =
      "I found overlapping rule families here, but not enough indexed support to confirm a clean same-day stack result.";
    likelyApplication =
      "This looks like a layered interaction where APD, GS, and short-call rules can all matter, so I would treat the stack result as unresolved until the controlling sequence is confirmed.";
  } else if (lower.includes("reroute") || lower.includes("deadhead")) {
    shortAnswer =
      "I found relevant reroute support, but the answer still depends on details the current source packet does not fully lock down.";
    likelyApplication =
      "The biggest driver is usually timing relative to report and what changed in the rotation, so I would treat this as a reroute-timing question rather than a simple yes/no.";
  } else if (lower.includes("short call")) {
    shortAnswer =
      "I found short-call support, but the exact outcome still depends on how the contract language lines up with your specific fact pattern.";
    likelyApplication =
      "The current sources are enough to identify the governing short-call rule family, but not enough to lock a narrower outcome cleanly.";
  } else if (issueTags.length > 0) {
    shortAnswer = `This looks like a ${issueTags.slice(0, 4).join(" / ")} question.`;
    likelyApplication =
      "I can place it in the right contract bucket from the indexed sources, but the current packet is still thinner than I want for a cleaner final answer.";
    issueThreadLines = [
      `Issue map: ${issueTags.join(", ")}.`,
      "",
      "What facts matter:",
      `- The controlling issues here are ${issueTags.slice(0, 4).join(", ")}${issueTags.length > 4 ? ", plus the related pay or processing details around them." : "."}`,
      "",
      "What to check:",
      "- Check the governing section first, then confirm whether the supporting pay or process examples actually match your fact pattern.",
      "",
      "Practical next step:",
      "- Keep the award, notification, and timeline details that show what actually happened in case the rule and the system display do not line up.",
    ];
  }

  const gatingSummary =
    args.missingGatingFacts && args.missingGatingFacts.length > 0
      ? args.missingGatingFacts.join("; ")
      : "the indexed packet still does not fully resolve the final outcome.";

  return {
    ...args.answer,
    status:
      isComplexScenario
        ? ("partial_answer" as const)
        :
      args.missingGatingFacts && args.missingGatingFacts.length > 0
        ? ("needs_clarification" as const)
        : args.answer.status,
    answerCompleteness: "provisional" as const,
    confidence: "low" as const,
    shortAnswer,
    plainEnglishExplanation: [
      ...issueThreadLines,
      `What controls: ${sourceSummary}${snippetSummary ? `; ${snippetSummary}` : ""}.`,
      `How it likely applies here: ${likelyApplication}`,
      `What I can't confirm from available sources: ${gatingSummary}.`,
      `Sources used: ${sourceSummary}.`,
    ].join("\n"),
    assumptions: Array.from(
      new Set([...(args.answer.assumptions ?? []), "This is a cautious fallback based on the indexed source packet."]),
    ),
    references: fallbackReferences,
  };
}

function applyScenarioAnswerVerifier(args: {
  question: string;
  selectedLane: string;
  answer: ContractAnswerCard;
  contractIndex: ReturnType<typeof loadContractDocumentIndex>;
  sourceUsageDebug: ReturnType<typeof buildSourceUsageDebug>;
}) {
  return verifyContractScenarioAnswer({
    question: args.question,
    selectedLane: args.selectedLane,
    answer: args.answer,
    hasPwaIndex: args.contractIndex.hasPwaIndex,
    hasCompensationIndex: args.contractIndex.hasCompensationIndex,
    hasSchedulerIndex: args.contractIndex.hasSchedulerIndex,
    sourcesUsed: args.sourceUsageDebug.sourcesUsed,
    pwaSectionsUsed: args.sourceUsageDebug.pwaSectionsUsed,
    compensationChunksUsed: args.sourceUsageDebug.compensationChunksUsed,
    schedulerChunksUsed: args.sourceUsageDebug.schedulerChunksUsed,
    missingSourceWarnings: args.sourceUsageDebug.missingSourceWarnings,
  });
}

function finalizeScenarioSafetyPipeline(args: {
  answer: ContractAnswerCard;
  verified: ReturnType<typeof applyScenarioAnswerVerifier>;
  supportDebug?: Record<string, unknown>;
}) {
  const supportWeakMatchWarning = args.supportDebug?.supportWeakMatchWarning === true;
  const supportPrimaryAnchorMissing = args.supportDebug?.supportPrimaryAnchorMissing === true;
  const xDayScenario = args.supportDebug?.xDayScenario === true;
  const xDayAnchorFound = args.supportDebug?.xDayAnchorFound === true;
  const pcsSwapScenario = args.supportDebug?.pcsSwapScenario === true;
  const pcsSwapAnchorFound = args.supportDebug?.pcsSwapAnchorFound === true;
  const pcsSwapMissingSupportReason =
    typeof args.supportDebug?.pcsSwapMissingSupportReason === "string"
      ? args.supportDebug.pcsSwapMissingSupportReason
      : undefined;
  const shortCallDutyScenario = args.supportDebug?.shortCallDutyScenario === true;
  const shortCallDutyAnchorFound = args.supportDebug?.shortCallDutyAnchorFound === true;
  const answerReferencedSections = Array.isArray(args.supportDebug?.answerReferencedSections)
    ? args.supportDebug.answerReferencedSections.filter((item): item is string => typeof item === "string")
    : [];
  const supportInjectedFromAnswer = args.supportDebug?.supportInjectedFromAnswer === true;
  const supportMissingForReferencedSection = args.supportDebug?.supportMissingForReferencedSection === true;
  const silverSlipPrimarySupportFound = args.supportDebug?.silverSlipPrimarySupportFound === true;
  const greenSlipComparisonSupportFound = args.supportDebug?.greenSlipComparisonSupportFound === true;
  const silverSlipSupportMissing = args.supportDebug?.silverSlipSupportMissing === true;
  const downgradeReasons: string[] = [];

  if (args.verified.verifierAdjustedAnswer) {
    downgradeReasons.push("verifier_adjusted_answer");
  }
  if (args.verified.strongClaimsDowngraded.length > 0) {
    downgradeReasons.push("unsupported_strong_claim");
  }
  if (args.verified.applicationClaimDowngraded) {
    downgradeReasons.push("definition_to_application_guard");
  }
  if (supportWeakMatchWarning) {
    downgradeReasons.push("weak_support_match");
  }
  if (supportPrimaryAnchorMissing) {
    downgradeReasons.push("primary_support_anchor_missing");
  }
  if (xDayScenario && !xDayAnchorFound) {
    downgradeReasons.push("xday_anchor_missing");
  }
  if (pcsSwapScenario && !pcsSwapAnchorFound) {
    downgradeReasons.push("pcs_swap_anchor_missing");
  }
  if (shortCallDutyScenario && !shortCallDutyAnchorFound) {
    downgradeReasons.push("shortcall_duty_anchor_missing");
  }
  if (supportMissingForReferencedSection) {
    downgradeReasons.push("referenced_section_support_missing");
  }
  if (silverSlipSupportMissing) {
    downgradeReasons.push("silver_slip_support_missing");
  }

  const answerDowngradedToCaution = downgradeReasons.length > 0;
  let adjustedAnswer: ContractAnswerCard = answerDowngradedToCaution
    ? {
        ...args.answer,
        confidence: "low",
        supportLevel:
          (args.answer.references?.length ?? 0) > 0
            ? args.answer.supportLevel === "inference_heavy"
              ? "inference_heavy"
              : "mixed"
            : "inference_heavy",
        assumptions: Array.from(
          new Set([...(args.answer.assumptions ?? []), "Final safety pipeline downgraded this answer to caution."])
        ),
      }
    : args.answer;

  if (xDayScenario && !xDayAnchorFound) {
    const note = "I do not see the X-day interruption rule (23 L.9) in the attached support.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (pcsSwapScenario && !pcsSwapAnchorFound) {
    const note =
      pcsSwapMissingSupportReason ??
      "I do not see the exact PCS/swap-with-pot processing rule in the attached support.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (shortCallDutyScenario && !shortCallDutyAnchorFound) {
    const note = "I do not see the exact short-call plus same-day trip legality rule in the attached support.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (supportMissingForReferencedSection && answerReferencedSections.length > 0) {
    const note = `I referenced ${answerReferencedSections.join(", ")}, but I was not able to retrieve the supporting text.`;
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (silverSlipSupportMissing && greenSlipComparisonSupportFound) {
    const note = "I found Green Slip comparison support, but not the Silver Slip governing support.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }

  return {
    answer: adjustedAnswer,
    debug: {
      finalSafetyPipelineRan: true,
      truthGuardRan: args.verified.truthGuardRan,
      definitionApplicationGuardRan: true,
      supportQualityGateRan: args.supportDebug?.supportQualityGateRan === true,
      answerDowngradedToCaution,
      downgradeReasons,
      xDayScenario,
      xDayAnchorFound,
      pcsSwapScenario,
      pcsSwapAnchorFound,
      pcsSwapMissingSupportReason,
      shortCallDutyScenario,
      shortCallDutyAnchorFound,
      answerReferencedSections,
      supportInjectedFromAnswer,
      supportMissingForReferencedSection,
      silverSlipPrimarySupportFound,
      greenSlipComparisonSupportFound,
      silverSlipSupportMissing,
    },
  };
}

function buildDirectApdCalculationResponse(args: {
  question: string;
  session: ContractCopilotSession;
  intentDebug: Pick<
    NonNullable<ContractCopilotApiSuccessResponse["debug"]>,
    "intentType" | "selectedLane" | "requiredFieldsFound" | "missingFields" | "toolsUsed"
  >;
}): ContractCopilotApiSuccessResponse | null {
  const lower = args.question.toLowerCase();
  if (!(/\bapd\b/.test(lower) || lower.includes("authorized personal drop"))) {
    return null;
  }

  const { required, available } = parseRequiredAndAvailable(args.question);
  if (required === null || available === null) {
    return null;
  }

  const threshold = required * 0.25;
  const clears = available >= threshold;
  const nextSession: ContractCopilotSession = {
    ...args.session,
    unresolvedQuestion: undefined,
    status: "answered",
  };

  return {
    ok: true,
    mode: "fallback",
    answer: {
      status: "answered",
      scenarioLabel: "APD threshold calculation",
      answerCompleteness: "resolved",
      shortAnswer: clears
        ? `Yes, this should probably go through. The APD threshold is 25% of required reserves, and ${available} available against ${required} required is above that mark.`
        : `No, that probably will not clear. The APD threshold is 25% of required reserves, and ${available} available against ${required} required is below that mark.`,
      plainEnglishExplanation:
        "This uses the reserve counts at the time APD was processed, not the full minimum reserve coverage standard.",
      confidence: "high",
      supportLevel: "contract_backed",
      assumptions: [],
      evidenceSummary: [],
      references: [
        {
          label: "APD reserve threshold",
          sourceId: "pwa",
          displaySourceLabel: "PWA",
          section: "Section 23 I.10",
          quoteSnippet: "APD uses at least 25% of the number of reserves required at the time of processing.",
          ruleType: "contract",
        },
      ],
    },
    detectedScenario: null,
    nextSession,
    meta: {
      fallbackReason: "direct_apd_threshold_calculation",
    },
    debug:
      process.env.NODE_ENV !== "production"
        ? {
            mode: "fallback",
            fallbackReason: "direct_apd_threshold_calculation",
            governingSectionUsed: "PWA:Section 23 I.10",
            retrievalSourcesUsed: ["PWA:Section 23 I.10"],
            aiSynthesisUsed: false,
            ...args.intentDebug,
            toolsUsed: Array.from(new Set([...(args.intentDebug.toolsUsed ?? []), "apd_threshold_calculator"])),
          }
        : undefined,
  };
}

function jsonResponse(
  status: number,
  body: ContractCopilotApiSuccessResponse | ContractCopilotApiErrorResponse
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function sourceLabelFromReference(reference: {
  sourceId: "pwa" | "compensation_manual" | "scheduler_manual";
  ruleType: RuleType;
}) {
  if (reference.ruleType === "inference") {
    return "Inference" as const;
  }
  if (reference.sourceId === "pwa") {
    return "PWA" as const;
  }
  if (reference.sourceId === "compensation_manual") {
    return "Compensation Manual" as const;
  }
  return "Scheduler Manual" as const;
}

function normalizeAISourceLabel(sourceLabel: string | undefined) {
  const normalized = (sourceLabel ?? "").trim().toLowerCase();
  if (normalized === "pwa") {
    return "PWA" as const;
  }
  if (normalized === "scheduler manual" || normalized === "scheduler_manual") {
    return "Scheduler Manual" as const;
  }
  if (normalized === "compensation manual" || normalized === "compensation_manual") {
    return "Compensation Manual" as const;
  }
  return "Inference" as const;
}

function mapScenarioLabelToFamily(label: string | undefined): CopilotScenarioFamily | null {
  switch ((label ?? "").trim().toLowerCase()) {
    case "reserve vs lineholder":
      return "status_basics";
    case "reroute / reassignment":
      return "reroute_reassignment";
    case "sick / leave interaction":
      return "sick_leave_interaction";
    case "how this pays":
      return "premium_pickup";
    case "dispute / citation helper":
      return "dispute_citation_helper";
    default:
      return null;
  }
}

function buildQuickRepliesForField(factField: keyof ParsedScenarioFacts): ContractQuickReply[] {
  switch (factField) {
    case "status":
      return [
        { id: "status-reserve", label: "I'm reserve", factPatch: { status: "reserve" }, replyMessage: "I'm reserve" },
        { id: "status-lineholder", label: "I'm lineholder", factPatch: { status: "lineholder" }, replyMessage: "I'm lineholder" },
      ];
    case "pickupType":
    case "premiumType":
      return [
        {
          id: "pickup-greenslip",
          label: "Greenslip",
          factPatch: { pickupType: "greenslip", premiumType: "greenslip" },
          replyMessage: "It's a Greenslip",
        },
        {
          id: "pickup-inverse",
          label: "Inverse assignment",
          factPatch: {
            pickupType: "inverse_assignment",
            premiumType: "inverse_assignment",
            assignmentType: "inverse_assignment",
          },
          replyMessage: "It's inverse assignment",
        },
        {
          id: "pickup-other",
          label: "Other premium / pickup",
          factPatch: { pickupType: "other_premium_pickup", premiumType: "other_premium_pickup" },
          replyMessage: "It's another premium or pickup case",
        },
      ];
    case "eventTiming":
      return [
        { id: "timing-same-day", label: "Same day", factPatch: { eventTiming: "same_day" }, replyMessage: "It happened the same day" },
        { id: "timing-after-report", label: "After report", factPatch: { eventTiming: "after_report" }, replyMessage: "It happened after report" },
        { id: "timing-later", label: "Later", factPatch: { eventTiming: "later" }, replyMessage: "It happened later" },
      ];
    case "interactionRelationship":
      return [
        {
          id: "interaction-overlap",
          label: "It overlapped",
          factPatch: { interactionRelationship: "overlap", sameDayInteraction: true },
          replyMessage: "It overlapped the same day",
        },
        {
          id: "interaction-sequential",
          label: "It was after",
          factPatch: { interactionRelationship: "sequential", sameDayInteraction: false },
          replyMessage: "It happened after the earlier event cleared",
        },
      ];
    case "contactWindow":
      return [
        {
          id: "contact-window-within-18",
          label: "Within 18 hours",
          factPatch: { contactWindow: "within_18_hours" },
          replyMessage: "The report was within 18 hours of first attempted contact",
        },
        {
          id: "contact-window-outside-18",
          label: "Outside 18 hours",
          factPatch: { contactWindow: "outside_18_hours" },
          replyMessage: "The report was outside 18 hours of first attempted contact",
        },
      ];
    case "assignmentType":
      return [
        { id: "assignment-assigned", label: "Assigned", factPatch: { assignmentType: "assigned" }, replyMessage: "It was assigned" },
        { id: "assignment-picked-up", label: "Picked up", factPatch: { assignmentType: "picked_up" }, replyMessage: "I picked it up" },
        { id: "assignment-not-sure", label: "Not sure", factPatch: { assignmentType: "not_sure" }, replyMessage: "I'm not sure how it was coded" },
      ];
    case "rerouteOccurred":
      return [
        { id: "reroute-yes", label: "Rerouted", factPatch: { rerouteOccurred: true, tripTouched: true }, replyMessage: "Yes, it was rerouted" },
        { id: "reroute-no", label: "No reroute", factPatch: { rerouteOccurred: false }, replyMessage: "No, it was not rerouted" },
      ];
    case "processingCountsKnown":
      return [
        {
          id: "processing-counts-known",
          label: "I have the counts",
          factPatch: { processingCountsKnown: true },
          replyMessage: "I have the required and available reserve counts",
        },
        {
          id: "processing-counts-unknown",
          label: "I don't have them",
          factPatch: { processingCountsKnown: false },
          replyMessage: "I do not have the required and available reserve counts",
        },
      ];
    case "afterReport":
    case "beforeReport":
      return [
        {
          id: "event-before-report",
          label: "Before report",
          factPatch: { beforeReport: true, afterReport: false },
          replyMessage: "It happened before report",
        },
        {
          id: "event-after-report",
          label: "After report",
          factPatch: { beforeReport: false, afterReport: true, eventTiming: "after_report" },
          replyMessage: "It happened after report",
        },
      ];
    case "sameDayInteraction":
      return [
        { id: "used-yes", label: "Used", factPatch: { sameDayInteraction: true }, replyMessage: "I was used on that day" },
        { id: "used-no", label: "Not used", factPatch: { sameDayInteraction: false }, replyMessage: "I was not used on that day" },
        { id: "used-unsure", label: "Not sure", factPatch: {}, replyMessage: "I'm not sure whether I was used" },
      ];
    case "leaveType":
      return [
        { id: "leave-sick", label: "Sick", factPatch: { leaveType: "sick", sickUsed: true }, replyMessage: "It was sick leave" },
        { id: "leave-vacation", label: "Vacation", factPatch: { leaveType: "vacation" }, replyMessage: "It was vacation" },
        { id: "leave-other", label: "Other leave", factPatch: { leaveType: "other_leave" }, replyMessage: "It was another leave type" },
      ];
    default:
      return [{ id: `${factField}-not-sure`, label: "Not sure", factPatch: {}, replyMessage: "I'm not sure" }];
  }
}

function inferClarifyingField(aiResult: ContractCopilotAIOutput) {
  const direct = (aiResult.clarifyingField ?? "").trim();
  if (
    direct === "status" ||
    direct === "assignmentType" ||
    direct === "pickupType" ||
    direct === "premiumType" ||
    direct === "interactionRelationship" ||
    direct === "contactWindow" ||
    direct === "processingCountsKnown" ||
    direct === "beforeReport" ||
    direct === "afterReport" ||
    direct === "eventTiming" ||
    direct === "rerouteOccurred" ||
    direct === "reassignmentOccurred" ||
    direct === "tripTouched" ||
    direct === "leaveType" ||
    direct === "sickUsed" ||
    direct === "sameDayInteraction" ||
    direct === "questionIntent"
  ) {
    return direct as keyof ParsedScenarioFacts;
  }

  const normalizedPrompt = aiResult.clarifyingQuestion?.trim().toLowerCase() ?? "";
  if (normalizedPrompt.includes("reserve") || normalizedPrompt.includes("lineholder")) return "status";
  if (
    normalizedPrompt.includes("greenslip") ||
    normalizedPrompt.includes("green slip") ||
    normalizedPrompt.includes("inverse assignment") ||
    normalizedPrompt.includes("premium")
  ) {
    return "pickupType";
  }
  if (
    normalizedPrompt.includes("overlap") ||
    normalizedPrompt.includes("after the sick") ||
    normalizedPrompt.includes("picked up after")
  ) {
    return "interactionRelationship";
  }
  if (
    normalizedPrompt.includes("18 hours") ||
    normalizedPrompt.includes("first attempted contact")
  ) {
    return "contactWindow";
  }
  if (
    normalizedPrompt.includes("required") &&
    normalizedPrompt.includes("available") &&
    normalizedPrompt.includes("processing")
  ) {
    return "processingCountsKnown";
  }
  if (normalizedPrompt.includes("before report") || normalizedPrompt.includes("after report")) {
    return "afterReport";
  }
  if (
    normalizedPrompt.includes("used on") ||
    normalizedPrompt.includes("used that day") ||
    normalizedPrompt.includes("long call") ||
    normalizedPrompt.includes("overlap day")
  ) {
    return "sameDayInteraction";
  }
  if (normalizedPrompt.includes("same day") || normalizedPrompt.includes("after report") || normalizedPrompt.includes("later")) {
    return "eventTiming";
  }
  if (normalizedPrompt.includes("assigned") || normalizedPrompt.includes("picked up")) {
    return "assignmentType";
  }
  if (normalizedPrompt.includes("sick") || normalizedPrompt.includes("vacation") || normalizedPrompt.includes("leave")) {
    return "leaveType";
  }
  if (normalizedPrompt.includes("reroute")) return "rerouteOccurred";
  return "questionIntent";
}

function inferClarifyingQuestion(
  aiResult: ContractCopilotAIOutput,
  fallbackQuestions: ClarifyingQuestion[] | undefined,
  clarificationCount: number
): ClarifyingQuestion[] | undefined {
  if (!aiResult.needsClarification) {
    return undefined;
  }
  if (clarificationCount >= 2) {
    return undefined;
  }
  if (fallbackQuestions && fallbackQuestions.length > 0) {
    return fallbackQuestions.slice(0, 1).map((question) => ({
      ...question,
      quickReplies:
        question.quickReplies && question.quickReplies.length > 0
          ? question.quickReplies
          : buildQuickRepliesForField(question.factField),
    }));
  }

  const prompt = aiResult.clarifyingQuestion?.trim();
  if (!prompt) {
    return undefined;
  }

  const factField = inferClarifyingField(aiResult);

  return [
    {
      id: "ai-clarification",
      prompt,
      factField,
      required: true,
      quickReplies:
        aiResult.quickReplies && aiResult.quickReplies.length > 0
          ? aiResult.quickReplies
          : buildQuickRepliesForField(factField),
    },
  ];
}

function aiResultFromPartial(partial: Partial<ContractCopilotAIOutput>): ContractCopilotAIOutput {
  return {
    detectedScenario: typeof partial.detectedScenario === "string" ? partial.detectedScenario : "",
    questionType: typeof partial.questionType === "string" ? partial.questionType : "",
    answerCompleteness: partial.answerCompleteness === "resolved" ? "resolved" : "provisional",
    shortAnswer: typeof partial.shortAnswer === "string" ? partial.shortAnswer : "",
    confidence:
      partial.confidence === "high" || partial.confidence === "medium" || partial.confidence === "low"
        ? partial.confidence
        : "medium",
    needsClarification: Boolean(partial.needsClarification),
    clarifyingQuestion: typeof partial.clarifyingQuestion === "string" ? partial.clarifyingQuestion : "",
    clarifyingField: typeof partial.clarifyingField === "string" ? partial.clarifyingField : "",
    quickReplies: Array.isArray(partial.quickReplies)
      ? partial.quickReplies.filter((item): item is ContractQuickReply => Boolean(item && typeof item === "object"))
      : [],
    whyItApplies: typeof partial.whyItApplies === "string" ? partial.whyItApplies : "",
    contractSupport: Array.isArray(partial.contractSupport) ? partial.contractSupport.filter(Boolean) : [],
    extractedFacts:
      partial.extractedFacts && typeof partial.extractedFacts === "object"
        ? (partial.extractedFacts as Record<string, string>)
        : {},
    assumptions: Array.isArray(partial.assumptions) ? partial.assumptions.filter((item): item is string => typeof item === "string") : [],
    scenarioBreakdown: Array.isArray(partial.scenarioBreakdown)
      ? partial.scenarioBreakdown.filter((item): item is string => typeof item === "string")
      : [],
    payBreakdown: Array.isArray(partial.payBreakdown)
      ? partial.payBreakdown.filter((item): item is string => typeof item === "string")
      : [],
    whatCouldChange: Array.isArray(partial.whatCouldChange)
      ? partial.whatCouldChange.filter((item): item is string => typeof item === "string")
      : [],
    practicalBreakdown: Array.isArray(partial.practicalBreakdown)
      ? partial.practicalBreakdown.filter((item): item is string => typeof item === "string")
      : [],
    followUpSuggestion: typeof partial.followUpSuggestion === "string" ? partial.followUpSuggestion : "",
  };
}

function normalizeExtractedFacts(extractedFacts: ContractCopilotAIOutput["extractedFacts"]): ParsedScenarioFacts {
  if (!extractedFacts) {
    return {};
  }

  const nextFacts: ParsedScenarioFacts = {};

  for (const [key, rawValue] of Object.entries(extractedFacts)) {
    const value = rawValue.trim().toLowerCase();
    switch (key) {
      case "status":
        if (value === "reserve" || value === "lineholder") {
          nextFacts.status = value;
        }
        break;
      case "pickupType":
      case "premiumType":
      case "assignmentType":
      case "leaveType":
      case "eventTiming":
        nextFacts[key] = value;
        break;
      case "beforeReport":
      case "afterReport":
      case "rerouteOccurred":
      case "reassignmentOccurred":
      case "tripTouched":
      case "sickUsed":
      case "sameDayInteraction":
        nextFacts[key] = value === "true" || value === "yes";
        break;
      case "questionIntent":
        if (value === "what_happens" || value === "can_i" || value === "citation_help" || value === "dispute_help") {
          nextFacts.questionIntent = value;
        }
        break;
      default:
        break;
    }
  }

  return nextFacts;
}

function isWeakContractCopilotAIResponse(result: ContractCopilotAIOutput) {
  const shortAnswer = typeof result.shortAnswer === "string" ? result.shortAnswer.trim() : "";
  if (shortAnswer.length < 18) {
    return true;
  }
  if (shortAnswer.length > 320) {
    return true;
  }
  const weakStarts = [
    "this depends",
    "it depends",
    "you should analyze",
    "this should be analyzed",
    "the answer depends",
  ];
  if (weakStarts.some((prefix) => shortAnswer.toLowerCase().startsWith(prefix))) {
    return true;
  }
  if (result.needsClarification && !result.clarifyingQuestion) {
    return true;
  }
  return false;
}

function deriveSupportLevelFromReferences(
  references: Array<{ sourceId: "pwa" | "compensation_manual" | "scheduler_manual"; ruleType: RuleType }>
) {
  const labels = new Set(
    references.map((reference) =>
      reference.ruleType === "inference"
        ? "Inference"
        : reference.sourceId === "pwa"
          ? "PWA"
          : reference.sourceId === "compensation_manual"
            ? "Compensation Manual"
          : "Scheduler Manual"
    )
  );
  if (labels.has("PWA") && labels.size === 1) {
    return "contract_backed" as const;
  }
  if (labels.has("Compensation Manual") && labels.size === 1) {
    return "manual_backed" as const;
  }
  if (labels.has("Scheduler Manual") && labels.size === 1) {
    return "manual_backed" as const;
  }
  if (
    labels.has("PWA") &&
    (labels.has("Scheduler Manual") || labels.has("Compensation Manual"))
  ) {
    return "mixed" as const;
  }
  return "inference_heavy" as const;
}

function retrievedSnippetToAnswerReference(item: ContractCopilotAIRetrievedSupportItem) {
  return {
    label: item.note || item.title,
    sourceId: item.sourceId,
    section: inferSupportSectionAnchor(item),
    quoteSnippet: item.quoteSnippet,
    ruleType: item.ruleType,
  };
}

function toGroundingSnippetFromDeterministic(reference: {
  label: string;
  section: string;
  quoteSnippet?: string;
}): AIGroundingSnippet {
  return {
    id: `logic:${reference.section}:${reference.label}`,
    sourceLabel: "CrewTools Logic",
    tier: "crewtools_logic",
    section: reference.section,
    snippet: reference.quoteSnippet ?? reference.label,
    note: reference.label,
    relevanceScore: 1,
  };
}

function toGroundingSnippetFromSeededRetrieved(item: ContractCopilotAIRetrievedSupportItem): AIGroundingSnippet {
  return {
    id: `seeded:${item.ruleId}:${item.section}`,
    sourceLabel: item.sourceLabel,
    tier:
      item.sourceId === "pwa"
        ? "pwa"
        : item.sourceId === "compensation_manual"
          ? "compensation_manual"
          : "scheduler_manual",
    section: item.section,
    snippet: item.quoteSnippet ?? item.note ?? item.title,
    note: item.note ?? item.title,
    relevanceScore: item.score + 20,
    matchedTerms: item.matchedTerms,
    metadata: {
      ruleId: item.ruleId,
      scenario: item.scenario,
      title: item.title,
      source: "seeded_rule_index",
    },
  };
}

function buildGroundedReferences(args: {
  aiSupportItems?: Array<{ sourceLabel: string; section: string; quoteSnippet?: string; note?: string }>;
  retrievedSupport: ContractCopilotAIRetrievedSupportItem[];
  fallbackReferences: ContractCopilotApiSuccessResponse["answer"]["references"];
  preferredSection?: string;
  preferredPacket?: SectionAwareGroundingPacket;
}) {
  const retrievedReferences = args.retrievedSupport.map(retrievedSnippetToAnswerReference);
  const normalizedAISupport = args.aiSupportItems ?? [];
  const preferredSection = args.preferredSection?.trim().toLowerCase();
  const prioritizePreferredSection = <
    T extends { section: string; sourceId?: "pwa" | "compensation_manual" | "scheduler_manual" }
  >(
    items: T[]
  ) =>
    [...items].sort((left, right) => {
      const leftPreferred = preferredSection && left.section.trim().toLowerCase() === preferredSection ? 1 : 0;
      const rightPreferred = preferredSection && right.section.trim().toLowerCase() === preferredSection ? 1 : 0;
      return rightPreferred - leftPreferred;
    });

  const packetReference =
    args.preferredPacket && args.preferredPacket.content.trim().length > 0
      ? {
          label: args.preferredPacket.title ?? args.preferredPacket.note ?? args.preferredPacket.section,
          sourceId:
            args.preferredPacket.tier === "pwa"
              ? ("pwa" as const)
              : args.preferredPacket.tier === "compensation_manual"
                ? ("compensation_manual" as const)
                : ("scheduler_manual" as const),
          section: args.preferredPacket.section,
          quoteSnippet: (() => {
            const content = args.preferredPacket?.content ?? "";
            const longCallMatch = content.match(
              /long call reserve pilot[\s\S]{0,220}?within 18 hours[\s\S]{0,220}?single pay[\s\S]{0,220}?no credit/i
            );
            if (longCallMatch) {
              return trimToTwoSentences(longCallMatch[0]);
            }
            const apdMatch = content.match(
              /apd request will be granted[\s\S]{0,220}?25%\s+of\s+the\s+number\s+of\s+reserves\s+required/i
            );
          if (apdMatch) {
            return trimToTwoSentences(apdMatch[0]);
          }
          const sickGsMatch = content.match(
            /replenish[\s\S]{0,260}?single pay[\s\S]{0,260}?no credit[\s\S]{0,260}?(?:alv|75 hours)/i
          );
          if (sickGsMatch) {
            return trimToTwoSentences(sickGsMatch[0]);
          }
          return trimToTwoSentences(content);
        })(),
          ruleType:
            args.preferredPacket.tier === "pwa"
              ? ("contract" as const)
              : ("scheduler_practice" as const),
        }
      : null;

  if (args.retrievedSupport.length > 0) {
    const matchedRetrieved = args.retrievedSupport.filter((snippet) =>
      normalizedAISupport.some((item) => {
        const normalizedSource = normalizeAISourceLabel(item.sourceLabel);
        const sameSource =
          (snippet.sourceId === "pwa" && normalizedSource === "PWA") ||
          (snippet.sourceId === "compensation_manual" && normalizedSource === "Compensation Manual") ||
          (snippet.sourceId === "scheduler_manual" && normalizedSource === "Scheduler Manual") ||
          (snippet.ruleType === "inference" && normalizedSource === "Inference");
        const sameSection = item.section.trim().toLowerCase() === snippet.section.trim().toLowerCase();
        return sameSource && sameSection;
      })
    );

    if (matchedRetrieved.length > 0) {
      const prioritized = prioritizePreferredSection(matchedRetrieved).map(retrievedSnippetToAnswerReference);
      return {
        references:
          packetReference &&
          !prioritized.some((item) => item.section.trim().toLowerCase() === packetReference.section.trim().toLowerCase())
            ? [packetReference, ...prioritized]
            : prioritized,
        usedRetrievedSupport: true,
      };
    }

    const prioritized = prioritizePreferredSection(retrievedReferences).slice(0, Math.min(6, retrievedReferences.length));
    return {
      references:
        packetReference &&
        !prioritized.some((item) => item.section.trim().toLowerCase() === packetReference.section.trim().toLowerCase())
          ? [packetReference, ...prioritized]
          : prioritized,
      usedRetrievedSupport: true,
    };
  }

  if (normalizedAISupport.length > 0) {
    const synthesized = normalizedAISupport.map((item) => ({
      label: item.note ?? args.fallbackReferences[0]?.label ?? "AI-selected support",
      sourceId:
        normalizeAISourceLabel(item.sourceLabel) === "PWA"
          ? ("pwa" as const)
          : ("scheduler_manual" as const),
      section: item.section,
      quoteSnippet: item.quoteSnippet,
      ruleType:
        normalizeAISourceLabel(item.sourceLabel) === "PWA"
          ? ("contract" as const)
          : normalizeAISourceLabel(item.sourceLabel) === "Scheduler Manual"
            ? ("scheduler_practice" as const)
            : ("inference" as const),
    }));
    return {
      references:
        packetReference &&
        !synthesized.some((item) => item.section.trim().toLowerCase() === packetReference.section.trim().toLowerCase())
          ? [packetReference, ...synthesized]
          : synthesized,
      usedRetrievedSupport: false,
    };
  }

  return {
    references:
      packetReference &&
      !args.fallbackReferences.some(
        (item) => item.section.trim().toLowerCase() === packetReference.section.trim().toLowerCase()
      )
        ? [packetReference, ...args.fallbackReferences]
        : args.fallbackReferences,
    usedRetrievedSupport: false,
  };
}

function tryParsePartialAIOutput(rawText?: string, partialOutput?: unknown): Partial<ContractCopilotAIOutput> | null {
  if (partialOutput && typeof partialOutput === "object") {
    return partialOutput as Partial<ContractCopilotAIOutput>;
  }
  if (!rawText) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" ? (parsed as Partial<ContractCopilotAIOutput>) : null;
  } catch {
    return null;
  }
}

function isRefusalStyleShortAnswer(shortAnswer: string | undefined) {
  const normalized = (shortAnswer ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const refusalPhrases = [
    "i need more detail",
    "need more detail",
    "i need one more detail",
    "i can't determine",
    "cannot determine",
    "can't determine",
    "cannot tell",
    "can't tell",
    "need more information",
    "i need more information",
    "i can't safely resolve this",
    "can't safely resolve this",
    "i cannot safely resolve this",
    "i need one more detail before i can tell you what should happen",
  ];
  return refusalPhrases.some((phrase) => normalized.includes(phrase));
}

function trimToTwoSentences(value: string | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const matches = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  return matches
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ")
    .trim();
}

function filterStrongContractReferences(
  references: ContractCopilotApiSuccessResponse["answer"]["references"]
) {
  return references.filter(
    (reference) =>
      reference.ruleType !== "inference" &&
      typeof reference.quoteSnippet === "string" &&
      reference.quoteSnippet.trim().length > 0
  );
}

function scoreVisibleReferenceSpecificity(section: string | undefined) {
  const normalized = (section ?? "").trim().toUpperCase();
  if (/^SECTION\s+\d{1,2}\s+[A-Z]\.\d+$/.test(normalized)) {
    return 3;
  }
  if (/^SECTION\s+\d{1,2}\s+[A-Z]$/.test(normalized)) {
    return 2;
  }
  if (/^SECTION\s+\d{1,2}$/.test(normalized)) {
    return 1;
  }
  return 0;
}

function selectVisibleContractReferences(
  references: ContractCopilotApiSuccessResponse["answer"]["references"]
) {
  return [...filterStrongContractReferences(references)]
    .sort((left, right) => {
      const specificityDelta =
        scoreVisibleReferenceSpecificity(right.section) - scoreVisibleReferenceSpecificity(left.section);
      if (specificityDelta !== 0) {
        return specificityDelta;
      }
      return (right.quoteSnippet?.length ?? 0) - (left.quoteSnippet?.length ?? 0);
    })
    .slice(0, 3);
}

function selectVisibleSupportLevel(
  references: ContractCopilotApiSuccessResponse["answer"]["references"]
): SupportLevel {
  const strongReferences = filterStrongContractReferences(references);
  if (strongReferences.length === 0) {
    return "inference_heavy";
  }
  return deriveSupportLevelFromReferences(strongReferences);
}

function buildFinalVisibleSupportDebug(
  visibleReferences: ContractCopilotApiSuccessResponse["answer"]["references"],
  rerankDebug: Record<string, unknown> | undefined
) {
  const finalVisibleSupportSections = visibleReferences.map((reference) => reference.section).filter(Boolean);
  const promotedSections = Array.isArray(rerankDebug?.visibleSupportPromotedSection)
    ? rerankDebug.visibleSupportPromotedSection
    : [];
  const originalSections = Array.isArray(rerankDebug?.visibleSupportOriginalSection)
    ? rerankDebug.visibleSupportOriginalSection
    : [];

  return {
    finalVisibleSupportSections,
    finalVisibleSupportPromotionApplied:
      finalVisibleSupportSections.some((section, index) => section !== originalSections[index]) ||
      Boolean(rerankDebug?.visibleSupportAnchorPromoted) ||
      promotedSections.some((section, index) => section !== originalSections[index]),
  };
}

function normalizeSupportText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSectionIdentifier(value: string | undefined) {
  return normalizeSupportText(value).replace(/[^a-z0-9]+/g, "");
}

function extractSectionParentIdentifiers(value: string | undefined) {
  const text = (value ?? "").trim().toUpperCase();
  if (!text) {
    return [];
  }

  const normalized = text.replace(/^SECTION\s+/i, "").replace(/\s+/g, " ").trim();
  const parents: string[] = [];
  const subsectionMatch = normalized.match(/^(\d{1,2})\s+([A-Z])\.(\d+)$/);
  if (subsectionMatch) {
    parents.push(`SECTION ${subsectionMatch[1]} ${subsectionMatch[2]}`);
    parents.push(`SECTION ${subsectionMatch[1]}`);
    return parents;
  }

  const letterMatch = normalized.match(/^(\d{1,2})\s+([A-Z])$/);
  if (letterMatch) {
    parents.push(`SECTION ${letterMatch[1]}`);
    return parents;
  }

  const topLevelMatch = normalized.match(/^(\d{1,2})$/);
  if (topLevelMatch) {
    parents.push(`SECTION ${topLevelMatch[1]}`);
  }

  return parents;
}

function keepMostSpecificSectionReferences(sections: string[]) {
  const unique = Array.from(new Set(sections));
  return unique.filter((section) => {
    const normalized = normalizeSectionIdentifier(section);
    return !unique.some((other) => {
      if (other === section) {
        return false;
      }
      const otherNormalized = normalizeSectionIdentifier(other);
      return otherNormalized.length > normalized.length && otherNormalized.includes(normalized);
    });
  });
}

function isSpecificSubsectionAnchor(section: string | undefined) {
  const text = String(section ?? "").trim().toUpperCase();
  return /^SECTION\s+\d{1,2}\s+[A-Z](?:\.\d+)?$/.test(text);
}

function scoreSectionAnchorMatch(args: {
  exactSections: string[];
  section?: string;
  label?: string;
  quoteSnippet?: string;
}) {
  const combined = normalizeSupportText(
    `${args.section ?? ""} ${args.label ?? ""} ${args.quoteSnippet ?? ""}`
  );
  const normalizedCombined = normalizeSectionIdentifier(combined);

  const exactCandidates = [...args.exactSections].sort(
    (left, right) => normalizeSectionIdentifier(right).length - normalizeSectionIdentifier(left).length
  );

  let exactAnchor: string | undefined;
  for (const section of exactCandidates) {
    const normalized = normalizeSectionIdentifier(section);
    if (normalized.length > 0 && normalizedCombined.includes(normalized)) {
      exactAnchor = section;
      break;
    }
  }

  if (exactAnchor) {
    return {
      score: 420,
      exact: true,
      parent: false,
      anchor: exactAnchor,
    };
  }

  const parentCandidates = Array.from(
    new Set(exactCandidates.flatMap((section) => extractSectionParentIdentifiers(section)))
  ).sort((left, right) => normalizeSectionIdentifier(right).length - normalizeSectionIdentifier(left).length);

  for (const parent of parentCandidates) {
      const normalizedParent = normalizeSectionIdentifier(parent);
      if (normalizedParent.length > 0 && normalizedCombined.includes(normalizedParent)) {
        return {
          score: 180,
          exact: false,
          parent: true,
          anchor: parent,
        };
      }
  }

  return {
    score: 0,
    exact: false,
    parent: false,
    anchor: undefined,
  };
}

function extractSectionReferencesFromText(value: string | undefined) {
  const text = value ?? "";
  const matches =
    text.match(
      /\bsection\s+\d{1,2}(?:\s*[A-Z](?:\.?\d+)?)?(?:\.\d+)?(?:\.[A-Z])?|\b\d{1,2}\s*[A-Z](?:\.?\d+)?\b|§\s*\d{1,2}(?:\s*[A-Z](?:\.?\d+)?)?/gi
    ) ?? [];
  return Array.from(
    new Set(
      matches
        .map((item) =>
          item
            .replace(/^§\s*/i, "Section ")
            .replace(/\s+/g, " ")
            .replace(/(\d{1,2})([A-Z])/i, "$1 $2")
            .replace(/([A-Z])(\d+)/i, "$1.$2")
            .trim()
            .toUpperCase()
        )
        .map((item) => (item.startsWith("SECTION ") ? item : `SECTION ${item}`))
    )
  );
}

function extractSupportIntentTerms(question: string, answerText: string) {
  const combined = `${question} ${answerText}`.toLowerCase();
  const termMap = [
    { key: "apd", patterns: [/\bapd\b/, /authorized personal drop/] },
    { key: "holiday", patterns: [/\bholiday\b/, /\bholidays\b/] },
    { key: "wocl", patterns: [/\bwocl\b/] },
    { key: "8d3", patterns: [/\b8d3\b/, /\b8 d\.?3\b/, /\b8 d 3\b/] },
    { key: "no op", patterns: [/\bno op\b/, /\bnoop\b/] },
    { key: "harmed pilot", patterns: [/harmed pilot/] },
    { key: "auto accept", patterns: [/auto accept/, /\bauto-accept\b/] },
    { key: "silver slip", patterns: [/silver slip/, /\bss\b/] },
    { key: "green slip", patterns: [/green slip/, /greenslip/, /\bgs\b/] },
    { key: "gswc", patterns: [/\bgswc\b/, /green slip with conflict/] },
    { key: "premium pay", patterns: [/premium pay/, /double pay/, /double-time/, /single pay/, /pay no credit/] },
    { key: "rotation guarantee", patterns: [/rotation guarantee/] },
    { key: "reserve guarantee", patterns: [/reserve guarantee/] },
    { key: "reroute", patterns: [/reroute/, /rerouted/] },
    { key: "deadhead", patterns: [/deadhead/] },
    { key: "short call", patterns: [/short call/] },
    { key: "same-day trip", patterns: [/same day trip/, /subsequent same day trip/] },
    { key: "report time", patterns: [/report time/, /reports at/, /\b5:10pm\b/, /\b510pm\b/] },
    { key: "release", patterns: [/\brelease\b/] },
    { key: "duty period", patterns: [/\bduty period\b/, /\bduty\b/] },
    { key: "flight time", patterns: [/\bflight time\b/, /\b7\+36\b/, /\b9\+36\b/] },
    { key: "legality", patterns: [/\blegality\b/, /\blegal\b/, /remain on schedule/] },
    { key: "pb", patterns: [/\bpb\b/, /\bpayback\b/] },
    { key: "pr", patterns: [/\bpr\b/, /\bpr remainder\b/] },
    { key: "lc", patterns: [/\blc\b/, /\blong call\b/] },
    { key: "qs", patterns: [/\bqs\b/, /\bquick slip\b/] },
    { key: "senior responder", patterns: [/\bsenior responder\b/] },
    { key: "same rotation", patterns: [/\bsame rotation\b/, /\bexact same rotation\b/] },
    { key: "duplicate award", patterns: [/\bduplicate award\b/, /\balready awarded\b/] },
    { key: "premium pay", patterns: [/\bpremium pay\b/, /\bquintuple\b/, /\bmultiple pay\b/] },
    { key: "mou", patterns: [/\bmou\b/] },
    { key: "ioe", patterns: [/\bioe\b/] },
    { key: "court/legal obligation", patterns: [/\bcourt\b/, /\bcustody\b/, /\bhearing\b/] },
    { key: "notice to appear", patterns: [/\bnotice to appear\b/, /\bsubpoena\b/] },
    { key: "trip conflict", patterns: [/\btrip conflict\b/, /\bday 1 of (a )?\d+-?day trip\b/, /\bday 1 of a 4 day trip\b/] },
    { key: "leave", patterns: [/\bleave\b/, /\babsence\b/] },
    { key: "cpo", patterns: [/\bcpo\b/] },
    { key: "known absence", patterns: [/\bknown absence\b/] },
    { key: "rotation change", patterns: [/\brotation changed\b/, /\bchanged for next month\b/, /\bremoved a leg\b/] },
    { key: "redeye", patterns: [/\bredeye\b/, /\bred eye\b/] },
    { key: "carryover", patterns: [/\bcarryover\b/, /\bcarry-over\b/, /\bnot a carryover\b/] },
    { key: "credit protection", patterns: [/\bcredit protection\b/, /\bcredit\b/] },
    { key: "removed leg", patterns: [/\bremoved a leg\b/, /\bremoved leg\b/] },
    { key: "capped reserve days", patterns: [/\bcapped rsv\b/, /\bcapped reserve days?\b/] },
    { key: "swap with pot", patterns: [/\bswap with (the )?pot\b/] },
    { key: "arcos", patterns: [/\barcos\b/] },
    { key: "dart", patterns: [/\bdart\b/] },
    { key: "stop", patterns: [/\bstop\b/] },
    { key: "x-days", patterns: [/\bx-days?\b/, /\bx days?\b/, /\binterrupted x-days?\b/] },
    { key: "notification", patterns: [/\bnotification\b/, /\brobot\b/, /\bnotice\b/] },
    { key: "pay protection", patterns: [/\bpay protection\b/, /\bdue anything extra\b/] },
    { key: "golden day", patterns: [/\bgolden day\b/] },
    { key: "hard non-fly day", patterns: [/\bhard non-fly day\b/] },
    { key: "assignment timing", patterns: [/\b6pm\b/, /\b1800\b/, /\bday one\b/, /\bday before\b/, /\bearlier than\b/] },
    { key: "bid period", patterns: [/\bbid period\b/, /\bapril bid period\b/, /\bmay bid period\b/, /\bcurrent bid period\b/, /\bnext bid period\b/] },
    { key: "reserve coverage", patterns: [/\breserve coverage\b/] },
    { key: "actual", patterns: [/\bactual\b/] },
    { key: "qualified", patterns: [/\bqualified\b/] },
    { key: "open time", patterns: [/\bopen time\b/] },
    { key: "pcs", patterns: [/\bpcs\b/, /\b1200 pcs\b/] },
    { key: "carry-out", patterns: [/\bcarry-out\b/, /\bcarry out\b/] },
    { key: "black days", patterns: [/\bblack days?\b/] },
    { key: "max pickup", patterns: [/\bmax p\/?up\b/, /\bmax pickup\b/, /\bpickup limit\b/] },
    { key: "drop/add", patterns: [/\bdrop trip\b/, /\bdrop\b/, /\badd\b/, /\bpickup\b/] },
    { key: "overlap", patterns: [/\boverlap\b/, /\boverlaps\b/] },
    { key: "processing", patterns: [/\bprocessing\b/, /\bprocess\b/, /\brun\b/] },
    { key: "coverage works", patterns: [/\bcoverage works\b/] },
  ];
  return termMap
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(combined)))
    .map((entry) => entry.key);
}

function answerAwareSupportQualityGate(args: {
  question: string;
  answerText: string;
  ranked: Array<{
    reference: NonNullable<ContractCopilotApiSuccessResponse["answer"]>["references"][number];
    score: number;
    matchedTerms: string[];
    exactSectionHit: boolean;
  }>;
}) {
  const questionSections = extractSectionReferencesFromText(args.question);
  const answerSections = extractSectionReferencesFromText(args.answerText);
  const questionTerms = extractSupportIntentTerms(args.question, "");
  const answerTerms = extractSupportIntentTerms("", args.answerText);
  const combinedQuestionAnchors = new Set([...questionSections, ...questionTerms]);
  const droppedReasons: string[] = [];

  const filtered = args.ranked.filter((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    const answerSectionMatch = answerSections.some((section) => {
      const normalized = normalizeSectionIdentifier(section);
      return normalizeSectionIdentifier(item.reference.section).includes(normalized) || normalizeSectionIdentifier(combined).includes(normalized);
    });
    const answerTermMatches = answerTerms.filter((term) => combined.includes(term));
    const questionAnchorMatches = Array.from(combinedQuestionAnchors).filter((anchor) => combined.includes(normalizeSupportText(anchor)));
    const passes =
      item.exactSectionHit ||
      answerSectionMatch ||
      answerTermMatches.length >= 1 ||
      questionAnchorMatches.length >= 2;

    if (!passes) {
      droppedReasons.push(item.reference.section ?? item.reference.label ?? "unknown_support");
    }
    return passes;
  });

  const primarySections = answerSections.length > 0 ? answerSections : questionSections;
  const primaryAnchorMissing =
    primarySections.length > 0 &&
    !filtered.some((item) =>
      primarySections.some((section) => {
        const normalized = normalizeSectionIdentifier(section);
        return normalizeSectionIdentifier(item.reference.section).includes(normalized);
      })
    );

  return {
    filtered,
    questionTerms,
    answerTerms,
    answerSections,
    droppedReasons,
    primaryAnchorMissing,
  };
}

function isDefinitionStyleQuestion(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.startsWith("what is ") ||
    lower.startsWith("what does ") ||
    lower.startsWith("explain ") ||
    lower.includes("definition")
  );
}

function detectComparisonSupportSides(question: string) {
  const lower = question.toLowerCase();
  const sides: string[] = [];
  if (lower.includes("silver slip") || /\bss\b/.test(lower)) {
    sides.push("silver slip");
  }
  if (lower.includes("greenslip") || lower.includes("green slip") || /\bgs\b/.test(lower)) {
    sides.push("green slip");
  }
  if (lower.includes("qs") || lower.includes("quick slip")) {
    sides.push("quick slip");
  }
  if (lower.includes("short call")) {
    sides.push("short call");
  }
  if (lower.includes("reserve guarantee")) {
    sides.push("reserve guarantee");
  }
  if (lower.includes("rotation guarantee")) {
    sides.push("rotation guarantee");
  }
  if (lower.includes("harmed pilot")) {
    sides.push("harmed pilot");
  }
  if (lower.includes("auto accept")) {
    sides.push("auto accept");
  }
  const comparisonCue =
    /\bvs\b/.test(lower) ||
    lower.includes("similar to") ||
    lower.includes("compare") ||
    lower.includes("difference between") ||
    lower.includes("does that mean") ||
    lower.includes("doesn't that mean") ||
    lower.includes("how does this compare") ||
    lower.includes("how does this apply") ||
    lower.includes("threshold");
  return comparisonCue ? Array.from(new Set(sides)) : [];
}

function inferSupportSectionAnchor(reference: {
  section?: string;
  label?: string;
  quoteSnippet?: string;
}) {
  const combined = normalizeSupportText(
    `${reference.section ?? ""} ${reference.label ?? ""} ${reference.quoteSnippet ?? ""}`
  );
  if (combined.includes("silver slip carry-out")) {
    return "Silver Slip carry-out";
  }
  if (combined.includes("pcs processing") || (combined.includes("pcs") && combined.includes("run"))) {
    return "PCS processing";
  }
  if (combined.includes("swap with pot")) {
    return "swap with pot";
  }
  if (combined.includes("capped reserve days")) {
    return "capped reserve days";
  }
  if (combined.includes("max pickup") || combined.includes("pickup limit")) {
    return "max pickup";
  }
  if (combined.includes("carry-out")) {
    return "carry-out";
  }
  if (combined.includes("bid-period crossover")) {
    return "bid-period crossover";
  }
  if (combined.includes("open time processing")) {
    return "open time processing";
  }
  if (combined.includes("silver slip")) {
    return "Silver Slip (inferred)";
  }
  if (combined.includes("green slip") || /\bgs\b/.test(combined)) {
    return "Green Slip (inferred)";
  }
  return reference.section;
}

function applyComparisonSupportNote(args: {
  question: string;
  answer: ContractAnswerCard;
  references: ContractCopilotApiSuccessResponse["answer"]["references"];
}) {
  const comparisonSides = detectComparisonSupportSides(args.question);
  if (comparisonSides.length < 2) {
    return args.answer;
  }

  const supportText = normalizeSupportText(
    args.references
      .map((reference) => `${reference.section ?? ""} ${reference.label ?? ""} ${reference.quoteSnippet ?? ""}`)
      .join(" ")
  );
  const supportedSides = comparisonSides.filter((side) => supportText.includes(side));
  if (supportedSides.length === 0 || supportedSides.length === comparisonSides.length) {
    return args.answer;
  }

  const missingSides = comparisonSides.filter((side) => !supportedSides.includes(side));
  const note = `Support note: I found support for ${supportedSides.join(" and ")} but not for ${missingSides.join(" and ")}.`;

  return {
    ...args.answer,
    plainEnglishExplanation: `${args.answer.plainEnglishExplanation}\n${note}`.trim(),
    caveats: Array.from(new Set([...(args.answer.caveats ?? []), note])),
  };
}

function rerankSupportReferences(args: {
  question: string;
  answerText: string;
  references: ContractCopilotApiSuccessResponse["answer"]["references"];
  selectedLane?: string;
}) {
  const questionSections = extractSectionReferencesFromText(args.question);
  const answerSections = extractSectionReferencesFromText(args.answerText);
  const exactSections = keepMostSpecificSectionReferences([
    ...questionSections,
    ...answerSections,
  ]);
  const questionTerms = extractSupportIntentTerms(args.question, "");
  const answerTerms = extractSupportIntentTerms("", args.answerText);
  const comparisonSides = detectComparisonSupportSides(args.question);
  const silverSlipQuery =
    args.question.toLowerCase().includes("silver slip") || /\bss\b/.test(args.question.toLowerCase());
  const xDayScenario =
    /\bx-days?\b/i.test(args.question) ||
    /\bx days?\b/i.test(args.question) ||
    /interrupted x-days?/i.test(args.question) ||
    /lost x-day/i.test(args.question) ||
    /x-day credit/i.test(args.question);
  const shortCallDutyScenario =
    /short call/i.test(args.question) &&
    (
      /same day trip|subsequent same day trip/i.test(args.question) ||
      /report time|reports at/i.test(args.question) ||
      /duty/i.test(args.question) ||
      /flight time/i.test(args.question) ||
      /legality/i.test(args.question) ||
      /both remain on schedule/i.test(args.question) ||
      /assigned short call and trip/i.test(args.question)
    );
  const pcsSwapScenario = detectPcsSwapScenario(args.question);
  const matchedTerms = Array.from(new Set([...questionTerms, ...answerTerms]));
  const termWeights: Record<string, number> = {
    "harmed pilot": 80,
    "auto accept": 80,
    "silver slip": 90,
    "premium pay": 55,
    "green slip": 35,
    gswc: 35,
    "rotation guarantee": 50,
    "reserve guarantee": 50,
    reroute: 40,
    deadhead: 40,
    "short call": 40,
    pb: 55,
    pr: 45,
    lc: 45,
    qs: 60,
    "senior responder": 70,
    "same rotation": 70,
    "duplicate award": 75,
    "premium pay": 65,
    mou: 55,
    ioe: 65,
    "court/legal obligation": 75,
    "notice to appear": 75,
    "trip conflict": 70,
    leave: 55,
    cpo: 55,
    "known absence": 60,
    "rotation change": 70,
    redeye: 60,
    carryover: 55,
    "credit protection": 60,
    "removed leg": 60,
    "capped reserve days": 65,
    "swap with pot": 65,
    arcos: 55,
    dart: 50,
    stop: 50,
    "x-days": 60,
    "x-day": 75,
    "report time": 75,
    "release": 55,
    "duty period": 85,
    "flight time": 80,
    "legality": 85,
    "same-day trip": 80,
    notification: 45,
    "pay protection": 60,
    "golden day": 85,
    "hard non-fly day": 85,
    "assignment timing": 60,
    "bid period": 70,
    "reserve coverage": 70,
    actual: 45,
    qualified: 45,
    "open time": 55,
    pcs: 90,
    "carry-out": 80,
    "black days": 70,
    "max pickup": 85,
    "drop/add": 75,
    overlap: 70,
    processing: 65,
    "coverage works": 60,
  };
  const definitionStyle = isDefinitionStyleQuestion(args.question);
  const pcsGeneralTerms = [
    "pcs",
    "swap with pot",
    "bid period",
    "carry-out",
    "capped reserve days",
    "black days",
    "max pickup",
    "drop/add",
    "reserve coverage",
    "open time",
    "processing",
    "coverage works",
  ];
  const pcsRequiredTerms = pcsSwapScenario
    ? Array.from(
        new Set(
          [
            ...(args.question.toLowerCase().includes("silver slip") ? ["silver slip", "carry-out", "bid period", "overlap", "drop/add"] : []),
            ...(args.question.toLowerCase().includes("black days") || args.question.toLowerCase().includes("capped reserve")
              ? ["capped reserve days", "black days", "swap with pot", "reserve coverage"]
              : []),
            ...((/\bpcs\b/i.test(args.question) || args.question.toLowerCase().includes("1200 pcs") || (args.question.toLowerCase().includes("april") && args.question.toLowerCase().includes("may")))
              ? ["pcs", "bid period", "swap with pot"]
              : []),
          ].filter(Boolean)
        )
      )
    : [];

  const scored = args.references.map((reference) => {
    const sectionText = normalizeSupportText(reference.section);
    const labelText = normalizeSupportText(reference.label);
    const snippetText = normalizeSupportText(reference.quoteSnippet);
    const combined = `${sectionText} ${labelText} ${snippetText}`;

    let score = 0;
    if (reference.sourceId === "pwa") {
      score += args.selectedLane === "document_section_explanation" ? 60 : 45;
    } else if (reference.sourceId === "compensation_manual") {
      score += 25;
    } else if (reference.sourceId === "scheduler_manual") {
      score += 20;
    }
    if (pcsSwapScenario) {
      if (reference.sourceId === "scheduler_manual") score += 90;
      if (reference.sourceId === "pwa") score += 20;
      if (reference.sourceId === "compensation_manual") score -= 10;
    }

    const sectionMatch = scoreSectionAnchorMatch({
      exactSections,
      section: reference.section,
      label: reference.label,
      quoteSnippet: reference.quoteSnippet,
    });
    const exactSectionHit = sectionMatch.exact;
    if (sectionMatch.score > 0) {
      score += sectionMatch.score;
    }

    const matchedTermHits = matchedTerms.filter((term) => combined.includes(term));
    const effectiveMatchedTermHits =
      matchedTermHits.length > 0 ? matchedTermHits : exactSectionHit ? matchedTerms.slice(0, 2) : [];
    score += effectiveMatchedTermHits.reduce((sum, term) => sum + (termWeights[term] ?? 35), 0);
    if (effectiveMatchedTermHits.length >= 2) {
      score += 30;
    }
    if (effectiveMatchedTermHits.length >= 3) {
      score += 20;
    }
      if (exactSectionHit && matchedTerms.length > 0) {
        score += 25;
      }

    const genericScopeOrGlossary =
      /\bsection 1\b|\bscope\b|\bdefinitions?\b/.test(combined);
    if (genericScopeOrGlossary && !definitionStyle && !exactSectionHit) {
      score -= 140;
    }
    const genericPremiumWithoutSlip =
      combined.includes("premium pay") &&
      !combined.includes("silver slip") &&
      !combined.includes("green slip") &&
      !/\bgs\b/.test(combined);
    if (silverSlipQuery && genericPremiumWithoutSlip) {
      score -= 120;
    }
    const silverHit = combined.includes("silver slip");
    const greenHit = combined.includes("green slip") || /\bgs\b/.test(combined);
    const pcsSpecificHits = pcsGeneralTerms.filter((term) => combined.includes(term));
    const pcsRequiredHits = pcsRequiredTerms.filter((term) => combined.includes(term));
    if (silverSlipQuery) {
      if (silverHit) score += 180;
      if (!comparisonSides.includes("green slip") && greenHit && !silverHit) score -= 120;
      if (comparisonSides.includes("green slip") && silverHit && greenHit) score += 70;
      if (comparisonSides.includes("green slip") && greenHit && !silverHit) score += 25;
    }
    if (xDayScenario) {
      const xDayHit = combined.includes("x-day") || combined.includes("x day");
      const xDaySectionHit =
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 23 L.9")) ||
        normalizeSectionIdentifier(combined).includes(normalizeSectionIdentifier("Section 23 L.9"));
      if (xDaySectionHit) score += 180;
      else if (xDayHit) score += 95;
      else if (normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 23 L"))) score += 55;
    }
    if (shortCallDutyScenario) {
      const shortCallHit = combined.includes("short call");
      const dutyHit = combined.includes("duty period") || combined.includes("flight time") || combined.includes("legality");
      const section23SHit = normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 23 S.9")) ||
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 23 S")) ||
        normalizeSectionIdentifier(combined).includes(normalizeSectionIdentifier("Section 23 S.9"));
      const section12Hit =
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 12")) ||
        normalizeSectionIdentifier(combined).includes(normalizeSectionIdentifier("Section 12"));
      if (section23SHit) score += 160;
      if (section12Hit) score += 135;
      if (shortCallHit && dutyHit) score += 95;
      else if (shortCallHit) score += 45;
      if (combined.includes("promptly available") || combined.includes("report for a rotation")) score += 60;
    }
    if (pcsSwapScenario) {
      const pcsHit = pcsSpecificHits.length > 0;
      if (pcsHit) score += 120;
      score += pcsSpecificHits.length * 28;
      score += pcsRequiredHits.length * 40;
      if (reference.sourceId === "scheduler_manual" && pcsSpecificHits.length > 0) score += 130;
      if (reference.sourceId === "pwa" && pcsSpecificHits.length > 0) score += 25;
      if (reference.sourceId === "scheduler_manual" && pcsRequiredHits.length > 0) score += 80;
      if (combined.includes("black days")) score += 50;
      if (/\bsection 23\b/.test(combined) && !pcsHit && !exactSectionHit) score -= 180;
      if (combined.includes("open time") && pcsSpecificHits.length === 1 && !combined.includes("processing")) score -= 35;
      if ((combined.includes("definitions") || combined.includes("pilot-to-pilot swap board")) && pcsSpecificHits.length === 0) score -= 70;
    }

    return {
      reference,
      score,
      matchedTerms: effectiveMatchedTermHits,
      exactSectionHit,
      matchedSectionAnchor:
        silverSlipQuery && silverHit
          ? inferSupportSectionAnchor(reference)
          : silverSlipQuery && comparisonSides.includes("green slip") && greenHit && !silverHit
            ? inferSupportSectionAnchor(reference)
            : pcsSwapScenario && pcsSpecificHits.length > 0
              ? inferSupportSectionAnchor(reference)
            : sectionMatch.anchor,
    };
  });

  const sorted = [...scored].sort((left, right) => right.score - left.score);
  const reranked = sorted.slice(0, 5);
  for (const side of comparisonSides) {
    const alreadyCovered = reranked.some((item) => item.matchedTerms.includes(side));
    if (alreadyCovered) {
      continue;
    }
    const candidate = sorted.find((item) => item.matchedTerms.includes(side));
    if (!candidate) {
      continue;
    }
    const replaceIndex = reranked.findIndex((item) => !item.exactSectionHit && !comparisonSides.some((sideKey) => item.matchedTerms.includes(sideKey)));
    if (replaceIndex >= 0) {
      reranked[replaceIndex] = candidate;
      reranked.sort((left, right) => right.score - left.score);
    } else if (!reranked.some((item) => item.reference === candidate.reference)) {
      reranked.push(candidate);
      reranked.sort((left, right) => right.score - left.score);
      reranked.splice(5);
    }
  }
  for (const term of matchedTerms) {
    if (reranked.some((item) => item.matchedTerms.includes(term))) {
      continue;
    }
    const candidate = sorted.find((item) => item.matchedTerms.includes(term));
    if (!candidate) {
      continue;
    }
    const replaceIndex = reranked.findIndex((item) => !item.exactSectionHit);
    if (replaceIndex >= 0) {
      reranked[replaceIndex] = candidate;
      reranked.sort((left, right) => right.score - left.score);
    }
  }
  const qualityGate = answerAwareSupportQualityGate({
    question: args.question,
    answerText: args.answerText,
    ranked: reranked,
  });
  let qualityFiltered = qualityGate.filtered;
  const primarySections = qualityGate.answerSections.length > 0 ? qualityGate.answerSections : questionSections;
  if (primarySections.length > 0 && qualityGate.primaryAnchorMissing) {
    const anchorCandidate = sorted.find((item) =>
      primarySections.some((section) => {
        const normalized = normalizeSectionIdentifier(section);
        return normalizeSectionIdentifier(item.reference.section).includes(normalized);
      })
    );
    if (anchorCandidate) {
      qualityFiltered = [anchorCandidate, ...qualityFiltered].filter(
        (item, index, array) => array.findIndex((other) => other.reference === item.reference) === index
      );
    }
  }
  if (primarySections.length > 0 && qualityGate.primaryAnchorMissing) {
    qualityFiltered = [];
  }
  const finalRanked = qualityFiltered.slice(0, 4);
  if (comparisonSides.length >= 2) {
    for (const side of comparisonSides) {
      const alreadyCovered = finalRanked.some((item) => item.matchedTerms.includes(side));
      if (alreadyCovered) {
        continue;
      }
      const candidate = sorted.find((item) => item.matchedTerms.includes(side));
      if (!candidate) {
        continue;
      }
      if (!finalRanked.some((item) => item.reference === candidate.reference)) {
        if (finalRanked.length < 4) {
          finalRanked.push(candidate);
        } else {
          finalRanked[finalRanked.length - 1] = candidate;
        }
        finalRanked.sort((left, right) => right.score - left.score);
      }
    }
  }
  if (shortCallDutyScenario) {
    const hasShortCallCard = finalRanked.some((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      return combined.includes("short call") || normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 S.9"));
    });
    const hasDutyLegalityCard = finalRanked.some((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      return (
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 12")) ||
        combined.includes("duty period") ||
        combined.includes("flight time") ||
        combined.includes("legality") ||
        combined.includes("report")
      );
    });

    if (!hasShortCallCard) {
      const shortCallCandidate = sorted.find((item) => {
        const combined = normalizeSupportText(
          `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
        );
        return combined.includes("short call") || normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 S.9"));
      });
      if (shortCallCandidate && !finalRanked.some((item) => item.reference === shortCallCandidate.reference)) {
        if (finalRanked.length < 4) {
          finalRanked.push(shortCallCandidate);
        } else {
          finalRanked[finalRanked.length - 1] = shortCallCandidate;
        }
      }
    }
    if (!hasDutyLegalityCard) {
      const dutyCandidate = sorted.find((item) => {
        const combined = normalizeSupportText(
          `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
        );
        return (
          normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 12")) ||
          combined.includes("duty period") ||
          combined.includes("flight time") ||
          combined.includes("legality") ||
          combined.includes("report")
        );
      });
      if (dutyCandidate && !finalRanked.some((item) => item.reference === dutyCandidate.reference)) {
        if (finalRanked.length < 4) {
          finalRanked.push(dutyCandidate);
        } else {
          finalRanked[finalRanked.length - 1] = dutyCandidate;
        }
      }
    }
    finalRanked.sort((left, right) => right.score - left.score);
  }
  let pcsSwapSupportPromoted = false;
  let pcsSwapSupportMissingAnchors: string[] = [];
  if (pcsSwapScenario) {
    const bestPcsCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = pcsGeneralTerms.filter((term) => combined.includes(term));
      const requiredHits = pcsRequiredTerms.filter((term) => combined.includes(term));
      return (
        item.reference.sourceId === "scheduler_manual" &&
        (requiredHits.length > 0 || hits.length >= 2)
      );
    });
    if (bestPcsCandidate) {
      pcsSwapSupportPromoted = true;
      const remaining = finalRanked.filter((item) => item.reference !== bestPcsCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestPcsCandidate, ...remaining);
    }
    const visiblePcsTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return pcsGeneralTerms.filter((term) => combined.includes(term));
        })
      )
    );
    pcsSwapSupportMissingAnchors = pcsRequiredTerms.filter((term) => !visiblePcsTerms.includes(term));
  }
  const bestSilverSlipCandidate = sorted.find((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      combined.includes("silver slip") ||
      normalizeSupportText(item.matchedSectionAnchor).includes("silver slip") ||
      normalizeSupportText(item.reference.section).includes("silver slip")
    );
  });
  const bestGreenSlipCandidate = sorted.find((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return combined.includes("green slip") || /\bgs\b/.test(combined);
  });
  let silverSlipPrimarySupportFound = false;
  let greenSlipComparisonSupportFound = false;
  let silverSlipSupportMissing = false;
  if (silverSlipQuery) {
    if (bestSilverSlipCandidate) {
      silverSlipPrimarySupportFound = true;
      const withoutSilverPrimary = finalRanked.filter((item) => item.reference !== bestSilverSlipCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestSilverSlipCandidate, ...withoutSilverPrimary);
      if (comparisonSides.includes("green slip") && bestGreenSlipCandidate) {
        greenSlipComparisonSupportFound = true;
        if (!finalRanked.some((item) => item.reference === bestGreenSlipCandidate.reference)) {
          if (finalRanked.length < 4) {
            finalRanked.push(bestGreenSlipCandidate);
          } else {
            finalRanked[finalRanked.length - 1] = bestGreenSlipCandidate;
          }
        }
      }
      finalRanked.sort((left, right) => right.score - left.score);
      const silverIndex = finalRanked.findIndex((item) => item.reference === bestSilverSlipCandidate.reference);
      if (silverIndex > 0) {
        const [silverItem] = finalRanked.splice(silverIndex, 1);
        finalRanked.unshift(silverItem);
      }
    } else {
      silverSlipSupportMissing = true;
      greenSlipComparisonSupportFound = Boolean(bestGreenSlipCandidate);
      const nongreen = finalRanked.filter((item) => {
        const combined = normalizeSupportText(
          `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
        );
        return !(combined.includes("green slip") || /\bgs\b/.test(combined));
      });
      finalRanked.length = 0;
      finalRanked.push(...nongreen);
    }
  }
  const forcedExactAnchorCandidates = sorted.filter((item) => {
    if (!item.matchedSectionAnchor || !item.exactSectionHit) {
      return false;
    }
    return exactSections.some(
      (section) =>
        normalizeSectionIdentifier(section) === normalizeSectionIdentifier(item.matchedSectionAnchor) &&
        isSpecificSubsectionAnchor(item.matchedSectionAnchor)
    );
  });
  let primarySupportForcedByExactAnchor = false;
  let primarySupportAnchorUsed: string | undefined;
  if (!silverSlipQuery && forcedExactAnchorCandidates.length > 0) {
    const exactAnchorWinner = [...forcedExactAnchorCandidates].sort((left, right) => {
      const leftAnchorLength = normalizeSectionIdentifier(left.matchedSectionAnchor).length;
      const rightAnchorLength = normalizeSectionIdentifier(right.matchedSectionAnchor).length;
      if (rightAnchorLength !== leftAnchorLength) {
        return rightAnchorLength - leftAnchorLength;
      }
      if (right.matchedTerms.length !== left.matchedTerms.length) {
        return right.matchedTerms.length - left.matchedTerms.length;
      }
      const leftSnippetLength = `${left.reference.label ?? ""} ${left.reference.quoteSnippet ?? ""}`.length;
      const rightSnippetLength = `${right.reference.label ?? ""} ${right.reference.quoteSnippet ?? ""}`.length;
      if (rightSnippetLength !== leftSnippetLength) {
        return rightSnippetLength - leftSnippetLength;
      }
      return right.score - left.score;
    })[0];
    if (exactAnchorWinner) {
      primarySupportForcedByExactAnchor = true;
      primarySupportAnchorUsed = exactAnchorWinner.matchedSectionAnchor;
      const remaining = finalRanked.filter((item) => item.reference !== exactAnchorWinner.reference);
      finalRanked.length = 0;
      finalRanked.push(exactAnchorWinner, ...remaining);
    }
  }
  const supportMatchedSections = finalRanked
    .map((item) => item.matchedSectionAnchor ?? (item.exactSectionHit ? item.reference.section : undefined))
    .filter((value): value is string => Boolean(value));
  const xDayAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 L.9")) ||
      combined.includes("x-day") ||
      combined.includes("x day")
    );
  });
  const shortCallDutyAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    const shortCallAnchor =
      normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 S.9")) ||
      normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 S")) ||
      combined.includes("short call");
    const dutyAnchor =
      normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 12")) ||
      combined.includes("duty period") ||
      combined.includes("flight time") ||
      combined.includes("legality") ||
      combined.includes("report");
    return shortCallAnchor && dutyAnchor;
  });
  const pcsSwapAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      combined.includes("pcs") ||
      combined.includes("swap with pot") ||
      combined.includes("bid period") ||
      combined.includes("reserve coverage") ||
      combined.includes("capped reserve") ||
      combined.includes("max pickup") ||
      combined.includes("carry-out") ||
      combined.includes("carry out") ||
      combined.includes("open time") ||
      combined.includes("drop") ||
      combined.includes("add")
    );
  });
  const pcsSwapVisibleSupportTerms = pcsSwapScenario
    ? Array.from(
        new Set(
          finalRanked.flatMap((item) => {
            const combined = normalizeSupportText(
              `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
            );
            return pcsGeneralTerms.filter((term) => combined.includes(term));
          })
        )
      )
    : [];
  const retrievalSilverSlipAnchorsFound = sorted
    .filter((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      return combined.includes("silver slip");
    })
    .map((item) => inferSupportSectionAnchor(item.reference))
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);
  const retrievalGreenSlipAnchorsFound = sorted
    .filter((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      return combined.includes("green slip") || /\bgs\b/.test(combined);
    })
    .map((item) => inferSupportSectionAnchor(item.reference))
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);
  const supportWeakMatchWarning =
    finalRanked.length === 0 ||
    (finalRanked[0]?.score ?? 0) < 60 ||
    qualityGate.primaryAnchorMissing ||
    silverSlipSupportMissing ||
    (xDayScenario && !xDayAnchorFound) ||
    (shortCallDutyScenario && !shortCallDutyAnchorFound) ||
    (pcsSwapScenario && !pcsSwapAnchorFound);

  const visibleReferences = finalRanked.map((item) => ({
    ...item.reference,
    section: item.matchedSectionAnchor ?? item.reference.section,
  }));

  return {
    references: visibleReferences,
    debug: {
      supportRerankerRan: true,
      supportQualityGateRan: true,
      supportCandidatesBefore: args.references.length,
      supportCandidatesAfter: finalRanked.length,
      supportTopScores: finalRanked.map((item) => ({
        section: item.matchedSectionAnchor ?? item.reference.section,
        score: item.score,
      })),
      supportWeakMatchWarning,
      supportMatchedTerms: Array.from(new Set(finalRanked.flatMap((item) => item.matchedTerms))),
      supportMatchedSections: Array.from(new Set(supportMatchedSections)),
      supportMatchedAnswerTerms: Array.from(new Set(answerTerms)),
      supportMatchedAnswerSections: Array.from(new Set(primarySections)),
      retrievalSilverSlipAnchorsFound: Array.from(new Set(retrievalSilverSlipAnchorsFound)),
      retrievalGreenSlipAnchorsFound: Array.from(new Set(retrievalGreenSlipAnchorsFound)),
      retrievalComparisonMode: comparisonSides.length >= 2,
      silverSlipPrimarySupportFound,
      greenSlipComparisonSupportFound,
      silverSlipSupportMissing,
      supportCardsFilteredOut: reranked.length - finalRanked.length,
      supportDroppedReasons: qualityGate.droppedReasons,
      supportPrimaryAnchorMissing: qualityGate.primaryAnchorMissing,
      primarySupportForcedByExactAnchor,
      primarySupportAnchorUsed,
      xDayScenario,
      xDayAnchorFound,
      pcsSwapScenario,
      pcsSwapAnchorFound,
      pcsSwapVisibleSupportTerms,
      pcsSwapSupportPromoted,
      pcsSwapSupportMissingAnchors,
      pcsSwapMissingSupportReason:
        pcsSwapScenario && !pcsSwapAnchorFound
          ? "I do not see the exact PCS/swap-with-pot processing rule in the attached support."
          : pcsSwapScenario && pcsSwapSupportMissingAnchors.length > 0
            ? `I do not see all of the expected PCS/swap processing anchors in the attached support: ${pcsSwapSupportMissingAnchors.join(", ")}.`
          : undefined,
      shortCallDutyScenario,
      shortCallDutyAnchorFound,
      visibleSupportAnchorPromoted: finalRanked.some(
        (item) => Boolean(item.matchedSectionAnchor) && item.matchedSectionAnchor !== item.reference.section
      ),
      visibleSupportOriginalSection: finalRanked.map((item) => item.reference.section),
      visibleSupportPromotedSection: finalRanked.map(
        (item) => item.matchedSectionAnchor ?? item.reference.section
      ),
      supportFinalRankingReason:
        finalRanked.length > 0
          ? qualityGate.primaryAnchorMissing
            ? "quality_gate_kept best-matching cards but primary cited section is still missing"
            : "quality_gate_kept only cards matching answer anchors or strong question anchors"
          : "quality_gate_removed weak or unrelated support cards",
    },
  };
}

function buildSupportFocusedCandidates(args: {
  question: string;
  answerText: string;
  chunks: ContractDocumentChunk[];
  scenarioLabel: string;
}) {
  const exactSections = keepMostSpecificSectionReferences([
    ...extractSectionReferencesFromText(args.question),
    ...extractSectionReferencesFromText(args.answerText),
  ]);
  const matchedTerms = extractSupportIntentTerms(args.question, args.answerText);
  const comparisonSides = detectComparisonSupportSides(args.question);
  const silverSlipQuery =
    args.question.toLowerCase().includes("silver slip") || /\bss\b/.test(args.question.toLowerCase());
  const pcsSwapScenario = detectPcsSwapScenario(args.question);
  const termWeights: Record<string, number> = {
    "harmed pilot": 100,
    "auto accept": 90,
    "silver slip": 110,
    "premium pay": 60,
    "green slip": 35,
    gswc: 35,
    "rotation guarantee": 50,
    "reserve guarantee": 50,
    reroute: 40,
    deadhead: 40,
    "short call": 40,
    pb: 55,
    pr: 45,
    lc: 45,
    qs: 60,
    "senior responder": 70,
    "same rotation": 70,
    "duplicate award": 75,
    "premium pay": 65,
    mou: 55,
    ioe: 65,
    "court/legal obligation": 75,
    "notice to appear": 75,
    "trip conflict": 70,
    leave: 55,
    cpo: 55,
    "known absence": 60,
    "rotation change": 70,
    redeye: 60,
    carryover: 55,
    "credit protection": 60,
    "removed leg": 60,
    "capped reserve days": 65,
    "swap with pot": 65,
    arcos: 55,
    dart: 50,
    stop: 50,
    "x-days": 60,
    notification: 45,
    "pay protection": 60,
    "golden day": 85,
    "hard non-fly day": 85,
    "assignment timing": 60,
    "bid period": 70,
    "reserve coverage": 70,
    actual: 45,
    qualified: 45,
    "open time": 55,
    pcs: 90,
    "carry-out": 80,
    "black days": 70,
    "max pickup": 85,
    "drop/add": 75,
    overlap: 70,
    processing: 65,
    "coverage works": 60,
  };
  const pcsGeneralTerms = [
    "pcs",
    "swap with pot",
    "bid period",
    "carry-out",
    "capped reserve days",
    "black days",
    "max pickup",
    "drop/add",
    "reserve coverage",
    "open time",
    "processing",
    "coverage works",
  ];

  const scored = args.chunks
    .map((chunk) => {
      const chunkText = normalizeSupportText(
        [chunk.section, chunk.title ?? "", ...(chunk.sectionAnchors ?? []), chunk.text].join(" ")
      );

      const sectionMatch = scoreSectionAnchorMatch({
        exactSections,
        section: chunk.section,
        label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
        quoteSnippet: chunk.text,
      });
      const exactSectionHit = sectionMatch.exact;
      const termHits = matchedTerms.filter((term) => chunkText.includes(term));
      const hasAnySignal = sectionMatch.score > 0 || termHits.length > 0;
      if (!hasAnySignal) {
        return null;
      }

      const sourceBoost = pcsSwapScenario
        ? chunk.source === "scheduler_manual"
          ? 70
          : chunk.source === "pwa"
            ? 35
            : 12
        : chunk.source === "pwa"
          ? 40
          : chunk.source === "compensation_manual"
            ? 24
            : 18;
      const genericScopeOrGlossary = /\bsection 1\b|\bscope\b|\bdefinitions?\b/.test(chunkText);
      const genericPremiumWithoutSlip =
        chunkText.includes("premium pay") &&
        !chunkText.includes("silver slip") &&
        !chunkText.includes("green slip") &&
        !/\bgs\b/.test(chunkText);
      const silverHit = chunkText.includes("silver slip");
      const greenHit = chunkText.includes("green slip") || /\bgs\b/.test(chunkText);
      const pcsSpecificHits = pcsGeneralTerms.filter((term) => chunkText.includes(term));
      const score =
        sourceBoost +
        sectionMatch.score +
        termHits.reduce((sum, term) => sum + (termWeights[term] ?? 45), 0) +
        (termHits.length >= 2 ? 40 : 0) +
        (termHits.length >= 3 ? 20 : 0) -
        (genericScopeOrGlossary && !exactSectionHit ? 180 : 0) -
        (silverSlipQuery && genericPremiumWithoutSlip ? 140 : 0) +
        (silverSlipQuery && silverHit ? 220 : 0) +
        (silverSlipQuery && !comparisonSides.includes("green slip") && greenHit && !silverHit ? -130 : 0) +
        (silverSlipQuery && comparisonSides.includes("green slip") && silverHit && greenHit ? 80 : 0) +
        (silverSlipQuery && comparisonSides.includes("green slip") && greenHit && !silverHit ? 30 : 0) +
        (pcsSwapScenario &&
        pcsSpecificHits.length > 0
          ? 140
          : 0) +
        (pcsSwapScenario ? pcsSpecificHits.length * 30 : 0) +
        (pcsSwapScenario && chunk.source === "scheduler_manual" && pcsSpecificHits.length > 0 ? 110 : 0) +
        (pcsSwapScenario && /\bsection 23\b/.test(chunkText) && !chunkText.includes("swap") && !chunkText.includes("bid period") ? -120 : 0) +
        ((chunk.title ?? "").toLowerCase().includes("silver slip") ? 90 : 0);

      return {
        chunk,
        score,
        termHits,
        exactSectionHit,
        matchedSectionAnchor:
          (pcsSwapScenario && pcsSpecificHits.length > 0)
            ? inferSupportSectionAnchor({
                section: chunk.section,
                label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                quoteSnippet: chunk.text,
              })
            : sectionMatch.anchor,
      };
    })
    .filter(
      (
        item
      ): item is {
        chunk: ContractDocumentChunk;
        score: number;
        termHits: string[];
        exactSectionHit: boolean;
      } => Boolean(item)
    )
    .sort((left, right) => right.score - left.score || left.chunk.page - right.chunk.page)
    .slice(0, 20);

  const comparisonSeeded = [...scored];
  if (comparisonSides.length >= 2) {
    for (const side of comparisonSides) {
      const alreadyCovered = comparisonSeeded.some((item) => item.termHits.includes(side));
      if (alreadyCovered) {
        continue;
      }
      const candidate = args.chunks
        .map((chunk) => {
          const chunkText = normalizeSupportText(
            [chunk.section, chunk.title ?? "", ...(chunk.sectionAnchors ?? []), chunk.text].join(" ")
          );
          return chunkText.includes(side) ? { chunk, side } : null;
        })
        .find(Boolean);
      if (!candidate) {
        continue;
      }
      comparisonSeeded.push({
        chunk: candidate.chunk,
        score: 1,
        termHits: [side],
        exactSectionHit: false,
      });
    }
  }

  return comparisonSeeded.slice(0, 12).map((item) => {
    const displayTerms = item.termHits.length > 0 ? item.termHits : matchedTerms.slice(0, 2);
    return {
      sourceLabel:
        item.chunk.source === "pwa"
          ? "PWA"
          : item.chunk.source === "compensation_manual"
            ? "Compensation Manual"
            : "Scheduler Manual",
      sourceId:
        item.chunk.source === "pwa"
          ? ("pwa" as const)
          : item.chunk.source === "compensation_manual"
            ? ("compensation_manual" as const)
            : ("scheduler_manual" as const),
      ruleType:
        item.chunk.source === "pwa"
          ? ("contract" as const)
          : ("scheduler_practice" as const),
      ruleId: item.chunk.id,
      scenario: args.scenarioLabel,
      title: `${item.chunk.title ?? item.chunk.section}${displayTerms.length > 0 ? ` — ${displayTerms.join(" / ")}` : ""}`,
      section: item.matchedSectionAnchor
        ? item.matchedSectionAnchor
        : inferSupportSectionAnchor({ section: item.chunk.section, label: item.chunk.title, quoteSnippet: item.chunk.text }),
      quoteSnippet: item.chunk.text.slice(0, 420),
      note: item.chunk.title,
      score: item.score,
      matchedTerms: item.termHits,
    };
  });
}

function buildBestGuessShortAnswer(args: {
  aiShortAnswer?: string;
  deterministicShortAnswer: string;
  whatCouldChange?: string[];
  needsClarification?: boolean;
}) {
  const aiShortAnswer = args.aiShortAnswer?.trim();
  const deterministicShortAnswer = args.deterministicShortAnswer.trim();
  const changeSummary =
    args.whatCouldChange && args.whatCouldChange.length > 0
      ? args.whatCouldChange.slice(0, 2).join(" and ")
      : null;

  if (aiShortAnswer && !isRefusalStyleShortAnswer(aiShortAnswer)) {
    if (args.needsClarification) {
      return `Based on typical scenarios, here's how this usually works: ${aiShortAnswer}`;
    }
    return aiShortAnswer;
  }

  if (changeSummary) {
    return `${deterministicShortAnswer} This depends on ${changeSummary}.`;
  }

  return deterministicShortAnswer;
}

function chunkToAnswerReference(args: {
  chunk: ContractDocumentChunk;
  matchedSection?: string;
}): NonNullable<ContractCopilotApiSuccessResponse["answer"]>["references"][number] {
  return {
    label: args.chunk.title ?? args.chunk.section,
    sourceId:
      args.chunk.source === "pwa"
        ? "pwa"
        : args.chunk.source === "compensation_manual"
          ? "compensation_manual"
          : "scheduler_manual",
    section: args.matchedSection ?? args.chunk.section,
    quoteSnippet: args.chunk.text.slice(0, 420),
    ruleType: args.chunk.source === "pwa" ? "contract" : "scheduler_practice",
  };
}

function buildAnswerReferencedSupport(args: {
  answerText: string;
  chunks: ContractDocumentChunk[];
}) {
  const answerReferencedSections = keepMostSpecificSectionReferences(
    extractSectionReferencesFromText(args.answerText)
  );
  if (answerReferencedSections.length === 0) {
    return {
      answerReferencedSections,
      injectedReferences: [] as NonNullable<ContractCopilotApiSuccessResponse["answer"]>["references"],
      missingSections: [] as string[],
      supportInjectedFromAnswer: false,
    };
  }

  const answerTerms = extractSupportIntentTerms("", args.answerText);
  const injectedReferences: NonNullable<ContractCopilotApiSuccessResponse["answer"]>["references"] = [];
  const missingSections: string[] = [];

  for (const section of answerReferencedSections) {
    const normalizedSection = normalizeSectionIdentifier(section);
    const sectionParents = extractSectionParentIdentifiers(section).map(normalizeSectionIdentifier);
    const bestCandidate = args.chunks
      .map((chunk) => {
        const anchors = [chunk.section, ...(chunk.sectionAnchors ?? [])];
        const exactAnchor = anchors.find(
          (anchor) => normalizeSectionIdentifier(anchor) === normalizedSection
        );
        const parentAnchor = anchors.find((anchor) =>
          sectionParents.includes(normalizeSectionIdentifier(anchor))
        );
        const crossRefHit = chunk.crossRefs.some(
          (crossRef) => normalizeSectionIdentifier(crossRef) === normalizedSection
        );
        const combined = normalizeSupportText(
          [chunk.section, chunk.title ?? "", ...(chunk.sectionAnchors ?? []), chunk.text].join(" ")
        );
        const termHits = answerTerms.filter((term) => combined.includes(term));
        let score = 0;
        if (exactAnchor) score += 500;
        else if (parentAnchor) score += 220;
        if (crossRefHit) score += 80;
        score += termHits.length * 20;
        if (chunk.source === "pwa") score += 40;
        else if (chunk.source === "compensation_manual") score += 20;
        else if (chunk.source === "scheduler_manual") score += 15;
        score += Math.min(chunk.text.length, 1200) / 100;
        return score > 0
          ? {
              chunk,
              score,
              matchedSection: exactAnchor ?? parentAnchor ?? chunk.section,
            }
          : null;
      })
      .filter((item): item is { chunk: ContractDocumentChunk; score: number; matchedSection: string } => Boolean(item))
      .sort((left, right) => right.score - left.score)[0];

    if (!bestCandidate) {
      missingSections.push(section);
      continue;
    }

    injectedReferences.push(
      chunkToAnswerReference({
        chunk: bestCandidate.chunk,
        matchedSection: bestCandidate.matchedSection,
      })
    );
  }

  return {
    answerReferencedSections,
    injectedReferences: injectedReferences.filter(
      (reference, index, references) =>
        references.findIndex(
          (candidate) =>
            candidate.sourceId === reference.sourceId &&
            candidate.section === reference.section &&
            candidate.quoteSnippet === reference.quoteSnippet
        ) === index
    ),
    missingSections,
    supportInjectedFromAnswer: injectedReferences.length > 0,
  };
}

function mergeAnswerReferencedSupport(args: {
  answerText: string;
  references: ContractCopilotApiSuccessResponse["answer"]["references"];
  chunks: ContractDocumentChunk[];
}) {
  const answerSupport = buildAnswerReferencedSupport({
    answerText: args.answerText,
    chunks: args.chunks,
  });
  const mergedReferences = [...args.references, ...answerSupport.injectedReferences].filter(
    (reference, index, references) =>
      references.findIndex(
        (candidate) =>
          candidate.sourceId === reference.sourceId &&
          candidate.section === reference.section &&
          candidate.quoteSnippet === reference.quoteSnippet
      ) === index
  );
  return {
    references: mergedReferences,
    answerReferencedSections: answerSupport.answerReferencedSections,
    supportInjectedFromAnswer: answerSupport.supportInjectedFromAnswer,
    missingSections: answerSupport.missingSections,
  };
}

function selectPreferredGoverningPacket(args: {
  question: string;
  governingPackets: SectionAwareGroundingPacket[];
}) {
  const questionLower = args.question.toLowerCase();
  if (args.governingPackets.length === 0) {
    return undefined;
  }

  const isGreenslipLongCall =
    (questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower)) &&
    questionLower.includes("reserve") &&
    questionLower.includes("long call");

  if (isGreenslipLongCall) {
    const carveoutPacket = args.governingPackets.find((packet) => {
      const searchable = normalizeForComparison(
        `${packet.section} ${packet.title ?? ""} ${packet.content}`
      );
      return (
        searchable.includes("within 18 hours") &&
        searchable.includes("single pay") &&
        searchable.includes("no credit")
      );
    });
    if (carveoutPacket) {
      return carveoutPacket;
    }
  }

  const isApd = /\bapd\b/.test(questionLower) || questionLower.includes("authorized personal drop");
  if (isApd) {
    const apdPacket = args.governingPackets.find((packet) =>
      normalizeForComparison(`${packet.section} ${packet.title ?? ""}`).includes("23 i 10")
    );
    if (apdPacket) {
      return apdPacket;
    }
  }

  return args.governingPackets[0];
}

function selectPreferredWorkedExamplePacket(args: {
  question: string;
  workedExamples: SectionAwareGroundingPacket[];
}) {
  const questionLower = args.question.toLowerCase();
  if (args.workedExamples.length === 0) {
    return undefined;
  }

  const isSickGreenslip =
    (questionLower.includes("sick") || questionLower.includes("called in sick")) &&
    (questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower));

  if (isSickGreenslip) {
    const packet = args.workedExamples.find((item) => {
      const searchable = normalizeForComparison(`${item.section} ${item.title ?? ""} ${item.content}`);
      return searchable.includes("replenish") && searchable.includes("single pay") && searchable.includes("no credit");
    });
    if (packet) {
      return packet;
    }
  }

  return args.workedExamples[0];
}

function normalizeForComparison(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseRequiredAndAvailable(question: string) {
  const normalized = question.toLowerCase();
  const requiredMatch =
    normalized.match(/required(?:\s+for(?:\s+that)?\s+day)?\s+(?:is|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/required reserves?(?:\s+are|\s+is|=)\s*(\d+(?:\.\d+)?)/);
  const availableMatch =
    normalized.match(/available(?:\s+are|\s+is|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/reserves available(?:\s+are|\s+is|=)\s*(\d+(?:\.\d+)?)/);

  return {
    required: requiredMatch ? Number(requiredMatch[1]) : null,
    available: availableMatch ? Number(availableMatch[1]) : null,
  };
}

export function buildRuleLedBottomLine(args: {
  question: string;
  facts?: ParsedScenarioFacts;
  governingPacket?: SectionAwareGroundingPacket;
  workedExamplePacket?: SectionAwareGroundingPacket;
  preferredShortAnswer: string;
  deterministicShortAnswer: string;
  scenarioBreakdown?: string[];
  payBreakdown?: string[];
  whyItApplies?: string;
}) {
  const questionLower = args.question.toLowerCase();
  const packetSection = args.governingPacket?.section ?? "";
  const packetContent = args.governingPacket?.content.toLowerCase() ?? "";
  const workedExampleContent = args.workedExamplePacket?.content.toLowerCase() ?? "";
  const isDiagnosticQuestion =
    /why\s+(didn['’]?t|did not|wasn['’]?t|was not)/.test(questionLower) ||
    (questionLower.includes("why") &&
      (questionLower.includes("drop") ||
        questionLower.includes("denied") ||
        questionLower.includes("go through") ||
        questionLower.includes("work")));

  if (packetSection.includes("23 I.10") || /\bapd\b|authorized personal drop/.test(questionLower)) {
    const { required, available } = parseRequiredAndAvailable(args.question);
    if (
      required !== null &&
      available !== null &&
      (packetContent.includes("25% of the number of reserves required") || packetSection.includes("23 I.10"))
    ) {
      const threshold = required * 0.25;
      const result = available >= threshold;
      if (isDiagnosticQuestion) {
        return result
          ? `If you were above the threshold, this should have gone through. If it did not, the usual reasons are stale reserve counts at the time of processing, a coding issue, the wrong day or drop type being used, or an exception that blocked it.`
          : `This probably did not go through because the available reserves were below the APD threshold at the time it was processed.`;
      }
      return result
        ? `Yes, this should probably go through. The APD threshold is 25% of required reserves at the time of processing, and ${available} available against ${required} required is above that mark.`
        : `No, that probably will not clear. The APD threshold is 25% of required reserves at the time of processing, and ${available} available against ${required} required is below that mark.`;
    }
  }

  if (
    (packetSection.includes("Section 4 C") || packetContent.includes("alv minus two hours")) &&
    (questionLower.includes("alv") || questionLower.includes("average line value"))
  ) {
    return "You do not calculate ALV yourself. The company sets it each bid period, and it is the baseline used to build your reserve guarantee.";
  }

  if (packetSection.includes("Section 4 C") && questionLower.includes("minimum") && questionLower.includes("guarantee")) {
    if (questionLower.includes("reserve")) {
      return "On reserve, the guarantee starts with ALV minus two hours, but it cannot go below 72 or above 80. That is the baseline your reserve credit and pay are built from for the month.";
    }
    return "The answer depends on whether you were reserve or a lineholder that month. On reserve, the guarantee starts from ALV minus two hours with a 72-to-80 hour band; as a lineholder, it follows the regular line guarantee instead.";
  }

  if (
    (packetSection.includes("23 Q") || packetContent.includes("long call reserve pilot")) &&
    (questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower)) &&
    questionLower.includes("long call")
  ) {
    const longCallRulePresent =
      packetContent.includes("within 18 hours") &&
      packetContent.includes("single pay") &&
      packetContent.includes("no credit");
    if (longCallRulePresent) {
      if (args.facts?.contactWindow === "within_18_hours") {
        return "Days 1 and 2 should pay as normal Greenslip days. Day 3 should pay single pay, no credit for that first duty period because it fell inside the 18-hour long-call window.";
      }
      if (args.facts?.contactWindow === "outside_18_hours") {
        return "Days 1 and 2 should pay as normal Greenslip days. Day 3 is less likely to get the long-call carveout because it was outside the 18-hour window.";
      }
      return "Days 1 and 2 should pay as normal Greenslip days. If Day 3 was within 18 hours of first attempted contact, that first duty period should pay single pay, no credit.";
    }
  }

  if (
    (packetSection.includes("23 K") || packetSection.includes("23 L") || packetSection.includes("4 F")) &&
    (questionLower.includes("reroute") || questionLower.includes("deadhead") || questionLower.includes("reassign"))
  ) {
    if (args.facts?.beforeReport === true) {
      return "Because the change happened before report, reroute pay is less likely under the reroute and rotation-guarantee rule block.";
    }
    if (args.facts?.afterReport === true) {
      return "Because the change happened after report, reroute treatment is more likely under the reroute and rotation-guarantee rule block.";
    }
    return "Based on what you gave me, the key question is whether the deadhead change happened before or after report. If it was before report, reroute pay is less likely; if it was after report, reroute treatment is more likely.";
  }

  if (
    (packetSection.includes("14") || packetContent.includes("sick leave")) &&
    questionLower.includes("sick") &&
    (questionLower.includes("pickup") || questionLower.includes("picked up") || questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower))
  ) {
    const isSickGreenslip =
      questionLower.includes("sick") &&
      (questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower));
    const hasSplitTreatment =
      (packetContent.includes("replenish") || workedExampleContent.includes("replenish")) &&
      (packetContent.includes("single pay") || workedExampleContent.includes("single pay")) &&
      (packetContent.includes("no credit") || workedExampleContent.includes("no credit"));
    if (isSickGreenslip && hasSplitTreatment) {
      const sequentialKnown = args.facts?.interactionRelationship === "sequential";
      const overlapKnown =
        args.facts?.interactionRelationship === "overlap" || questionLower.includes("overlap");
      const laterGsAfterSick =
        questionLower.includes("after i was well") ||
        questionLower.includes("after sick leave ended") ||
        questionLower.includes("after the sick period ended") ||
        questionLower.includes("continued after i was well") ||
        questionLower.includes("continued after sick leave ended");
      const fullyInsideSick =
        questionLower.includes("fully inside the sick leave period") ||
        questionLower.includes("fully inside sick leave") ||
        questionLower.includes("entirely inside the sick leave period") ||
        questionLower.includes("all inside the sick leave period") ||
        questionLower.includes("entirely inside the days i was on sick leave") ||
        questionLower.includes("inside the days i was on sick leave") ||
        questionLower.includes("entirely within my sick leave") ||
        questionLower.includes("fully within my sick leave") ||
        questionLower.includes("fully inside the days i was sick");

      if (overlapKnown && laterGsAfterSick) {
        return [
          "Bottom line: A GS that overlaps a sick day should not be flattened into one all-purpose result.",
          "",
          "Overlap day:",
          "- Pay: That day can still have its own pay treatment under the sick-plus-GS rule and example.",
          "- Credit: Do not assume normal GS credit on that overlap day; credit is handled separately from pay there.",
          "- Sick bank: The overlap value can feed a sick-bank replenishment / offset calculation on its own track.",
          "",
          "Remaining GS days:",
          "- Pay: Any GS days after the sick period ends should pay as normal Greenslip days if they were awarded and flown.",
          "- Credit: Those later GS days should credit as normal GS days if they were awarded and flown.",
        ].join("\n");
      }
      if (fullyInsideSick) {
        return [
          "Bottom line: If the whole GS sat inside the sick period, keep the whole answer anchored to the sick-plus-GS example instead of treating it like clean later GS flying.",
          "",
          "Overlap day:",
          "- Pay: The example points to distinct overlap-day pay treatment, not a simple normal GS answer.",
          "- Credit: The example points to no-credit treatment on the overlap piece rather than ordinary GS credit.",
          "- Sick bank: Replenishment / offset is handled separately from the pay result.",
        ].join("\n");
      }
      if (sequentialKnown) {
        return [
          "Bottom line: If the GS started after sick leave ended, it should be treated more like a clean Greenslip award than an overlap-day example.",
          "",
          "Remaining GS days:",
          "- Pay: Those GS days should pay as normal Greenslip days if they were awarded and flown.",
          "- Credit: Those GS days should credit as normal Greenslip days if they were awarded and flown.",
          "",
          "Sick bank:",
          "- Any replenishment or offset question should be handled separately from the later GS day treatment.",
        ].join("\n");
      }
      if (overlapKnown) {
        return [
          "Bottom line: If the GS overlapped your sick day, do not collapse that day into one simple pay label.",
          "",
          "Overlap day:",
          "- Pay: The overlap day can pay differently under the sick-plus-GS rule.",
          "- Credit: That same day may not credit the same way as later GS days.",
          "- Sick bank: Replenishment / offset can be handled separately from the pay result.",
        ].join("\n");
      }
    }
    return "The first question is sequence. If the pickup happened after sick cleared, it is more likely to pay on its own; if it overlapped the sick day, the sick-leave interaction rules are more likely to limit or change the result.";
  }

  const governingSentence =
    args.payBreakdown?.find((item) => item.trim().length > 0) ??
    args.scenarioBreakdown?.find((item) => item.trim().length > 0) ??
    args.whyItApplies;
  if (governingSentence && normalizeForComparison(governingSentence) !== normalizeForComparison(args.preferredShortAnswer)) {
    return trimToTwoSentences(`${args.preferredShortAnswer} ${governingSentence}`);
  }

  return args.preferredShortAnswer || args.deterministicShortAnswer;
}

type ScenarioValidationResult = {
  missingGatingFacts: string[];
  answerIsConditional: boolean;
  gatingQuestion?: ClarifyingQuestion;
  conditionalBottomLine?: string;
  conditionalWhy?: string;
  turningCondition?: string;
};

function questionMentionsBeforeAfterReport(questionLower: string) {
  return (
    questionLower.includes("before report") ||
    questionLower.includes("after report")
  );
}

export function resolveScenarioValidation(args: {
  question: string;
  facts: ParsedScenarioFacts;
  governingPacket?: SectionAwareGroundingPacket;
  matchedInteractionRule?: { id: string } | undefined;
}): ScenarioValidationResult {
  const questionLower = args.question.toLowerCase();
  const packetSection = args.governingPacket?.section ?? "";
  const packetContent = (args.governingPacket?.content ?? "").toLowerCase();

  const isApd = /\bapd\b/.test(questionLower) || questionLower.includes("authorized personal drop");
  if (isApd && (packetSection.includes("23 I.10") || packetContent.includes("25% of the number of reserves required"))) {
    const { required, available } = parseRequiredAndAvailable(args.question);
    if (required === null || available === null) {
      return {
        missingGatingFacts: ["required and available reserve counts at the time of processing"],
        answerIsConditional: true,
        turningCondition: "whether available reserves were at least 25% of required at the time APD was processed",
        conditionalBottomLine:
          "This turns on the Section 23 I.10 threshold at the time of processing. If available reserves were at least 25% of required, APD is more likely to go through; if they were below that threshold, it is more likely denied.",
        conditionalWhy:
          "APD lives and dies on the reserve count at the moment it was processed.",
        gatingQuestion: {
          id: "gating-apd-processing-threshold",
          prompt: "At the time APD was processed, how many reserves were required and how many were available?",
          factField: "processingCountsKnown",
          required: true,
          quickReplies: buildQuickRepliesForField("processingCountsKnown"),
        },
      };
    }
    return {
      missingGatingFacts: [],
      answerIsConditional: false,
    };
  }

  const isGreenslipLongCall =
    (questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower)) &&
    questionLower.includes("long call") &&
    (questionLower.includes("reserve") || args.facts.status === "reserve");
  const longCallCarveoutPresent =
    packetContent.includes("within 18 hours") &&
    packetContent.includes("single pay") &&
    packetContent.includes("no credit");
  if (isGreenslipLongCall && longCallCarveoutPresent) {
    const contactWindowKnown =
      args.facts.contactWindow === "within_18_hours" ||
      args.facts.contactWindow === "outside_18_hours" ||
      questionLower.includes("within 18 hours") ||
      questionLower.includes("outside 18 hours");
    if (!contactWindowKnown) {
      return {
        missingGatingFacts: ["whether the GS report was within 18 hours of first attempted contact"],
        answerIsConditional: true,
        turningCondition: "whether the GS report fell within the 18-hour long-call contact window",
        conditionalBottomLine:
          "Day 1 and Day 2 stay on the normal Greenslip pay path. For Day 3, if the GS report was within 18 hours of first attempted contact, the first duty period pays single pay, no credit; if it was outside that 18-hour window, the long-call carveout may not control the day the same way.",
        conditionalWhy:
          "The key question is whether Day 3 fell inside the 18-hour long-call window.",
        gatingQuestion: {
          id: "gating-gs-long-call-18-hour-window",
          prompt: "Was the GS report within 18 hours of first attempted contact on the long-call day?",
          factField: "contactWindow",
          required: true,
          quickReplies: buildQuickRepliesForField("contactWindow"),
        },
      };
    }
  }

  const isReroute =
    questionLower.includes("reroute") ||
    questionLower.includes("rerouted") ||
    questionLower.includes("deadhead") ||
    args.matchedInteractionRule?.id === "reroute_timing_and_pay_impact";
  if (isReroute && (packetSection.includes("23 K") || packetSection.includes("23 L") || packetSection.includes("4 F"))) {
    const timingKnown =
      args.facts.beforeReport === true ||
      args.facts.afterReport === true ||
      questionMentionsBeforeAfterReport(questionLower);
    if (!timingKnown) {
      return {
        missingGatingFacts: ["whether the trip change happened before or after report"],
        answerIsConditional: true,
        turningCondition: "whether the change happened before report or after report",
        conditionalBottomLine:
          "Most likely this turns on whether the deadhead change happened before or after report. If it happened before report, reroute pay is less likely; if it happened after report, reroute treatment is more likely under the reroute and rotation-guarantee rules.",
        conditionalWhy:
          "The key issue is whether the change happened before report or after it.",
        gatingQuestion: {
          id: "gating-reroute-before-after-report",
          prompt: "Did the change happen before report or after report?",
          factField: "afterReport",
          required: true,
          quickReplies: buildQuickRepliesForField("afterReport"),
        },
      };
    }
  }

  const isSickInteraction =
    questionLower.includes("sick") &&
    (questionLower.includes("greenslip") ||
      questionLower.includes("green slip") ||
      questionLower.includes("pickup") ||
      questionLower.includes("picked up"));
  if (isSickInteraction && (packetSection.includes("14") || packetContent.includes("sick leave"))) {
    const relationshipKnown =
      args.facts.interactionRelationship === "overlap" ||
      args.facts.interactionRelationship === "sequential" ||
      questionLower.includes("overlap") ||
      questionLower.includes("after the sick") ||
      questionLower.includes("after sick") ||
      questionLower.includes("after i cleared");
    if (!relationshipKnown) {
      return {
        missingGatingFacts: ["whether the pickup overlapped the sick day or happened after the sick period ended"],
        answerIsConditional: true,
        turningCondition: "whether the pickup overlapped the sick day or happened after sick cleared",
        conditionalBottomLine:
          questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower)
            ? "If the GS overlapped the sick day, that overlap day can pay differently from how the credit and sick-bank replenishment are handled. If the GS started after the sick period cleared, the later GS days are more likely to stand on their own as Greenslip days."
            : "This turns first on sequence. If the Greenslip or pickup overlapped the sick day, the sick-day interaction rules are more likely to limit the pay result; if it was picked up after the sick period cleared, it is more likely to stand on its own pay path.",
        conditionalWhy:
          questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower)
            ? "The first real split is whether the GS overlapped the sick day or started after you were well."
            : "The answer changes depending on whether it overlapped the sick day or happened after sick cleared.",
        gatingQuestion: {
          id: "gating-sick-pickup-overlap",
          prompt: "Did the GS overlap the sick day, or did it start after sick leave ended?",
          factField: "interactionRelationship",
          required: true,
          quickReplies: buildQuickRepliesForField("interactionRelationship"),
        },
      };
    }
  }

  return {
    missingGatingFacts: [],
    answerIsConditional: false,
  };
}

function bottomLineLooksGeneric(value: string | undefined) {
  const normalized = normalizeForComparison(value);
  if (!normalized) {
    return true;
  }
  const genericPhrases = [
    "reserve rules apply",
    "depends on timing",
    "depends on comparing",
    "depends on whether you are reserve or lineholder",
    "should be answered from",
    "should be treated under",
    "can trigger pay treatment",
    "needs separate contract review",
    "separate contract review before assuming",
    "what should happen",
    "applicable minimum daily guarantee",
  ];
  return genericPhrases.some((phrase) => normalized.includes(phrase));
}

function bottomLineIsClassificationOnly(value: string | undefined) {
  const normalized = normalizeForComparison(value);
  if (!normalized) {
    return true;
  }
  const classificationPhrases = [
    "turns on monthly status",
    "reserve guarantee path",
    "reserve rules",
    "lineholder rules",
    "use the reserve guarantee rule",
    "use the lineholder guarantee rule",
    "depends on whether you were reserve or a lineholder",
  ];
  const concretePhrases = [
    "alv minus two hours",
    "never less than 72",
    "never more than 80",
    "lesser of 65 credit hours",
    "projected average of all regular line values",
    "between 72 and 84",
    "between 71 and 85",
    "25 of the reserves required",
    "within 18 hours",
    "single pay no credit",
    "before or after report",
  ];
  return (
    classificationPhrases.some((phrase) => normalized.includes(normalizeForComparison(phrase))) &&
    !concretePhrases.some((phrase) => normalized.includes(normalizeForComparison(phrase)))
  );
}

function bottomLineReflectsGoverningRule(args: {
  bottomLine: string;
  governingPacket?: SectionAwareGroundingPacket;
}) {
  if (!args.governingPacket) {
    return false;
  }
  const bottomLine = normalizeForComparison(args.bottomLine);
  const packet = normalizeForComparison(
    `${args.governingPacket.section} ${args.governingPacket.title ?? ""} ${args.governingPacket.content}`
  );
  const keyTerms = [
    "25 of the number of reserves required",
    "within 18 hours",
    "single pay no credit",
    "reserve guarantee",
    "line guarantee",
    "reroute pay",
    "rotation guarantee",
    "deadhead",
  ].filter((term) => packet.includes(normalizeForComparison(term)));

  if (keyTerms.length === 0) {
    return !bottomLineLooksGeneric(args.bottomLine);
  }

  return keyTerms.some((term) => bottomLine.includes(normalizeForComparison(term).replace(/\bof\b/g, "of")));
}

export async function handleContractCopilotRoute(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST for Contract Copilot requests.",
      },
    });
  }

  let parsedRequest;
  try {
    parsedRequest = validateWithSchema(
      contractCopilotApiRequestSchema,
      await request.json(),
      "contractCopilotApiRequest"
    );
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: {
        code: "invalid_request",
        message: error instanceof Error ? error.message : "Invalid request body.",
      },
    });
  }

  const session: ContractCopilotSession = {
    ...emptySession,
    currentScenario: parsedRequest.session?.currentScenario,
    facts: parsedRequest.session?.facts ?? {},
    clarificationCount: parsedRequest.session?.clarificationCount ?? 0,
    unresolvedQuestion: parsedRequest.session?.unresolvedQuestion,
    status: "idle",
  };

  console.log("=== CONTRACT COPILOT REQUEST ===");
  console.dir(
    {
      question: parsedRequest.question,
      sessionScenario: session.currentScenario,
      sessionFacts: session.facts,
    },
    { depth: null }
  );

  const contractIndex = loadContractDocumentIndex();
  const rawIntentResolution = resolveContractCopilotIntent({
    question: parsedRequest.question,
    facts: session.facts,
  });
  const {
    intent: intentResolution,
    evidenceDebug,
    issueFamilies: detectedIssueFamilies,
    looksComplex: isComplexScenarioQuestion,
  } = coerceClarificationIntent({
    question: parsedRequest.question,
    intent: rawIntentResolution,
  });
  const laneExecution = executeContractCopilotLane({
    question: parsedRequest.question,
    session,
    indexes: contractIndex,
    intentResult: intentResolution,
  });
  if (laneExecution.kind === "handled") {
    return jsonResponse(200, laneExecution.response);
  }
  const intentDebugBase = {
    ...buildIntentDebugBase(intentResolution),
    ...evidenceDebug,
  };

  const fallbackResult = runContractCopilot(parsedRequest.question, session);
  const searchableChunks = [...contractIndex.pwaChunks, ...contractIndex.compensationChunks, ...contractIndex.schedulerChunks];
  const knownInteractionRules = getActiveKnownInteractionRules({
    question: parsedRequest.question,
    facts: session.facts,
  });
  const matchedInteractionRule = knownInteractionRules[0];
  const governingSectionRoute = resolveGoverningSections({
    question: parsedRequest.question,
    facts: session.facts,
    scenario: fallbackResult.detectedScenario,
    matchedInteractionRules: knownInteractionRules,
  });
  const routedGoverningSections = governingSectionRoute.highConfidence.map(
    (item) => `${item.source}:${item.section}`
  );
  const constrainedSearchChunks = filterChunksForGoverningRoute({
    chunks: searchableChunks,
    route: governingSectionRoute,
  });
  let searchMode: "constrained" | "global" | "constrained_then_global" =
    constrainedSearchChunks.length > 0 ? "constrained" : "global";
  let routingFallbackOccurred = false;
  let primaryMatches = searchContractDocuments({
    question: parsedRequest.question,
    chunks: constrainedSearchChunks.length > 0 ? constrainedSearchChunks : searchableChunks,
    rememberedFacts: session.facts,
    deterministicScenario: fallbackResult.answer.scenarioLabel,
    maxMatches: 8,
  });
  const chunkMap = new Map(searchableChunks.map((chunk) => [chunk.id, chunk]));
  let expandedMatches = expandContractMatches({
    matches: primaryMatches,
    chunkMap,
    maxExpanded: 10,
  });
  let linkedMatches = linkRelatedContractSections({
    matches: [...primaryMatches, ...expandedMatches],
    allChunks: searchableChunks,
    maxLinked: 8,
  });
  let governingSectionCandidates = [
    ...governingSectionRoute.highConfidence,
    ...governingSectionRoute.fallbackCandidates,
  ];
  let sectionPackets = buildSectionAwarePackets({
    candidates: governingSectionCandidates,
    allChunks: searchableChunks,
    primaryMatches,
    expandedMatches,
    linkedMatches,
  });
  if (
    constrainedSearchChunks.length > 0 &&
    (!hasUsableRuleMatches(primaryMatches) || !hasUsableGoverningPackets(sectionPackets))
  ) {
    routingFallbackOccurred = true;
    searchMode = "constrained_then_global";
    primaryMatches = searchContractDocuments({
      question: parsedRequest.question,
      chunks: searchableChunks,
      rememberedFacts: session.facts,
      deterministicScenario: fallbackResult.answer.scenarioLabel,
      maxMatches: 8,
    });
    expandedMatches = expandContractMatches({
      matches: primaryMatches,
      chunkMap,
      maxExpanded: 10,
    });
    linkedMatches = linkRelatedContractSections({
      matches: [...primaryMatches, ...expandedMatches],
      allChunks: searchableChunks,
      maxLinked: 8,
    });
    sectionPackets = buildSectionAwarePackets({
      candidates: governingSectionCandidates,
      allChunks: searchableChunks,
      primaryMatches,
      expandedMatches,
      linkedMatches,
    });
  }
  const seededRetrievedSupport = retrieveContractCopilotSnippets({
    question: parsedRequest.question,
    rememberedFacts: session.facts,
    deterministicScenario: fallbackResult.answer.scenarioLabel,
    maxSnippets: 4,
  }).map((item) => ({
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
  const xDayScenario =
    /\bx-days?\b/i.test(parsedRequest.question) ||
    /\bx days?\b/i.test(parsedRequest.question) ||
    /interrupted x-days?/i.test(parsedRequest.question) ||
    /lost x-day/i.test(parsedRequest.question) ||
    /x-day credit/i.test(parsedRequest.question);
  const governingSectionIncludesXDay = governingSectionsSelected.some((item) =>
    /23 l\.9|x-day/i.test(item)
  );
  const pcsSwapScenario = detectPcsSwapScenario(parsedRequest.question);
  const governingSectionIncludesPcsSwap = governingSectionsSelected.some((item) =>
    /pcs|swap|bid period|reserve coverage|capped reserve|max pickup|carry-out|open time/i.test(item)
  );
  const shortCallDutyScenario =
    /short call/i.test(parsedRequest.question) &&
    (
      /same day trip|subsequent same day trip/i.test(parsedRequest.question) ||
      /report time|reports at/i.test(parsedRequest.question) ||
      /duty/i.test(parsedRequest.question) ||
      /flight time/i.test(parsedRequest.question) ||
      /legality/i.test(parsedRequest.question) ||
      /both remain on schedule/i.test(parsedRequest.question) ||
      /assigned short call and trip/i.test(parsedRequest.question)
    );
  const governingSectionIncludesDutyLegality = governingSectionsSelected.some((item) =>
    /23 s|section 12|short call/i.test(item)
  );
  const governingPacketUsed = selectPreferredGoverningPacket({
    question: parsedRequest.question,
    governingPackets: groundingPack.sectionPackets.governingSections,
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

  if (!apiKey) {
    const safeMissingKeyAnswer = buildSafeScenarioFallbackAnswer({
      question: parsedRequest.question,
      answer: {
        ...fallbackResult.answer,
        assumptions: [
          ...fallbackResult.answer.assumptions,
          "AI fallback mode is active because OPENAI_API_KEY is not configured.",
        ],
      },
      retrievedSupport,
      sourceUsageDebug,
      missingGatingFacts: [],
    });
    const verifiedMissingKeyFallbackAnswer = applyScenarioAnswerVerifier({
      question: parsedRequest.question,
      selectedLane: intentResolution.selectedLane,
      answer: safeMissingKeyAnswer,
      contractIndex,
      sourceUsageDebug,
    });
    const missingKeyAnswerSupport = mergeAnswerReferencedSupport({
      answerText: `${verifiedMissingKeyFallbackAnswer.answer.shortAnswer} ${verifiedMissingKeyFallbackAnswer.answer.plainEnglishExplanation}`,
      references: verifiedMissingKeyFallbackAnswer.answer.references,
      chunks: searchableChunks,
    });
    const rerankedMissingKeySupport = rerankSupportReferences({
      question: parsedRequest.question,
      answerText: `${verifiedMissingKeyFallbackAnswer.answer.shortAnswer} ${verifiedMissingKeyFallbackAnswer.answer.plainEnglishExplanation}`,
      references: [...missingKeyAnswerSupport.references, ...supportFocusedReferences],
      selectedLane: intentResolution.selectedLane,
    });
    const missingKeyVisibleReferences = selectVisibleContractReferences(rerankedMissingKeySupport.references);
    const missingKeyFinalVisibleSupportDebug = buildFinalVisibleSupportDebug(
      missingKeyVisibleReferences,
      rerankedMissingKeySupport.debug as Record<string, unknown>
    );
    const missingKeyAnswerWithComparisonNote = applyComparisonSupportNote({
      question: parsedRequest.question,
      answer: {
        ...verifiedMissingKeyFallbackAnswer.answer,
        references: missingKeyVisibleReferences,
      },
      references: missingKeyVisibleReferences,
    });
    const finalizedMissingKeyScenarioAnswer = finalizeScenarioSafetyPipeline({
      answer: missingKeyAnswerWithComparisonNote,
      verified: verifiedMissingKeyFallbackAnswer,
      supportDebug: {
        ...rerankedMissingKeySupport.debug,
        ...missingKeyFinalVisibleSupportDebug,
        answerReferencedSections: missingKeyAnswerSupport.answerReferencedSections,
        supportInjectedFromAnswer: missingKeyAnswerSupport.supportInjectedFromAnswer,
        supportMissingForReferencedSection: missingKeyAnswerSupport.missingSections.length > 0,
      },
    });

    return jsonResponse(200, {
      ok: true,
      mode: "fallback",
      answer: finalizedMissingKeyScenarioAnswer.answer,
      detectedScenario: fallbackResult.detectedScenario,
      nextSession: fallbackResult.nextSession,
      meta: {
        fallbackReason: "missing_api_key",
      },
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              mode: "fallback",
              fallbackReason: "missing_api_key",
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
              retrievedSnippets: retrievedSupport.map(
                (item) => `${item.section}: ${item.quoteSnippet ?? item.note}`
              ),
              groundingSource: "fallback" as const,
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
              sourcesUsed: sourceUsageDebug.sourcesUsed,
              pwaSectionsUsed: sourceUsageDebug.pwaSectionsUsed,
              compensationChunksUsed: sourceUsageDebug.compensationChunksUsed,
              schedulerChunksUsed: sourceUsageDebug.schedulerChunksUsed,
              structuredRowsUsed: sourceUsageDebug.structuredRowsUsed,
              missingSourceWarnings: sourceUsageDebug.missingSourceWarnings,
              aiSynthesisUsed: false,
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
              verifierRan: verifiedMissingKeyFallbackAnswer.verifierRan,
              verifierPassed: verifiedMissingKeyFallbackAnswer.verifierPassed,
              verifierWarnings: verifiedMissingKeyFallbackAnswer.verifierWarnings,
              verifierFailureReasons: verifiedMissingKeyFallbackAnswer.verifierFailureReasons,
              verifierAdjustedAnswer: verifiedMissingKeyFallbackAnswer.verifierAdjustedAnswer,
              finalSafetyPipelineRan: finalizedMissingKeyScenarioAnswer.debug.finalSafetyPipelineRan,
              truthGuardRan: verifiedMissingKeyFallbackAnswer.truthGuardRan,
              definitionApplicationGuardRan: finalizedMissingKeyScenarioAnswer.debug.definitionApplicationGuardRan,
              strongClaimsDetected: verifiedMissingKeyFallbackAnswer.strongClaimsDetected,
              strongClaimsSupported: verifiedMissingKeyFallbackAnswer.strongClaimsSupported,
              strongClaimsDowngraded: verifiedMissingKeyFallbackAnswer.strongClaimsDowngraded,
              definitionSectionUsed: verifiedMissingKeyFallbackAnswer.definitionSectionUsed,
              operationalSectionUsed: verifiedMissingKeyFallbackAnswer.operationalSectionUsed,
              definitionOverrodeOperation: verifiedMissingKeyFallbackAnswer.definitionOverrodeOperation,
              definitionBasedAnswer: verifiedMissingKeyFallbackAnswer.definitionBasedAnswer,
              applicationClaimDetected: verifiedMissingKeyFallbackAnswer.applicationClaimDetected,
              applicationClaimSupported: verifiedMissingKeyFallbackAnswer.applicationClaimSupported,
              applicationClaimDowngraded: verifiedMissingKeyFallbackAnswer.applicationClaimDowngraded,
              answerDowngradedToCaution: finalizedMissingKeyScenarioAnswer.debug.answerDowngradedToCaution,
              downgradeReasons: finalizedMissingKeyScenarioAnswer.debug.downgradeReasons,
              answerReferencedSections: finalizedMissingKeyScenarioAnswer.debug.answerReferencedSections,
              supportInjectedFromAnswer: finalizedMissingKeyScenarioAnswer.debug.supportInjectedFromAnswer,
              supportMissingForReferencedSection:
                finalizedMissingKeyScenarioAnswer.debug.supportMissingForReferencedSection,
              xDayScenario,
              xDayAnchorFound: finalizedMissingKeyScenarioAnswer.debug.xDayAnchorFound,
              governingSectionIncludesXDay,
              pcsSwapScenario,
              pcsSwapAnchorFound: finalizedMissingKeyScenarioAnswer.debug.pcsSwapAnchorFound,
              pcsSwapMissingSupportReason: finalizedMissingKeyScenarioAnswer.debug.pcsSwapMissingSupportReason,
              governingSectionIncludesPcsSwap,
              shortCallDutyScenario,
              shortCallDutyAnchorFound: finalizedMissingKeyScenarioAnswer.debug.shortCallDutyAnchorFound,
              governingSectionIncludesDutyLegality,
              ...rerankedMissingKeySupport.debug,
              ...missingKeyFinalVisibleSupportDebug,
              ...intentDebugBase,
              toolsUsed: Array.from(new Set([...(intentDebugBase.toolsUsed ?? []), "section_aware_retrieval"])),
              retrievalPassCounts: {
                primary: primaryMatches.length,
                expanded: expandedMatches.length,
                linked: linkedMatches.length,
              },
            }
          : undefined,
    });
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  let lastAIOutput: ContractCopilotAIOutput | null = null;
  let weakResponseGateFired = false;

  try {
    aiSynthesisAttempted = true;
    modelClientCalled = true;
    const modelClient = createOpenAIModelClient({
      apiKey,
      model,
      baseUrl: process.env.OPENAI_BASE_URL,
    });

    const aiResult = await runAIWorkflow(
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
      session.clarificationCount
    );
    const clarifyingQuestions =
      isComplexScenarioQuestion
        ? inferredClarifyingQuestions
        :
      scenarioValidation.gatingQuestion && session.clarificationCount < 2
        ? [scenarioValidation.gatingQuestion]
        : inferredClarifyingQuestions;

    const nextSession: ContractCopilotSession = {
      ...fallbackResult.nextSession,
      currentScenario: aiDetectedScenario ?? fallbackResult.nextSession.currentScenario,
      facts: {
        ...fallbackResult.nextSession.facts,
        ...aiFacts,
      },
      clarificationCount:
        (aiResult.output.needsClarification || scenarioValidation.answerIsConditional) &&
        session.clarificationCount < 2
          ? session.clarificationCount + 1
          : 0,
      unresolvedQuestion:
        (aiResult.output.needsClarification || scenarioValidation.answerIsConditional) &&
        session.clarificationCount < 2
          ? (session.unresolvedQuestion ?? parsedRequest.question)
          : undefined,
      lastAskedClarifyingField: clarifyingQuestions?.[0]?.factField,
      lastClarifyingQuestionId: clarifyingQuestions?.[0]?.id,
      status:
        (aiResult.output.needsClarification || scenarioValidation.answerIsConditional) &&
        session.clarificationCount < 2
          ? "awaiting_reply"
          : "answered",
    };

    const canAskFollowUp =
      (aiResult.output.needsClarification || scenarioValidation.answerIsConditional) &&
      session.clarificationCount < 2;
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
      references: [...aiAnswerSupport.references, ...supportFocusedReferences],
      selectedLane: intentResolution.selectedLane,
    });
    const visibleGroundedReferences = selectVisibleContractReferences(rerankedGroundedSupport.references);
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
    const verifiedAIAnswer = applyScenarioAnswerVerifier({
      question: parsedRequest.question,
      selectedLane: intentResolution.selectedLane,
      answer: aiAnswer,
      contractIndex,
      sourceUsageDebug,
    });
    const aiAnswerWithComparisonNote = applyComparisonSupportNote({
      question: parsedRequest.question,
      answer: verifiedAIAnswer.answer,
      references: verifiedAIAnswer.answer.references,
    });
    const finalizedAIScenarioAnswer = finalizeScenarioSafetyPipeline({
      answer: aiAnswerWithComparisonNote,
      verified: verifiedAIAnswer,
      supportDebug: {
        ...rerankedGroundedSupport.debug,
        ...groundedFinalVisibleSupportDebug,
        answerReferencedSections: aiAnswerSupport.answerReferencedSections,
        supportInjectedFromAnswer: aiAnswerSupport.supportInjectedFromAnswer,
        supportMissingForReferencedSection: aiAnswerSupport.missingSections.length > 0,
      },
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
              missingGatingFacts: scenarioValidation.missingGatingFacts,
              answerIsConditional: scenarioValidation.answerIsConditional,
              gatingQuestionUsed: clarifyingQuestions?.[0]?.prompt,
              sectionExpansionUsed: groundingPack.retrievalMeta.sectionExpansionUsed,
              crossReferencesFollowed: groundingPack.retrievalMeta.crossReferencesFollowed,
              contextPacketSummary,
              governingSourcePriorityUsed,
              reasoningMode: matchedInteractionRule ? "interaction_led" : "generic_retrieval_led",
              answerMode: finalBottomLineMode,
              retrievedSnippets: retrievedSupport.map(
                (item) => `${item.section}: ${item.quoteSnippet ?? item.note}`
              ),
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
              sourcesUsed: sourceUsageDebug.sourcesUsed,
              pwaSectionsUsed: sourceUsageDebug.pwaSectionsUsed,
              compensationChunksUsed: sourceUsageDebug.compensationChunksUsed,
              schedulerChunksUsed: sourceUsageDebug.schedulerChunksUsed,
              structuredRowsUsed: sourceUsageDebug.structuredRowsUsed,
              missingSourceWarnings: sourceUsageDebug.missingSourceWarnings,
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
                  answerDowngradedToCaution: finalizedAIScenarioAnswer.debug.answerDowngradedToCaution,
                  downgradeReasons: finalizedAIScenarioAnswer.debug.downgradeReasons,
                  answerReferencedSections: finalizedAIScenarioAnswer.debug.answerReferencedSections,
                  supportInjectedFromAnswer: finalizedAIScenarioAnswer.debug.supportInjectedFromAnswer,
                  supportMissingForReferencedSection:
                    finalizedAIScenarioAnswer.debug.supportMissingForReferencedSection,
                  xDayScenario,
                  xDayAnchorFound: finalizedAIScenarioAnswer.debug.xDayAnchorFound,
                  governingSectionIncludesXDay,
                  pcsSwapScenario,
                  pcsSwapAnchorFound: finalizedAIScenarioAnswer.debug.pcsSwapAnchorFound,
                  pcsSwapMissingSupportReason: finalizedAIScenarioAnswer.debug.pcsSwapMissingSupportReason,
                  governingSectionIncludesPcsSwap,
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
          references: [...partialAnswerSupport.references, ...supportFocusedReferences],
          selectedLane: intentResolution.selectedLane,
        });
        const visiblePartialReferences = selectVisibleContractReferences(rerankedPartialSupport.references);
        const partialFinalVisibleSupportDebug = buildFinalVisibleSupportDebug(
          visiblePartialReferences,
          rerankedPartialSupport.debug as Record<string, unknown>
        );
        const partialClarifyingQuestions =
          isComplexScenarioQuestion
            ? inferClarifyingQuestion(
                {
                  ...aiResultFromPartial(partial),
                },
                fallbackResult.answer.clarifyingQuestions,
                session.clarificationCount
              )
            : partialScenarioValidation.gatingQuestion && session.clarificationCount < 2
              ? [partialScenarioValidation.gatingQuestion]
              : inferClarifyingQuestion(
                  {
                    ...aiResultFromPartial(partial),
                  },
                  fallbackResult.answer.clarifyingQuestions,
                  session.clarificationCount
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
        const verifiedAIUnverifiedAnswer = applyScenarioAnswerVerifier({
          question: parsedRequest.question,
          selectedLane: intentResolution.selectedLane,
          answer: aiUnverifiedAnswer,
          contractIndex,
          sourceUsageDebug,
        });
        const aiUnverifiedAnswerWithComparisonNote = applyComparisonSupportNote({
          question: parsedRequest.question,
          answer: verifiedAIUnverifiedAnswer.answer,
          references: verifiedAIUnverifiedAnswer.answer.references,
        });
        const finalizedAIUnverifiedScenarioAnswer = finalizeScenarioSafetyPipeline({
          answer: aiUnverifiedAnswerWithComparisonNote,
          verified: verifiedAIUnverifiedAnswer,
          supportDebug: {
            ...rerankedPartialSupport.debug,
            ...partialFinalVisibleSupportDebug,
            answerReferencedSections: partialAnswerSupport.answerReferencedSections,
            supportInjectedFromAnswer: partialAnswerSupport.supportInjectedFromAnswer,
            supportMissingForReferencedSection: partialAnswerSupport.missingSections.length > 0,
          },
        });

        return jsonResponse(200, {
          ok: true,
          mode: "ai_unverified",
          answer: finalizedAIUnverifiedScenarioAnswer.answer,
          detectedScenario: partialDetectedScenario ?? fallbackResult.detectedScenario,
          nextSession: {
            ...fallbackResult.nextSession,
            clarificationCount:
              (partial.needsClarification || partialScenarioValidation.answerIsConditional) &&
              session.clarificationCount < 2
                ? session.clarificationCount + 1
                : 0,
            unresolvedQuestion:
              (partial.needsClarification || partialScenarioValidation.answerIsConditional) &&
              session.clarificationCount < 2
                ? (session.unresolvedQuestion ?? parsedRequest.question)
                : undefined,
            lastAskedClarifyingField: partialClarifyingQuestions?.[0]?.factField,
            lastClarifyingQuestionId: partialClarifyingQuestions?.[0]?.id,
            status:
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
                  missingGatingFacts: partialScenarioValidation.missingGatingFacts,
                  answerIsConditional: partialScenarioValidation.answerIsConditional,
                  gatingQuestionUsed: partialClarifyingQuestions?.[0]?.prompt,
                  sectionExpansionUsed: groundingPack.retrievalMeta.sectionExpansionUsed,
                  crossReferencesFollowed: groundingPack.retrievalMeta.crossReferencesFollowed,
                  contextPacketSummary,
                  governingSourcePriorityUsed,
                  reasoningMode: matchedInteractionRule ? "interaction_led" : "generic_retrieval_led",
                  answerMode: partialBottomLineMode,
                  retrievedSnippets: retrievedSupport.map(
                    (item) => `${item.section}: ${item.quoteSnippet ?? item.note}`
                  ),
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
                  sourcesUsed: sourceUsageDebug.sourcesUsed,
                  pwaSectionsUsed: sourceUsageDebug.pwaSectionsUsed,
                  compensationChunksUsed: sourceUsageDebug.compensationChunksUsed,
                  schedulerChunksUsed: sourceUsageDebug.schedulerChunksUsed,
                  structuredRowsUsed: sourceUsageDebug.structuredRowsUsed,
                  missingSourceWarnings: sourceUsageDebug.missingSourceWarnings,
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
                  xDayScenario,
                  xDayAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.xDayAnchorFound,
                  governingSectionIncludesXDay,
                  pcsSwapScenario,
                  pcsSwapAnchorFound: finalizedAIUnverifiedScenarioAnswer.debug.pcsSwapAnchorFound,
                  pcsSwapMissingSupportReason:
                    finalizedAIUnverifiedScenarioAnswer.debug.pcsSwapMissingSupportReason,
                  governingSectionIncludesPcsSwap,
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
      },
      governingPacket: governingPacketUsed,
      matchedInteractionRule,
    });

    const verifiedFallbackAnswer = applyScenarioAnswerVerifier({
      question: parsedRequest.question,
      selectedLane: intentResolution.selectedLane,
      answer: buildSafeScenarioFallbackAnswer({
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
      contractIndex,
      sourceUsageDebug,
    });
    const fallbackAnswerSupport = mergeAnswerReferencedSupport({
      answerText: `${verifiedFallbackAnswer.answer.shortAnswer} ${verifiedFallbackAnswer.answer.plainEnglishExplanation}`,
      references: verifiedFallbackAnswer.answer.references,
      chunks: searchableChunks,
    });
    const rerankedFallbackSupport = rerankSupportReferences({
      question: parsedRequest.question,
      answerText: `${verifiedFallbackAnswer.answer.shortAnswer} ${verifiedFallbackAnswer.answer.plainEnglishExplanation}`,
      references: [...fallbackAnswerSupport.references, ...supportFocusedReferences],
      selectedLane: intentResolution.selectedLane,
    });
    const fallbackVisibleReferences = selectVisibleContractReferences(rerankedFallbackSupport.references);
    const fallbackFinalVisibleSupportDebug = buildFinalVisibleSupportDebug(
      fallbackVisibleReferences,
      rerankedFallbackSupport.debug as Record<string, unknown>
    );
    const fallbackAnswerWithComparisonNote = applyComparisonSupportNote({
      question: parsedRequest.question,
      answer: {
        ...verifiedFallbackAnswer.answer,
        references: fallbackVisibleReferences,
      },
      references: fallbackVisibleReferences,
    });
    const finalizedFallbackScenarioAnswer = finalizeScenarioSafetyPipeline({
      answer: fallbackAnswerWithComparisonNote,
      verified: verifiedFallbackAnswer,
      supportDebug: {
        ...rerankedFallbackSupport.debug,
        ...fallbackFinalVisibleSupportDebug,
        answerReferencedSections: fallbackAnswerSupport.answerReferencedSections,
        supportInjectedFromAnswer: fallbackAnswerSupport.supportInjectedFromAnswer,
        supportMissingForReferencedSection: fallbackAnswerSupport.missingSections.length > 0,
      },
    });

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
              retrievedSnippets: retrievedSupport.map(
                (item) => `${item.section}: ${item.quoteSnippet ?? item.note}`
              ),
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
              sourcesUsed: sourceUsageDebug.sourcesUsed,
              pwaSectionsUsed: sourceUsageDebug.pwaSectionsUsed,
              compensationChunksUsed: sourceUsageDebug.compensationChunksUsed,
              schedulerChunksUsed: sourceUsageDebug.schedulerChunksUsed,
              structuredRowsUsed: sourceUsageDebug.structuredRowsUsed,
              missingSourceWarnings: sourceUsageDebug.missingSourceWarnings,
              aiSynthesisUsed: false,
              OPENAI_API_KEYPresent: Boolean(apiKey),
              modelClientCalled,
              modelClientSucceeded,
              modelClientError,
              aiSynthesisAttempted,
              aiSynthesisRejected: true,
              aiRejectionReason: aiRejectionReason ?? modelClientError,
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
              xDayScenario,
              xDayAnchorFound: finalizedFallbackScenarioAnswer.debug.xDayAnchorFound,
              governingSectionIncludesXDay,
              pcsSwapScenario,
              pcsSwapAnchorFound: finalizedFallbackScenarioAnswer.debug.pcsSwapAnchorFound,
              pcsSwapMissingSupportReason: finalizedFallbackScenarioAnswer.debug.pcsSwapMissingSupportReason,
              governingSectionIncludesPcsSwap,
              shortCallDutyScenario,
              shortCallDutyAnchorFound: finalizedFallbackScenarioAnswer.debug.shortCallDutyAnchorFound,
              governingSectionIncludesDutyLegality,
              ...rerankedFallbackSupport.debug,
              ...fallbackFinalVisibleSupportDebug,
              ...intentDebugBase,
              toolsUsed: buildContractScenarioToolsUsed({
                intent: intentResolution,
                matchedInteractionRule,
                missingGatingFacts: [],
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
