import type { BaselineRotationSnapshot } from "./rotationProjection.ts";
import { buildProjectedRotationSnapshot } from "./rotationProjection.ts";
import {
  buildCalendarUpdateEvents,
  extractFlightEventFromCalendarEvent,
  normalizeWebcalUrl,
  parseICalendarFeed,
} from "./calendarFeedIngestion.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const minimalFeed = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:test-1",
  "SUMMARY:DL1234 SLC-ATL",
  "DESCRIPTION:Delta flight DL1234 SLC-ATL",
  "LOCATION:Gate A12",
  "DTSTART:20260522T154500Z",
  "DTEND:20260522T194500Z",
  "LAST-MODIFIED:20260522T140000Z",
  "SEQUENCE:2",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

function makeBaseline(): BaselineRotationSnapshot {
  return {
    rotationNumber: "1234",
    tripDates: "22MAY - 22MAY",
    source: "parsed",
    legs: [
      {
        id: "leg-1",
        dayLabel: "22MAY",
        flightNumber: "1234",
        origin: "SLC",
        destination: "ATL",
        departureTime: "09:45",
        arrivalTime: "13:45",
        scheduledBlockMinutes: 240,
        actualOut: undefined,
        actualIn: undefined,
        actualBlockMinutes: undefined,
        turnMinutes: undefined,
        status: "on_time",
        aircraft: undefined,
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        segmentType: "operating",
        deadheadSource: undefined,
        confirmationNumber: undefined,
        carrier: "DL",
        sourceText: undefined,
        excludeFromLogbookExport: false,
      },
    ],
    operatingLegs: [
      {
        id: "leg-1",
        dayLabel: "22MAY",
        flightNumber: "1234",
        origin: "SLC",
        destination: "ATL",
        departureTime: "09:45",
        arrivalTime: "13:45",
        scheduledBlockMinutes: 240,
        actualOut: undefined,
        actualIn: undefined,
        actualBlockMinutes: undefined,
        turnMinutes: undefined,
        status: "on_time",
        aircraft: undefined,
        gate: undefined,
        isDeadhead: false,
        legKind: "operating",
        segmentType: "operating",
        deadheadSource: undefined,
        confirmationNumber: undefined,
        carrier: "DL",
        sourceText: undefined,
        excludeFromLogbookExport: false,
      },
    ],
    deadheadLegs: [],
    layovers: ["ATL"],
    totalCreditMinutes: 240,
    operatingBlockMinutes: 240,
    deadheadBlockMinutes: 0,
    tafbMinutes: 300,
    reportTime: "08:45",
    releaseTime: "14:15",
    finalOperatingArrival: "ATL",
    finalArrivalAfterDh: "ATL",
    isPartial: false,
    dutyPeriodLimits: [
      {
        dateKey: "22MAY",
        pwaFdpUsedMinutes: 240,
        pwaScheduledMaxFdpMinutes: 750,
        pwaActualMaxFdpMinutes: 810,
        pwaLimitSource: "icrew_pwa_fdp_line",
      },
    ],
    authoritativeSource: "micrew_email_refresh",
  };
}

assert(normalizeWebcalUrl("webcal://example.com/feed.ics") === "https://example.com/feed.ics", "webcal URL should normalize to https");
assert(normalizeWebcalUrl("https://example.com/feed.ics") === "https://example.com/feed.ics", "https URL should remain https");
assert(normalizeWebcalUrl("not-a-url") === null, "Malformed URL should fail safely");

{
  const events = parseICalendarFeed(minimalFeed);
  assert(events.length === 1, "Minimal ICS should produce one VEVENT");
  assert(events[0]?.uid === "test-1", "VEVENT UID should parse");
}

{
  const events = parseICalendarFeed(
    [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:a",
      "SUMMARY:DL1 SLC-ATL",
      "DTSTART:20260522T100000Z",
      "DTEND:20260522T120000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:b",
      "SUMMARY:DL2 ATL-SLC",
      "DTSTART:20260522T150000Z",
      "DTEND:20260522T170000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n"),
  );
  assert(events.length === 2, "Multiple VEVENTs should parse");
}

{
  const event = parseICalendarFeed(minimalFeed)[0]!;
  const extracted = extractFlightEventFromCalendarEvent(event);
  assert(extracted.flightNumber === "1234", "Flight number should parse from SUMMARY");
  assert(extracted.origin === "SLC" && extracted.destination === "ATL", "City pair should parse from SUMMARY");
  assert(extracted.rawSummary === "DL1234 SLC-ATL", "Raw summary should be preserved");
  assert(extracted.rawDescription === "Delta flight DL1234 SLC-ATL", "Raw description should be preserved");
  assert(extracted.source === "calendar_sync", "Calendar events should map to calendar_sync source");
}

{
  const updates = buildCalendarUpdateEvents(minimalFeed);
  assert(updates.length === 1, "Calendar feed should create one update event");
  assert(updates[0]?.scheduledOut === "15:45", `Expected DTSTART to become 15:45, got ${updates[0]?.scheduledOut}`);
  assert(updates[0]?.scheduledIn === "19:45", `Expected DTEND to become 19:45, got ${updates[0]?.scheduledIn}`);
}

{
  const baseline = makeBaseline();
  const projected = buildProjectedRotationSnapshot(baseline, buildCalendarUpdateEvents(minimalFeed));
  assert(projected.layovers.join(",") === "ATL", "Calendar projection should not erase baseline layovers");
  assert(projected.dutyPeriodLimits?.[0]?.pwaActualMaxFdpMinutes === 810, "Calendar projection should not erase PWA data");
}

console.log("calendarFeedIngestion passed");
