import { createSchema, expectObject, expectString, optionalString } from "../../../src/ai/core/validation.ts";
import { analyzeReroutePay } from "../../../src/ai/tools/reroutePay/analyzeReroutePay.ts";
import type {
  RerouteAnalysisInput,
  ReroutePayAnalyzeApiResponse,
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

function normalizeRequestShape(value: Record<string, unknown>) {
  if (value.input && typeof value.input === "object" && !Array.isArray(value.input)) {
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
    console.log("[reroutePay] normalized input", {
      pilotStatus: parsed.input.pilotStatus,
      rerouteTiming: parsed.input.rerouteTiming,
      hasOriginalRotationText: Boolean(parsed.input.originalRotationText?.trim()),
      hasChangedRotationText: Boolean(parsed.input.changedRotationText?.trim()),
      descriptionLength: parsed.input.description.length,
    });
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid request",
    });
  }

  try {
    const contractIndex = loadContractDocumentIndex();
    console.log("[reroutePay] analyzeReroutePay start");
    const result = await withTimeout(
      analyzeReroutePay({
        input: parsed.input,
        contractIndex,
      }),
      8_000,
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
    });
  }
}
