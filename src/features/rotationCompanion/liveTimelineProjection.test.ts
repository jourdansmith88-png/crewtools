import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";
import type { BaselineRotationSnapshot, CalendarUpdateEvent } from "./rotationProjection.ts";
import { buildLiveTimelineProjection } from "./liveTimelineProjection.ts";

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
      scheduledBlockMinutes: 300,
    }),
    makeLeg({
      id: "leg-3",
      dayLabel: "08MAY",
      flightNumber: "2231",
      origin: "ORD",
      destination: "SLC",
      departureTime: "07:30",
      arrivalTime: "10:00",
      scheduledBlockMinutes: 150,
    }),
  ];

  return {
    rotationNumber: "7689",
    tripDates: "07MAY - 08MAY",
    source: "parsed",
    legs,
    operatingLegs: legs.filter((leg) => !leg.isDeadhead),
    deadheadLegs: legs.filter((leg) => leg.isDeadhead),
    layovers: ["BOS", "ORD"],
    totalCreditMinutes: 945,
    operatingBlockMinutes: 450,
    deadheadBlockMinutes: 212,
    tafbMinutes: 3112,
    reportTime: "0650",
    releaseTime: "1030",
    finalOperatingArrival: "SLC",
    finalArrivalAfterDh: "SLC",
    isPartial: false,
    dutyPeriodLimits: [
      {
        dateKey: "07MAY",
        pwaFdpUsedMinutes: 429,
        pwaScheduledMaxFdpMinutes: 750,
        pwaActualMaxFdpMinutes: 810,
        pwaLimitSource: "icrew_pwa_fdp_line",
      },
      {
        dateKey: "08MAY",
        pwaFdpUsedMinutes: 390,
        pwaScheduledMaxFdpMinutes: 690,
        pwaActualMaxFdpMinutes: 840,
        pwaLimitSource: "icrew_pwa_fdp_line",
      },
    ],
    authoritativeSource: "micrew_email_refresh",
  };
}

function makeDashboard(): RotationDashboardData {
  const snapshot = makeBaselineSnapshot();
  return {
    snapshot: {
      tripDates: snapshot.tripDates ?? "07MAY - 08MAY",
      rotationNumber: snapshot.rotationNumber ?? "7689",
      totalCreditMinutes: snapshot.totalCreditMinutes ?? 0,
      scheduledBlockMinutes: (snapshot.operatingBlockMinutes ?? 0) + (snapshot.deadheadBlockMinutes ?? 0),
      legCount: snapshot.legs.length,
      layoverCities: [...snapshot.layovers],
      finalArrival: snapshot.finalArrivalAfterDh ?? "SLC",
    },
    legs: snapshot.legs,
    nextLeg: snapshot.legs[0],
    whatMatters: [],
    layoverDetails: [
      { city: "BOS", hotelName: "Boston Harbor Hotel", hotelPhone: "617-000-0000" },
      { city: "ORD", hotelName: "Palmer House", hotelPhone: "312-000-0000" },
    ],
    dutyDays: [],
    tonightLayoverCity: "BOS",
    tomorrowReportTime: "07:30",
    scheduledRestMinutes: 720,
    note: "Loaded from MiCrew fixture.",
    source: "parsed",
    parsedRotation: {
      rotationNumber: snapshot.rotationNumber,
      startDate: "07MAY",
      endDate: "08MAY",
      reportTime: snapshot.reportTime,
      releaseTime: snapshot.releaseTime,
      totalCredit: snapshot.totalCreditMinutes,
      totalScheduledBlock: snapshot.operatingBlockMinutes,
      deadheadBlock: snapshot.deadheadBlockMinutes,
      finalArrivalAfterDh: snapshot.finalArrivalAfterDh,
      chainAnchorReason: undefined,
      anchoredFirstLeg: undefined,
      wasChainRotated: false,
      excludedDeadheadLegs: 0,
      layoverCities: snapshot.layovers,
      dutyPeriods: [
        {
          dayNumber: 1,
          date: "07MAY",
          reportTime: "0650",
          releaseTime: "1800",
          scheduledRest: undefined,
          scheduledBlock: 512,
          scheduledFdp: 429,
          fdpLimit: 810,
          fdpMargin: 381,
          pwaFdpUsedMinutes: 429,
          pwaScheduledMaxFdpMinutes: 750,
          pwaActualMaxFdpMinutes: 810,
          pwaLimitSource: "icrew_pwa_fdp_line",
          status: "Good",
        },
        {
          dayNumber: 2,
          date: "08MAY",
          reportTime: "0730",
          releaseTime: "1000",
          scheduledRest: undefined,
          scheduledBlock: 150,
          scheduledFdp: 390,
          fdpLimit: 840,
          fdpMargin: 450,
          pwaFdpUsedMinutes: 390,
          pwaScheduledMaxFdpMinutes: 690,
          pwaActualMaxFdpMinutes: 840,
          pwaLimitSource: "icrew_pwa_fdp_line",
          status: "Good",
        },
      ],
      legs: snapshot.legs.map((leg, index) => ({
        id: leg.id,
        legNumber: index + 1,
        dayNumber: leg.dayLabel === "07MAY" ? 1 : 2,
        departureAirport: leg.origin,
        arrivalAirport: leg.destination,
        flightNumber: leg.flightNumber,
        reportTime: undefined,
        scheduledOut: leg.departureTime,
        scheduledIn: leg.arrivalTime,
        scheduledBlock: leg.scheduledBlockMinutes,
        turnAfterPreviousLeg: leg.turnMinutes,
        status: "normal",
        isDeadhead: leg.isDeadhead,
        legKind: leg.legKind,
        segmentType: leg.segmentType,
        gate: leg.gate,
        equipmentShip: leg.aircraft,
        confirmationNumber: leg.confirmationNumber,
        carrier: leg.carrier,
        sourceText: leg.sourceText,
        makeUpMinutes: undefined,
        turnSource: "unknown",
        hasInboundSegment: false,
        deadheadSource: leg.deadheadSource,
      })),
      isPartial: false,
      sourceTypes: "text",
      visibleLegCount: snapshot.legs.length,
      missingSections: [],
      partialReason: null,
      parseConfidence: "high",
      sourceFormat: "micrew_mobile",
      parserPath: "micrew_mobile_parser",
      rowFormat: "unknown",
      parserWarnings: [],
      rejectedCandidateRows: [],
      micrewLegsParsed: snapshot.legs.length,
      icrewRowsParsed: 0,
      deadheadAnnotations: [],
    },
  };
}

