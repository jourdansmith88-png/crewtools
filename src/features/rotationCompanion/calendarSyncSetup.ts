export type CalendarSyncSetupStatus =
  | "not_started"
  | "instructions_viewed"
  | "calendar_url_entered"
  | "test_passed"
  | "needs_baseline"
  | "ready_for_monitoring"
  | "error";

export type CalendarSyncConnectionTestResult = {
  success: boolean;
  normalizedHost?: string;
  lastTestedAt: string;
  parsedEventCount?: number;
  flightLikeEventCount?: number;
  message: string;
  errorCode?: "invalid_url" | "fetch_blocked" | "unknown";
};

export type CalendarEventPrivacyMode =
  | "selected_calendar_only"
  | "flight_events_only"
  | "manual_url_fallback";

export type CalendarSourceCandidate = {
  id: string;
  displayName: string;
  sourceName?: string;
  likelyMiCrew: boolean;
  confidence: "high" | "medium" | "low";
  reason?: string;
};

export type CalendarSourceSelectionState = {
  selectedCalendarId?: string;
  selectedCalendarName?: string;
  calendarAccessStatus:
    | "not_requested"
    | "permission_needed"
    | "permission_granted"
    | "permission_denied"
    | "source_selected";
  privacyMode: CalendarEventPrivacyMode;
};

export type CalendarSyncSetupChecklistItem = {
  key: string;
  title: string;
  detail?: string;
  completed: boolean;
};

export type CalendarSyncSetupState = {
  calendarUrlEntered: boolean;
  normalizedHost?: string;
  lastTestedAt?: string;
  lastParsedEventCount?: number;
  lastFlightLikeEventCount?: number;
  setupStatus: CalendarSyncSetupStatus;
  checklist: CalendarSyncSetupChecklistItem[];
  privacyAcknowledged?: boolean;
  privacyMode: CalendarEventPrivacyMode;
};

type BuildCalendarSyncSetupStateArgs = {
  calendarUrlEntered: boolean;
  normalizedHost?: string;
  baselineLoaded: boolean;
  privacyAcknowledged?: boolean;
  instructionsViewed?: boolean;
  invalidUrl?: boolean;
  lastTestResult?: CalendarSyncConnectionTestResult | null;
};

export function getCalendarSyncDisplayHost(input: string) {
  try {
    return new URL(input).host || undefined;
  } catch {
    return undefined;
  }
}

type CalendarLikeObject = {
  id?: string | number;
  displayName?: string;
  name?: string;
  title?: string;
  sourceName?: string;
  eventSample?: Array<{
    title?: string;
    summary?: string;
    location?: string;
    notes?: string;
  }>;
};

