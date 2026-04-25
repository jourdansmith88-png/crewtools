import type { ContractQuickReply, ParsedScenarioFacts } from "../../../types/contractCopilot";
import type { GroundingContextPack } from "../../retrieval/types.ts";
import type { MatchedInteractionRule } from "../../retrieval/contracts/interactionRules.ts";
import { createSchema, expectObject, expectString, optionalString, optionalStringArray } from "../../core/validation.ts";

export type ContractCopilotAISupportItem = {
  sourceLabel: string;
  section: string;
  quoteSnippet?: string;
  note?: string;
};

export type ContractCopilotAIRetrievedSupportItem = ContractCopilotAISupportItem & {
  sourceId: "pwa" | "compensation_manual" | "scheduler_manual";
  ruleType: "contract" | "scheduler_practice" | "inference";
  ruleId: string;
  scenario: string;
  title: string;
  score: number;
  matchedTerms: string[];
};

export type ContractCopilotAIInput = {
  question: string;
  rememberedFacts?: ParsedScenarioFacts;
  deterministicScenario?: string;
  deterministicShortAnswer?: string;
  deterministicSupport?: ContractCopilotAISupportItem[];
  retrievedSupport?: ContractCopilotAIRetrievedSupportItem[];
  groundingPack?: GroundingContextPack;
  knownInteractionRules?: MatchedInteractionRule[];
};

export type ContractCopilotAIOutput = {
  detectedScenario: string;
  questionType: string;
  answerCompleteness: "provisional" | "resolved";
  shortAnswer: string;
  confidence: string;
  needsClarification: boolean;
  clarifyingQuestion: string;
  clarifyingField: string;
  quickReplies: ContractQuickReply[];
  whyItApplies: string;
  contractSupport: ContractCopilotAISupportItem[];
  extractedFacts: Record<string, string>;
  assumptions: string[];
  scenarioBreakdown: string[];
  payBreakdown: string[];
  whatCouldChange: string[];
  practicalBreakdown: string[];
  followUpSuggestion: string;
};

const contractQuickReplyFactPatchProperties = {
  status: { type: "string" },
  assignmentType: { type: "string" },
  pickupType: { type: "string" },
  premiumType: { type: "string" },
  interactionRelationship: { type: "string" },
  contactWindow: { type: "string" },
  processingCountsKnown: { type: "boolean" },
  beforeReport: { type: "boolean" },
  afterReport: { type: "boolean" },
  eventTiming: { type: "string" },
  rerouteOccurred: { type: "boolean" },
  reassignmentOccurred: { type: "boolean" },
  tripTouched: { type: "boolean" },
  leaveType: { type: "string" },
  sickUsed: { type: "boolean" },
  sameDayInteraction: { type: "boolean" },
  questionIntent: { type: "string" },
} as const;

const contractQuickReplyFactPatchRequired = Object.keys(
  contractQuickReplyFactPatchProperties,
) as Array<keyof typeof contractQuickReplyFactPatchProperties>;

function sanitizeQuickReplyFactPatch(value: unknown): Partial<ParsedScenarioFacts> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const patch = value as Record<string, unknown>;
  const sanitizedEntries = Object.entries(patch).filter(([, entryValue]) => {
    if (typeof entryValue === "boolean") {
      return true;
    }
    if (typeof entryValue === "string") {
      return entryValue.trim().length > 0;
    }
    return false;
  });

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    sanitizedEntries.map(([key, entryValue]) => [
      key,
      typeof entryValue === "string" ? entryValue.trim() : entryValue,
    ]),
  ) as Partial<ParsedScenarioFacts>;
}

const contractCopilotAIOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detectedScenario",
    "questionType",
    "answerCompleteness",
    "shortAnswer",
    "confidence",
    "needsClarification",
    "clarifyingQuestion",
    "clarifyingField",
    "quickReplies",
    "whyItApplies",
    "contractSupport",
    "extractedFacts",
    "assumptions",
    "scenarioBreakdown",
    "payBreakdown",
    "whatCouldChange",
    "practicalBreakdown",
    "followUpSuggestion",
  ],
  properties: {
    detectedScenario: { type: "string" },
    questionType: { type: "string" },
    answerCompleteness: { type: "string", enum: ["provisional", "resolved"] },
    shortAnswer: { type: "string", minLength: 1, maxLength: 400 },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    needsClarification: { type: "boolean" },
    clarifyingQuestion: { type: "string" },
    clarifyingField: { type: "string" },
    quickReplies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "factPatch", "replyMessage"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          factPatch: {
            type: "object",
            additionalProperties: false,
            properties: contractQuickReplyFactPatchProperties,
            required: contractQuickReplyFactPatchRequired,
          },
          replyMessage: { type: "string" },
        },
      },
    },
    whyItApplies: { type: "string" },
    contractSupport: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceLabel", "section", "quoteSnippet", "note"],
        properties: {
          sourceLabel: { type: "string" },
          section: { type: "string", minLength: 1 },
          quoteSnippet: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    extractedFacts: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string" },
        assignmentType: { type: "string" },
        pickupType: { type: "string" },
        premiumType: { type: "string" },
        beforeReport: { type: "string" },
        afterReport: { type: "string" },
        eventTiming: { type: "string" },
        rerouteOccurred: { type: "string" },
        reassignmentOccurred: { type: "string" },
        tripTouched: { type: "string" },
        leaveType: { type: "string" },
        sickUsed: { type: "string" },
        sameDayInteraction: { type: "string" },
        questionIntent: { type: "string" },
      },
      required: [
        "status",
        "assignmentType",
        "pickupType",
        "premiumType",
        "beforeReport",
        "afterReport",
        "eventTiming",
        "rerouteOccurred",
        "reassignmentOccurred",
        "tripTouched",
        "leaveType",
        "sickUsed",
        "sameDayInteraction",
        "questionIntent",
      ],
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
    scenarioBreakdown: {
      type: "array",
      items: { type: "string" },
    },
    payBreakdown: {
      type: "array",
      items: { type: "string" },
    },
    whatCouldChange: {
      type: "array",
      items: { type: "string" },
    },
    practicalBreakdown: {
      type: "array",
      items: { type: "string" },
    },
    followUpSuggestion: { type: "string" },
  },
} satisfies Record<string, unknown>;

