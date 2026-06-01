import assert from "node:assert/strict";

import {
  buildCalendarSyncSetupState,
  classifyCalendarSourceCandidate,
  getCalendarSyncDisplayHost,
  shouldImportCalendarEventForCrewTools,
} from "./calendarSyncSetup.ts";
import { normalizeWebcalUrl } from "./calendarFeedIngestion.ts";

const normalizedWebcal = normalizeWebcalUrl("webcal://p112-caldav.icloud.com/published/2/example");
assert.equal(normalizedWebcal, "https://p112-caldav.icloud.com/published/2/example");
const webcalState = buildCalendarSyncSetupState({
  calendarUrlEntered: true,
  normalizedHost: getCalendarSyncDisplayHost(normalizedWebcal ?? "") ?? undefined,
  baselineLoaded: false,
  instructionsViewed: true,
});
assert.equal(webcalState.setupStatus, "needs_baseline");

const normalizedHttps = normalizeWebcalUrl("https://p112-caldav.icloud.com/published/2/example");
assert.equal(normalizedHttps, "https://p112-caldav.icloud.com/published/2/example");

const invalidState = buildCalendarSyncSetupState({
  calendarUrlEntered: false,
  baselineLoaded: false,
  invalidUrl: true,
  instructionsViewed: true,
});
assert.equal(invalidState.setupStatus, "error");

const host = getCalendarSyncDisplayHost("https://p112-caldav.icloud.com/published/2/example");
assert.equal(host, "p112-caldav.icloud.com");
assert.equal(host?.includes("/published/2/example"), false);

const checklistTitles = webcalState.checklist.map((item) => item.title).join(" | ");
assert.match(checklistTitles, /Connect calendar in CrewTools/);
assert.match(checklistTitles, /Advanced: paste calendar link manually/);

const checklistDetails = webcalState.checklist.map((item) => item.detail ?? "").join(" | ");
assert.match(checklistDetails, /Auto-Sync/);
assert.match(checklistDetails, /Sync by Flight/);
assert.match(checklistDetails, /choose the MiCrew calendar/i);
assert.match(checklistDetails, /flight-like events/i);
assert.match(checklistDetails, /Only needed if you already have a webcal or iCal subscription link available/);
assert.match(checklistDetails, /authoritative baseline for pay, 117, hotels, and deadheads/i);

const needsBaselineState = buildCalendarSyncSetupState({
  calendarUrlEntered: true,
  normalizedHost: "p112-caldav.icloud.com",
  baselineLoaded: false,
  privacyAcknowledged: true,
});
assert.equal(needsBaselineState.setupStatus, "needs_baseline");

const readyState = buildCalendarSyncSetupState({
  calendarUrlEntered: true,
  normalizedHost: "p112-caldav.icloud.com",
  baselineLoaded: true,
  privacyAcknowledged: true,
});
assert.equal(readyState.setupStatus, "ready_for_monitoring");
assert.equal(readyState.privacyMode, "manual_url_fallback");

const localCalendarState = buildCalendarSyncSetupState({
  calendarUrlEntered: false,
  baselineLoaded: false,
  instructionsViewed: true,
});
assert.equal(localCalendarState.privacyMode, "selected_calendar_only");

const likelyMiCrewCalendar = classifyCalendarSourceCandidate({
  id: "micrew-1",
  displayName: "MiCrew Delta Schedule",
  eventSample: [{ summary: "DL1234 SLC-ATL" }],
});
assert.equal(likelyMiCrewCalendar.likelyMiCrew, true);
assert.equal(likelyMiCrewCalendar.confidence, "high");

const personalCalendar = classifyCalendarSourceCandidate({
  id: "personal-1",
  displayName: "Personal",
  eventSample: [{ summary: "Dentist appointment" }],
});
assert.equal(personalCalendar.likelyMiCrew, false);
assert.equal(personalCalendar.confidence, "low");

assert.equal(shouldImportCalendarEventForCrewTools({ summary: "DL1234 SLC-ATL" }), true);
assert.equal(shouldImportCalendarEventForCrewTools({ summary: "OO3726 SLC-IDA" }), true);
assert.equal(shouldImportCalendarEventForCrewTools({ summary: "DL2798 DFW-DFW" }), true);
assert.equal(shouldImportCalendarEventForCrewTools({ summary: "Dentist appointment" }), false);

console.log("calendarSyncSetup passed");
