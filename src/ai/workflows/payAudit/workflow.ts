import type { AIWorkflowDefinition } from "../../core/types";
import type { PayAuditAIInput, PayAuditAIOutput } from "./schema";
import { payAuditAIInputSchema, payAuditAIOutputSchema } from "./schema";

type PayAuditAIContext = {
  explanationGoal: string;
};

export const payAuditAIWorkflow: AIWorkflowDefinition<
  PayAuditAIInput,
  PayAuditAIContext,
  PayAuditAIOutput
> = {
  id: "payAudit",
  displayName: "Pay Audit Explanation",
  description: "AI explanation layer for deterministic pay-audit findings.",
  inputSchema: payAuditAIInputSchema,
  outputSchema: payAuditAIOutputSchema,
  buildContext: () => ({
    explanationGoal: "Translate deterministic pay-audit findings into plain English without changing the underlying math.",
  }),
  buildPrompt: (input, context) => ({
    systemPrompt:
      "You are the CrewTools pay audit explanation layer. Explain deterministic findings clearly. Do not invent math or contract outcomes.",
    userPrompt: input.auditFindingSummary,
    contextBlocks: [{ label: "Goal", content: context.explanationGoal }],
    temperature: 0.1,
  }),
};
