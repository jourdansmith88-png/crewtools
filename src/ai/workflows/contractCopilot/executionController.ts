import type { ContractDocumentChunk } from "../../retrieval/contracts/documentTypes.ts";
import { searchContractDocuments } from "../../retrieval/contracts/searchContracts.ts";
import type { ContractCopilotApiSuccessResponse } from "./api.ts";
import type { ContractCopilotIntentResolution, ParsedPayRateQuestion } from "./intentRouter.ts";
import type { ContractCopilotSession, ParsedScenarioFacts } from "../../../types/contractCopilot.ts";

type StructuredPayRow = {
  equipmentLabel: string;
  seat: string;
  longevityYear: number;
  hourlyRate: number;
};

export type ContractCopilotExecutionIndexes = {
  pwaChunks: ContractDocumentChunk[];
  compensationChunks: ContractDocumentChunk[];
  compensationStructuredPayRows: StructuredPayRow[];
  schedulerChunks: ContractDocumentChunk[];
  hasPwaIndex: boolean;
  hasCompensationIndex: boolean;
  hasSchedulerIndex: boolean;
};

export type ContractCopilotLaneExecutionResult =
  | {
      kind: "handled";
      response: ContractCopilotApiSuccessResponse;
    }
  | {
      kind: "continue";
      laneDebug: {
        laneEnforced: true;
        expectedTool: string;
        retrievalAttempted: boolean;
        laneExecutionResult: "success" | "controlled_failure" | "clarification";
        fallbackUsed: boolean;
        fallthroughPrevented: boolean;
        retryAttempts: string[];
        sourceAvailability: {
          hasPwaIndex: boolean;
          hasCompensationIndex: boolean;
          hasSchedulerIndex: boolean;
          compensationRowsAvailable: number;
        };
      };
    };

function sourceAvailability(indexes: ContractCopilotExecutionIndexes) {
  return {
    hasPwaIndex: indexes.hasPwaIndex,
    hasCompensationIndex: indexes.hasCompensationIndex,
    hasSchedulerIndex: indexes.hasSchedulerIndex,
    compensationRowsAvailable: indexes.compensationStructuredPayRows.length,
  };
}

function nextAnsweredSession(session: ContractCopilotSession): ContractCopilotSession {
  return {
    ...session,
    unresolvedQuestion: undefined,
    status: "answered",
  };
}

function nextAwaitingSession(session: ContractCopilotSession, unresolvedQuestion: string): ContractCopilotSession {
  return {
    ...session,
    unresolvedQuestion,
    status: "awaiting_reply",
    clarificationCount: session.clarificationCount + 1,
  };
}

function buildDebugBase(args: {
  intentResult: ContractCopilotIntentResolution;
  indexes: ContractCopilotExecutionIndexes;
  expectedTool: string;
  retrievalAttempted: boolean;
  laneExecutionResult: "success" | "controlled_failure" | "clarification";
  fallbackUsed: boolean;
  fallthroughPrevented: boolean;
  retryAttempts?: string[];
  toolsUsed?: string[];
  retrievalSourcesUsed?: string[];
  sourcesUsed?: string[];
  pwaSectionsUsed?: string[];
  compensationChunksUsed?: string[];
  schedulerChunksUsed?: string[];
  structuredRowsUsed?: string[];
  missingSourceWarnings?: string[];
  aiSynthesisUsed?: boolean;
  extra?: Partial<NonNullable<ContractCopilotApiSuccessResponse["debug"]>>;
}) {
  return {
    mode: "fallback" as const,
    intentType: args.intentResult.intentType,
    selectedLane: args.intentResult.selectedLane,
    requiredFieldsFound: args.intentResult.requiredFieldsFound,
    missingFields: args.intentResult.missingFields,
    laneEnforced: true,
    expectedTool: args.expectedTool,
    toolsUsed: args.toolsUsed ?? args.intentResult.toolsUsed,
    aiSynthesisUsed: args.aiSynthesisUsed ?? false,
    OPENAI_API_KEYPresent: Boolean(process.env.OPENAI_API_KEY),
    modelClientCalled: false,
    modelClientSucceeded: false,
    modelClientError: undefined,
    aiSynthesisAttempted: false,
    aiSynthesisRejected: false,
    aiRejectionReason: undefined,
    scenarioProceedWithPartialContext: false,
    retrievalAttempted: args.retrievalAttempted,
    laneExecutionResult: args.laneExecutionResult,
    documentShortcutUsed: args.intentResult.selectedLane === "document_section_explanation",
    clarificationReason:
      args.intentResult.selectedLane === "clarification_needed"
        ? args.intentResult.missingFields.join(", ")
        : undefined,
    fallbackUsed: args.fallbackUsed,
    fallthroughPrevented: args.fallthroughPrevented,
    retryAttempts: args.retryAttempts ?? [],
    retrievalSourcesUsed: args.retrievalSourcesUsed ?? [],
    sourcesAvailable: [
      args.indexes.hasPwaIndex ? "PWA" : null,
      args.indexes.hasCompensationIndex ? "Compensation Manual" : null,
      args.indexes.hasSchedulerIndex ? "Scheduler Manual" : null,
    ].filter((value): value is string => Boolean(value)),
    sourcesUsed: args.sourcesUsed ?? [],
    pwaSectionsUsed: args.pwaSectionsUsed ?? [],
    compensationChunksUsed: args.compensationChunksUsed ?? [],
    schedulerChunksUsed: args.schedulerChunksUsed ?? [],
    structuredRowsUsed: args.structuredRowsUsed ?? [],
    missingSourceWarnings: args.missingSourceWarnings ?? [],
    sourceAvailability: sourceAvailability(args.indexes),
    ...args.extra,
  } satisfies NonNullable<ContractCopilotApiSuccessResponse["debug"]>;
}

