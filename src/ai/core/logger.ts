import type { AIWorkflowLogger } from "./types.ts";

export const noopAIWorkflowLogger: AIWorkflowLogger = {};

export const consoleAIWorkflowLogger: AIWorkflowLogger = {
  onWorkflowStart(payload) {
    console.log(`[AI:${payload.workflowId}] start`, payload.inputSummary);
  },
  onModelRawResponse(payload) {
    console.log(`[AI:${payload.workflowId}] raw response attempt ${payload.attempt}:`, payload.rawText);
  },
  onValidationAccepted(payload) {
    console.log(`[AI:${payload.workflowId}] validation accepted on attempt ${payload.attempt}`);
  },
  onValidationFailure(payload) {
    console.warn(
      `[AI:${payload.workflowId}] validation failed on attempt ${payload.attempt}: ${payload.reason}`,
      payload.rawText ?? ""
    );
  },
  onWorkflowSuccess(payload) {
    console.log(`[AI:${payload.workflowId}] success`, payload.usage ?? {});
  },
  onWorkflowError(payload) {
    console.error(`[AI:${payload.workflowId}] error`, payload.error);
  },
};

export function summarizeInput(value: unknown) {
  if (typeof value === "string") {
    return value.slice(0, 120);
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value).slice(0, 240);
  }
  return String(value);
}
