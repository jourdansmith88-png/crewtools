import type { AIWorkflowDefinition } from "../../core/types";
import type { TripParserAIInput, TripParserAIOutput } from "./schema";
import { tripParserAIInputSchema, tripParserAIOutputSchema } from "./schema";

type TripParserAIContext = {
  parsingGoal: string;
};

export const tripParserAIWorkflow: AIWorkflowDefinition<
  TripParserAIInput,
  TripParserAIContext,
  TripParserAIOutput
> = {
  id: "tripParser",
  displayName: "Trip Parser",
  description: "AI extraction layer for turning raw trip text into structured trip facts.",
  inputSchema: tripParserAIInputSchema,
  outputSchema: tripParserAIOutputSchema,
  buildContext: () => ({
    parsingGoal: "Extract trip structure and ambiguous segments; do not calculate pay or credit.",
  }),
  buildPrompt: (input, context) => ({
    systemPrompt:
      "You are the CrewTools trip parser extraction layer. Extract trip structure and ambiguities only. Do not calculate contract outcomes.",
    userPrompt: input.rawTripText,
    contextBlocks: [{ label: "Goal", content: context.parsingGoal }],
    temperature: 0.1,
  }),
};
