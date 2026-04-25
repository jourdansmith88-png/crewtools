import { createOpenAIModelClient } from "../../../src/ai/core/openAIModelClient.ts";
import { consoleAIWorkflowLogger } from "../../../src/ai/core/logger.ts";
import { runAIWorkflow } from "../../../src/ai/core/workflowRunner.ts";
import { validateWithSchema } from "../../../src/ai/core/validation.ts";
import {
  contractCopilotScreenshotExtractionRequestSchema,
  type ContractCopilotApiErrorResponse,
  type ContractCopilotScreenshotExtractionSuccessResponse,
} from "../../../src/ai/workflows/contractCopilot/api.ts";
import { tripScreenshotParserAIWorkflow } from "../../../src/ai/workflows/tripScreenshotParser/index.ts";
import { buildFactPatchFromTripExtraction } from "../../../src/utils/contractCopilot/evidenceMapping.ts";

function jsonResponse(
  status: number,
  body: ContractCopilotScreenshotExtractionSuccessResponse | ContractCopilotApiErrorResponse
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function handleContractCopilotExtractTripScreenshotRoute(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST for screenshot extraction.",
      },
    });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
      },
    });
  }

  const validated = validateWithSchema(
    contractCopilotScreenshotExtractionRequestSchema,
    parsedBody,
    "contract copilot screenshot extraction request"
  );

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse(503, {
      ok: false,
      error: {
        code: "missing_api_key",
        message: "OPENAI_API_KEY is required for screenshot fact extraction.",
      },
    });
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const modelClient = createOpenAIModelClient({
    apiKey,
    model,
  });

  try {
    const workflowResult = await runAIWorkflow(
      tripScreenshotParserAIWorkflow,
      {
        imageDataUrl: validated.imageDataUrl,
        imageName: validated.imageName,
        evidenceType:
          validated.evidenceType === "trip_text_paste" ? "trip_screenshot" : validated.evidenceType ?? "trip_screenshot",
        questionHint: validated.questionHint,
      },
      {
        modelClient,
        logger: consoleAIWorkflowLogger,
      }
    );

    const suggestedFactPatch = buildFactPatchFromTripExtraction(workflowResult.output);

    return jsonResponse(200, {
      ok: true,
      review: {
        id: `extract-${Date.now()}`,
        evidenceType: validated.evidenceType ?? "trip_screenshot",
        sourceName: validated.imageName,
        extractedAtIso: new Date().toISOString(),
        imagePreviewDataUrl: validated.imageDataUrl,
        facts: workflowResult.output,
        suggestedFactPatch,
        status: "needs_confirmation",
      },
      meta: {
        modelUsed: model,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: {
        code: "extraction_failed",
        message: error instanceof Error ? error.message : "Screenshot extraction failed.",
      },
    });
  }
}
