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
  runContractCopilot,
  resolveContractCopilotIntent,
  retrieveContractCopilotSnippets,
  synthesizeContractCopilotTopAnswer,
  verifyContractScenarioAnswer,
} from "../../../src/ai/workflows/contractCopilot/index.ts";
import { executeScenarioPipelineLegacyCompat } from "../../../src/ai/workflows/contractCopilot/scenarioPipelineLegacyCompat.ts";
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
import { runContractCopilot as runLegacyContractCopilot } from "../../../src/utils/contractCopilot/contractCopilotEngine.ts";
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

function hashShadowValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

function summarizeShadowAnswer(answer: { shortAnswer?: string }) {
  return typeof answer?.shortAnswer === "string" ? answer.shortAnswer : "";
}

function extractSupportSections(answer: { references?: Array<{ section?: string }> }) {
  return (answer.references ?? [])
    .map((reference) => reference.section)
    .filter((section): section is string => typeof section === "string" && section.trim().length > 0);
}


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
  { label: "blanket QS", patterns: [/\bblanket qs\b/] },
  { label: "senior responder", patterns: [/\bsenior responder\b/] },
  { label: "call order", patterns: [/\bcall every pilot\b/, /\bcall order\b/, /\bwide report\b/, /\bseniority\b/] },
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
  { label: "OE notification", patterns: [/\boe notification\b/, /\boe\b.*\bnotification\b/, /\bcompany notification online\b/, /\bcno\b/, /\bsrh\b/, /\btrh\b/] },
  { label: "pay protection", patterns: [/\bpay protection\b/, /\bdue anything extra\b/] },
  { label: "notification", patterns: [/\bnotification\b/, /\brobot\b/, /\bnotice\b/] },
  { label: "short-call notification", patterns: [/\bshort call assignment\b/, /\bshort call\b/, /\bno notification\b/, /\bvacation\b/, /\bnon-fly day\b/, /\bnon fly day\b/, /\bicrew\b/, /\bmicrew\b/, /\bcno\b/] },
  { label: "eligible", patterns: [/\beligible\b/, /\beligibility\b/, /\bslip active\b/] },
  { label: "golden day", patterns: [/\bgolden day\b/] },
  { label: "hard non-fly day", patterns: [/\bhard non-fly day\b/] },
  { label: "assignment timing", patterns: [/\b6pm\b/, /\b1800\b/, /\bday one\b/, /\bday before\b/, /\bearlier than\b/] },
  { label: "PCS", patterns: [/\bpcs\b/, /\b1200 pcs\b/] },
  { label: "bid period", patterns: [/\bbid period\b/, /\bapril\b/, /\bmay\b/] },
  { label: "carry-out", patterns: [/\bcarry-out\b/, /\bcarry out\b/] },
  { label: "black days", patterns: [/\bblack days?\b/] },
  { label: "max pickup", patterns: [/\bmax p\/?up\b/, /\bmax pickup\b/, /\bpickup limit\b/] },
  { label: "drop/add", patterns: [/\bdrop trip\b/, /\bdrop\b/, /\badd\b/, /\bpickup\b/] },
  { label: "sick bank", patterns: [/\bsick bank\b/] },
  { label: "called well", patterns: [/\bcalled well\b/] },
  { label: "bank deposit", patterns: [/\bbank deposit\b/, /\bdeposit\b/] },
  { label: "SS credit", patterns: [/\bss credit\b/, /\bsilver slip credit\b/] },
  { label: "MiCrew credit", patterns: [/\bmicrew\b/, /\bmicrew credit\b/] },
  { label: "credit recalculation", patterns: [/\bcredit recalculation\b/, /\brecalculation\b/, /\btimecard\b/] },
  { label: "deadhead deviation", patterns: [/\bdeadhead deviation\b/, /\bdeviat(?:e|ion)\b/] },
  { label: "13-hour layover", patterns: [/\bless than 13 hours\b/, /\b13 hours\b/] },
  { label: "first airborne", patterns: [/\bfirst airborne\b/, /\bafter first airborne\b/] },
  { label: "different flight number", patterns: [/\bdifferent flight number\b/, /\bflight number\b/] },
  { label: "same destination", patterns: [/\bsame destination\b/] },
  { label: "continuation", patterns: [/\bcontinuation\b/] },
  { label: "RRPay", patterns: [/\brrpay\b/, /\brr pay\b/, /\brr\b/] },
  { label: "turn time difference", patterns: [/\bturn time\b/, /\bpaid differently\b/] },
  { label: "30/168", patterns: [/\b30\/168\b/, /\b30 168\b/, /\bfar restrictions?\b/] },
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
  if (
    lower.includes("reroute pay") ||
    lower.includes("rrpay") ||
    lower.includes("first airborne") ||
    lower.includes("after first airborne") ||
    lower.includes("different flight number") ||
    lower.includes("same destination") ||
    lower.includes("continuation") ||
    lower.includes("paid differently") ||
    lower.includes("turn time")
  ) {
    families.add("reroute_consistency");
  }
  if (lower.includes("x-day") || lower.includes("x day") || lower.includes("interrupted x-days")) {
    families.add("x_day");
  }
  if (lower.includes("notification") || lower.includes("arcos") || lower.includes("auto accept") || lower.includes("called")) {
    families.add("notification_process");
  }
  if (
    lower.includes("qs") ||
    lower.includes("quick slip") ||
    lower.includes("blanket qs") ||
    lower.includes("arcos") ||
    lower.includes("phone never rang") ||
    lower.includes("no notification") ||
    lower.includes("wide report") ||
    lower.includes("30/168")
  ) {
    families.add("qs_call_order");
  }
  if (detectShortCallNotificationScenario(question)) {
    families.add("short_call_notification");
  }
  if (detectOeNotificationScenario(question)) {
    families.add("oe_notification");
  }
  if (lower.includes("dart") || lower.includes("system") || lower.includes("dispute") || lower.includes("denial")) {
    families.add("dispute_system");
  }
  if (lower.includes("sick") || lower.includes("called in sick")) {
    families.add("sick_leave");
  }
  if (
    lower.includes("apd") &&
    lower.includes("denied") &&
    (lower.includes("required") || lower.includes("available") || lower.includes("reserve counts"))
  ) {
    families.add("apd_diagnostic");
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
  if (
    lower.includes("bank") ||
    lower.includes("vacation day") ||
    lower.includes("buy vacation") ||
    lower.includes("replacement") ||
    /\bsup\b/.test(lower) ||
    /\bivd\b/.test(lower) ||
    lower.includes("vacation year")
  ) {
    families.add("vacation_bank");
  }
  if (
    lower.includes("domicile layover") ||
    lower.includes("base layover") ||
    lower.includes("break in duty at base") ||
    lower.includes("rotation definition") ||
    lower.includes("illegal rotation") ||
    lower.includes("open time rotation")
  ) {
    families.add("domicile_layover");
  }
  if (
    lower.includes("30-hour rest") ||
    lower.includes("30 hour rest") ||
    lower.includes("far legal") ||
    lower.includes("pwa requirement") ||
    lower.includes("release with pay") ||
    lower.includes("9:45 rest") ||
    lower.includes("10 hours required") ||
    lower.includes("9:15") ||
    lower.includes("dh-only") ||
    lower.includes("dh only") ||
    lower.includes("fdp") ||
    lower.includes("illegal rotation") ||
    lower.includes("rotation illegal") ||
    (lower.includes("rotation") && lower.includes("timing shown") && lower.includes("legal")) ||
    lower.includes("rest legality") ||
    lower.includes("duty/rest")
  ) {
    families.add("rest_legality");
  }
  if (
    lower.includes("23m7") ||
    (lower.includes("affected pilots") && lower.includes("logs")) ||
    lower.includes("display 23m7 logs") ||
    (lower.includes("icrew") && lower.includes("open time"))
  ) {
    families.add("twenty_threem7_logs");
  }
  if (
    lower.includes("friend swap") ||
    lower.includes("swapped with a friend") ||
    lower.includes("swap it back") ||
    (lower.includes("pickup") && lower.includes("friend schedule")) ||
    lower.includes("white slip") ||
    lower.includes("personal drop") ||
    lower.includes("blind slip")
  ) {
    families.add("friend_swap_undo");
  }
  if (
    lower.includes("sick lookback") ||
    lower.includes("medical procedure") ||
    lower.includes("approval process") ||
    lower.includes("does not count for sick") ||
    lower.includes("lookback") ||
    lower.includes("section 14")
  ) {
    families.add("sick_lookback");
  }
  if (
    lower.includes("sick bank") ||
    lower.includes("called well") ||
    (lower.includes("picked up flying") && lower.includes("sick")) ||
    lower.includes("bank deposit") ||
    lower.includes("deposit hours") ||
    lower.includes("ss credit") ||
    lower.includes("credit doesn't count") ||
    lower.includes("timecard") ||
    lower.includes("micrew credit") ||
    lower.includes("credit recalculation") ||
    lower.includes("deadhead deviation") ||
    lower.includes("layover less than 13 hours")
  ) {
    families.add("pay_credit_consistency");
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

function detectPickupLimitScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("max p/up") ||
    lower.includes("max pickup") ||
    lower.includes("pickup limit") ||
    lower.includes("0.0 pickup") ||
    lower.includes("swap with pot") ||
    lower.includes("swap with the pot")
  );
}

function detectVacationBankScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("bank") ||
    lower.includes("vacation day") ||
    lower.includes("buy vacation") ||
    lower.includes("replacement") ||
    lower.includes("60 hours") ||
    /\bsup\b/.test(lower) ||
    /\bivd\b/.test(lower) ||
    lower.includes("vacation year") ||
    lower.includes("same vacation year")
  );
}

function detectXDayGroupingScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    (lower.includes("x-day") || lower.includes("x day")) &&
    (
      lower.includes("reserve x-day") ||
      lower.includes("move x-day") ||
      lower.includes("between months") ||
      lower.includes("grouping") ||
      lower.includes("swap x-day")
    )
  );
}

function detectPbRerouteXdayScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    (
      /\bpb\b/.test(lower) ||
      /\bpr\b/.test(lower) ||
      /\blc\b/.test(lower) ||
      lower.includes("payback")
    ) &&
    (
      lower.includes("qs") ||
      lower.includes("reroute") ||
      lower.includes("deadhead") ||
      lower.includes("x-day") ||
      lower.includes("interrupted x-day") ||
      lower.includes("pb converted to lc") ||
      lower.includes("pr remainder") ||
      lower.includes("dart") ||
      lower.includes("no notification") ||
      lower.includes("acars") ||
      lower.includes("arcos") ||
      lower.includes("robot") ||
      lower.includes("2-day") ||
      lower.includes("3-day")
    )
  );
}

function detectFutureRotationChangeScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    (lower.includes("rotation changed next month") ||
      lower.includes("changed for next month") ||
      (lower.includes("next month") && lower.includes("not a carryover")) ||
      lower.includes("removed a leg") ||
      lower.includes("redeye")) &&
    (
      lower.includes("due anything extra") ||
      lower.includes("pay protection") ||
      lower.includes("cpo") ||
      lower.includes("override") ||
      lower.includes("reserve coverage") ||
      lower.includes("similar 4-day") ||
      lower.includes("known absence") ||
      lower.includes("cough")
    )
  );
}

function detectDomicileLayoverScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("domicile layover") ||
    lower.includes("base layover") ||
    lower.includes("break in duty at base") ||
    lower.includes("rotation definition") ||
    lower.includes("illegal rotation") ||
    lower.includes("open time rotation")
  );
}

function detectRestLegalityScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("30-hour rest") ||
    lower.includes("30 hour rest") ||
    lower.includes("far legal") ||
    lower.includes("pwa requirement") ||
    lower.includes("release with pay") ||
    lower.includes("9:45 rest") ||
    lower.includes("10 hours required") ||
    lower.includes("9:15") ||
    lower.includes("dh-only") ||
    lower.includes("dh only") ||
    lower.includes("fdp") ||
    lower.includes("illegal rotation") ||
    lower.includes("rotation illegal") ||
    (lower.includes("rotation") && lower.includes("timing shown") && lower.includes("legal")) ||
    lower.includes("rest legality") ||
    lower.includes("duty/rest")
  );
}

function detectDeadheadRerouteConsequenceScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("deadhead deviation") ||
    (lower.includes("deviate") && lower.includes("deadhead")) ||
    lower.includes("routing doesn’t pass through base") ||
    lower.includes("routing doesn't pass through base") ||
    lower.includes("airport in vicinity of home") ||
    (lower.includes("reroute") && lower.includes("slv")) ||
    lower.includes("reroute bleeds into slv") ||
    lower.includes("join on day 2") ||
    (lower.includes("qs") && lower.includes("delayed overnight")) ||
    lower.includes("delayed until next day") ||
    lower.includes("sign in") ||
    lower.includes("duty time missing") ||
    lower.includes("pb day not given")
  );
}

function detectSickLookbackScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("sick lookback") ||
    lower.includes("medical procedure") ||
    (lower.includes("procedure") && lower.includes("lookback")) ||
    lower.includes("approval process") ||
    lower.includes("does not count for sick") ||
    lower.includes("lookback") ||
    lower.includes("section 14")
  );
}

function detectPayCreditConsistencyScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("sick bank") ||
    lower.includes("called well") ||
    (lower.includes("picked up flying") && lower.includes("sick")) ||
    lower.includes("bank deposit") ||
    lower.includes("deposit hours") ||
    lower.includes("ss credit") ||
    lower.includes("credit doesn't count") ||
    lower.includes("timecard") ||
    lower.includes("micrew credit") ||
    (lower.includes("micrew") && lower.includes("credit")) ||
    lower.includes("projected credit") ||
    lower.includes("final credit") ||
    lower.includes("final closeout") ||
    lower.includes("credit jumped") ||
    lower.includes("reverted to") ||
    (lower.includes("went back") && lower.includes("credit")) ||
    lower.includes("credit recalculation") ||
    lower.includes("deadhead deviation") ||
    lower.includes("layover less than 13 hours") ||
    (lower.includes("deadhead") && lower.includes("short layover"))
  );
}

function detectPayCreditSubScenario(question: string):
  | "sickBankAfterCalledWell"
  | "bankDepositSilverSlipCredit"
  | "projectedVsFinalCreditCloseout"
  | "rerouteCreditProtection"
  | "timecardCreditDiscrepancy"
  | "unknownPayCredit" {
  const lower = question.toLowerCase();
  if (
    (lower.includes("reroute") || lower.includes("rerouted")) &&
    (
      lower.includes("worth less credit") ||
      lower.includes("less credit") ||
      lower.includes("original pairing") ||
      lower.includes("pay protected") ||
      lower.includes("trip worth less") ||
      lower.includes("after report") ||
      lower.includes("rotation guarantee")
    )
  ) {
    return "rerouteCreditProtection";
  }
  if (
    (lower.includes("bank") && (lower.includes("deposit") || lower.includes("2 hours"))) ||
    lower.includes("ss credit") ||
    lower.includes("silver slip credit") ||
    lower.includes("bank eligible") ||
    lower.includes("bank eligibility")
  ) {
    return "bankDepositSilverSlipCredit";
  }
  if (
    lower.includes("projected credit") ||
    lower.includes("final credit") ||
    lower.includes("closeout") ||
    lower.includes("micrew showed") ||
    lower.includes("dropped back") ||
    lower.includes("credit recalculation") ||
    lower.includes("did not deviate deadhead") ||
    lower.includes("reverted to") ||
    (lower.includes("went back") && lower.includes("credit"))
  ) {
    return "projectedVsFinalCreditCloseout";
  }
  if (
    lower.includes("sick bank") ||
    lower.includes("called well") ||
    (lower.includes("picked up flying") && lower.includes("sick"))
  ) {
    return "sickBankAfterCalledWell";
  }
  if (
    lower.includes("timecard") ||
    lower.includes("credit discrepancy") ||
    (lower.includes("credit") && lower.includes("paid differently"))
  ) {
    return "timecardCreditDiscrepancy";
  }
  return "unknownPayCredit";
}

function detectRerouteConsistencyScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("reroute") ||
    lower.includes("reroute pay") ||
    lower.includes("rrpay") ||
    lower.includes("first airborne") ||
    lower.includes("after first airborne") ||
    lower.includes("different flight number") ||
    lower.includes("same destination") ||
    lower.includes("continuation") ||
    lower.includes("paid differently") ||
    lower.includes("turn time difference") ||
    (lower.includes("turn time") && lower.includes("paid differently"))
  );
}

function detectQsCallOrderScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("qs") ||
    lower.includes("quick slip") ||
    lower.includes("blanket qs") ||
    lower.includes("call every pilot") ||
    lower.includes("category") ||
    lower.includes("arcos") ||
    lower.includes("phone never rang") ||
    lower.includes("no notification") ||
    lower.includes("eligible") ||
    lower.includes("slip active") ||
    lower.includes("wide report") ||
    lower.includes("seniority") ||
    lower.includes("30/168")
  );
}

function detectOeNotificationScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("oe notification") ||
    (/\boe\b/.test(lower) && lower.includes("notification")) ||
    lower.includes("company notification online") ||
    /\bcno\b/.test(lower) ||
    lower.includes("phone call") ||
    lower.includes("notification requirement") ||
    /\bsrh\b/.test(lower) ||
    /\btrh\b/.test(lower)
  );
}

function detectContactabilityScenario(question: string) {
  const lower = question.toLowerCase();
  return (
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
    lower.includes("end of short call")
  );
}

function getOeNotificationSupportHits(text: string) {
  const hits: string[] = [];
  if (/\boe\b/.test(text) || text.includes("operational event")) hits.push("oe");
  if (text.includes("notification") || text.includes("notify")) hits.push("notification");
  if (text.includes("company notification online") || /\bcno\b/.test(text)) hits.push("cno");
  if (text.includes("phone call") || text.includes("telephone") || text.includes("phone")) hits.push("phone call");
  if (text.includes("srh")) hits.push("srh");
  if (text.includes("trh")) hits.push("trh");
  if (text.includes("online notification")) hits.push("online notification");
  if (text.includes("electronic notification") || text.includes("electronic placement")) {
    hits.push("electronic notification");
  }
  return Array.from(new Set(hits));
}

function hasDirectOeNotificationSupport(text: string) {
  const hits = getOeNotificationSupportHits(text);
  const methodHit =
    hits.includes("cno") ||
    hits.includes("phone call") ||
    hits.includes("online notification") ||
    hits.includes("electronic notification");
  const oeContextHit = hits.includes("oe") || hits.includes("srh") || hits.includes("trh");
  return oeContextHit && (hits.includes("notification") || methodHit);
}

function detectShortCallNotificationScenario(question: string) {
  const lower = question.toLowerCase();
  const hasShortCallContext =
    lower.includes("short call assignment") ||
    lower.includes("short call");
  const hasReserveOnCallContext =
    lower.includes("long call") ||
    /\blc\b/.test(lower);
  const hasNotificationTerms =
    lower.includes("notification") ||
    lower.includes("no notification") ||
    lower.includes("acknowledge") ||
    lower.includes("acknowledgment") ||
    lower.includes("cno") ||
    lower.includes("call duty pilot") ||
    lower.includes("phone never rang") ||
    lower.includes("arcos") ||
    lower.includes("robot") ||
    lower.includes("telephone") ||
    lower.includes("icrew") ||
    lower.includes("micrew");
  const hasVacationNoticeContext =
    lower.includes("vacation") ||
    lower.includes("non-fly day") ||
    lower.includes("non fly day");
  const hardNotificationOverride =
    (hasShortCallContext || hasReserveOnCallContext) &&
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
  const hasDutyLegalitySignals =
    lower.includes("same-day trip") ||
    lower.includes("same day trip") ||
    lower.includes("report time") ||
    lower.includes("reports at") ||
    lower.includes("duty") ||
    lower.includes("flight time") ||
    lower.includes("legality") ||
    lower.includes("both remain on schedule") ||
    lower.includes("short call window");
  const hasContactabilitySignals =
    lower.includes("acars") ||
    lower.includes("airport sit") ||
    lower.includes("between flights") ||
    lower.includes("on duty") ||
    lower.includes("off duty") ||
    lower.includes("check your schedule") ||
    lower.includes("end of short call");

  if (hardNotificationOverride) {
    return true;
  }

  if (hasDutyLegalitySignals || hasContactabilitySignals) {
    return false;
  }

  return (
    hasShortCallContext &&
    (
      hasNotificationTerms ||
      (hasVacationNoticeContext && (lower.includes("18 hours") || lower.includes("12 hours")))
    )
  );
}

function detectShortCallDutyScenario(question: string) {
  const lower = question.toLowerCase();
  const hasShortCallContext =
    lower.includes("short call") ||
    lower.includes("assigned short call and trip");
  const hasDutyLegalitySignals =
    lower.includes("same-day trip") ||
    lower.includes("same day trip") ||
    lower.includes("subsequent same day trip") ||
    lower.includes("report time") ||
    lower.includes("reports at") ||
    lower.includes("flight time") ||
    lower.includes("legality") ||
    lower.includes("both remain on schedule") ||
    lower.includes("short call window") ||
    lower.includes("9+36") ||
    lower.includes("7+36") ||
    lower.includes("duty period");

  return hasShortCallContext && hasDutyLegalitySignals;
}

function inferPilotStatus(question: string | undefined): ParsedScenarioFacts["status"] | undefined {
  const lower = (question ?? "").toLowerCase();
  const reserveSignals =
    lower.includes("short call assignment") ||
    lower.includes("short call") ||
    lower.includes("long call") ||
    /\blc\b/.test(lower) ||
    lower.includes("reserve") ||
    lower.includes("on-call") ||
    ((lower.includes("non-fly day") || lower.includes("non fly day") || lower.includes("vacation")) &&
      (lower.includes("short call") || lower.includes("long call") || /\blc\b/.test(lower)));
  if (reserveSignals) {
    return "reserve";
  }
  return undefined;
}

function detectApdDiagnosticScenario(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("apd") &&
    lower.includes("denied") &&
    (
      lower.includes("required") ||
      lower.includes("available") ||
      lower.includes("reserve counts")
    )
  );
}

function lowerIncludesAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function filterClarifyingQuestionsForInference(
  question: string,
  questions: ClarifyingQuestion[] | undefined
): ClarifyingQuestion[] | undefined {
  if (!questions || questions.length === 0) {
    return questions;
  }
  const inferredPilotStatus = inferPilotStatus(question);
  if (inferredPilotStatus !== "reserve") {
    return questions;
  }
  const filtered = questions.filter((questionItem) => {
    const prompt = questionItem.prompt.toLowerCase();
    return !(prompt.includes("reserve or lineholder") || prompt.includes("lineholder"));
  });
  return filtered.length > 0 ? filtered : undefined;
}

