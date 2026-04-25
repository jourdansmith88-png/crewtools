import { noopAIWorkflowLogger, summarizeInput } from "./logger.ts";
import { AIValidationError } from "./errors.ts";
import { validateWithSchema } from "./validation.ts";
import type {
  AIModelClient,
} from "./modelClient.ts";
import type {
  AIWorkflowPrompt,
  AIWorkflowDefinition,
  AIWorkflowLogger,
  AIWorkflowRunResult,
} from "./types.ts";

function buildRepairPrompt(prompt: AIWorkflowPrompt, reason: string): AIWorkflowPrompt {
  return {
    ...prompt,
    systemPrompt: [
      prompt.systemPrompt,
      "Your previous response failed strict schema validation.",
      "Return ONLY valid JSON that matches the schema exactly.",
      "Do not include markdown, commentary, or any keys outside the schema.",
      `Validation failure to repair: ${reason}`,
    ].join(" "),
    contextBlocks: [
      ...(prompt.contextBlocks ?? []),
      {
        label: "Repair instruction",
        content:
          `The previous response was rejected for this reason: ${reason}. ` +
          "Retry with schema-valid JSON only, even if the answer is conditional or uncertain.",
      },
    ],
  };
}

export async function runAIWorkflow<TInput, TContext, TModelOutput, TFinalOutput = TModelOutput>(
  workflow: AIWorkflowDefinition<TInput, TContext, TModelOutput, TFinalOutput>,
  rawInput: unknown,
  deps: {
    modelClient: AIModelClient;
    logger?: AIWorkflowLogger;
    now?: () => Date;
  }
): Promise<AIWorkflowRunResult<TFinalOutput>> {
  const logger = deps.logger ?? noopAIWorkflowLogger;
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const startedAtIso = startedAt.toISOString();

  const input = validateWithSchema(workflow.inputSchema, rawInput, `${workflow.id} input`);

  logger.onWorkflowStart?.({
    workflowId: workflow.id,
    inputSummary: summarizeInput(input),
    startedAtIso,
  });

  try {
    const context = await workflow.buildContext(input);
    const basePrompt = workflow.buildPrompt(input, context);
    let modelResult;
    let modelOutput;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const prompt = attempt === 1 ? basePrompt : buildRepairPrompt(basePrompt, lastError?.message ?? "unknown");
      try {
        modelResult = await deps.modelClient.runStructured({
          workflowId: workflow.id,
          prompt,
          outputSchema: workflow.outputSchema,
        });
        console.log("=== MODEL CALL SUCCEEDED ===");
        logger.onModelRawResponse?.({
          workflowId: workflow.id,
          attempt,
          rawText: modelResult.rawText ?? "",
        });
        console.log("=== JSON PARSE SUCCEEDED ===");
        modelOutput = validateWithSchema(
          workflow.outputSchema,
          modelResult.output,
          `${workflow.id} output`
        );
        console.log("=== SCHEMA VALID ===");
        logger.onValidationAccepted?.({
          workflowId: workflow.id,
          attempt,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.onValidationFailure?.({
          workflowId: workflow.id,
          attempt,
          reason: lastError.message,
          rawText: modelResult?.rawText,
        });
        console.log("=== VALIDATION FAILED ===", lastError);
        if (attempt === 2) {
          if (lastError instanceof AIValidationError) {
            throw new AIValidationError(lastError.message, {
              rawText: modelResult?.rawText,
              partialOutput: modelResult?.output,
            });
          }
          throw lastError;
        }
      }
    }

    if (!modelResult || !modelOutput) {
      throw new AIValidationError(`Invalid ${workflow.id} output: no acceptable model response`);
    }

    const output = workflow.postProcess
      ? await workflow.postProcess({ input, context, modelOutput })
      : (modelOutput as unknown as TFinalOutput);
    const finishedAtIso = now().toISOString();

    logger.onWorkflowSuccess?.({
      workflowId: workflow.id,
      finishedAtIso,
      usage: modelResult.usage,
    });

    return {
      output,
      rawText: modelResult.rawText,
      usage: modelResult.usage,
      debug: {
        workflowId: workflow.id,
        startedAtIso,
        finishedAtIso,
      },
    };
  } catch (error) {
    logger.onWorkflowError?.({
      workflowId: workflow.id,
      finishedAtIso: now().toISOString(),
      error: error instanceof Error ? error : new Error(String(error)),
    });
    throw error;
  }
}
