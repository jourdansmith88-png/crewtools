import assert from "node:assert/strict";

import { getRotationOnboardingState } from "./rotationOnboarding.ts";

const noCalendarNoBaseline = getRotationOnboardingState({
  hasCalendarSetup: false,
  hasLoadedBaseline: false,
  hasLiveProjection: false,
});
assert.equal(noCalendarNoBaseline.status, "calendar_setup_needed");
assert.equal(noCalendarNoBaseline.primaryActionLabel, "Set up Calendar Sync");
assert.match(noCalendarNoBaseline.body, /calendar/i);
assert.match(noCalendarNoBaseline.body, /MiCrew rotation/i);

const calendarNoBaseline = getRotationOnboardingState({
  hasCalendarSetup: true,
  hasLoadedBaseline: false,
  hasLiveProjection: false,
});
assert.equal(calendarNoBaseline.status, "baseline_needed");
assert.equal(calendarNoBaseline.primaryActionLabel, "Upload MiCrew Rotation");

const baselineNoProjection = getRotationOnboardingState({
  hasCalendarSetup: true,
  hasLoadedBaseline: true,
  hasLiveProjection: false,
});
assert.equal(baselineNoProjection.status, "ready_for_monitoring");
assert.equal(baselineNoProjection.primaryActionLabel, "Review Calendar Sync");

const liveProjectionActive = getRotationOnboardingState({
  hasCalendarSetup: true,
  hasLoadedBaseline: true,
  hasLiveProjection: true,
});
assert.equal(liveProjectionActive.status, "monitoring_active");

const rowsSummary = noCalendarNoBaseline.rows.map((row) => `${row.title}:${row.detail}`).join(" | ");
assert.match(rowsSummary, /Calendar Sync:Detect trips and timing changes/);
assert.match(rowsSummary, /MiCrew Rotation:Official baseline for pay, 117, hotels, deadheads/);

console.log("rotationOnboarding passed");
