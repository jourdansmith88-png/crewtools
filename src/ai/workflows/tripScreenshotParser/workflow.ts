import type { AIWorkflowDefinition } from "../../core/types.ts";
import type { TripScreenshotParserAIInput, TripScreenshotParserAIOutput } from "./schema.ts";
import {
  tripScreenshotParserAIInputSchema,
  tripScreenshotParserAIOutputSchema,
} from "./schema.ts";

type TripScreenshotParserAIContext = {
  parsingGoal: string;
};

export const tripScreenshotParserAIWorkflow: AIWorkflowDefinition<
  TripScreenshotParserAIInput,
  TripScreenshotParserAIContext,
  TripScreenshotParserAIOutput
> = {
  id: "tripScreenshotParser",
  displayName: "Trip Screenshot Parser",
  description: "AI extraction layer for screenshots of trips, pairings, and reroutes. Extract visible facts only.",
  inputSchema: tripScreenshotParserAIInputSchema,
  outputSchema: tripScreenshotParserAIOutputSchema,
  buildContext: (input) => ({
    parsingGoal: `Extract only visible schedule/trip facts from this ${input.evidenceType}. Do not answer contract questions or infer pay outcomes.`,
  }),
  buildPrompt: (input, context) => ({
    systemPrompt:
      "You are the CrewTools screenshot extraction layer. Extract visible trip, reroute, and duty facts only. Do not calculate contract outcomes. Return every schema field. Use empty strings or empty arrays when a field is not visible, and list unclear items in missingOrUnclear.",
    userPrompt: [
      `Source file: ${input.imageName}`,
      input.questionHint ? `Pilot question context: ${input.questionHint}` : undefined,
      "Extract report/release, pairing number, legs, deadhead vs operating, original vs changed times, reroute/reassignment indicators, visible timestamps, and duty-period context if present.",
    ]
      .filter(Boolean)
      .join("\n"),
    contextBlocks: [{ label: "Goal", content: context.parsingGoal }],
    userImages: [{ dataUrl: input.imageDataUrl, label: input.imageName }],
    temperature: 0.1,
  }),
};
