import {
  buildDutyWatchSummary,
  DUTY_LIMIT_WATCH_SOURCE,
  evaluateDutyPeriodLimits,
  evaluateRotationDutyLimits,
} from "./dutyLimitWatch.ts";
import { buildDutyPeriodsFromRotationLegs } from "./dutyPeriods.ts";
import { buildTripWatchRotationSnapshot, compareRotationSnapshots } from "./tripWatchComparison.ts";
import { parseICrewTextWithDiagnostics, type ParsedICrewTextResult } from "./parseICrewText.ts";
import { rotation7707ICrewBeforeText } from "./fixtures/rotation7707ICrewBeforeText.ts";
import { rotation7707ICrewAfterText } from "./fixtures/rotation7707ICrewAfterText.ts";
import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatCompactClock(value?: string | null) {
  const digits = value?.match(/\b(\d{4})\b/)?.[1];
  return digits ? `${digits.slice(0, 2)}:${digits.slice(2)}` : undefined;
}

function parseDurationMinutes(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  return match?.[1] && match?.[2] ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function buildTestICrewDashboard(parsed: NonNullable<ParsedICrewTextResult["parsed"]>): RotationDashboardData {
  const mappedLegs = parsed.allTripSegments.map((leg, index) => ({
    id: `duty-limit-leg-${index + 1}`,
    dayLabel: leg.date ?? `Day ${index + 1}`,
    flightNumber: leg.flightNumber ?? "TBD",
    origin: leg.departureAirport ?? "TBD",
    destination: leg.arrivalAirport ?? "TBD",
    departureTime: formatCompactClock(leg.scheduledOut),
    arrivalTime: formatCompactClock(leg.scheduledIn),
    scheduledBlockMinutes: parseDurationMinutes(leg.scheduledBlock),
    status: "placeholder" as const,
    aircraft: undefined,
    gate: undefined,
    isDeadhead: Boolean(leg.isDeadhead),
    legKind: leg.isDeadhead ? ("deadhead" as const) : ("operating" as const),
    segmentType: leg.isDeadhead ? ("deadhead" as const) : leg.segmentType ?? ("operating" as const),
    deadheadSource: undefined,
    confirmationNumber: leg.confirmationCode ?? undefined,
    carrier: leg.carrier ?? undefined,
    sourceText: leg.sourceText ?? undefined,
    excludeFromLogbookExport: Boolean(leg.isDeadhead),
  }));

  return {
    snapshot: {
      tripDates: parsed.header.tripDates,
      rotationNumber: parsed.header.rotationNumber,
      totalCreditMinutes: parsed.header.totalCreditMinutes ?? 0,
      scheduledBlockMinutes: parsed.operatingScheduledBlockMinutes,
      legCount: mappedLegs.length,
      layoverCities: parsed.layoverCities,
      finalArrival: parsed.finalOperatingArrival,
    },
    legs: mappedLegs,
    nextLeg: mappedLegs[0],
    whatMatters: [],
    layoverDetails: [],
    dutyDays: [],
    tonightLayoverCity: parsed.layoverCities[0] ?? "TBD",
    tomorrowReportTime: undefined,
    scheduledRestMinutes: undefined,
    note: "Loaded from iCrew text.",
    source: "parsed",
    parsedRotation: {
      rotationNumber: parsed.header.rotationNumber,
      startDate: parsed.header.tripDates.split("-")[0]?.trim(),
      endDate: parsed.header.tripDates.split("-")[1]?.trim(),
      reportTime: parsed.header.reportTime,
      releaseTime: undefined,
      totalCredit: parsed.header.totalCreditMinutes ?? undefined,
      totalScheduledBlock: parsed.operatingScheduledBlockMinutes,
      deadheadBlock: parsed.header.totalDeadheadBlockMinutes ?? parsed.deadheadScheduledBlockMinutes,
      finalArrivalAfterDh: parsed.finalArrivalAfterDeadhead,
      excludedDeadheadLegs: parsed.deadheadAnnotations.length,
      layoverCities: parsed.layoverCities,
      dutyPeriods: [],
      legs: mappedLegs.map((leg, index) => ({
        id: leg.id,
        legNumber: index + 1,
        dayNumber: index + 1,
        departureAirport: leg.origin,
        arrivalAirport: leg.destination,
        flightNumber: leg.flightNumber,
        scheduledOut: leg.departureTime?.replace(":", ""),
        scheduledIn: leg.arrivalTime?.replace(":", ""),
        scheduledBlock: leg.scheduledBlockMinutes,
        status: "placeholder" as const,
        isDeadhead: leg.isDeadhead,
        legKind: leg.legKind,
        segmentType: leg.segmentType,
        confirmationNumber: leg.confirmationNumber,
        carrier: leg.carrier,
        sourceText: leg.sourceText,
      })),
      isPartial: parsed.partialStatus,
      sourceTypes: "text",
      visibleLegCount: mappedLegs.length,
      missingSections: [],
      partialReason: parsed.partialReason,
      parseConfidence: "high",
      sourceFormat: "icrew_printout",
      parserPath: "icrew_printout_parser",
      rowFormat: "icrew_without_mu",
      parserWarnings: [],
      rejectedCandidateRows: [],
      micrewLegsParsed: 0,
      icrewRowsParsed: parsed.normalizedCandidates.length,
      deadheadAnnotations: parsed.deadheadAnnotations,
    },
  };
}

const samplePeriods = buildDutyPeriodsFromRotationLegs({
  legs: [
    {
      id: "duty-1",
      dayLabel: "07MAY",
      flightNumber: "1001",
      origin: "SLC",
      destination: "DEN",
      departureTime: "08:00",
      arrivalTime: "10:00",
      scheduledBlockMinutes: 120,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
  ],
  rotationReportTime: "07:00",
});

const period = samplePeriods[0];
const needsMoreInfo = evaluateDutyPeriodLimits(period);
assert(needsMoreInfo.status === "needs_more_info", `Expected needs_more_info, got ${needsMoreInfo.status}`);
assert(needsMoreInfo.source === DUTY_LIMIT_WATCH_SOURCE, `Expected placeholder source, got ${needsMoreInfo.source}`);

const withinLimits = evaluateDutyPeriodLimits(period, {
  fdpLimitMinutes: 720,
  blockLimitMinutes: 480,
});
assert(withinLimits.status === "within_limits", `Expected within_limits, got ${withinLimits.status}`);

const cautionFdp = evaluateDutyPeriodLimits(period, {
  fdpLimitMinutes: 180,
  blockLimitMinutes: 480,
});
assert(cautionFdp.status === "caution", `Expected caution from FDP remaining, got ${cautionFdp.status}`);

const cautionBlock = evaluateDutyPeriodLimits(period, {
  fdpLimitMinutes: 720,
  blockLimitMinutes: 145,
});
assert(cautionBlock.status === "caution", `Expected caution from block remaining, got ${cautionBlock.status}`);

const exceededFdp = evaluateDutyPeriodLimits(period, {
  fdpLimitMinutes: 170,
  blockLimitMinutes: 480,
});
assert(exceededFdp.status === "exceeded", `Expected exceeded from FDP, got ${exceededFdp.status}`);

const exceededBlock = evaluateDutyPeriodLimits(period, {
  fdpLimitMinutes: 720,
  blockLimitMinutes: 119,
});
assert(exceededBlock.status === "exceeded", `Expected exceeded from block, got ${exceededBlock.status}`);

const rtgPeriod = buildDutyPeriodsFromRotationLegs({
  legs: [
    {
      id: "duty-rtg-op",
      dayLabel: "08MAY",
      flightNumber: "2798",
      origin: "SLC",
      destination: "DFW",
      departureTime: "07:50",
      arrivalTime: "11:18",
      scheduledBlockMinutes: 208,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "duty-rtg-segment",
      dayLabel: "08MAY",
      flightNumber: "2798",
      origin: "DFW",
      destination: "DFW",
      departureTime: "12:19",
      arrivalTime: "12:38",
      scheduledBlockMinutes: 19,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
      segmentType: "return_to_gate",
    },
  ],
  rotationReportTime: "07:00",
})[0];
const rtgIncluded = evaluateDutyPeriodLimits(rtgPeriod, {
  fdpLimitMinutes: 720,
  blockLimitMinutes: 239,
  includeRtgInBlockLimit: true,
});
const rtgExcluded = evaluateDutyPeriodLimits(rtgPeriod, {
  fdpLimitMinutes: 720,
  blockLimitMinutes: 239,
  includeRtgInBlockLimit: false,
});
assert(rtgIncluded.status === "caution", `Expected RTG-included block check to tighten status, got ${rtgIncluded.status}`);
assert(rtgExcluded.status === "within_limits", `Expected RTG-excluded block check to stay within limits, got ${rtgExcluded.status}`);

const evaluatedPeriods = evaluateRotationDutyLimits(samplePeriods, {
  fdpLimitMinutes: 720,
  blockLimitMinutes: 480,
});
assert(evaluatedPeriods.length === 1, `Expected one evaluated period, got ${evaluatedPeriods.length}`);

const noComparisonSummary = buildDutyWatchSummary(null, null, null);
assert(noComparisonSummary === null, `Expected null summary without comparison, got ${JSON.stringify(noComparisonSummary)}`);

const beforeParsed = parseICrewTextWithDiagnostics(rotation7707ICrewBeforeText);
const afterParsed = parseICrewTextWithDiagnostics(rotation7707ICrewAfterText);
assert(beforeParsed.parsed && afterParsed.parsed, "Expected 7707 fixtures to parse");

const beforeSnapshot = buildTripWatchRotationSnapshot(buildTestICrewDashboard(beforeParsed.parsed!));
const afterSnapshot = buildTripWatchRotationSnapshot(buildTestICrewDashboard(afterParsed.parsed!));
const comparison = compareRotationSnapshots(beforeSnapshot, afterSnapshot);

const dutyWatchSummary = buildDutyWatchSummary(beforeSnapshot, afterSnapshot, comparison);
assert(dutyWatchSummary?.hasContent, "Expected 7707 duty watch summary to have content");
assert(
  dutyWatchSummary?.rows.some(
    (row) =>
      row.dateKey === "11APR" &&
      row.highlights.includes("RTG added: +0:19") &&
      row.highlights.includes("Block/FDP inputs changed") &&
      row.notes.includes("Limit check needs Delta table source"),
  ),
  `Expected 7707 RTG/needs-more-info duty row, got ${JSON.stringify(dutyWatchSummary?.rows)}`,
);
assert(
  dutyWatchSummary?.recommendedItems.includes("Check 117") &&
    dutyWatchSummary?.recommendedItems.includes("Review duty periods"),
  `Expected 117 recommended items, got ${JSON.stringify(dutyWatchSummary?.recommendedItems)}`,
);
assert(
  dutyWatchSummary?.debug.evaluatedStatusesByDate.every((item) => item.endsWith(":needs_more_info")),
  `Expected needs_more_info evaluated statuses for placeholder limit source, got ${JSON.stringify(dutyWatchSummary?.debug)}`,
);
assert(
  comparison.dhBlockDeltaMinutes === 12,
  `Expected 7707 DH delta to remain 12, got ${comparison.dhBlockDeltaMinutes}`,
);
assert(
  comparison.addedLegs.some((item) => item.includes("RTG DFW-DFW DL2798")),
  `Expected 7707 compare added RTG leg, got ${JSON.stringify(comparison.addedLegs)}`,
);
assert(
  comparison.watchItems.includes("RTG segment added."),
  `Expected 7707 compare RTG watch item, got ${JSON.stringify(comparison.watchItems)}`,
);

const exceededSummaryRow = buildDutyWatchSummary(
  beforeSnapshot,
  afterSnapshot,
  comparison,
  {
    fdpLimitMinutes: 10,
    blockLimitMinutes: 10,
  },
);
assert(
  exceededSummaryRow?.rows.some((row) => row.statusLabel === "Exceeded modeled limit"),
  `Expected exceeded wording to stay modeled, got ${JSON.stringify(exceededSummaryRow?.rows)}`,
);

console.log("dutyLimitWatch passed");
