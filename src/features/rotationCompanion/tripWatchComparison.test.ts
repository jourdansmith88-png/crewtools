import {
  buildTripWatchRotationSnapshot,
  compareRotationSnapshots,
  normalizeTripWatchDateKey,
  normalizeTripWatchTimeKey,
  parseTripWatchUpdatedInput,
  type TripWatchRotationSnapshot,
} from "./tripWatchComparison.ts";
import { looksLikeICrewRotationText } from "./icrewDetection.ts";
import { parseICrewTextWithDiagnostics } from "./parseICrewText.ts";
import type { ParsedICrewTextResult } from "./parseICrewText.ts";
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
    id: `test-leg-${index + 1}`,
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
assert(addedRemoved.title === "Rotation updated", `Expected changed title for same-rotation update, got ${addedRemoved.title}`);
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

const accommodationTailNeedsMoreInfo = await parseTripWatchUpdatedInput({
  inputText: "CREW ACCOMMODATIONS PHONE NUMBER\nOUTSIDE ATL CALL 1-800-325-2739\nIN ATL PLEASE CALL 404-715-2739\nEND 14.54 GMT/02MAY",
  updatedScreenshots: [],
  buildICrewDashboard: () => {
    throw new Error("Should not build iCrew dashboard for accommodation tail text");
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
assert(accommodationTailNeedsMoreInfo.status === "needs_more_info", `Expected needs_more_info for accommodation tail, got ${accommodationTailNeedsMoreInfo.status}`);
assert(
  accommodationTailNeedsMoreInfo.summary === "We found text, but not enough flight or rotation details to compare against the loaded trip.",
  `Expected explicit tail-fragment summary, got ${accommodationTailNeedsMoreInfo.summary}`,
);

assert(rotation7707ICrewBeforeText.includes("TDHD 0.54"), "Expected 7707 before fixture deadhead total");
assert(rotation7707ICrewAfterText.includes("TDHD 1.06"), "Expected 7707 after fixture deadhead total");
assert(rotation7707ICrewAfterText.includes("*DFW*1219 DFW.1238 0.19 0.36 2"), "Expected 7707 after fixture RTG row");
assert(looksLikeICrewRotationText(rotation7707ICrewBeforeText), "Expected compact 7707 before text to route through iCrew intake path");
assert(looksLikeICrewRotationText(rotation7707ICrewAfterText), "Expected compact 7707 after text to route through iCrew intake path");
const parsed7707Before = parseICrewTextWithDiagnostics(rotation7707ICrewBeforeText);
const parsed7707After = parseICrewTextWithDiagnostics(rotation7707ICrewAfterText);
assert(parsed7707Before.parsed?.header.totalDeadheadBlockMinutes === 54, `Expected parsed 7707 before header DH total 54, got ${parsed7707Before.parsed?.header.totalDeadheadBlockMinutes}`);
assert(parsed7707After.parsed?.header.totalDeadheadBlockMinutes === 66, `Expected parsed 7707 after header DH total 66, got ${parsed7707After.parsed?.header.totalDeadheadBlockMinutes}`);
assert(
  parsed7707Before.parsed?.standaloneDhdAttachments.some(
    (item) => item.attachedToRoute === "SLC-IDA" && item.normalizedBlock === "0:54",
  ),
  `Expected parsed 7707 before standalone DHD attachment, got ${JSON.stringify(parsed7707Before.parsed?.standaloneDhdAttachments)}`,
);
assert(
  parsed7707After.parsed?.standaloneDhdAttachments.some(
    (item) => item.attachedToRoute === "SLC-IDA" && item.normalizedBlock === "1:06",
  ),
  `Expected parsed 7707 after standalone DHD attachment, got ${JSON.stringify(parsed7707After.parsed?.standaloneDhdAttachments)}`,
);
assert(
  parsed7707After.parsed?.allTripSegments.some((leg) => leg.departureAirport === "DFW" && leg.arrivalAirport === "DFW" && leg.segmentType === "return_to_gate"),
  `Expected parsed 7707 after RTG leg, got ${JSON.stringify(parsed7707After.parsed?.allTripSegments)}`,
);
assert(
  parsed7707Before.parsed?.allTripSegments.some((leg) => leg.departureAirport === "SLC" && leg.arrivalAirport === "IDA" && leg.isDeadhead),
  `Expected parsed 7707 before SLC-IDA deadhead, got ${JSON.stringify(parsed7707Before.parsed?.allTripSegments)}`,
);
assert(
  parsed7707After.parsed?.allTripSegments.some((leg) => leg.departureAirport === "SLC" && leg.arrivalAirport === "IDA" && leg.isDeadhead),
  `Expected parsed 7707 after SLC-IDA deadhead, got ${JSON.stringify(parsed7707After.parsed?.allTripSegments)}`,
);

const parsed7707BeforeDashboard = buildTestICrewDashboard(parsed7707Before.parsed!);
const parsed7707BeforeSnapshot = buildTripWatchRotationSnapshot(parsed7707BeforeDashboard);
assert(parsed7707BeforeSnapshot.rotationNumber === "7707", `Expected live-path baseline rotation 7707, got ${parsed7707BeforeSnapshot.rotationNumber}`);
assert(parsed7707BeforeSnapshot.deadheadBlockMinutes === 54, `Expected live-path baseline DH block 54, got ${parsed7707BeforeSnapshot.deadheadBlockMinutes}`);
assert(
  parsed7707BeforeSnapshot.deadheadLegs.some(
    (leg) => leg.origin === "SLC" && leg.destination === "IDA" && leg.scheduledBlockMinutes === 54 && leg.isDeadhead,
  ),
  `Expected live-path baseline DH leg SLC-IDA 0:54, got ${JSON.stringify(parsed7707BeforeSnapshot.deadheadLegs)}`,
);

const parsed7707AfterDashboard = buildTestICrewDashboard(parsed7707After.parsed!);
const parsed7707AfterSnapshot = buildTripWatchRotationSnapshot(parsed7707AfterDashboard);
assert(parsed7707AfterSnapshot.deadheadBlockMinutes === 66, `Expected live-path updated DH block 66, got ${parsed7707AfterSnapshot.deadheadBlockMinutes}`);
assert(
  parsed7707AfterSnapshot.legs.some(
    (leg) =>
      leg.origin === "DFW" &&
      leg.destination === "DFW" &&
      leg.flightNumber === "2798" &&
      leg.departureTime === "12:19" &&
      leg.arrivalTime === "12:38" &&
      (leg.segmentType === "return_to_gate" || (!leg.isDeadhead && leg.origin === leg.destination)),
  ),
  `Expected live-path updated snapshot RTG leg, got ${JSON.stringify(parsed7707AfterSnapshot.legs)}`,
);
const parsed7707AfterLiveUpdatedInput = await parseTripWatchUpdatedInput({
  inputText: rotation7707ICrewAfterText,
  updatedScreenshots: [],
  buildICrewDashboard: buildTestICrewDashboard,
  parseRotationIntoDashboard: () => ({
    ok: false,
    error: "Not used for iCrew path in this regression.",
  }),
  parseScreenshots: async () => ({
    ok: false,
    error: "Screenshot parsing not used",
  }),
});
assert(parsed7707AfterLiveUpdatedInput.status === "ok", `Expected live-style updated parse ok, got ${parsed7707AfterLiveUpdatedInput.status}`);
if (parsed7707AfterLiveUpdatedInput.status === "ok") {
  assert(parsed7707AfterLiveUpdatedInput.updatedParsedLegCount === 7, `Expected live-style updated parsed leg count 7, got ${parsed7707AfterLiveUpdatedInput.updatedParsedLegCount}`);
  assert(
    parsed7707AfterLiveUpdatedInput.snapshot.legs.some(
      (leg) =>
        leg.origin === "DFW" &&
        leg.destination === "DFW" &&
        leg.flightNumber === "2798" &&
        leg.departureTime === "12:19" &&
        leg.arrivalTime === "12:38" &&
        leg.segmentType === "return_to_gate" &&
        leg.isDeadhead === false,
    ),
    `Expected live-style parseTripWatchUpdatedInput snapshot RTG leg, got ${JSON.stringify(parsed7707AfterLiveUpdatedInput.snapshot.legs)}`,
  );
}

const rotation7707BeforeSnapshot = makeSnapshot({
  rotationNumber: "7707",
  tripDates: "10APR - 11APR",
  legs: [
    {
      id: "7707-before-1",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "SLC",
      destination: "BOI",
      departureTime: "08:15",
      arrivalTime: "09:26",
      scheduledBlockMinutes: 71,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-before-2",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "BOI",
      destination: "SLC",
      departureTime: "10:50",
      arrivalTime: "12:03",
      scheduledBlockMinutes: 73,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-before-3",
      dayLabel: "10APR",
      flightNumber: "3726",
      origin: "SLC",
      destination: "IDA",
      departureTime: "13:30",
      arrivalTime: "14:24",
      scheduledBlockMinutes: 54,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: true,
      legKind: "deadhead",
      excludeFromLogbookExport: true,
      carrier: "OO",
    },
    {
      id: "7707-before-4",
      dayLabel: "11APR",
      flightNumber: "2335",
      origin: "IDA",
      destination: "SLC",
      departureTime: "06:00",
      arrivalTime: "07:02",
      scheduledBlockMinutes: 62,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-before-5",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "SLC",
      destination: "DFW",
      departureTime: "07:55",
      arrivalTime: "11:32",
      scheduledBlockMinutes: 157,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-before-6",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "DFW",
      destination: "SLC",
      departureTime: "12:27",
      arrivalTime: "14:15",
      scheduledBlockMinutes: 168,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
  ],
  operatingLegs: [],
  deadheadLegs: [],
  totalCreditMinutes: 631,
  operatingBlockMinutes: 531,
  deadheadBlockMinutes: 54,
  tafbMinutes: 1890,
});
rotation7707BeforeSnapshot.operatingLegs = rotation7707BeforeSnapshot.legs.filter((leg) => !leg.isDeadhead);
rotation7707BeforeSnapshot.deadheadLegs = rotation7707BeforeSnapshot.legs.filter((leg) => leg.isDeadhead);

const rotation7707AfterSnapshot = makeSnapshot({
  rotationNumber: "7707",
  tripDates: "10APR - 11APR",
  legs: [
    {
      id: "7707-after-1",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "SLC",
      destination: "BOI",
      departureTime: "08:02",
      arrivalTime: "09:09",
      scheduledBlockMinutes: 67,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-after-2",
      dayLabel: "10APR",
      flightNumber: "1744",
      origin: "BOI",
      destination: "SLC",
      departureTime: "10:40",
      arrivalTime: "11:51",
      scheduledBlockMinutes: 71,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-after-3",
      dayLabel: "10APR",
      flightNumber: "3726",
      origin: "SLC",
      destination: "IDA",
      departureTime: "13:26",
      arrivalTime: "14:32",
      scheduledBlockMinutes: 66,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: true,
      legKind: "deadhead",
      excludeFromLogbookExport: true,
      carrier: "OO",
    },
    {
      id: "7707-after-4",
      dayLabel: "11APR",
      flightNumber: "2335",
      origin: "IDA",
      destination: "SLC",
      departureTime: "05:53",
      arrivalTime: "07:05",
      scheduledBlockMinutes: 72,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-after-5",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "SLC",
      destination: "DFW",
      departureTime: "07:50",
      arrivalTime: "11:18",
      scheduledBlockMinutes: 148,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
    {
      id: "7707-after-6",
      dayLabel: "11APR",
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
      sourceText: "*DFW*1219 DFW.1238 0.19 0.36 2",
      segmentType: "return_to_gate",
    } as TripWatchRotationSnapshot["legs"][number],
    {
      id: "7707-after-7",
      dayLabel: "11APR",
      flightNumber: "2798",
      origin: "DFW",
      destination: "SLC",
      departureTime: "13:14",
      arrivalTime: "14:57",
      scheduledBlockMinutes: 163,
      status: "placeholder",
      aircraft: undefined,
      gate: undefined,
      isDeadhead: false,
      legKind: "operating",
      excludeFromLogbookExport: false,
      carrier: "DL",
    },
  ],
  operatingLegs: [],
  deadheadLegs: [],
  totalCreditMinutes: 650,
  operatingBlockMinutes: 540,
  deadheadBlockMinutes: 66,
  tafbMinutes: 1943,
});
rotation7707AfterSnapshot.operatingLegs = rotation7707AfterSnapshot.legs.filter((leg) => !leg.isDeadhead);
rotation7707AfterSnapshot.deadheadLegs = rotation7707AfterSnapshot.legs.filter((leg) => leg.isDeadhead);

const rotation7707Comparison = compareRotationSnapshots(
  rotation7707BeforeSnapshot,
  rotation7707AfterSnapshot,
);
assert(rotation7707Comparison.status === "ok", `Expected 7707 status ok, got ${rotation7707Comparison.status}`);
assert(rotation7707Comparison.title === "Rotation updated", `Expected rotation updated title, got ${rotation7707Comparison.title}`);
assert(rotation7707Comparison.title !== "Different rotation detected", "Expected 7707 to stay same-rotation");
assert(rotation7707Comparison.creditDeltaMinutes === 19, `Expected credit delta 19, got ${rotation7707Comparison.creditDeltaMinutes}`);
assert(rotation7707Comparison.operatingBlockDeltaMinutes === 9, `Expected operating block delta 9, got ${rotation7707Comparison.operatingBlockDeltaMinutes}`);
assert(rotation7707Comparison.dhBlockDeltaMinutes === 12, `Expected DH block delta 12, got ${rotation7707Comparison.dhBlockDeltaMinutes}`);
if (rotation7707Comparison.tafbDeltaMinutes != null) {
  assert(rotation7707Comparison.tafbDeltaMinutes === 53, `Expected TAFB delta 53, got ${rotation7707Comparison.tafbDeltaMinutes}`);
}
assert(
  rotation7707Comparison.addedLegs.some((item) => item.includes("RTG DFW-DFW DL2798 12:19-12:38")),
  `Expected RTG added leg, got ${JSON.stringify(rotation7707Comparison.addedLegs)}`,
);
assert(
  rotation7707Comparison.changedLegs.some((item) => item.includes("DFW-SLC DL2798") && item.includes("12:27-14:15") && item.includes("13:14-14:57")),
  `Expected changed DFW-SLC timing entry, got ${JSON.stringify(rotation7707Comparison.changedLegs)}`,
);
assert(
  rotation7707Comparison.watchItems.includes("RTG segment added."),
  `Expected RTG watch item, got ${JSON.stringify(rotation7707Comparison.watchItems)}`,
);

console.log("tripWatchComparison passed");
