import { createSchema, expectObject, expectString, optionalStringArray } from "../../core/validation.ts";
import type { ContractCopilotAISupportItem, ContractCopilotAIOutput } from "./schema.ts";

export type ContractCopilotFinalSynthesisInput = {
  question: string;
  groundedReasoning: ContractCopilotAIOutput;
  governingSectionUsed?: {
    sourceLabel: string;
    section: string;
    title?: string;
    content: string;
  };
  scenarioValidation?: {
    missingGatingFacts: string[];
    answerIsConditional: boolean;
    turningCondition?: string;
    conditionalBottomLine?: string;
    conditionalWhy?: string;
    gatingQuestion?: string;
  };
};

export type ContractCopilotFinalSynthesisOutput = {
  bottomLine: string;
  scenarioBreakdown: string[];
  payBreakdown: string[];
  whatCouldChange: string[];
  why: string;
  contractSupport: ContractCopilotAISupportItem[];
  practicalBreakdown: string[];
  followUpSuggestion: string;
};

const supportItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sourceLabel", "section", "quoteSnippet", "note"],
  properties: {
    sourceLabel: { type: "string" },
    section: { type: "string" },
    quoteSnippet: { type: "string" },
    note: { type: "string" },
  },
} satisfies Record<string, unknown>;

export const contractCopilotFinalSynthesisInputSchema = createSchema<ContractCopilotFinalSynthesisInput>(
  "contractCopilotFinalSynthesisInput",
  (value) => {
    const object = expectObject(value, "Contract Copilot final synthesis input");
    return {
      question: expectString(object.question, "question"),
      groundedReasoning: object.groundedReasoning as ContractCopilotAIOutput,
      governingSectionUsed:
        object.governingSectionUsed && typeof object.governingSectionUsed === "object"
          ? {
              sourceLabel:
                typeof (object.governingSectionUsed as Record<string, unknown>).sourceLabel === "string"
                  ? ((object.governingSectionUsed as Record<string, unknown>).sourceLabel as string)
                  : "",
              section:
                typeof (object.governingSectionUsed as Record<string, unknown>).section === "string"
                  ? ((object.governingSectionUsed as Record<string, unknown>).section as string)
                  : "",
              title:
                typeof (object.governingSectionUsed as Record<string, unknown>).title === "string"
                  ? ((object.governingSectionUsed as Record<string, unknown>).title as string)
                  : undefined,
              content:
                typeof (object.governingSectionUsed as Record<string, unknown>).content === "string"
                  ? ((object.governingSectionUsed as Record<string, unknown>).content as string)
                  : "",
            }
          : undefined,
      scenarioValidation:
        object.scenarioValidation && typeof object.scenarioValidation === "object"
          ? {
              missingGatingFacts: Array.isArray((object.scenarioValidation as Record<string, unknown>).missingGatingFacts)
                ? ((object.scenarioValidation as Record<string, unknown>).missingGatingFacts as unknown[])
                    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                    .map((item) => item.trim())
                : [],
              answerIsConditional:
                (object.scenarioValidation as Record<string, unknown>).answerIsConditional === true,
              turningCondition:
                typeof (object.scenarioValidation as Record<string, unknown>).turningCondition === "string"
                  ? ((object.scenarioValidation as Record<string, unknown>).turningCondition as string)
                  : undefined,
              conditionalBottomLine:
                typeof (object.scenarioValidation as Record<string, unknown>).conditionalBottomLine === "string"
                  ? ((object.scenarioValidation as Record<string, unknown>).conditionalBottomLine as string)
                  : undefined,
              conditionalWhy:
                typeof (object.scenarioValidation as Record<string, unknown>).conditionalWhy === "string"
                  ? ((object.scenarioValidation as Record<string, unknown>).conditionalWhy as string)
                  : undefined,
              gatingQuestion:
                typeof (object.scenarioValidation as Record<string, unknown>).gatingQuestion === "string"
                  ? ((object.scenarioValidation as Record<string, unknown>).gatingQuestion as string)
                  : undefined,
            }
          : undefined,
    };
  }
);

export const contractCopilotFinalSynthesisOutputSchema = createSchema<ContractCopilotFinalSynthesisOutput>(
  "contractCopilotFinalSynthesisOutput",
  (value) => {
    const object = expectObject(value, "Contract Copilot final synthesis output");
    return {
      bottomLine: expectString(object.bottomLine, "bottomLine"),
      scenarioBreakdown: optionalStringArray(object.scenarioBreakdown) ?? [],
      payBreakdown: optionalStringArray(object.payBreakdown) ?? [],
      whatCouldChange: optionalStringArray(object.whatCouldChange) ?? [],
      why: expectString(object.why, "why"),
      contractSupport: Array.isArray(object.contractSupport)
        ? object.contractSupport.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const supportItem = item as Record<string, unknown>;
            if (typeof supportItem.sourceLabel !== "string" || typeof supportItem.section !== "string") {
              return [];
            }
            return [
              {
                sourceLabel: supportItem.sourceLabel.trim(),
                section: supportItem.section.trim(),
                quoteSnippet:
                  typeof supportItem.quoteSnippet === "string" ? supportItem.quoteSnippet.trim() : undefined,
                note: typeof supportItem.note === "string" ? supportItem.note.trim() : undefined,
              },
            ];
          })
        : [],
      practicalBreakdown: optionalStringArray(object.practicalBreakdown) ?? [],
      followUpSuggestion: expectString(object.followUpSuggestion, "followUpSuggestion"),
    };
  },
  {
    type: "object",
    additionalProperties: false,
    required: [
      "bottomLine",
      "scenarioBreakdown",
      "payBreakdown",
      "whatCouldChange",
      "why",
      "contractSupport",
      "practicalBreakdown",
      "followUpSuggestion",
    ],
    properties: {
      bottomLine: { type: "string", minLength: 1, maxLength: 500 },
      scenarioBreakdown: { type: "array", items: { type: "string" } },
      payBreakdown: { type: "array", items: { type: "string" } },
      whatCouldChange: { type: "array", items: { type: "string" } },
      why: { type: "string", minLength: 1 },
      contractSupport: { type: "array", items: supportItemSchema },
      practicalBreakdown: { type: "array", items: { type: "string" } },
      followUpSuggestion: { type: "string" },
    },
  }
);