function makeTimingUpdate(overrides: Partial<CalendarUpdateEvent> = {}): CalendarUpdateEvent {
  return {
    source: "calendar_sync",
    legSequenceNumber: 2,
    carrier: "DL",
    flightNumber: "1156",
    origin: "AUS",
    destination: "BOS",
    occurredAt: "2026-05-07T12:47:00Z",
    scheduledOut: "13:10",
    scheduledIn: "18:10",
    confidence: "high",
    ...overrides,
  };
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, []);
  assert(result.changedLegCount === 0, "No calendar events should leave the timeline unchanged");
  assert(result.updatedLegCount === 3, `No calendar events should preserve baseline leg count, got ${result.updatedLegCount}`);
}

{
  const baseline = makeDashboard();
  const result = buildLiveTimelineProjection(baseline, [makeTimingUpdate()]);
  const changedLeg = result.items.find((item) => item.type === "leg" && item.flightNumber === "1156");
  assert(changedLeg?.currentDepartureTime === "13:10", "Time-only update should change current departure time");
  assert(changedLeg?.baselineDepartureTime === "12:47", "Time-only update should preserve baseline departure time");
  const layoverItem = result.items.find((item) => item.type === "layover" && item.city === "BOS");
  assert(layoverItem?.layoverDetail?.hotelName === "Boston Harbor Hotel", "Layover/hotel details should remain from baseline");
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [makeTimingUpdate({ scheduledOut: "12:15", scheduledIn: "17:15" })]);
  const changedLeg = result.items.find((item) => item.type === "leg" && item.flightNumber === "1156");
  assert(changedLeg?.status === "early", `Early event should be marked early, got ${changedLeg?.status ?? "none"}`);
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [makeTimingUpdate({ scheduledOut: "13:45", scheduledIn: "18:45" })]);
  const changedLeg = result.items.find((item) => item.type === "leg" && item.flightNumber === "1156");
  assert(changedLeg?.status === "delayed", `Delayed event should be marked delayed, got ${changedLeg?.status ?? "none"}`);
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [makeTimingUpdate({ actualBlockMinutes: 340, actualOut: "13:22", actualIn: "18:32" })]);
  const changedLeg = result.items.find((item) => item.type === "leg" && item.flightNumber === "1156");
  assert(changedLeg?.changeKind === "actual_time_added", "Actual block update should mark actual_time_added");
  assert(changedLeg?.blockDeltaMinutes === 40, `Block delta should be calculated, got ${changedLeg?.blockDeltaMinutes ?? "none"}`);
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [
    {
      source: "calendar_sync",
      carrier: "DL",
      flightNumber: "2798",
      origin: "DFW",
      destination: "DFW",
      occurredAt: "2026-05-08T12:19:00Z",
      scheduledOut: "12:19",
      scheduledIn: "12:38",
      confidence: "high",
    },
  ]);
  const sameAirportItem = result.items.find((item) => item.status === "same_airport_event");
  assert(Boolean(sameAirportItem), "Same-airport event should be inserted into the timeline");
  assert(result.insertedSameAirportEventCount === 1, `Same-airport count should be 1, got ${result.insertedSameAirportEventCount}`);
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [
    {
      source: "calendar_sync",
      carrier: "DL",
      flightNumber: "2231",
      origin: "ORD",
      destination: "ORD",
      occurredAt: "2026-05-08T09:30:00Z",
      scheduledOut: "09:30",
      scheduledIn: "09:48",
      confidence: "high",
    },
  ]);
  const ordSlcLeg = result.items.filter((item) => item.type === "leg" && item.flightNumber === "2231");
  assert(ordSlcLeg.length >= 2, "Same-airport item should not replace the baseline leg");
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [
    {
      source: "calendar_sync",
      carrier: "DL",
      flightNumber: "5555",
      origin: "ORD",
      destination: "SFO",
      occurredAt: "2026-05-08T11:00:00Z",
      scheduledOut: "11:00",
      scheduledIn: "13:30",
      confidence: "high",
    },
  ]);
  const rerouteItem = result.items.find((item) => item.status === "possible_reroute");
  assert(Boolean(rerouteItem), "Unmatched non-same-airport event should become a possible reroute item");
}

