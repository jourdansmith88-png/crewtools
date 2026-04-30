import { createSchema, expectObject, expectString, optionalString } from "../../../src/ai/core/validation.ts";
import { analyzeReroutePay } from "../../../src/ai/tools/reroutePay/analyzeReroutePay.ts";
import type {
  RerouteAnalysisInput,
  ReroutePayAnalyzeApiResponse,
  UploadedImage,
} from "../../../src/ai/tools/reroutePay/types.ts";
import { loadContractDocumentIndex } from "../../lib/contractSearch/loadContractIndex.ts";

function parseChoice(value: unknown, label: string) {
  const result = expectString(value, label);
  if (result !== "unknown" && result !== "yes" && result !== "no") {
    throw new Error(`${label} must be one of: unknown, yes, no`);
  }
  return result as "unknown" | "yes" | "no";
}

function parseTiming(value: unknown, label: string) {
  const result = expectString(value, label);
  if (
    result !== "unknown" &&
    result !== "before_report" &&
    result !== "after_report" &&
    result !== "after_first_airborne"
  ) {
    throw new Error(`${label} must be a valid reroute timing`);
  }
  return result as "unknown" | "before_report" | "after_report" | "after_first_airborne";
}

function parsePilotStatus(value: unknown, label: string) {
  const result = expectString(value, label);
  if (result !== "unknown" && result !== "lineholder" && result !== "reserve") {
    throw new Error(`${label} must be a valid pilot status`);
  }
  return result as "unknown" | "lineholder" | "reserve";
}

function parseOptionalMinutes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function parseUploadedImages(value: unknown, label: string): UploadedImage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const image = item as Record<string, unknown>;
      const name = typeof image.name === "string" ? image.name : null;
      const dataUrl = typeof image.dataUrl === "string" ? image.dataUrl : null;
      if (!name || !dataUrl) {
        throw new Error(`${label}[${index}] must include name and dataUrl`);
      }
      return { name, dataUrl };
    })
    .filter((item): item is UploadedImage => Boolean(item));
}

function normalizeRequestShape(value: Record<string, unknown>) {
  if (value.input && typeof value.input === "object" && !Array.isArray(value.input)) {
    const input = value.input as Record<string, unknown>;
    if (!input.originalImages && Array.isArray(input.originalScreenshots)) {
      input.originalImages = input.originalScreenshots;
    }
    if (!input.changedImages && Array.isArray(input.changedScreenshots)) {
      input.changedImages = input.changedScreenshots;
    }
    return value;
  }

  const knownFacts =
    value.knownFacts && typeof value.knownFacts === "object" && !Array.isArray(value.knownFacts)
      ? (value.knownFacts as Record<string, unknown>)
      : {};

  return {
    input: {
      originalRotationText: value.originalRotationText,
      changedRotationText: value.changedRotationText,
      description: value.description,
      pilotStatus: knownFacts.pilotStatus ?? value.pilotStatus ?? "unknown",
      rerouteTiming: knownFacts.rerouteTiming ?? value.rerouteTiming ?? "unknown",
      finalCreditDecreased: knownFacts.finalCreditDecreased ?? value.finalCreditDecreased ?? "unknown",
      touchedXDay: knownFacts.touchedXDay ?? value.touchedXDay ?? "unknown",
      deadheadInvolved: knownFacts.deadheadInvolved ?? value.deadheadInvolved ?? "unknown",
      bidPeriodCrossover: knownFacts.bidPeriodCrossover ?? value.bidPeriodCrossover ?? "unknown",
      uploadedEvidenceSummary: value.uploadedEvidenceSummary ?? {
        screenshotNames: [],
        screenshotParsingActive: false,
        notes: [],
      },
      originalImages: value.originalImages ?? value.originalScreenshots,
      changedImages: value.changedImages ?? value.changedScreenshots,
    },
  };
}