function parseRequiredAndAvailable(question: string) {
  const normalized = question.toLowerCase();
  const requiredMatch =
    normalized.match(/required reserves?(?:\s+are|\s+is|\s+were|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/reserves required(?:\s+for(?:\s+that)?\s+day)?(?:\s+are|\s+is|\s+were|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/required(?:\s+for(?:\s+that)?\s+day)?\s+(?:is|are|was|were|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/\b(\d+(?:\.\d+)?)\s+required\b/);
  const availableMatch =
    normalized.match(/available(?:\s+are|\s+is|\s+was|\s+were|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/reserves available(?:\s+are|\s+is|\s+was|\s+were|=)\s*(\d+(?:\.\d+)?)/) ??
    normalized.match(/\b(\d+(?:\.\d+)?)\s+available\b/);

  return {
    required: requiredMatch ? Number(requiredMatch[1]) : null,
    available: availableMatch ? Number(availableMatch[1]) : null,
  };
}

function findStructuredPayRate(args: {
  rows: StructuredPayRow[];
  seat: string;
  equipmentLabel: string;
  longevityYear: number;
}) {
  return (
    args.rows.find(
      (row) =>
        row.seat === args.seat &&
        row.equipmentLabel === args.equipmentLabel &&
        row.longevityYear === args.longevityYear,
    )?.hourlyRate ?? null
  );
}

function buildPayRateClarifier(args: {
  question: string;
  session: ContractCopilotSession;
  intentResult: ContractCopilotIntentResolution;
  indexes: ContractCopilotExecutionIndexes;
  parsed: ParsedPayRateQuestion;
}): ContractCopilotApiSuccessResponse {
  const missing = args.intentResult.missingFields;
  const prompt = missing.includes("equipment")
    ? "Which aircraft are you on?"
    : missing.includes("seat")
      ? "Are you a Captain or a First Officer?"
      : "What longevity year are you asking about?";
  return {
    ok: true,
    mode: "fallback",
    answer: {
      status: "needs_clarification",
      scenarioLabel: "Direct pay rate lookup",
      answerCompleteness: "provisional",
      shortAnswer: "I can do an exact pay-rate lookup, but I need one missing field first.",
      plainEnglishExplanation: prompt,
      confidence: "medium",
      supportLevel: "manual_backed",
      assumptions: [],
      evidenceSummary: [],
      references: [],
      clarifyingQuestions: [
        {
          id: "clarify-pay-rate-field",
          prompt,
          factField: "questionIntent",
          required: true,
        },
      ],
    },
    detectedScenario: null,
    nextSession: nextAwaitingSession(args.session, args.question),
    meta: {
      fallbackReason: "direct_pay_rate_lookup_clarification",
    },
    debug: buildDebugBase({
      intentResult: args.intentResult,
      indexes: args.indexes,
      expectedTool: "compensationStructuredPayRows",
      retrievalAttempted: false,
      laneExecutionResult: "clarification",
      fallbackUsed: true,
      fallthroughPrevented: true,
      toolsUsed: ["pay_rate_parser"],
      retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
      aiSynthesisUsed: false,
      extra: {
        directLookupTriggered: true,
        directLookupType: "pay_rate",
        parsedEquipment: args.parsed.matchedEquipmentLabels,
        parsedSeat: args.parsed.seat,
        parsedLongevityYear: args.parsed.longevityYear,
        compensationRowsAvailable: args.indexes.compensationStructuredPayRows.length,
        lookupSource: "compensationManualIndex.json",
      },
    }),
  };
}

function executeDirectPayRateLookup(args: {
  question: string;
  session: ContractCopilotSession;
  indexes: ContractCopilotExecutionIndexes;
  intentResult: ContractCopilotIntentResolution;
}) {
  const parsed = args.intentResult.parsedPayRateQuestion;
  if (!parsed) {
    return null;
  }
  if (!args.indexes.hasCompensationIndex || args.indexes.compensationStructuredPayRows.length === 0) {
    return {
      ok: true,
      mode: "fallback",
      answer: {
        status: "insufficient_support",
        scenarioLabel: "Direct pay rate lookup",
        answerCompleteness: "provisional",
        shortAnswer: "I found the lookup fields, but the exact pay table is not currently indexed.",
        plainEnglishExplanation: "Compensation index missing; rebuild with npm run build:compensation-index.",
        confidence: "low",
        supportLevel: "inference_heavy",
        assumptions: [],
        evidenceSummary: [],
        references: [],
      },
      detectedScenario: null,
      nextSession: nextAnsweredSession(args.session),
      meta: { fallbackReason: "missing_compensation_index" },
      debug: buildDebugBase({
        intentResult: args.intentResult,
        indexes: args.indexes,
        expectedTool: "compensationStructuredPayRows",
        retrievalAttempted: false,
        laneExecutionResult: "controlled_failure",
        fallbackUsed: true,
        fallthroughPrevented: true,
        retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
        aiSynthesisUsed: false,
        extra: {
          directLookupTriggered: true,
          directLookupType: "pay_rate",
          parsedEquipment: parsed.matchedEquipmentLabels,
          parsedSeat: parsed.seat,
          parsedLongevityYear: parsed.longevityYear,
          compensationRowsAvailable: args.indexes.compensationStructuredPayRows.length,
          lookupSource: "compensationManualIndex.json",
        },
      }),
    } satisfies ContractCopilotApiSuccessResponse;
  }

  if (!parsed.seat || !parsed.longevityYear || parsed.matchedEquipmentLabels.length === 0) {
    return buildPayRateClarifier({
      question: args.question,
      session: args.session,
      intentResult: args.intentResult,
      indexes: args.indexes,
      parsed,
    });
  }

  const rows = args.indexes.compensationStructuredPayRows;
  if (parsed.matchedEquipmentLabels.length === 1) {
    const rate = findStructuredPayRate({
      rows,
      seat: parsed.seat,
      equipmentLabel: parsed.matchedEquipmentLabels[0],
      longevityYear: parsed.longevityYear,
    });
    if (rate !== null) {
      return {
        ok: true,
        mode: "fallback",
        answer: {
          status: "answered",
          scenarioLabel: "Direct pay rate lookup",
          answerCompleteness: "resolved",
          shortAnswer: `Year ${parsed.longevityYear} ${parsed.matchedEquipmentLabels[0]} ${parsed.seat} hourly block rate: $${rate.toFixed(2)}/hour.`,
          plainEnglishExplanation: "That is the exact structured pay-table value from the compensation index.",
          confidence: "high",
          supportLevel: "manual_backed",
          assumptions: [],
          evidenceSummary: [],
          references: [
            {
              label: "Structured pay table",
              sourceId: "compensation_manual",
              displaySourceLabel: "Compensation Manual",
              section: "Section 3 B Pay Tables",
              quoteSnippet: `${parsed.matchedEquipmentLabels[0]} ${parsed.seat} Year ${parsed.longevityYear}: $${rate.toFixed(2)}/hour`,
              ruleType: "scheduler_practice",
            },
          ],
        },
        detectedScenario: null,
        nextSession: nextAnsweredSession(args.session),
        meta: { fallbackReason: "direct_pay_rate_lookup" },
        debug: buildDebugBase({
          intentResult: args.intentResult,
          indexes: args.indexes,
          expectedTool: "compensationStructuredPayRows",
          retrievalAttempted: false,
          laneExecutionResult: "success",
          fallbackUsed: true,
          fallthroughPrevented: true,
          retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
          structuredRowsUsed: [`${parsed.matchedEquipmentLabels[0]} ${parsed.seat} Year ${parsed.longevityYear}`],
          sourcesUsed: ["Compensation Manual"],
          aiSynthesisUsed: false,
          extra: {
            directLookupTriggered: true,
            directLookupType: "pay_rate",
            parsedEquipment: parsed.matchedEquipmentLabels,
            parsedSeat: parsed.seat,
            parsedLongevityYear: parsed.longevityYear,
            compensationRowsAvailable: rows.length,
            lookupSource: "compensationManualIndex.json",
            governingSectionUsed: "Compensation Manual:Section 3 B Pay Tables",
          },
        }),
      } satisfies ContractCopilotApiSuccessResponse;
    }
  }

  const a220Rates = parsed.matchedEquipmentLabels
    .map((equipmentLabel) => ({
      equipmentLabel,
      rate: findStructuredPayRate({
        rows,
        seat: parsed.seat,
        equipmentLabel,
        longevityYear: parsed.longevityYear,
      }),
    }))
    .filter((item): item is { equipmentLabel: string; rate: number } => item.rate !== null);

  if (a220Rates.length > 0) {
    return {
      ok: true,
      mode: "fallback",
      answer: {
        status: "partial_answer",
        scenarioLabel: "Direct pay rate lookup",
        answerCompleteness: "provisional",
        shortAnswer: `A220 has two rates. Year ${parsed.longevityYear} A-220-100 ${parsed.seat}: $${a220Rates.find((item) => item.equipmentLabel === "A-220-100")?.rate.toFixed(2)}/hour. Year ${parsed.longevityYear} A-220-300 ${parsed.seat}: $${a220Rates.find((item) => item.equipmentLabel === "A-220-300")?.rate.toFixed(2)}/hour.`,
        plainEnglishExplanation: "You only need the variant if you want one exact A220 rate.",
        confidence: "high",
        supportLevel: "manual_backed",
        assumptions: [],
        evidenceSummary: [],
        references: [
          {
            label: "Structured pay table",
            sourceId: "compensation_manual",
            displaySourceLabel: "Compensation Manual",
            section: "Section 3 B Pay Tables",
            quoteSnippet: a220Rates
              .map((item) => `${item.equipmentLabel} ${parsed.seat} Year ${parsed.longevityYear}: $${item.rate.toFixed(2)}/hour`)
              .join(" | "),
            ruleType: "scheduler_practice",
          },
        ],
      },
      detectedScenario: null,
      nextSession: nextAnsweredSession(args.session),
      meta: { fallbackReason: "direct_pay_rate_lookup" },
      debug: buildDebugBase({
        intentResult: args.intentResult,
        indexes: args.indexes,
        expectedTool: "compensationStructuredPayRows",
        retrievalAttempted: false,
        laneExecutionResult: "success",
        fallbackUsed: true,
        fallthroughPrevented: true,
        retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
        structuredRowsUsed: a220Rates.map((item) => `${item.equipmentLabel} ${parsed.seat} Year ${parsed.longevityYear}`),
        sourcesUsed: ["Compensation Manual"],
        aiSynthesisUsed: false,
        extra: {
          directLookupTriggered: true,
          directLookupType: "pay_rate",
          parsedEquipment: parsed.matchedEquipmentLabels,
          parsedSeat: parsed.seat,
          parsedLongevityYear: parsed.longevityYear,
          compensationRowsAvailable: rows.length,
          lookupSource: "compensationManualIndex.json",
          governingSectionUsed: "Compensation Manual:Section 3 B Pay Tables",
        },
      }),
    } satisfies ContractCopilotApiSuccessResponse;
  }

  return {
    ok: true,
    mode: "fallback",
    answer: {
      status: "insufficient_support",
      scenarioLabel: "Direct pay rate lookup",
      answerCompleteness: "provisional",
      shortAnswer: "I found the lookup fields, but the exact row is not currently indexed.",
      plainEnglishExplanation: "The compensation index is available, but that exact pay-table row was not found.",
      confidence: "low",
      supportLevel: "inference_heavy",
      assumptions: [],
      evidenceSummary: [],
      references: [],
    },
    detectedScenario: null,
    nextSession: nextAnsweredSession(args.session),
    meta: { fallbackReason: "missing_structured_pay_row" },
    debug: buildDebugBase({
      intentResult: args.intentResult,
      indexes: args.indexes,
      expectedTool: "compensationStructuredPayRows",
      retrievalAttempted: false,
      laneExecutionResult: "controlled_failure",
      fallbackUsed: true,
      fallthroughPrevented: true,
      retrievalSourcesUsed: ["compensationManualIndex.json:structuredPayRows"],
      sourcesUsed: ["Compensation Manual"],
      aiSynthesisUsed: false,
      extra: {
        directLookupTriggered: true,
        directLookupType: "pay_rate",
        parsedEquipment: parsed.matchedEquipmentLabels,
        parsedSeat: parsed.seat,
        parsedLongevityYear: parsed.longevityYear,
        compensationRowsAvailable: rows.length,
        lookupSource: "compensationManualIndex.json",
      },
    }),
  } satisfies ContractCopilotApiSuccessResponse;
}

function executeApdThresholdCalculation(args: {
  question: string;
  session: ContractCopilotSession;
  indexes: ContractCopilotExecutionIndexes;
  intentResult: ContractCopilotIntentResolution;
}) {
  const { required, available } = parseRequiredAndAvailable(args.question);
  if (required === null || available === null) {
    return {
      ok: true,
      mode: "fallback",
      answer: {
        status: "needs_clarification",
        scenarioLabel: "APD threshold calculation",
        answerCompleteness: "provisional",
        shortAnswer: "I can answer the APD threshold directly once I have both reserve counts.",
        plainEnglishExplanation: "At the time APD was processed, how many reserves were required and how many were available?",
        confidence: "medium",
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
      nextSession: nextAwaitingSession(args.session, args.question),
      meta: { fallbackReason: "apd_threshold_clarification" },
      debug: buildDebugBase({
        intentResult: args.intentResult,
        indexes: args.indexes,
        expectedTool: "apd_threshold_calculator",
        retrievalAttempted: false,
        laneExecutionResult: "clarification",
        fallbackUsed: true,
        fallthroughPrevented: true,
        retrievalSourcesUsed: ["PWA:Section 23 I.10"],
        sourcesUsed: ["PWA"],
        pwaSectionsUsed: ["Section 23 I.10"],
        structuredRowsUsed: ["APD threshold: 25% of required reserves"],
        aiSynthesisUsed: false,
      }),
    } satisfies ContractCopilotApiSuccessResponse;
  }

  const threshold = required * 0.25;
  const clears = available >= threshold;
  return {
    ok: true,
    mode: "fallback",
    answer: {
      status: "answered",
      scenarioLabel: "APD threshold calculation",
      answerCompleteness: "resolved",
      shortAnswer: clears
        ? `Yes, this should probably go through. ${available} available against ${required} required is above the APD threshold.`
        : `No, that probably will not clear. ${available} available against ${required} required is below the APD threshold.`,
      plainEnglishExplanation: `Section 23 I.10 uses 25% of required reserves at the time of processing, so the threshold here is ${threshold.toFixed(2)}.`,
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
    nextSession: nextAnsweredSession(args.session),
    meta: { fallbackReason: "direct_apd_threshold_calculation" },
    debug: buildDebugBase({
      intentResult: args.intentResult,
      indexes: args.indexes,
      expectedTool: "apd_threshold_calculator",
      retrievalAttempted: false,
      laneExecutionResult: "success",
      fallbackUsed: true,
      fallthroughPrevented: true,
      retrievalSourcesUsed: ["PWA:Section 23 I.10"],
      sourcesUsed: ["PWA"],
      pwaSectionsUsed: ["Section 23 I.10"],
      structuredRowsUsed: [`required=${required}`, `available=${available}`, `threshold=${threshold.toFixed(2)}`],
      aiSynthesisUsed: false,
    }),
  } satisfies ContractCopilotApiSuccessResponse;
}

function parseRequestedSection(question: string) {
  const direct =
    question.match(/\bsection\s+(\d{1,2}(?:\s*\([A-Z]\)|\s+[A-Z])?(?:\.?\d+)?(?:\.[A-Z])?)/i) ??
    question.match(/\bpwa\s+(\d{1,2}(?:\s*\([A-Z]\)|\s+[A-Z])?(?:\.?\d+)?(?:\.[A-Z])?)/i) ??
    question.match(/§\s*(\d{1,2}(?:\s*\([A-Z]\)|\s+[A-Z])?(?:\.?\d+)?(?:\.[A-Z])?)/i) ??
    question.match(/\b(\d{1,2}\.[A-Z](?:\.\d+)?|\d{1,2}\s*\([A-Z]\)|\d{1,2}\s+[A-Z](?:\.?\d+)?)\b/i);

  return direct ? normalizeSectionReference(direct[1]) : undefined;
}

function parentSection(section: string) {
  const normalized = normalizeSectionReference(section).replace(/^Section\s+/i, "");
  const parent = normalized.replace(/\.\d+[A-Z]?$/i, "").trim();
  return parent === normalized ? undefined : `Section ${parent}`;
}

function normalizeSectionReference(section: string) {
  const cleaned = section
    .replace(/^pwa\s+/i, "")
    .replace(/^section\s+/i, "")
    .replace(/^§\s*/i, "")
    .replace(/\s*\(([A-Z])\)/gi, " $1")
    .replace(/(\d{1,2})\.\s*([A-Z])/g, "$1 $2")
    .replace(/([A-Z])(\d+)/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return `Section ${cleaned}`;
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/^section\s+/i, "")
    .replace(/^pwa\s+/i, "")
    .replace(/^§\s*/i, "")
    .replace(/\s*\(([a-z])\)/gi, " $1")
    .replace(/(\d{1,2})\.\s*([a-z])/g, "$1 $2")
    .replace(/\s*\.\s*/g, ".")
    .replace(/([a-z])\s*\.\s*(\d+)/g, "$1.$2")
    .replace(/(\d)\s*\.\s*([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSectionParts(section: string) {
  const normalized = normalizeSearchValue(section);
  const match = normalized.match(/^(\d{1,2})(?:\s+([a-z]))?/i);
  return {
    topLevel: match?.[1] ?? null,
    subsection: match?.[2]?.toUpperCase() ?? null,
  };
}

function chunkSectionSearchText(chunk: ContractDocumentChunk) {
  return normalizeSearchValue(
    [
      chunk.section,
      chunk.title ?? "",
      ...(chunk.sectionAnchors ?? []),
      ...chunk.crossRefs,
      chunk.text.slice(0, 1400),
    ].join(" "),
  );
}

function normalizeAnchorPool(chunk: ContractDocumentChunk) {
  return [chunk.section, chunk.title ?? "", ...(chunk.sectionAnchors ?? []), ...chunk.crossRefs]
    .map((value) => value.trim())
    .filter(Boolean);
}

function findExactSectionMatches(chunks: ContractDocumentChunk[], requestedSection: string) {
  const normalizedRequested = normalizeSearchValue(requestedSection);
  const normalizedWithoutSectionPrefix = normalizedRequested.replace(/^section\s+/i, "");
  const subsectionPattern = new RegExp(`(?:^|\\b)${normalizedWithoutSectionPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|\\.)`, "i");
  const requestedParts = parseSectionParts(requestedSection);

  const candidates = chunks
    .map((chunk) => {
      const searchable = chunkSectionSearchText(chunk);
      const anchorPool = normalizeAnchorPool(chunk);
      const exactSectionHit = normalizeSearchValue(chunk.section) === normalizedRequested;
      const exactTitleHit = normalizeSearchValue(chunk.title ?? "") === normalizedRequested;
      const exactSectionAnchorHit = (chunk.sectionAnchors ?? []).some(
        (anchor) => normalizeSearchValue(anchor) === normalizedRequested,
      );
      const exactCrossRefHit = chunk.crossRefs.some(
        (crossRef) => normalizeSearchValue(crossRef) === normalizedRequested,
      );
      const exactAnchorHit = exactSectionHit || exactTitleHit || exactSectionAnchorHit || exactCrossRefHit;
      const exactRefCount =
        (searchable.match(new RegExp(normalizedWithoutSectionPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? [])
          .length;
      const subsectionTextHit = subsectionPattern.test(searchable);
      const chunkParts = parseSectionParts(chunk.section);
      const topLevelMatch = requestedParts.topLevel != null && chunkParts.topLevel === requestedParts.topLevel;
      const exactAnchorPoolHit = anchorPool.some((anchor) => normalizeSearchValue(anchor) === normalizedRequested);
      if (!exactAnchorHit && !subsectionTextHit) {
        return null;
      }
      return {
        chunk,
        exactAnchorHit,
        exactSectionHit,
        exactTitleHit,
        exactSectionAnchorHit,
        exactCrossRefHit,
        exactAnchorPoolHit,
        exactRefCount,
        topLevelMatch,
        sourcePriority:
          chunk.source === "pwa" ? 3 : chunk.source === "compensation_manual" ? 2 : 1,
        score:
          (exactSectionHit ? 240 : 0) +
          (exactTitleHit ? 200 : 0) +
          (exactSectionAnchorHit ? 180 : 0) +
          (exactCrossRefHit ? 60 : 0) +
          (exactAnchorPoolHit ? 25 : 0) +
          (requestedParts.subsection && subsectionTextHit ? 70 : 0) +
          (topLevelMatch ? 15 : 0) +
          exactRefCount * 8 +
          (chunk.source === "pwa" ? 12 : chunk.source === "compensation_manual" ? 6 : 2),
      };
    })
    .filter(
      (
        item,
      ): item is {
        chunk: ContractDocumentChunk;
        exactAnchorHit: boolean;
        exactSectionHit: boolean;
        exactTitleHit: boolean;
        exactSectionAnchorHit: boolean;
        exactCrossRefHit: boolean;
        exactAnchorPoolHit: boolean;
        exactRefCount: number;
        topLevelMatch: boolean;
        sourcePriority: number;
        score: number;
      } => Boolean(item),
    )
    .sort((left, right) => right.score - left.score || left.chunk.page - right.chunk.page);

  if (candidates.length === 0) {
    return [];
  }

  const highestSourcePriority = candidates[0].sourcePriority;
  let filtered = candidates.filter((candidate) => candidate.sourcePriority === highestSourcePriority);

  if (filtered.some((candidate) => candidate.exactSectionHit || candidate.exactTitleHit || candidate.exactSectionAnchorHit)) {
    filtered = filtered.filter(
      (candidate) => candidate.exactSectionHit || candidate.exactTitleHit || candidate.exactSectionAnchorHit,
    );
  } else if (filtered.some((candidate) => candidate.exactAnchorHit)) {
    filtered = filtered.filter((candidate) => candidate.exactAnchorHit && !candidate.exactCrossRefHit);
    if (filtered.length === 0) {
      filtered = candidates.filter((candidate) => candidate.sourcePriority === highestSourcePriority && candidate.exactAnchorHit);
    }
  } else if (requestedParts.subsection) {
    const best = filtered.find((candidate) => candidate.topLevelMatch) ?? filtered[0];
    filtered = filtered.filter(
      (candidate) =>
        candidate.topLevelMatch &&
        candidate.chunk.source === best.chunk.source &&
        Math.abs(candidate.chunk.page - best.chunk.page) <= 2 &&
        candidate.exactRefCount > 0,
    );
  }

  return filtered.map((candidate) => candidate.chunk);
}

function extractRelevantSectionExcerpt(chunk: ContractDocumentChunk, requestedSection: string) {
  const text = chunk.text.replace(/\s+/g, " ").trim();
  const requestedNeedle = normalizeSearchValue(requestedSection).replace(/^section\s+/i, "");
  const patterns = [
    new RegExp(requestedNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    /\brotation guarantee\b/i,
    /\bharmed pilot\b/i,
    /\bauto accept\b/i,
    /\bsilver slip\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || match.index == null) {
      continue;
    }
    const start = Math.max(0, match.index - 120);
    const end = Math.min(text.length, match.index + 520);
    return text.slice(start, end).trim();
  }

  return text.slice(0, 520);
}

function displaySectionForMatch(chunk: ContractDocumentChunk, requestedSection: string) {
  const requestedNeedle = normalizeSearchValue(requestedSection).replace(/^section\s+/i, "");
  const searchable = chunkSectionSearchText(chunk);
  if (searchable.includes(requestedNeedle)) {
    return requestedSection;
  }
  return chunk.section;
}

function summarizeChunks(chunks: ContractDocumentChunk[]) {
  return chunks
    .slice(0, 2)
    .map((chunk) => chunk.text.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 650);
}

function executeDocumentSectionExplanation(args: {
  question: string;
  session: ContractCopilotSession;
  indexes: ContractCopilotExecutionIndexes;
  intentResult: ContractCopilotIntentResolution;
}) {
  const requestedSection = args.intentResult.requestedSection ?? parseRequestedSection(args.question);
  const retryAttempts: string[] = [];
  if (!requestedSection) {
    return {
      ok: true,
      mode: "fallback",
      answer: {
        status: "needs_clarification",
        scenarioLabel: "Document explanation",
        answerCompleteness: "provisional",
        shortAnswer: "I can explain a section directly once I have the section reference.",
        plainEnglishExplanation: "Which section do you want explained?",
        confidence: "medium",
        supportLevel: "mixed",
        assumptions: [],
        evidenceSummary: [],
        references: [],
      },
      detectedScenario: null,
      nextSession: nextAwaitingSession(args.session, args.question),
      meta: { fallbackReason: "missing_section_reference" },
      debug: buildDebugBase({
        intentResult: args.intentResult,
        indexes: args.indexes,
        expectedTool: "section_packet_retrieval",
        retrievalAttempted: false,
        laneExecutionResult: "clarification",
        fallbackUsed: true,
        fallthroughPrevented: true,
        retryAttempts,
        aiSynthesisUsed: false,
      }),
    } satisfies ContractCopilotApiSuccessResponse;
  }

  const normalizedRequestedSection = normalizeSectionReference(requestedSection);
  const lowerQuestion = args.question.toLowerCase();
  const twentyThreeM7LogLookup =
    normalizeSearchValue(normalizedRequestedSection).includes(normalizeSearchValue("Section 23 M.7")) &&
    (
      lowerQuestion.includes("where are") ||
      lowerQuestion.includes("affected pilots") ||
      lowerQuestion.includes("logs") ||
      lowerQuestion.includes("shown") ||
      lowerQuestion.includes("icrew")
    );

  const parent = parentSection(normalizedRequestedSection);
  const containsNeedle = normalizeSearchValue(normalizedRequestedSection).replace(/^section\s+/i, "");

  function attemptSectionLookup(chunks: ContractDocumentChunk[], sourceLabel: string) {
    retryAttempts.push(`${sourceLabel}:exact_section_reference:${normalizedRequestedSection}`);
    let found = findExactSectionMatches(chunks, normalizedRequestedSection);
    if (found.length === 0) {
      retryAttempts.push(`${sourceLabel}:contains_section_reference:${normalizedRequestedSection}`);
      found = chunks.filter((chunk) => chunkSectionSearchText(chunk).includes(containsNeedle));
    }
    if (found.length === 0 && parent) {
      retryAttempts.push(`${sourceLabel}:parent_section:${parent}`);
      found = findExactSectionMatches(chunks, parent);
    }
    return found;
  }

  const pwaMatches = attemptSectionLookup(args.indexes.pwaChunks, "pwa");
  const compensationMatches =
    pwaMatches.length === 0 ? attemptSectionLookup(args.indexes.compensationChunks, "compensation_manual") : [];
  const schedulerMatches =
    pwaMatches.length === 0 && compensationMatches.length === 0
      ? attemptSectionLookup(args.indexes.schedulerChunks, "scheduler_manual")
      : [];

  let matches =
    pwaMatches.length > 0
      ? pwaMatches
      : compensationMatches.length > 0
        ? compensationMatches
        : schedulerMatches;

  if (pwaMatches.length > 0) {
    const secondaryCompensation = findExactSectionMatches(args.indexes.compensationChunks, normalizedRequestedSection).slice(0, 1);
    const secondaryScheduler = findExactSectionMatches(args.indexes.schedulerChunks, normalizedRequestedSection).slice(0, 1);
    matches = [...pwaMatches, ...secondaryCompensation, ...secondaryScheduler];
  }

  if (matches.length === 0) {
    const searchedSources = [
      args.indexes.hasPwaIndex ? "PWA index" : null,
      args.indexes.hasCompensationIndex ? "Compensation index" : null,
      args.indexes.hasSchedulerIndex ? "Scheduler index" : null,
    ].filter((value): value is string => Boolean(value));
    return {
      ok: true,
      mode: "fallback",
      answer: {
        status: "insufficient_support",
        scenarioLabel: "Document explanation",
        answerCompleteness: "provisional",
        shortAnswer: "I found the section reference, but that section text is not currently retrievable from the index.",
        plainEnglishExplanation: `Searched ${searchedSources.join(", ")} for ${normalizedRequestedSection} using exact section anchors, direct chunk text, and nearest parent-section fallback, but no indexed chunk exposed that section as retrievable text.`,
        confidence: "low",
        supportLevel: "inference_heavy",
        assumptions: [],
        evidenceSummary: [],
        references: [],
      },
      detectedScenario: null,
      nextSession: nextAnsweredSession(args.session),
      meta: { fallbackReason: "section_not_retrievable" },
      debug: buildDebugBase({
        intentResult: args.intentResult,
        indexes: args.indexes,
        expectedTool: "section_packet_retrieval",
        retrievalAttempted: true,
        laneExecutionResult: "controlled_failure",
        fallbackUsed: true,
        fallthroughPrevented: true,
        retryAttempts,
        retrievalSourcesUsed: searchedSources,
        aiSynthesisUsed: false,
      }),
    } satisfies ContractCopilotApiSuccessResponse;
  }

  const pwaSectionsUsed = matches.filter((chunk) => chunk.source === "pwa").map((chunk) => chunk.section);
  const compensationChunksUsed = matches
    .filter((chunk) => chunk.source === "compensation_manual")
    .map((chunk) => chunk.section);
  const schedulerChunksUsed = matches
    .filter((chunk) => chunk.source === "scheduler_manual")
    .map((chunk) => chunk.section);
  const matchedExcerpts = matches.map((chunk) => extractRelevantSectionExcerpt(chunk, normalizedRequestedSection));
  const summary = matchedExcerpts
    .slice(0, 2)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 650);
  const twentyThreeM7ShortAnswer = "23M7 affected pilots are typically shown in iCrew under Schedules -> Open Time -> Display 23M7 logs.";
  const twentyThreeM7Explanation = [
    "What this controls:",
    "- PWA Section 23 M.7 is the controlling section for the affected-pilot / reporting concept here.",
    "",
    "iCrew location:",
    "- In iCrew, start with Schedules.",
    "- Then open the Open Time menu.",
    "- Look for Display 23M7 logs or the affected-pilot display in that same area.",
    "",
    "Source limitation:",
    "- I do not have a cleaner UI help page attached, so verify the exact menu label if your current iCrew build uses slightly different wording.",
  ].join("\n");
  return {
    ok: true,
    mode: "fallback",
    answer: {
      status: "answered",
      scenarioLabel: "Document explanation",
      answerCompleteness: "resolved",
      shortAnswer: twentyThreeM7LogLookup
        ? twentyThreeM7ShortAnswer
        : summary.length > 0 ? summary : `${normalizedRequestedSection} was found, but the indexed text is very thin.`,
      plainEnglishExplanation: twentyThreeM7LogLookup
        ? twentyThreeM7Explanation
        : `This is a direct explanation of ${normalizedRequestedSection} from the indexed section text.`,
      confidence: "high",
      supportLevel: "contract_backed",
      assumptions: [],
      evidenceSummary: [],
      references: matches.slice(0, 3).map((chunk) => ({
        label: chunk.title ?? normalizedRequestedSection,
        sourceId:
          chunk.source === "pwa"
            ? "pwa"
            : chunk.source === "compensation_manual"
              ? "compensation_manual"
              : "scheduler_manual",
        displaySourceLabel:
          chunk.source === "pwa"
            ? "PWA"
            : chunk.source === "compensation_manual"
              ? "Compensation Manual"
              : "Scheduler Manual",
        section: displaySectionForMatch(chunk, normalizedRequestedSection),
        quoteSnippet: extractRelevantSectionExcerpt(chunk, normalizedRequestedSection).slice(0, 240),
        ruleType: chunk.source === "pwa" ? "contract" : "scheduler_practice",
      })),
    },
    detectedScenario: null,
    nextSession: nextAnsweredSession(args.session),
    meta: { fallbackReason: "document_section_explanation" },
    debug: buildDebugBase({
      intentResult: args.intentResult,
      indexes: args.indexes,
      expectedTool: "section_packet_retrieval",
      retrievalAttempted: true,
      laneExecutionResult: "success",
      fallbackUsed: true,
      fallthroughPrevented: true,
      retryAttempts,
      retrievalSourcesUsed: Array.from(new Set(matches.map((chunk) => chunk.source))),
      sourcesUsed: Array.from(
        new Set(
          matches.map((chunk) =>
            chunk.source === "pwa"
              ? "PWA"
              : chunk.source === "compensation_manual"
                ? "Compensation Manual"
                : "Scheduler Manual",
          ),
        ),
      ),
      pwaSectionsUsed,
      compensationChunksUsed,
      schedulerChunksUsed,
      aiSynthesisUsed: false,
    }),
  } satisfies ContractCopilotApiSuccessResponse;
}

function executeDirectTermLookup(args: {
  question: string;
  session: ContractCopilotSession;
  indexes: ContractCopilotExecutionIndexes;
  intentResult: ContractCopilotIntentResolution;
}) {
  const allChunks = [...args.indexes.pwaChunks, ...args.indexes.compensationChunks, ...args.indexes.schedulerChunks];
  const matches = searchContractDocuments({
    question: args.question,
    chunks: allChunks,
    rememberedFacts: args.session.facts,
    deterministicScenario: "reserve vs lineholder",
    maxMatches: 8,
  });
  const lower = args.question.toLowerCase();
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
  const termType =
    lower.includes("silver slip") && (lower.includes("what does") || lower.includes("status")) && (/\b['"]?[a-z]['"]?\b/.test(lower) || lower.includes("mean"))
      ? "silver_slip_status"
      : lower.includes("short call") && !shortCallNotificationOverride
      ? "short_call"
      : lower.includes("airport standby")
        ? "airport_standby"
        : lower.includes("adg")
          ? "adg"
          : lower.includes("minimum") && lower.includes("guarantee")
            ? "minimum_guarantee"
            : lower.includes("reserve guarantee")
              ? "reserve_guarantee"
              : lower.includes("alv") || lower.includes("average line value")
                ? "alv"
                : "general";

  const sourceSpecificQuestion =
    termType === "silver_slip_status"
      ? `${args.question} silver slip status code N meaning soaked available pickup status`
      : termType === "short_call"
      ? `${args.question} short call pay no credit reserve scheduler compensation`
      : termType === "airport_standby"
        ? `${args.question} airport standby voluntary airport standby pay credit scheduler compensation`
        : termType === "adg"
          ? `${args.question} ADG daily guarantee lineholder compensation`
          : termType === "minimum_guarantee" || termType === "reserve_guarantee"
            ? `${args.question} reserve guarantee minimum guarantee ALV compensation`
            : termType === "alv"
              ? `${args.question} ALV average line value reserve guarantee compensation`
              : args.question;

  const pwaMatches = searchContractDocuments({
    question: sourceSpecificQuestion,
    chunks: args.indexes.pwaChunks,
    rememberedFacts: args.session.facts,
    deterministicScenario: "reserve vs lineholder",
    maxMatches: 3,
  });
  const compensationMatches = searchContractDocuments({
    question: sourceSpecificQuestion,
    chunks: args.indexes.compensationChunks,
    rememberedFacts: args.session.facts,
    deterministicScenario: "reserve vs lineholder",
    maxMatches: 2,
  });
  const schedulerMatches = searchContractDocuments({
    question: sourceSpecificQuestion,
    chunks: args.indexes.schedulerChunks,
    rememberedFacts: args.session.facts,
    deterministicScenario: "reserve vs lineholder",
    maxMatches: 2,
  });

  const pwaSectionsUsed = pwaMatches.map((item) => item.chunk.section);
  const compensationChunksUsed = compensationMatches.map((item) => item.chunk.section);
  const schedulerChunksUsed = schedulerMatches.map((item) => item.chunk.section);

  let shortAnswer = "Term: I found related indexed support, but not enough clean support for a tighter direct explanation.";
  let explanationLines = [
    "How it works:",
    "- This uses indexed term sections first instead of scenario retrieval.",
  ];

  if (termType === "alv") {
    shortAnswer = "ALV: You do not calculate it yourself. The company sets it each bid period, and it is the starting value used to build a reserve guarantee.";
    explanationLines = [
      "How it works:",
      "- ALV is the company-set average line value for the bid period.",
      "- On reserve, it matters because the credit guarantee is built from ALV, not from a trip-by-trip lookup you do yourself.",
    ];
  } else if (termType === "reserve_guarantee") {
    shortAnswer = "Reserve guarantee: it is your monthly reserve credit floor, built from ALV and then bounded by the contract floor and cap.";
    explanationLines = [
      "How it works:",
      "- The company starts with ALV minus two hours.",
      "- Then the contract floor and cap limit how low or high the reserve guarantee can go for the month.",
    ];
  } else if (termType === "minimum_guarantee") {
    shortAnswer = lower.includes("reserve")
      ? "Minimum guarantee on reserve: it starts from ALV minus two hours, then the contract floor and cap apply."
      : "Minimum guarantee: it depends on whether you were reserve or a lineholder, because those guarantees are built differently.";
    explanationLines = [
      "How it works:",
      lower.includes("reserve")
        ? "- On reserve, the guarantee is tied to ALV and then bounded by the monthly floor and cap."
        : "- The contract uses different guarantee logic for reserve and lineholder months.",
    ];
  } else if (termType === "adg") {
    shortAnswer = "ADG: it is the daily guarantee baseline that tells you what a day is worth for guarantee purposes, not just the raw trip value.";
    explanationLines = [
      "How it works:",
      "- For a lineholder, ADG matters when a day has to be protected or valued under guarantee rules.",
      "- It is more useful operationally as a pay/guarantee baseline than as a glossary term by itself.",
    ];
  } else if (termType === "short_call") {
    shortAnswer = "Short call: if you sit the period and never fly, the contract support points to pay without trip credit rather than normal flying credit.";
    explanationLines = [
      "How it works:",
      "- Short call no-fly treatment is handled separately from flying pay and credit.",
      "- If you complete the short call period without flying, the support here points to pay/no-credit treatment instead of normal trip credit.",
    ];
  } else if (termType === "silver_slip_status") {
    shortAnswer = "Silver Slip status code: I would not assume the 'N' code simply means 'no' unless the attached source actually defines it.";
    explanationLines = [
      "How it works:",
      "- Treat the 'N' on a Silver Slip as a status indicator, not as self-defining pay or availability logic.",
      "- If the visible support or tool context ties 'N' to a not-soaked or not-yet-available-to-pick-up state, that is the safer working explanation.",
      "- If the attached source never defines the code directly, keep the answer cautious and verify the actual legend or scheduler note.",
    ];
  } else if (termType === "airport_standby") {
    shortAnswer = "Airport standby: if you are not used, it is handled as standby time, not the same as being paid for a flown trip.";
    explanationLines = [
      "How it works:",
      "- Airport standby has its own pay/availability treatment.",
      "- If you are not used, the question is what standby credit or pay the contract gives that period, not trip value.",
    ];
  }

  const referenceItems = [
    ...pwaMatches.slice(0, 2),
    ...compensationMatches.slice(0, 1),
    ...schedulerMatches.slice(0, 1),
  ];

  const references = referenceItems
    .map((item) => ({
      label: item.chunk.title ?? item.chunk.section,
      sourceId:
        item.chunk.source === "pwa"
          ? "pwa"
          : item.chunk.source === "compensation_manual"
            ? "compensation_manual"
            : "scheduler_manual",
      displaySourceLabel:
        item.chunk.source === "pwa"
          ? "PWA"
          : item.chunk.source === "compensation_manual"
            ? "Compensation Manual"
            : "Scheduler Manual",
      section: item.chunk.section,
      quoteSnippet: item.chunk.text.slice(0, 220),
      ruleType: item.chunk.source === "pwa" ? "contract" : "scheduler_practice",
    }));

  const sourceLines = references.length > 0
    ? ["Source:", ...references.map((reference) => `- ${reference.displaySourceLabel}: ${reference.section}`)]
    : [];
  const cautionNeeded = references.length === 0 || (termType === "short_call" && schedulerChunksUsed.length === 0);
  const cautionLines = cautionNeeded
    ? [
        "Caution:",
        "- The indexed support is thinner than I want for a cleaner term-only answer, so treat this as a direct read from the sources I could attach.",
      ]
    : [];

  return {
    ok: true,
    mode: "fallback",
    answer: {
      status: "answered",
      scenarioLabel: "Direct term lookup",
      answerCompleteness: "resolved",
      shortAnswer,
      plainEnglishExplanation: [...explanationLines, ...sourceLines, ...cautionLines].join("\n"),
      confidence: "medium",
      supportLevel: references.length > 0 ? "contract_backed" : "mixed",
      assumptions: [],
      evidenceSummary: [],
      references,
    },
    detectedScenario: null,
    nextSession: nextAnsweredSession(args.session),
    meta: { fallbackReason: "direct_term_lookup" },
    debug: buildDebugBase({
      intentResult: args.intentResult,
      indexes: args.indexes,
      expectedTool: "term_lookup_router",
      retrievalAttempted: true,
      laneExecutionResult: "success",
      fallbackUsed: true,
      fallthroughPrevented: true,
      retrievalSourcesUsed: Array.from(
        new Set(
          referenceItems.map((item) =>
            item.chunk.source === "pwa" ? "PWA" : item.chunk.source === "compensation_manual" ? "Compensation Manual" : "Scheduler Manual",
          ),
        ),
      ),
      sourcesUsed: Array.from(
        new Set(
          referenceItems.map((item) =>
            item.chunk.source === "pwa" ? "PWA" : item.chunk.source === "compensation_manual" ? "Compensation Manual" : "Scheduler Manual",
          ),
        ),
      ),
      pwaSectionsUsed,
      compensationChunksUsed,
      schedulerChunksUsed,
      missingSourceWarnings:
        [
          args.indexes.hasCompensationIndex &&
          (termType === "alv" || termType === "reserve_guarantee" || termType === "minimum_guarantee" || termType === "adg" || termType === "short_call") &&
          compensationChunksUsed.length === 0
            ? "Compensation Manual is indexed but no compensation support chunk was used for this term lookup."
            : null,
          args.indexes.hasSchedulerIndex &&
          (termType === "short_call" || termType === "airport_standby") &&
          schedulerChunksUsed.length === 0
            ? "Scheduler Manual is indexed but no scheduler support chunk was used for this term lookup."
            : null,
        ].filter((value): value is string => Boolean(value)),
      aiSynthesisUsed: false,
    }),
  } satisfies ContractCopilotApiSuccessResponse;
}

function executeClarificationLane(args: {
  question: string;
  session: ContractCopilotSession;
  indexes: ContractCopilotExecutionIndexes;
  intentResult: ContractCopilotIntentResolution;
}) {
  const firstMissingField = args.intentResult.missingFields[0];
  const prompt =
    firstMissingField === "question_scope"
      ? "I need one more detail about what you want me to focus on."
      : firstMissingField
        ? `I need one thing to route this cleanly: ${firstMissingField}.`
        : "I need one more detail before I route this the right way.";
  return {
    ok: true,
    mode: "fallback",
    answer: {
      status: "needs_clarification",
      scenarioLabel: "Clarification needed",
      answerCompleteness: "provisional",
      shortAnswer: prompt,
      plainEnglishExplanation: "Once that is clear, I can use the right contract lane instead of broad retrieval.",
      confidence: "medium",
      supportLevel: "mixed",
      assumptions: [],
      evidenceSummary: [],
      references: [],
    },
    detectedScenario: null,
    nextSession: nextAwaitingSession(args.session, args.question),
    meta: { fallbackReason: "clarification_needed" },
    debug: buildDebugBase({
      intentResult: args.intentResult,
      indexes: args.indexes,
      expectedTool: "targeted_clarifier",
      retrievalAttempted: false,
      laneExecutionResult: "clarification",
      fallbackUsed: true,
      fallthroughPrevented: true,
      aiSynthesisUsed: false,
    }),
  } satisfies ContractCopilotApiSuccessResponse;
}

export function executeContractCopilotLane(args: {
  question: string;
  session: ContractCopilotSession;
  indexes: ContractCopilotExecutionIndexes;
  intentResult: ContractCopilotIntentResolution;
}): ContractCopilotLaneExecutionResult {
  switch (args.intentResult.selectedLane) {
    case "direct_pay_rate_lookup":
      return {
        kind: "handled",
        response: executeDirectPayRateLookup(args),
      };
    case "apd_threshold_calculation":
      return {
        kind: "handled",
        response: executeApdThresholdCalculation(args),
      };
    case "document_section_explanation":
      return {
        kind: "handled",
        response: executeDocumentSectionExplanation(args),
      };
    case "direct_term_lookup":
      return {
        kind: "handled",
        response: executeDirectTermLookup(args),
      };
    case "clarification_needed":
      return {
        kind: "handled",
        response: executeClarificationLane(args),
      };
    case "contract_scenario_retrieval":
    default:
      return {
        kind: "continue",
        laneDebug: {
          laneEnforced: true,
          expectedTool: "multi_source_scenario_packet",
          retrievalAttempted: true,
          laneExecutionResult: "success",
          fallbackUsed: false,
          fallthroughPrevented: true,
          retryAttempts: [],
          sourceAvailability: sourceAvailability(args.indexes),
        },
      };
  }
}
