import type { AIWorkflowDefinition } from "../../core/types";
import type { TimecardParserAIInput, TimecardParserAIOutput } from "./schema";
import { timecardParserAIInputSchema, timecardParserAIOutputSchema } from "./schema";

type TimecardParserAIContext = {
  parsingGoal: string;
};

export const timecardParserAIWorkflow: AIWorkflowDefinition<
  TimecardParserAIInput,
  TimecardParserAIContext,
  TimecardParserAIOutput
> = {
  id: "timecardParser",
  displayName: "Timecard Parser",
  description: "AI extraction layer for raw monthly timecard text and layout ambiguities.",
  inputSchema: timecardParserAIInputSchema,
  outputSchema: timecardParserAIOutputSchema,
  buildContext: () => ({
    parsingGoal: "Identify sections, line items, and ambiguities. Leave credit math and pay rules to deterministic logic.",
  }),
  buildPrompt: (input, context) => ({
    systemPrompt:
      "You are the CrewTools timecard parser extraction layer. Extract sections and uncertain lines only. Do not compute pay outcomes.",
    userPrompt: input.rawTimecardText,
    contextBlocks: [{ label: "Goal", content: context.parsingGoal }],
    temperature: 0.1,
  }),
};
