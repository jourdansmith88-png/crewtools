import type { AIWorkflowDefinition } from "../../core/types.ts";
import { buildContractCopilotFinalSynthesisPrompt } from "./finalSynthesisPrompt.ts";
import {
  contractCopilotFinalSynthesisInputSchema,
  contractCopilotFinalSynthesisOutputSchema,
  type ContractCopilotFinalSynthesisInput,
  type ContractCopilotFinalSynthesisOutput,
} from "./finalSynthesisSchema.ts";

type ContractCopilotFinalSynthesisContext = {
  goal: string;
};

export const contractCopilotFinalSynthesisWorkflow: AIWorkflowDefinition<
  ContractCopilotFinalSynthesisInput,
  ContractCopilotFinalSynthesisContext,
  ContractCopilotFinalSynthesisOutput
> = {
  id: "contractCopilotSynthesis",
  displayName: "Contract Copilot Final Synthesis",
  description: "Turns grounded contract reasoning into a pilot-facing final answer.",
  inputSchema: contractCopilotFinalSynthesisInputSchema,
  outputSchema: contractCopilotFinalSynthesisOutputSchema,
  buildContext: () => ({
    goal: "Answer like a knowledgeable pilot using grounded contract reasoning as the source of truth.",
  }),
  buildPrompt: (input) => buildContractCopilotFinalSynthesisPrompt(input),
};
