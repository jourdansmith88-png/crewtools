import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";
import type { TripWatchRotationSnapshot } from "./tripWatchComparison.ts";

export type LiveUpdateSource =
  | "calendar_sync"
  | "manual_update"
  | "micrew_email_refresh"
  | "paste_update"
  | "screenshot_update"
  | "unknown";

export type ProjectionConfidence = "high" | "medium" | "low" | "needs_refresh";

export type ProjectionChangeReason =
  | "timing_changed"
  | "actual_times_changed"
  | "actual_block_changed"
  | "leg_added"
  | "leg_removed"
  | "flight_number_changed"
  | "origin_destination_changed"
  | "report_time_changed"
  | "release_time_changed"
  | "deadhead_status_changed"
  | "calendar_sequence_mismatch"
  | "same_airport_event_added"
  | "possible_pay_impact"
  | "possible_117_impact";

export type ProjectionMonitoringStatus =
  | "baseline_only"
  | "live_projection_active"
  | "timing_updates_detected"
  | "same_airport_event_monitoring"
  | "possible_reroute_monitoring"
  | "refresh_recommended"
  | "refresh_required_for_final_confirmation";

export type ProjectionMonitoringSummary = {
  monitoringStatus: ProjectionMonitoringStatus;
  primaryMessage: string;
  actionMessage: string;
  projectionUsable: boolean;
  shouldRefresh: boolean;
  refreshUrgency: "none" | "recommended" | "required";
  reasons: string[];
};

export type RefreshRecommendation = {
  shouldRefresh: boolean;
  severity: "info" | "caution" | "required";
  reasons: string[];
  message: string;
};

export type BaselineRotationSnapshot = TripWatchRotationSnapshot & {
  authoritativeSource?: LiveUpdateSource;
  capturedAt?: string;
};

export type CalendarUpdateEvent = {
  source: LiveUpdateSource;
  eventId?: string;
  uid?: string;
  legSequenceNumber?: number;
  removed?: boolean;
  carrier?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  scheduledOut?: string;
  scheduledIn?: string;
  actualOut?: string;
  actualIn?: string;
  actualBlockMinutes?: number;
  gate?: string;
  status?: RotationDashboardData["legs"][number]["status"] | string;
  reportTime?: string;
  releaseTime?: string;
  isDeadhead?: boolean;
  occurredAt?: string;
  receivedAt?: string;
  sequence?: number;
  lastModified?: string;
  location?: string;
  rawSummary?: string;
  rawDescription?: string;
  confidence?: ProjectionConfidence;
};

export type ProjectedRotationSnapshot = TripWatchRotationSnapshot & {
  projectionSource: LiveUpdateSource;
  confidence: ProjectionConfidence;
  changeReasons: ProjectionChangeReason[];
  appliedUpdateCount: number;
  baselineOperatingBlockMinutes?: number;
  projectedOperatingBlockMinutes?: number;
  baselineDeadheadBlockMinutes?: number;
  projectedDeadheadBlockMinutes?: number;
  baselineOnlyFieldsPreserved: Array<
    "layovers" | "hotels" | "transport" | "pwa_fdp_limits" | "credit" | "scheduled_block_totals" | "deadhead_semantics"
  >;
  possiblePayImpact: boolean;
  possibleDutyImpact: boolean;
  structuralChangeDetected: boolean;
  refreshRecommendation: RefreshRecommendation;
  monitoringSummary: ProjectionMonitoringSummary;
};

export type CalendarProjectionEventSummary = {
  matchedEvents: string[];
  sameAirportEvents: string[];
  unmatchedEvents: string[];
  timeOnlyUpdates: string[];
  structuralChangeEvents: string[];
  refreshReasons: string[];
};

export type CalendarBaselineEventFilterResult = {
  matchedEvents: CalendarUpdateEvent[];
  sameAirportEvents: CalendarUpdateEvent[];
  possibleMatches: CalendarUpdateEvent[];
  unmatchedFlightEvents: CalendarUpdateEvent[];
  ignoredEvents: CalendarUpdateEvent[];
  ignoredNonFlightEvents: CalendarUpdateEvent[];
  ignoredOutsideTripWindow: CalendarUpdateEvent[];
};

