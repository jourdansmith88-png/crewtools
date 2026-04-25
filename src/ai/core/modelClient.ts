import { AIConfigurationError } from "./errors.ts";
import type { AIModelStructuredRequest, AIModelStructuredResponse } from "./types.ts";

export interface AIModelClient {
  runStructured<TOutput>(
    request: AIModelStructuredRequest<TOutput>
  ): Promise<AIModelStructuredResponse<TOutput>>;
}

export function createUnconfiguredAIModelClient(): AIModelClient {
  return {
    async runStructured() {
      throw new AIConfigurationError(
        "No AI model client is configured yet. Add a backend route and provider before calling AI workflows."
      );
    },
  };
}
