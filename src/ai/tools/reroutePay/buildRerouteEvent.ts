import { detectBreakInDuty, detectOceanCrossing, detectReleaseMoreThanFourHoursLate, detectXDayTouch } from "./reroutePayHeuristics.ts";
import type {
  BuiltRerouteEvent,
  ParsedMiCrewRotation,
  RerouteAnalysisInput,
  RerouteDutyPeriodEvent,
  RerouteSegment,
  RerouteTiming,
} from "./types.ts";

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

function extractReroutedRoute(text: string) {
  return (
    (() => {
      const match = text.match(/\bafter deadhead to\s+([A-Z]{3})(?:,|\s)+(?:\w+\s+){0,4}rerouted(?:\s+\w+){0,2}\s+back to\s+([A-Z]{3})/i);
      return match ? `${match[1]}-${match[2]}` : undefined;
    })() ??
    (() => {
      const match = text.match(/\bafter deadhead to\s+([A-Z]{3})(?:,|\s)+(?:\w+\s+){0,4}rerouted(?:\s+\w+){0,2}\s+to\s+([A-Z]{3})/i);
      return match ? `${match[1]}-${match[2]}` : undefined;
    })() ??
    extractSegment(text, /\brerouted segment was\s+([A-Z]{3}(?:-[A-Z]{3})+)/i) ??
    extractSegment(text, /\badded(?: reroute)? segment was\s+([A-Z]{3}(?:-[A-Z]{3})+)/i) ??
    extractSegment(text, /\brerouted to\s+([A-Z]{3}(?:-[A-Z]{3})+)/i) ??
    extractSegment(text, /\bchanged to\s+([A-Z]{3}(?:-[A-Z]{3})+)/i)
  );
}

function extractBlockMinutes(text: string, kind: "original" | "rerouted" | "rerouted_segment") {
  const pattern =
    kind === "original"
      ? /\boriginal (?:affected )?(?:block|credit)(?:\s+was|[:\s-])+(\d{1,2}:\d{2})/i
      : kind === "rerouted_segment"
        ? /\b(?:rerouted|added|replacement) segment(?:\s+\w+){0,4}\s+block(?:\s+was|[:\s-])+(\d{1,2}:\d{2})|\brerouted back to\s+[A-Z]{3}(?:\s+\w+){0,4}\s+block(?:\s+was|[:\s-])+(\d{1,2}:\d{2})/i
        : /\b(?:rerouted|final) (?:block|credit)(?:\s+was|[:\s-])+(\d{1,2}:\d{2})|\bwith block (\d{1,2}:\d{2})/i;
  const match = text.match(pattern);
  return parseClockToMinutes(match?.[1] ?? match?.[2]);
}

function detectWholeDutyPeriodReroute(text: string) {
  return /\b(entire|whole|all of)\s+(day|duty period|rotation|trip)\s+(was )?rerouted/i.test(text);
}

function extractRouteSpecificBlock(text: string, route: string | undefined) {
  if (!route) {
    return undefined;
  }
  const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`\\b${escapedRoute}\\s+block(?:\\s+was|[:\\s-])+(\\d{1,2}:\\d{2})`, "i"));
  return parseClockToMinutes(match?.[1]);
}

function inferOriginalAffectedRouteFromAfterDeadhead(text: string) {
  const match = text.match(/\bDH\s+([A-Z]{3})-([A-Z]{3}).*?\bafter deadhead to\s+([A-Z]{3})(?:,|\s)+(?:\w+\s+){0,4}rerouted(?:\s+\w+){0,2}\s+back to\s+([A-Z]{3})/is);
  if (!match) {
    return undefined;
  }
  const [, originalStart, deadheadDestination, rerouteOrigin] = match;
  if (deadheadDestination !== rerouteOrigin) {
    return undefined;
  }
  return `${originalStart}-${deadheadDestination}`;
}