const FLIGHT_NUMBER_PATTERN = /\b(?:DL|OO|9E|YX)\s?\d{2,4}\b/i;
const AIRPORT_PAIR_PATTERN = /\b[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/;

function getCalendarCandidateDisplayName(input: CalendarLikeObject) {
  return input.displayName?.trim() || input.name?.trim() || input.title?.trim() || "Calendar";
}

function getCalendarSampleText(input: CalendarLikeObject) {
  return (input.eventSample ?? [])
    .flatMap((item) => [item.title, item.summary, item.location, item.notes])
    .filter(Boolean)
    .join(" ");
}

export function classifyCalendarSourceCandidate(input: CalendarLikeObject): CalendarSourceCandidate {
  const displayName = getCalendarCandidateDisplayName(input);
  const sourceName = input.sourceName?.trim() || undefined;
  const combinedName = `${displayName} ${sourceName ?? ""}`.trim();
  const sampleText = getCalendarSampleText(input);
  const lowerName = combinedName.toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  if (lowerName.includes("micrew")) {
    score += 4;
    reasons.push("calendar name includes MiCrew");
  }
  if (lowerName.includes("delta")) {
    score += 3;
    reasons.push("calendar name includes Delta");
  }
  if (lowerName.includes("schedule")) {
    score += 2;
    reasons.push("calendar name includes schedule");
  }
  if (FLIGHT_NUMBER_PATTERN.test(sampleText)) {
    score += 2;
    reasons.push("event sample contains flight numbers");
  }
  if (AIRPORT_PAIR_PATTERN.test(sampleText)) {
    score += 2;
    reasons.push("event sample contains airport pairs");
  }

  const likelyMiCrew = score >= 4;
  const confidence = score >= 6 ? "high" : score >= 3 ? "medium" : "low";

  return {
    id: String(input.id ?? displayName),
    displayName,
    sourceName,
    likelyMiCrew,
    confidence,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };
}

type CalendarEventLike = {
  title?: string;
  summary?: string;
  location?: string;
  notes?: string;
};

export function shouldImportCalendarEventForCrewTools(event: CalendarEventLike) {
  const text = [event.title, event.summary, event.location, event.notes].filter(Boolean).join(" ");
  return FLIGHT_NUMBER_PATTERN.test(text) && AIRPORT_PAIR_PATTERN.test(text);
}

export function buildCalendarSyncSetupChecklist(args: {
  calendarUrlEntered: boolean;
  baselineLoaded: boolean;
}): CalendarSyncSetupChecklistItem[] {
  return [
    {
      key: "refresh-rate",
      title: "Set MiCrew refresh rate",
      detail: "Go to MiCrew → Settings → Connectivity and use 5 minutes if available.",
      completed: false,
    },
    {
      key: "flight-sync",
      title: "Turn on flight-by-flight calendar sync",
      detail: "Enable Auto-Sync, Sync by Flight, and Hide Rest Activities.",
      completed: false,
    },
    {
      key: "calendar-access",
      title: "Connect calendar in CrewTools",
      detail:
        "In the mobile app, allow calendar access, choose the MiCrew calendar, and use only flight-like events for live timing updates.",
      completed: false,
    },
    {
      key: "calendar-link",
      title: "Advanced beta workaround: paste calendar link manually",
      detail: "Only needed during beta testing if you already have a webcal, iCal, or raw ICS feed available.",
      completed: args.calendarUrlEntered,
    },
    {
      key: "baseline",
      title: "Upload or forward MiCrew rotation before each trip",
      detail: "This creates the authoritative baseline for pay, 117, hotels, and deadheads.",
      completed: args.baselineLoaded,
    },
  ];
}

export function buildCalendarSyncSetupState(
  args: BuildCalendarSyncSetupStateArgs,
): CalendarSyncSetupState {
  const checklist = buildCalendarSyncSetupChecklist({
    calendarUrlEntered: args.calendarUrlEntered,
    baselineLoaded: args.baselineLoaded,
  });
  let setupStatus: CalendarSyncSetupStatus = "not_started";
  if (args.invalidUrl) {
    setupStatus = "error";
  } else if (args.calendarUrlEntered && args.baselineLoaded) {
    setupStatus = "ready_for_monitoring";
  } else if (args.calendarUrlEntered && !args.baselineLoaded) {
    setupStatus = "needs_baseline";
  } else if (args.lastTestResult?.success) {
    setupStatus = "test_passed";
  } else if (args.calendarUrlEntered) {
    setupStatus = "calendar_url_entered";
  } else if (args.instructionsViewed || args.privacyAcknowledged) {
    setupStatus = "instructions_viewed";
  }

  return {
    calendarUrlEntered: args.calendarUrlEntered,
    normalizedHost: args.normalizedHost,
    lastTestedAt: args.lastTestResult?.lastTestedAt,
    lastParsedEventCount: args.lastTestResult?.parsedEventCount,
    lastFlightLikeEventCount: args.lastTestResult?.flightLikeEventCount,
    setupStatus,
    checklist,
    privacyAcknowledged: args.privacyAcknowledged,
    privacyMode: args.calendarUrlEntered ? "manual_url_fallback" : "selected_calendar_only",
  };
}
