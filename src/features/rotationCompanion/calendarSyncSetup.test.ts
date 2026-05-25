import assert from "node:assert/strict";

import {
  buildCalendarSyncSetupState,
  getCalendarSyncDisplayHost,
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
assert.match(checklistTitles, /Auto-Sync/);
assert.match(checklistTitles, /Sync by Flight/);

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

console.log("calendarSyncSetup passed");