{
  const baseline = makeDashboard();
  const result = buildLiveTimelineProjection(baseline, [makeTimingUpdate()]);
  const layoverCities = result.items.filter((item) => item.type === "layover").map((item) => item.city);
  assert(
    JSON.stringify(layoverCities) === JSON.stringify(["BOS"]),
    `Layovers should remain from baseline, got ${JSON.stringify(layoverCities)}`,
  );
}

{
  const baseline = makeBaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [makeTimingUpdate({ scheduledOut: "13:40", scheduledIn: "18:50" })]);
  const dutySummary = result.dutySummaries.find((summary) => summary.dateKey === "07MAY");
  assert(Boolean(dutySummary), "Duty summary should be built for the changed day");
  assert((dutySummary?.projectedBlockMinutes ?? 0) > (dutySummary?.baselineBlockMinutes ?? 0), "Projected block should reflect updated timing");
  assert((dutySummary?.fdpRemainingMinutes ?? 0) < 810, "Projected FDP remaining should preserve baseline limits while using projected duty");
}

function make7707BaselineSnapshot(): BaselineRotationSnapshot {
  const legs: RotationDashboardData["legs"] = [
    makeLeg({ id: "7707-1", dayLabel: "07MAY", flightNumber: "1744", origin: "SLC", destination: "DEN", departureTime: "07:15", arrivalTime: "09:10", scheduledBlockMinutes: 115 }),
    makeLeg({ id: "7707-2", dayLabel: "07MAY", flightNumber: "3726", carrier: "OO", origin: "SLC", destination: "IDA", departureTime: "13:30", arrivalTime: "14:24", scheduledBlockMinutes: 54, isDeadhead: true, legKind: "deadhead", segmentType: "deadhead", excludeFromLogbookExport: true }),
    makeLeg({ id: "7707-3", dayLabel: "07MAY", flightNumber: "2335", origin: "IDA", destination: "SLC", departureTime: "15:30", arrivalTime: "16:39", scheduledBlockMinutes: 69 }),
    makeLeg({ id: "7707-4", dayLabel: "08MAY", flightNumber: "2601", origin: "SLC", destination: "DFW", departureTime: "05:00", arrivalTime: "08:05", scheduledBlockMinutes: 185 }),
    makeLeg({ id: "7707-5", dayLabel: "08MAY", flightNumber: "2798", origin: "DFW", destination: "SLC", departureTime: "13:14", arrivalTime: "14:57", scheduledBlockMinutes: 163 }),
    makeLeg({ id: "7707-6", dayLabel: "08MAY", flightNumber: "1470", origin: "SLC", destination: "BOI", departureTime: "17:00", arrivalTime: "18:15", scheduledBlockMinutes: 75 }),
  ];

  return {
    rotationNumber: "7707",
    tripDates: "07MAY - 08MAY",
    source: "parsed",
    legs,
    operatingLegs: legs.filter((leg) => !leg.isDeadhead),
    deadheadLegs: legs.filter((leg) => leg.isDeadhead),
    layovers: ["IDA", "DFW"],
    totalCreditMinutes: 631,
    operatingBlockMinutes: 609,
    deadheadBlockMinutes: 54,
    tafbMinutes: 1700,
    reportTime: "0715",
    releaseTime: "1900",
    finalOperatingArrival: "BOI",
    finalArrivalAfterDh: "BOI",
    isPartial: false,
    dutyPeriodLimits: [
      { dateKey: "07MAY", pwaFdpUsedMinutes: 429, pwaScheduledMaxFdpMinutes: 750, pwaActualMaxFdpMinutes: 810, pwaLimitSource: "icrew_pwa_fdp_line" },
      { dateKey: "08MAY", pwaFdpUsedMinutes: 555, pwaScheduledMaxFdpMinutes: 690, pwaActualMaxFdpMinutes: 840, pwaLimitSource: "icrew_pwa_fdp_line" },
    ],
    authoritativeSource: "paste_update",
  };
}

