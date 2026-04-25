import { AIModelError } from "./errors.ts";
import type { AIModelClient } from "./modelClient.ts";
import type { AIModelStructuredRequest, AIModelStructuredResponse } from "./types.ts";

type OpenAIModelClientOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

function buildSystemPrompt(request: AIModelStructuredRequest<unknown>) {
  const context = (request.prompt.contextBlocks ?? [])
    .map((block) => `${block.label}:\n${block.content}`)
    .join("\n\n");

  return context.length > 0
    ? `${request.prompt.systemPrompt}\n\nContext:\n${context}`
    : request.prompt.systemPrompt;
}

function buildUserPrompt(request: AIModelStructuredRequest<unknown>) {
  if (process.env.OPENAI_DISABLE_STRUCTURED_OUTPUT === "1") {
    return `${request.prompt.userPrompt}\n\nAnswer in plain text only. Do not return JSON or markdown.`;
  }
  return `${request.prompt.userPrompt}\n\nReturn ONLY valid JSON that matches the required schema. No markdown. No prose outside JSON.`;
}

function buildUserContent(request: AIModelStructuredRequest<unknown>) {
  const textBlock = {
    type: "text",
    text: buildUserPrompt(request),
  };

  if (!request.prompt.userImages || request.prompt.userImages.length === 0) {
    return textBlock.text;
  }

  return [
    textBlock,
    ...request.prompt.userImages.map((image) => ({
      type: "image_url",
      image_url: {
        url: image.dataUrl,
      },
    })),
  ];
}

function validateOpenAIJsonSchemaNode(node: unknown, path = "root"): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return;
  }

  const schemaNode = node as Record<string, unknown>;
  const properties =
    schemaNode.properties && typeof schemaNode.properties === "object" && !Array.isArray(schemaNode.properties)
      ? (schemaNode.properties as Record<string, unknown>)
      : null;

  if (properties) {
    const propertyKeys = Object.keys(properties);
    const required = schemaNode.required;
    if (!Array.isArray(required)) {
      throw new AIModelError(
        `Schema preflight failed at ${path}: object schemas with properties must define a required array.`,
      );
    }

    const requiredSet = new Set(required.filter((item): item is string => typeof item === "string"));
    const missingRequiredKeys = propertyKeys.filter((key) => !requiredSet.has(key));
    if (missingRequiredKeys.length > 0) {
      throw new AIModelError(
        `Schema preflight failed at ${path}: required is missing keys ${missingRequiredKeys.join(", ")}`,
      );
    }
  }

  if (schemaNode.items) {
    validateOpenAIJsonSchemaNode(schemaNode.items, `${path}.items`);
  }

  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      validateOpenAIJsonSchemaNode(value, `${path}.properties.${key}`);
    }
  }
}

function validateOpenAIJsonSchema(request: AIModelStructuredRequest<unknown>) {
  if (!request.outputSchema.jsonSchema) {
    return;
  }
  validateOpenAIJsonSchemaNode(request.outputSchema.jsonSchema, request.outputSchema.name);
  console.log("SCHEMA PREFLIGHT PASSED", request.outputSchema.name);
}

export function createOpenAIModelClient(options: OpenAIModelClientOptions): AIModelClient {
  return {
    async runStructured<TOutput>(
      request: AIModelStructuredRequest<TOutput>
    ): Promise<AIModelStructuredResponse<TOutput>> {
      validateOpenAIJsonSchema(request as AIModelStructuredRequest<unknown>);

      const usePlainTextMode = process.env.OPENAI_DISABLE_STRUCTURED_OUTPUT === "1";
      const requestBody: Record<string, unknown> = {
        model: options.model,
        temperature: request.prompt.temperature ?? 0.1,
        messages: [
          { role: "system", content: buildSystemPrompt(request) },
          { role: "user", content: buildUserContent(request) },
        ],
      };

      if (!usePlainTextMode) {
        requestBody.response_format = request.outputSchema.jsonSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: request.outputSchema.name,
                strict: true,
                schema: request.outputSchema.jsonSchema,
              },
            }
          : { type: "json_object" };
      }

      try {
        console.log("MODEL CALL START");
        const response = await fetch(`${options.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log("MODEL CALL FAILED");
          throw new AIModelError(`OpenAI request failed: ${response.status} ${errorText}`);
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }>; refusal?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        console.log("MODEL CALL SUCCESS");
        console.log("=== OPENAI RAW RESPONSE OBJECT ===");
        console.dir(payload, { depth: null });

        const content = payload.choices?.[0]?.message?.content;
        const rawText =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content
                  .map((item) => (typeof item?.text === "string" ? item.text : ""))
                  .join("")
              : undefined;
        console.log("=== EXTRACTED MODEL CONTENT ===");
        console.log(rawText ?? "");
        console.log("=== RAW MODEL OUTPUT ===");
        console.log(rawText ?? "");

        if (!rawText || rawText.trim().length === 0) {
          throw new AIModelError("OpenAI returned no structured content.");
        }

        if (usePlainTextMode) {
          return {
            output: rawText as TOutput,
            rawText,
            usage: {
              inputTokens: payload.usage?.prompt_tokens,
              outputTokens: payload.usage?.completion_tokens,
            },
          };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
          console.log("=== PARSED OUTPUT BEFORE VALIDATION ===");
          console.dir(parsed, { depth: null });
        } catch (error) {
          throw new AIModelError(
            `OpenAI returned invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
          );
        }

        return {
          output: parsed as TOutput,
          rawText,
          usage: {
            inputTokens: payload.usage?.prompt_tokens,
            outputTokens: payload.usage?.completion_tokens,
          },
        };
      } catch (error) {
        console.log("MODEL CALL FAILED");
        throw error;
      }
    },
  };
}