const BASELINE_ONLY_FIELDS: ProjectedRotationSnapshot["baselineOnlyFieldsPreserved"] = [
  "layovers",
  "hotels",
  "transport",
  "pwa_fdp_limits",
  "credit",
  "scheduled_block_totals",
  "deadhead_semantics",
];

function cloneLeg(leg: RotationDashboardData["legs"][number]): RotationDashboardData["legs"][number] {
  return { ...leg };
}

const MONTH_ABBREVIATIONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const NON_FLIGHT_EVENT_CODES = new Set(["XX", "PB", "PR", "LC", "SCC"]);

function cloneSnapshot(snapshot: BaselineRotationSnapshot): TripWatchRotationSnapshot {
  return {
    ...snapshot,
    legs: (snapshot.legs ?? []).map(cloneLeg),
    operatingLegs: (snapshot.operatingLegs ?? []).map(cloneLeg),
    deadheadLegs: (snapshot.deadheadLegs ?? []).map(cloneLeg),
    layovers: [...(snapshot.layovers ?? [])],
    dutyPeriodLimits: snapshot.dutyPeriodLimits?.map((period) => ({ ...period })),
  };
}

function addReason(reasons: Set<ProjectionChangeReason>, reason: ProjectionChangeReason) {
  reasons.add(reason);
}

function buildReasonLabels(reasons: ProjectionChangeReason[]) {
  const labels: Record<ProjectionChangeReason, string> = {
    timing_changed: "flight timing changed",
    actual_times_changed: "actual times changed",
    actual_block_changed: "actual block changed",
    leg_added: "leg added",
    leg_removed: "leg removed",
    flight_number_changed: "flight number changed",
    origin_destination_changed: "origin/destination changed",
    report_time_changed: "report time changed",
    release_time_changed: "release time changed",
    deadhead_status_changed: "deadhead status changed",
    calendar_sequence_mismatch: "calendar sequence does not match baseline",
    same_airport_event_added: "same-airport event added",
    possible_pay_impact: "possible pay impact",
    possible_117_impact: "possible 117 impact",
  };
  return reasons.map((reason) => labels[reason]);
}