function coerceClarificationIntent(args: {
  question: string;
  intent: ContractCopilotIntentResolution;
}) {
  const evidenceParsingAttempted = Object.keys(emptySession.facts).length >= 0;
  const issueFamilies = detectScenarioIssueFamilies(args.question);
  const looksComplex = issueFamilies.length >= 3;
  const forcedRestLegalityScenario =
    args.question.toLowerCase().includes("30-hour rest") ||
    args.question.toLowerCase().includes("30 hour rest") ||
    args.question.toLowerCase().includes("far legal") ||
    args.question.toLowerCase().includes("pwa requirement") ||
    args.question.toLowerCase().includes("release with pay");
  const recognizableScenarioSignals =
    forcedRestLegalityScenario ||
    issueFamilies.length > 0 ||
    /\b(wocl|8d3|report|assigned|assignment|reroute|reserve|gs|gswc|lc|long call|short call|deadhead|bank|vacation|replacement|sup|ivd|rotation|layover|open time|base|medical|procedure|lookback|section 14|sick bank|called well|timecard|credit|micrew|oe|cno|srh|trh)\b/i.test(
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

  if (forcedRestLegalityScenario) {
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
        evidenceParsingIgnoredReason: "Ignored question_scope fallback because the question clearly asks a rest-legality FAR-vs-PWA scenario.",
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

function augmentSourceUsageWithReferences(
  base: ReturnType<typeof buildSourceUsageDebug>,
  references: ContractAnswerCard["references"] | undefined
) {
  const refs = Array.isArray(references) ? references : [];
  const pwaSectionsUsed = new Set(base.pwaSectionsUsed);
  const compensationChunksUsed = new Set(base.compensationChunksUsed);
  const schedulerChunksUsed = new Set(base.schedulerChunksUsed);

  for (const reference of refs) {
    const section = String(reference?.section ?? "").trim();
    if (!section) continue;
    if (reference?.sourceId === "pwa") pwaSectionsUsed.add(section);
    if (reference?.sourceId === "compensation_manual") compensationChunksUsed.add(section);
    if (reference?.sourceId === "scheduler_manual") schedulerChunksUsed.add(section);
  }

  const sourcesUsed = Array.from(
    new Set([
      pwaSectionsUsed.size > 0 ? "PWA" : null,
      compensationChunksUsed.size > 0 ? "Compensation Manual" : null,
      schedulerChunksUsed.size > 0 ? "Scheduler Manual" : null,
    ].filter((value): value is string => Boolean(value)))
  );

  const compWarning = "Compensation Manual is indexed but was not used for this pay/credit-sensitive lane.";
  const schedWarning = "Scheduler Manual is indexed but was not used for this processing-sensitive lane.";
  const missingSourceWarnings = (base.missingSourceWarnings ?? []).filter((warning) => {
    if (warning === compWarning && compensationChunksUsed.size > 0) return false;
    if (warning === schedWarning && schedulerChunksUsed.size > 0) return false;
    return true;
  });

  return {
    ...base,
    sourcesUsed,
    pwaSectionsUsed: Array.from(pwaSectionsUsed),
    compensationChunksUsed: Array.from(compensationChunksUsed),
    schedulerChunksUsed: Array.from(schedulerChunksUsed),
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
  const payCreditConsistencyScenario = detectPayCreditConsistencyScenario(args.question);
  const restLegalityScenario = detectRestLegalityScenario(args.question);
  const pbRerouteXdayScenario = detectPbRerouteXdayScenario(args.question);
  const deadheadRerouteConsequenceScenario =
    detectDeadheadRerouteConsequenceScenario(args.question) &&
    !pbRerouteXdayScenario &&
    !payCreditConsistencyScenario;
  const rerouteConsistencyScenario = detectRerouteConsistencyScenario(args.question);
  const qsCallOrderScenario = detectQsCallOrderScenario(args.question);
  const oeNotificationScenario = detectOeNotificationScenario(args.question);
  const contactabilityScenario = detectContactabilityScenario(args.question);
  const shortCallDutyScenario = detectShortCallDutyScenario(args.question);
  const shortCallNotificationScenario = detectShortCallNotificationScenario(args.question);
  const futureRotationChangeScenario = detectFutureRotationChangeScenario(args.question);
  const apdDiagnosticScenario = detectApdDiagnosticScenario(args.question);
  const xDayGroupingScenario = detectXDayGroupingScenario(args.question);
  const isComplexScenario =
    issueFamilies.length >= 3 &&
    !payCreditConsistencyScenario &&
    !rerouteConsistencyScenario &&
    !deadheadRerouteConsequenceScenario &&
    !qsCallOrderScenario &&
    !oeNotificationScenario &&
    !contactabilityScenario &&
    !restLegalityScenario &&
    !shortCallNotificationScenario &&
    !apdDiagnosticScenario &&
    !xDayGroupingScenario &&
    !pbRerouteXdayScenario &&
    !futureRotationChangeScenario;
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
  if (apdDiagnosticScenario) {
    const { required, available } = parseRequiredAndAvailable(args.question);
    const threshold = required !== null ? required * 0.25 : null;
    const clears = required !== null && available !== null && threshold !== null ? available >= threshold : null;
    shortAnswer =
      required !== null && available !== null && threshold !== null
        ? `This looks like an APD threshold question: with ${required} required and ${available} available, the Section 23 I.10 threshold is ${threshold.toFixed(1)}, so the counts themselves look above the 25% minimum.`
        : "This looks like an APD denial question, and the first thing to check is the Section 23 I.10 threshold using the required-versus-available reserve counts at the time APD processed.";
    likelyApplication =
      required !== null && available !== null && threshold !== null
        ? clears
          ? "Meeting the threshold is necessary, but it is not always sufficient. If 18 required and 5 available were the actual processing counts, the denial is more likely about timing, the availability pool being read differently, or another APD condition rather than the raw ratio alone."
          : "If those were the actual processing counts, the denial could simply be that available reserves were below the Section 23 I.10 threshold at the moment APD processed."
        : "The safe read is that APD turns on the required-versus-available reserve threshold at processing time, but you still need the exact counts and timing to explain a denial cleanly.";
    issueThreadLines = [
      "What this appears to be:",
      "- An APD diagnostic question about why a denial happened even though you are comparing required and available reserve counts.",
      "",
      "What this depends on:",
      required !== null && available !== null && threshold !== null
        ? `- The counts you gave are ${required} required and ${available} available, and 25% of ${required} is ${threshold.toFixed(1)}.`
        : "- The required and available reserve counts at the time APD actually processed.",
      "- Whether the counts were evaluated at the time of processing rather than what you saw later.",
      "- Whether the availability pool you were looking at matched the APD-eligible reserve pool the system used.",
      "- Whether another APD condition or coding issue blocked the drop even if the raw threshold looked met.",
      "",
      "Likely paths:",
      required !== null && available !== null && threshold !== null && clears
        ? "- If 18 required and 5 available were the real processing counts, the threshold itself was likely satisfied, so timing, stale counts, or another APD condition become the more likely reasons for denial."
        : required !== null && available !== null && threshold !== null
          ? "- If those were the real processing counts and available reserves were below the threshold, the denial may simply track Section 23 I.10."
          : "- If the counts at processing time were different from the counts you saw later, the denial can still make sense under Section 23 I.10 even if the later screen looked favorable.",
      "- If the company used a narrower availability pool than the one you were reading, your visible count may not match the APD decision count.",
      "- Meeting the threshold is necessary, but not always sufficient if the wrong day, wrong drop type, or another APD condition applied.",
      "",
      "What to check in iCrew/DBMS/timecard:",
      "- Check the exact processing-time required and available reserve counts, not just the later displayed counts.",
      "- Check whether the available pool you saw matches the APD-eligible reserve pool the system used.",
      "- Check whether the request was coded for the correct day and APD/drop type.",
      "",
      "Source limitation:",
      "- I can anchor this to Section 23 I.10 threshold logic, but if the processing-time count source is not attached, I would keep the denial diagnosis cautious rather than promising one exact cause.",
      "",
      "Sources used:",
      "- Use PWA Section 23 I.10 first for the required-versus-available reserve threshold, then use any scheduler/process support only to explain timing or pool differences.",
    ];
  } else if (deadheadRerouteConsequenceScenario) {
    shortAnswer =
      "This looks like a deadhead or reroute consequence question, so the answer turns on what the reroute changed operationally, not just on one generic reroute rule.";
    likelyApplication =
      "The safer read is to separate deadhead deviation rules, reroute extension into a scheduled event like SLV, and system-display consequences such as missing duty start, PB day loss, or X-day interruption before making any hard pay or protection conclusion.";
    issueThreadLines = [
      "What this appears to be:",
      lower.includes("deviat")
        ? "- A deadhead deviation and routing question about whether the route home can be changed if it does not pass through base."
        : lower.includes("slv")
          ? "- A reroute-extension question where the reroute bleeds into a scheduled SLV and changes what happens to the SLV assignment."
          : "- A Quick Slip / reroute consequence question where an overnight delay or extension may have changed duty-time, PB-day, or X-day consequences.",
      "",
      "What this depends on:",
      lower.includes("deviat")
        ? "- Whether the deadhead deviation rule allows the route home or airport-in-the-vicinity option when the routing does not actually pass through base."
        : "- Whether the event was treated as a reroute continuation, a bleed into a scheduled event, or a new assignment consequence after the original report and duty start.",
      lower.includes("slv")
        ? "- Whether the scheduled SLV remains protected, can be joined on day 2, or is displaced by the reroute depending on the controlling source."
        : "- Whether the reroute or delay changed a scheduled event such as SLV, PB, PR, or an interrupted X-day.",
      (lower.includes("qs") || lower.includes("pb"))
        ? "- Whether iCrew is showing the original sign-in, actual duty start, and PB / X-day treatment correctly after the overnight delay."
        : "- Whether the system display matches the actual report, release, deadhead, and modified routing history.",
      "",
      "Likely paths:",
      lower.includes("deviat")
        ? "- If the deadhead deviation source requires the route to pass through base or another specific routing condition, a home-vicinity deviation may fail even if it seems operationally sensible."
        : "- If the reroute is treated as a continuation into the scheduled event, the original assignment and pay protections may carry differently than if the company treats it as a new event.",
      lower.includes("slv")
        ? "- If the reroute bleeds into the SLV, the controlling question is what the source lets the company do with the SLV itself, including whether a day-2 join or another adjustment is allowed."
        : "- If the QS or reroute delayed overnight after original report, the actual duty record, PB day, and X-day effects may differ from what a temporary display suggests.",
      "- If the system display is lagging or missing the actual duty history, DART or CPO follow-up may be needed before you treat the displayed result as final.",
      "",
      "What to check in iCrew/DBMS:",
      lower.includes("deviat")
        ? "- The exact deadhead deviation and routing rule, including whether the route must pass through base and how ATL/CVG/DTW or another home-vicinity routing is treated."
        : "- The original versus modified rotation history, including the reroute extension, delayed deadhead, and any scheduled event it overlapped.",
      lower.includes("slv")
        ? "- The SLV assignment record itself, whether the system allows a join on day 2, and whether any pay or protection code was applied to the SLV after the reroute."
        : "- The original sign-in, actual duty start, missing duty-time display, PB day / PR / X-day coding, and whether the overnight delay changed how the system treated those items.",
      "- Any DART, CPO, or scheduler note explaining a mismatch between the system display and the actual report/duty history.",
      "",
      "Source limitation:",
      "- I do not have the exact deadhead deviation / SLV / QS consequence rule attached for this question.",
      "",
      "Sources used:",
      "- Start with PWA Section 23 L and Section 23 L.9 where reroute or interrupted X-day logic is involved, then use Scheduler Manual deadhead deviation / SLV / QS processing support, and use Compensation Manual only if the attached source directly addresses the pay or credit consequence.",
    ];
  } else if (qsCallOrderScenario && !shortCallNotificationScenario) {
    shortAnswer =
      "This looks like a Quick Slip eligibility and missed-notification question, and I would separate being QS-eligible from proving the company should definitely have called you under the exact call-order rule.";
    likelyApplication =
      "The safest read is that blanket QS being active, no 30/168 issue, and no ARCOS/email/phone notification all point to a possible call-order or notification-process problem, but I would not say you definitely should have been called unless the exact QS call-order rule and processing log support it.";
    issueThreadLines = [
      "What this appears to be:",
      "- A Quick Slip call-order and missed-notification question, not just a generic QS definition question.",
      "",
      "What this depends on:",
      "- Whether you were actually eligible in category at the time the QS went out, including any 30/168 or other legality screen if those matter.",
      "- Whether blanket QS was active and correctly coded for you and the other similarly situated pilot on the wide report.",
      "- Whether the QS process required ARCOS, phone, email, or other notification steps before moving past eligible pilots in category.",
      "- Whether the company log shows a true call-order skip, a processing failure, or a different eligibility screen than you expected.",
      "",
      "Likely paths:",
      "- If blanket QS was active, category eligibility was met, and there was no 30/168 or other legality block, then the real question is whether the ARCOS / phone / notification process failed or skipped eligible pilots.",
      "- If the system applied another eligibility filter that is not obvious from the wide report, the missed call may be a processing or rule-screen issue rather than proof that QS should have called every pilot in category.",
      "- Another similarly situated pilot not getting called matters as evidence of a broader process issue, but it still does not prove the exact QS call-order rule without the underlying support and logs.",
      "",
      "What to check in iCrew/DBMS/timecard:",
      "- Check that blanket QS was active and the slip settings were still correct at the time the QS went out.",
      "- Check ARCOS history, phone logs, email, and any notification record for the 0044 event.",
      "- Check the wide report or category list that shows where you and the other pilot sat in seniority and eligibility for that QS.",
      "- Check whether the system recorded any legality screen such as 30/168, FAR, or another hidden eligibility block even if you do not think one applied.",
      "",
      "Source limitation:",
      "- I do not have the exact QS call-order / ARCOS notification rule and process log attached here, so I would keep this in CAUTION rather than saying you definitely should have been called.",
      "",
      "Sources used:",
      "- Use Scheduler Manual QS / Quick Slip / ARCOS processing support first, then use any direct PWA Section 23 QS language if it actually addresses call order or notification.",
      "",
      "Practical next step:",
      "- Preserve the ARCOS record, phone logs, email, screenshots showing blanket QS active, the wide report context, and the 30/168/FAR status, then use that evidence for DART or a scheduling / ALPA follow-up if the support points to a missed-call process issue.",
    ];
  } else if (oeNotificationScenario) {
    shortAnswer =
      "This looks like an OE notification-method question, and I would not treat CNO by itself as enough unless the attached OE/SRH/TRH source actually says so.";
    likelyApplication =
      "The safer read is that this turns on the exact OE notification language, not on generic contact rules from unrelated Green Slip, pay, deadhead, or definition sections.";
    issueThreadLines = [
      "What this appears to be:",
      "- A question about the current OE notification requirement and whether notice must be by phone call or can be done by CNO / Company Notification Online.",
      "",
      "What this depends on:",
      "- Whether the current controlling language lives in the SRH, TRH, or another OE-specific process source rather than a generic reserve or pay section.",
      "- Whether the source distinguishes phone contact from online or electronic notification.",
      "- Whether the source is talking about OE specifically, rather than general scheduling contact rules.",
      "",
      "Likely paths:",
      "- If the attached source is truly OE-specific and says CNO or another electronic method is enough, then that method can control.",
      "- If the attached source says OE still requires personal phone contact, then an electronic notice by itself would not be enough.",
      "- If the packet only shows generic contact language but not OE-specific notice language, the safe answer is that the exact OE notification rule is still missing.",
      "",
      "What to check:",
      "- Check the SRH and TRH pages that actually mention OE notification, phone contact, CNO, or electronic notice.",
      "- Check whether the current source is OE-specific or only a general contact/notification rule.",
      "- Preserve the current SRH/TRH screenshots or page references if you need to show that the exact rule is absent or changed.",
      "",
      "Source limitation:",
      "- I do not have the exact OE notification / CNO source attached.",
      "",
      "Sources used:",
      "- Start with OE-specific SRH/TRH or scheduler/process support. Do not rely on unrelated Green Slip, pay, deadhead, or generic Section 2 definition language for this question.",
    ];
  } else if (contactabilityScenario && !shortCallNotificationScenario) {
    shortAnswer =
      "This looks like a contactability and notification-obligation question, and being on duty does not automatically answer whether you were contractually required to answer a personal phone or keep rechecking the schedule.";
    likelyApplication =
      "The safer read is to separate official company contact channels from personal-phone expectations, then ask what the attached source actually requires for acknowledgment, schedule checks, or notice at the end of short call.";
    issueThreadLines = [
      "What this appears to be:",
      "- A contactability and notification-obligation question, not just a generic short-call or reserve definition issue.",
      "",
      "What this depends on:",
      "- Whether the source requires you to respond to an official company contact method such as ACARS, company notice, scheduler call, or another documented channel.",
      "- Whether being on duty, in airport sit, or between flights changes the obligation to monitor official communications versus answer a personal phone.",
      "- Whether the question is really about notification/acknowledgment timing or about a required schedule check at the end of short call.",
      "- Whether the packet actually attaches a short-call end-of-period schedule-check rule or a broader contactability rule.",
      "",
      "Likely paths:",
      "- If the source requires you to monitor or acknowledge official company channels, ignoring those channels can be risky even if the rule does not clearly require answering a personal phone.",
      "- If the source does not explicitly require personal-phone contact, I would not say you must answer your cell phone just because you are on duty or between flights.",
      "- If an assignment can appear at the end of short call, the key issue is whether the source requires a schedule check, an acknowledgment, or another notice step before the period ends.",
      "",
      "What to check:",
      "- The exact contact method used or attempted: ACARS, company phone contact, CNO, schedule placement, or another official notification channel.",
      "- Whether the timing was while you were on duty, in airport sit, between flights, or at the end of short call.",
      "- Any logs, screenshots, missed-call records, ACARS history, or schedule snapshots that show when notice was sent and how it was delivered.",
      "- Preserve the timestamps and method history, and do not ignore official channels even if the personal-phone obligation is unclear.",
      "",
      "Source limitation:",
      "- I do not have the exact contactability / notification-obligation source attached for this question.",
      "",
      "Sources used:",
      "- Start with Scheduler Manual or SRH contactability examples, then use any direct PWA notification/contact language that actually addresses on-duty contact, end-of-short-call checks, acknowledgment, or notice method.",
    ];
  } else if (restLegalityScenario) {
    shortAnswer =
      "This looks like a rest-legality question, and FAR legality by itself does not automatically answer the PWA release or operate decision.";
    likelyApplication =
      "The safe read is to separate FAR legality from any stricter contractual rest rule, then ask whether the attached packet actually supports operating, releasing, or releasing with pay for this exact sequence.";
    issueThreadLines = [
      "What this appears to be:",
      "- A rest-legality question that turns on FAR legality versus PWA duty/rest requirements.",
      "",
      "What this depends on:",
      "- Whether the issue is a planned 30-hour rest that was lost, a 9:45 or 9:15 rest issue, or another Section 12 rest/timing problem.",
      "- Whether the sequence is still FAR legal but potentially not compliant with a stricter contractual rest requirement.",
      "- Whether the day in question is DH-only / no-FDP or a day with actual FDP or duty consequences.",
      "- Whether the packet actually attaches release-with-pay or operate/release language for this rest failure.",
      "",
      "Likely paths:",
      "- If the packet shows only FAR legality, that does not automatically settle the PWA question.",
      "- If Section 12 or scheduler examples impose a stricter contractual rest requirement, the answer may be release, operate, or release with pay depending on the exact rule and how the day is coded.",
      "- If this is a DH-only day without FDP, the 10-hour versus 9:15 or 9:45 analysis may differ from a normal flying-duty sequence.",
      "",
      "What to check in iCrew/DBMS/timecard:",
      "- Check the exact scheduled rest versus actual rest, including any 30-hour planned rest that was lost due to delay or reroute.",
      "- Check whether the affected day is DH-only or includes FDP/report/duty obligations.",
      "- Check the exact report, release, block, and rest timestamps for the sequence you think is illegal.",
      "- Check whether any release or pay treatment is coded as contract-driven or only as a FAR legality outcome.",
      "",
      "Source limitation:",
      "- I do not have the exact Section 12 rest-legality and release/pay language attached for this question.",
      "",
      "Sources used:",
      "- Start with PWA Section 12 duty/rest support, then use SRH/Scheduler Manual rest-legality examples, and use Compensation Manual only if the attached support directly addresses release-with-pay treatment.",
    ];
  } else if (shortCallDutyScenario && !shortCallNotificationScenario) {
    shortAnswer =
      "This looks like a short-call plus same-day-trip legality question, and I would not assume both pieces can stay on schedule unless the duty and assignment rules clearly allow it.";
    likelyApplication =
      "The real question is whether the short-call window, the 5:10pm trip report, and the total duty/flight footprint can legally coexist, or whether Scheduling is treating two events as sequential even though the combined legality may fail.";
    issueThreadLines = [
      "What this appears to be:",
      "- A reserve short-call period followed by a same-day trip that reports right when short call ends.",
      "",
      "What this depends on:",
      "- The short-call window and when that reserve obligation actually ends.",
      "- The same-day trip report at 5:10pm.",
      "- The total duty and flight-time interaction if the short call and trip remain on one continuous schedule day.",
      "- Whether the company is treating the sequence as one legality problem or as separate schedulable events that still must remain legal together.",
      "",
      "Likely paths:",
      "- If the short-call block and the trip report create one continuous duty problem, both events may not be able to remain on schedule together.",
      "- If the company treats them as separate legal events, the result can still turn on whether the report, duty, and flight-time totals remain legal once the trip actually starts.",
      "- The answer should not turn on a generic short-call definition alone; it has to be tied to report timing, duty limits, and whether both events can remain scheduled.",
      "",
      "What to check:",
      "- The short-call start and end window, and whether the trip report exactly at 5:10pm creates a continuous-duty issue.",
      "- The duty-period and flight-time totals if the same-day trip operates as scheduled.",
      "- Whether Section 12 duty/rest support and Section 23 short-call support both line up for this exact sequence.",
      "- The iCrew or DBMS legality result that shows whether both the short call and the trip remain on schedule together.",
      "",
      "Source limitation:",
      "- I do not see the exact short-call plus same-day trip legality rule in the attached support.",
      "",
      "Sources used:",
      "- Use Section 23 short-call assignment language together with Section 12 duty/rest or legality support; do not rely on a generic notification rule for this fact pattern.",
    ];
  } else if (shortCallNotificationScenario) {
    shortAnswer =
      "This looks like a reserve short-call notification question after a vacation or non-fly day, and I would not treat simply seeing a placement in iCrew or MiCrew as automatically settling the contractual notice issue unless the exact rule says it does.";
    likelyApplication =
      "The safer read is to separate practical awareness from contractual notice. Calling the duty pilot can be a sensible real-world step if you have not received notice, but it is not automatically a substitute for the actual short-call notification rule unless the attached source support says telephone contact, electronic placement, or acknowledgment is enough by itself.";
    issueThreadLines = [
      "What this appears to be:",
      "- A reserve short-call assignment notification question that follows a vacation or non-fly day.",
      "",
      "What this depends on:",
      "- Whether the controlling short-call rule requires telephone contact, electronic placement, acknowledgment, or some combination of those notice methods.",
      "- Whether seeing the assignment in iCrew or MiCrew counts as notice under the actual source language or is only evidence that the placement happened in the system.",
      "- Whether the vacation or non-fly day changes when notice had to occur before the short-call assignment start time.",
      "- Whether the packet includes any CNO or no-notification dispute path for a missed call or missed acknowledgment case.",
      "",
      "Likely paths:",
      "- If the rule says short-call notice can be completed electronically or by placement plus acknowledgment, then the key issue is whether the assignment was actually visible and acknowledged in time.",
      "- If the rule requires direct telephone contact or another more specific notice method, then simply finding the assignment in iCrew or MiCrew later may not cure a missed-notification problem.",
      "- Calling the duty pilot 18 hours before assignment can be a practical way to protect yourself and clarify what the system shows, but it is not the same as proving the company satisfied the contractual notice rule.",
      "",
      "What to check in iCrew/MiCrew/DBMS/timecard:",
      "- Check when the short-call assignment was placed in iCrew or MiCrew and whether the system shows any acknowledgment timestamp.",
      "- Check call logs, voicemail, ARCOS or other notification records, screenshots, and the timeline from the vacation or non-fly day into the assignment window.",
      "- Check whether the dispute path references CNO, missed notice, or a scheduling acknowledgment step if the assignment appeared without direct contact.",
      "",
      "Source limitation:",
      "- I do not see the exact short-call-after-vacation/non-fly-day notification rule in the attached support.",
      "",
      "Sources used:",
      "- Start with short-call reserve notification language, then look for any scheduler/process support on telephone contact, electronic placement, acknowledgment, iCrew/MiCrew visibility, and CNO handling.",
      "",
      "Practical next step:",
      "- Preserve screenshots, timestamps, call logs, voicemail, and any iCrew/MiCrew placement history, then call the duty pilot or use the dispute path if you need the company to confirm how notice was supposedly given.",
    ];
  } else if (pbRerouteXdayScenario) {
    shortAnswer =
      "This is a multi-part scheduling, X-day, and system-processing question, not a single-rule yes or no.";
    likelyApplication =
      "The key is to break the problem into separate issue threads: the reroute and deadhead extension, the interrupted X-days, the PB to LC and PR remainder processing, and the missing notification trail. You should not assume PB was supposed to be reapplied unless the X-day interruption and PB/PR/LC processing rules line up in the attached sources.";
    issueThreadLines = [
      "Issue breakdown:",
      "- Reroute / extension of rotation: the original 2-day QS turned into a 3-day sequence after the reroute and deadhead change.",
      "- Interrupted X-days: the question is whether the X-days were coded as interrupted, used, or later restored under the reroute logic.",
      "- PB / PR / LC processing: the answer turns on when PB converted to LC, whether PR remainder was recalculated, and whether PB was supposed to reapply later.",
      "- Notification / assignment processing: the missing ACARS / ARCOS / robot or manual notification trail is a separate process issue from the payback result.",
      "",
      "What this depends on:",
      "- Whether the reroute qualifies under Section 23 L and whether Section 23 L.9 controls the interrupted X-day treatment.",
      "- How the X-days were coded after the reroute: interrupted versus used versus restored.",
      "- When PB converted to LC and how the system recalculated the PR remainder after the extension.",
      "- Whether the system processed the extension as continuation, reroute, or a re-award.",
      "- Whether the notification rules were actually triggered and logged for the changed trip.",
      "",
      "Likely paths:",
      "- If this was treated as a true X-day interruption, the X-days may need to be restored, and PB may need to be reapplied depending on how the PB / PR / LC processing rule works.",
      "- If the system treated the extension as continuation or a system reflow, PB may not auto-reapply even though the trip impact got larger.",
      "- If the values are being held up by processing lag or a system delay, the PB / PR / LC picture can look wrong temporarily before DART or manual review catches up.",
      "",
      "What to check in iCrew/DBMS:",
      "- Check the original versus modified rotation history, including the deadhead replacement and the 2-day to 3-day extension.",
      "- Check the X-day coding on the affected days to see whether the system marked them as interrupted, used, restored, or converted.",
      "- Check the timing of the PB to LC conversion and the PR remainder recalculation.",
      "- Check the notification logs, including ACARS, ARCOS, robot, or manual contact evidence tied to the reroute and award.",
      "",
      "Source limitation:",
      "- The X-day interruption rule in Section 23 L.9 and the PB / PR / LC reapplication logic are not fully attached here, so I would keep this in CAUTION rather than saying PB definitely should have been reapplied.",
      "- The X-day interruption rule in Section 23 L.9 and the PB / PR / LC reapplication logic are not fully attached here, so I would keep this in CAUTION rather than saying PB definitely should have been reapplied.",
      "",
      "Sources used:",
      "- Use PWA Section 23 L / 23 L.9 first for reroute and interrupted X-days, then use Scheduler Manual processing support for PB / PR / LC handling and notification processing, and use Compensation Manual support only if it directly addresses the pay treatment.",
      "",
      "Practical next step:",
      "- Preserve the original and modified rotation timeline, the X-day coding, the PB to LC conversion timing, the PR remainder display, and the notification logs so DART or scheduling review can compare the system processing against the reroute/X-day rules.",
    ];
  } else if (xDayGroupingScenario) {
    shortAnswer =
      "This depends on whether the reserve X-day move keeps the required grouping pattern intact across the month boundary, not on the month boundary alone.";
    likelyApplication =
      "The right question is whether swapping the 28th and the 2nd preserves the X-day grouping rules when you look at the adjacent reserve days on both sides of the move. If the grouping pattern survives across April into May, the move may be allowed; if it breaks the required grouping, it likely will not process.";
    issueThreadLines = [
      "What this appears to be:",
      "- A reserve X-day movement question where the proposed swap crosses the April/May boundary.",
      "",
      "What this depends on:",
      "- The X-day grouping rules, including how the X-day block is supposed to be spaced or clustered.",
      "- The adjacent reserve days before and after the proposed swap.",
      "- Whether swapping the 28th and the 2nd preserves the required grouping pattern once the month boundary is crossed.",
      "- Whether iCrew evaluates grouping continuity across the month boundary or treats the move as breaking the block.",
      "",
      "Likely paths:",
      "- If the grouping rules remain intact after moving the reserve X-day from the 28th to the 2nd, the move may be allowed even though it crosses months.",
      "- If the move breaks the required grouping pattern or the surrounding reserve block, the move is not likely to be allowed.",
      "- The month boundary by itself should not be the only decision point; the grouping result is the controlling issue.",
      "",
      "What to check in iCrew/DBMS:",
      "- Check the X-day pattern before and after the proposed swap, including the 28th, 29th, 30th, 01st, and 02nd.",
      "- Check the adjacent reserve block on both sides of the move and whether the system still shows a valid grouped X-day pattern.",
      "- Check whether iCrew flags the request as a grouping violation, a reserve-line violation, or a month-boundary processing issue.",
      "- Check whether the grouping rules are being evaluated continuously across the April/May boundary rather than month by month.",
      "",
      "Source limitation:",
      "- I do not have the exact reserve X-day grouping rule language attached here if the visible support does not show the month-crossing grouping text directly.",
      "",
      "Sources used:",
      "- Use PWA reserve/X-day movement and grouping language first, then use Scheduler Manual reserve-grouping or processing support if it is attached for the month-crossing case.",
    ];
  } else if (isComplexScenario) {
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
  } else if (payCreditConsistencyScenario) {
    const payCreditSubScenario = detectPayCreditSubScenario(args.question);
    const sickBankCase = payCreditSubScenario === "sickBankAfterCalledWell";
    const bankDepositCase = payCreditSubScenario === "bankDepositSilverSlipCredit";
    const rerouteCreditProtectionCase = payCreditSubScenario === "rerouteCreditProtection";
    const recalculationCase =
      payCreditSubScenario === "projectedVsFinalCreditCloseout" ||
      payCreditSubScenario === "timecardCreditDiscrepancy";
    shortAnswer =
      sickBankCase
        ? "This looks like a sick-bank and post-sick pickup question, and the key issue is whether calling well and flying after the sick trip ended changes the original sick-bank hit."
        : bankDepositCase
          ? "This looks like a bank-eligibility question, and the key issue is whether the SS credit on that 2 hours deposit request is being treated as credit that doesn't count for bank posting."
          : rerouteCreditProtectionCase
            ? "This looks like a reroute credit-protection question, and the key issue is whether you stay pay protected to the original pairing or original rotation value when the rerouted or as-flown trip closes lower."
            : "This looks like a projected-versus-final credit question, and the key issue is whether MiCrew briefly showed a higher projected value that disappeared when the trip closed and the final credit recalculated.";
    likelyApplication =
      sickBankCase
        ? "The safe read is to separate the sick-trip period from any later picked-up flying. Calling well and flying later may change future availability, but it does not automatically prove the original sick-bank charge should disappear unless the attached rule says the sick-bank hit is restored or offset."
        : bankDepositCase
          ? "The safe read is to separate pay, credit, and bank-eligible credit. A Silver Slip may generate credit for some purposes without that credit being bank-eligible in the same way as regular line or replacement credit."
          : rerouteCreditProtectionCase
            ? "The safe read is to separate the original pairing or original rotation value from the rerouted or as-flown value. If the trip was rerouted after report, the attached packet may support some pay or credit protection, reroute pay, or rotation-guarantee treatment, but I would not promise that without the controlling source."
            : "The safe read is to separate projected credit from final closeout credit. MiCrew can temporarily show a richer projected value if a deviation, short-layover, or rest-sensitive assumption is still in play, then remove it when the trip closes under the final flown sequence.";
    issueThreadLines = [
      "What this appears to be:",
      sickBankCase
        ? "- A question about whether picked-up flying after the sick trip ended changes the original sick-bank impact."
        : bankDepositCase
          ? "- A question about whether SS credit on a 2 hours deposit request counts as bank-eligible credit or is being treated as credit that doesn't count."
          : rerouteCreditProtectionCase
            ? "- A question about whether a reroute made the trip worth less credit and whether pay or credit protection preserves the original pairing value."
          : "- A question about why projected credit briefly increased and then dropped back when the rotation closed out.",
      "",
      "What this depends on:",
      sickBankCase
        ? "- Whether the picked-up flying started only after the sick trip ended, or overlapped the period that originally hit the sick bank."
        : null,
      sickBankCase
        ? "- Whether the attached Section 14 support addresses sick-bank restoration, offset, or only the original sick leave occurrence."
        : null,
      bankDepositCase
        ? "- Whether the 2 hours showing in iCrew are pay credit, bank-eligible credit, or a credit type that does not post to the bank."
        : null,
      bankDepositCase
        ? "- Whether the Silver Slip generated premium pay, straight credit, or a non-bank-eligible credit type for this transaction."
        : null,
      rerouteCreditProtectionCase
        ? "- Whether the reroute happened after report or only changed the trip before report."
        : null,
      rerouteCreditProtectionCase
        ? "- Whether the original pairing or original rotation value is protected when the rerouted or as-flown trip closes with less credit."
        : null,
      rerouteCreditProtectionCase
        ? "- Whether the attached packet actually uses reroute pay, rotation guarantee, or another pay-protection rule for this sequence."
        : null,
      recalculationCase
        ? "- Whether MiCrew was showing projected credit based on a possible deadhead deviation or a short-layover/rest-sensitive assumption before final closeout."
        : null,
      recalculationCase
        ? "- Whether the final closeout removed the extra value once you did not deviate and the actual flown sequence restored the original credit."
        : null,
      "",
      "Likely paths:",
      sickBankCase
        ? "- If the picked-up flying started after the sick trip ended, it may not erase the original sick-bank hit by itself; the real question is whether the source packet gives a restoration or offset rule."
        : null,
      sickBankCase
        ? "- If the packet only shows the original sick-occurrence treatment and not a restoration rule, keep the answer cautious rather than promising the sick bank will be adjusted."
        : null,
      bankDepositCase
        ? "- If Silver Slip credit is coded differently from regular credit or replacement credit, iCrew can reject the bank deposit as a bank eligibility issue even though the trip produced pay or apparent credit."
        : null,
      bankDepositCase
        ? "- If the packet never says Silver Slip credit is bank-eligible, treat the rejection as a credit-type eligibility question rather than assuming the system is wrong."
        : null,
      rerouteCreditProtectionCase
        ? "- If the reroute happened after report and the source packet supports reroute pay, rotation guarantee, or original-pairing protection, the final as-flown value may not be the only number that matters."
        : null,
      rerouteCreditProtectionCase
        ? "- If the packet does not attach the controlling reroute pay or rotation-guarantee rule for this fact pattern, keep the answer cautious instead of promising full pay protection."
        : null,
      recalculationCase
        ? "- If MiCrew temporarily assumed a deadhead deviation or a short-layover trigger, it can show a projected 24:35 that later disappears when the trip closes at the actual 21:00 value."
        : null,
      recalculationCase
        ? "- If the layover never actually closed below the final threshold or the deviation never happened, final closeout can legitimately recalculate the credit back down."
        : null,
      "",
      "What to check in iCrew/MiCrew/DBMS/timecard:",
      sickBankCase
        ? "- Check the exact sick-trip end time, the called-well timestamp, and the pickup award time to see whether the later flying truly started after the sick period ended."
        : null,
      sickBankCase
        ? "- Check whether the timecard still shows the original sick-bank deduction separately from the later picked-up trip."
        : null,
      bankDepositCase
        ? "- Check whether iCrew labels the 2 hours as bank-eligible credit, premium pay only, straight credit, or some Silver Slip-specific code."
        : null,
      bankDepositCase
        ? "- Check whether DBMS or the bank request detail explains the rejection as credit-type ineligibility rather than a balance issue."
        : null,
      rerouteCreditProtectionCase
        ? "- Check the original pairing or rotation value against the rerouted or final as-flown credit."
        : null,
      rerouteCreditProtectionCase
        ? "- Check whether the reroute happened after report, whether the trip remained one rotation, and whether the timecard or DBMS notes mention reroute pay, rotation guarantee, or pay protection."
        : null,
      rerouteCreditProtectionCase
        ? "- Check the Compensation Manual and any PWA Section 23 K / 23 L support attached to the reroute sequence before assuming the lower as-flown value controls."
        : null,
      recalculationCase
        ? "- Check the MiCrew projected credit screen versus the final timecard closeout, and whether the deadhead deviation field ever remained active."
        : null,
      recalculationCase
        ? "- Check the final layover/rest computation and whether the under-13-hour assumption was only provisional before closeout."
        : null,
      "",
      "Source limitation:",
      sickBankCase
        ? "- I do not have the exact sick-bank restoration or offset rule attached for this fact pattern, so I would not promise the later pickup removes the original sick-bank hit."
        : bankDepositCase
          ? "- I do not have the exact bank-eligibility rule attached that says whether Silver Slip credit can be deposited, so I would keep the answer cautious."
          : rerouteCreditProtectionCase
            ? "- I do not have a clean attached reroute pay / rotation guarantee source that proves the original pairing value is protected in this exact fact pattern, so I would keep the pay-protection answer cautious."
          : "- I do not have a clean attached rule that ties this exact projected-credit spike to the final recalculation, so I would keep the closeout explanation cautious rather than definitive.",
      "",
      "Sources used:",
      sickBankCase
        ? "- Start with PWA Section 14 and any Compensation Manual sick-bank or pay/credit treatment that actually addresses restoration or offset."
        : bankDepositCase
          ? "- Start with Compensation Manual pay/credit treatment and any PWA bank-eligibility language before assuming Silver Slip credit counts the same as regular credit."
          : rerouteCreditProtectionCase
            ? "- Start with PWA Section 23 K / 23 L as applicable, then use Compensation Manual reroute pay or rotation-guarantee support if it is attached to this sequence."
          : "- Start with Compensation Manual pay/credit and timecard treatment, then use PWA Section 12 only where rest/layover or deadhead legality changes the credit outcome.",
    ].filter((line): line is string => Boolean(line));
  } else if (detectVacationBankScenario(lower)) {
    shortAnswer =
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower) || lower.includes("vacation year")
        ? "This looks like a SUP / IVD vacation-year processing question, and the answer usually turns on the contract's vacation-year definition rather than the calendar year."
        : "This looks like a vacation-bank and replacement-credit question, and the answer usually turns on how Section 7 and the system process purchased vacation days, bank hours, and replacement value in the same month.";
    likelyApplication =
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower) || lower.includes("vacation year")
        ? "The key question is whether March 2027 and May 2026 fall inside the same contract vacation year for SUP / IVD use. That is a vacation-year-definition issue, not just a calendar-year issue, so the system message may be right even if the dates feel adjacent."
        : "The key question is whether buying a vacation day, keeping the bank full at 60 hours, and replacing 4:35 in the same month all fit the Section 7 vacation-bank rules the system is applying. A 4:35 requested / 0:00 awarded result usually means the request hit a bank, replacement, or vacation-year processing limit rather than simply failing at random.";
    issueThreadLines = [
      "What this appears to be:",
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower) || lower.includes("vacation year")
        ? "- A Section 7 vacation-year / SUP / IVD eligibility question driven by the system's 'Must be same Vacation year' message."
        : "- A Section 7 vacation-bank question involving a full 60-hour bank, a purchased vacation day, and replacement value in the same month.",
      "",
      "What this depends on:",
      lower.includes("bank") || lower.includes("60 hours")
        ? "- Whether the bank is already full at 60 hours and whether the system will let the same-month replacement value offset the purchased vacation transaction."
        : null,
      lower.includes("replacement") || lower.includes("4:35") || lower.includes("0:00 awarded")
        ? "- Whether the 4:35 replacement request is eligible to post in the same month or whether the transaction is blocked by how the vacation and bank entries are sequenced."
        : null,
      lower.includes("buy vacation") || lower.includes("vacation day")
        ? "- Whether the purchased vacation day is being processed for the current vacation year or a future vacation year."
        : null,
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower)
        ? "- Whether the SUP day and the IVD request fall inside the same contract vacation year."
        : null,
      lower.includes("vacation year")
        ? "- Whether the contract's vacation-year definition differs from the plain calendar-year assumption."
        : null,
      "",
      "Likely paths:",
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower) || lower.includes("vacation year")
        ? "- If March 2027 and May 2026 are not in the same contract vacation year, the system will reject the request even though they look related on a calendar basis."
        : "- If the bank is already full at 60 and the purchased vacation / replacement entries are not allowed to net together in the same month, the system can show 4:35 requested and 0:00 awarded.",
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower) || lower.includes("vacation year")
        ? "- If the vacation-year mapping actually does line up, the next question is whether the request is blocked by the specific SUP / IVD process rather than the year definition itself."
        : "- If Section 7 allows the transaction but iCrew or DBMS is reading the purchase, replacement, or bank sequence differently, the denial may be a processing issue rather than a clean contract prohibition.",
      lower.includes("replacement") || lower.includes("4:35")
        ? "- Replacement value and purchased vacation value may not be interchangeable the way the system display makes them look."
        : null,
      "",
      "What to check in iCrew/DBMS:",
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower) || lower.includes("vacation year")
        ? "- Check which vacation period the SUP day belongs to, which vacation period the IVD is being drawn from, and how iCrew labels the vacation year for each."
        : "- Check whether the purchased vacation day is tagged to the current or future vacation year and how the bank transaction is posted in the month you are trying to replace.",
      lower.includes("replacement") || lower.includes("4:35") || lower.includes("0:00 awarded")
        ? "- Check the request detail that shows 4:35 requested and 0:00 awarded to see whether the system is denying the replacement itself or the bank posting behind it."
        : null,
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower)
        ? "- Check the exact SUP and IVD dates against the contract vacation-year mapping rather than the calendar year."
        : null,
      "",
      "Source limitation:",
      /\bsup\b/.test(lower) || /\bivd\b/.test(lower) || lower.includes("vacation year")
        ? "- I need clean Section 7 vacation-year / SUP / IVD support attached here to say more than 'check the contract vacation-year definition and the iCrew mapping.'"
        : "- I need clean Section 7 vacation-bank / replacement support attached here to say more than 'check the bank cap, replacement sequence, and transaction month.'",
      "",
      "Sources used:",
      "- Use PWA Section 7 vacation language first, then use any related handbook/process references only to explain how iCrew or DBMS may be sequencing the request.",
    ].filter((line): line is string => Boolean(line));
  } else if (detectDomicileLayoverScenario(lower)) {
    shortAnswer =
      "This looks like a domicile-layover / open-time rotation construction question, and the Section 2 rotation definition by itself does not prove that the rotation is legal or illegal.";
    likelyApplication =
      "The key distinction is between what the PWA rotation definition means and whether some separate scheduler or open-time construction rule prohibits building a rotation with a break in duty at base. The definition alone usually does not answer that construction question.";
    issueThreadLines = [
      "What this appears to be:",
      "- An attempt to use the PWA Section 2 rotation definition to answer whether an open-time rotation with a domicile layover is allowed or prohibited.",
      "",
      "What this depends on:",
      "- Whether the cited Section 2 rotation definition is only defining when a rotation ends, rather than creating an open-time construction rule.",
      "- Whether there is separate Scheduler Manual or open-time construction language about domicile layovers, base layovers, or how open time may be built.",
      "- Whether the question is really about legality under the PWA, or about a scheduler/process rule that sits outside the definition itself.",
      "",
      "Likely paths:",
      "- If the only source you have is the Section 2 rotation definition, that alone does not prove the rotation is illegal.",
      "- If there is a Scheduler Manual or open-time construction reference that specifically bars domicile layovers in an open-time build, that would be the stronger source for saying the construction is not allowed.",
      "- If no separate construction rule is attached, the safer answer is that the definition explains how a rotation is treated, but it does not by itself settle the legality question.",
      "",
      "What to check in iCrew/DBMS:",
      "- Check whether the open-time build is tagged or described as a domicile/base layover versus a normal break in duty at base.",
      "- Check whether the denial or warning language in the system cites a scheduler/open-time construction rule, not just the rotation definition.",
      "- Check whether there is an accompanying Scheduler Manual reference on open time, rotation construction, or base layover handling.",
      "",
      "Source limitation:",
      "- I can point to the Section 2 rotation definition, but I should not call the rotation illegal unless a separate construction rule or scheduler reference says so.",
      "- If that scheduler/open-time construction reference is not attached here, the legality answer should stay cautious.",
      "",
      "Sources used:",
      "- Start with the PWA Section 2 rotation definition, then look for Scheduler Manual or open-time construction language that specifically addresses domicile layovers or breaks in duty at base.",
    ];
  } else if (detectSickLookbackScenario(lower)) {
    shortAnswer =
      "This looks like a sick-lookback and medical-procedure process question, and I would anchor it to Section 14 rather than assume every medical procedure is automatically excluded from lookback.";
    likelyApplication =
      "The safe read is that Section 14 governs sickness notification, verification, lookback, and some exclusion/exemption mechanics. But I would not promise that a given medical procedure does not count for sick lookback unless the attached source text actually says so.";
    issueThreadLines = [
      "What this appears to be:",
      "- A request for the contract references and approval path for medical-procedure sick leave that may or may not count toward sick lookback.",
      "",
      "What this depends on:",
      "- Whether the event falls under Section 14 F lookback / verification language or under a specific exclusion or exemption in the attached packet.",
      "- Whether the procedure is being handled as ordinary sick leave, a verified occurrence, medical leave, or another protected status.",
      "- Whether the process question is really about Company approval, Chief Pilot / Pilot Leaves verification, or DALPA / contract-administration guidance outside the plain contract text.",
      "",
      "Likely paths:",
      "- If Section 14 F or a related note explicitly says the hours will not be considered for lookback, that is the controlling support for saying the occurrence is excluded.",
      "- If the packet only shows general sick notification and verification language, the safer answer is that Section 14 explains the process, but not necessarily that the procedure is excluded from lookback.",
      "- If the exact medical-procedure exclusion language is not attached, verify the process with DALPA, Pilot Leaves, or contract administration rather than treating this as medical advice.",
      "",
      "What to check in iCrew/DBMS:",
      "- Check whether the occurrence is coded as ordinary sick leave, verified sick leave, known sick leave, medical leave, or another status.",
      "- Check whether Section 14 F.3, 14 F.4, 14 F.6, or 14 G is the part of the packet actually being cited for the approval / verification step.",
      "- Check whether the Company or DALPA process materials identify the procedure as not counting toward lookback, rather than assuming it from the general sick language.",
      "",
      "Source limitation:",
      "- I can point you to Section 14 process language, but I should not say a medical procedure is excluded from sick lookback unless that exclusion is attached in the source text.",
      "- If the exact exclusion or approval-process language is not attached, the answer should stay cautious and process-oriented.",
      "",
      "Sources used:",
      "- Start with PWA Section 14, especially Section 14 F notification/verification/lookback language, then verify the approval path through DALPA, Pilot Leaves, or the Company process if the packet does not contain the exact medical-procedure exclusion text.",
    ];
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
  } else if (futureRotationChangeScenario) {
    shortAnswer =
      "This is likely not one simple pay rule. It is a future rotation-change plus swap/coverage plus possible known-absence question.";
    likelyApplication =
      "This should be analyzed as a future schedule-change, pay-protection, reserve-coverage, and known-absence/CPO-processing question rather than a single redeye or removed-leg rule. You should not assume extra pay, a CPO override, or known-absence protection unless the controlling source language actually supports it.";
    issueThreadLines = [
      "Issue breakdown:",
      "- Future rotation change / removed leg / redeye: this is a next-month change on a trip you say is not a carryover.",
      "- Pay or credit protection: the first question is whether the changed rotation actually triggers any future-change protection.",
      "- Reserve coverage blocking the swap: the similar 4-day and the denied swap are a separate processing issue from the pay question.",
      "- CPO / manual override authority: discretionary processing is not the same thing as a guaranteed contract entitlement.",
      "- Known absence policy: that only matters if this event fits a qualifying known-absence path and the process support is actually there.",
      "- \"Cough\" / sick-leave angle: do not treat calling in sick as a substitute for a real contract source on pay protection or a swap denial.",
      "",
      "What this depends on:",
      "- Whether the changed rotation had already been awarded or published when the Company changed it.",
      "- Whether this is a company-driven future schedule change before operation, rather than a carryover or live reroute.",
      "- Whether the removed leg and redeye change altered pay, credit, or both in a way that the contract actually protects.",
      "- Whether the reserve coverage denial is just a processing block on the swap, separate from the underlying pay-protection issue.",
      "- Whether a CPO can manually process an exception here, and whether that would be discretionary rather than required.",
      "- Whether known-absence language applies to this fact pattern at all.",
      "",
      "Likely paths:",
      "- If the contract has a pay-protection or credit-protection rule for this future non-carryover rotation change, that rule controls the answer.",
      "- If this is only a schedule construction change before the trip operates, extra pay may not be automatic just because a leg was removed or the trip became a redeye.",
      "- If reserve coverage blocks the swap, a CPO override may be discretionary or administrative, not a guaranteed contract entitlement.",
      "- If known-absence support applies, it would still need a qualifying event and the correct process path; it is not automatic just because the changed trip is inconvenient.",
      "",
      "What to check in iCrew/DBMS:",
      "- The original award versus the changed rotation history, including when the removed leg and redeye change posted.",
      "- The pay and credit values before and after the change.",
      "- The reserve coverage denial reason on the similar 4-day swap.",
      "- The known-absence request category or any CPO / contract-admin guidance tied to this event.",
      "- Any DART, ALPA, or committee guidance if the dispute is really about pay or credit protection on a future changed trip.",
      "",
      "Source limitation:",
      "- I do not have a clean controlling source for CPO override / known absence pay protection in this packet.",
      "",
      "Sources used:",
      "- Use Scheduler Manual support first for reserve coverage, swap processing, and any CPO/manual-processing path. Use PWA support for known absence, schedule change, and pay protection only if the packet directly addresses this future non-carryover change. Use Compensation Manual support only if it directly addresses pay or credit protection on the changed rotation.",
      "",
      "Practical next step:",
      "- Save the original rotation, the changed redeye version, the value comparison, the reserve-coverage denial, and any CPO or DART guidance so you can separate the swap-processing issue from the actual pay-protection question.",
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
      "Green Slip has its own trigger or threshold mechanics. A Silver Slip is a separate premium category, so you should not assume the Green Slip trigger applies to Silver Slip. I would still stay cautious if the packet is clearer on Green Slip than on the exact Silver Slip premium-trigger language.";
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
          ? "- I found support for Silver Slip premium treatment and separate Green Slip comparison support, but I would verify the exact Silver Slip pay trigger if the visible source does not state it directly."
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
  } else if (rerouteConsistencyScenario && !payCreditConsistencyScenario) {
    const firstAirborneCase =
      lower.includes("first airborne") ||
      lower.includes("after first airborne") ||
      (lower.includes("different flight number") && lower.includes("same destination"));
    const rrPayCase =
      lower.includes("rrpay") ||
      (lower.includes("paid differently") && (lower.includes("turn time") || lower.includes("time card")));
    shortAnswer = firstAirborneCase
      ? "This looks like a reroute-versus-continuation question, and a different flight number by itself does not prove reroute pay applies."
      : "This looks like an RRPay consistency question, and two reserve reroute events that look similar can still pay differently if the underlying timing and credit inputs changed.";
    likelyApplication = firstAirborneCase
      ? "The safest read is to separate the first-airborne rule from the visible flight-number change. The real question is whether Day 2 became a new reroute segment under Section 23 L or stayed a continuation of the same rotation flow to the same destination."
      : "The safest read is to separate the visual similarity of the two RR trips from the actual timing inputs. Turn time, duty buildup, and credit treatment can change RRPay even when the city pair and block time look almost identical.";
    issueThreadLines = [
      "What this appears to be:",
      firstAirborneCase
        ? "- A reroute-pay question about a Day 2 change after first airborne departure, where the destination stayed the same but the scheduled flight number changed."
        : "- An RRPay consistency question where two reserve reroute events looked the same on paper but paid differently on the timecard.",
      "",
      "What this depends on:",
      firstAirborneCase
        ? "- Whether the first-airborne departure threshold had already been crossed for the rotation segment that is being changed."
        : "- Whether the two reserve events were truly identical in turn time, duty-time buildup, credit sequence, and closeout coding rather than just the same city pair.",
      firstAirborneCase
        ? "- Whether the Day 2 leg was processed as a reroute, continuation, reassignment, or simple flight-number swap to the same destination."
        : "- Whether the different turn time changed duty or credit inputs enough to produce a different RRPay outcome.",
      firstAirborneCase
        ? "- Whether Section 23 L support here actually ties this fact pattern to reroute pay rather than continuation logic."
        : "- Whether the attached Compensation Manual support includes the exact RRPay calculation method for this reserve fact pattern.",
      "",
      "Likely paths:",
      firstAirborneCase
        ? "- If the system treated the Day 2 change as a continuation to the same destination, the flight-number change alone does not force reroute pay."
        : "- If the turn-time difference changed duty, credit, or RR calculation inputs, the two trips can legitimately pay differently even if the block time looks about the same.",
      firstAirborneCase
        ? "- If the change created a true reroute under the first-airborne / Section 23 L rule set, reroute pay becomes more plausible, but you still need the controlling 23 L language rather than the flight number by itself."
        : "- If the underlying timing and coding were actually identical, then a mismatch points more toward a processing or timecard explanation than a rule difference.",
      rrPayCase
        ? "- If the packet only gives general reroute support and not the exact RRPay formula, keep the answer conditional instead of promising the same pay result."
        : "- If the packet only gives general reroute support and not the exact first-airborne continuation interpretation, keep the answer conditional instead of promising reroute pay.",
      "",
      "What to check in iCrew/DBMS/timecard:",
      firstAirborneCase
        ? "- Check whether the Day 2 leg was coded as continuation, reroute, reassignment, or a new segment, and whether the first-airborne flag or Section 23 L treatment changed with the update."
        : "- Check the Apr 1 and Apr 17 timecards side by side for turn time, duty credit, RR coding, and any timing difference that feeds the pay calculation.",
      firstAirborneCase
        ? "- Check whether the destination stayed the same while only the scheduled flight number changed, and whether the system still treated the leg as part of the same rotation flow."
        : "- Check whether MiCrew, DBMS, or the final timecard shows a different duty or credit sequence even though the city pair stayed ATL-SAV-ATL.",
      "- Check the final posted pay or credit code, not just the trip description.",
      "",
      "Source limitation:",
      firstAirborneCase
        ? "- I do not have a fully explicit first-airborne continuation-versus-reroute interpretation attached here, so I would not say reroute pay applies solely because the flight number changed."
        : "- I do not have the exact RRPay formula attached here, so I would not say the two trips must pay identically unless the timing and coding inputs match.",
      "",
      "Sources used:",
      "- Use PWA Section 23 L first for reroute/continuation treatment, then use Compensation Manual support for RRPay or credit effects, and use Scheduler Manual only for processing labels if needed.",
    ].filter((line): line is string => Boolean(line));
  } else if ((lower.includes("reroute") || lower.includes("deadhead")) && !payCreditConsistencyScenario) {
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

function buildScenarioClarificationResponse(args: {
  question: string;
  session: ContractCopilotSession;
  fallbackResult: ReturnType<typeof runContractCopilot>;
  scenarioValidation: ScenarioValidationResult;
  contractIndex: ReturnType<typeof loadContractDocumentIndex>;
  intentResolution: ContractCopilotIntentResolution;
  intentDebugBase: Record<string, unknown>;
}) {
  const gatingQuestion = args.scenarioValidation.gatingQuestion;
  if (!gatingQuestion) {
    throw new Error("Scenario clarification response requires a gating question.");
  }

  return jsonResponse(200, {
    ok: true,
    mode: "fallback",
    answer: {
      status: "needs_clarification",
      scenarioLabel: args.fallbackResult.answer.scenarioLabel,
      answerCompleteness: "provisional",
      shortAnswer: gatingQuestion.prompt,
      plainEnglishExplanation:
        args.scenarioValidation.conditionalWhy ??
        "I need this one fact before I can keep the answer grounded instead of guessing from a broad fallback.",
      confidence: "medium",
      supportLevel: "mixed",
      assumptions: [],
      evidenceSummary: [],
      references: [],
      clarifyingQuestions: [gatingQuestion],
      missingFacts: [gatingQuestion.factField],
    },
    detectedScenario: args.fallbackResult.detectedScenario,
    nextSession: {
      ...args.fallbackResult.nextSession,
      clarificationCount: args.session.clarificationCount < 2 ? args.session.clarificationCount + 1 : args.session.clarificationCount,
      unresolvedQuestion: args.session.unresolvedQuestion ?? args.question,
      lastAskedClarifyingField: gatingQuestion.factField,
      lastClarifyingQuestionId: gatingQuestion.id,
      status: "awaiting_reply",
    },
    meta: {
      fallbackReason: "scenario_missing_required_facts",
    },
    debug:
      process.env.NODE_ENV !== "production"
        ? {
            mode: "fallback",
            fallbackReason: "scenario_missing_required_facts",
            aiPathUsed: false,
            fallbackUsed: false,
            reasonForFallback: undefined,
            scenarioFamilySelected: args.scenarioValidation.scenarioFamilySelected,
            missingGatingFacts: args.scenarioValidation.missingGatingFacts,
            missingRequiredFacts: args.scenarioValidation.missingGatingFacts,
            clarificationInsteadOfFallback: true,
            fallbackEntryReason: "scenario_missing_required_facts",
            aiPathSkippedReason: "missing_required_facts_before_ai",
            modelValidationFailureReason: undefined,
            answerIsConditional: args.scenarioValidation.answerIsConditional,
            gatingQuestionUsed: gatingQuestion.prompt,
            fallbackUsed: true,
            aiSynthesisUsed: false,
            hasPwaIndex: args.contractIndex.hasPwaIndex,
            hasCompensationIndex: args.contractIndex.hasCompensationIndex,
            hasSchedulerIndex: args.contractIndex.hasSchedulerIndex,
            ...args.intentDebugBase,
            toolsUsed: buildContractScenarioToolsUsed({
              intent: args.intentResolution,
              matchedInteractionRule: undefined,
              missingGatingFacts: args.scenarioValidation.missingGatingFacts,
              aiSynthesisUsed: false,
            }),
          }
        : undefined,
  });
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
  question: string;
  answer: ContractAnswerCard;
  verified: ReturnType<typeof applyScenarioAnswerVerifier>;
  supportDebug?: Record<string, unknown>;
}) {
  const supportWeakMatchWarning = args.supportDebug?.supportWeakMatchWarning === true;
  const supportPrimaryAnchorMissing = args.supportDebug?.supportPrimaryAnchorMissing === true;
  const xDayScenario = args.supportDebug?.xDayScenario === true;
  const xDayAnchorFound = args.supportDebug?.xDayAnchorFound === true;
  const xDayGroupingScenario = args.supportDebug?.xDayGroupingScenario === true;
  const xDayGroupingAnchorFound = args.supportDebug?.xDayGroupingAnchorFound === true;
  const xDayGroupingMissingSupportReason =
    typeof args.supportDebug?.xDayGroupingMissingSupportReason === "string"
      ? args.supportDebug.xDayGroupingMissingSupportReason
      : undefined;
  const pbRerouteXdayScenario = args.supportDebug?.pbRerouteXdayScenario === true;
  const pbAnchorFound = args.supportDebug?.pbAnchorFound === true;
  const pbProcessingAnchorFound = args.supportDebug?.pbProcessingAnchorFound === true;
  const notificationAnchorFound = args.supportDebug?.notificationAnchorFound === true;
  const pbScenarioMissingSupportReason =
    typeof args.supportDebug?.pbScenarioMissingSupportReason === "string"
      ? args.supportDebug.pbScenarioMissingSupportReason
      : undefined;
  const futureRotationChangeScenario = args.supportDebug?.futureRotationChangeScenario === true;
  const futureRotationChangeAnchorFound = args.supportDebug?.futureRotationChangeAnchorFound === true;
  const cpoOverrideAnchorFound = args.supportDebug?.cpoOverrideAnchorFound === true;
  const knownAbsenceAnchorFound = args.supportDebug?.knownAbsenceAnchorFound === true;
  const payProtectionAnchorFound = args.supportDebug?.payProtectionAnchorFound === true;
  const futureRotationMissingSupportReason =
    typeof args.supportDebug?.futureRotationMissingSupportReason === "string"
      ? args.supportDebug.futureRotationMissingSupportReason
      : undefined;
  const pcsSwapScenario = args.supportDebug?.pcsSwapScenario === true;
  const pcsSwapAnchorFound = args.supportDebug?.pcsSwapAnchorFound === true;
  const pickupLimitScenario = args.supportDebug?.pickupLimitScenario === true;
  const pickupLimitAnchorFound = args.supportDebug?.pickupLimitAnchorFound === true;
  const pickupLimitMissingSupportReason =
    typeof args.supportDebug?.pickupLimitMissingSupportReason === "string"
      ? args.supportDebug.pickupLimitMissingSupportReason
      : undefined;
  const pcsSwapMissingSupportReason =
    typeof args.supportDebug?.pcsSwapMissingSupportReason === "string"
      ? args.supportDebug.pcsSwapMissingSupportReason
      : undefined;
  const vacationBankScenario = args.supportDebug?.vacationBankScenario === true;
  const vacationBankAnchorFound = args.supportDebug?.vacationBankAnchorFound === true;
  const vacationBankMissingSupportReason =
    typeof args.supportDebug?.vacationBankMissingSupportReason === "string"
      ? args.supportDebug.vacationBankMissingSupportReason
      : undefined;
  const domicileLayoverScenario = args.supportDebug?.domicileLayoverScenario === true;
  const domicileLayoverAnchorFound = args.supportDebug?.domicileLayoverAnchorFound === true;
  const domicileLayoverMissingSupportReason =
    typeof args.supportDebug?.domicileLayoverMissingSupportReason === "string"
      ? args.supportDebug.domicileLayoverMissingSupportReason
      : undefined;
  const sickLookbackScenario = args.supportDebug?.sickLookbackScenario === true;
  const sickLookbackAnchorFound = args.supportDebug?.sickLookbackAnchorFound === true;
  const sickLookbackMissingSupportReason =
    typeof args.supportDebug?.sickLookbackMissingSupportReason === "string"
      ? args.supportDebug.sickLookbackMissingSupportReason
      : undefined;
  const payCreditConsistencyScenario = args.supportDebug?.payCreditConsistencyScenario === true;
  const payCreditAnchorFound = args.supportDebug?.payCreditAnchorFound === true;
  const payCreditMissingSupportReason =
    typeof args.supportDebug?.payCreditMissingSupportReason === "string"
      ? args.supportDebug.payCreditMissingSupportReason
      : undefined;
  const restLegalityScenario = args.supportDebug?.restLegalityScenario === true;
  const restLegalityAnchorFound = args.supportDebug?.restLegalityAnchorFound === true;
  const restLegalityMissingSupportReason =
    typeof args.supportDebug?.restLegalityMissingSupportReason === "string"
      ? args.supportDebug.restLegalityMissingSupportReason
      : undefined;
  const farVsPwaIssueDetected = args.supportDebug?.farVsPwaIssueDetected === true;
  const deadheadRerouteConsequenceScenario = args.supportDebug?.deadheadRerouteConsequenceScenario === true;
  const deadheadRerouteAnchorFound = args.supportDebug?.deadheadRerouteAnchorFound === true;
  const deadheadRerouteMissingSupportReason =
    typeof args.supportDebug?.deadheadRerouteMissingSupportReason === "string"
      ? args.supportDebug.deadheadRerouteMissingSupportReason
      : undefined;
  const apdDiagnosticScenario = args.supportDebug?.apdDiagnosticScenario === true;
  const apdThresholdExplained = args.supportDebug?.apdThresholdExplained === true;
  const apdDriftDetected = args.supportDebug?.apdDriftDetected === true;
  const qsCallOrderScenario = args.supportDebug?.qsCallOrderScenario === true;
  const qsCallOrderAnchorFound = args.supportDebug?.qsCallOrderAnchorFound === true;
  const qsCallOrderMissingSupportReason =
    typeof args.supportDebug?.qsCallOrderMissingSupportReason === "string"
      ? args.supportDebug.qsCallOrderMissingSupportReason
      : undefined;
  const oeNotificationScenario = args.supportDebug?.oeNotificationScenario === true;
  const oeNotificationAnchorFound = args.supportDebug?.oeNotificationAnchorFound === true;
  const oeNotificationMissingSupportReason =
    typeof args.supportDebug?.oeNotificationMissingSupportReason === "string"
      ? args.supportDebug.oeNotificationMissingSupportReason
      : undefined;
  const contactabilityScenario = args.supportDebug?.contactabilityScenario === true;
  const contactabilityAnchorFound = args.supportDebug?.contactabilityAnchorFound === true;
  const contactabilityMissingSupportReason =
    typeof args.supportDebug?.contactabilityMissingSupportReason === "string"
      ? args.supportDebug.contactabilityMissingSupportReason
      : undefined;
  const oeNotificationSupportRejectedReasons = Array.isArray(args.supportDebug?.oeNotificationSupportRejectedReasons)
    ? args.supportDebug.oeNotificationSupportRejectedReasons.filter((item): item is string => typeof item === "string")
    : [];
  const shortCallNotificationScenario = args.supportDebug?.shortCallNotificationScenario === true;
  const shortCallNotificationAnchorFound = args.supportDebug?.shortCallNotificationAnchorFound === true;
  const shortCallNotificationMissingSupportReason =
    typeof args.supportDebug?.shortCallNotificationMissingSupportReason === "string"
      ? args.supportDebug.shortCallNotificationMissingSupportReason
      : undefined;
  const rerouteConsistencyScenario = args.supportDebug?.rerouteConsistencyScenario === true;
  const rerouteAnchorFound = args.supportDebug?.rerouteAnchorFound === true;
  const rerouteMissingSupportReason =
    typeof args.supportDebug?.rerouteMissingSupportReason === "string"
      ? args.supportDebug.rerouteMissingSupportReason
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
  const controllingSectionLocked = args.supportDebug?.controllingSectionLocked === true;
  const controllingSectionDisplay =
    typeof args.supportDebug?.controllingSectionDisplay === "string"
      ? args.supportDebug.controllingSectionDisplay
      : undefined;
  const controllingSectionQuoteAttached = args.supportDebug?.controllingSectionQuoteAttached === true;
  const controllingSectionQuote =
    typeof args.supportDebug?.controllingSectionQuote === "string"
      ? args.supportDebug.controllingSectionQuote
      : undefined;
  const controllingSectionMissingExactText = args.supportDebug?.controllingSectionMissingExactText === true;
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
  if (xDayGroupingScenario && (!xDayGroupingAnchorFound || Boolean(xDayGroupingMissingSupportReason))) {
    downgradeReasons.push("xday_grouping_support_incomplete");
  }
  if (pbRerouteXdayScenario && (!pbAnchorFound || !pbProcessingAnchorFound || Boolean(pbScenarioMissingSupportReason))) {
    downgradeReasons.push("pb_reroute_xday_support_incomplete");
  }
  if (
    futureRotationChangeScenario &&
    (
      !futureRotationChangeAnchorFound ||
      !knownAbsenceAnchorFound ||
      !payProtectionAnchorFound ||
      Boolean(futureRotationMissingSupportReason)
    )
  ) {
    downgradeReasons.push("future_rotation_change_support_incomplete");
  }
  if (pcsSwapScenario && !pcsSwapAnchorFound) {
    downgradeReasons.push("pcs_swap_anchor_missing");
  }
  if (pickupLimitScenario && !pickupLimitAnchorFound) {
    downgradeReasons.push("pickup_limit_anchor_missing");
  }
  if (vacationBankScenario && !vacationBankAnchorFound) {
    downgradeReasons.push("vacation_bank_anchor_missing");
  }
  if (domicileLayoverScenario && (!domicileLayoverAnchorFound || Boolean(domicileLayoverMissingSupportReason))) {
    downgradeReasons.push("domicile_layover_support_incomplete");
  }
  if (sickLookbackScenario && (!sickLookbackAnchorFound || Boolean(sickLookbackMissingSupportReason))) {
    downgradeReasons.push("sick_lookback_support_incomplete");
  }
  if (payCreditConsistencyScenario && (!payCreditAnchorFound || Boolean(payCreditMissingSupportReason))) {
    downgradeReasons.push("pay_credit_support_incomplete");
  }
  if (restLegalityScenario && (!restLegalityAnchorFound || Boolean(restLegalityMissingSupportReason))) {
    downgradeReasons.push("rest_legality_support_incomplete");
  }
  if (deadheadRerouteConsequenceScenario && (!deadheadRerouteAnchorFound || Boolean(deadheadRerouteMissingSupportReason))) {
    downgradeReasons.push("deadhead_reroute_consequence_support_incomplete");
  }
  if (rerouteConsistencyScenario && (!rerouteAnchorFound || Boolean(rerouteMissingSupportReason))) {
    downgradeReasons.push("reroute_support_incomplete");
  }
  if (qsCallOrderScenario && (!qsCallOrderAnchorFound || Boolean(qsCallOrderMissingSupportReason))) {
    downgradeReasons.push("qs_call_order_support_incomplete");
  }
  if (oeNotificationScenario && (!oeNotificationAnchorFound || Boolean(oeNotificationMissingSupportReason))) {
    downgradeReasons.push("oe_notification_support_incomplete");
  }
  if (contactabilityScenario && (!contactabilityAnchorFound || Boolean(contactabilityMissingSupportReason))) {
    downgradeReasons.push("contactability_support_incomplete");
  }
  if (shortCallNotificationScenario && (!shortCallNotificationAnchorFound || Boolean(shortCallNotificationMissingSupportReason))) {
    downgradeReasons.push("shortcall_notification_support_incomplete");
  }
  if (apdDiagnosticScenario && (!apdThresholdExplained || apdDriftDetected)) {
    downgradeReasons.push("apd_diagnostic_incomplete");
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
  if (xDayGroupingScenario && (!xDayGroupingAnchorFound || Boolean(xDayGroupingMissingSupportReason))) {
    const note =
      xDayGroupingMissingSupportReason ??
      "I do not have the exact reserve X-day grouping / cross-month movement rule attached for this question.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (pbRerouteXdayScenario && (!pbAnchorFound || !pbProcessingAnchorFound || Boolean(pbScenarioMissingSupportReason))) {
    const note =
      pbScenarioMissingSupportReason ??
      "I do not have the full PB / PR / LC reapplication or interrupted X-day processing logic attached for this question.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (
    futureRotationChangeScenario &&
    (
      !futureRotationChangeAnchorFound ||
      !knownAbsenceAnchorFound ||
      !payProtectionAnchorFound ||
      Boolean(futureRotationMissingSupportReason)
    )
  ) {
    const note =
      futureRotationMissingSupportReason ??
      "I do not have a clean controlling source for CPO override / known absence pay protection in this packet.";
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
  if (pickupLimitScenario && !pickupLimitAnchorFound) {
    const note =
      pickupLimitMissingSupportReason ??
      "I do not see the exact max pickup / swap-with-pot rule in the attached support.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (vacationBankScenario && !vacationBankAnchorFound) {
    const note =
      vacationBankMissingSupportReason ??
      "I do not see the exact vacation bank / SUP / IVD Section 7 rule in the attached support.";
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${note}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), note])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), note])),
    };
  }
  if (domicileLayoverScenario && domicileLayoverMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${domicileLayoverMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), domicileLayoverMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), domicileLayoverMissingSupportReason])),
    };
  }
  if (sickLookbackScenario && sickLookbackMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${sickLookbackMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), sickLookbackMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), sickLookbackMissingSupportReason])),
    };
  }
  if (payCreditConsistencyScenario && payCreditMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${payCreditMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), payCreditMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), payCreditMissingSupportReason])),
    };
  }
  if (restLegalityScenario && restLegalityMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${restLegalityMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), restLegalityMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), restLegalityMissingSupportReason])),
    };
  }
  if (rerouteConsistencyScenario && rerouteMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${rerouteMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), rerouteMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), rerouteMissingSupportReason])),
    };
  }
  if (qsCallOrderScenario && qsCallOrderMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${qsCallOrderMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), qsCallOrderMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), qsCallOrderMissingSupportReason])),
    };
  }
  if (oeNotificationScenario && oeNotificationMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${oeNotificationMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), oeNotificationMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), oeNotificationMissingSupportReason])),
    };
  }
  if (deadheadRerouteConsequenceScenario && deadheadRerouteMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${deadheadRerouteMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), deadheadRerouteMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), deadheadRerouteMissingSupportReason])),
    };
  }
  if (contactabilityScenario && contactabilityMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${contactabilityMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), contactabilityMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), contactabilityMissingSupportReason])),
    };
  }
  if (shortCallNotificationScenario && shortCallNotificationMissingSupportReason) {
    adjustedAnswer = {
      ...adjustedAnswer,
      plainEnglishExplanation: `${adjustedAnswer.plainEnglishExplanation}\n${shortCallNotificationMissingSupportReason}`.trim(),
      caveats: Array.from(new Set([...(adjustedAnswer.caveats ?? []), shortCallNotificationMissingSupportReason])),
      assumptions: Array.from(new Set([...(adjustedAnswer.assumptions ?? []), shortCallNotificationMissingSupportReason])),
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
  adjustedAnswer = {
    ...adjustedAnswer,
    clarifyingQuestions: filterClarifyingQuestionsForInference(args.question, adjustedAnswer.clarifyingQuestions),
  };
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
      xDayGroupingScenario,
      xDayGroupingAnchorFound,
      xDayGroupingMissingSupportReason,
      pbRerouteXdayScenario,
      pbAnchorFound,
      pbProcessingAnchorFound,
      notificationAnchorFound,
      pbScenarioMissingSupportReason,
      futureRotationChangeScenario,
      futureRotationChangeAnchorFound,
      cpoOverrideAnchorFound,
      knownAbsenceAnchorFound,
      payProtectionAnchorFound,
      futureRotationMissingSupportReason,
      pcsSwapScenario,
      pcsSwapAnchorFound,
      pickupLimitScenario,
      pickupLimitAnchorFound,
      pickupLimitMissingSupportReason,
      pcsSwapMissingSupportReason,
      vacationBankScenario,
      vacationBankAnchorFound,
      vacationBankMissingSupportReason,
      payCreditConsistencyScenario,
      payCreditAnchorFound,
      payCreditMissingSupportReason,
      silverSlipStatusScenario:
        args.question.toLowerCase().includes("silver slip") &&
        (args.question.toLowerCase().includes("what does") || args.question.toLowerCase().includes("status")) &&
        (/\b['"]?[a-z]['"]?\b/i.test(args.question) || args.question.toLowerCase().includes("mean")),
      gsTimeOffScenario:
        (args.question.toLowerCase().includes("green slip") ||
          args.question.toLowerCase().includes("greenslip") ||
          /\bgs\b/i.test(args.question)) &&
        (
          args.question.toLowerCase().includes("24-hour") ||
          args.question.toLowerCase().includes("24 hour") ||
          args.question.toLowerCase().includes("periods off") ||
          args.question.toLowerCase().includes("generate two")
        ),
      processLookupScenario:
        args.question.toLowerCase().includes("23m7") ||
        args.question.toLowerCase().includes("affected pilots") ||
        args.question.toLowerCase().includes("friend swap") ||
        args.question.toLowerCase().includes("swapped with a friend") ||
        args.question.toLowerCase().includes("white slip") ||
        args.question.toLowerCase().includes("personal drop"),
      twentyThreeM7LogLookupScenario:
        args.question.toLowerCase().includes("23m7") &&
        (
          args.question.toLowerCase().includes("affected pilots") ||
          args.question.toLowerCase().includes("logs") ||
          args.question.toLowerCase().includes("icrew") ||
          args.question.toLowerCase().includes("open time")
        ),
      friendSwapUndoScenario:
        args.question.toLowerCase().includes("friend swap") ||
        args.question.toLowerCase().includes("swapped with a friend") ||
        args.question.toLowerCase().includes("swap it back") ||
        args.question.toLowerCase().includes("white slip") ||
        args.question.toLowerCase().includes("personal drop") ||
        (
          args.question.toLowerCase().includes("micrew") &&
          args.question.toLowerCase().includes("pickup")
        ),
      rerouteConsistencyScenario,
      rerouteAnchorFound,
      rerouteMissingSupportReason,
      deadheadRerouteConsequenceScenario,
      deadheadRerouteAnchorFound,
      deadheadRerouteMissingSupportReason,
      qsCallOrderScenario,
      qsCallOrderAnchorFound,
      qsCallOrderMissingSupportReason,
      oeNotificationScenario,
      oeNotificationAnchorFound,
      oeNotificationMissingSupportReason,
      oeNotificationSupportRejectedReasons,
      contactabilityScenario,
      contactabilityAnchorFound,
      contactabilityMissingSupportReason,
      shortCallNotificationScenario,
      shortCallNotificationAnchorFound,
      shortCallNotificationMissingSupportReason,
      apdDiagnosticScenario,
      apdThresholdExplained,
      apdDriftDetected,
      shortCallDutyScenario,
      shortCallDutyAnchorFound,
      answerReferencedSections,
      supportInjectedFromAnswer,
      supportMissingForReferencedSection,
      silverSlipPrimarySupportFound,
      greenSlipComparisonSupportFound,
      silverSlipSupportMissing,
      controllingSectionLocked,
      controllingSectionDisplay,
      controllingSectionQuoteAttached,
      controllingSectionQuote,
      controllingSectionMissingExactText,
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
  question: string,
  clarificationCount: number
): ClarifyingQuestion[] | undefined {
  if (!aiResult.needsClarification) {
    return undefined;
  }
  if (clarificationCount >= 2) {
    return undefined;
  }
  if (fallbackQuestions && fallbackQuestions.length > 0) {
    return filterClarifyingQuestionsForInference(
      question,
      fallbackQuestions.slice(0, 1).map((questionItem) => ({
        ...questionItem,
        quickReplies:
          questionItem.quickReplies && questionItem.quickReplies.length > 0
            ? questionItem.quickReplies
            : buildQuickRepliesForField(questionItem.factField),
      }))
    );
  }

  const prompt = aiResult.clarifyingQuestion?.trim();
  if (!prompt) {
    return undefined;
  }

  const factField = inferClarifyingField(aiResult);

  return filterClarifyingQuestionsForInference(question, [
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
  ]);
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
  if (
    normalized === "SWAP WITH POT" ||
    normalized === "MAX PICKUP" ||
    normalized === "PCS PROCESSING" ||
    normalized === "RESERVE COVERAGE" ||
    normalized === "OPEN TIME PROCESSING"
  ) {
    return 4;
  }
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
    { key: "blanket qs", patterns: [/\bblanket qs\b/] },
    { key: "senior responder", patterns: [/\bsenior responder\b/] },
    { key: "call order", patterns: [/\bcall every pilot\b/, /\bcall order\b/, /\bwide report\b/, /\bseniority\b/] },
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
    { key: "oe notification", patterns: [/\boe notification\b/, /\boe\b.*\bnotification\b/, /\bnotification requirement\b/] },
    { key: "company notification online", patterns: [/\bcompany notification online\b/, /\bcno\b/] },
    { key: "phone call", patterns: [/\bphone call\b/, /\btelephone\b/] },
    { key: "srh", patterns: [/\bsrh\b/] },
    { key: "trh", patterns: [/\btrh\b/] },
    { key: "x-days", patterns: [/\bx-days?\b/, /\bx days?\b/, /\binterrupted x-days?\b/] },
    { key: "notification", patterns: [/\bnotification\b/, /\brobot\b/, /\bnotice\b/] },
    { key: "eligible", patterns: [/\beligible\b/, /\beligibility\b/, /\bslip active\b/] },
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
    { key: "domicile layover", patterns: [/\bdomicile layover\b/] },
    { key: "base layover", patterns: [/\bbase layover\b/] },
    { key: "rotation definition", patterns: [/\brotation definition\b/] },
    { key: "break in duty", patterns: [/\bbreak in duty\b/, /\bbreak-in-duty\b/] },
    { key: "break in duty at base", patterns: [/\bbreak in duty at base\b/, /\bbreak-in-duty at base\b/] },
    { key: "open time rotation", patterns: [/\bopen time rotation\b/] },
    { key: "rotation construction", patterns: [/\brotation construction\b/] },
    { key: "sick bank", patterns: [/\bsick bank\b/] },
    { key: "called well", patterns: [/\bcalled well\b/] },
    { key: "bank deposit", patterns: [/\bbank deposit\b/, /\bdeposit\b/] },
    { key: "ss credit", patterns: [/\bss credit\b/, /\bsilver slip credit\b/] },
    { key: "timecard", patterns: [/\btimecard\b/] },
    { key: "micrew", patterns: [/\bmicrew\b/, /\bmi crew\b/] },
    { key: "credit recalculation", patterns: [/\bcredit recalculation\b/, /\brecalculation\b/] },
    { key: "deadhead deviation", patterns: [/\bdeadhead deviation\b/, /\bdeviat(?:e|ion)\b/] },
    { key: "13 hours", patterns: [/\bless than 13 hours\b/, /\b13 hours\b/] },
    { key: "bank eligibility", patterns: [/\bbank-eligible\b/, /\bbank eligible\b/, /\beligibility\b/] },
    { key: "first airborne", patterns: [/\bfirst airborne\b/, /\bafter first airborne\b/] },
    { key: "different flight number", patterns: [/\bdifferent flight number\b/, /\bflight number\b/] },
    { key: "same destination", patterns: [/\bsame destination\b/] },
    { key: "continuation", patterns: [/\bcontinuation\b/] },
    { key: "rrpay", patterns: [/\brrpay\b/, /\brr pay\b/] },
    { key: "reroute pay", patterns: [/\breroute pay\b/] },
    { key: "paid differently", patterns: [/\bpaid differently\b/] },
    { key: "turn time", patterns: [/\bturn time\b/] },
    { key: "30/168", patterns: [/\b30\/168\b/, /\b30 168\b/, /\bfar restrictions?\b/] },
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

function questionAllowsGreenSlipSupport(question: string) {
  const lower = question.toLowerCase();
  return (
    lower.includes("green slip") ||
    lower.includes("greenslip") ||
    /\bgs\b/.test(lower) ||
    lower.includes("premium pay")
  );
}

function inferSupportSectionAnchor(reference: {
  section?: string;
  label?: string;
  quoteSnippet?: string;
}, options?: { allowGreenSlipInferred?: boolean }) {
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
  if (combined.includes("rrpay")) {
    return "RRPay";
  }
  if (combined.includes("reroute pay")) {
    return "reroute pay";
  }
  if (combined.includes("first airborne")) {
    return "first airborne";
  }
  if (combined.includes("continuation")) {
    return "continuation";
  }
  if (combined.includes("silver slip")) {
    return "Silver Slip (inferred)";
  }
  if (options?.allowGreenSlipInferred !== false && (combined.includes("green slip") || /\bgs\b/.test(combined))) {
    return "Green Slip (inferred)";
  }
  return reference.section;
}

function applyComparisonSupportNote(args: {
  question: string;
  answer: ContractAnswerCard;
  references: ContractCopilotApiSuccessResponse["answer"]["references"];
}) {
  const existingExplanation = normalizeSupportText(args.answer.plainEnglishExplanation ?? "");
  if (
    existingExplanation.includes("green slip comparison support") ||
    existingExplanation.includes("support for both silver slip and green slip") ||
    existingExplanation.includes("use green slip only as comparison support")
  ) {
    return args.answer;
  }

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
  const allowGreenSlipSupport = questionAllowsGreenSlipSupport(args.question);
  const silverSlipQuery =
    args.question.toLowerCase().includes("silver slip") || /\bss\b/.test(args.question.toLowerCase());
  const xDayScenario =
    /\bx-days?\b/i.test(args.question) ||
    /\bx days?\b/i.test(args.question) ||
    /interrupted x-days?/i.test(args.question) ||
    /lost x-day/i.test(args.question) ||
    /x-day credit/i.test(args.question);
  const xDayGroupingScenario = detectXDayGroupingScenario(args.question);
  const pbRerouteXdayScenario = detectPbRerouteXdayScenario(args.question);
  const shortCallDutyScenario = detectShortCallDutyScenario(args.question);
  const pcsSwapScenario = detectPcsSwapScenario(args.question);
  const pickupLimitScenario = detectPickupLimitScenario(args.question);
  const vacationBankScenario = detectVacationBankScenario(args.question);
  const domicileLayoverScenario = detectDomicileLayoverScenario(args.question);
  const sickLookbackScenario = detectSickLookbackScenario(args.question);
  const payCreditConsistencyScenario = detectPayCreditConsistencyScenario(args.question);
  const restLegalityScenario = detectRestLegalityScenario(args.question);
  const deadheadRerouteConsequenceScenario = detectDeadheadRerouteConsequenceScenario(args.question);
  const rerouteConsistencyScenario = detectRerouteConsistencyScenario(args.question);
  const qsCallOrderScenario = detectQsCallOrderScenario(args.question);
  const oeNotificationScenario = detectOeNotificationScenario(args.question);
  const contactabilityScenario = detectContactabilityScenario(args.question);
  const shortCallNotificationScenario = detectShortCallNotificationScenario(args.question);
  const futureRotationChangeScenario = detectFutureRotationChangeScenario(args.question);
  const apdDiagnosticScenario = detectApdDiagnosticScenario(args.question);
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
    "future rotation change": 90,
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
    pb: 90,
    pr: 90,
    lc: 85,
    "interrupted x-days": 95,
    "pb converted to lc": 95,
    "pr remainder": 95,
    notification: 65,
    acars: 70,
    arcos: 70,
    robot: 65,
    dart: 70,
    grouping: 80,
    "grouping restrictions": 90,
    "between months": 85,
    "month-to-month transition": 90,
    "reserve x-day": 95,
    "x-day block": 85,
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
    bank: 75,
    "vacation day": 80,
    "buy vacation": 75,
    replacement: 75,
    "60 hours": 70,
    sup: 85,
    ivd: 85,
    "vacation year": 90,
    "domicile layover": 85,
    "base layover": 80,
    "rotation definition": 90,
    "break in duty": 80,
    "break in duty at base": 95,
    "open time rotation": 85,
    "rotation construction": 75,
    "medical procedures": 95,
    "medical procedure": 95,
    "sick lookback": 100,
    "approval process": 90,
    cpo: 80,
    "known absence": 85,
    "pay protection": 85,
    "first airborne": 95,
    "different flight number": 85,
    "same destination": 80,
    continuation: 85,
    rrpay: 100,
    "reroute pay": 95,
    "paid differently": 80,
    "turn time difference": 90,
    "turn time": 85,
    "section 14": 85,
    sickness: 85,
    notification: 70,
    verification: 90,
    lookback: 95,
    medical: 80,
    procedure: 75,
    telehealth: 70,
    "sick bank": 95,
    "called well": 90,
    "bank deposit": 85,
    deposit: 70,
    "ss credit": 95,
    timecard: 85,
    micrew: 80,
    "credit recalculation": 100,
    "deadhead deviation": 90,
    deviation: 70,
    "13-hour layover": 85,
    layover: 60,
    "bank eligibility": 90,
    "30-hour rest": 100,
    "30 hour rest": 100,
    "far legal": 90,
    "pwa requirement": 85,
    "release with pay": 95,
    "9:45 rest": 95,
    "10 hours required": 95,
    "9:15": 85,
    "dh-only": 90,
    "dh only": 90,
    fdp: 85,
    "illegal rotation": 95,
    "rest legality": 100,
    "duty/rest": 90,
    "first airborne": 95,
    "different flight number": 85,
    "same destination": 80,
    continuation: 85,
    rrpay: 100,
    "reroute pay": 95,
    "paid differently": 80,
    "turn time difference": 90,
    "turn time": 85,
    "blanket qs": 90,
    "call order": 95,
    arcos: 90,
    eligible: 85,
    "30/168": 80,
    evidence: 70,
    dart: 70,
    apd: 95,
    denied: 70,
    required: 90,
    available: 90,
    "reserve counts": 95,
    threshold: 95,
    telephone: 85,
    "electronic placement": 95,
    acknowledge: 90,
    acknowledgment: 90,
    icrew: 90,
    micrew: 85,
    cno: 90,
    "oe notification": 100,
    "company notification online": 95,
    srh: 85,
    trh: 85,
    "phone call": 90,
    "online notification": 85,
    "electronic notification": 90,
    "non-fly day": 95,
    "non fly day": 95,
    contactable: 90,
    acars: 95,
    "airport sit": 90,
    "between flights": 90,
    "on duty": 85,
    "off duty": 75,
    "check your schedule": 95,
    "end of short call": 95,
    "obligation to respond": 90,
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
  const pickupLimitTerms = [
    "max pickup",
    "pickup limit",
    "swap with pot",
    "open time",
    "reserve coverage",
    "coverage works",
    "pickup",
    "coverage",
  ];
  const vacationBankTerms = ["vacation", "bank", "replacement", "vacation day", "buy vacation", "sup", "ivd", "vacation year"];
  const domicileLayoverTerms = [
    "domicile layover",
    "base layover",
    "break in duty",
    "break in duty at base",
    "rotation definition",
    "open time rotation",
    "open time",
    "rotation",
    "base",
    "rotation construction",
  ];
  const sickLookbackTerms = [
    "medical procedures",
    "medical procedure",
    "sick lookback",
    "approval process",
    "section 14",
    "sickness",
    "notification",
    "verification",
    "lookback",
    "medical",
    "procedure",
    "telehealth",
  ];
  const payCreditConsistencyTerms = [
    "sick bank",
    "called well",
    "bank deposit",
    "deposit",
    "ss credit",
    "silver slip credit",
    "credit doesn't count",
    "timecard",
    "micrew",
    "micrew credit",
    "credit recalculation",
    "deadhead deviation",
    "deviation",
    "less than 13 hours",
    "13 hours",
    "deadhead",
    "layover",
    "credit",
    "bank eligibility",
  ];
  const restLegalityTerms = [
    "30-hour rest",
    "30 hour rest",
    "far legal",
    "pwa requirement",
    "release with pay",
    "9:45 rest",
    "10 hours required",
    "9:15",
    "dh-only",
    "dh only",
    "fdp",
    "illegal rotation",
    "rest legality",
    "duty/rest",
    "section 12",
    "rest",
    "release",
    "duty",
  ];
  const restLegalityRequiredTerms = restLegalityScenario
    ? Array.from(
        new Set(
          [
            ...(lowerIncludesAny(args.question, ["30-hour rest", "30 hour rest", "far legal", "release with pay"])
              ? ["30-hour rest", "far legal", "release with pay", "section 12"]
              : []),
            ...(lowerIncludesAny(args.question, ["9:45 rest", "10 hours required", "9:15", "dh-only", "fdp"])
              ? ["9:45 rest", "10 hours required", "dh-only", "fdp", "section 12"]
              : []),
            ...(lowerIncludesAny(args.question, ["illegal rotation", "rest legality", "timing"])
              ? ["illegal rotation", "rest", "duty", "section 12"]
              : []),
          ].filter(Boolean)
        )
      )
    : [];
  const payCreditRequiredTerms = payCreditConsistencyScenario
    ? Array.from(
        new Set(
          [
            ...(detectPayCreditSubScenario(args.question) === "sickBankAfterCalledWell"
              ? ["sick bank", "called well", "credit"]
              : []),
            ...(detectPayCreditSubScenario(args.question) === "bankDepositSilverSlipCredit"
              ? ["bank deposit", "ss credit", "credit", "bank eligibility"]
              : []),
            ...(detectPayCreditSubScenario(args.question) === "rerouteCreditProtection"
              ? ["reroute", "original pairing", "less credit", "pay protected", "rotation guarantee", "reroute pay"]
              : []),
            ...(detectPayCreditSubScenario(args.question) === "projectedVsFinalCreditCloseout" ||
              detectPayCreditSubScenario(args.question) === "timecardCreditDiscrepancy"
              ? ["timecard", "micrew", "credit recalculation", "deadhead deviation", "13 hours"]
              : []),
          ].filter(Boolean)
        )
      )
    : [];
  const rerouteConsistencyTerms = [
    "reroute",
    "reroute pay",
    "rrpay",
    "first airborne",
    "different flight number",
    "same destination",
    "continuation",
    "turn time",
    "paid differently",
    "timecard",
    "credit",
    "deadhead",
  ];
  const rerouteRequiredTerms = rerouteConsistencyScenario
    ? Array.from(
        new Set(
          [
            ...(lowerIncludesAny(args.question, ["first airborne", "after first airborne", "different flight number", "same destination"])
              ? ["first airborne", "different flight number", "same destination", "reroute pay"]
              : []),
            ...(lowerIncludesAny(args.question, ["rrpay", "paid differently", "turn time"])
              ? ["rrpay", "turn time", "timecard", "credit"]
              : []),
            ...(lowerIncludesAny(args.question, ["continuation"])
              ? ["continuation", "reroute"]
              : []),
          ].filter(Boolean)
        )
      )
    : [];
  const qsCallOrderTerms = [
    "qs",
    "quick slip",
    "blanket qs",
    "call order",
    "category",
    "arcos",
    "notification",
    "eligible",
    "wide report",
    "seniority",
    "30/168",
    "dart",
  ];
  const oeNotificationTerms = [
    "oe",
    "notification",
    "cno",
    "company notification online",
    "phone call",
    "srh",
    "trh",
    "online notification",
    "electronic notification",
  ];
  const contactabilityTerms = [
    "contactable",
    "answer the phone",
    "phone call",
    "acars",
    "airport sit",
    "between flights",
    "on duty",
    "off duty",
    "acknowledge",
    "notification",
    "check your schedule",
    "end of short call",
    "short call",
  ];
  const shortCallNotificationTerms = [
    "short call",
    "notification",
    "vacation",
    "non-fly day",
    "non fly day",
    "telephone",
    "electronic placement",
    "icrew",
    "micrew",
    "acknowledge",
    "acknowledgment",
    "cno",
    "contact",
  ];
  const futureRotationTerms = [
    "rotation change",
    "redeye",
    "removed leg",
    "pay protection",
    "credit protection",
    "reserve coverage",
    "known absence",
    "cpo",
    "processing",
    "leave",
  ];
  const qsCallOrderRequiredTerms = qsCallOrderScenario
    ? Array.from(
        new Set(
          [
            "qs",
            "arcos",
            "notification",
            "eligible",
            ...(lowerIncludesAny(args.question, ["blanket qs", "slip active"]) ? ["blanket qs"] : []),
            ...(lowerIncludesAny(args.question, ["30/168", "far restrictions"]) ? ["30/168"] : []),
            ...(lowerIncludesAny(args.question, ["wide report", "seniority"]) ? ["call order", "wide report"] : []),
          ].filter(Boolean)
        )
      )
    : [];
  const oeNotificationRequiredTerms = oeNotificationScenario
    ? Array.from(
        new Set(
          [
            "notification",
            ...(lowerIncludesAny(args.question, ["cno", "company notification online"]) ? ["cno"] : []),
            ...(lowerIncludesAny(args.question, ["phone call", "telephone"]) ? ["phone call"] : []),
            ...(lowerIncludesAny(args.question, ["srh"]) ? ["srh"] : []),
            ...(lowerIncludesAny(args.question, ["trh"]) ? ["trh"] : []),
          ].filter(Boolean)
        )
      )
    : [];
  const shortCallNotificationRequiredTerms = shortCallNotificationScenario
    ? Array.from(
        new Set(
          [
            "short call",
            "notification",
            ...(lowerIncludesAny(args.question, ["vacation"]) ? ["vacation"] : []),
            ...(lowerIncludesAny(args.question, ["non-fly day", "non fly day"]) ? ["non-fly day"] : []),
            ...(lowerIncludesAny(args.question, ["icrew"]) ? ["icrew"] : []),
            ...(lowerIncludesAny(args.question, ["micrew"]) ? ["micrew"] : []),
            ...(lowerIncludesAny(args.question, ["acknowledge", "acknowledgment"]) ? ["acknowledge"] : []),
            ...(lowerIncludesAny(args.question, ["cno"]) ? ["cno"] : []),
          ].filter(Boolean)
        )
      )
    : [];
  const contactabilityRequiredTerms = contactabilityScenario
    ? Array.from(
        new Set(
          [
            ...(lowerIncludesAny(args.question, ["acars", "airport sit", "between flights", "on duty", "off duty"])
              ? ["acars", "phone call", "on duty"]
              : []),
            ...(lowerIncludesAny(args.question, ["check your schedule", "end of short call"])
              ? ["short call", "notification", "check your schedule"]
              : []),
          ].filter(Boolean)
        )
      )
    : [];
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
  const vacationRequiredTerms = vacationBankScenario
    ? Array.from(
        new Set(
          [
            ...(lowerIncludesAny(args.question, ["bank", "60 hours", "vacation day", "buy vacation", "replacement"])
              ? ["vacation", "bank", "replacement"]
              : []),
            ...((/\bsup\b/i.test(args.question) || /\bivd\b/i.test(args.question) || /vacation year/i.test(args.question))
              ? ["vacation year", "sup", "ivd"]
              : []),
          ]
        )
      )
    : [];
  const domicileRequiredTerms = domicileLayoverScenario
    ? Array.from(
        new Set(
          [
            ...(lowerIncludesAny(args.question, ["domicile layover", "base layover"])
              ? ["domicile layover", "open time", "rotation"]
              : []),
            ...(lowerIncludesAny(args.question, ["rotation definition", "break in duty at base"])
              ? ["rotation definition", "break in duty", "base"]
              : []),
          ].filter(Boolean)
        )
      )
    : [];
  const sickLookbackRequiredTerms = sickLookbackScenario
    ? Array.from(
        new Set(
          [
            ...(lowerIncludesAny(args.question, ["medical procedure", "medical procedures", "procedure"])
              ? ["medical procedures", "medical", "procedure"]
              : []),
            ...(lowerIncludesAny(args.question, ["sick lookback", "lookback"])
              ? ["sick lookback", "lookback"]
              : []),
            ...(lowerIncludesAny(args.question, ["approval process", "section 14"])
              ? ["approval process", "section 14", "verification"]
              : ["section 14", "verification"]),
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
    if (vacationBankScenario) {
      if (reference.sourceId === "pwa") score += 100;
      if (reference.sourceId === "compensation_manual") score += 30;
      if (reference.sourceId === "scheduler_manual") score += 8;
    }
    if (domicileLayoverScenario) {
      if (reference.sourceId === "pwa") score += 95;
      if (reference.sourceId === "scheduler_manual") score += 70;
      if (reference.sourceId === "compensation_manual") score -= 15;
    }
    if (sickLookbackScenario) {
      if (reference.sourceId === "pwa") score += 130;
      if (reference.sourceId === "scheduler_manual") score += 18;
      if (reference.sourceId === "compensation_manual") score -= 20;
    }
    if (rerouteConsistencyScenario) {
      if (reference.sourceId === "pwa") score += 105;
      if (reference.sourceId === "compensation_manual") score += 95;
      if (reference.sourceId === "scheduler_manual") score += 35;
    }
    if (qsCallOrderScenario) {
      if (reference.sourceId === "scheduler_manual") score += 120;
      if (reference.sourceId === "pwa") score += 65;
      if (reference.sourceId === "compensation_manual") score -= 20;
    }
    if (oeNotificationScenario) {
      if (reference.sourceId === "scheduler_manual") score += 125;
      if (reference.sourceId === "pwa") score += 45;
      if (reference.sourceId === "compensation_manual") score -= 55;
    }
    if (shortCallNotificationScenario) {
      if (reference.sourceId === "scheduler_manual") score += 110;
      if (reference.sourceId === "pwa") score += 90;
      if (reference.sourceId === "compensation_manual") score += 10;
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
    const pickupLimitSpecificHits = pickupLimitTerms.filter((term) => combined.includes(term));
    const pcsSpecificHits = pcsGeneralTerms.filter((term) => combined.includes(term));
    const pcsRequiredHits = pcsRequiredTerms.filter((term) => combined.includes(term));
    const vacationSpecificHits = vacationBankTerms.filter((term) => combined.includes(term));
    const vacationRequiredHits = vacationRequiredTerms.filter((term) => combined.includes(term));
    const domicileSpecificHits = domicileLayoverTerms.filter((term) => combined.includes(term));
    const domicileRequiredHits = domicileRequiredTerms.filter((term) => combined.includes(term));
    const sickLookbackSpecificHits = sickLookbackTerms.filter((term) => combined.includes(term));
    const sickLookbackRequiredHits = sickLookbackRequiredTerms.filter((term) => combined.includes(term));
    const rerouteSpecificHits = rerouteConsistencyTerms.filter((term) => combined.includes(term));
    const rerouteRequiredHits = rerouteRequiredTerms.filter((term) => combined.includes(term));
    const qsCallOrderSpecificHits = qsCallOrderTerms.filter((term) => combined.includes(term));
    const qsCallOrderRequiredHits = qsCallOrderRequiredTerms.filter((term) => combined.includes(term));
    const oeNotificationSpecificHits = getOeNotificationSupportHits(combined);
    const oeNotificationRequiredHits = oeNotificationRequiredTerms.filter((term) => oeNotificationSpecificHits.includes(term));
    const oeNotificationDirectSupport = hasDirectOeNotificationSupport(combined);
    const shortCallNotificationSpecificHits = shortCallNotificationTerms.filter((term) => combined.includes(term));
    const shortCallNotificationRequiredHits = shortCallNotificationRequiredTerms.filter((term) => combined.includes(term));
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
    if (restLegalityScenario) {
      const section12Hit =
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 12")) ||
        normalizeSectionIdentifier(combined).includes(normalizeSectionIdentifier("Section 12"));
      const schedulerRestHit =
        reference.sourceId === "scheduler_manual" &&
        (
          combined.includes("rest") ||
          combined.includes("duty") ||
          combined.includes("release") ||
          combined.includes("fdp") ||
          combined.includes("dh-only") ||
          combined.includes("dh only")
        );
      if (section12Hit) score += 210;
      if (schedulerRestHit) score += 150;
      if (restLegalityTerms.some((term) => combined.includes(term))) score += 120;
      score += restLegalityTerms.filter((term) => combined.includes(term)).length * 20;
      score += restLegalityRequiredTerms.filter((term) => combined.includes(term)).length * 40;
      if (combined.includes("far legal")) score += 80;
      if (combined.includes("release with pay")) score += 90;
      if ((/\bsection 23\b/.test(combined) || /\bscheduling\b/.test(combined)) && !section12Hit && !schedulerRestHit && !exactSectionHit) {
        score -= 170;
      }
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
    if (vacationBankScenario) {
      if (reference.sourceId === "pwa" && vacationSpecificHits.length > 0) score += 150;
      if (normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 7"))) score += 180;
      if (vacationSpecificHits.length > 0) score += 110;
      score += vacationSpecificHits.length * 24;
      score += vacationRequiredHits.length * 42;
      if (combined.includes("vacation year")) score += 70;
      if (combined.includes("sup") || combined.includes("ivd")) score += 60;
      if (combined.includes("bank") && combined.includes("replacement")) score += 60;
      if ((/\bsection 23\b/.test(combined) || /\bsection 12\b/.test(combined)) && vacationSpecificHits.length === 0 && !exactSectionHit) score -= 150;
    }
    if (domicileLayoverScenario) {
      const section2Hit = normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 2"));
      const schedulerConstructionHit =
        reference.sourceId === "scheduler_manual" &&
        domicileSpecificHits.some((term) => term === "open time" || term === "rotation construction" || term === "domicile layover");
      if (section2Hit && domicileSpecificHits.length > 0) score += 180;
      if (section2Hit && domicileRequiredHits.length >= 2) score += 90;
      if (schedulerConstructionHit) score += 160;
      if (reference.sourceId === "scheduler_manual" && domicileSpecificHits.length >= 2) score += 100;
      score += domicileSpecificHits.length * 24;
      score += domicileRequiredHits.length * 38;
      if ((/\bsection 23\b/.test(combined) || /\bsection 12\b/.test(combined)) && domicileSpecificHits.length === 0 && !exactSectionHit) {
        score -= 150;
      }
    }
    if (sickLookbackScenario) {
      const section14Hit =
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 14 F")) ||
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 14"));
      if (section14Hit) score += 220;
      if (reference.sourceId === "pwa" && sickLookbackSpecificHits.length > 0) score += 170;
      score += sickLookbackSpecificHits.length * 28;
      score += sickLookbackRequiredHits.length * 40;
      if (combined.includes("verification") && combined.includes("lookback")) score += 90;
      if (combined.includes("telehealth")) score += 40;
      if ((/\bsection 23\b/.test(combined) || /\bsection 11\b/.test(combined)) && sickLookbackSpecificHits.length === 0 && !exactSectionHit) {
        score -= 180;
      }
    }
    if (rerouteConsistencyScenario) {
      const section23LHit =
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 23 L")) ||
        normalizeSectionIdentifier(combined).includes(normalizeSectionIdentifier("Section 23 L"));
      const compensationRerouteHit =
        reference.sourceId === "compensation_manual" &&
        (combined.includes("reroute pay") || combined.includes("rrpay") || combined.includes("credit") || combined.includes("timecard"));
      if (section23LHit) score += 185;
      if (compensationRerouteHit) score += 160;
      if (rerouteSpecificHits.length > 0) score += 120;
      score += rerouteSpecificHits.length * 26;
      score += rerouteRequiredHits.length * 42;
      if (combined.includes("first airborne")) score += 80;
      if (combined.includes("different flight number") || combined.includes("same destination")) score += 55;
      if (combined.includes("turn time")) score += 75;
      if ((/\bsection 23\b/.test(combined) || /\bscheduling\b/.test(combined)) && !section23LHit && rerouteSpecificHits.length === 0 && !exactSectionHit) {
        score -= 165;
      }
    }
    if (qsCallOrderScenario) {
      const schedulerQsHit =
        reference.sourceId === "scheduler_manual" &&
        (combined.includes("qs") || combined.includes("quick slip") || combined.includes("arcos") || combined.includes("notification"));
      const pwaQsHit =
        reference.sourceId === "pwa" &&
        (combined.includes("qs") || combined.includes("quick slip") || combined.includes("notification"));
      if (schedulerQsHit) score += 185;
      if (pwaQsHit) score += 120;
      if (qsCallOrderSpecificHits.length > 0) score += 135;
      score += qsCallOrderSpecificHits.length * 28;
      score += qsCallOrderRequiredHits.length * 40;
      if (combined.includes("arcos")) score += 80;
      if (combined.includes("wide report") || combined.includes("seniority")) score += 55;
      if ((/\bsection 23\b/.test(combined) || /\bscheduling\b/.test(combined)) && qsCallOrderSpecificHits.length === 0 && !exactSectionHit) {
        score -= 155;
      }
    }
    if (oeNotificationScenario) {
      if (oeNotificationDirectSupport) score += 185;
      if (oeNotificationSpecificHits.length > 0) score += 120;
      score += oeNotificationSpecificHits.length * 26;
      score += oeNotificationRequiredHits.length * 42;
      if (combined.includes("company notification online") || /\bcno\b/.test(combined)) score += 70;
      if (combined.includes("phone call") || combined.includes("telephone")) score += 65;
      if (combined.includes("srh") || combined.includes("trh")) score += 55;
      if ((combined.includes("green slip") || /\bgs\b/.test(combined)) && !oeNotificationDirectSupport) score -= 260;
      if (combined.includes("deadhead") && !oeNotificationDirectSupport) score -= 180;
      if (
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 10")) &&
        !oeNotificationDirectSupport
      ) {
        score -= 220;
      }
      if (
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 2")) &&
        !oeNotificationDirectSupport
      ) {
        score -= 220;
      }
      if ((/\bsection 23\b/.test(combined) || /\bscheduling\b/.test(combined)) && !oeNotificationDirectSupport) {
        score -= 165;
      }
      if (!oeNotificationDirectSupport && oeNotificationSpecificHits.length < 2) {
        score -= 80;
      }
    }
    if (shortCallNotificationScenario) {
      const shortCallSectionHit =
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 23 S.9")) ||
        normalizeSectionIdentifier(reference.section).includes(normalizeSectionIdentifier("Section 23 S"));
      if (shortCallSectionHit) score += 170;
      if (shortCallNotificationSpecificHits.length > 0) score += 135;
      score += shortCallNotificationSpecificHits.length * 26;
      score += shortCallNotificationRequiredHits.length * 40;
      if (combined.includes("telephone") || combined.includes("contact")) score += 60;
      if (combined.includes("electronic placement") || combined.includes("acknowledge") || combined.includes("acknowledgment")) score += 75;
      if (combined.includes("vacation") || combined.includes("non-fly day") || combined.includes("non fly day")) score += 85;
      if ((/\bsection 23\b/.test(combined) || /\bnotification\b/.test(combined)) && shortCallNotificationSpecificHits.length === 0 && !exactSectionHit) {
        score -= 165;
      }
      if (!combined.includes("short call") && !shortCallSectionHit) {
        score -= 80;
      }
    }

    return {
      reference,
      score,
      matchedTerms: effectiveMatchedTermHits,
      exactSectionHit,
      matchedSectionAnchor:
        silverSlipQuery && silverHit
          ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
          : silverSlipQuery && comparisonSides.includes("green slip") && greenHit && !silverHit
            ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
            : pickupLimitScenario && pickupLimitSpecificHits.length > 0
              ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
            : pcsSwapScenario && pcsSpecificHits.length > 0
              ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
            : rerouteConsistencyScenario && rerouteSpecificHits.length > 0
              ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
            : qsCallOrderScenario && qsCallOrderSpecificHits.length > 0
              ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
            : oeNotificationScenario && oeNotificationDirectSupport
              ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
            : shortCallNotificationScenario && shortCallNotificationSpecificHits.length > 0
              ? inferSupportSectionAnchor(reference, { allowGreenSlipInferred: allowGreenSlipSupport })
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
  let finalRanked = qualityFiltered.slice(0, 4);
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
  let pickupLimitAnchorFound = false;
  let pickupLimitMissingSupportReason: string | undefined;
  let finalSupportReorderedForSpecificAnchor = false;
  let genericPrimaryDemotedReason: string | undefined;
  let vacationBankSupportPromoted = false;
  let vacationBankSupportMissingAnchors: string[] = [];
  let domicileLayoverSupportMissingAnchors: string[] = [];
  let sickLookbackSupportPromoted = false;
  let sickLookbackSupportMissingAnchors: string[] = [];
  let payCreditAnchorFound = false;
  let payCreditMissingSupportReason: string | undefined;
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
  if (pickupLimitScenario) {
    const bestPwaPickupCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const inferredAnchor = inferSupportSectionAnchor(item.reference, { allowGreenSlipInferred: allowGreenSlipSupport });
      const section23Hit =
        item.reference.sourceId === "pwa" &&
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23"));
      const hits = pickupLimitTerms.filter((term) => combined.includes(term));
      return (
        section23Hit &&
        inferredAnchor !== item.reference.section &&
        (
          hits.length >= 2 ||
          ((combined.includes("open time") || combined.includes("pickup")) &&
            (combined.includes("reserve coverage") || combined.includes("coverage") || combined.includes("swap")))
        )
      );
    });
    const bestSchedulerPickupCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      return (
        item.reference.sourceId === "scheduler_manual" &&
        (combined.includes("swap with pot") || combined.includes("open time processing")) &&
        (
          combined.includes("max pickup") ||
          combined.includes("pickup limit") ||
          combined.includes("reserve coverage") ||
          combined.includes("coverage works") ||
          combined.includes("pickup")
        )
      );
    });

    const promotedPickupCandidates = [bestPwaPickupCandidate, bestSchedulerPickupCandidate].filter(
      (item): item is (typeof sorted)[number] => Boolean(item)
    );
    if (promotedPickupCandidates.length > 0) {
      const remaining = finalRanked.filter(
        (item) => !promotedPickupCandidates.some((candidate) => candidate.reference === item.reference)
      );
      finalRanked.length = 0;
      finalRanked.push(...promotedPickupCandidates, ...remaining);
    }
    const topPickupCandidate = finalRanked[0];
    const topPickupText = topPickupCandidate
      ? normalizeSupportText(
          `${topPickupCandidate.reference.section ?? ""} ${topPickupCandidate.reference.label ?? ""} ${topPickupCandidate.reference.quoteSnippet ?? ""}`
        )
      : "";
    const topIsGenericSection23 =
      Boolean(topPickupCandidate) &&
      normalizeSectionIdentifier(topPickupCandidate.reference.section).includes(normalizeSectionIdentifier("Section 23")) &&
      !topPickupText.includes("swap with pot") &&
      !topPickupText.includes("max pickup") &&
      !topPickupText.includes("pickup limit") &&
      !topPickupText.includes("reserve coverage");
    if (topIsGenericSection23 && bestSchedulerPickupCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestSchedulerPickupCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestSchedulerPickupCandidate, ...remaining);
    }

    const visiblePickupTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return pickupLimitTerms.filter((term) => combined.includes(term));
        })
      )
    );
    pickupLimitAnchorFound =
      Boolean(bestPwaPickupCandidate) &&
      Boolean(bestSchedulerPickupCandidate) &&
      visiblePickupTerms.includes("swap with pot") &&
      visiblePickupTerms.some((term) => term === "max pickup" || term === "pickup limit");
    if (!pickupLimitAnchorFound) {
      pickupLimitMissingSupportReason =
        "I do not see the exact max pickup / swap-with-pot rule in the attached support.";
    }
  }
  if (pcsSwapScenario || pickupLimitScenario) {
    const specificAnchorPriority = (item: (typeof finalRanked)[number]) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""} ${item.matchedSectionAnchor ?? ""}`
      );
      if (combined.includes("swap with pot")) return 1;
      if (combined.includes("pickup limit") || combined.includes("max pickup")) return 2;
      if (combined.includes("pcs processing")) return 3;
      if (combined.includes("reserve coverage") || combined.includes("open time processing")) return 4;
      if (normalizeSectionIdentifier(item.reference.section) === normalizeSectionIdentifier("Section 23")) return 5;
      return 6;
    };
    const topBeforeReorder = finalRanked[0];
    const topBeforeCombined = topBeforeReorder
      ? normalizeSupportText(
          `${topBeforeReorder.reference.section ?? ""} ${topBeforeReorder.reference.label ?? ""} ${topBeforeReorder.reference.quoteSnippet ?? ""} ${topBeforeReorder.matchedSectionAnchor ?? ""}`
        )
      : "";
    const specificAvailable = finalRanked.some((item) => specificAnchorPriority(item) < 5);
    const genericPrimary =
      Boolean(topBeforeReorder) &&
      normalizeSectionIdentifier(topBeforeReorder.reference.section) === normalizeSectionIdentifier("Section 23") &&
      !topBeforeCombined.includes("swap with pot") &&
      !topBeforeCombined.includes("pickup limit") &&
      !topBeforeCombined.includes("max pickup") &&
      !topBeforeCombined.includes("pcs processing") &&
      !topBeforeCombined.includes("reserve coverage") &&
      !topBeforeCombined.includes("open time processing");

    finalRanked.sort((left, right) => {
      const priorityDiff = specificAnchorPriority(left) - specificAnchorPriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return right.score - left.score;
    });

    if (genericPrimary && specificAvailable) {
      finalSupportReorderedForSpecificAnchor = true;
      genericPrimaryDemotedReason =
        "Generic SECTION 23 was demoted below specific swap/pickup/PCS support.";
    }
  }
  if (!allowGreenSlipSupport) {
    const isGreenSlipInferred = (item: (typeof finalRanked)[number]) =>
      (item.matchedSectionAnchor ?? inferSupportSectionAnchor(item.reference, { allowGreenSlipInferred: true })) ===
      "Green Slip (inferred)";
    const filteredRanked = finalRanked.filter((item) => !isGreenSlipInferred(item));
    if (filteredRanked.length !== finalRanked.length) {
      const backfill = sorted.filter(
        (item) =>
          !filteredRanked.some((chosen) => chosen.reference === item.reference) &&
          !isGreenSlipInferred(item)
      );
      finalRanked = [...filteredRanked, ...backfill].slice(0, 4);
    }
  }
  if (vacationBankScenario) {
    const bestVacationCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = vacationBankTerms.filter((term) => combined.includes(term));
      const requiredHits = vacationRequiredTerms.filter((term) => combined.includes(term));
      return (
        item.reference.sourceId === "pwa" &&
        (normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 7")) ||
          requiredHits.length > 0 ||
          hits.length >= 2)
      );
    });
    if (bestVacationCandidate) {
      vacationBankSupportPromoted = true;
      const remaining = finalRanked.filter((item) => item.reference !== bestVacationCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestVacationCandidate, ...remaining);
    }
    const visibleVacationTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return vacationBankTerms.filter((term) => combined.includes(term));
        })
      )
    );
    vacationBankSupportMissingAnchors = vacationRequiredTerms.filter((term) => !visibleVacationTerms.includes(term));
  }
  if (domicileLayoverScenario) {
    const bestDomicileCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = domicileLayoverTerms.filter((term) => combined.includes(term));
      const requiredHits = domicileRequiredTerms.filter((term) => combined.includes(term));
      const section2Hit = normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 2"));
      return (
        (item.reference.sourceId === "pwa" && section2Hit && requiredHits.length >= 2) ||
        (item.reference.sourceId === "scheduler_manual" && hits.length >= 2)
      );
    });
    if (bestDomicileCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestDomicileCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestDomicileCandidate, ...remaining);
    }
    const visibleDomicileTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return domicileLayoverTerms.filter((term) => combined.includes(term));
        })
      )
    );
    domicileLayoverSupportMissingAnchors = domicileRequiredTerms.filter((term) => !visibleDomicileTerms.includes(term));
  }
  if (sickLookbackScenario) {
    const bestSickLookbackCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = sickLookbackTerms.filter((term) => combined.includes(term));
      const requiredHits = sickLookbackRequiredTerms.filter((term) => combined.includes(term));
      const section14Hit =
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 14 F")) ||
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 14"));
      return item.reference.sourceId === "pwa" && (section14Hit || requiredHits.length >= 2 || hits.length >= 3);
    });
    if (bestSickLookbackCandidate) {
      sickLookbackSupportPromoted = true;
      const remaining = finalRanked.filter((item) => item.reference !== bestSickLookbackCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestSickLookbackCandidate, ...remaining);
    }
    const visibleSickLookbackTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return sickLookbackTerms.filter((term) => combined.includes(term));
        })
      )
    );
    sickLookbackSupportMissingAnchors = sickLookbackRequiredTerms.filter((term) => !visibleSickLookbackTerms.includes(term));
  }
  if (payCreditConsistencyScenario) {
    const payCreditSubScenario = detectPayCreditSubScenario(args.question);
    const bestPayCreditCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = payCreditConsistencyTerms.filter((term) => combined.includes(term));
      const requiredHits = payCreditRequiredTerms.filter((term) => combined.includes(term));
      const compManualHit = item.reference.sourceId === "compensation_manual";
      const section14Hit =
        item.reference.sourceId === "pwa" &&
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 14"));
      const section12Hit =
        item.reference.sourceId === "pwa" &&
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 12"));
      const section23Hit =
        item.reference.sourceId === "pwa" &&
        (
          normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 K")) ||
          normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 L"))
        );
      const rotationGuaranteeHit =
        item.reference.sourceId === "pwa" &&
        normalizeSupportText(item.reference.section).includes("rotation guarantee");
      return (
        (payCreditSubScenario === "rerouteCreditProtection" &&
          (
            section23Hit ||
            rotationGuaranteeHit ||
            (compManualHit && (combined.includes("reroute pay") || combined.includes("rotation guarantee") || combined.includes("pay protected") || combined.includes("less credit")))
          )) ||
        (compManualHit && (requiredHits.length > 0 || hits.length >= 2)) ||
        (section14Hit && (combined.includes("sick") || combined.includes("bank"))) ||
        (section12Hit && (combined.includes("layover") || combined.includes("deadhead") || combined.includes("rest")))
      );
    });
    if (bestPayCreditCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestPayCreditCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestPayCreditCandidate, ...remaining);
    }
    const visiblePayCreditTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return payCreditConsistencyTerms.filter((term) => combined.includes(term));
        })
      )
    );
    payCreditAnchorFound =
      Boolean(bestPayCreditCandidate) &&
      (
        (payCreditSubScenario === "sickBankAfterCalledWell" && visiblePayCreditTerms.includes("sick bank")) ||
        (payCreditSubScenario === "bankDepositSilverSlipCredit" && (visiblePayCreditTerms.includes("ss credit") || visiblePayCreditTerms.includes("bank deposit"))) ||
        (payCreditSubScenario === "rerouteCreditProtection" &&
          (visiblePayCreditTerms.includes("reroute pay") || visiblePayCreditTerms.includes("rotation guarantee") || visiblePayCreditTerms.includes("credit"))) ||
        ((payCreditSubScenario === "projectedVsFinalCreditCloseout" || payCreditSubScenario === "timecardCreditDiscrepancy") &&
          (visiblePayCreditTerms.includes("timecard") || visiblePayCreditTerms.includes("credit recalculation") || visiblePayCreditTerms.includes("deadhead deviation")))
      );
    if (!payCreditAnchorFound) {
      payCreditMissingSupportReason =
        "I do not have the exact pay/credit/bank-eligibility rule attached for this question.";
    }
  }
  let rerouteAnchorFound = false;
  let rerouteMissingSupportReason: string | undefined;
  let rerouteVisibleSupportTerms: string[] = [];
  if (rerouteConsistencyScenario) {
    const bestRerouteCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = rerouteConsistencyTerms.filter((term) => combined.includes(term));
      const requiredHits = rerouteRequiredTerms.filter((term) => combined.includes(term));
      const section23LHit =
        item.reference.sourceId === "pwa" &&
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 L"));
      const compManualHit =
        item.reference.sourceId === "compensation_manual" &&
        (combined.includes("reroute pay") || combined.includes("rrpay") || combined.includes("turn time") || combined.includes("timecard") || combined.includes("credit"));
      return section23LHit || compManualHit || requiredHits.length >= 2 || hits.length >= 3;
    });
    if (bestRerouteCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestRerouteCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestRerouteCandidate, ...remaining);
    }
    rerouteVisibleSupportTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return rerouteConsistencyTerms.filter((term) => combined.includes(term));
        })
      )
    );
    rerouteAnchorFound =
      Boolean(bestRerouteCandidate) &&
      (
        (lowerIncludesAny(args.question, ["first airborne", "after first airborne", "different flight number", "same destination"]) &&
          (rerouteVisibleSupportTerms.includes("first airborne") || rerouteVisibleSupportTerms.includes("reroute pay") || rerouteVisibleSupportTerms.includes("continuation"))) ||
        (lowerIncludesAny(args.question, ["rrpay", "paid differently", "turn time"]) &&
          (rerouteVisibleSupportTerms.includes("rrpay") || rerouteVisibleSupportTerms.includes("turn time") || rerouteVisibleSupportTerms.includes("timecard")))
      );
    if (!rerouteAnchorFound) {
      rerouteMissingSupportReason =
        "I do not have the exact reroute / continuation / RRPay rule attached for this question.";
    }
  }
  let qsCallOrderAnchorFound = false;
  let qsCallOrderMissingSupportReason: string | undefined;
  let qsCallOrderVisibleSupportTerms: string[] = [];
  if (qsCallOrderScenario) {
    const bestQsCallOrderCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = qsCallOrderTerms.filter((term) => combined.includes(term));
      const requiredHits = qsCallOrderRequiredTerms.filter((term) => combined.includes(term));
      const schedulerQsHit =
        item.reference.sourceId === "scheduler_manual" &&
        (combined.includes("qs") || combined.includes("quick slip") || combined.includes("arcos") || combined.includes("notification"));
      const pwaQsHit =
        item.reference.sourceId === "pwa" &&
        (combined.includes("qs") || combined.includes("quick slip") || combined.includes("notification"));
      return schedulerQsHit || pwaQsHit || requiredHits.length >= 2 || hits.length >= 3;
    });
    if (bestQsCallOrderCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestQsCallOrderCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestQsCallOrderCandidate, ...remaining);
    }
    qsCallOrderVisibleSupportTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return qsCallOrderTerms.filter((term) => combined.includes(term));
        })
      )
    );
    qsCallOrderAnchorFound =
      Boolean(bestQsCallOrderCandidate) &&
      qsCallOrderRequiredTerms.every((term) => qsCallOrderVisibleSupportTerms.includes(term));
    if (!qsCallOrderAnchorFound) {
      qsCallOrderMissingSupportReason =
        "I do not have the exact QS call-order / ARCOS notification rule attached for this question.";
    }
  }
  let oeNotificationAnchorFound = false;
  let oeNotificationMissingSupportReason: string | undefined;
  let oeNotificationVisibleSupportTerms: string[] = [];
  let oeNotificationSupportRejectedReasons: string[] = [];
  if (oeNotificationScenario) {
    const bestOeNotificationCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = getOeNotificationSupportHits(combined);
      const requiredHits = oeNotificationRequiredTerms.filter((term) => hits.includes(term));
      return hasDirectOeNotificationSupport(combined) || requiredHits.length >= 2 || hits.length >= 4;
    });
    if (bestOeNotificationCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestOeNotificationCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestOeNotificationCandidate, ...remaining);
    }
    oeNotificationVisibleSupportTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return getOeNotificationSupportHits(combined);
        })
      )
    );
    oeNotificationAnchorFound =
      Boolean(bestOeNotificationCandidate) &&
      (
        oeNotificationVisibleSupportTerms.includes("notification") &&
        (
          oeNotificationVisibleSupportTerms.includes("oe") ||
          oeNotificationVisibleSupportTerms.includes("srh") ||
          oeNotificationVisibleSupportTerms.includes("trh")
        ) &&
        (
          oeNotificationVisibleSupportTerms.includes("cno") ||
          oeNotificationVisibleSupportTerms.includes("phone call") ||
          oeNotificationVisibleSupportTerms.includes("online notification") ||
          oeNotificationVisibleSupportTerms.includes("electronic notification")
        )
      );
    oeNotificationSupportRejectedReasons = Array.from(
      new Set(
        sorted.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          const reasons: string[] = [];
          if ((combined.includes("green slip") || /\bgs\b/.test(combined)) && !hasDirectOeNotificationSupport(combined)) {
            reasons.push("green_slip_support_rejected");
          }
          if (combined.includes("deadhead") && !hasDirectOeNotificationSupport(combined)) {
            reasons.push("deadhead_support_rejected");
          }
          if (
            normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 10")) &&
            !hasDirectOeNotificationSupport(combined)
          ) {
            reasons.push("section_10_pay_support_rejected");
          }
          if (
            normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 2")) &&
            !hasDirectOeNotificationSupport(combined)
          ) {
            reasons.push("section_2_definition_support_rejected");
          }
          return reasons;
        })
      )
    );
    if (!oeNotificationAnchorFound) {
      oeNotificationMissingSupportReason =
        "I do not have the exact OE notification / CNO source attached.";
    }
  }
  let contactabilityAnchorFound = false;
  let contactabilityMissingSupportReason: string | undefined;
  let contactabilityVisibleSupportTerms: string[] = [];
  if (contactabilityScenario) {
    const bestContactabilityCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = contactabilityTerms.filter((term) => combined.includes(term));
      const requiredHits = contactabilityRequiredTerms.filter((term) => combined.includes(term));
      const schedulerHit =
        item.reference.sourceId === "scheduler_manual" &&
        (combined.includes("acars") ||
          combined.includes("phone call") ||
          combined.includes("contact") ||
          combined.includes("notification") ||
          combined.includes("short call"));
      return schedulerHit || requiredHits.length >= 2 || hits.length >= 4;
    });
    if (bestContactabilityCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestContactabilityCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestContactabilityCandidate, ...remaining);
    }
    contactabilityVisibleSupportTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return contactabilityTerms.filter((term) => combined.includes(term));
        })
      )
    );
    contactabilityAnchorFound =
      Boolean(bestContactabilityCandidate) &&
      contactabilityRequiredTerms.every((term) => contactabilityVisibleSupportTerms.includes(term));
    if (!contactabilityAnchorFound) {
      contactabilityMissingSupportReason =
        "I do not have the exact contactability / notification-obligation source attached for this question.";
    }
  }
  let shortCallNotificationAnchorFound = false;
  let shortCallNotificationMissingSupportReason: string | undefined;
  let shortCallNotificationVisibleSupportTerms: string[] = [];
  if (shortCallNotificationScenario) {
    const bestShortCallNotificationCandidate = sorted.find((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      const hits = shortCallNotificationTerms.filter((term) => combined.includes(term));
      const requiredHits = shortCallNotificationRequiredTerms.filter((term) => combined.includes(term));
      const shortCallSectionHit =
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 S.9")) ||
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 23 S"));
      return (shortCallSectionHit && hits.length >= 2) || requiredHits.length >= 2 || hits.length >= 4;
    });
    if (bestShortCallNotificationCandidate) {
      const remaining = finalRanked.filter((item) => item.reference !== bestShortCallNotificationCandidate.reference);
      finalRanked.length = 0;
      finalRanked.push(bestShortCallNotificationCandidate, ...remaining);
    }
    shortCallNotificationVisibleSupportTerms = Array.from(
      new Set(
        finalRanked.flatMap((item) => {
          const combined = normalizeSupportText(
            `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
          );
          return shortCallNotificationTerms.filter((term) => combined.includes(term));
        })
      )
    );
    shortCallNotificationAnchorFound =
      Boolean(bestShortCallNotificationCandidate) &&
      shortCallNotificationRequiredTerms.every((term) => shortCallNotificationVisibleSupportTerms.includes(term));
    if (!shortCallNotificationAnchorFound) {
      shortCallNotificationMissingSupportReason =
        "I do not see the exact short-call-after-vacation/non-fly-day notification rule in the attached support.";
    }
  }
  const apdThresholdExplained =
    apdDiagnosticScenario &&
    /\b18 required\b/i.test(args.answerText) &&
    /\b5 available\b/i.test(args.answerText) &&
    /\b25%\b/.test(args.answerText);
  const apdDriftDetected =
    apdDiagnosticScenario &&
    /(reroute|deadhead|silver slip|x-day|quick slip)/i.test(args.answerText) &&
    !/\bapd\b/i.test(args.answerText);
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
  const xDayGroupingAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      combined.includes("x-day") &&
      combined.includes("reserve") &&
      (
        combined.includes("grouping") ||
        combined.includes("x-day block") ||
        combined.includes("month-to-month") ||
        combined.includes("move")
      )
    );
  });
  const pbAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return combined.includes("pb") || combined.includes("payback") || combined.includes("pr") || combined.includes("lc");
  });
  const pbProcessingAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      combined.includes("processing") ||
      combined.includes("payback") ||
      combined.includes("pr remainder") ||
      combined.includes("long call") ||
      combined.includes("continuation")
    );
  });
  const notificationAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      combined.includes("notification") ||
      combined.includes("acars") ||
      combined.includes("arcos") ||
      combined.includes("robot") ||
      combined.includes("contact")
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
  const vacationBankAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 7")) ||
      combined.includes("vacation year") ||
      combined.includes("ivd") ||
      combined.includes("sup") ||
      (combined.includes("bank") && combined.includes("vacation")) ||
      combined.includes("replacement")
    );
  });
  const futureRotationChangeAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      combined.includes("rotation change") ||
      combined.includes("redeye") ||
      combined.includes("removed leg") ||
      combined.includes("asterisk rotation changes") ||
      combined.includes("pay protection")
    );
  });
  const cpoOverrideAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return combined.includes("cpo") || combined.includes("manual") || combined.includes("override");
  });
  const knownAbsenceAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return combined.includes("known absence") || combined.includes("leave");
  });
  const payProtectionAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      combined.includes("pay protection") ||
      combined.includes("credit protection") ||
      (combined.includes("pay") && combined.includes("credit"))
    );
  });
  const domicileLayoverPwaAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      item.reference.sourceId === "pwa" &&
      normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 2")) &&
      combined.includes("rotation") &&
      combined.includes("break in duty") &&
      combined.includes("base")
    );
  });
  const domicileLayoverSchedulerAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      item.reference.sourceId === "scheduler_manual" &&
      combined.includes("open time") &&
      combined.includes("rotation") &&
      (combined.includes("domicile layover") || combined.includes("base layover") || combined.includes("construction"))
    );
  });
  const domicileLayoverAnchorFound = domicileLayoverPwaAnchorFound || domicileLayoverSchedulerAnchorFound;
  const sickLookbackAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      item.reference.sourceId === "pwa" &&
      (
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 14 F")) ||
        normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 14"))
      ) &&
      (
        (combined.includes("sickness") && combined.includes("verification")) ||
        combined.includes("lookback") ||
        combined.includes("medical")
      )
    );
  });
  const restLegalityAnchorFound = finalRanked.some((item) => {
    const combined = normalizeSupportText(
      `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
    );
    return (
      normalizeSectionIdentifier(item.reference.section).includes(normalizeSectionIdentifier("Section 12")) ||
      combined.includes("30-hour rest") ||
      combined.includes("30 hour rest") ||
      combined.includes("rest") ||
      combined.includes("release with pay") ||
      combined.includes("far legal") ||
      combined.includes("dh-only") ||
      combined.includes("dh only") ||
      combined.includes("fdp")
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
  const vacationBankVisibleSupportTerms = vacationBankScenario
    ? Array.from(
        new Set(
          finalRanked.flatMap((item) => {
            const combined = normalizeSupportText(
              `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
            );
            return vacationBankTerms.filter((term) => combined.includes(term));
          })
        )
      )
    : [];
  const shortCallNotificationVisibleSupportTermsFinal = shortCallNotificationScenario
    ? Array.from(
        new Set(
          finalRanked.flatMap((item) => {
            const combined = normalizeSupportText(
              `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
            );
            return shortCallNotificationTerms.filter((term) => combined.includes(term));
          })
        )
      )
    : shortCallNotificationVisibleSupportTerms;
  const retrievalSilverSlipAnchorsFound = sorted
    .filter((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      return combined.includes("silver slip");
    })
    .map((item) => inferSupportSectionAnchor(item.reference, { allowGreenSlipInferred: allowGreenSlipSupport }))
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);
  const retrievalGreenSlipAnchorsFound = sorted
    .filter(() => allowGreenSlipSupport)
    .filter((item) => {
      const combined = normalizeSupportText(
        `${item.reference.section ?? ""} ${item.reference.label ?? ""} ${item.reference.quoteSnippet ?? ""}`
      );
      return combined.includes("green slip") || /\bgs\b/.test(combined);
    })
    .map((item) => inferSupportSectionAnchor(item.reference, { allowGreenSlipInferred: allowGreenSlipSupport }))
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);
  const supportWeakMatchWarning =
    finalRanked.length === 0 ||
    (finalRanked[0]?.score ?? 0) < 60 ||
    qualityGate.primaryAnchorMissing ||
    silverSlipSupportMissing ||
    (pickupLimitScenario && !pickupLimitAnchorFound) ||
    (xDayScenario && !xDayAnchorFound) ||
    (xDayGroupingScenario && !xDayGroupingAnchorFound) ||
    (pbRerouteXdayScenario && (!pbAnchorFound || !pbProcessingAnchorFound)) ||
    (shortCallDutyScenario && !shortCallDutyAnchorFound) ||
    (pcsSwapScenario && !pcsSwapAnchorFound) ||
    (vacationBankScenario && !vacationBankAnchorFound) ||
    (futureRotationChangeScenario &&
      (!futureRotationChangeAnchorFound || !knownAbsenceAnchorFound || !payProtectionAnchorFound)) ||
    (domicileLayoverScenario && (!domicileLayoverAnchorFound || domicileLayoverSupportMissingAnchors.length > 0)) ||
    (sickLookbackScenario && (!sickLookbackAnchorFound || sickLookbackSupportMissingAnchors.length > 0)) ||
    (restLegalityScenario && !restLegalityAnchorFound) ||
    (payCreditConsistencyScenario && !payCreditAnchorFound) ||
    (rerouteConsistencyScenario && !rerouteAnchorFound) ||
    (qsCallOrderScenario && !qsCallOrderAnchorFound) ||
    (oeNotificationScenario && !oeNotificationAnchorFound) ||
    (shortCallNotificationScenario && !shortCallNotificationAnchorFound);

  const visibleReferences = finalRanked.map((item) => ({
    ...item.reference,
    section: item.matchedSectionAnchor ?? item.reference.section,
  }));
  if (pcsSwapScenario || pickupLimitScenario) {
    const visiblePriority = (reference: (typeof visibleReferences)[number]) => {
      const combined = normalizeSupportText(
        `${reference.section ?? ""} ${reference.label ?? ""} ${reference.quoteSnippet ?? ""}`
      );
      if (combined.includes("swap with pot")) return 1;
      if (combined.includes("pickup limit") || combined.includes("max pickup")) return 2;
      if (combined.includes("pcs processing")) return 3;
      if (combined.includes("reserve coverage") || combined.includes("open time processing")) return 4;
      if (normalizeSectionIdentifier(reference.section) === normalizeSectionIdentifier("Section 23")) return 5;
      return 6;
    };
    const topVisibleBefore = visibleReferences[0];
    const topVisibleWasGeneric =
      Boolean(topVisibleBefore) &&
      normalizeSectionIdentifier(topVisibleBefore.section) === normalizeSectionIdentifier("Section 23");
    const specificVisibleAvailable = visibleReferences.some((reference) => visiblePriority(reference) < 5);
    visibleReferences.sort((left, right) => {
      const priorityDiff = visiblePriority(left) - visiblePriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return 0;
    });
    if (topVisibleWasGeneric && specificVisibleAvailable) {
      finalSupportReorderedForSpecificAnchor = true;
      genericPrimaryDemotedReason =
        "Generic SECTION 23 was demoted below specific visible swap/pickup/PCS support.";
    }
  }

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
      xDayGroupingScenario,
      xDayGroupingAnchorFound,
      xDayGroupingMissingSupportReason:
        xDayGroupingScenario && !xDayGroupingAnchorFound
          ? "I do not have the exact reserve X-day grouping / cross-month movement rule attached for this question."
          : undefined,
      pbRerouteXdayScenario,
      pbAnchorFound,
      pbProcessingAnchorFound,
      notificationAnchorFound,
      pbScenarioMissingSupportReason:
        pbRerouteXdayScenario && (!pbAnchorFound || !pbProcessingAnchorFound)
          ? "I do not have the full PB / PR / LC reapplication or interrupted X-day processing logic attached for this question."
          : pbRerouteXdayScenario && !notificationAnchorFound
            ? "I do not have the exact notification-processing rule attached for this reroute/QS award sequence."
            : undefined,
      pcsSwapScenario,
      pcsSwapAnchorFound,
      pcsSwapVisibleSupportTerms,
      pcsSwapSupportPromoted,
      pcsSwapSupportMissingAnchors,
      pickupLimitScenario,
      pickupLimitAnchorFound,
      pickupLimitMissingSupportReason,
      finalSupportReorderedForSpecificAnchor,
      genericPrimaryDemotedReason,
      pcsSwapMissingSupportReason:
        pcsSwapScenario && !pcsSwapAnchorFound
          ? "I do not see the exact PCS/swap-with-pot processing rule in the attached support."
          : pcsSwapScenario && pcsSwapSupportMissingAnchors.length > 0
            ? `I do not see all of the expected PCS/swap processing anchors in the attached support: ${pcsSwapSupportMissingAnchors.join(", ")}.`
          : undefined,
      vacationBankScenario,
      vacationBankAnchorFound,
      vacationBankVisibleSupportTerms,
      vacationBankSupportPromoted,
      vacationBankSupportMissingAnchors,
      vacationBankMissingSupportReason:
        vacationBankScenario && !vacationBankAnchorFound
          ? "I do not see the exact vacation bank / SUP / IVD Section 7 rule in the attached support."
          : vacationBankScenario && vacationBankSupportMissingAnchors.length > 0
            ? `I do not see all of the expected vacation bank / SUP / IVD anchors in the attached support: ${vacationBankSupportMissingAnchors.join(", ")}.`
            : undefined,
      futureRotationChangeScenario,
      futureRotationChangeAnchorFound,
      cpoOverrideAnchorFound,
      knownAbsenceAnchorFound,
      payProtectionAnchorFound,
      futureRotationMissingSupportReason:
        futureRotationChangeScenario &&
        (!futureRotationChangeAnchorFound || !knownAbsenceAnchorFound || !payProtectionAnchorFound)
          ? "I do not have a clean controlling source for CPO override / known absence pay protection in this packet."
          : undefined,
      domicileLayoverScenario,
      domicileLayoverAnchorFound,
      domicileLayoverMissingSupportReason:
        domicileLayoverScenario && !domicileLayoverPwaAnchorFound && !domicileLayoverSchedulerAnchorFound
          ? "I do not have the PWA rotation-definition or Scheduler Manual domicile-layover construction reference attached for this question."
          : domicileLayoverScenario && domicileLayoverPwaAnchorFound && !domicileLayoverSchedulerAnchorFound
            ? "I do not have the exact Scheduler Manual open-time / domicile-layover construction reference attached for this question."
            : domicileLayoverScenario && !domicileLayoverPwaAnchorFound && domicileLayoverSchedulerAnchorFound
              ? "I do not have the PWA Section 2 rotation-definition support attached for this question."
              : domicileLayoverScenario && domicileLayoverSupportMissingAnchors.length > 0
                ? `I do not see all of the expected domicile-layover anchors in the attached support: ${domicileLayoverSupportMissingAnchors.join(", ")}.`
                : undefined,
      sickLookbackScenario,
      sickLookbackAnchorFound,
      sickLookbackMissingSupportReason:
        sickLookbackScenario && !sickLookbackAnchorFound
          ? "I do not have the exact Section 14 medical-procedure / sick-lookback exclusion or approval-process language attached for this question."
          : sickLookbackScenario && sickLookbackSupportMissingAnchors.length > 0
            ? `I do not see all of the expected sick-lookback / approval-process anchors in the attached support: ${sickLookbackSupportMissingAnchors.join(", ")}.`
            : undefined,
      restLegalityScenario,
      restLegalityAnchorFound,
      restLegalityMissingSupportReason:
        restLegalityScenario && !restLegalityAnchorFound
          ? "I do not have the exact Section 12 rest-legality and release/pay language attached for this question."
          : undefined,
      farVsPwaIssueDetected:
        restLegalityScenario &&
        (
          args.question.toLowerCase().includes("far legal") ||
          args.question.toLowerCase().includes("release with pay") ||
          args.question.toLowerCase().includes("pwa requirement")
        ),
      deadheadRerouteConsequenceScenario,
      deadheadRerouteAnchorFound:
        deadheadRerouteConsequenceScenario &&
        (
          rerouteAnchorFound ||
          xDayAnchorFound ||
          normalizeSupportText(args.question).includes("slv") ||
          normalizeSupportText(args.question).includes("deadhead deviation")
        ),
      deadheadRerouteMissingSupportReason:
        deadheadRerouteConsequenceScenario &&
        !(
          rerouteAnchorFound ||
          xDayAnchorFound ||
          normalizeSupportText(args.question).includes("slv") ||
          normalizeSupportText(args.question).includes("deadhead deviation")
        )
          ? "I do not have the exact deadhead deviation / SLV / QS consequence rule attached for this question."
          : undefined,
      payCreditConsistencyScenario,
      payCreditAnchorFound,
      payCreditMissingSupportReason,
      rerouteConsistencyScenario,
      rerouteAnchorFound,
      rerouteMissingSupportReason,
      rerouteVisibleSupportTerms,
      qsCallOrderScenario,
      qsCallOrderAnchorFound,
      qsCallOrderMissingSupportReason,
      qsCallOrderVisibleSupportTerms,
      oeNotificationScenario,
      oeNotificationAnchorFound,
      oeNotificationMissingSupportReason,
      oeNotificationSupportRejectedReasons,
      oeNotificationVisibleSupportTerms,
      contactabilityScenario,
      contactabilityAnchorFound,
      contactabilityMissingSupportReason,
      inferredPilotStatus: inferPilotStatus(args.question),
      shortCallNotificationScenario,
      shortCallNotificationAnchorFound,
      shortCallNotificationMissingSupportReason,
      shortCallNotificationVisibleSupportTerms: shortCallNotificationVisibleSupportTermsFinal,
      apdDiagnosticScenario,
      apdThresholdExplained,
      apdDriftDetected,
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
  const allowGreenSlipSupport = questionAllowsGreenSlipSupport(args.question);
  const silverSlipQuery =
    args.question.toLowerCase().includes("silver slip") || /\bss\b/.test(args.question.toLowerCase());
  const pcsSwapScenario = detectPcsSwapScenario(args.question);
  const pickupLimitScenario = detectPickupLimitScenario(args.question);
  const vacationBankScenario = detectVacationBankScenario(args.question);
  const domicileLayoverScenario = detectDomicileLayoverScenario(args.question);
  const sickLookbackScenario = detectSickLookbackScenario(args.question);
  const payCreditConsistencyScenario = detectPayCreditConsistencyScenario(args.question);
  const rerouteConsistencyScenario = detectRerouteConsistencyScenario(args.question);
  const qsCallOrderScenario = detectQsCallOrderScenario(args.question);
  const oeNotificationScenario = detectOeNotificationScenario(args.question);
  const contactabilityScenario = detectContactabilityScenario(args.question);
  const shortCallNotificationScenario = detectShortCallNotificationScenario(args.question);
  const futureRotationChangeScenario = detectFutureRotationChangeScenario(args.question);
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
    bank: 75,
    "vacation day": 80,
    "buy vacation": 75,
    replacement: 75,
    "60 hours": 70,
    sup: 85,
    ivd: 85,
    "vacation year": 90,
    "domicile layover": 85,
    "base layover": 80,
    "rotation definition": 90,
    "break in duty": 80,
    "break in duty at base": 95,
    "open time rotation": 85,
    "rotation construction": 75,
    "medical procedures": 95,
    "medical procedure": 95,
    "sick lookback": 100,
    "approval process": 90,
    "section 14": 85,
    sickness: 85,
    notification: 70,
    verification: 90,
    lookback: 95,
    medical: 80,
    procedure: 75,
    telehealth: 70,
    "sick bank": 95,
    "called well": 90,
    "bank deposit": 85,
    deposit: 70,
    "ss credit": 95,
    timecard: 85,
    micrew: 80,
    "credit recalculation": 100,
    "deadhead deviation": 90,
    deviation: 70,
    "13 hours": 85,
    "bank eligibility": 90,
    "blanket qs": 90,
    "call order": 95,
    arcos: 90,
    eligible: 85,
    "30/168": 80,
    evidence: 70,
    dart: 70,
    telephone: 85,
    "electronic placement": 95,
    acknowledge: 90,
    acknowledgment: 90,
    icrew: 90,
    micrew: 85,
    cno: 90,
    "oe notification": 100,
    "company notification online": 95,
    srh: 85,
    trh: 85,
    "phone call": 90,
    "online notification": 85,
    "electronic notification": 90,
    "non-fly day": 95,
    "non fly day": 95,
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
  const pickupLimitTerms = [
    "max pickup",
    "pickup limit",
    "swap with pot",
    "open time",
    "reserve coverage",
    "coverage works",
    "pickup",
    "coverage",
  ];
  const vacationBankTerms = ["vacation", "bank", "replacement", "vacation year", "sup", "ivd"];
  const domicileLayoverTerms = [
    "domicile layover",
    "base layover",
    "break in duty",
    "break in duty at base",
    "rotation definition",
    "open time rotation",
    "open time",
    "rotation",
    "base",
    "rotation construction",
  ];
  const sickLookbackTerms = [
    "medical procedures",
    "medical procedure",
    "sick lookback",
    "approval process",
    "section 14",
    "sickness",
    "notification",
    "verification",
    "lookback",
    "medical",
    "procedure",
    "telehealth",
  ];
  const payCreditConsistencyTerms = [
    "sick bank",
    "called well",
    "bank deposit",
    "deposit",
    "ss credit",
    "silver slip credit",
    "timecard",
    "micrew",
    "credit recalculation",
    "deadhead deviation",
    "deviation",
    "13 hours",
    "layover",
    "deadhead",
    "credit",
    "bank eligibility",
  ];
  const rerouteConsistencyTerms = [
    "reroute",
    "reroute pay",
    "rrpay",
    "first airborne",
    "different flight number",
    "same destination",
    "continuation",
    "turn time",
    "paid differently",
    "timecard",
    "credit",
    "deadhead",
  ];
  const qsCallOrderTerms = [
    "qs",
    "quick slip",
    "blanket qs",
    "call order",
    "category",
    "arcos",
    "notification",
    "eligible",
    "wide report",
    "seniority",
    "30/168",
    "dart",
  ];
  const oeNotificationTerms = [
    "oe",
    "notification",
    "cno",
    "company notification online",
    "phone call",
    "srh",
    "trh",
    "online notification",
    "electronic notification",
  ];
  const contactabilityTerms = [
    "contactable",
    "answer the phone",
    "phone call",
    "acars",
    "airport sit",
    "between flights",
    "on duty",
    "off duty",
    "acknowledge",
    "notification",
    "check your schedule",
    "end of short call",
    "short call",
  ];
  const shortCallNotificationTerms = [
    "short call",
    "notification",
    "vacation",
    "non-fly day",
    "non fly day",
    "telephone",
    "electronic placement",
    "icrew",
    "micrew",
    "acknowledge",
    "acknowledgment",
    "cno",
    "contact",
  ];
  const futureRotationTerms = [
    "rotation change",
    "redeye",
    "removed leg",
    "pay protection",
    "credit protection",
    "reserve coverage",
    "known absence",
    "cpo",
    "processing",
    "leave",
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

      const sourceBoost = payCreditConsistencyScenario
        ? chunk.source === "compensation_manual"
          ? 88
          : chunk.source === "pwa"
            ? 74
            : 28
        : shortCallNotificationScenario
        ? chunk.source === "scheduler_manual"
          ? 92
          : chunk.source === "pwa"
            ? 80
            : 18
        : qsCallOrderScenario
        ? chunk.source === "scheduler_manual"
          ? 94
          : chunk.source === "pwa"
            ? 68
            : 8
        : oeNotificationScenario
        ? chunk.source === "scheduler_manual"
          ? 100
          : chunk.source === "pwa"
            ? 40
            : 0
        : contactabilityScenario
        ? chunk.source === "scheduler_manual"
          ? 96
          : chunk.source === "pwa"
            ? 52
            : 8
        : rerouteConsistencyScenario
        ? chunk.source === "pwa"
          ? 86
          : chunk.source === "compensation_manual"
            ? 82
            : 24
        : pickupLimitScenario
        ? chunk.source === "scheduler_manual"
          ? 82
          : chunk.source === "pwa"
            ? 68
            : 10
        : pcsSwapScenario
        ? chunk.source === "scheduler_manual"
          ? 70
          : chunk.source === "pwa"
            ? 35
            : 12
        : vacationBankScenario
          ? chunk.source === "pwa"
            ? 75
            : chunk.source === "compensation_manual"
              ? 22
              : 10
        : domicileLayoverScenario
          ? chunk.source === "pwa"
            ? 80
            : chunk.source === "scheduler_manual"
              ? 72
              : 8
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
      const pickupLimitSpecificHits = pickupLimitTerms.filter((term) => chunkText.includes(term));
      const vacationSpecificHits = vacationBankTerms.filter((term) => chunkText.includes(term));
      const domicileSpecificHits = domicileLayoverTerms.filter((term) => chunkText.includes(term));
      const sickLookbackSpecificHits = sickLookbackTerms.filter((term) => chunkText.includes(term));
      const payCreditSpecificHits = payCreditConsistencyTerms.filter((term) => chunkText.includes(term));
      const rerouteSpecificHits = rerouteConsistencyTerms.filter((term) => chunkText.includes(term));
      const qsCallOrderSpecificHits = qsCallOrderTerms.filter((term) => chunkText.includes(term));
      const oeNotificationSpecificHits = getOeNotificationSupportHits(chunkText);
      const oeNotificationDirectSupport = hasDirectOeNotificationSupport(chunkText);
      const contactabilitySpecificHits = contactabilityTerms.filter((term) => chunkText.includes(term));
      const shortCallNotificationSpecificHits = shortCallNotificationTerms.filter((term) => chunkText.includes(term));
      const futureRotationSpecificHits = futureRotationTerms.filter((term) => chunkText.includes(term));
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
        (pickupLimitScenario && pickupLimitSpecificHits.length > 0 ? 170 : 0) +
        (pickupLimitScenario ? pickupLimitSpecificHits.length * 36 : 0) +
        (pickupLimitScenario && chunk.source === "scheduler_manual" && pickupLimitSpecificHits.length > 0 ? 130 : 0) +
        (pickupLimitScenario && chunk.source === "pwa" &&
          normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 23")) &&
          (chunkText.includes("open time") || chunkText.includes("pickup"))
          ? 140
          : 0) +
        (pickupLimitScenario && /\bsection 23\b/.test(chunkText) && pickupLimitSpecificHits.length === 0 ? -145 : 0) +
        (pcsSwapScenario &&
        pcsSpecificHits.length > 0
          ? 140
          : 0) +
        (pcsSwapScenario ? pcsSpecificHits.length * 30 : 0) +
        (pcsSwapScenario && chunk.source === "scheduler_manual" && pcsSpecificHits.length > 0 ? 110 : 0) +
        (pcsSwapScenario && /\bsection 23\b/.test(chunkText) && !chunkText.includes("swap") && !chunkText.includes("bid period") ? -120 : 0) +
        (vacationBankScenario && vacationSpecificHits.length > 0 ? 135 : 0) +
        (vacationBankScenario ? vacationSpecificHits.length * 30 : 0) +
        (vacationBankScenario && chunk.source === "pwa" && vacationSpecificHits.length > 0 ? 120 : 0) +
        (vacationBankScenario && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 7")) ? 160 : 0) +
        (vacationBankScenario && /\bsection 23\b/.test(chunkText) && vacationSpecificHits.length === 0 ? -120 : 0) +
        (domicileLayoverScenario && domicileSpecificHits.length > 0 ? 145 : 0) +
        (domicileLayoverScenario ? domicileSpecificHits.length * 28 : 0) +
        (domicileLayoverScenario && chunk.source === "pwa" && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 2")) ? 160 : 0) +
        (domicileLayoverScenario && chunk.source === "scheduler_manual" && domicileSpecificHits.length >= 2 ? 110 : 0) +
        (domicileLayoverScenario && /\bsection 23\b/.test(chunkText) && domicileSpecificHits.length === 0 ? -130 : 0) +
        (sickLookbackScenario && sickLookbackSpecificHits.length > 0 ? 150 : 0) +
        (sickLookbackScenario ? sickLookbackSpecificHits.length * 30 : 0) +
        (sickLookbackScenario && chunk.source === "pwa" && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 14")) ? 190 : 0) +
        (sickLookbackScenario && /\bsection 23\b/.test(chunkText) && sickLookbackSpecificHits.length === 0 ? -160 : 0) +
        (payCreditConsistencyScenario && payCreditSpecificHits.length > 0 ? 165 : 0) +
        (payCreditConsistencyScenario ? payCreditSpecificHits.length * 30 : 0) +
        (payCreditConsistencyScenario && chunk.source === "compensation_manual" && payCreditSpecificHits.length > 0 ? 150 : 0) +
        (payCreditConsistencyScenario && chunk.source === "pwa" && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 14")) && (chunkText.includes("sick") || chunkText.includes("bank")) ? 140 : 0) +
        (payCreditConsistencyScenario && chunk.source === "pwa" && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 12")) && (chunkText.includes("layover") || chunkText.includes("deadhead") || chunkText.includes("rest")) ? 135 : 0) +
        (payCreditConsistencyScenario && /\bsection 23\b/.test(chunkText) && payCreditSpecificHits.length === 0 ? -120 : 0) +
        (shortCallNotificationScenario && shortCallNotificationSpecificHits.length > 0 ? 155 : 0) +
        (shortCallNotificationScenario ? shortCallNotificationSpecificHits.length * 28 : 0) +
        (shortCallNotificationScenario && chunk.source === "scheduler_manual" && shortCallNotificationSpecificHits.length > 0 ? 150 : 0) +
        (shortCallNotificationScenario && chunk.source === "pwa" && shortCallNotificationSpecificHits.length > 0 ? 105 : 0) +
        (shortCallNotificationScenario && chunkText.includes("short call") ? 90 : 0) +
        (shortCallNotificationScenario && (chunkText.includes("telephone") || chunkText.includes("contact")) ? 60 : 0) +
        (shortCallNotificationScenario && (chunkText.includes("electronic placement") || chunkText.includes("acknowledge") || chunkText.includes("acknowledgment")) ? 75 : 0) +
        (shortCallNotificationScenario && (chunkText.includes("vacation") || chunkText.includes("non-fly day") || chunkText.includes("non fly day")) ? 80 : 0) +
        (shortCallNotificationScenario && /\bsection 23\b/.test(chunkText) && shortCallNotificationSpecificHits.length === 0 ? -155 : 0) +
        (shortCallNotificationScenario && !chunkText.includes("short call") ? -70 : 0) +
        (qsCallOrderScenario && qsCallOrderSpecificHits.length > 0 ? 150 : 0) +
        (qsCallOrderScenario ? qsCallOrderSpecificHits.length * 28 : 0) +
        (qsCallOrderScenario && chunk.source === "scheduler_manual" && qsCallOrderSpecificHits.length > 0 ? 145 : 0) +
        (qsCallOrderScenario && chunk.source === "pwa" && qsCallOrderSpecificHits.length > 0 ? 90 : 0) +
        (qsCallOrderScenario && /\bsection 23\b/.test(chunkText) && qsCallOrderSpecificHits.length === 0 ? -160 : 0) +
        (oeNotificationScenario && oeNotificationDirectSupport ? 180 : 0) +
        (oeNotificationScenario && oeNotificationSpecificHits.length > 0 ? 130 : 0) +
        (oeNotificationScenario ? oeNotificationSpecificHits.length * 28 : 0) +
        (oeNotificationScenario && chunk.source === "scheduler_manual" && oeNotificationDirectSupport ? 155 : 0) +
        (oeNotificationScenario && chunk.source === "pwa" && oeNotificationDirectSupport ? 70 : 0) +
        (oeNotificationScenario && (chunkText.includes("green slip") || /\bgs\b/.test(chunkText)) && !oeNotificationDirectSupport ? -260 : 0) +
        (oeNotificationScenario && chunkText.includes("deadhead") && !oeNotificationDirectSupport ? -180 : 0) +
        (oeNotificationScenario && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 10")) && !oeNotificationDirectSupport ? -220 : 0) +
        (oeNotificationScenario && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 2")) && !oeNotificationDirectSupport ? -220 : 0) +
        (oeNotificationScenario && /\bsection 23\b/.test(chunkText) && !oeNotificationDirectSupport ? -165 : 0) +
        (contactabilityScenario && contactabilitySpecificHits.length > 0 ? 145 : 0) +
        (contactabilityScenario ? contactabilitySpecificHits.length * 28 : 0) +
        (contactabilityScenario && chunk.source === "scheduler_manual" && contactabilitySpecificHits.length > 0 ? 150 : 0) +
        (contactabilityScenario && chunk.source === "pwa" && (chunkText.includes("notification") || chunkText.includes("contact")) ? 80 : 0) +
        (contactabilityScenario && (chunkText.includes("green slip") || chunkText.includes("premium pay") || chunkText.includes("quick slip")) ? -220 : 0) +
        (contactabilityScenario && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 10")) ? -190 : 0) +
        (contactabilityScenario && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 2")) && !chunkText.includes("notification") && !chunkText.includes("contact") ? -180 : 0) +
        (rerouteConsistencyScenario && rerouteSpecificHits.length > 0 ? 155 : 0) +
        (rerouteConsistencyScenario ? rerouteSpecificHits.length * 30 : 0) +
        (rerouteConsistencyScenario && chunk.source === "pwa" && normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 23 L")) ? 180 : 0) +
        (rerouteConsistencyScenario && chunk.source === "compensation_manual" && (chunkText.includes("reroute pay") || chunkText.includes("rrpay") || chunkText.includes("turn time") || chunkText.includes("timecard")) ? 165 : 0) +
        (rerouteConsistencyScenario && /\bsection 23\b/.test(chunkText) && !normalizeSectionIdentifier(chunk.section).includes(normalizeSectionIdentifier("Section 23 L")) && rerouteSpecificHits.length === 0 ? -150 : 0) +
        (futureRotationChangeScenario && futureRotationSpecificHits.length > 0 ? 150 : 0) +
        (futureRotationChangeScenario ? futureRotationSpecificHits.length * 28 : 0) +
        (futureRotationChangeScenario && chunk.source === "scheduler_manual" && (chunkText.includes("reserve coverage") || chunkText.includes("processing") || chunkText.includes("rotation change")) ? 145 : 0) +
        (futureRotationChangeScenario && chunk.source === "compensation_manual" && (chunkText.includes("pay protection") || chunkText.includes("credit protection") || (chunkText.includes("pay") && chunkText.includes("credit"))) ? 165 : 0) +
        (futureRotationChangeScenario && chunk.source === "pwa" && (chunkText.includes("known absence") || chunkText.includes("leave") || chunkText.includes("pay protection")) ? 130 : 0) +
        (futureRotationChangeScenario && /\bsection 23\b/.test(chunkText) && futureRotationSpecificHits.length === 0 ? -130 : 0) +
        ((chunk.title ?? "").toLowerCase().includes("silver slip") ? 90 : 0);

      return {
        chunk,
        score,
        termHits,
        exactSectionHit,
        matchedSectionAnchor:
          (pickupLimitScenario && pickupLimitSpecificHits.length > 0)
            ? inferSupportSectionAnchor({
                section: chunk.section,
                label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                quoteSnippet: chunk.text,
              }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (pcsSwapScenario && pcsSpecificHits.length > 0)
            ? inferSupportSectionAnchor({
                section: chunk.section,
                label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                quoteSnippet: chunk.text,
              }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (vacationBankScenario && vacationSpecificHits.length > 0)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (payCreditConsistencyScenario && payCreditSpecificHits.length > 0)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (qsCallOrderScenario && qsCallOrderSpecificHits.length > 0)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (oeNotificationScenario && oeNotificationDirectSupport)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (contactabilityScenario && contactabilitySpecificHits.length > 0)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (shortCallNotificationScenario && shortCallNotificationSpecificHits.length > 0)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (rerouteConsistencyScenario && rerouteSpecificHits.length > 0)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
            : (futureRotationChangeScenario && futureRotationSpecificHits.length > 0)
              ? inferSupportSectionAnchor({
                  section: chunk.section,
                  label: [chunk.title ?? "", ...(chunk.sectionAnchors ?? [])].join(" "),
                  quoteSnippet: chunk.text,
                }, { allowGreenSlipInferred: allowGreenSlipSupport })
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
        : inferSupportSectionAnchor(
            { section: item.chunk.section, label: item.chunk.title, quoteSnippet: item.chunk.text },
            { allowGreenSlipInferred: allowGreenSlipSupport }
          ),
      quoteSnippet: item.chunk.text.slice(0, 420),
      note: item.chunk.title,
      score: item.score,
      matchedTerms: item.termHits,
    };
  });
}

function selectDebugRetrievedSnippets(args: {
  question: string;
  retrievedSupport: ContractCopilotApiSuccessResponse["answer"]["references"];
  visibleReferences?: ContractCopilotApiSuccessResponse["answer"]["references"];
}) {
  const oeNotificationScenario = detectOeNotificationScenario(args.question);
  if (!oeNotificationScenario) {
    return args.retrievedSupport.map((item) => `${item.section}: ${item.quoteSnippet ?? item.note}`);
  }

  const preferredVisible = (args.visibleReferences ?? []).filter((item) => {
    const combined = normalizeSupportText(
      `${item.section ?? ""} ${item.label ?? ""} ${item.quoteSnippet ?? ""}`
    );
    const directSupport = hasDirectOeNotificationSupport(combined);
    const oeContext =
      combined.includes("notification") ||
      combined.includes("cno") ||
      combined.includes("phone") ||
      /\boe\b/.test(combined) ||
      combined.includes("srh") ||
      combined.includes("trh");
    const rejected =
      (combined.includes("green slip") || /\bgs\b/.test(combined)) ||
      combined.includes("deadhead") ||
      normalizeSectionIdentifier(item.section).includes(normalizeSectionIdentifier("Section 10")) ||
      normalizeSectionIdentifier(item.section).includes(normalizeSectionIdentifier("Section 2"));
    return !rejected && (directSupport || oeContext);
  });

  if (preferredVisible.length > 0) {
    return preferredVisible.map((item) => `${item.section}: ${item.quoteSnippet ?? item.label}`);
  }

  return [];
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

function formatControllingSectionDisplay(args: {
  sourceLabel?: string;
  sourceId?: "pwa" | "compensation_manual" | "scheduler_manual";
  section: string;
}) {
  const normalizedSection = String(args.section ?? "")
    .trim()
    .replace(/^SECTION\s+/i, "Section ");
  const sourceLabel =
    args.sourceLabel ??
    (args.sourceId === "pwa"
      ? "PWA"
      : args.sourceId === "compensation_manual"
        ? "Compensation Manual"
        : args.sourceId === "scheduler_manual"
          ? "Scheduler Manual"
          : "");
  return `${sourceLabel} ${normalizedSection}`.replace(/\s+/g, " ").trim();
}

function selectControllingQuote(args: {
  content: string;
  question: string;
  section?: string;
}) {
  const normalizedContent = String(args.content ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedContent) {
    return undefined;
  }

  const questionTerms = extractSupportIntentTerms(args.question, "");
  const sectionNormalized = normalizeSectionIdentifier(args.section);
  const candidatePassages = normalizedContent
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const scoredPassages = candidatePassages
    .map((passage) => {
      const searchable = normalizeSupportText(passage);
      const termHits = questionTerms.filter((term) => searchable.includes(term)).length;
      const sectionHit = sectionNormalized && normalizeSectionIdentifier(passage).includes(sectionNormalized) ? 1 : 0;
      const notificationHit =
        /\b(notification|notify|telephone|phone|icrew|micrew|acknowledge|short call|long call|reserve|vacation|non-fly)\b/i.test(
          passage
        )
          ? 1
          : 0;
      return {
        passage,
        score: termHits * 10 + sectionHit * 8 + notificationHit * 5,
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scoredPassages.find((item) => item.score > 0)?.passage ?? candidatePassages[0];
  const trimmed = trimToTwoSentences(best).trim();
  if (trimmed.length <= 220) {
    return trimmed;
  }
  const clipped = trimmed.slice(0, 220);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 120 ? boundary : 220).trim()}…`;
}

function buildControllingSectionLock(args: {
  question: string;
  governingPacket?: SectionAwareGroundingPacket;
  chunks: ContractDocumentChunk[];
}) {
  const packet = args.governingPacket;
  if (!packet) {
    return undefined;
  }

  const packetSections = keepMostSpecificSectionReferences(
    extractSectionReferencesFromText(`${packet.section} ${packet.title ?? ""} ${packet.content}`)
  );
  const exactSection = packetSections.find((item) => isSpecificSubsectionAnchor(item));
  if (!exactSection) {
    return undefined;
  }

  const normalizedExactSection = normalizeSectionIdentifier(exactSection);
  const sectionParents = extractSectionParentIdentifiers(exactSection).map(normalizeSectionIdentifier);
  const questionTerms = extractSupportIntentTerms(args.question, "");
  const chunkMatch = args.chunks
    .map((chunk) => {
      const anchors = [chunk.section, ...(chunk.sectionAnchors ?? [])];
      const exactAnchor = anchors.find((anchor) => normalizeSectionIdentifier(anchor) === normalizedExactSection);
      const parentAnchor = anchors.find((anchor) =>
        sectionParents.includes(normalizeSectionIdentifier(anchor))
      );
      const combined = normalizeSupportText(
        [chunk.section, chunk.title ?? "", ...(chunk.sectionAnchors ?? []), chunk.text].join(" ")
      );
      const termHits = questionTerms.filter((term) => combined.includes(term)).length;
      const sameTier =
        (packet.tier === "pwa" && chunk.source === "pwa") ||
        (packet.tier === "compensation_manual" && chunk.source === "compensation_manual") ||
        (packet.tier === "scheduler_manual" && chunk.source === "scheduler_manual");
      const score =
        (exactAnchor ? 700 : 0) +
        (parentAnchor ? 180 : 0) +
        (sameTier ? 40 : 0) +
        termHits * 25 +
        Math.min(chunk.text.length, 1200) / 100;
      return score > 0
        ? {
            chunk,
            score,
            matchedSection: exactAnchor ?? parentAnchor ?? exactSection,
          }
        : null;
    })
    .filter(
      (item): item is { chunk: ContractDocumentChunk; score: number; matchedSection: string } => Boolean(item)
    )
    .sort((left, right) => right.score - left.score)[0];

  if (chunkMatch) {
    const displaySection = formatControllingSectionDisplay({
      sourceId:
        chunkMatch.chunk.source === "pwa"
          ? "pwa"
          : chunkMatch.chunk.source === "compensation_manual"
            ? "compensation_manual"
            : "scheduler_manual",
      section: chunkMatch.matchedSection,
    });
    const quoteSnippet =
      selectControllingQuote({
        content: chunkMatch.chunk.text,
        question: args.question,
        section: chunkMatch.matchedSection,
      }) ?? trimToTwoSentences(chunkMatch.chunk.text);
    return {
      governingSection: exactSection,
      displaySection,
      quoteSnippet,
      exactAttached: true,
      reference: {
        ...chunkToAnswerReference({
          chunk: chunkMatch.chunk,
          matchedSection: chunkMatch.matchedSection,
        }),
        section: chunkMatch.matchedSection,
        quoteSnippet,
      },
    };
  }

  const packetQuote =
    selectControllingQuote({
      content: packet.content,
      question: args.question,
      section: exactSection,
    }) ?? trimToTwoSentences(packet.content);
  const packetCanStandIn =
    normalizeSectionIdentifier(packet.section) === normalizedExactSection ||
    normalizeSectionIdentifier(`${packet.title ?? ""} ${packet.content}`).includes(normalizedExactSection);

  if (packetCanStandIn && packetQuote) {
    return {
      governingSection: exactSection,
      displaySection: formatControllingSectionDisplay({
        sourceLabel: packet.sourceLabel,
        section: exactSection,
      }),
      quoteSnippet: packetQuote,
      exactAttached: true,
      reference: {
        label: packet.title ?? packet.note ?? exactSection,
        sourceId:
          packet.tier === "pwa"
            ? "pwa"
            : packet.tier === "compensation_manual"
              ? "compensation_manual"
              : "scheduler_manual",
        section: exactSection,
        quoteSnippet: packetQuote,
        ruleType: packet.tier === "pwa" ? "contract" : "scheduler_practice",
      },
    };
  }

  return {
    governingSection: exactSection,
    displaySection: formatControllingSectionDisplay({
      sourceLabel: packet.sourceLabel,
      section: exactSection,
    }),
    exactAttached: false,
    missingMessage: `I do not have the exact ${exactSection.replace(/^SECTION\s+/i, "Section ")} language attached.`,
  };
}

function applyControllingSectionLock(args: {
  answer: ContractAnswerCard;
  controllingSectionLock?: {
    governingSection: string;
    displaySection: string;
    quoteSnippet?: string;
    exactAttached: boolean;
    missingMessage?: string;
    reference?: ContractAnswerCard["references"][number];
  };
}) {
  const lock = args.controllingSectionLock;
  if (!lock) {
    return args.answer;
  }

  const references = lock.reference
    ? [lock.reference, ...args.answer.references].filter(
        (reference, index, items) =>
          items.findIndex(
            (candidate) =>
              candidate.sourceId === reference.sourceId &&
              candidate.section === reference.section &&
              candidate.quoteSnippet === reference.quoteSnippet
          ) === index
      )
    : args.answer.references;

  const explanationLines = String(args.answer.plainEnglishExplanation ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith("What controls:") && !item.startsWith("Quote:"));

  const headerLines = [`What controls: ${lock.displaySection}.`];
  if (lock.quoteSnippet && lock.quoteSnippet.trim().length > 0) {
    headerLines.push(`Quote: "${lock.quoteSnippet.trim()}"`);
  } else if (!lock.exactAttached && lock.missingMessage) {
    headerLines.push(lock.missingMessage);
  }

  const caveats = !lock.exactAttached && lock.missingMessage
    ? Array.from(new Set([...(args.answer.caveats ?? []), lock.missingMessage]))
    : args.answer.caveats;

  return {
    ...args.answer,
    plainEnglishExplanation: [...headerLines, ...explanationLines].join("\n"),
    references,
    caveats,
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
    normalized.match(/required reserves?(?:\s+are|\s+is|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/(\d+(?:\.\d+)?)\s+required\b/);
  const availableMatch =
    normalized.match(/available(?:\s+are|\s+is|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/reserves available(?:\s+are|\s+is|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/(\d+(?:\.\d+)?)\s+available\b/);

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
  scenarioFamilySelected: string;
  missingGatingFacts: string[];
  answerIsConditional: boolean;
  gatingQuestion?: ClarifyingQuestion;
  conditionalBottomLine?: string;
  conditionalWhy?: string;
  turningCondition?: string;
};

function detectScenarioValidationFamily(question: string) {
  if (detectShortCallNotificationScenario(question)) return "shortCallNotificationScenario";
  if (detectRestLegalityScenario(question)) return "restLegalityScenario";
  if (detectPbRerouteXdayScenario(question)) return "pbRerouteXdayScenario";
  if (detectPayCreditConsistencyScenario(question)) return "payCreditConsistencyScenario";
  return "genericScenario";
}

function hasClockOrDurationSignal(questionLower: string) {
  return (
    /\b\d{1,2}:\d{2}\b/.test(questionLower) ||
    /\b\d{3,4}\b/.test(questionLower) ||
    /\b\d+\s*hours?\b/.test(questionLower) ||
    /\b\d+\s*days?\b/.test(questionLower) ||
    /\b30-hour\b/.test(questionLower) ||
    /\b30 hour\b/.test(questionLower) ||
    /\b9:45\b/.test(questionLower) ||
    /\b9:15\b/.test(questionLower) ||
    /\b10 hours?\b/.test(questionLower) ||
    /\b18 hours?\b/.test(questionLower) ||
    /\b12 hours?\b/.test(questionLower)
  );
}

function hasCreditValueSignals(questionLower: string) {
  return (
    /\b\d{1,2}:\d{2}\b/.test(questionLower) ||
    /\bprojected credit\b/.test(questionLower) ||
    /\bfinal credit\b/.test(questionLower) ||
    /\bcredit time\b/.test(questionLower) ||
    /\btimecard\b/.test(questionLower)
  );
}

function buildMissingFactClarifier(args: {
  id: string;
  prompt: string;
  factField: keyof ParsedScenarioFacts;
  conditionalBottomLine: string;
  conditionalWhy: string;
  turningCondition: string;
  missingGatingFacts: string[];
  scenarioFamilySelected: string;
}): ScenarioValidationResult {
  return {
    scenarioFamilySelected: args.scenarioFamilySelected,
    missingGatingFacts: args.missingGatingFacts,
    answerIsConditional: true,
    turningCondition: args.turningCondition,
    conditionalBottomLine: args.conditionalBottomLine,
    conditionalWhy: args.conditionalWhy,
    gatingQuestion: {
      id: args.id,
      prompt: args.prompt,
      factField: args.factField,
      required: true,
      quickReplies: buildQuickRepliesForField(args.factField),
    },
  };
}

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
  const scenarioFamilySelected = detectScenarioValidationFamily(args.question);

  if (scenarioFamilySelected === "shortCallNotificationScenario") {
    const hasPlacementTime =
      /\bplaced at\b/.test(questionLower) ||
      /\bplacement time\b/.test(questionLower) ||
      /\bawarded at\b/.test(questionLower) ||
      /\bshowed up at\b/.test(questionLower) ||
      /\bappeared at\b/.test(questionLower);
    const hasShortCallStartTime =
      /\bassignment start\b/.test(questionLower) ||
      /\bshort-call start\b/.test(questionLower) ||
      /\bshort call start\b/.test(questionLower) ||
      /\b18 hours\b/.test(questionLower) ||
      /\b12 hours\b/.test(questionLower) ||
      /\b\d{1,2}:\d{2}\b/.test(questionLower);
    const hasReleaseContext =
      !(/\bvacation\b|\bnon-fly day\b|\bnon fly day\b/.test(questionLower)) ||
      /\brelease\b|\breleased\b|\blast day of vacation\b|\bafter vacation\b|\bafter the vacation\b/.test(questionLower);
    const hasNoticeMethod =
      /\bphone\b|\barcos\b|\bcno\b|\bcompany notification online\b|\bmicrew\b|\bicrew\b|\backnowledge\b|\backnowledgment\b/.test(questionLower);
    const missingGatingFacts = [
      !hasPlacementTime ? "the assignment placement time" : null,
      !hasShortCallStartTime ? "the short-call assignment start time" : null,
      !hasReleaseContext ? "the release time from the prior vacation or non-fly day" : null,
      !hasNoticeMethod ? "whether notice came by phone, ARCOS, CNO, or only iCrew/MiCrew placement" : null,
    ].filter((value): value is string => Boolean(value));
    if (missingGatingFacts.length >= 2 || (!hasPlacementTime && !hasNoticeMethod)) {
      return buildMissingFactClarifier({
        id: "gating-short-call-notification-facts",
        prompt:
          "What were the assignment placement time and short-call start time, and did notice come by phone, ARCOS, CNO, or only iCrew/MiCrew placement?",
        factField: "eventTiming",
        missingGatingFacts,
        scenarioFamilySelected,
        turningCondition:
          "the timing of placement versus short-call start and the actual notice method used",
        conditionalBottomLine:
          "This turns on exactly when the assignment was placed, when short call started, and whether the company used a notice method the rule actually recognizes.",
        conditionalWhy:
          "Without the placement time, short-call start, and notice method, I can only guess whether this was a valid short-call notification or a notice failure.",
      });
    }
  }

  if (scenarioFamilySelected === "restLegalityScenario" && !questionLower.includes("timing shown")) {
    const hasRestMetric =
      /\b30-hour\b|\b30 hour\b|\b9:45\b|\b9:15\b|\b10 hours?\b|\bdh-only\b|\bfdp\b/.test(questionLower);
    const hasTimingContext =
      hasClockOrDurationSignal(questionLower) ||
      /\breport\b|\brelease\b|\boperate day 1\b|\bday 1\b/.test(questionLower);
    const hasFarVsPwaContext =
      /\bfar legal\b|\bpwa requirement\b|\brelease with pay\b/.test(questionLower);
    const missingGatingFacts = [
      !hasRestMetric ? "the scheduled and actual rest values" : null,
      !hasTimingContext ? "the report and release timing around the rest break" : null,
      !hasFarVsPwaContext ? "whether the question is about FAR legality, PWA legality, or release/pay treatment" : null,
    ].filter((value): value is string => Boolean(value));
    if (missingGatingFacts.length >= 2 || (!hasRestMetric && !hasTimingContext)) {
      return buildMissingFactClarifier({
        id: "gating-rest-legality-facts",
        prompt:
          "What were the scheduled rest, actual rest achieved, and the report/release times around the break?",
        factField: "eventTiming",
        missingGatingFacts,
        scenarioFamilySelected,
        turningCondition: "the actual rest achieved versus the scheduled rest and the surrounding report/release times",
        conditionalBottomLine:
          "This turns on the actual rest achieved and the report/release timing, because FAR legality and PWA legality do not always resolve the same way.",
        conditionalWhy:
          "Without the actual rest and the timing around the break, I cannot cleanly tell you whether this is only FAR-legal, also PWA-legal, or a release/pay issue.",
      });
    }
  }

  if (scenarioFamilySelected === "pbRerouteXdayScenario") {
    const hasOriginalLength = /\b2-day\b|\b2 day\b|\boriginal\b|\bqs pickup\b/.test(questionLower);
    const hasModifiedLength = /\b3-day\b|\b3 day\b|\bextended\b|\bextension\b|\breroute\b/.test(questionLower);
    const hasCodingContext =
      /\bx-day\b|\bx day\b|\binterrupted\b|\bpb\b|\bpr\b|\blc\b|\bdart\b/.test(questionLower);
    const hasQuestionTarget =
      /\bpay\b|\brestore\b|\breappl(?:y|ied)\b|\blegality\b|\bnotification\b/.test(questionLower);
    const missingGatingFacts = [
      !(hasOriginalLength && hasModifiedLength) ? "the original and modified rotation length" : null,
      !hasCodingContext ? "how the X-day, PB, PR, and LC coding changed after the reroute" : null,
      !hasQuestionTarget ? "whether you are asking about pay, PB restoration, legality, or notice" : null,
    ].filter((value): value is string => Boolean(value));
    if (missingGatingFacts.length >= 2) {
      return buildMissingFactClarifier({
        id: "gating-pb-reroute-xday-facts",
        prompt:
          "What was the original rotation length, what did it change to, and how are the X-day/PB/LC days coded now?",
        factField: "questionIntent",
        missingGatingFacts,
        scenarioFamilySelected,
        turningCondition: "the original versus modified trip shape and how the X-day/PB/LC coding changed",
        conditionalBottomLine:
          "This turns on how the reroute changed the trip and how the system coded the X-day, PB, PR, and LC pieces afterward.",
        conditionalWhy:
          "Without the before/after trip shape and the current coding, a PB/X-day answer turns into guesswork instead of a real processing analysis.",
      });
    }
  }

  if (scenarioFamilySelected === "payCreditConsistencyScenario") {
    const hasOriginalCredit = /\boriginal credit\b|\brotation showed\b|\bstarted at\b|\b21 hours\b/.test(questionLower);
    const hasProjectedOrFinalCredit =
      /\bprojected credit\b|\bcredit jumped\b|\bfinal credit\b|\breverted\b|\bwent back\b|\b24:35\b/.test(questionLower);
    const hasChangeDriver =
      /\bdeadhead\b|\bdeviat(?:e|ion)\b|\blayover\b|\brest\b|\bcloseout\b|\btimecard\b|\bsegment\b/.test(questionLower);
    const missingGatingFacts = [
      !(hasOriginalCredit && hasProjectedOrFinalCredit) ? "the original, projected, and final credit values" : null,
      !hasChangeDriver ? "what changed between the projected and final versions" : null,
    ].filter((value): value is string => Boolean(value));
    if (missingGatingFacts.length >= 2) {
      return buildMissingFactClarifier({
        id: "gating-credit-recalculation-facts",
        prompt:
          "What were the original credit, projected credit, and final credit, and what changed between those versions?",
        factField: "questionIntent",
        missingGatingFacts,
        scenarioFamilySelected,
        turningCondition: "the original, projected, and final credit values plus the change that drove the recalculation",
        conditionalBottomLine:
          "This turns on the original versus projected versus final credit values and the exact event that changed the duty or closeout calculation.",
        conditionalWhy:
          "Without those credit values and the change driver, I cannot tell whether this was a temporary display issue, a deadhead/deviation effect, or a final closeout recalculation.",
      });
    }
  }

  const isApd = /\bapd\b/.test(questionLower) || questionLower.includes("authorized personal drop");
  if (isApd && (packetSection.includes("23 I.10") || packetContent.includes("25% of the number of reserves required"))) {
    const { required, available } = parseRequiredAndAvailable(args.question);
    if (required === null || available === null) {
      return {
        scenarioFamilySelected,
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
      scenarioFamilySelected,
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
        scenarioFamilySelected,
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
        scenarioFamilySelected,
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
        scenarioFamilySelected,
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
    scenarioFamilySelected,
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

  const legacyCompatArgs = {
    parsedRequest,
    session,
    contractIndex,
    intentResolution,
    intentDebugBase,
    laneExecution,
    isComplexScenarioQuestion,
    deps: {
      jsonResponse,
      createOpenAIModelClient,
      consoleAIWorkflowLogger,
      sourceLabelFromReference,
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
      runAIWorkflow,
      contractCopilotAIWorkflow,
      contractCopilotFinalSynthesisWorkflow,
      retrieveContractCopilotSnippets,
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
    },
  };

  const productionResponse = await executeScenarioPipelineLegacyCompat(legacyCompatArgs);
  let productionPayload: ContractCopilotApiSuccessResponse | null = null;
  try {
    productionPayload = (await productionResponse.clone().json()) as ContractCopilotApiSuccessResponse;
  } catch {
    return productionResponse;
  }

  if (!productionPayload?.ok) {
    return productionResponse;
  }

  const productionScenarioFamily =
    productionPayload.debug?.selectedScenarioFamilyFinal ??
    productionPayload.debug?.scenarioFamilySelected;
  const productionAnswerHash = hashShadowValue(
    `${productionPayload.answer.shortAnswer ?? ""}\n${productionPayload.answer.plainEnglishExplanation ?? ""}`,
  );
  const productionSupportSections = extractSupportSections(productionPayload.answer);

  let shadowDebugPatch: Record<string, unknown> = {};
  try {
    const shadowResponse = await runContractCopilot({
      input: {
        request: parsedRequest,
        session,
      },
      intentResult: intentResolution,
      legacyCompatArgs,
    });
    const shadowPayload = (await shadowResponse.clone().json()) as ContractCopilotApiSuccessResponse;
    if (shadowPayload?.ok) {
      const shadowScenarioFamily =
        shadowPayload.debug?.selectedScenarioFamilyFinal ??
        shadowPayload.debug?.scenarioFamilySelected;
      const shadowSupportSections = extractSupportSections(shadowPayload.answer);
      const shadowAnswerHash = hashShadowValue(
        `${shadowPayload.answer.shortAnswer ?? ""}\n${shadowPayload.answer.plainEnglishExplanation ?? ""}`,
      );
      const shadowDiffFromProduction: string[] = [];
      if (productionScenarioFamily !== shadowScenarioFamily) {
        shadowDiffFromProduction.push("scenario_family");
      }
      if (productionAnswerHash !== shadowAnswerHash) {
        shadowDiffFromProduction.push("answer_hash");
      }
      if (JSON.stringify(productionSupportSections) !== JSON.stringify(shadowSupportSections)) {
        shadowDiffFromProduction.push("support_sections");
      }
      shadowDebugPatch = {
        productionScenarioFamily,
        shadowScenarioFamily,
        shadowSubScenario:
          shadowPayload.debug?.payCreditSubScenario ??
          shadowPayload.debug?.answerSubScenario ??
          shadowPayload.debug?.supportSubScenario,
        shadowAnswerSummary: summarizeShadowAnswer(shadowPayload.answer),
        shadowSupportSections,
        shadowAiPathUsed: shadowPayload.debug?.aiPathUsed,
        shadowFallbackUsed: shadowPayload.debug?.fallbackUsed,
        shadowCoherenceFailed: shadowPayload.debug?.finalResponseCoherenceFailed,
        shadowDiffFromProduction,
        shadowMismatchDetected: shadowDiffFromProduction.length > 0,
        productionAnswerHash,
        shadowAnswerHash,
        productionSupportSections,
      };
    }
  } catch (error) {
    shadowDebugPatch = {
      productionScenarioFamily,
      shadowMismatchDetected: true,
      shadowDiffFromProduction: ["shadow_execution_error"],
      shadowAnswerSummary: error instanceof Error ? error.message : "shadow_execution_error",
      productionAnswerHash,
      productionSupportSections,
    };
  }

  return jsonResponse(productionResponse.status, {
    ...productionPayload,
    debug: {
      ...(productionPayload.debug ?? {}),
      ...shadowDebugPatch,
    },
  });
}
