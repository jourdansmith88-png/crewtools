import { parseICrewTextWithDiagnostics, type ICrewParserDiagnostics } from "./parseICrewText.ts";
import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";

export type TripWatchParserPath =
  | RotationDashboardData["parsedRotation"]["parserPath"]
  | "screenshot_extraction"
  | "screenshot_partial"
  | "plain_text_partial";

export type TripWatchLegSummary = string;

export type TripWatchRotationSnapshot = {
  rotationNumber?: string;
  tripDates?: string;
  source: RotationDashboardData["source"];
  parserPath?: TripWatchParserPath;
  parseConfidence?: RotationDashboardData["parsedRotation"]["parseConfidence"];
  legs: RotationDashboardData["legs"];
  operatingLegs: RotationDashboardData["legs"];
  deadheadLegs: RotationDashboardData["legs"];
  layovers: string[];
  totalCreditMinutes?: number;
  operatingBlockMinutes?: number;
  deadheadBlockMinutes?: number;
  tafbMinutes?: number;
  reportTime?: string;
  releaseTime?: string;
  finalOperatingArrival?: string;
  finalArrivalAfterDh?: string;
  isPartial?: boolean;
};

export type TripWatchComparisonStatus = "ok" | "no_loaded_rotation" | "needs_more_info" | "unparseable";

export type TripWatchComparisonResult = {
  status: TripWatchComparisonStatus;
  title: string;
  summary: string;
  comparisonConfidence: "high" | "medium" | "low";
  parserPathUsed?: TripWatchParserPath | null;
  addedLegs: TripWatchLegSummary[];
  removedLegs: TripWatchLegSummary[];
  changedLegs: TripWatchLegSummary[];
  changedLayovers: string[];
  changedReportTimes: string[];
  changedReleaseTime?: string | null;
  finalArrivalChange?: string | null;
  creditDeltaMinutes?: number | null;
  operatingBlockDeltaMinutes?: number | null;
  dhBlockDeltaMinutes?: number | null;
  tafbDeltaMinutes?: number | null;
  watchItems: string[];
  recommendedActions: string[];
  baselineSnapshot?: TripWatchRotationSnapshot | null;
  updatedSnapshot?: TripWatchRotationSnapshot | null;
  baselineLegCount?: number;
  updatedParsedLegCount?: number;
  debug?: {
    baselineLegCount: number;
    updatedParsedLegCount: number;
    parserPathUsed?: TripWatchParserPath | null;
    candidateCityPairCount?: number;
    sufficiencyReason?: string;
    comparisonSkipped?: boolean;
    normalizedAddedCount: number;
    normalizedRemovedCount: number;
    normalizedChangedCount: number;
    baselineRotationNumber?: string;
    updatedRotationNumber?: string;
    baselineDeadheadBlockMinutes?: number;
    updatedDeadheadBlockMinutes?: number;
    resultDeadheadBlockDeltaMinutes?: number | null;
    updatedSameAirportNonDhLegs?: string[];
    updatedAllLegs?: string[];
    updatedLegsWithSegmentType?: string[];
    updatedRtgLegs?: string[];
    resultAddedLegs?: string[];
    resultChangedLegs?: string[];
    resultWatchItems?: string[];
  };
};

export type TripWatchUpdatedParseResult =
  | {
      status: "ok";
      dashboard: RotationDashboardData;
      snapshot: TripWatchRotationSnapshot;
      parserPathUsed: TripWatchParserPath | null;
      updatedParsedLegCount: number;
      debugArtifacts?: {
        rawICrewParse?: {
          parserSucceeded: boolean;
          parsed: NonNullable<ReturnType<typeof parseICrewTextWithDiagnostics>["parsed"]> | null;
          diagnostics: ICrewParserDiagnostics | null;
        } | null;
        updatedDashboard?: RotationDashboardData | null;
        updatedSnapshot?: TripWatchRotationSnapshot | null;
      };
    }
  | {
      status: "needs_more_info" | "unparseable";
      title: string;
      summary: string;
      comparisonConfidence: "high" | "medium" | "low";
      parserPathUsed?: TripWatchParserPath | null;
      updatedParsedLegCount?: number;
      candidateCityPairCount?: number;
      sufficiencyReason?: string;
      watchItems?: string[];
      recommendedActions?: string[];
    };

export type TripWatchScreenshotAttachment = {
  name: string;
  dataUrl: string;
  previewUri?: string;
  mimeType?: string;
};

export type TripWatchScreenshotParseResponse =
  | {
      ok: true;
      normalizedText: string;
    }
  | {
      ok: false;
      error: string;
    };

