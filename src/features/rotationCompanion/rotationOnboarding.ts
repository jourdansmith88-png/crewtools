export type RotationOnboardingStep =
  | "welcome"
  | "connect_calendar"
  | "setup_micrew_baseline"
  | "ready_to_monitor";

export type RotationOnboardingStatus =
  | "not_started"
  | "calendar_setup_needed"
  | "baseline_needed"
  | "ready_for_monitoring"
  | "monitoring_active";

export type RotationOnboardingAction =
  | "setup_calendar_sync"
  | "upload_micrew_rotation"
  | "review_calendar_sync"
  | "monitor_trip";

export type RotationOnboardingState = {
  currentStep: RotationOnboardingStep;
  status: RotationOnboardingStatus;
  headline: string;
  body: string;
  primaryActionLabel: string;
  primaryAction: RotationOnboardingAction;
  secondaryActionLabel?: string;
  secondaryAction?: RotationOnboardingAction;
  calendarSyncReady: boolean;
  baselineReady: boolean;
  liveMonitoringReady: boolean;
  rows: Array<{
    key: string;
    title: string;
    detail: string;
    completed: boolean;
  }>;
};

type GetRotationOnboardingStateArgs = {
  hasCalendarSetup: boolean;
  hasLoadedBaseline: boolean;
  hasLiveProjection: boolean;
  hasUpcomingCalendarTrips?: boolean;
  isDebugMode?: boolean;
};

export function getRotationOnboardingState(
  args: GetRotationOnboardingStateArgs,
): RotationOnboardingState {
  const rows = [
    {
      key: "calendar-sync",
      title: "Calendar Sync",
      detail: "Detect trips and timing changes",
      completed: args.hasCalendarSetup,
    },
    {
      key: "micrew-baseline",
      title: "MiCrew Rotation",
      detail: "Official baseline for pay, 117, hotels, deadheads",
      completed: args.hasLoadedBaseline,
    },
    {
      key: "live-monitoring",
      title: "Live Monitoring",
      detail: "Calendar updates projected onto your trip timeline",
      completed: args.hasLiveProjection,
    },
  ];

  if (args.hasLoadedBaseline && args.hasLiveProjection) {
    return {
      currentStep: "ready_to_monitor",
      status: "monitoring_active",
      headline: "Live monitoring active",
      body: "Calendar updates are currently being projected onto this trip while MiCrew remains the official baseline.",
      primaryActionLabel: "Monitor this trip",
      primaryAction: "monitor_trip",
      calendarSyncReady: true,
      baselineReady: true,
      liveMonitoringReady: true,
      rows,
    };
  }

  if (args.hasLoadedBaseline) {
    return {
      currentStep: "ready_to_monitor",
      status: "ready_for_monitoring",
      headline: "Baseline loaded",
      body: "Calendar sync can monitor timing changes for this trip when connected.",
      primaryActionLabel: "Review Calendar Sync",
      primaryAction: "review_calendar_sync",
      secondaryActionLabel: "Upload MiCrew Rotation",
      secondaryAction: "upload_micrew_rotation",
      calendarSyncReady: args.hasCalendarSetup,
      baselineReady: true,
      liveMonitoringReady: false,
      rows,
    };
  }

  if (args.hasCalendarSetup) {
    return {
      currentStep: "setup_micrew_baseline",
      status: "baseline_needed",
      headline: "Calendar setup started",
      body: "Upload or forward your MiCrew rotation to unlock Pay Watch, 117 Watch, hotels, and live monitoring.",
      primaryActionLabel: "Upload MiCrew Rotation",
      primaryAction: "upload_micrew_rotation",
      secondaryActionLabel: "Review Calendar Sync",
      secondaryAction: "review_calendar_sync",
      calendarSyncReady: true,
      baselineReady: false,
      liveMonitoringReady: false,
      rows,
    };
  }

  return {
    currentStep: "connect_calendar",
    status: "calendar_setup_needed",
    headline: "Get CrewTools ready to watch your trips",
    body: "Connect MiCrew Calendar Sync once, then upload or forward your MiCrew rotation before each trip. CrewTools uses the calendar for live timing updates and the MiCrew rotation as the official baseline for pay, 117, hotels, and deadheads.",
    primaryActionLabel: "Set up Calendar Sync",
    primaryAction: "setup_calendar_sync",
    secondaryActionLabel: "Upload MiCrew Rotation",
    secondaryAction: "upload_micrew_rotation",
    calendarSyncReady: false,
    baselineReady: false,
    liveMonitoringReady: false,
    rows,
  };
}
