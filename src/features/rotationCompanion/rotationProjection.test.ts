import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";
import type { BaselineRotationSnapshot, CalendarUpdateEvent } from "./rotationProjection.ts";
import { buildProjectedRotationSnapshot } from "./rotationProjection.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeLeg(
  overrides: Partial<RotationDashboardData["legs"][number]> = {},
): RotationDashboardData["legs"][number] {
  return {
    id: overrides.id ?? "leg-1",
    dayLabel: overrides.dayLabel ?? "08MAY",
    flightNumber: overrides.flightNumber ?? "1001",
    origin: overrides.origin ?? "SLC",
    destination: overrides.destination ?? "DFW",
    departureTime: overrides.departureTime ?? "07:00",
    arrivalTime: overrides.arrivalTime ?? "10:00",
    scheduledBlockMinutes: overrides.scheduledBlockMinutes ?? 180,
    actualOut: overrides.actualOut,
    actualIn: overrides.actualIn,
    actualBlockMinutes: overrides.actualBlockMinutes,
    turnMinutes: overrides.turnMinutes,
    status: overrides.status ?? "on_time",
    aircraft: overrides.aircraft,
    gate: overrides.gate,
    isDeadhead: overrides.isDeadhead ?? false,
    legKind: overrides.legKind ?? (overrides.isDeadhead ? "deadhead" : "operating"),
    segmentType: overrides.segmentType ?? (overrides.isDeadhead ? "deadhead" : "operating"),
    deadheadSource: overrides.deadheadSource,
    confirmationNumber: overrides.confirmationNumber,
    carrier: overrides.carrier ?? "DL",
    sourceText: overrides.sourceText,
    excludeFromLogbookExport: overrides.excludeFromLogbookExport ?? Boolean(overrides.isDeadhead),
  };
}

function makeBaselineSnapshot(): BaselineRotationSnapshot {
  const legs: RotationDashboardData["legs"] = [
    makeLeg({
      id: "leg-1",
      dayLabel: "07MAY",
      flightNumber: "1111",
      origin: "SLC",
      destination: "AUS",
      departureTime: "07:44",
      arrivalTime: "11:16",
      scheduledBlockMinutes: 212,
      isDeadhead: true,
      legKind: "deadhead",
      segmentType: "deadhead",
      carrier: "DL",
      excludeFromLogbookExport: true,
    }),
    makeLeg({
      id: "leg-2",
      dayLabel: "07MAY",
      flightNumber: "1156",
      origin: "AUS",
      destination: "BOS",
      departureTime: "12:47",
      arrivalTime: "17:47",
      scheduledBlockMinutes: 240,
      carrier: "DL",
    }),
    makeLeg({
      id: "leg-3",
      dayLabel: "08MAY",
      flightNumber: "2985",
      origin: "LGA",
      destination: "ORD",
      departureTime: "09:04",
      arrivalTime: "10:50",
      scheduledBlockMinutes: 106,
      carrier: "DL",
    }),
  ];

  return {
    rotationNumber: "7689",
    tripDates: "07MAY - 08MAY",
    source: "parsed",
    legs,
    operatingLegs: legs.filter((leg) => !leg.isDeadhead),
    deadheadLegs: legs.filter((leg) => leg.isDeadhead),
    layovers: ["LGA", "ORD"],
    totalCreditMinutes: 945,
    operatingBlockMinutes: 346,
    deadheadBlockMinutes: 212,
    tafbMinutes: 3112,
    reportTime: "0650",
    releaseTime: "1030",
    finalOperatingArrival: "ORD",
    finalArrivalAfterDh: "ORD",
    isPartial: false,
    dutyPeriodLimits: [
      {
        dateKey: "07MAY",
        pwaFdpUsedMinutes: 429,
        pwaScheduledMaxFdpMinutes: 750,
        pwaActualMaxFdpMinutes: 810,
        pwaLimitSource: "icrew_pwa_fdp_line",
      },
    ],
    authoritativeSource: "micrew_email_refresh",
  };
}