{
  const baseline = make7707BaselineSnapshot();
  const updates: CalendarUpdateEvent[] = [
    { source: "calendar_sync", legSequenceNumber: 1, carrier: "DL", flightNumber: "1744", origin: "SLC", destination: "DEN", occurredAt: "2026-05-07T07:15:00Z", scheduledOut: "07:20", scheduledIn: "09:15", confidence: "high" },
    { source: "calendar_sync", legSequenceNumber: 2, carrier: "OO", flightNumber: "3726", origin: "SLC", destination: "IDA", occurredAt: "2026-05-07T13:30:00Z", scheduledOut: "13:35", scheduledIn: "14:29", confidence: "high" },
    { source: "calendar_sync", legSequenceNumber: 3, carrier: "DL", flightNumber: "2335", origin: "IDA", destination: "SLC", occurredAt: "2026-05-07T15:30:00Z", scheduledOut: "15:40", scheduledIn: "16:49", confidence: "high" },
    { source: "calendar_sync", legSequenceNumber: 4, carrier: "DL", flightNumber: "2601", origin: "SLC", destination: "DFW", occurredAt: "2026-05-08T05:00:00Z", scheduledOut: "05:05", scheduledIn: "08:10", confidence: "high" },
    { source: "calendar_sync", legSequenceNumber: 5, carrier: "DL", flightNumber: "2798", origin: "DFW", destination: "SLC", occurredAt: "2026-05-08T13:14:00Z", scheduledOut: "13:14", scheduledIn: "14:57", confidence: "high" },
    { source: "calendar_sync", legSequenceNumber: 6, carrier: "DL", flightNumber: "1470", origin: "SLC", destination: "BOI", occurredAt: "2026-05-08T17:00:00Z", scheduledOut: "17:05", scheduledIn: "18:20", confidence: "high" },
    { source: "calendar_sync", carrier: "DL", flightNumber: "2798", origin: "DFW", destination: "DFW", occurredAt: "2026-05-08T12:19:00Z", scheduledOut: "12:19", scheduledIn: "12:38", confidence: "high" },
  ];
  const result = buildLiveTimelineProjection(baseline, updates);
  assert(result.changedLegCount >= 6, `7707 projection should mark changed legs, got ${result.changedLegCount}`);
  assert(result.insertedSameAirportEventCount === 1, `7707 projection should insert one RTG item, got ${result.insertedSameAirportEventCount}`);
  assert(result.items.some((item) => item.status === "same_airport_event" && item.origin === "DFW" && item.destination === "DFW"), "7707 projection should include DFW-DFW RTG item");
  const legSequence = result.items
    .filter((item) => item.type === "leg")
    .map((item) => `${item.origin}-${item.destination}`);
  assert(
    JSON.stringify(legSequence) === JSON.stringify(["SLC-DEN", "SLC-IDA", "IDA-SLC", "SLC-DFW", "DFW-DFW", "DFW-SLC", "SLC-BOI"]),
    `7707 projected timeline order mismatch: ${JSON.stringify(legSequence)}`,
  );
  assert(
    result.items.some((item) => item.type === "leg" && item.origin === "DFW" && item.destination === "SLC"),
    "7707 projected timeline should preserve the baseline DFW-SLC leg after RTG insertion",
  );
  const dutySummary = result.dutySummaries.find((summary) => summary.dateKey === "08MAY");
  assert(
    Boolean(dutySummary?.badges.some((badge) => /RTG|Calendar projection active/i.test(badge))),
    "7707 projected duty summary should carry RTG/calendar badges",
  );
}

{
  const baseline = make7707BaselineSnapshot();
  const result = buildLiveTimelineProjection(baseline, [
    {
      source: "calendar_sync",
      carrier: "DL",
      flightNumber: "2798",
      origin: "DFW",
      destination: "DFW",
      occurredAt: "2026-05-08T12:19:00Z",
      scheduledOut: "12:19",
      scheduledIn: "12:38",
      confidence: "high",
    },
  ]);
  assert(!result.projectedSnapshot.monitoringSummary.primaryMessage.toLowerCase().includes("illegal"), "Projection messaging should not use legal wording");
  assert(!result.projectedSnapshot.monitoringSummary.actionMessage.toLowerCase().includes("owed"), "Projection messaging should not use final pay wording");
}

console.log("liveTimelineProjection passed");
