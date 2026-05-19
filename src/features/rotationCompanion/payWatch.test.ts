import {
  buildPayWatchSummary,
  DELTA_DAILY_MINIMUM_MINUTES,
  getDutyDateKey,
  groupLegsByDate,
  sumOperatingBlockByDate,
} from "./payWatch.ts";
import type {
  TripWatchComparisonResult,
  TripWatchRotationSnapshot,
} from "./tripWatchComparison.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeSnapshot(
  overrides: Partial<TripWatchRotationSnapshot> & {
    legs: TripWatchRotationSnapshot["legs"];
  },
): TripWatchRotationSnapshot {
  const legs = overrides.legs;
  return {
    rotationNumber: overrides.rotationNumber ?? "TEST",
    tripDates: overrides.tripDates ?? "01MAY - 02MAY",
    source: overrides.source ?? "parsed",
    parserPath: overrides.parserPath ?? "icrew_printout_parser",
    parseConfidence: overrides.parseConfidence ?? "high",
    legs,
    operatingLegs: overrides.operatingLegs ?? legs.filter((leg) => !leg.isDeadhead),
    deadheadLegs: overrides.deadheadLegs ?? legs.filter((leg) => leg.isDeadhead),
    layovers: overrides.layovers ?? [],
    totalCreditMinutes: overrides.totalCreditMinutes,
    operatingBlockMinutes: overrides.operatingBlockMinutes,
    deadheadBlockMinutes: overrides.deadheadBlockMinutes,
    tafbMinutes: overrides.tafbMinutes,
    reportTime: overrides.reportTime,
    releaseTime: overrides.releaseTime,
    finalOperatingArrival: overrides.finalOperatingArrival,
    finalArrivalAfterDh: overrides.finalArrivalAfterDh,
    isPartial: overrides.isPartial ?? false,
  };
}

function makeComparison(
  overrides: Partial<TripWatchComparisonResult> = {},
): TripWatchComparisonResult {
  return {
    status: "ok",
    title: "Rotation updated",
    summary: "Rotation TEST changed after update.",
    comparisonConfidence: "high",
    parserPathUsed: "icrew_printout_parser",
    addedLegs: [],
    removedLegs: [],
    changedLegs: [],
    changedLayovers: [],
    changedReportTimes: [],
    changedReleaseTime: null,
    finalArrivalChange: null,
    creditDeltaMinutes: null,
    operatingBlockDeltaMinutes: null,
    dhBlockDeltaMinutes: null,
    tafbDeltaMinutes: null,
    watchItems: [],
    recommendedActions: [],
    baselineSnapshot: null,
    updatedSnapshot: null,
    baselineLegCount: 0,
    updatedParsedLegCount: 0,
    ...overrides,
  };
}

assert(DELTA_DAILY_MINIMUM_MINUTES === 315, `Expected daily minimum 315, got ${DELTA_DAILY_MINIMUM_MINUTES}`);

const belowMinimumBaseline = makeSnapshot({
  legs: [
    {
      id: "leg-1",
      dayLabel: "07MAY",
      flightNumber: "1001",
      origin: "SLC",
      destination: "DFW",
      departureTime: "08:00",
      arrivalTime: "10:00",
      scheduledBlockMinutes: 120,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
    },
  ],
  operatingBlockMinutes: 120,
});
const belowMinimumUpdated = makeSnapshot({
  legs: [
    {
      id: "leg-1",
      dayLabel: "07MAY",
      flightNumber: "1001",
      origin: "SLC",
      destination: "DFW",
      departureTime: "08:10",
      arrivalTime: "09:50",
      scheduledBlockMinutes: 100,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
    },
  ],
  operatingBlockMinutes: 100,
});
const belowMinimumSummary = buildPayWatchSummary(
  belowMinimumBaseline,
  belowMinimumUpdated,
  makeComparison(),
);
assert(belowMinimumSummary.dailyRows.length === 0, `Expected no daily delta rows under 5:15 protection, got ${JSON.stringify(belowMinimumSummary.dailyRows)}`);