function makeTimingUpdate(overrides: Partial<CalendarUpdateEvent> = {}): CalendarUpdateEvent {
  return {
    source: "calendar_sync",
    legSequenceNumber: 2,
    scheduledOut: "13:10",
    scheduledIn: "18:05",
    ...overrides,
  };
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, []);
  assert(projected.confidence === "high", "No updates should retain high confidence");
  assert(projected.legs.length === baseline.legs.length, "No updates should preserve leg count");
  assert(projected.layovers.join(",") === baseline.layovers.join(","), "No updates should preserve layovers");
  assert(projected.refreshRecommendation.shouldRefresh === false, "No updates should not recommend refresh");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [makeTimingUpdate()]);
  assert(projected.legs[1]?.departureTime === "13:10", "Timing update should change scheduled out");
  assert(projected.legs[1]?.arrivalTime === "18:05", "Timing update should change scheduled in");
  assert(projected.layovers.join(",") === "LGA,ORD", "Timing update should preserve baseline layovers");
  assert(projected.refreshRecommendation.message === "Calendar update changed flight timing. Projection updated.", "Timing-only update should stay informational");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [
    makeTimingUpdate({ legSequenceNumber: 2, actualBlockMinutes: 255 }),
  ]);
  assert(projected.projectedOperatingBlockMinutes === 361, `Actual block update should affect projected operating block, got ${projected.projectedOperatingBlockMinutes}`);
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [
    {
      source: "calendar_sync",
      legSequenceNumber: 4,
      flightNumber: "2001",
      carrier: "DL",
      origin: "ORD",
      destination: "SLC",
      scheduledOut: "12:00",
      scheduledIn: "14:30",
    },
  ]);
  assert(projected.changeReasons.includes("leg_added"), "Added calendar leg should mark leg_added");
  assert(projected.refreshRecommendation.shouldRefresh === true, "Added leg should require refresh");
  assert(projected.refreshRecommendation.severity === "required", "Added leg should be required severity");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [
    {
      source: "calendar_sync",
      legSequenceNumber: 2,
      removed: true,
    },
  ]);
  assert(projected.changeReasons.includes("leg_removed"), "Removed leg should mark leg_removed");
  assert(projected.refreshRecommendation.shouldRefresh === true, "Removed leg should require refresh");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [
    makeTimingUpdate({
      legSequenceNumber: 2,
      origin: "AUS",
      destination: "JFK",
    }),
  ]);
  assert(projected.changeReasons.includes("origin_destination_changed"), "Changed route should be structural");
  assert(projected.refreshRecommendation.severity === "required", "Changed route should require refresh");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [
    makeTimingUpdate({
      legSequenceNumber: 2,
      flightNumber: "9999",
    }),
  ]);
  assert(projected.changeReasons.includes("flight_number_changed"), "Changed flight number should be detected");
  assert(projected.refreshRecommendation.shouldRefresh === true, "Changed flight number should recommend refresh");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [makeTimingUpdate()]);
  assert(projected.dutyPeriodLimits?.[0]?.pwaActualMaxFdpMinutes === 810, "Calendar-only delay should preserve PWA actual max");
  assert(projected.dutyPeriodLimits?.[0]?.pwaLimitSource === "icrew_pwa_fdp_line", "Calendar-only delay should not erase PWA source");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [
    makeTimingUpdate({ legSequenceNumber: 2, actualBlockMinutes: 280 }),
  ]);
  assert(projected.possiblePayImpact === true, "Actual block increase should mark possible pay impact");
  assert(!projected.refreshRecommendation.message.includes("owed"), "Projection should not make final pay claims");
}

{
  const baseline = makeBaselineSnapshot();
  const projected = buildProjectedRotationSnapshot(baseline, [
    {
      source: "calendar_sync",
      legSequenceNumber: 4,
      flightNumber: "2001",
      origin: "ORD",
      destination: "SLC",
    },
  ]);
  assert(
    projected.refreshRecommendation.message.includes("Refresh from MiCrew") ||
      projected.refreshRecommendation.message.includes("Upload updated MiCrew rotation"),
    "Structural change should direct the user back to MiCrew refresh",
  );
}

console.log("rotationProjection passed");
