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

export function buildCalendarSyncSetupChecklist(args: {
  calendarUrlEntered: boolean;
  baselineLoaded: boolean;
}): CalendarSyncSetupChecklistItem[] {
  return [
    {
      key: "micrew-settings",
      title: "Open MiCrew Settings",
      detail: "Go to Connectivity → Calendar.",
      completed: false,
    },
    {
      key: "auto-sync",
      title: "Turn Auto-Sync ON",
      detail: "Enable MiCrew Auto-Sync for calendar refreshes.",
      completed: false,
    },
    {
      key: "sync-by-flight",
      title: "Turn Sync by Flight ON",
      detail: "Sync by Flight helps CrewTools track flight-level timing updates.",
      completed: false,
    },
    {
      key: "refresh-rate",
      title: "Set Schedule Refresh Rate in Minutes",
      detail: "Use 5 minutes if MiCrew offers it. Hide Rest Activities is optional.",
      completed: false,
    },
    {
      key: "calendar-link",
      title: "Copy/paste your calendar subscription link into CrewTools",
      detail: "CrewTools uses the feed for trip detection and live timing updates.",
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
  };
}
