import { readFileSync } from "node:fs";

import { parseICrewTextWithDiagnostics, type ParsedICrewTextResult } from "./parseICrewText.ts";
import { buildTodayTimelineItems } from "./timelineItems.ts";
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
    id: `timeline-leg-${index + 1}`,
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
    layoverDetails: parsed.layoverDetails.map((detail) => ({
      city: detail.city,
      hotelName: detail.hotelName,
      hotelPhone: detail.hotelPhone,
      transport: detail.transport,
      transportProvider: detail.transportProvider,
      transportType: detail.transportType,
      transportPhone: detail.transportPhone,
      pickup: detail.pickup,
      restMinutes: detail.restMinutes,
    })),
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
        reportTime: undefined,
        scheduledOut: leg.departureTime,
        scheduledIn: leg.arrivalTime,
        scheduledBlock: leg.scheduledBlockMinutes,
        turnAfterPreviousLeg: leg.turnMinutes,
        status: "normal" as const,
        isDeadhead: leg.isDeadhead,
        legKind: leg.legKind,
        segmentType: leg.segmentType,
        gate: leg.gate,
        equipmentShip: leg.aircraft,
        confirmationNumber: leg.confirmationNumber,
        carrier: leg.carrier,
        sourceText: leg.sourceText,
        makeUpMinutes: undefined,
        turnSource: "unknown" as const,
        hasInboundSegment: false,
        deadheadSource: leg.deadheadSource,
      })),
      isPartial: false,
      sourceTypes: "text" as const,
      visibleLegCount: mappedLegs.length,
      missingSections: [],
      partialReason: null,
      parseConfidence: "high" as const,
      sourceFormat: "icrew_printout" as const,
      parserPath: "icrew_printout_parser" as const,
      rowFormat: "icrew_without_mu" as const,
      parserWarnings: [],
      rejectedCandidateRows: [],
      micrewLegsParsed: 0,
      icrewRowsParsed: mappedLegs.length,
      deadheadAnnotations: [],
    },
  };
}

const rotation4501SyntheticIcrew = readFileSync(
  new URL("./fixtures/micrewCases/4501/after.synthetic.icrew.txt", import.meta.url),
  "utf8",
);

const parsed4501 = parseICrewTextWithDiagnostics(rotation4501SyntheticIcrew);
assert(parsed4501.parserSucceeded && parsed4501.parsed, "4501 synthetic iCrew should parse through the iCrew path");

if (parsed4501.parsed) {
  const dashboard = buildTestICrewDashboard(parsed4501.parsed);
  const timelineItems = buildTodayTimelineItems(dashboard);
  const legItems = timelineItems.filter((item) => item.type === "leg");
  const layoverItems = timelineItems.filter((item) => item.type === "layover");
  const legRoutes = legItems.map((item) => `${item.leg.origin}-${item.leg.destination}`);
  const layoverCities = layoverItems.map((item) => item.city);

  assert(legItems.length === 8, `4501 timeline should include all 8 leg items, got ${legItems.length}`);
  assert(layoverItems.length === 3, `4501 timeline should include 3 layovers, got ${layoverItems.length}`);
  assert(legRoutes.includes("DTW-LGA"), `4501 timeline should include DTW-LGA, got ${legRoutes.join(" | ")}`);
  assert(legRoutes.includes("JFK-JAX"), `4501 timeline should include JFK-JAX, got ${legRoutes.join(" | ")}`);
  assert(legRoutes.includes("EWR-SLC"), `4501 timeline should include EWR-SLC, got ${legRoutes.join(" | ")}`);
  assert(
    legRoutes.indexOf("DTW-LGA") > legRoutes.indexOf("AUS-DTW"),
    "4501 timeline should continue beyond AUS-DTW",
  );
  assert(
    JSON.stringify(layoverCities) === JSON.stringify(["AUS", "LGA", "JFK"]),
    `4501 layover sequence mismatch: ${JSON.stringify(layoverCities)}`,
  );
}

console.log("timeline items regression passed");

const rotation7669SyntheticIcrew = readFileSync(
  new URL("./fixtures/micrewCases/7669/after.synthetic.icrew.txt", import.meta.url),
  "utf8",
);

const parsed7669 = parseICrewTextWithDiagnostics(rotation7669SyntheticIcrew);
assert(parsed7669.parserSucceeded && parsed7669.parsed, "7669 synthetic iCrew should parse through the iCrew path");

if (parsed7669.parsed) {
  const dashboard = buildTestICrewDashboard(parsed7669.parsed);
  const timelineItems = buildTodayTimelineItems(dashboard);
  const legItems = timelineItems.filter((item) => item.type === "leg");
  const layoverItems = timelineItems.filter((item) => item.type === "layover");
  const firstLayover = layoverItems[0];
  const timelineSequence = timelineItems.map((item) =>
    item.type === "leg" ? `${item.leg.origin}-${item.leg.destination}` : `LAYOVER ${item.city}`,
  );

  assert(legItems.length === 5, `7669 timeline should include 5 leg items, got ${legItems.length}`);
  assert(layoverItems.length === 2, `7669 timeline should include 2 layovers, got ${layoverItems.length}`);
  assert(firstLayover?.city === "JFK", `7669 first layover should be JFK, got ${firstLayover?.city ?? "none"}`);
  assert(
    timelineSequence.indexOf("LAYOVER JFK") > timelineSequence.indexOf("IAH-JFK"),
    `7669 JFK layover should come after IAH-JFK, got ${timelineSequence.join(" | ")}`,
  );
  assert(
    timelineSequence.indexOf("LAYOVER IAH") > timelineSequence.indexOf("MSP-IAH"),
    `7669 IAH layover should come after MSP-IAH, got ${timelineSequence.join(" | ")}`,
  );
  assert(
    timelineSequence.indexOf("LAYOVER IAH") !== timelineSequence.indexOf("SLC-IAH") + 1,
    `7669 IAH layover should not appear immediately after SLC-IAH, got ${timelineSequence.join(" | ")}`,
  );
  assert(
    layoverItems.filter((item) => item.city === "IAH").length === 1,
    `7669 IAH layover should appear exactly once, got ${layoverItems.map((item) => item.city).join(" | ")}`,
  );
  assert(
    layoverItems.filter((item) => item.city === "JFK").length === 1,
    `7669 JFK layover should appear exactly once, got ${layoverItems.map((item) => item.city).join(" | ")}`,
  );
}