export type TripWatchUpdatedInputArgs = {
  inputText: string;
  updatedScreenshots: TripWatchScreenshotAttachment[];
  buildICrewDashboard: (
    parsed: NonNullable<ReturnType<typeof parseICrewTextWithDiagnostics>["parsed"]>,
    options?: { previewNote?: string },
  ) => RotationDashboardData;
  parseRotationIntoDashboard: (rawInput: string) => {
    ok: boolean;
    parsedRotation?: RotationDashboardData["parsedRotation"];
    dashboard?: RotationDashboardData;
    error?: string;
  };
  parseScreenshots: (screenshots: TripWatchScreenshotAttachment[]) => Promise<TripWatchScreenshotParseResponse>;
};

export function normalizeTripWatchTimeKey(value?: string | null) {
  if (!value) {
    return "";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) {
    return digits.slice(0, 4);
  }
  if (digits.length === 3) {
    return digits.padStart(4, "0");
  }
  return digits;
}

export function normalizeTripWatchDateKey(value?: string | null) {
  if (!value) {
    return "";
  }
  const normalized = value.toUpperCase();
  const match = normalized.match(/\b(\d{1,2}[A-Z]{3})/);
  return match?.[1] ?? "";
}

function normalizeTripWatchFlightNumber(value?: string | null) {
  return value?.replace(/\s+/g, "").toUpperCase() ?? "";
}

function normalizeTripWatchCarrier(value?: string | null) {
  return value?.replace(/\s+/g, "").toUpperCase() ?? "";
}

function isTripWatchReturnToGateLeg(leg: RotationDashboardData["legs"][number]) {
  const segmentType = (leg as RotationDashboardData["legs"][number] & { segmentType?: string }).segmentType;
  return segmentType === "return_to_gate" || (!leg.isDeadhead && leg.origin === leg.destination);
}

function extractTripWatchLegDate(leg: RotationDashboardData["legs"][number]) {
  return (
    normalizeTripWatchDateKey(leg.dayLabel) ||
    normalizeTripWatchDateKey(leg.sourceText) ||
    normalizeTripWatchDateKey(leg.departureTime) ||
    ""
  );
}

export function makeTripWatchLegKey(leg: RotationDashboardData["legs"][number]) {
  const dateKey = extractTripWatchLegDate(leg);
  const timeKey = normalizeTripWatchTimeKey(leg.departureTime ?? leg.sourceText ?? undefined);
  return [
    normalizeTripWatchCarrier(leg.carrier),
    normalizeTripWatchFlightNumber(leg.flightNumber),
    (leg.origin ?? "").toUpperCase(),
    (leg.destination ?? "").toUpperCase(),
    dateKey,
    timeKey,
  ].join("|");
}

export function makeTripWatchRouteKey(leg: RotationDashboardData["legs"][number]) {
  const dateKey = extractTripWatchLegDate(leg);
  return [
    normalizeTripWatchCarrier(leg.carrier),
    normalizeTripWatchFlightNumber(leg.flightNumber),
    (leg.origin ?? "").toUpperCase(),
    (leg.destination ?? "").toUpperCase(),
    dateKey,
  ].join("|");
}

export function formatTripWatchLegSummary(leg: RotationDashboardData["legs"][number]): TripWatchLegSummary {
  const carrierCode = normalizeTripWatchCarrier(leg.carrier);
  const normalizedFlight = normalizeTripWatchFlightNumber(leg.flightNumber);
  const flightCode = `${carrierCode && !normalizedFlight.startsWith(carrierCode) ? carrierCode : ""}${normalizedFlight || "TBD"}`;
  const timeBits = [leg.departureTime, leg.arrivalTime].filter(Boolean);
  const prefix = leg.isDeadhead ? "DH " : isTripWatchReturnToGateLeg(leg) ? "RTG " : "";
  return `${prefix}${leg.origin}-${leg.destination} ${flightCode}${timeBits.length === 2 ? ` ${timeBits[0]}-${timeBits[1]}` : ""}`;
}