const overMinimumFromProtectedSummary = buildPayWatchSummary(
  belowMinimumBaseline,
  makeSnapshot({
    legs: [
      {
        id: "leg-1",
        dayLabel: "07MAY",
        flightNumber: "1001",
        origin: "SLC",
        destination: "DFW",
        departureTime: "08:00",
        arrivalTime: "13:30",
        scheduledBlockMinutes: 330,
        status: "placeholder",
        isDeadhead: false,
        legKind: "operating",
        segmentType: "operating",
      },
    ],
    operatingBlockMinutes: 330,
  }),
  makeComparison(),
);
assert(
  overMinimumFromProtectedSummary.dailyRows[0]?.estimatedDayDeltaMinutes === 15,
  `Expected 15-minute overage above 5:15 protection, got ${JSON.stringify(overMinimumFromProtectedSummary.dailyRows)}`,
);

const overMinimumFromBaselineSummary = buildPayWatchSummary(
  makeSnapshot({
    legs: [
      {
        id: "leg-1",
        dayLabel: "08MAY",
        flightNumber: "1002",
        origin: "SLC",
        destination: "ATL",
        departureTime: "07:00",
        arrivalTime: "13:30",
        scheduledBlockMinutes: 390,
        status: "placeholder",
        isDeadhead: false,
        legKind: "operating",
        segmentType: "operating",
      },
    ],
    operatingBlockMinutes: 390,
  }),
  makeSnapshot({
    legs: [
      {
        id: "leg-1",
        dayLabel: "08MAY",
        flightNumber: "1002",
        origin: "SLC",
        destination: "ATL",
        departureTime: "07:00",
        arrivalTime: "13:42",
        scheduledBlockMinutes: 402,
        status: "placeholder",
        isDeadhead: false,
        legKind: "operating",
        segmentType: "operating",
      },
    ],
    operatingBlockMinutes: 402,
  }),
  makeComparison(),
);
assert(
  overMinimumFromBaselineSummary.dailyRows[0]?.protectedBaselineMinutes === 390 &&
    overMinimumFromBaselineSummary.dailyRows[0]?.estimatedDayDeltaMinutes === 12,
  `Expected original over-5:15 block to remain protected baseline, got ${JSON.stringify(overMinimumFromBaselineSummary.dailyRows)}`,
);

const noSnapshotSummary = buildPayWatchSummary(
  undefined,
  undefined,
  makeComparison({
    creditDeltaMinutes: 19,
  }),
);
assert(
  noSnapshotSummary.summaryItems.length === 1 && noSnapshotSummary.summaryItems[0] === "Credit +0:19",
  `Expected trip-level delta rendering without snapshots, got ${JSON.stringify(noSnapshotSummary)}`,
);
assert(noSnapshotSummary.dailyRows.length === 0, "Expected no daily rows without snapshots");

const emptyLegSnapshot = makeSnapshot({ legs: [] });
const emptyLegSummary = buildPayWatchSummary(
  emptyLegSnapshot,
  emptyLegSnapshot,
  makeComparison({
    operatingBlockDeltaMinutes: 9,
  }),
);
assert(
  emptyLegSummary.summaryItems.length === 1 && emptyLegSummary.summaryItems[0] === "Op block +0:09",
  `Expected summary to tolerate empty legs arrays, got ${JSON.stringify(emptyLegSummary)}`,
);
assert(emptyLegSummary.dailyRows.length === 0, "Expected no daily rows for empty leg snapshots");

const partialComparisonSummary = buildPayWatchSummary(
  emptyLegSnapshot,
  undefined,
  makeComparison({
    dhBlockDeltaMinutes: 12,
  }),
);
assert(
  partialComparisonSummary.summaryItems.length === 1 && partialComparisonSummary.summaryItems[0] === "DH block +0:12",
  `Expected single-delta comparison to render safely, got ${JSON.stringify(partialComparisonSummary)}`,
);

