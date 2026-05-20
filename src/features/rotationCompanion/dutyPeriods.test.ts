import { parseICrewText } from "./parseICrewText.ts";
import { rotation7707ICrewBeforeText } from "./fixtures/rotation7707ICrewBeforeText.ts";
import { rotation7707ICrewAfterText } from "./fixtures/rotation7707ICrewAfterText.ts";
import { rotation0983ICrewRawText } from "./fixtures/rotation0983ICrewText.ts";
import { buildDutyPeriodsFromRotationLegs } from "./dutyPeriods.ts";
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

function buildDashboardLegsFromICrew(rawText: string) {
  const parsed = parseICrewText(rawText);
  const legs: RotationDashboardData["legs"] = parsed.allTripSegments.map((leg, index) => ({
    id: `duty-test-leg-${index + 1}`,
    dayLabel: leg.date ?? `Day ${index + 1}`,
    flightNumber: leg.flightNumber ?? "TBD",
    origin: leg.departureAirport ?? "TBD",
    destination: leg.arrivalAirport ?? "TBD",
    departureTime: formatCompactClock(leg.scheduledOut),
    arrivalTime: formatCompactClock(leg.scheduledIn),
    scheduledBlockMinutes: parseDurationMinutes(leg.scheduledBlock),
    status: "placeholder",
    aircraft: undefined,
    gate: undefined,
    isDeadhead: Boolean(leg.isDeadhead),
    legKind: leg.isDeadhead ? "deadhead" : "operating",
    segmentType: leg.isDeadhead ? "deadhead" : leg.segmentType ?? "operating",
    deadheadSource: undefined,
    confirmationNumber: leg.confirmationCode ?? undefined,
    carrier: leg.carrier ?? undefined,
    sourceText: leg.sourceText ?? undefined,
    excludeFromLogbookExport: Boolean(leg.isDeadhead),
  }));
  return {
    parsed,
    legs,
  };
}

const before7707 = buildDashboardLegsFromICrew(rotation7707ICrewBeforeText);
const before7707Periods = buildDutyPeriodsFromRotationLegs({
  legs: before7707.legs,
  rotationReportTime: before7707.parsed.header.reportTime,
});

assert(before7707Periods.length === 2, `Expected 2 duty periods for 7707 before, got ${before7707Periods.length}`);
assert(
  before7707Periods[0]?.dateKey === "10APR" &&
    before7707Periods[0]?.reportTime === "07:00" &&
    before7707Periods[0]?.firstOperatingDeparture === "08:15" &&
    before7707Periods[0]?.lastOperatingArrival === "12:03" &&
    before7707Periods[0]?.dutySpanMinutes === 444 &&
    before7707Periods[0]?.operatingBlockMinutes === 144 &&
    before7707Periods[0]?.deadheadBlockMinutes === 54 &&
    before7707Periods[0]?.rtgBlockMinutes === 0 &&
    before7707Periods[0]?.legCount === 3,
  `Unexpected 7707 before first duty period: ${JSON.stringify(before7707Periods[0])}`,
);
assert(
  before7707Periods[1]?.dateKey === "11APR" &&
    before7707Periods[1]?.reportTime === "06:00" &&
    before7707Periods[1]?.firstOperatingDeparture === "06:00" &&
    before7707Periods[1]?.lastOperatingArrival === "14:15" &&
    before7707Periods[1]?.operatingBlockMinutes === 387 &&
    before7707Periods[1]?.deadheadBlockMinutes === 0 &&
    before7707Periods[1]?.rtgBlockMinutes === 0 &&
    before7707Periods[1]?.legCount === 3,
  `Unexpected 7707 before second duty period: ${JSON.stringify(before7707Periods[1])}`,
);

const after7707 = buildDashboardLegsFromICrew(rotation7707ICrewAfterText);
const after7707Periods = buildDutyPeriodsFromRotationLegs({
  legs: after7707.legs,
  rotationReportTime: after7707.parsed.header.reportTime,
});

assert(after7707Periods.length === 2, `Expected 2 duty periods for 7707 after, got ${after7707Periods.length}`);
assert(
  after7707Periods[0]?.deadheadBlockMinutes === 66 &&
    after7707Periods[0]?.operatingBlockMinutes === 138 &&
    after7707Periods[0]?.legCount === 3,
  `Unexpected 7707 after first duty period: ${JSON.stringify(after7707Periods[0])}`,
);
assert(
  after7707Periods[1]?.operatingBlockMinutes === 383 &&
    after7707Periods[1]?.rtgBlockMinutes === 19 &&
    after7707Periods[1]?.rtgLegCount === 1 &&
    after7707Periods[1]?.operatingLegCount === 3 &&
    after7707Periods[1]?.deadheadLegCount === 0 &&
    after7707Periods[1]?.legCount === 4,
  `Unexpected 7707 after second duty period: ${JSON.stringify(after7707Periods[1])}`,
);

const trip0983 = buildDashboardLegsFromICrew(rotation0983ICrewRawText);
const trip0983Periods = buildDutyPeriodsFromRotationLegs({
  legs: trip0983.legs,
  rotationReportTime: trip0983.parsed.header.reportTime,
});

assert(trip0983Periods.length === 4, `Expected 4 duty periods for 0983, got ${trip0983Periods.length}`);
assert(
  trip0983Periods[0]?.dateKey === "17MAR" &&
    trip0983Periods[0]?.reportTime === "13:26" &&
    trip0983Periods[0]?.firstOperatingDeparture == null &&
    trip0983Periods[0]?.lastOperatingArrival == null &&
    trip0983Periods[0]?.operatingBlockMinutes === 0 &&
    trip0983Periods[0]?.deadheadBlockMinutes === 194 &&
    trip0983Periods[0]?.legCount === 1,
  `Unexpected 0983 first duty period: ${JSON.stringify(trip0983Periods[0])}`,
);
assert(
  trip0983Periods[1]?.dateKey === "18MAR" &&
    trip0983Periods[1]?.operatingBlockMinutes === 380 &&
    trip0983Periods[1]?.rtgBlockMinutes === 22 &&
    trip0983Periods[1]?.rtgLegCount === 1 &&
    trip0983Periods[1]?.operatingLegCount === 3 &&
    trip0983Periods[1]?.legCount === 4,
  `Unexpected 0983 second duty period: ${JSON.stringify(trip0983Periods[1])}`,
);

console.log("dutyPeriods passed");
