import type { AIWorkflowDefinition } from "../../core/types.ts";
import { buildContractCopilotAIContext } from "./context.ts";
import { postProcessContractCopilotAIOutput } from "./postprocess.ts";
import { buildContractCopilotAIPrompt } from "./prompt.ts";
import {
  contractCopilotAIInputSchema,
  contractCopilotAIOutputSchema,
  type ContractCopilotAIContext,
  type ContractCopilotAIInput,
  type ContractCopilotAIOutput,
} from "./schema.ts";

export const contractCopilotAIWorkflow: AIWorkflowDefinition<
  ContractCopilotAIInput,
  ContractCopilotAIContext,
  ContractCopilotAIOutput
> = {
  id: "contractCopilot",
  displayName: "Contract Copilot",
  description: "AI extraction and explanation layer for pilot contract questions.",
  groundingPolicy: {
    externalSearch: {
      enabled: true,
      maxSnippets: 2,
      useWhen: [
        "internal_support_weak",
        "interpretation_question",
        "terminology_clarification",
        "edge_case_context",
      ],
    },
  },
  inputSchema: contractCopilotAIInputSchema,
  outputSchema: contractCopilotAIOutputSchema,
  buildContext: buildContractCopilotAIContext,
  buildPrompt: buildContractCopilotAIPrompt,
  postProcess: postProcessContractCopilotAIOutput,
};
