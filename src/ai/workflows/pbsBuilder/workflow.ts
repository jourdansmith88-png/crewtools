import type { AIWorkflowDefinition } from "../../core/types";
import type { PBSBuilderAIInput, PBSBuilderAIOutput } from "./schema";
import { pbsBuilderAIInputSchema, pbsBuilderAIOutputSchema } from "./schema";

type PBSBuilderAIContext = {
  planningGoal: string;
};

export const pbsBuilderAIWorkflow: AIWorkflowDefinition<
  PBSBuilderAIInput,
  PBSBuilderAIContext,
  PBSBuilderAIOutput
> = {
  id: "pbsBuilder",
  displayName: "PBS Bid Builder",
  description: "AI planning layer for bid strategy language and preference organization.",
  inputSchema: pbsBuilderAIInputSchema,
  outputSchema: pbsBuilderAIOutputSchema,
  buildContext: () => ({
    planningGoal: "Organize pilot preferences and strategy notes. Deterministic bid-file generation should stay outside the AI layer.",
  }),
  buildPrompt: (input, context) => ({
    systemPrompt:
      "You are the CrewTools PBS planning layer. Organize strategy and flag ambiguity. Do not generate final bid files or deterministic legality checks.",
    userPrompt: input.pilotGoalSummary,
    contextBlocks: [{ label: "Goal", content: context.planningGoal }],
    temperature: 0.1,
  }),
};
