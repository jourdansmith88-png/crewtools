import type { UploadedImage } from "../../../src/ai/tools/reroutePay/types.ts";
import { extractRotationTextFromScreenshots } from "../../../src/features/rotationCompanion/screenshotExtractionAdapter.ts";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function parseUploadedImages(value: unknown, label: string): UploadedImage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`${label}[${index}] must be an object`);
      }
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.name !== "string" || typeof candidate.dataUrl !== "string") {
        throw new Error(`${label}[${index}] must include name and dataUrl`);
      }
      return {
        name: candidate.name,
        dataUrl: candidate.dataUrl,
      };
    })
    .filter((item): item is UploadedImage => Boolean(item));
}

function normalizeBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be an object");
  }
  const objectValue = value as Record<string, unknown>;
  const input =
    objectValue.input && typeof objectValue.input === "object" && !Array.isArray(objectValue.input)
      ? (objectValue.input as Record<string, unknown>)
      : objectValue;

  const screenshots = parseUploadedImages(
    input.screenshots ?? input.images ?? input.changedImages ?? input.rotationScreenshots,
    "input.screenshots",
  );

  return {
    screenshots,
  };
}

export async function handleRotationCompanionParseScreenshotsRoute(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "Method not allowed",
      warnings: [],
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: "Invalid JSON body",
      warnings: [],
    });
  }

  let normalized: { screenshots: UploadedImage[] };
  try {
    normalized = normalizeBody(body);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid request",
      warnings: [],
    });
  }

  try {
    const screenshots = normalized.screenshots;
    const result = await extractRotationTextFromScreenshots({
      screenshots,
      uploadedEvidenceSummary: {
        originalScreenshotNames: [],
        changedScreenshotNames: screenshots.map((image) => image.name),
        originalScreenshotCount: 0,
        changedScreenshotCount: screenshots.length,
        originalFilenames: [],
        changedFilenames: screenshots.map((image) => image.name),
        screenshotNames: screenshots.map((image) => image.name),
        screenshotParsingActive: screenshots.length > 0,
        notes: [],
      },
    });

    if (!result.ok) {
      return jsonResponse(200, result);
    }

    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(200, {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read screenshots clearly",
      warnings: [],
      missingSections: [],
    });
  }
}