const rerouteAnalyzeRequestSchema = createSchema("reroutePayAnalyzeRequest", (value) => {
  const objectValue = expectObject(value, "request");
  const normalizedValue = normalizeRequestShape(objectValue);
  const inputValue = expectObject(normalizedValue.input, "input");
  const uploadedValue = expectObject(inputValue.uploadedEvidenceSummary, "input.uploadedEvidenceSummary");
  const parsedFactOverrides =
    inputValue.parsedFactOverrides && typeof inputValue.parsedFactOverrides === "object" && !Array.isArray(inputValue.parsedFactOverrides)
      ? expectObject(inputValue.parsedFactOverrides, "input.parsedFactOverrides")
      : null;

  return {
    input: {
      originalRotationText: optionalString(inputValue.originalRotationText),
      changedRotationText: optionalString(inputValue.changedRotationText),
      description: expectString(inputValue.description, "input.description"),
      pilotStatus: parsePilotStatus(inputValue.pilotStatus, "input.pilotStatus"),
      rerouteTiming: parseTiming(inputValue.rerouteTiming, "input.rerouteTiming"),
      finalCreditDecreased: parseChoice(inputValue.finalCreditDecreased, "input.finalCreditDecreased"),
      touchedXDay: parseChoice(inputValue.touchedXDay, "input.touchedXDay"),
      deadheadInvolved: parseChoice(inputValue.deadheadInvolved, "input.deadheadInvolved"),
      bidPeriodCrossover: parseChoice(inputValue.bidPeriodCrossover, "input.bidPeriodCrossover"),
      originalImages: parseUploadedImages(inputValue.originalImages, "input.originalImages"),
      changedImages: parseUploadedImages(inputValue.changedImages, "input.changedImages"),
      parsedFactOverrides: parsedFactOverrides
        ? {
            pilotStatus:
              typeof parsedFactOverrides.pilotStatus === "string"
                ? parsePilotStatus(parsedFactOverrides.pilotStatus, "input.parsedFactOverrides.pilotStatus")
                : undefined,
            originalAffectedFlying: optionalString(parsedFactOverrides.originalAffectedFlying),
            reroutedFlying: optionalString(parsedFactOverrides.reroutedFlying),
            rejoinPoint: optionalString(parsedFactOverrides.rejoinPoint),
            originalAffectedMinutes: parseOptionalMinutes(parsedFactOverrides.originalAffectedMinutes),
            reroutedMinutes: parseOptionalMinutes(parsedFactOverrides.reroutedMinutes),
            timing:
              typeof parsedFactOverrides.timing === "string"
                ? parseTiming(parsedFactOverrides.timing, "input.parsedFactOverrides.timing")
                : undefined,
            touchedXDay:
              typeof parsedFactOverrides.touchedXDay === "boolean" ? parsedFactOverrides.touchedXDay : undefined,
            breakInDuty:
              typeof parsedFactOverrides.breakInDuty === "boolean" ? parsedFactOverrides.breakInDuty : undefined,
            releaseMoreThanFourHoursLate:
              typeof parsedFactOverrides.releaseMoreThanFourHoursLate === "boolean"
                ? parsedFactOverrides.releaseMoreThanFourHoursLate
                : undefined,
            oceanCrossing:
              typeof parsedFactOverrides.oceanCrossing === "boolean" ? parsedFactOverrides.oceanCrossing : undefined,
          }
        : undefined,
      uploadedEvidenceSummary: {
        originalScreenshotName: optionalString(uploadedValue.originalScreenshotName),
        changedScreenshotName: optionalString(uploadedValue.changedScreenshotName),
        originalScreenshotNames: Array.isArray(uploadedValue.originalScreenshotNames)
          ? uploadedValue.originalScreenshotNames.filter((item): item is string => typeof item === "string")
          : [],
        changedScreenshotNames: Array.isArray(uploadedValue.changedScreenshotNames)
          ? uploadedValue.changedScreenshotNames.filter((item): item is string => typeof item === "string")
          : [],
        originalScreenshotCount:
          typeof uploadedValue.originalScreenshotCount === "number" ? uploadedValue.originalScreenshotCount : undefined,
        changedScreenshotCount:
          typeof uploadedValue.changedScreenshotCount === "number" ? uploadedValue.changedScreenshotCount : undefined,
        originalFilenames: Array.isArray(uploadedValue.originalFilenames)
          ? uploadedValue.originalFilenames.filter((item): item is string => typeof item === "string")
          : [],
        changedFilenames: Array.isArray(uploadedValue.changedFilenames)
          ? uploadedValue.changedFilenames.filter((item): item is string => typeof item === "string")
          : [],
        screenshotNames: Array.isArray(uploadedValue.screenshotNames)
          ? uploadedValue.screenshotNames.filter((item): item is string => typeof item === "string")
          : [],
        screenshotParsingActive:
          typeof uploadedValue.screenshotParsingActive === "boolean"
            ? uploadedValue.screenshotParsingActive
            : false,
        notes: Array.isArray(uploadedValue.notes)
          ? uploadedValue.notes.filter((item): item is string => typeof item === "string")
          : [],
      },
    } satisfies RerouteAnalysisInput,
  };
});