export const contractCopilotAIInputSchema = createSchema<ContractCopilotAIInput>(
  "contractCopilotInput",
  (value) => {
    const object = expectObject(value, "Contract Copilot input");
    return {
      question: expectString(object.question, "question"),
      rememberedFacts:
        object.rememberedFacts && typeof object.rememberedFacts === "object"
          ? (object.rememberedFacts as ParsedScenarioFacts)
          : undefined,
      deterministicScenario:
        typeof object.deterministicScenario === "string" ? object.deterministicScenario.trim() : undefined,
      deterministicShortAnswer:
        typeof object.deterministicShortAnswer === "string"
          ? object.deterministicShortAnswer.trim()
          : undefined,
      deterministicSupport: Array.isArray(object.deterministicSupport)
        ? object.deterministicSupport
            .flatMap((item) => {
              if (!item || typeof item !== "object") {
                return [];
              }
              const supportItem = item as Record<string, unknown>;
              const sourceLabel = supportItem.sourceLabel;
              const section = supportItem.section;
              if (
                (sourceLabel === "PWA" ||
                  sourceLabel === "Compensation Manual" ||
                  sourceLabel === "Scheduler Manual" ||
                  sourceLabel === "Inference") &&
                typeof section === "string" &&
                section.trim().length > 0
              ) {
                return [
                  {
                    sourceLabel,
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
        : undefined,
      retrievedSupport: Array.isArray(object.retrievedSupport)
        ? object.retrievedSupport.flatMap((item) => {
            if (!item || typeof item !== "object") {
              return [];
            }
            const supportItem = item as Record<string, unknown>;
            const sourceId = supportItem.sourceId;
            const ruleType = supportItem.ruleType;
            const ruleId = supportItem.ruleId;
            const scenario = supportItem.scenario;
            const title = supportItem.title;
            const sourceLabel = supportItem.sourceLabel;
            const section = supportItem.section;
            const score = supportItem.score;
            const matchedTerms = supportItem.matchedTerms;
            if (
              (sourceId === "pwa" || sourceId === "compensation_manual" || sourceId === "scheduler_manual") &&
              (ruleType === "contract" || ruleType === "scheduler_practice" || ruleType === "inference") &&
              typeof ruleId === "string" &&
              typeof scenario === "string" &&
              typeof title === "string" &&
              typeof sourceLabel === "string" &&
              typeof section === "string" &&
              section.trim().length > 0 &&
              typeof score === "number"
            ) {
              return [
                {
                  sourceId,
                  ruleType,
                  ruleId: ruleId.trim(),
                  scenario: scenario.trim(),
                  title: title.trim(),
                  sourceLabel: sourceLabel.trim(),
                  section: section.trim(),
                  score,
                  matchedTerms: Array.isArray(matchedTerms)
                    ? matchedTerms.filter((term): term is string => typeof term === "string" && term.trim().length > 0)
                    : [],
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
        : undefined,
      groundingPack:
        object.groundingPack && typeof object.groundingPack === "object"
          ? (object.groundingPack as GroundingContextPack)
          : undefined,
      knownInteractionRules: Array.isArray(object.knownInteractionRules)
        ? object.knownInteractionRules.flatMap((item) => {
            if (!item || typeof item !== "object") {
              return [];
            }
            const rule = item as Record<string, unknown>;
            if (
              typeof rule.id === "string" &&
              typeof rule.title === "string" &&
              typeof rule.primaryFamily === "string" &&
              Array.isArray(rule.interactingFamilies) &&
              typeof rule.interactionType === "string" &&
              rule.appliesWhen &&
              typeof rule.appliesWhen === "object" &&
              Array.isArray(rule.governingSources) &&
              typeof rule.ruleSummary === "string" &&
              Array.isArray(rule.reasoningSteps) &&
              Array.isArray(rule.preventsDriftFrom) &&
              Array.isArray(rule.retrievalBoostTerms)
            ) {
              return [
                {
                  id: rule.id,
                  title: rule.title,
                  primaryFamily: rule.primaryFamily,
                  interactingFamilies: rule.interactingFamilies.filter(
                    (value): value is string => typeof value === "string"
                  ),
                  interactionType: rule.interactionType,
                  appliesWhen: {
                    questionSignals: Array.isArray((rule.appliesWhen as Record<string, unknown>).questionSignals)
                      ? ((rule.appliesWhen as Record<string, unknown>).questionSignals as unknown[]).filter(
                          (value): value is string => typeof value === "string"
                        )
                      : [],
                    factSignals: Array.isArray((rule.appliesWhen as Record<string, unknown>).factSignals)
                      ? ((rule.appliesWhen as Record<string, unknown>).factSignals as unknown[]).filter(
                          (value): value is string => typeof value === "string"
                        )
                      : undefined,
                    requiredFacts: Array.isArray((rule.appliesWhen as Record<string, unknown>).requiredFacts)
                      ? ((rule.appliesWhen as Record<string, unknown>).requiredFacts as unknown[]).filter(
                          (value): value is keyof ParsedScenarioFacts => typeof value === "string"
                        )
                      : undefined,
                    optionalFacts: Array.isArray((rule.appliesWhen as Record<string, unknown>).optionalFacts)
                      ? ((rule.appliesWhen as Record<string, unknown>).optionalFacts as unknown[]).filter(
                          (value): value is keyof ParsedScenarioFacts => typeof value === "string"
                        )
                      : undefined,
                  },
                  governingSources: (rule.governingSources as Array<Record<string, unknown>>).flatMap(
                    (section) =>
                      typeof section.source === "string" && typeof section.section === "string"
                        ? [
                            {
                              source: section.source as "pwa" | "compensation_manual" | "scheduler_manual",
                              section: section.section,
                              title: typeof section.title === "string" ? section.title : undefined,
                            },
                          ]
                        : []
                  ),
                  ruleSummary: rule.ruleSummary,
                  reasoningSteps: Array.isArray(rule.reasoningSteps)
                    ? rule.reasoningSteps.filter((value): value is string => typeof value === "string")
                    : [],
                  preventsDriftFrom: Array.isArray(rule.preventsDriftFrom)
                    ? rule.preventsDriftFrom.filter((value): value is string => typeof value === "string")
                    : [],
                  retrievalBoostTerms: Array.isArray(rule.retrievalBoostTerms)
                    ? rule.retrievalBoostTerms.filter((value): value is string => typeof value === "string")
                    : [],
                  matchedSignals: Array.isArray(rule.matchedSignals)
                    ? rule.matchedSignals.filter((value): value is string => typeof value === "string")
                    : [],
                } satisfies MatchedInteractionRule,
              ];
            }
            return [];
          })
        : undefined,
    };
  }
);

export const contractCopilotAIOutputSchema = createSchema<ContractCopilotAIOutput>(
  "contractCopilotOutput",
  (value) => {
    const object = expectObject(value, "Contract Copilot output");
    const missingDebugFields = [
      typeof object.detectedScenario !== "string" ? "detectedScenario" : null,
      typeof object.questionType !== "string" ? "questionType" : null,
      typeof object.answerCompleteness !== "string" ? "answerCompleteness" : null,
      !Array.isArray(object.quickReplies) ? "quickReplies" : null,
      !Array.isArray(object.contractSupport) ? "contractSupport" : null,
      !Array.isArray(object.assumptions) ? "assumptions" : null,
      !Array.isArray(object.scenarioBreakdown) ? "scenarioBreakdown" : null,
      !Array.isArray(object.payBreakdown) ? "payBreakdown" : null,
      !Array.isArray(object.whatCouldChange) ? "whatCouldChange" : null,
      !Array.isArray(object.practicalBreakdown) ? "practicalBreakdown" : null,
      typeof object.whyItApplies !== "string" ? "whyItApplies" : null,
      typeof object.followUpSuggestion !== "string" ? "followUpSuggestion" : null,
    ].filter(Boolean);
    if (missingDebugFields.length > 0) {
      console.log("=== CONTRACT COPILOT MISSING DEBUG FIELDS ===", missingDebugFields.join(", "));
    }

    return {
      detectedScenario: optionalString(object.detectedScenario) ?? "",
      questionType: optionalString(object.questionType) ?? "",
      answerCompleteness:
        object.answerCompleteness === "resolved" || object.answerCompleteness === "provisional"
          ? object.answerCompleteness
          : "provisional",
      shortAnswer: expectString(object.shortAnswer, "shortAnswer"),
      confidence: expectString(object.confidence, "confidence"),
      needsClarification: typeof object.needsClarification === "boolean" ? object.needsClarification : false,
      clarifyingQuestion: optionalString(object.clarifyingQuestion) ?? "",
      clarifyingField: optionalString(object.clarifyingField) ?? "",
      quickReplies: Array.isArray(object.quickReplies)
        ? object.quickReplies.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const reply = item as Record<string, unknown>;
            if (typeof reply.id !== "string" || typeof reply.label !== "string") return [];
            return [
              {
                id: reply.id.trim(),
                label: reply.label.trim(),
                factPatch: sanitizeQuickReplyFactPatch(reply.factPatch),
                replyMessage:
                  typeof reply.replyMessage === "string" && reply.replyMessage.trim().length > 0
                    ? reply.replyMessage.trim()
                    : undefined,
              },
            ];
          })
        : [],
      whyItApplies: optionalString(object.whyItApplies) ?? "",
      contractSupport: Array.isArray(object.contractSupport)
        ? object.contractSupport
            .flatMap((item) => {
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
        : [],
      extractedFacts:
        object.extractedFacts && typeof object.extractedFacts === "object"
          ? Object.fromEntries(
              Object.entries(object.extractedFacts as Record<string, unknown>).flatMap(([key, item]) =>
                typeof item === "string" && item.trim().length > 0 ? [[key, item.trim()]] : []
              )
            )
          : {},
      assumptions: optionalStringArray(object.assumptions) ?? [],
      scenarioBreakdown: optionalStringArray(object.scenarioBreakdown) ?? [],
      payBreakdown: optionalStringArray(object.payBreakdown) ?? [],
      whatCouldChange: optionalStringArray(object.whatCouldChange) ?? [],
      practicalBreakdown: optionalStringArray(object.practicalBreakdown) ?? [],
      followUpSuggestion: optionalString(object.followUpSuggestion) ?? "",
    };
  },
  contractCopilotAIOutputJsonSchema
);