const baseline7707 = makeSnapshot({
  rotationNumber: "7707",
  tripDates: "10APR - 11APR",
  legs: [
    {
      id: "before-1",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "SLC",
      destination: "BOI",
      departureTime: "08:15",
      arrivalTime: "09:26",
      scheduledBlockMinutes: 71,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "before-2",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "BOI",
      destination: "SLC",
      departureTime: "10:50",
      arrivalTime: "12:03",
      scheduledBlockMinutes: 73,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "before-3",
      dayLabel: "10APR",
      flightNumber: "3726",
      origin: "SLC",
      destination: "IDA",
      departureTime: "13:30",
      arrivalTime: "14:24",
      scheduledBlockMinutes: 54,
      status: "placeholder",
      isDeadhead: true,
      legKind: "deadhead",
      segmentType: "deadhead",
      carrier: "OO",
    },
    {
      id: "before-4",
      dayLabel: "11APR",
      flightNumber: "2335",
      origin: "IDA",
      destination: "SLC",
      departureTime: "06:00",
      arrivalTime: "07:02",
      scheduledBlockMinutes: 62,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "before-5",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "SLC",
      destination: "DFW",
      departureTime: "07:55",
      arrivalTime: "11:32",
      scheduledBlockMinutes: 217,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "before-6",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "DFW",
      destination: "SLC",
      departureTime: "12:27",
      arrivalTime: "14:15",
      scheduledBlockMinutes: 168,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
  ],
  totalCreditMinutes: 631,
  operatingBlockMinutes: 531,
  deadheadBlockMinutes: 54,
  tafbMinutes: 1890,
});
const updated7707 = makeSnapshot({
  rotationNumber: "7707",
  tripDates: "10APR - 11APR",
  legs: [
    {
      id: "after-1",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "SLC",
      destination: "BOI",
      departureTime: "08:02",
      arrivalTime: "09:09",
      scheduledBlockMinutes: 67,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "after-2",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "BOI",
      destination: "SLC",
      departureTime: "10:40",
      arrivalTime: "11:51",
      scheduledBlockMinutes: 71,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "after-3",
      dayLabel: "10APR",
      flightNumber: "3726",
      origin: "SLC",
      destination: "IDA",
      departureTime: "13:26",
      arrivalTime: "14:32",
      scheduledBlockMinutes: 66,
      status: "placeholder",
      isDeadhead: true,
      legKind: "deadhead",
      segmentType: "deadhead",
      carrier: "OO",
    },
    {
      id: "after-4",
      dayLabel: "11APR",
      flightNumber: "2335",
      origin: "IDA",
      destination: "SLC",
      departureTime: "05:53",
      arrivalTime: "07:05",
      scheduledBlockMinutes: 72,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "after-5",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "SLC",
      destination: "DFW",
      departureTime: "07:50",
      arrivalTime: "11:18",
      scheduledBlockMinutes: 208,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
    {
      id: "after-6",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "DFW",
      destination: "DFW",
      departureTime: "12:19",
      arrivalTime: "12:38",
      scheduledBlockMinutes: 19,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "return_to_gate",
      carrier: "DL",
    },
    {
      id: "after-7",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "DFW",
      destination: "SLC",
      departureTime: "13:14",
      arrivalTime: "14:57",
      scheduledBlockMinutes: 163,
      status: "placeholder",
      isDeadhead: false,
      legKind: "operating",
      segmentType: "operating",
      carrier: "DL",
    },
  ],
  totalCreditMinutes: 650,
  operatingBlockMinutes: 540,
  deadheadBlockMinutes: 66,
  tafbMinutes: 1943,
});
const payWatch7707 = buildPayWatchSummary(
  baseline7707,
  updated7707,
  makeComparison({
    creditDeltaMinutes: 19,
    operatingBlockDeltaMinutes: 9,
    dhBlockDeltaMinutes: 12,
    tafbDeltaMinutes: 53,
    addedLegs: ["RTG DFW-DFW DL2798 12:19-12:38"],
  }),
);
assert(
  payWatch7707.summaryItems.includes("Credit +0:19") &&
    payWatch7707.summaryItems.includes("Op block +0:09") &&
    payWatch7707.summaryItems.includes("DH block +0:12"),
  `Expected 7707 pay-watch summary deltas, got ${JSON.stringify(payWatch7707.summaryItems)}`,
);
assert(
  payWatch7707.rtgAddedItems.includes("RTG added: DFW-DFW DL2798 · Block 0:19"),
  `Expected 7707 RTG pay-watch item, got ${JSON.stringify(payWatch7707.rtgAddedItems)}`,
);

assert(getDutyDateKey(baseline7707.legs[0]!) === "10APR", "Expected duty date key from dayLabel");
assert(groupLegsByDate(updated7707).get("11APR")?.length === 4, "Expected grouped 11APR legs");
assert(sumOperatingBlockByDate(updated7707).get("11APR") === 462, "Expected updated 11APR operating block sum 462");

console.log("payWatch passed");