function jsonResponse(status: number, payload: ReroutePayAnalyzeApiResponse) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
}

export async function handleReroutePayAnalyzeRoute(request: Request) {
  console.log("[reroutePay] route entered");
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "Method not allowed",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
    console.log("[reroutePay] body parsed");
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: "Invalid JSON body",
    });
  }

  let parsed: { input: RerouteAnalysisInput };
  try {
    parsed = rerouteAnalyzeRequestSchema.parse(body);
    console.log("[rp-images] route received originalImages count:", parsed.input.originalImages?.length ?? 0);
    console.log("[rp-images] route received changedImages count:", parsed.input.changedImages?.length ?? 0);
    console.log(
      "[rp-images] first original starts data:image:",
      parsed.input.originalImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
    );
    console.log(
      "[rp-images] first changed starts data:image:",
      parsed.input.changedImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
    );
    console.log("[reroutePay] normalized input", {
      pilotStatus: parsed.input.pilotStatus,
      rerouteTiming: parsed.input.rerouteTiming,
      hasOriginalRotationText: Boolean(parsed.input.originalRotationText?.trim()),
      hasChangedRotationText: Boolean(parsed.input.changedRotationText?.trim()),
      descriptionLength: parsed.input.description.length,
      originalImages: parsed.input.originalImages?.length ?? 0,
      changedImages: parsed.input.changedImages?.length ?? 0,
      firstOriginalImageName: parsed.input.originalImages?.[0]?.name,
      firstChangedImageName: parsed.input.changedImages?.[0]?.name,
      firstOriginalImageIsDataUrl: parsed.input.originalImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
      firstChangedImageIsDataUrl: parsed.input.changedImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
    });
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid request",
    });
  }

  try {
    const contractIndex = loadContractDocumentIndex();
    const screenshotBacked =
      (parsed.input.originalImages?.length ?? 0) > 0 || (parsed.input.changedImages?.length ?? 0) > 0;
    const routeTimeoutMs = screenshotBacked ? 45_000 : 8_000;
    console.log("[reroutePay] analyzeReroutePay start");
    const result = await withTimeout(
      analyzeReroutePay({
        input: parsed.input,
        contractIndex,
      }),
      routeTimeoutMs,
      "Reroute analysis timed out",
    );
    console.log("[reroutePay] analyzeReroutePay done", {
      estimatedAdditionalPayMinutes: result.estimatedAdditionalPayMinutes,
      firstRule: result.payItems[0]?.rule,
      firstMath: result.payItems[0]?.math,
      affectedOriginalPortion:
        result.rerouteEvent.affectedOriginalPortion ?? result.rerouteEvent.originalAffectedFlying,
      reroutedPortion: result.rerouteEvent.reroutedPortion ?? result.rerouteEvent.reroutedFlying,
      whatControls: result.whatControls,
    });
    result.screenshotParserSummary = {
      screenshotParsingActive: result.screenshotParserSummary?.screenshotParsingActive ?? false,
      originalScreenshotsRead: result.screenshotParserSummary?.originalScreenshotsRead ?? 0,
      changedScreenshotsRead: result.screenshotParserSummary?.changedScreenshotsRead ?? 0,
      originalImagesReceived: parsed.input.originalImages?.length ?? 0,
      changedImagesReceived: parsed.input.changedImages?.length ?? 0,
      firstOriginalImageName: parsed.input.originalImages?.[0]?.name,
      firstChangedImageName: parsed.input.changedImages?.[0]?.name,
      firstOriginalStartsWithDataImage: parsed.input.originalImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
      firstChangedStartsWithDataImage: parsed.input.changedImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
      visionModelCalled: result.screenshotParserSummary?.visionModelCalled ?? false,
      modelSelected: result.screenshotParserSummary?.modelSelected,
      parseConfidence: result.screenshotParserSummary?.parseConfidence ?? "low",
      rotationCount: result.screenshotParserSummary?.rotationCount ?? 0,
      legsDetected: result.screenshotParserSummary?.legsDetected ?? 0,
      missingParseItems: result.screenshotParserSummary?.missingParseItems ?? [],
      extractionNotes: result.screenshotParserSummary?.extractionNotes ?? [],
      rawVisionResponsePreview: result.screenshotParserSummary?.rawVisionResponsePreview ?? [],
      rawTextPreview: result.screenshotParserSummary?.rawTextPreview ?? [],
      structuredJsonParseError: result.screenshotParserSummary?.structuredJsonParseError,
      fallbackRegexLegsParsed: result.screenshotParserSummary?.fallbackRegexLegsParsed ?? 0,
      parsedLegs: result.screenshotParserSummary?.parsedLegs ?? [],
    };
    console.log("[reroutePay] response sent");
    return jsonResponse(200, {
      ok: true,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reroute analysis failed";
    console.log("[reroutePay] route failed", { error: message });
    return jsonResponse(200, {
      ok: false,
      status: "warning",
      error: message === "Reroute analysis timed out" ? message : `Reroute analysis failed: ${message}`,
      result: {
        status: "warning",
        estimatedAdditionalPayMinutes: undefined,
        payItems: [],
        calculationSteps: ["Reroute analysis did not complete."],
        plainEnglishExplanation: "The analyzer hit a runtime error before it could finish.",
        missingFacts: [],
        warnings: [message],
        whatControls: [],
        supportCards: [],
        likelyIssue: "Reroute analysis error",
        shortAnswer: "The reroute analyzer hit an internal error before it could finish.",
        rerouteEvent: {
          confidence: "low",
          missingFacts: [],
        },
        ruleEvent: {
          pilotStatus: parsed?.input?.pilotStatus === "reserve" ? "reserve" : "lineholder",
          rerouteTiming: "unknown",
          lateReleaseReason: "unknown",
          reroutedSegments: [],
        },
        calculation: {
          calculationType: "insufficient_inputs",
          calculationSteps: ["Reroute analysis did not complete."],
          labels: [],
          missingFacts: [],
          confidence: "low",
        },
        estimatedPayLabel: "Unavailable",
        classification: {
          likelyReroute: "unknown",
          likelyContinuation: "unknown",
          possiblePayProtection: "unknown",
          missingFacts: [],
        },
        factsUsed: [],
        whatThisDependsOn: [],
        likelyPaths: [],
        whatToCheck: [],
        sourceLimitations: [],
        focusedQuestions: [],
        screenshotParserSummary: {
          screenshotParsingActive: (parsed?.input?.originalImages?.length ?? 0) + (parsed?.input?.changedImages?.length ?? 0) > 0,
          originalScreenshotsRead: 0,
          changedScreenshotsRead: 0,
          originalImagesReceived: parsed?.input?.originalImages?.length ?? 0,
          changedImagesReceived: parsed?.input?.changedImages?.length ?? 0,
          firstOriginalImageName: parsed?.input?.originalImages?.[0]?.name,
          firstChangedImageName: parsed?.input?.changedImages?.[0]?.name,
          firstOriginalStartsWithDataImage: parsed?.input?.originalImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
          firstChangedStartsWithDataImage: parsed?.input?.changedImages?.[0]?.dataUrl.startsWith("data:image/") ?? false,
          visionModelCalled: false,
          modelSelected: process.env.OPENAI_VISION_MODEL ?? "gpt-4.1",
          parseConfidence: "low",
          rotationCount: 0,
          legsDetected: 0,
          missingParseItems: [message],
          extractionNotes: [
            message === "Reroute analysis timed out"
              ? "Screenshots were received, but image parsing took too long."
              : "Route-level catch returned fallback diagnostics.",
          ],
          rawVisionResponsePreview: [],
          rawTextPreview: [],
          structuredJsonParseError: message,
          fallbackRegexLegsParsed: 0,
          parsedLegs: [],
        },
      },
    });
  }
}
