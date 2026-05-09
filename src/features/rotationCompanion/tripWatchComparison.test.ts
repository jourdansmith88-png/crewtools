import {
  compareRotationSnapshots,
  normalizeTripWatchDateKey,
  normalizeTripWatchTimeKey,
  parseTripWatchUpdatedInput,
  type TripWatchRotationSnapshot,
} from "./tripWatchComparison.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeSnapshot(overrides?: Partial<TripWatchRotationSnapshot>): TripWatchRotationSnapshot {
  return {
    rotationNumber: "7942",
    tripDates: "19APR - 21APR",
    source: "parsed",
    parserPath: "icrew_printout_parser",
    parseConfidence: "high",
    legs: [
      {
        id: "leg-1",
        dayLabel: "19APR",
        flightNumber: "1342",
        origin: "SLC",
        destination: "SMF",
        departureTime: "15:36",
        arrivalTime: "16:10",
        scheduledBlockMinutes: 94,
        status: "placeholder",
        aircraft: "8142",
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        excludeFromLogbookExport: false,
      },
    ],
    operatingLegs: [
      {
        id: "leg-1",
        dayLabel: "19APR",
        flightNumber: "1342",
        origin: "SLC",
        destination: "SMF",
        departureTime: "15:36",
        arrivalTime: "16:10",
        scheduledBlockMinutes: 94,
        status: "placeholder",
        aircraft: "8142",
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        excludeFromLogbookExport: false,
      },
    ],
    deadheadLegs: [],
    layovers: ["DEN"],
    totalCreditMinutes: 961,
    operatingBlockMinutes: 876,
    deadheadBlockMinutes: 0,
    tafbMinutes: 3339,
    reportTime: "1435",
    releaseTime: "2110",
    finalOperatingArrival: "SLC",
    finalArrivalAfterDh: "SLC",
    isPartial: false,
    ...overrides,
  };
}

const unchanged = compareRotationSnapshots(makeSnapshot(), makeSnapshot());
assert(unchanged.status === "ok", "Expected unchanged comparison to be ok");
assert(unchanged.title === "No major changes detected", `Expected unchanged title, got ${unchanged.title}`);
assert(unchanged.addedLegs.length === 0 && unchanged.removedLegs.length === 0 && unchanged.changedLegs.length === 0, "Expected no leg deltas for unchanged snapshot");

const addedRemoved = compareRotationSnapshots(
  makeSnapshot(),
  makeSnapshot({
    legs: [
      {
        id: "leg-2",
        dayLabel: "20APR",
        flightNumber: "1667",
        origin: "SLC",
        destination: "DEN",
        departureTime: "20:56",
        arrivalTime: "22:17",
        scheduledBlockMinutes: 81,
        status: "placeholder",
        aircraft: "8167",
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        excludeFromLogbookExport: false,
      },
    ],
    operatingLegs: [
      {
        id: "leg-2",
        dayLabel: "20APR",
        flightNumber: "1667",
        origin: "SLC",
        destination: "DEN",
        departureTime: "20:56",
        arrivalTime: "22:17",
        scheduledBlockMinutes: 81,
        status: "placeholder",
        aircraft: "8167",
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        excludeFromLogbookExport: false,
      },
    ],
    layovers: ["LGA"],
  }),
);
assert(addedRemoved.title === "Change detected", "Expected changed title for different legs");
assert(addedRemoved.addedLegs.length === 1, `Expected 1 added leg, got ${addedRemoved.addedLegs.length}`);
assert(addedRemoved.removedLegs.length === 1, `Expected 1 removed leg, got ${addedRemoved.removedLegs.length}`);

const changedTimes = compareRotationSnapshots(
  makeSnapshot(),
  makeSnapshot({
    legs: [
      {
        id: "leg-1",
        dayLabel: "19APR",
        flightNumber: "1342",
        origin: "SLC",
        destination: "SMF",
        departureTime: "16:00",
        arrivalTime: "16:34",
        scheduledBlockMinutes: 94,
        status: "placeholder",
        aircraft: "8142",
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        excludeFromLogbookExport: false,
      },
    ],
    operatingLegs: [
      {
        id: "leg-1",
        dayLabel: "19APR",
        flightNumber: "1342",
        origin: "SLC",
        destination: "SMF",
        departureTime: "16:00",
        arrivalTime: "16:34",
        scheduledBlockMinutes: 94,
        status: "placeholder",
        aircraft: "8142",
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        excludeFromLogbookExport: false,
      },
    ],
  }),
);
assert(changedTimes.changedLegs.length === 1, `Expected changed leg entry, got ${changedTimes.changedLegs.length}`);

const differentRotation = compareRotationSnapshots(
  makeSnapshot(),
  makeSnapshot({
    rotationNumber: "0983",
  }),
);
assert(differentRotation.title === "Different rotation detected", `Expected different rotation title, got ${differentRotation.title}`);
assert(differentRotation.comparisonConfidence === "low", `Expected low confidence for different rotation, got ${differentRotation.comparisonConfidence}`);

assert(normalizeTripWatchTimeKey("17:26") === "1726", "Expected HH:MM normalization");
assert(normalizeTripWatchTimeKey("1726 12APR") === "1726", "Expected raw timestamp normalization");
assert(normalizeTripWatchDateKey("1726 12APR26") === "12APR", "Expected date normalization");

const needsMoreInfo = await parseTripWatchUpdatedInput({
  inputText: "changed to SLC-IDA 1800-1850",
  updatedScreenshots: [],
  buildICrewDashboard: () => {
    throw new Error("Should not build iCrew dashboard for partial plain text");
  },
  parseRotationIntoDashboard: () => ({
    ok: false,
    error: "Unable to parse the pasted rotation text.",
  }),
  parseScreenshots: async () => ({
    ok: false,
    error: "Screenshot parsing not used",
  }),
});
assert(needsMoreInfo.status === "needs_more_info", `Expected needs_more_info, got ${needsMoreInfo.status}`);
assert(
  needsMoreInfo.summary.includes("Possible changed city pair/time found: SLC-IDA 1800-1850"),
  `Expected candidate hint summary, got ${needsMoreInfo.summary}`,
);

const tailOnlyNeedsMoreInfo = await parseTripWatchUpdatedInput({
  inputText: "*** ROTATION OPER\nREGULAR-\nTAFB\nCREW ACCOMMODATION 208-522-9500\nEND 2144/12",
  updatedScreenshots: [],
  buildICrewDashboard: () => {
    throw new Error("Should not build iCrew dashboard for unusable tail text");
  },
  parseRotationIntoDashboard: () => ({
    ok: false,
    error: "Unable to parse the pasted rotation text.",
  }),
  parseScreenshots: async () => ({
    ok: false,
    error: "Screenshot parsing not used",
  }),
});
assert(tailOnlyNeedsMoreInfo.status === "needs_more_info", `Expected needs_more_info for tail text, got ${tailOnlyNeedsMoreInfo.status}`);
assert(
  tailOnlyNeedsMoreInfo.summary.includes("not enough flight/rotation details"),
  `Expected conservative tail summary, got ${tailOnlyNeedsMoreInfo.summary}`,
);

console.log("tripWatchComparison passed");