function isFiniteMinutes(value?: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function computeProjectedOperatingBlockMinutes(legs: RotationDashboardData["legs"]) {
  return legs
    .filter((leg) => !leg.isDeadhead)
    .reduce((sum, leg) => sum + (isFiniteMinutes(leg.actualBlockMinutes) ? leg.actualBlockMinutes! : leg.scheduledBlockMinutes ?? 0), 0);
}

function computeProjectedDeadheadBlockMinutes(legs: RotationDashboardData["legs"]) {
  return legs
    .filter((leg) => leg.isDeadhead)
    .reduce((sum, leg) => sum + (isFiniteMinutes(leg.actualBlockMinutes) ? leg.actualBlockMinutes! : leg.scheduledBlockMinutes ?? 0), 0);
}

function coerceStatus(
  status?: string,
): RotationDashboardData["legs"][number]["status"] | undefined {
  if (status === "on_time" || status === "watch" || status === "tight_turn" || status === "placeholder") {
    return status;
  }
  return undefined;
}

function buildSyntheticLegFromEvent(
  event: CalendarUpdateEvent,
  fallbackDayLabel: string,
): RotationDashboardData["legs"][number] {
  const carrier = event.carrier ?? "DL";
  const flightNumber = event.flightNumber ?? "TBD";
  const isDeadhead = event.isDeadhead ?? false;
  return {
    id: event.eventId ?? `projection-${fallbackDayLabel}-${carrier}${flightNumber}-${event.origin ?? "UNK"}-${event.destination ?? "UNK"}`,
    dayLabel: fallbackDayLabel,
    flightNumber,
    origin: event.origin ?? "UNK",
    destination: event.destination ?? "UNK",
    departureTime: event.scheduledOut,
    arrivalTime: event.scheduledIn,
    scheduledBlockMinutes: undefined,
    actualOut: event.actualOut,
    actualIn: event.actualIn,
    actualBlockMinutes: event.actualBlockMinutes,
    turnMinutes: undefined,
    status: coerceStatus(event.status) ?? "placeholder",
    aircraft: undefined,
    gate: event.gate,
    isDeadhead,
    legKind: isDeadhead ? "deadhead" : "operating",
    segmentType: isDeadhead ? "deadhead" : "operating",
    deadheadSource: isDeadhead ? "unknown" : undefined,
    confirmationNumber: undefined,
    carrier,
    sourceText: undefined,
    excludeFromLogbookExport: isDeadhead,
  };
}

function toDayLabelFromOccurredAt(value?: string) {
  if (!value) {
    return undefined;
  }
  const normalized = value.endsWith("Z") ? value : `${value}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = MONTH_ABBREVIATIONS[parsed.getUTCMonth()];
  return month ? `${day}${month}` : undefined;
}

function parseDayLabel(dayLabel?: string) {
  const match = dayLabel?.toUpperCase().match(/^(\d{2})([A-Z]{3})$/);
  if (!match) {
    return null;
  }
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(match[2]);
  if (monthIndex < 0) {
    return null;
  }
  return new Date(Date.UTC(2000, monthIndex, Number.parseInt(match[1], 10)));
}

function formatDayLabel(date: Date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  return month ? `${day}${month}` : null;
}

function buildBaselineTripWindowLabels(baselineSnapshot: BaselineRotationSnapshot, bufferDays = 1) {
  const dayDates = Array.from(new Set((baselineSnapshot.legs ?? []).map((leg) => leg.dayLabel).filter(Boolean)))
    .map((dayLabel) => parseDayLabel(dayLabel))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime());

  if (dayDates.length === 0) {
    return new Set<string>();
  }

  const labels = new Set<string>();
  const start = new Date(dayDates[0]!);
  const end = new Date(dayDates[dayDates.length - 1]!);
  start.setUTCDate(start.getUTCDate() - bufferDays);
  end.setUTCDate(end.getUTCDate() + bufferDays);

  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const label = formatDayLabel(cursor);
    if (label) {
      labels.add(label);
    }
  }

  return labels;
}

function isLikelyFlightEvent(event: CalendarUpdateEvent) {
  if (event.flightNumber) {
    return true;
  }
  return Boolean(event.origin && event.destination && event.confidence && event.confidence !== "needs_refresh");
}

function isIgnoredNonFlightEvent(event: CalendarUpdateEvent) {
  const summary = `${event.rawSummary ?? ""} ${event.rawDescription ?? ""}`.toUpperCase();
  if (!event.flightNumber && !(event.origin && event.destination)) {
    return true;
  }
  if (summary.includes("??TBD") || summary.includes("UNK-UNK") || summary.includes("UNKNOWN")) {
    return true;
  }
  const firstToken = summary.trim().split(/\s+/)[0] ?? "";
  return NON_FLIGHT_EVENT_CODES.has(firstToken);
}

function isSameAirportFlightEvent(event: CalendarUpdateEvent) {
  return Boolean(
    event.flightNumber &&
      event.origin &&
      event.destination &&
      event.origin === event.destination,
  );
}

function parseClockToMinutes(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function findPossibleMatchIndex(
  event: CalendarUpdateEvent,
  legs: RotationDashboardData["legs"],
) {
  const eventDayLabel = toDayLabelFromOccurredAt(event.occurredAt);
  const eventOutMinutes = event.scheduledOut ? parseClockToMinutes(event.scheduledOut) : null;

  return legs.findIndex((leg) => {
    if (eventDayLabel && leg.dayLabel && eventDayLabel !== leg.dayLabel) {
      return false;
    }
    const sameFlightNumber = Boolean(event.flightNumber && event.flightNumber === leg.flightNumber);
    const sameRoute = Boolean(event.origin && event.destination && event.origin === leg.origin && event.destination === leg.destination);
    const legOutMinutes = leg.departureTime ? parseClockToMinutes(leg.departureTime) : null;
    const closeTiming =
      eventOutMinutes != null &&
      legOutMinutes != null &&
      Math.abs(eventOutMinutes - legOutMinutes) <= 180;
    return sameFlightNumber || (sameRoute && closeTiming);
  });
}

function eventMatchesLeg(
  event: CalendarUpdateEvent,
  leg: RotationDashboardData["legs"][number],
) {
  if (event.flightNumber && event.flightNumber !== leg.flightNumber) {
    return false;
  }
  if (event.carrier && event.carrier !== leg.carrier) {
    return false;
  }
  if (event.origin && event.origin !== leg.origin) {
    return false;
  }
  if (event.destination && event.destination !== leg.destination) {
    return false;
  }
  const eventDayLabel = toDayLabelFromOccurredAt(event.occurredAt);
  if (eventDayLabel && leg.dayLabel && eventDayLabel !== leg.dayLabel) {
    return false;
  }
  return Boolean(event.flightNumber || event.carrier || event.origin || event.destination || eventDayLabel);
}

function describeCalendarEvent(event: CalendarUpdateEvent) {
  const flightCode = `${event.carrier ?? "??"}${event.flightNumber ?? "TBD"}`;
  const route = event.origin && event.destination ? `${event.origin}-${event.destination}` : "route TBD";
  const timing =
    event.scheduledOut || event.scheduledIn
      ? `${event.scheduledOut ?? "??:??"}-${event.scheduledIn ?? "??:??"}`
      : "time TBD";
  return `${flightCode} ${route} ${timing}`.trim();
}

function getEventTargetIndex(
  event: CalendarUpdateEvent,
  legs: RotationDashboardData["legs"],
) {
  if (typeof event.legSequenceNumber === "number" && event.legSequenceNumber > 0) {
    return event.legSequenceNumber - 1;
  }

  return legs.findIndex((leg) => {
    return eventMatchesLeg(event, leg);
  });
}

function classifyConfidence(changeReasons: ProjectionChangeReason[]) {
  if (
    changeReasons.some((reason) =>
      [
        "leg_added",
        "leg_removed",
        "origin_destination_changed",
        "deadhead_status_changed",
        "calendar_sequence_mismatch",
      ].includes(reason),
    )
  ) {
    return "needs_refresh" as const;
  }
  if (changeReasons.length === 0) {
    return "high" as const;
  }
  if (
    changeReasons.every((reason) =>
      ["timing_changed", "actual_times_changed", "actual_block_changed", "possible_pay_impact", "possible_117_impact"].includes(reason),
    )
  ) {
    return "medium" as const;
  }
  return "low" as const;
}

export function evaluateRefreshRecommendation(
  baselineSnapshot: BaselineRotationSnapshot,
  projectedSnapshot: ProjectedRotationSnapshot,
  updateEvents: CalendarUpdateEvent[],
): RefreshRecommendation {
  const reasons = Array.from(new Set(projectedSnapshot.changeReasons));
  const structuralReasons = reasons.filter((reason) =>
    [
      "leg_added",
      "leg_removed",
      "origin_destination_changed",
      "deadhead_status_changed",
      "calendar_sequence_mismatch",
    ].includes(reason),
  );
  const cautionReasons = reasons.filter((reason) =>
    ["flight_number_changed", "report_time_changed", "release_time_changed"].includes(reason),
  );

  if (structuralReasons.length > 0) {
    const rerouteLikely = structuralReasons.some((reason) =>
      ["leg_added", "leg_removed", "origin_destination_changed", "calendar_sequence_mismatch"].includes(reason),
    );
    return {
      shouldRefresh: true,
      severity: "required",
      reasons: buildReasonLabels(reasons),
      message: rerouteLikely
        ? "Reroute likely. Upload updated MiCrew rotation."
        : "Schedule structure changed. Refresh from MiCrew to confirm pay and 117 details.",
    };
  }

  if (cautionReasons.length > 0) {
    return {
      shouldRefresh: true,
      severity: "caution",
      reasons: buildReasonLabels(reasons),
      message: "Schedule structure changed. Refresh from MiCrew to confirm pay and 117 details.",
    };
  }

  const hasTimingOnlyUpdate =
    updateEvents.length > 0 &&
    reasons.every((reason) =>
      ["timing_changed", "actual_times_changed", "actual_block_changed", "possible_pay_impact", "possible_117_impact"].includes(reason),
    );

  if (hasTimingOnlyUpdate) {
    return {
      shouldRefresh: false,
      severity: "info",
      reasons: buildReasonLabels(reasons),
      message: "Calendar update changed flight timing. Projection updated.",
    };
  }

  return {
    shouldRefresh: false,
    severity: "info",
    reasons: buildReasonLabels(reasons),
    message: "Baseline projection retained.",
  };
}

function evaluateProjectionMonitoringSummary(
  projectedSnapshot: ProjectedRotationSnapshot,
): ProjectionMonitoringSummary {
  const reasons = projectedSnapshot.refreshRecommendation.reasons;
  const hasSameAirportEvent = projectedSnapshot.changeReasons.includes("same_airport_event_added");
  const hasStructuralReroute =
    projectedSnapshot.changeReasons.includes("leg_added") ||
    projectedSnapshot.changeReasons.includes("leg_removed") ||
    projectedSnapshot.changeReasons.includes("origin_destination_changed") ||
    projectedSnapshot.changeReasons.includes("calendar_sequence_mismatch");
  const hasTimingOnlyUpdate =
    projectedSnapshot.changeReasons.length > 0 &&
    projectedSnapshot.changeReasons.every((reason) =>
      [
        "timing_changed",
        "actual_times_changed",
        "actual_block_changed",
        "possible_pay_impact",
        "possible_117_impact",
      ].includes(reason),
    );

  if (hasSameAirportEvent) {
    return {
      monitoringStatus: "same_airport_event_monitoring",
      primaryMessage: "RTG-style event detected. 117 and block monitoring are active.",
      actionMessage: "Refresh MiCrew when available to confirm pay and final schedule treatment.",
      projectionUsable: true,
      shouldRefresh: true,
      refreshUrgency: "recommended",
      reasons,
    };
  }

  if (hasStructuralReroute) {
    return {
      monitoringStatus:
        projectedSnapshot.confidence === "needs_refresh"
          ? "refresh_required_for_final_confirmation"
          : "possible_reroute_monitoring",
      primaryMessage: "Possible reroute detected. CrewTools is monitoring the projected duty and block impact.",
      actionMessage:
        projectedSnapshot.confidence === "needs_refresh"
          ? "Refresh MiCrew when available to confirm pay, hotels, deadhead status, and final legality details."
          : "Refresh MiCrew when available to confirm pay, hotels, deadhead status, and final legality details.",
      projectionUsable: true,
      shouldRefresh: true,
      refreshUrgency: projectedSnapshot.confidence === "needs_refresh" ? "required" : "recommended",
      reasons,
    };
  }

  if (hasTimingOnlyUpdate) {
    return {
      monitoringStatus: "timing_updates_detected",
      primaryMessage: "Calendar timing update detected. Projection updated.",
      actionMessage: "No MiCrew refresh required unless the schedule changes again.",
      projectionUsable: true,
      shouldRefresh: false,
      refreshUrgency: "none",
      reasons,
    };
  }

  if (projectedSnapshot.changeReasons.length === 0) {
    return {
      monitoringStatus: "baseline_only",
      primaryMessage: "Baseline rotation loaded. Live projection is standing by.",
      actionMessage: "No calendar action needed.",
      projectionUsable: true,
      shouldRefresh: false,
      refreshUrgency: "none",
      reasons,
    };
  }

  return {
    monitoringStatus: "live_projection_active",
    primaryMessage: "Projected from calendar. CrewTools is monitoring the live schedule.",
    actionMessage: projectedSnapshot.refreshRecommendation.message,
    projectionUsable: true,
    shouldRefresh: projectedSnapshot.refreshRecommendation.shouldRefresh,
    refreshUrgency:
      projectedSnapshot.refreshRecommendation.severity === "required"
        ? "required"
        : projectedSnapshot.refreshRecommendation.severity === "caution"
          ? "recommended"
          : "none",
    reasons,
  };
}

export function classifyCalendarEventForBaseline(
  baselineSnapshot: BaselineRotationSnapshot,
  event: CalendarUpdateEvent,
  tripWindowDayLabels = buildBaselineTripWindowLabels(baselineSnapshot),
) {
  const eventDayLabel = toDayLabelFromOccurredAt(event.occurredAt);
  if (eventDayLabel && tripWindowDayLabels.size > 0 && !tripWindowDayLabels.has(eventDayLabel)) {
    return "ignored_outside_trip_window" as const;
  }
  if (!isLikelyFlightEvent(event) || isIgnoredNonFlightEvent(event)) {
    return "ignored_non_flight" as const;
  }
  if (getEventTargetIndex(event, baselineSnapshot.legs) >= 0) {
    return "matched" as const;
  }
  if (isSameAirportFlightEvent(event)) {
    return "same_airport" as const;
  }
  if (findPossibleMatchIndex(event, baselineSnapshot.legs) >= 0) {
    return "possible_match" as const;
  }
  return "unmatched_flight" as const;
}

export function filterCalendarEventsForBaseline(
  baselineSnapshot: BaselineRotationSnapshot,
  updateEvents: CalendarUpdateEvent[],
): CalendarBaselineEventFilterResult {
  const tripWindowDayLabels = buildBaselineTripWindowLabels(baselineSnapshot);
  const result: CalendarBaselineEventFilterResult = {
    matchedEvents: [],
    sameAirportEvents: [],
    possibleMatches: [],
    unmatchedFlightEvents: [],
    ignoredEvents: [],
    ignoredNonFlightEvents: [],
    ignoredOutsideTripWindow: [],
  };

  for (const event of updateEvents) {
    const classification = classifyCalendarEventForBaseline(baselineSnapshot, event, tripWindowDayLabels);
    if (classification === "matched") {
      result.matchedEvents.push(event);
    } else if (classification === "same_airport") {
      result.sameAirportEvents.push(event);
    } else if (classification === "possible_match") {
      result.possibleMatches.push(event);
    } else if (classification === "unmatched_flight") {
      result.unmatchedFlightEvents.push(event);
    } else {
      result.ignoredEvents.push(event);
      if (classification === "ignored_outside_trip_window") {
        result.ignoredOutsideTripWindow.push(event);
      } else {
        result.ignoredNonFlightEvents.push(event);
      }
    }
  }

  return result;
}

export function buildProjectedRotationSnapshot(
  baselineSnapshot: BaselineRotationSnapshot,
  updateEvents: CalendarUpdateEvent[],
): ProjectedRotationSnapshot {
  const projected = cloneSnapshot(baselineSnapshot);
  const workingLegs = projected.legs;
  const changeReasons = new Set<ProjectionChangeReason>();

  for (const event of updateEvents) {
    if (event.reportTime && event.reportTime !== projected.reportTime) {
      projected.reportTime = event.reportTime;
      addReason(changeReasons, "report_time_changed");
      addReason(changeReasons, "possible_117_impact");
    }

    if (event.releaseTime && event.releaseTime !== projected.releaseTime) {
      projected.releaseTime = event.releaseTime;
      addReason(changeReasons, "release_time_changed");
      addReason(changeReasons, "possible_117_impact");
    }

    const targetIndex = getEventTargetIndex(event, workingLegs);

    if (event.removed) {
      if (targetIndex >= 0 && targetIndex < workingLegs.length) {
        workingLegs.splice(targetIndex, 1);
        addReason(changeReasons, "leg_removed");
      }
      continue;
    }

    if (targetIndex < 0 || targetIndex >= workingLegs.length) {
      if (event.origin || event.destination || event.flightNumber) {
        const fallbackDayLabel = workingLegs.at(-1)?.dayLabel ?? "UNK";
        workingLegs.push(buildSyntheticLegFromEvent(event, fallbackDayLabel));
        addReason(changeReasons, "leg_added");
        addReason(changeReasons, "calendar_sequence_mismatch");
        if (isSameAirportFlightEvent(event)) {
          addReason(changeReasons, "same_airport_event_added");
          addReason(changeReasons, "possible_pay_impact");
          addReason(changeReasons, "possible_117_impact");
        }
      }
      continue;
    }

    const leg = workingLegs[targetIndex];

    if (event.flightNumber && event.flightNumber !== leg.flightNumber) {
      leg.flightNumber = event.flightNumber;
      addReason(changeReasons, "flight_number_changed");
    }
    if (event.carrier && event.carrier !== leg.carrier) {
      leg.carrier = event.carrier;
      addReason(changeReasons, "flight_number_changed");
    }
    if ((event.origin && event.origin !== leg.origin) || (event.destination && event.destination !== leg.destination)) {
      leg.origin = event.origin ?? leg.origin;
      leg.destination = event.destination ?? leg.destination;
      addReason(changeReasons, "origin_destination_changed");
    }
    if (typeof event.isDeadhead === "boolean" && event.isDeadhead !== Boolean(leg.isDeadhead)) {
      leg.isDeadhead = event.isDeadhead;
      leg.legKind = event.isDeadhead ? "deadhead" : "operating";
      leg.segmentType = event.isDeadhead ? "deadhead" : leg.origin === leg.destination ? "return_to_gate" : "operating";
      leg.excludeFromLogbookExport = event.isDeadhead;
      addReason(changeReasons, "deadhead_status_changed");
    }
    if ((event.scheduledOut && event.scheduledOut !== leg.departureTime) || (event.scheduledIn && event.scheduledIn !== leg.arrivalTime)) {
      leg.departureTime = event.scheduledOut ?? leg.departureTime;
      leg.arrivalTime = event.scheduledIn ?? leg.arrivalTime;
      addReason(changeReasons, "timing_changed");
      addReason(changeReasons, "possible_pay_impact");
      addReason(changeReasons, "possible_117_impact");
    }
    if ((event.actualOut && event.actualOut !== leg.actualOut) || (event.actualIn && event.actualIn !== leg.actualIn)) {
      leg.actualOut = event.actualOut ?? leg.actualOut;
      leg.actualIn = event.actualIn ?? leg.actualIn;
      addReason(changeReasons, "actual_times_changed");
      addReason(changeReasons, "possible_117_impact");
    }
    if (isFiniteMinutes(event.actualBlockMinutes) && event.actualBlockMinutes !== leg.actualBlockMinutes) {
      leg.actualBlockMinutes = event.actualBlockMinutes;
      addReason(changeReasons, "actual_block_changed");
      addReason(changeReasons, "possible_pay_impact");
      addReason(changeReasons, "possible_117_impact");
    }
    if (event.gate) {
      leg.gate = event.gate;
    }
    const coercedStatus = coerceStatus(event.status);
    if (coercedStatus) {
      leg.status = coercedStatus;
    }

    if (typeof event.legSequenceNumber === "number" && event.legSequenceNumber > 0) {
      const baselineLeg = baselineSnapshot.legs[event.legSequenceNumber - 1];
      if (baselineLeg) {
        const sequenceMismatch =
          (event.flightNumber && event.flightNumber !== baselineLeg.flightNumber) ||
          (event.origin && event.origin !== baselineLeg.origin) ||
          (event.destination && event.destination !== baselineLeg.destination);
        if (sequenceMismatch) {
          addReason(changeReasons, "calendar_sequence_mismatch");
        }
      }
    }
  }

  projected.operatingLegs = workingLegs.filter((leg) => !leg.isDeadhead);
  projected.deadheadLegs = workingLegs.filter((leg) => leg.isDeadhead);
  projected.finalOperatingArrival = projected.operatingLegs.at(-1)?.destination ?? baselineSnapshot.finalOperatingArrival;
  projected.finalArrivalAfterDh = workingLegs.at(-1)?.destination ?? baselineSnapshot.finalArrivalAfterDh;

  const reasons = Array.from(changeReasons);
  const projectedOperatingBlockMinutes = computeProjectedOperatingBlockMinutes(workingLegs);
  const projectedDeadheadBlockMinutes = computeProjectedDeadheadBlockMinutes(workingLegs);
  const confidence = classifyConfidence(reasons);
  const structuralChangeDetected = reasons.some((reason) =>
    ["leg_added", "leg_removed", "origin_destination_changed", "deadhead_status_changed", "calendar_sequence_mismatch"].includes(reason),
  );

  const provisional: ProjectedRotationSnapshot = {
    ...projected,
    projectionSource: updateEvents.at(-1)?.source ?? baselineSnapshot.authoritativeSource ?? "unknown",
    confidence,
    changeReasons: reasons,
    appliedUpdateCount: updateEvents.length,
    baselineOperatingBlockMinutes: baselineSnapshot.operatingBlockMinutes,
    projectedOperatingBlockMinutes,
    baselineDeadheadBlockMinutes: baselineSnapshot.deadheadBlockMinutes,
    projectedDeadheadBlockMinutes,
    baselineOnlyFieldsPreserved: [...BASELINE_ONLY_FIELDS],
    possiblePayImpact: reasons.includes("possible_pay_impact"),
    possibleDutyImpact: reasons.includes("possible_117_impact"),
    structuralChangeDetected,
    refreshRecommendation: {
      shouldRefresh: false,
      severity: "info",
      reasons: [],
      message: "",
    },
    monitoringSummary: {
      monitoringStatus: "baseline_only",
      primaryMessage: "",
      actionMessage: "",
      projectionUsable: true,
      shouldRefresh: false,
      refreshUrgency: "none",
      reasons: [],
    },
  };

  provisional.refreshRecommendation = evaluateRefreshRecommendation(baselineSnapshot, provisional, updateEvents);
  provisional.monitoringSummary = evaluateProjectionMonitoringSummary(provisional);
  return provisional;
}

export function summarizeCalendarProjectionEvents(
  baselineSnapshot: BaselineRotationSnapshot,
  updateEvents: CalendarUpdateEvent[],
): CalendarProjectionEventSummary {
  const filteredEvents = filterCalendarEventsForBaseline(baselineSnapshot, updateEvents);
  const applicableEvents = [
    ...filteredEvents.matchedEvents,
    ...filteredEvents.sameAirportEvents,
    ...filteredEvents.possibleMatches.filter((event) => event.confidence === "high"),
  ];
  const matchedEvents: string[] = [];
  const sameAirportEvents: string[] = [];
  const unmatchedEvents: string[] = [];
  const timeOnlyUpdates: string[] = [];
  const structuralChangeEvents: string[] = [];

  for (const event of filteredEvents.matchedEvents) {
    const targetIndex = getEventTargetIndex(event, baselineSnapshot.legs);
    const description = describeCalendarEvent(event);

    if (targetIndex < 0 || targetIndex >= baselineSnapshot.legs.length) {
      continue;
    }

    const leg = baselineSnapshot.legs[targetIndex];
    matchedEvents.push(description);

    const structuralChange =
      Boolean(event.removed) ||
      (Boolean(event.flightNumber) && event.flightNumber !== leg.flightNumber) ||
      (Boolean(event.carrier) && event.carrier !== leg.carrier) ||
      (Boolean(event.origin) && event.origin !== leg.origin) ||
      (Boolean(event.destination) && event.destination !== leg.destination) ||
      (typeof event.isDeadhead === "boolean" && event.isDeadhead !== Boolean(leg.isDeadhead));

    if (structuralChange) {
      structuralChangeEvents.push(description);
      continue;
    }

    const timingOnlyChange =
      (Boolean(event.scheduledOut) && event.scheduledOut !== leg.departureTime) ||
      (Boolean(event.scheduledIn) && event.scheduledIn !== leg.arrivalTime) ||
      (Boolean(event.actualOut) && event.actualOut !== leg.actualOut) ||
      (Boolean(event.actualIn) && event.actualIn !== leg.actualIn) ||
      (isFiniteMinutes(event.actualBlockMinutes) && event.actualBlockMinutes !== leg.actualBlockMinutes);

    if (timingOnlyChange) {
      timeOnlyUpdates.push(description);
    }
  }

  for (const event of filteredEvents.unmatchedFlightEvents) {
    const description = describeCalendarEvent(event);
    unmatchedEvents.push(description);
    structuralChangeEvents.push(description);
  }

  for (const event of filteredEvents.sameAirportEvents) {
    const description = describeCalendarEvent(event);
    sameAirportEvents.push(description);
  }

  for (const event of filteredEvents.possibleMatches) {
    if (event.confidence !== "high") {
      unmatchedEvents.push(`${describeCalendarEvent(event)} (possible match)`);
    }
  }

  const projectedSnapshot = buildProjectedRotationSnapshot(baselineSnapshot, applicableEvents);
  const refreshReasons = [...projectedSnapshot.refreshRecommendation.reasons];
  if (filteredEvents.unmatchedFlightEvents.length > 0) {
    if (!refreshReasons.includes("leg added")) {
      refreshReasons.push("leg added");
    }
    if (!refreshReasons.includes("calendar sequence does not match baseline")) {
      refreshReasons.push("calendar sequence does not match baseline");
    }
  }
  return {
    matchedEvents,
    sameAirportEvents,
    unmatchedEvents,
    timeOnlyUpdates,
    structuralChangeEvents,
    refreshReasons,
  };
}