function parseTafbMinutes(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTripWatchMinutes(value?: number | null) {
  if (value == null) {
    return "TBD";
  }
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function buildTripWatchRotationSnapshot(dashboard: RotationDashboardData): TripWatchRotationSnapshot {
  const operatingLegs = dashboard.legs.filter((leg) => !leg.isDeadhead);
  const deadheadLegs = dashboard.legs.filter((leg) => leg.isDeadhead);
  const parsedDeadheadLegs = dashboard.parsedRotation.legs.filter((leg) => leg.isDeadhead || leg.segmentType === "deadhead");
  const fallbackDeadheadMinutesFromVisibleLegs = deadheadLegs.reduce((sum, leg) => sum + (leg.scheduledBlockMinutes ?? 0), 0);
  const fallbackDeadheadMinutesFromParsedLegs = parsedDeadheadLegs.reduce((sum, leg) => sum + (leg.scheduledBlock ?? 0), 0);
  const deadheadBlockMinutes =
    typeof dashboard.parsedRotation.deadheadBlock === "number" &&
    (dashboard.parsedRotation.deadheadBlock > 0 || deadheadLegs.length === 0)
      ? dashboard.parsedRotation.deadheadBlock
      : fallbackDeadheadMinutesFromVisibleLegs > 0
        ? fallbackDeadheadMinutesFromVisibleLegs
        : fallbackDeadheadMinutesFromParsedLegs;
  const finalOperatingArrival = operatingLegs.at(-1)?.destination ?? dashboard.snapshot.finalArrival;
  const finalArrivalAfterDh =
    dashboard.parsedRotation.finalArrivalAfterDh ??
    dashboard.legs.at(-1)?.destination ??
    finalOperatingArrival;
  return {
    rotationNumber: dashboard.snapshot.rotationNumber,
    tripDates: dashboard.snapshot.tripDates,
    source: dashboard.source,
    parserPath: dashboard.parsedRotation.parserPath,
    parseConfidence: dashboard.parsedRotation.parseConfidence,
    legs: dashboard.legs,
    operatingLegs,
    deadheadLegs,
    layovers: dashboard.snapshot.layoverCities,
    totalCreditMinutes: dashboard.snapshot.totalCreditMinutes,
    operatingBlockMinutes: dashboard.snapshot.scheduledBlockMinutes,
    deadheadBlockMinutes,
    tafbMinutes: parseTafbMinutes((dashboard.parsedRotation as { tafbCredit?: string }).tafbCredit),
    reportTime: dashboard.parsedRotation.reportTime,
    releaseTime: dashboard.parsedRotation.releaseTime,
    finalOperatingArrival,
    finalArrivalAfterDh,
    isPartial: dashboard.parsedRotation.isPartial,
  };
}

export function formatTripWatchDelta(label: string, previousValue?: number | null, nextValue?: number | null) {
  if (previousValue == null || nextValue == null || previousValue === nextValue) {
    return null;
  }
  const delta = nextValue - previousValue;
  const prefix = delta > 0 ? "+" : "-";
  const absolute = Math.abs(delta);
  return `${label} ${prefix}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

export function extractTripWatchLegHints(rawText: string) {
  const hints: string[] = [];
  const normalized = rawText.toUpperCase();
  const regex = /\b([A-Z]{3})\s*(?:-|->|→)\s*([A-Z]{3})(?:.*?(\d{1,2}:?\d{2})\s*(?:-|–|TO)\s*(\d{1,2}:?\d{2}))?/g;
  for (const match of normalized.matchAll(regex)) {
    const [, origin, destination, out, inTime] = match;
    hints.push(`${origin}-${destination}${out ? ` ${normalizeTripWatchTimeKey(out)}${inTime ? `-${normalizeTripWatchTimeKey(inTime)}` : ""}` : ""}`);
  }
  return Array.from(new Set(hints));
}

export function looksLikeTripWatchICrewRotationText(rawText: string) {
  const normalized = rawText.replace(/\s+/g, " ").toUpperCase();
  const strongMarkers = [
    "*** ROTATION OPER",
    "REGULAR-",
    "TDHD",
    "TAFB",
    "PWA FDP/SKD MAX/ACT MAX",
    "ROT GUAR",
  ];
  const matchedMarkerCount = strongMarkers.filter((marker) => normalized.includes(marker)).length;
  const hasDayFlightHeader = /DAY\s+FLT\s+T\s+DEPARTS\s+ARRIVES/i.test(normalized);
  const hasRotationHeader = /POS-[A-Z0-9]{1,3}.*EFFECTIVE\s+[A-Z]{3}\d{2}/i.test(normalized);
  return matchedMarkerCount >= 2 || (matchedMarkerCount >= 1 && hasDayFlightHeader) || (matchedMarkerCount >= 2 && hasRotationHeader);
}

function hasMeaningfulTripWatchTotals(snapshot: TripWatchRotationSnapshot) {
  return (
    typeof snapshot.totalCreditMinutes === "number" ||
    typeof snapshot.operatingBlockMinutes === "number" ||
    typeof snapshot.deadheadBlockMinutes === "number" ||
    typeof snapshot.tafbMinutes === "number"
  );
}

function hasMeaningfulTripWatchScheduleData(snapshot: TripWatchRotationSnapshot) {
  return Boolean(
    snapshot.reportTime ||
      snapshot.releaseTime ||
      snapshot.tripDates ||
      snapshot.rotationNumber ||
      snapshot.finalOperatingArrival ||
      snapshot.finalArrivalAfterDh,
  );
}

function getTripWatchSufficiency(snapshot: TripWatchRotationSnapshot, candidateHintCount: number) {
  const legCount = snapshot.legs.length;
  const hasTotals = hasMeaningfulTripWatchTotals(snapshot);
  const hasScheduleData = hasMeaningfulTripWatchScheduleData(snapshot);
  const hasMultipleLegs = legCount >= 2;
  const hasSingleComparableLeg =
    legCount === 1 &&
    Boolean(
      snapshot.legs[0]?.origin &&
        snapshot.legs[0]?.destination &&
        (snapshot.legs[0]?.departureTime || snapshot.legs[0]?.arrivalTime || snapshot.legs[0]?.scheduledBlockMinutes != null),
    );

  if (hasMultipleLegs && (hasTotals || hasScheduleData)) {
    return { status: "high" as const, reason: "full_rotation_like_input" };
  }
  if (hasMultipleLegs) {
    return { status: "medium" as const, reason: "multiple_comparable_legs" };
  }
  if (hasSingleComparableLeg && (hasTotals || hasScheduleData || candidateHintCount > 0)) {
    return { status: "medium" as const, reason: "single_leg_with_context" };
  }
  if (hasSingleComparableLeg) {
    return { status: "low" as const, reason: "single_leg_without_context" };
  }
  if (candidateHintCount > 0) {
    return { status: "low" as const, reason: "candidate_route_hint_only" };
  }
  return { status: "low" as const, reason: "no_comparable_rotation_details" };
}

function buildNeedsMoreInfoResult(args: {
  summary: string;
  comparisonConfidence: "high" | "medium" | "low";
  parserPathUsed?: TripWatchParserPath | null;
  updatedParsedLegCount?: number;
  candidateCityPairCount?: number;
  sufficiencyReason: string;
  watchItems?: string[];
  recommendedActions?: string[];
}): TripWatchUpdatedParseResult {
  return {
    status: "needs_more_info",
    title: "Need more information",
    summary: args.summary,
    comparisonConfidence: args.comparisonConfidence,
    parserPathUsed: args.parserPathUsed ?? null,
    updatedParsedLegCount: args.updatedParsedLegCount ?? 0,
    candidateCityPairCount: args.candidateCityPairCount ?? 0,
    sufficiencyReason: args.sufficiencyReason,
    watchItems: args.watchItems,
    recommendedActions:
      args.recommendedActions ?? [
        "Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.",
      ],
  };
}

function buildTripWatchSnapshotFromParsedDashboard(dashboard: RotationDashboardData, rawText: string) {
  const snapshot = buildTripWatchRotationSnapshot(dashboard);
  const candidateHints = extractTripWatchLegHints(rawText);
  const sufficiency = getTripWatchSufficiency(snapshot, candidateHints.length);
  return {
    snapshot,
    candidateHints,
    sufficiency,
  };
}

function looksLikeTripWatchTailFragment(rawText: string) {
  const normalized = rawText
    .toUpperCase()
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
  if (!normalized) {
    return false;
  }

  const tailMarkers = [
    "CREW ACCOMMODATIONS PHONE NUMBER",
    "OUTSIDE ATL CALL",
    "IN ATL PLEASE CALL",
    "CREW PICK UP",
    "TRANSPORTATION -",
    "HOTEL -",
    "END ",
  ];
  const hasTailMarker = tailMarkers.some((marker) => normalized.includes(marker));
  if (!hasTailMarker) {
    return false;
  }

  const hasLegLikeRoute = /\b[A-Z]{3}\s*(?:-|->|→)\s*[A-Z]{3}\b/.test(normalized);
  const hasTotals = /\b(TL|TBL|TDHD|TAFB|BL)\b/.test(normalized);
  const hasHeader = /\b(POS-|CHECK IN AT|TRIP DATES|ROTATION OPER|DAY\s+FLT)\b/.test(normalized);
  const hasReportRelease = /\b(REPORT TIME|RELEASE)\b/.test(normalized);
  const hasFlightLine = /\b(?:DL|OO|9E|YX|AS|WN|AA|UA)\d{2,4}\b/.test(normalized);

  return !hasLegLikeRoute && !hasTotals && !hasHeader && !hasReportRelease && !hasFlightLine;
}

export function compareRotationSnapshots(
  originalSnapshot: TripWatchRotationSnapshot,
  updatedSnapshot: TripWatchRotationSnapshot,
): TripWatchComparisonResult {
  const originalMap = new Map(originalSnapshot.legs.map((leg) => [makeTripWatchLegKey(leg), leg]));
  const updatedMap = new Map(updatedSnapshot.legs.map((leg) => [makeTripWatchLegKey(leg), leg]));
  const remainingOriginal = new Map(originalMap);
  const remainingUpdated = new Map(updatedMap);

  for (const key of updatedMap.keys()) {
    if (remainingOriginal.has(key)) {
      remainingOriginal.delete(key);
      remainingUpdated.delete(key);
    }
  }

  const originalByRoute = new Map<string, Array<RotationDashboardData["legs"][number]>>();
  remainingOriginal.forEach((leg) => {
    const key = makeTripWatchRouteKey(leg);
    const group = originalByRoute.get(key) ?? [];
    group.push(leg);
    originalByRoute.set(key, group);
  });

  const changedLegs: TripWatchLegSummary[] = [];
  for (const [updatedKey, updatedLeg] of Array.from(remainingUpdated.entries())) {
    const routeKey = makeTripWatchRouteKey(updatedLeg);
    const candidates = originalByRoute.get(routeKey) ?? [];
    const originalLeg = candidates.shift();
    if (!originalLeg) {
      continue;
    }
    if (candidates.length === 0) {
      originalByRoute.delete(routeKey);
    } else {
      originalByRoute.set(routeKey, candidates);
    }
    remainingUpdated.delete(updatedKey);
    remainingOriginal.delete(makeTripWatchLegKey(originalLeg));
    const previousTimes = `${originalLeg.departureTime ?? "TBD"}-${originalLeg.arrivalTime ?? "TBD"}`;
    const nextTimes = `${updatedLeg.departureTime ?? "TBD"}-${updatedLeg.arrivalTime ?? "TBD"}`;
    const previousBlock = formatTripWatchMinutes(originalLeg.scheduledBlockMinutes);
    const nextBlock = formatTripWatchMinutes(updatedLeg.scheduledBlockMinutes);
    changedLegs.push(`${formatTripWatchLegSummary(originalLeg)} changed from ${previousTimes} / ${previousBlock} to ${nextTimes} / ${nextBlock}`);
  }

  const addedLegs = Array.from(remainingUpdated.values()).map(formatTripWatchLegSummary);
  const removedLegs = Array.from(remainingOriginal.values()).map(formatTripWatchLegSummary);

  const originalLayovers = new Set(originalSnapshot.layovers.map((city) => city.toUpperCase()));
  const updatedLayovers = new Set(updatedSnapshot.layovers.map((city) => city.toUpperCase()));
  const changedLayovers = [
    ...Array.from(updatedLayovers).filter((city) => !originalLayovers.has(city)).map((city) => `Added layover ${city}`),
    ...Array.from(originalLayovers).filter((city) => !updatedLayovers.has(city)).map((city) => `Removed layover ${city}`),
  ];

  const changedReportTimes =
    originalSnapshot.reportTime && updatedSnapshot.reportTime && originalSnapshot.reportTime !== updatedSnapshot.reportTime
      ? [`Report ${originalSnapshot.reportTime} → ${updatedSnapshot.reportTime}`]
      : [];
  const changedReleaseTime =
    originalSnapshot.releaseTime && updatedSnapshot.releaseTime && originalSnapshot.releaseTime !== updatedSnapshot.releaseTime
      ? `Release ${originalSnapshot.releaseTime} → ${updatedSnapshot.releaseTime}`
      : null;
  const finalArrivalChange =
    originalSnapshot.finalArrivalAfterDh &&
    updatedSnapshot.finalArrivalAfterDh &&
    originalSnapshot.finalArrivalAfterDh !== updatedSnapshot.finalArrivalAfterDh
      ? `Final arrival ${originalSnapshot.finalArrivalAfterDh} → ${updatedSnapshot.finalArrivalAfterDh}`
      : null;

  const creditDeltaMinutes =
    typeof originalSnapshot.totalCreditMinutes === "number" && typeof updatedSnapshot.totalCreditMinutes === "number"
      ? updatedSnapshot.totalCreditMinutes - originalSnapshot.totalCreditMinutes
      : null;
  const operatingBlockDeltaMinutes =
    typeof originalSnapshot.operatingBlockMinutes === "number" && typeof updatedSnapshot.operatingBlockMinutes === "number"
      ? updatedSnapshot.operatingBlockMinutes - originalSnapshot.operatingBlockMinutes
      : null;
  const dhBlockDeltaMinutes =
    typeof originalSnapshot.deadheadBlockMinutes === "number" && typeof updatedSnapshot.deadheadBlockMinutes === "number"
      ? updatedSnapshot.deadheadBlockMinutes - originalSnapshot.deadheadBlockMinutes
      : null;
  const tafbDeltaMinutes =
    typeof originalSnapshot.tafbMinutes === "number" && typeof updatedSnapshot.tafbMinutes === "number"
      ? updatedSnapshot.tafbMinutes - originalSnapshot.tafbMinutes
      : null;

  const isDifferentRotation =
    Boolean(originalSnapshot.rotationNumber) &&
    Boolean(updatedSnapshot.rotationNumber) &&
    originalSnapshot.rotationNumber !== updatedSnapshot.rotationNumber;

  const addedRtgLegs = Array.from(remainingUpdated.values()).filter((leg) => isTripWatchReturnToGateLeg(leg));

  const hasChanges =
    isDifferentRotation ||
    addedLegs.length > 0 ||
    removedLegs.length > 0 ||
    changedLegs.length > 0 ||
    changedLayovers.length > 0 ||
    changedReportTimes.length > 0 ||
    Boolean(changedReleaseTime) ||
    Boolean(finalArrivalChange) ||
    creditDeltaMinutes !== 0 ||
    operatingBlockDeltaMinutes !== 0 ||
    dhBlockDeltaMinutes !== 0 ||
    tafbDeltaMinutes !== 0;

  const watchItems: string[] = [];
  const recommendedActions: string[] = [];
  if (hasChanges) {
    if (isDifferentRotation) {
      watchItems.push("Different rotation number detected; this may be a new trip rather than a reroute.");
      recommendedActions.push("Load the updated rotation as a new trip or paste the actual changed rotation for comparison.");
    }
    if (addedLegs.length || removedLegs.length || changedLegs.length) {
      watchItems.push("Schedule changed; review the updated leg sequence.");
      recommendedActions.push("Review the updated trip timeline before accepting new assignments.");
    }
    if (addedRtgLegs.length > 0) {
      watchItems.push("RTG segment added.");
    }
    if (
      (creditDeltaMinutes != null && creditDeltaMinutes !== 0) ||
      (operatingBlockDeltaMinutes != null && operatingBlockDeltaMinutes !== 0) ||
      (dhBlockDeltaMinutes != null && dhBlockDeltaMinutes !== 0)
    ) {
      watchItems.push("Pay impact check recommended.");
      recommendedActions.push("Open Pay Audit after comparison for a stronger pay review.");
    }
    if (changedReportTimes.length || changedReleaseTime || addedLegs.length || removedLegs.length || changedLegs.length) {
      watchItems.push("117 inputs changed; legality check needed.");
    }
    if (changedLayovers.length || finalArrivalChange || isDifferentRotation) {
      watchItems.push("Contract section review recommended.");
      recommendedActions.push("Paste full updated iCrew for a stronger result.");
    }
  }

  const confidence: TripWatchComparisonResult["comparisonConfidence"] =
    isDifferentRotation
      ? "low"
      : originalSnapshot.isPartial || updatedSnapshot.isPartial
        ? "medium"
        : originalSnapshot.parseConfidence === "low" || updatedSnapshot.parseConfidence === "low"
          ? "low"
          : "high";

  return {
    status: "ok",
    title: !hasChanges ? "No major changes detected" : isDifferentRotation ? "Different rotation detected" : "Rotation updated",
    summary: !hasChanges
      ? "The updated input matches the loaded trip based on legs, times, and totals we could compare."
      : isDifferentRotation
        ? `Loaded rotation ${originalSnapshot.rotationNumber ?? "unknown"}, updated input appears to be ${updatedSnapshot.rotationNumber ?? "a different rotation"}. This may be a different trip, not a reroute.`
        : `Rotation ${updatedSnapshot.rotationNumber ?? originalSnapshot.rotationNumber ?? "unknown"} changed after update.`,
    comparisonConfidence: confidence,
    parserPathUsed: updatedSnapshot.parserPath ?? null,
    addedLegs,
    removedLegs,
    changedLegs,
    changedLayovers,
    changedReportTimes,
    changedReleaseTime,
    finalArrivalChange,
    creditDeltaMinutes,
    operatingBlockDeltaMinutes,
    dhBlockDeltaMinutes,
    tafbDeltaMinutes,
    watchItems: Array.from(new Set(hasChanges ? watchItems : ["No action needed."])),
    recommendedActions: Array.from(new Set(recommendedActions)),
    baselineSnapshot: originalSnapshot,
    updatedSnapshot,
    baselineLegCount: originalSnapshot.legs.length,
    updatedParsedLegCount: updatedSnapshot.legs.length,
    debug: {
      baselineLegCount: originalSnapshot.legs.length,
      updatedParsedLegCount: updatedSnapshot.legs.length,
      parserPathUsed: updatedSnapshot.parserPath ?? null,
      candidateCityPairCount: 0,
      sufficiencyReason: isDifferentRotation ? "different_rotation_number" : hasChanges ? "comparable_changes_found" : "comparable_match",
      comparisonSkipped: false,
      normalizedAddedCount: addedLegs.length,
      normalizedRemovedCount: removedLegs.length,
      normalizedChangedCount: changedLegs.length,
      baselineRotationNumber: originalSnapshot.rotationNumber,
      updatedRotationNumber: updatedSnapshot.rotationNumber,
      baselineDeadheadBlockMinutes: originalSnapshot.deadheadBlockMinutes,
      updatedDeadheadBlockMinutes: updatedSnapshot.deadheadBlockMinutes,
      resultDeadheadBlockDeltaMinutes: dhBlockDeltaMinutes,
      updatedSameAirportNonDhLegs: updatedSnapshot.legs
        .filter((leg) => !leg.isDeadhead && leg.origin === leg.destination)
        .map(formatTripWatchLegSummary),
      updatedAllLegs: updatedSnapshot.legs.map(formatTripWatchLegSummary),
      updatedLegsWithSegmentType: updatedSnapshot.legs
        .filter((leg) => Boolean(leg.segmentType))
        .map((leg) => `${formatTripWatchLegSummary(leg)} [${leg.segmentType ?? "operating"}]`),
      updatedRtgLegs: updatedSnapshot.legs.filter((leg) => isTripWatchReturnToGateLeg(leg)).map(formatTripWatchLegSummary),
      resultAddedLegs: addedLegs,
      resultChangedLegs: changedLegs,
      resultWatchItems: watchItems,
    },
  };
}

export async function parseTripWatchUpdatedInput(
  args: TripWatchUpdatedInputArgs,
): Promise<TripWatchUpdatedParseResult> {
  const trimmedText = args.inputText.trim();
  const hasText = trimmedText.length > 0;
  const hasScreenshots = args.updatedScreenshots.length > 0;
  if (!hasText && !hasScreenshots) {
    return buildNeedsMoreInfoResult({
      summary: "Paste the updated rotation or attach updated MiCrew screenshots so Trip Watch can compare them against your loaded trip.",
      comparisonConfidence: "low",
      sufficiencyReason: "no_input",
    });
  }

  let screenshotParse: TripWatchScreenshotParseResponse | null = null;
  if (hasScreenshots) {
    screenshotParse = await args.parseScreenshots(args.updatedScreenshots);
  }

  if (hasText && !hasScreenshots && looksLikeTripWatchTailFragment(trimmedText)) {
    return buildNeedsMoreInfoResult({
      summary: "We found text, but not enough flight or rotation details to compare against the loaded trip.",
      comparisonConfidence: "low",
      parserPathUsed: "plain_text_partial",
      updatedParsedLegCount: 0,
      candidateCityPairCount: 0,
      sufficiencyReason: "tail_fragment_only",
      recommendedActions: [
        "Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.",
      ],
    });
  }

  if (hasText && !hasScreenshots && looksLikeTripWatchICrewRotationText(trimmedText)) {
    const debugResult = parseICrewTextWithDiagnostics(trimmedText);
    if (!debugResult.parserSucceeded || !debugResult.parsed) {
      const hints = extractTripWatchLegHints(trimmedText);
      return buildNeedsMoreInfoResult({
        summary:
          hints.length > 0
            ? `We found text, but not enough flight/rotation details to compare against the loaded trip. Possible changed city pair/time found: ${hints.join(", ")}. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.`
            : "We found text, but not enough flight/rotation details to compare against the loaded trip. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.",
        comparisonConfidence: hints.length > 0 ? "medium" : "low",
        parserPathUsed: "icrew_printout_parser",
        updatedParsedLegCount: 0,
        candidateCityPairCount: hints.length,
        sufficiencyReason: hints.length > 0 ? "icrew_fragment_with_candidate_hints" : "icrew_fragment_without_comparable_rows",
        watchItems: hints.length > 0 ? [`Possible changed city pair/time found: ${hints.join(", ")}`] : [],
        recommendedActions: ["Paste the full updated iCrew for contract-grade comparison."],
      });
    }
    const dashboard = args.buildICrewDashboard(debugResult.parsed, {
      previewNote: "Loaded from updated iCrew text.",
    });
    const { snapshot, candidateHints, sufficiency } = buildTripWatchSnapshotFromParsedDashboard(dashboard, trimmedText);
    if (sufficiency.status === "low") {
      return buildNeedsMoreInfoResult({
        summary:
          candidateHints.length > 0
            ? `We found text, but not enough flight/rotation details to compare against the loaded trip. Possible changed city pair/time found: ${candidateHints.join(", ")}. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.`
            : "We found text, but not enough flight/rotation details to compare against the loaded trip. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.",
        comparisonConfidence: "low",
        parserPathUsed: "icrew_printout_parser",
        updatedParsedLegCount: dashboard.legs.length,
        candidateCityPairCount: candidateHints.length,
        sufficiencyReason: sufficiency.reason,
        recommendedActions: ["Paste the full updated iCrew for contract-grade comparison."],
      });
    }
    return {
      status: "ok",
      dashboard,
      snapshot,
      parserPathUsed: "icrew_printout_parser",
      updatedParsedLegCount: dashboard.legs.length,
      debugArtifacts: {
        rawICrewParse: {
          parserSucceeded: debugResult.parserSucceeded,
          parsed: debugResult.parsed,
          diagnostics: debugResult.diagnostics,
        },
        updatedDashboard: dashboard,
        updatedSnapshot: snapshot,
      },
    };
  }

  const normalizedScreenshotText = screenshotParse?.ok ? screenshotParse.normalizedText.trim() : "";
  const combinedInput = [trimmedText, normalizedScreenshotText].filter(Boolean).join("\n\n");
  if (combinedInput.trim()) {
    const parsed = args.parseRotationIntoDashboard(combinedInput);
    if (parsed.ok && parsed.dashboard && parsed.parsedRotation) {
      const { snapshot, candidateHints, sufficiency } = buildTripWatchSnapshotFromParsedDashboard(parsed.dashboard, combinedInput);
      if (sufficiency.status === "low") {
        return buildNeedsMoreInfoResult({
          summary:
            candidateHints.length > 0
              ? `We found text, but not enough flight/rotation details to compare against the loaded trip. Possible changed city pair/time found: ${candidateHints.join(", ")}. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.`
              : "We found text, but not enough flight/rotation details to compare against the loaded trip. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.",
          comparisonConfidence: candidateHints.length > 0 ? "medium" : "low",
          parserPathUsed: parsed.parsedRotation.parserPath,
          updatedParsedLegCount: parsed.dashboard.legs.length,
          candidateCityPairCount: candidateHints.length,
          sufficiencyReason: sufficiency.reason,
          watchItems: candidateHints.length > 0 ? [`Possible changed city pair/time found: ${candidateHints.join(", ")}`] : [],
          recommendedActions: ["Paste the full updated iCrew for contract-grade comparison."],
        });
      }
      return {
        status: "ok",
        dashboard: parsed.dashboard,
        snapshot,
        parserPathUsed: parsed.parsedRotation.parserPath,
        updatedParsedLegCount: parsed.dashboard.legs.length,
        debugArtifacts: {
          updatedDashboard: parsed.dashboard,
          updatedSnapshot: snapshot,
        },
      };
    }
  }

  const candidateHints = extractTripWatchLegHints(trimmedText || normalizedScreenshotText);
  if (candidateHints.length > 0) {
    return buildNeedsMoreInfoResult({
      summary: `We found text, but not enough flight/rotation details to compare against the loaded trip. Possible changed city pair/time found: ${candidateHints.join(", ")}. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.`,
      comparisonConfidence: "medium",
      parserPathUsed: screenshotParse ? "screenshot_partial" : "plain_text_partial",
      updatedParsedLegCount: 0,
      candidateCityPairCount: candidateHints.length,
      sufficiencyReason: "candidate_route_hint_only",
      watchItems: [`Possible changed city pair/time found: ${candidateHints.join(", ")}`],
      recommendedActions: ["Paste the full updated iCrew for contract-grade comparison."],
    });
  }

  if (screenshotParse && !screenshotParse.ok) {
    return {
      status: "unparseable",
      title: "Need more information",
      summary: screenshotParse.error,
      comparisonConfidence: "low",
      parserPathUsed: "screenshot_extraction",
      updatedParsedLegCount: 0,
      candidateCityPairCount: 0,
      sufficiencyReason: "screenshot_extraction_failed",
    };
  }

  return buildNeedsMoreInfoResult({
    summary: "We found text, but not enough flight/rotation details to compare against the loaded trip. Paste the full updated iCrew/MiCrew, or include the changed leg lines, report/release times, and totals.",
    comparisonConfidence: "low",
    parserPathUsed: hasScreenshots ? "screenshot_extraction" : "plain_text_partial",
    updatedParsedLegCount: 0,
    candidateCityPairCount: 0,
    sufficiencyReason: "no_comparable_rotation_details",
  });
}
