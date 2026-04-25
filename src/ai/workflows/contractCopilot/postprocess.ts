import type { ContractCopilotAIInput, ContractCopilotAIOutput } from "./schema.ts";
import type { ContractCopilotAIContext } from "./context.ts";

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

export function postProcessContractCopilotAIOutput(args: {
  input: ContractCopilotAIInput;
  context: ContractCopilotAIContext;
  modelOutput: ContractCopilotAIOutput;
}): ContractCopilotAIOutput {
  return {
    ...args.modelOutput,
    shortAnswer: args.modelOutput.shortAnswer.trim(),
    whyItApplies: trimToTwoSentences(args.modelOutput.whyItApplies),
    clarifyingQuestion: args.modelOutput.clarifyingQuestion?.trim(),
    clarifyingField: args.modelOutput.clarifyingField?.trim(),
    quickReplies: args.modelOutput.quickReplies?.map((item) => ({
      ...item,
      id: item.id.trim(),
      label: item.label.trim(),
      replyMessage: item.replyMessage?.trim(),
    })),
    assumptions: args.modelOutput.assumptions?.map((item) => item.trim()),
    scenarioBreakdown: args.modelOutput.scenarioBreakdown?.map((item) => item.trim()),
    payBreakdown: args.modelOutput.payBreakdown?.map((item) => item.trim()),
    whatCouldChange: args.modelOutput.whatCouldChange?.map((item) => item.trim()),
    practicalBreakdown: args.modelOutput.practicalBreakdown?.map((item) => item.trim()),
    followUpSuggestion: args.modelOutput.followUpSuggestion?.trim(),
    contractSupport: args.modelOutput.contractSupport
      ?.map((item) => ({
        ...item,
        sourceLabel: item.sourceLabel.trim(),
        section: item.section.trim(),
        quoteSnippet: item.quoteSnippet?.trim(),
        note: item.note?.trim(),
      }))
      .filter((item) => item.section.length > 0 && (item.quoteSnippet?.length ?? 0) > 0),
  };
}
