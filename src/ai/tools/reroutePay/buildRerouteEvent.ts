import { detectBreakInDuty, detectOceanCrossing, detectReleaseMoreThanFourHoursLate, detectXDayTouch } from "./reroutePayHeuristics.ts";
import type { BuiltRerouteEvent, ParsedMiCrewRotation, RerouteAnalysisInput, RerouteTiming } from "./types.ts";

function detectTimingFromText(text: string): RerouteTiming {
  if (/after first airborne|after airborne/i.test(text)) {
    return "after_first_airborne";
  }
  if (/after report/i.test(text)) {
    return "after_report";
  }
  if (/before report/i.test(text)) {
    return "before_report";
  }
  return "unknown";
}

function detectBreakContext(text: string) {
  if (/before (?:the )?first break in duty/i.test(text)) {
    return false;
  }
  if (/after (?:the )?first break in duty/i.test(text)) {
    return true;
  }
  return undefined;
}

function parseClockToMinutes(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function extractSegment(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim();
}

function extractRouteChange(text: string) {
  const patterns = [
    /\brerouted from\s+([A-Z]{3}(?:-[A-Z]{3})+)\s+to\s+([A-Z]{3}(?:-[A-Z]{3})+)/i,
    /\bchanged from\s+([A-Z]{3}(?:-[A-Z]{3})+)\s+to\s+([A-Z]{3}(?:-[A-Z]{3})+)/i,
    /\bwas supposed to be\s+([A-Z]{3}(?:-[A-Z]{3})+)\s+but (?:became|changed to)\s+([A-Z]{3}(?:-[A-Z]{3})+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        originalRoute: match[1]?.trim(),
        reroutedRoute: match[2]?.trim(),
      };
    }
  }
  return null;
}

function formatLegs(rotation?: ParsedMiCrewRotation) {
  if (!rotation || rotation.legs.length === 0) {
    return undefined;
  }
  return rotation.legs
    .map((leg) => (leg.origin && leg.destination ? `${leg.origin}-${leg.destination}` : leg.flightNumber))
    .filter(Boolean)
    .join(", ");
}

export function buildRerouteEvent(args: {
  originalRotation?: ParsedMiCrewRotation;
  changedRotation?: ParsedMiCrewRotation;
  description: string;
  pilotStatus: RerouteAnalysisInput["pilotStatus"];
  input: RerouteAnalysisInput;
}): BuiltRerouteEvent {
  const { originalRotation, changedRotation, description, pilotStatus, input } = args;
  const mergedText = [description, input.originalRotationText ?? "", input.changedRotationText ?? ""].join("\n");
  const routeChange = extractRouteChange(mergedText);

  const originalAffectedFlying =
    input.parsedFactOverrides?.originalAffectedFlying ??
    routeChange?.originalRoute ??
    extractSegment(mergedText, /\boriginal affected flying[:\s-]+([^\n.]+)/i) ??
    formatLegs(originalRotation) ??
    input.originalRotationText;
  const reroutedFlying =
    input.parsedFactOverrides?.reroutedFlying ??
    routeChange?.reroutedRoute ??
    extractSegment(mergedText, /\brerouted flying[:\s-]+([^\n.]+)/i) ??
    formatLegs(changedRotation) ??
    input.changedRotationText;
  const rejoinPoint =
    input.parsedFactOverrides?.rejoinPoint ??
    extractSegment(mergedText, /\brejoined(?: the original trip)? in[:\s-]+([A-Z]{3})/i) ??
    extractSegment(mergedText, /\brejoin point[:\s-]+([A-Z]{3})/i);
  const originalAffectedMinutes =
    input.parsedFactOverrides?.originalAffectedMinutes ??
    originalRotation?.creditMinutes ??
    parseClockToMinutes(extractSegment(mergedText, /\boriginal (?:affected )?(?:block|credit)(?:\s+was|[:\s-])+(\d{1,2}:\d{2})/i));
  const reroutedMinutes =
    input.parsedFactOverrides?.reroutedMinutes ??
    changedRotation?.creditMinutes ??
    parseClockToMinutes(extractSegment(mergedText, /\b(?:rerouted|final) (?:block|credit)(?:\s+was|[:\s-])+(\d{1,2}:\d{2})/i));
  const timing =
    input.parsedFactOverrides?.timing ??
    (input.rerouteTiming !== "unknown" ? input.rerouteTiming : detectTimingFromText(mergedText));

  const missingFacts: string[] = [];
  if (!originalAffectedFlying) {
    missingFacts.push("What original leg or portion was replaced?");
  }
  if (originalAffectedMinutes == null) {
    missingFacts.push("What was the original affected block?");
  }
  if (!timing || timing === "unknown") {
    missingFacts.push("Did this happen before report, after report, or after first airborne?");
  }
  if (!rejoinPoint) {
    missingFacts.push("Where did you rejoin the original trip?");
  }
  if (!reroutedFlying) {
    missingFacts.push("What rerouted leg or portion replaced the original flying?");
  }
  if (reroutedMinutes == null) {
    missingFacts.push("What was the rerouted block or credit value?");
  }

  return {
    pilotStatus,
    originalAffectedFlying,
    reroutedFlying,
    rejoinPoint,
    originalAffectedMinutes,
    reroutedMinutes,
    timing,
    touchedXDay: input.parsedFactOverrides?.touchedXDay ?? detectXDayTouch(input),
    breakInDuty: input.parsedFactOverrides?.breakInDuty ?? detectBreakContext(mergedText) ?? detectBreakInDuty(input),
    releaseMoreThanFourHoursLate:
      input.parsedFactOverrides?.releaseMoreThanFourHoursLate ?? detectReleaseMoreThanFourHoursLate(input),
    oceanCrossing: input.parsedFactOverrides?.oceanCrossing ?? detectOceanCrossing(input),
    affectedOriginalPortion: originalAffectedFlying,
    reroutedPortion: reroutedFlying,
    confidence:
      originalAffectedMinutes != null && reroutedMinutes != null && timing !== "unknown"
        ? "high"
        : originalAffectedFlying || reroutedFlying || timing !== "unknown"
          ? "medium"
          : "low",
    missingFacts,
  };
}