function routeEndpoints(route?: string) {
  if (!route) {
    return {};
  }
  const airports = route.split("-").map((item) => item.trim()).filter(Boolean);
  return {
    origin: airports[0],
    destination: airports[airports.length - 1],
  };
}

function normalizeEventTiming(timing: RerouteTiming): RerouteDutyPeriodEvent["rerouteTiming"] {
  if (timing === "before_report") {
    return "before_first_airborne";
  }
  return timing;
}

function extractDutyPeriods(args: {
  text: string;
  baseTiming: RerouteTiming;
  baseBreakInDuty?: boolean;
  baseTouchedXDay?: boolean;
  baseOceanCrossing?: boolean;
  lateReleaseReason?: "weather_or_airport_closure" | "company_controlled" | "unknown";
}): RerouteDutyPeriodEvent[] {
  const segments = Array.from(args.text.matchAll(/(?:^|\n|\.\s*)(Day\s+\d+)([\s\S]*?)(?=(?:\n|\.\s*)Day\s+\d+|$)/gi));
  const sourceSections =
    segments.length > 0
      ? segments.map((match, index) => ({
          label: match[1]?.trim() || `Event ${index + 1}`,
          text: `${match[1] ?? ""} ${match[2] ?? ""}`.trim(),
        }))
      : [{ label: "Event 1", text: args.text }];

  return sourceSections
    .map((section, index) => {
      const routeChange = extractRouteChange(section.text);
      const reroutedRoute = routeChange?.reroutedRoute ?? extractReroutedRoute(section.text);
      const originalRoute = routeChange?.originalRoute ?? inferOriginalAffectedRouteFromAfterDeadhead(section.text);
      const reroutedMinutes =
        extractRouteSpecificBlock(section.text, reroutedRoute) ??
        extractBlockMinutes(section.text, "rerouted_segment") ??
        extractBlockMinutes(section.text, "rerouted");
      const originalAffectedMinutes = extractBlockMinutes(section.text, "original");
      const sectionTiming = detectTimingFromText(section.text);
      const timing = sectionTiming !== "unknown" ? sectionTiming : args.baseTiming;
      const sectionBreak = detectBreakContext(section.text);
      const breakInDuty = sectionBreak ?? args.baseBreakInDuty;
      if (!reroutedRoute && reroutedMinutes == null && !originalRoute) {
        return null;
      }
      const endpoints = routeEndpoints(reroutedRoute);
      const reroutedSegments: RerouteSegment[] =
        reroutedRoute || reroutedMinutes != null
          ? [
              {
                origin: endpoints.origin,
                destination: endpoints.destination,
                blockMinutes: reroutedMinutes,
                isDeadhead: false,
                isRerouted: true,
                relativeToFirstBreak: breakInDuty == null ? "unknown" : breakInDuty ? "after" : "before",
                timingBasis: reroutedMinutes != null ? "known_delay" : "unknown",
              },
            ]
          : [];

      return {
        label: section.label || `Event ${index + 1}`,
        rerouteTiming: normalizeEventTiming(timing),
        firstBreakInDutyAfterReroute: breakInDuty,
        transOceanic: args.baseOceanCrossing,
        lateReleaseReason: args.lateReleaseReason,
        touchedXDayOrLineDayOff: args.baseTouchedXDay,
        originalRotationValueMinutes: originalAffectedMinutes,
        reroutedRotationValueMinutes: reroutedMinutes,
        reroutedSegments,
      } satisfies RerouteDutyPeriodEvent;
    })
    .filter((item): item is RerouteDutyPeriodEvent => Boolean(item));
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
  const inferredAfterDeadheadOriginalRoute = inferOriginalAffectedRouteFromAfterDeadhead(mergedText);
  const extractedReroutedRoute =
    input.parsedFactOverrides?.reroutedFlying ??
    routeChange?.reroutedRoute ??
    extractReroutedRoute(mergedText) ??
    extractSegment(mergedText, /\brerouted flying[:\s-]+([^\n.]+)/i) ??
    formatLegs(changedRotation) ??
    input.changedRotationText;
  const explicitReroutedSegmentMinutes =
    extractRouteSpecificBlock(mergedText, extractedReroutedRoute) ?? extractBlockMinutes(mergedText, "rerouted_segment");

  const originalAffectedFlying =
    input.parsedFactOverrides?.originalAffectedFlying ??
    routeChange?.originalRoute ??
    inferredAfterDeadheadOriginalRoute ??
    extractSegment(mergedText, /\boriginal affected flying[:\s-]+([^\n.]+)/i) ??
    formatLegs(originalRotation) ??
    input.originalRotationText;
  const reroutedFlying =
    extractedReroutedRoute;
  const rejoinPoint =
    input.parsedFactOverrides?.rejoinPoint ??
    extractSegment(mergedText, /\brejoined(?: the original trip)? in[:\s-]+([A-Z]{3})/i) ??
    extractSegment(mergedText, /\brejoin point[:\s-]+([A-Z]{3})/i);
  const originalAffectedMinutes =
    input.parsedFactOverrides?.originalAffectedMinutes ??
    parseClockToMinutes(extractSegment(mergedText, /\boriginal (?:affected )?(?:block|credit)(?:\s+was|[:\s-])+(\d{1,2}:\d{2})/i)) ??
    originalRotation?.creditMinutes;
  const reroutedMinutes =
    input.parsedFactOverrides?.reroutedMinutes ??
    explicitReroutedSegmentMinutes ??
    (detectWholeDutyPeriodReroute(mergedText)
      ? parseClockToMinutes(extractSegment(mergedText, /\b(?:rerouted|final) (?:block|credit)(?:\s+was|[:\s-])+(\d{1,2}:\d{2})/i)) ??
        changedRotation?.creditMinutes
      : undefined);
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
    missingFacts.push("What was the changed or added segment block value?");
  }

  const detectedBreakInDuty =
    input.parsedFactOverrides?.breakInDuty ?? detectBreakContext(mergedText) ?? detectBreakInDuty(input);
  const detectedTiming =
    input.parsedFactOverrides?.timing ??
    (input.rerouteTiming !== "unknown" ? input.rerouteTiming : detectTimingFromText(mergedText));
  const dutyPeriods = extractDutyPeriods({
    text: mergedText,
    baseTiming: detectedTiming,
    baseBreakInDuty: detectedBreakInDuty,
    baseTouchedXDay: input.parsedFactOverrides?.touchedXDay ?? detectXDayTouch(input),
    baseOceanCrossing: input.parsedFactOverrides?.oceanCrossing ?? detectOceanCrossing(input),
    lateReleaseReason: /weather|airport closure/i.test(mergedText)
      ? "weather_or_airport_closure"
      : /company|scheduling|crew tracking|company controlled/i.test(mergedText)
        ? "company_controlled"
        : "unknown",
  });

  return {
    pilotStatus,
    originalAffectedFlying,
    reroutedFlying,
    rejoinPoint,
    originalAffectedMinutes,
    reroutedMinutes,
    timing: detectedTiming,
    touchedXDay: input.parsedFactOverrides?.touchedXDay ?? detectXDayTouch(input),
    breakInDuty: detectedBreakInDuty,
    releaseMoreThanFourHoursLate:
      input.parsedFactOverrides?.releaseMoreThanFourHoursLate ?? detectReleaseMoreThanFourHoursLate(input),
    oceanCrossing: input.parsedFactOverrides?.oceanCrossing ?? detectOceanCrossing(input),
    affectedOriginalPortion: originalAffectedFlying,
    reroutedPortion: reroutedFlying,
    dutyPeriods,
    confidence:
      originalAffectedMinutes != null && reroutedMinutes != null && detectedTiming !== "unknown"
        ? "high"
        : originalAffectedFlying || reroutedFlying || detectedTiming !== "unknown"
          ? "medium"
          : "low",
    missingFacts,
  };
}
