import type { RotationDashboardData, RotationLayoverDetail } from "../../utils/rotationCompanion.ts";
import { buildTripWatchRotationSnapshot, type TripWatchRotationSnapshot } from "./tripWatchComparison.ts";
import { buildDutyPeriodsFromRotationLegs } from "./dutyPeriods.ts";
import { getUnaugmentedFlightTimeLimitMinutes } from "./far117Limits.ts";
import { buildTodayTimelineItems, type TodayTimelineItem } from "./timelineItems.ts";
import {
  buildProjectedRotationSnapshot,
  filterCalendarEventsForBaseline,
  type BaselineRotationSnapshot,
  type CalendarUpdateEvent,
  type CalendarBaselineEventFilterResult,
  type ProjectionConfidence,
  type ProjectionMonitoringStatus,
  type ProjectedRotationSnapshot,
} from "./rotationProjection.ts";

export type LiveTimelineLegStatus =
  | "baseline"
  | "projected"
  | "delayed"
  | "early"
  | "actualized"
  | "same_airport_event"
  | "possible_reroute"
  | "canceled"
  | "unmatched";

export type LiveTimelineSource = "baseline" | "calendar" | "future_flight_tracking";

export type LiveTimelineChangeKind =
  | "time_changed"
  | "actual_time_added"
  | "block_changed"
  | "same_airport_event_added"
  | "possible_reroute_event"
  | "no_change";

export type LiveTimelineItem = {
  key: string;
  type: "leg" | "layover" | "monitoring";
  dayLabel: string;
  source: LiveTimelineSource;
  status: LiveTimelineLegStatus;
  changeKind: LiveTimelineChangeKind;
  confidence: ProjectionConfidence;
  badgeLabels: string[];
  monitoringMessages: string[];
  baselineLegId?: string;
  carrier?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  isDeadhead?: boolean;
  segmentType?: RotationDashboardData["legs"][number]["segmentType"];
  baselineDepartureTime?: string;
  baselineArrivalTime?: string;
  currentDepartureTime?: string;
  currentArrivalTime?: string;
  actualOut?: string;
  actualIn?: string;
  baselineBlockMinutes?: number;
  currentBlockMinutes?: number;
  blockDeltaMinutes?: number;
  timeDeltaMinutes?: number;
  city?: string;
  layoverDetailIndex?: number;
  layoverDetail?: RotationLayoverDetail;
  rawEvent?: CalendarUpdateEvent;
};

export type LiveTimelineDutySummary = {
  dateKey: string;
  baselineFdpUsedMinutes?: number;
  projectedFdpUsedMinutes?: number;
  baselineBlockMinutes: number;
  projectedBlockMinutes: number;
  baselineDeadheadBlockMinutes: number;
  projectedDeadheadBlockMinutes: number;
  fdpRemainingMinutes?: number;
  blockRemainingMinutes?: number;
  monitoringStatus: ProjectionMonitoringStatus;
  badges: string[];
};

export type LiveTimelineProjectionResult = {
  baselineSnapshot: BaselineRotationSnapshot;
  projectedSnapshot: ProjectedRotationSnapshot;
  filteredEvents: CalendarBaselineEventFilterResult;
  appliedEvents: CalendarUpdateEvent[];
  items: LiveTimelineItem[];
  dutySummaries: LiveTimelineDutySummary[];
  updatedLegCount: number;
  changedLegCount: number;
  insertedSameAirportEventCount: number;
  possibleRerouteCount: number;
  projectionUsable: boolean;
};

type TimelineDashboardLike = Pick<RotationDashboardData, "legs" | "snapshot" | "layoverDetails">;

function isDashboardData(value: RotationDashboardData | BaselineRotationSnapshot): value is RotationDashboardData {
  return "snapshot" in value;
}

function toBaselineSnapshot(
  value: RotationDashboardData | BaselineRotationSnapshot,
): BaselineRotationSnapshot {
  if (!isDashboardData(value)) {
    return value;
  }
  return {
    ...buildTripWatchRotationSnapshot(value),
    authoritativeSource:
      value.parsedRotation.sourceFormat === "icrew_printout"
        ? "paste_update"
        : value.parsedRotation.sourceFormat === "micrew_mobile"
          ? "micrew_email_refresh"
          : "unknown",
  };
}

function toTimelineDashboardLike(
  value: RotationDashboardData | BaselineRotationSnapshot,
): TimelineDashboardLike {
  if (isDashboardData(value)) {
    return value;
  }
  return {
    legs: value.legs as RotationDashboardData["legs"],
    snapshot: {
      tripDates: value.tripDates,
      rotationNumber: value.rotationNumber,
      totalCreditMinutes: value.totalCreditMinutes,
      scheduledBlockMinutes: value.operatingBlockMinutes + value.deadheadBlockMinutes,
      legCount: value.legs.length,
      layoverCities: value.layovers,
      finalArrival: value.finalArrivalAfterDh ?? value.finalOperatingArrival,
    },
    layoverDetails: value.layovers.map((city) => ({ city })),
  };
}

function isFiniteMinutes(value?: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseClockToMinutes(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function parseIsoClockToMinutes(value?: string | null) {
  if (!value) {
    return null;
  }
  const normalized = value.endsWith("Z") ? value : `${value}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getUTCHours() * 60 + parsed.getUTCMinutes();
}

function parseClockLabel(value?: string | null) {
  if (!value) {
    return undefined;
  }
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    return value;
  }
  const minutes = parseIsoClockToMinutes(value);
  if (minutes == null) {
    return undefined;
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function computeBlockMinutesFromTimes(
  departureTime?: string | null,
  arrivalTime?: string | null,
) {
  const departureMinutes = parseClockToMinutes(departureTime);
  const arrivalMinutes = parseClockToMinutes(arrivalTime);
  if (departureMinutes == null || arrivalMinutes == null) {
    return undefined;
  }
  return arrivalMinutes >= departureMinutes
    ? arrivalMinutes - departureMinutes
    : arrivalMinutes + 24 * 60 - departureMinutes;
}

function computeEventBlockMinutes(event: CalendarUpdateEvent) {
  if (isFiniteMinutes(event.actualBlockMinutes)) {
    return event.actualBlockMinutes;
  }
  return computeBlockMinutesFromTimes(event.scheduledOut, event.scheduledIn);
}

const MONTH_ABBREVIATIONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function parseDayLabel(dayLabel?: string | null) {
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

function eventMatchesLeg(event: CalendarUpdateEvent, leg: RotationDashboardData["legs"][number]) {
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

function getEventTargetIndex(
  event: CalendarUpdateEvent,
  legs: RotationDashboardData["legs"],
) {
  if (typeof event.legSequenceNumber === "number" && event.legSequenceNumber > 0) {
    return event.legSequenceNumber - 1;
  }

  return legs.findIndex((leg) => eventMatchesLeg(event, leg));
}

function cloneLeg(leg: RotationDashboardData["legs"][number]): RotationDashboardData["legs"][number] {
  return { ...leg };
}

function buildSyntheticLegFromEvent(
  event: CalendarUpdateEvent,
  fallbackDayLabel: string,
): RotationDashboardData["legs"][number] {
  const carrier = event.carrier ?? "DL";
  const flightNumber = event.flightNumber ?? "TBD";
  const isDeadhead = event.isDeadhead ?? false;
  return {
    id: event.eventId ?? event.uid ?? `live-${fallbackDayLabel}-${carrier}${flightNumber}-${event.origin ?? "UNK"}-${event.destination ?? "UNK"}`,
    dayLabel: toDayLabelFromOccurredAt(event.occurredAt) ?? fallbackDayLabel,
    flightNumber,
    origin: event.origin ?? "UNK",
    destination: event.destination ?? "UNK",
    departureTime: event.scheduledOut ?? parseClockLabel(event.occurredAt),
    arrivalTime: event.scheduledIn,
    scheduledBlockMinutes: computeEventBlockMinutes(event),
    actualOut: event.actualOut,
    actualIn: event.actualIn,
    actualBlockMinutes: event.actualBlockMinutes,
    turnMinutes: undefined,
    status: "placeholder",
    aircraft: undefined,
    gate: event.gate,
    isDeadhead,
    legKind: isDeadhead ? "deadhead" : "operating",
    segmentType: isDeadhead ? "deadhead" : event.origin && event.destination && event.origin === event.destination ? "return_to_gate" : "operating",
    deadheadSource: isDeadhead ? "unknown" : undefined,
    confirmationNumber: undefined,
    carrier,
    sourceText: undefined,
    excludeFromLogbookExport: isDeadhead,
  };
}

function findLayoverDetail(
  dashboard: TimelineDashboardLike,
  city: string,
  index?: number,
) {
  if (typeof index === "number" && dashboard.layoverDetails?.[index]) {
    return dashboard.layoverDetails[index];
  }
  return dashboard.layoverDetails?.find((detail) => detail.city.trim().toUpperCase() === city.trim().toUpperCase());
}

function pickConfidence(...values: Array<ProjectionConfidence | undefined>) {
  if (values.includes("needs_refresh")) {
    return "needs_refresh" as const;
  }
  if (values.includes("low")) {
    return "low" as const;
  }
  if (values.includes("medium")) {
    return "medium" as const;
  }
  return "high" as const;
}

function buildProjectedLegsForTimeline(
  baselineLegs: RotationDashboardData["legs"],
  matchedEvents: CalendarUpdateEvent[],
  sameAirportEvents: CalendarUpdateEvent[],
  possibleMatchEvents: CalendarUpdateEvent[],
) {
  const projectedLegs = baselineLegs.map(cloneLeg);
  const changeEventsByLegId = new Map<string, CalendarUpdateEvent[]>();

  const attachEvent = (legId: string, event: CalendarUpdateEvent) => {
    const bucket = changeEventsByLegId.get(legId) ?? [];
    bucket.push(event);
    changeEventsByLegId.set(legId, bucket);
  };

  for (const event of [...matchedEvents, ...possibleMatchEvents]) {
    const targetIndex = getEventTargetIndex(event, projectedLegs);
    if (targetIndex < 0 || targetIndex >= projectedLegs.length) {
      continue;
    }
    const leg = projectedLegs[targetIndex]!;
    if (event.scheduledOut) {
      leg.departureTime = event.scheduledOut;
    }
    if (event.scheduledIn) {
      leg.arrivalTime = event.scheduledIn;
    }
    if (event.actualOut) {
      leg.actualOut = event.actualOut;
    }
    if (event.actualIn) {
      leg.actualIn = event.actualIn;
    }
    if (isFiniteMinutes(event.actualBlockMinutes)) {
      leg.actualBlockMinutes = event.actualBlockMinutes;
    } else {
      const projectedBlockMinutes = computeEventBlockMinutes(event);
      if (isFiniteMinutes(projectedBlockMinutes)) {
        leg.scheduledBlockMinutes = projectedBlockMinutes;
      }
    }
    if (event.gate) {
      leg.gate = event.gate;
    }
    attachEvent(leg.id, event);
  }

  const insertedSameAirportLegs = sameAirportEvents.map((event) =>
    buildSyntheticLegFromEvent(event, toDayLabelFromOccurredAt(event.occurredAt) ?? projectedLegs.at(-1)?.dayLabel ?? "UNK"),
  );

  return { projectedLegs, changeEventsByLegId, insertedSameAirportLegs };
}

function buildLegTimelineStatus(
  baselineLeg: RotationDashboardData["legs"][number],
  currentLeg: RotationDashboardData["legs"][number],
  events: CalendarUpdateEvent[],
): {
  status: LiveTimelineLegStatus;
  changeKind: LiveTimelineChangeKind;
  confidence: ProjectionConfidence;
  badgeLabels: string[];
  monitoringMessages: string[];
  currentBlockMinutes?: number;
  blockDeltaMinutes?: number;
  timeDeltaMinutes?: number;
} {
  if (events.length === 0) {
    return {
      status: "baseline",
      changeKind: "no_change",
      confidence: "high",
      badgeLabels: [],
      monitoringMessages: [],
      currentBlockMinutes: currentLeg.actualBlockMinutes ?? currentLeg.scheduledBlockMinutes,
      blockDeltaMinutes: 0,
      timeDeltaMinutes: 0,
    };
  }

  const currentBlockMinutes = currentLeg.actualBlockMinutes ?? currentLeg.scheduledBlockMinutes;
  const baselineBlockMinutes = baselineLeg.actualBlockMinutes ?? baselineLeg.scheduledBlockMinutes;
  const blockDeltaMinutes =
    isFiniteMinutes(currentBlockMinutes) && isFiniteMinutes(baselineBlockMinutes)
      ? currentBlockMinutes - baselineBlockMinutes
      : undefined;
  const baselineOutMinutes = parseClockToMinutes(baselineLeg.departureTime);
  const currentOutMinutes = parseClockToMinutes(currentLeg.departureTime);
  const timeDeltaMinutes =
    baselineOutMinutes != null && currentOutMinutes != null ? currentOutMinutes - baselineOutMinutes : undefined;
  const hasActualTiming = Boolean(currentLeg.actualOut || currentLeg.actualIn || isFiniteMinutes(currentLeg.actualBlockMinutes));
  const hasTimeChange =
    baselineLeg.departureTime !== currentLeg.departureTime ||
    baselineLeg.arrivalTime !== currentLeg.arrivalTime;

  let status: LiveTimelineLegStatus = "projected";
  let changeKind: LiveTimelineChangeKind = "no_change";
  const badgeLabels = ["Calendar update"];
  const monitoringMessages: string[] = [];

  if (hasActualTiming) {
    status = "actualized";
    changeKind = "actual_time_added";
    badgeLabels.push("Actual time added");
    monitoringMessages.push("Projected from calendar actuals.");
  } else if (hasTimeChange) {
    changeKind = "time_changed";
    if ((timeDeltaMinutes ?? 0) > 0) {
      status = "delayed";
      badgeLabels.push("Delayed");
    } else if ((timeDeltaMinutes ?? 0) < 0) {
      status = "early";
      badgeLabels.push("Early");
    } else {
      status = "projected";
    }
    monitoringMessages.push("Calendar timing update detected.");
  }

  if (
    blockDeltaMinutes != null &&
    blockDeltaMinutes !== 0 &&
    changeKind !== "actual_time_added" &&
    changeKind !== "time_changed"
  ) {
    changeKind = "block_changed";
  }
  if (blockDeltaMinutes != null && blockDeltaMinutes !== 0) {
    badgeLabels.push("Possible pay impact");
  }

  return {
    status,
    changeKind,
    confidence: pickConfidence(...events.map((event) => event.confidence)),
    badgeLabels: Array.from(new Set(badgeLabels)),
    monitoringMessages: Array.from(new Set(monitoringMessages)),
    currentBlockMinutes,
    blockDeltaMinutes,
    timeDeltaMinutes,
  };
}

function buildSameAirportLiveItem(event: CalendarUpdateEvent, syntheticLeg: RotationDashboardData["legs"][number]): LiveTimelineItem {
  return {
    key: `same-airport-${syntheticLeg.id}`,
    type: "leg",
    dayLabel: syntheticLeg.dayLabel,
    source: "calendar",
    status: "same_airport_event",
    changeKind: "same_airport_event_added",
    confidence: event.confidence ?? "medium",
    badgeLabels: ["RTG detected", "Possible pay impact", "Refresh MiCrew for confirmation"],
    monitoringMessages: [
      "RTG-style event detected. 117 and block monitoring are active.",
      "Refresh MiCrew when available to confirm pay and final schedule treatment.",
    ],
    baselineLegId: undefined,
    carrier: syntheticLeg.carrier,
    flightNumber: syntheticLeg.flightNumber,
    origin: syntheticLeg.origin,
    destination: syntheticLeg.destination,
    isDeadhead: syntheticLeg.isDeadhead,
    segmentType: syntheticLeg.segmentType,
    baselineDepartureTime: undefined,
    baselineArrivalTime: undefined,
    currentDepartureTime: syntheticLeg.departureTime,
    currentArrivalTime: syntheticLeg.arrivalTime,
    actualOut: syntheticLeg.actualOut,
    actualIn: syntheticLeg.actualIn,
    baselineBlockMinutes: undefined,
    currentBlockMinutes: syntheticLeg.actualBlockMinutes ?? syntheticLeg.scheduledBlockMinutes,
    blockDeltaMinutes: undefined,
    timeDeltaMinutes: undefined,
    rawEvent: event,
  };
}

function buildPossibleRerouteItem(event: CalendarUpdateEvent): LiveTimelineItem {
  const dayLabel = toDayLabelFromOccurredAt(event.occurredAt) ?? "UNK";
  return {
    key: `possible-reroute-${event.uid ?? event.eventId ?? `${dayLabel}-${event.flightNumber ?? "TBD"}`}`,
    type: "monitoring",
    dayLabel,
    source: "calendar",
    status: "possible_reroute",
    changeKind: "possible_reroute_event",
    confidence: event.confidence ?? "low",
    badgeLabels: ["Possible reroute", "Refresh MiCrew for confirmation"],
    monitoringMessages: [
      "Possible reroute detected. CrewTools is monitoring the projected duty and block impact.",
      "Refresh MiCrew when available to confirm pay, hotels, deadhead status, and final legality details.",
    ],
    carrier: event.carrier,
    flightNumber: event.flightNumber,
    origin: event.origin,
    destination: event.destination,
    currentDepartureTime: event.scheduledOut,
    currentArrivalTime: event.scheduledIn,
    currentBlockMinutes: computeEventBlockMinutes(event),
    rawEvent: event,
  };
}

function getInsertionIndex(
  items: LiveTimelineItem[],
  dayLabel: string,
  event: CalendarUpdateEvent,
  options: { preferAfterSameFlight?: boolean } = {},
) {
  const sameDayIndices = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.dayLabel === dayLabel);
  if (sameDayIndices.length === 0) {
    return items.length;
  }
  const eventOutMinutes = parseClockToMinutes(event.scheduledOut) ?? parseIsoClockToMinutes(event.occurredAt);
  if (eventOutMinutes != null) {
    let targetIndex = sameDayIndices.at(-1)!.index + 1;
    for (const entry of sameDayIndices) {
      const itemMinutes = parseClockToMinutes(entry.item.currentDepartureTime) ?? parseClockToMinutes(entry.item.currentArrivalTime);
      if (itemMinutes != null && itemMinutes > eventOutMinutes) {
        targetIndex = entry.index;
        break;
      }
    }
    return targetIndex;
  }
  if (options.preferAfterSameFlight && event.flightNumber) {
    const sameFlight = sameDayIndices
      .filter(({ item }) => item.flightNumber === event.flightNumber)
      .at(-1);
    if (sameFlight) {
      return sameFlight.index + 1;
    }
  }
  return sameDayIndices.at(-1)!.index + 1;
}

export function buildLiveDutySummaries(args: {
  baselineSnapshot: BaselineRotationSnapshot;
  projectedLegs: RotationDashboardData["legs"];
  filteredEvents: CalendarBaselineEventFilterResult;
  projectedSnapshot: ProjectedRotationSnapshot;
}): LiveTimelineDutySummary[] {
  const baselinePeriods = buildDutyPeriodsFromRotationLegs({
    legs: args.baselineSnapshot.legs as RotationDashboardData["legs"],
    rotationReportTime: args.baselineSnapshot.reportTime,
    pwaDutyLimitsByDate: args.baselineSnapshot.dutyPeriodLimits,
  });
  const projectedPeriods = buildDutyPeriodsFromRotationLegs({
    legs: args.projectedLegs,
    rotationReportTime: args.projectedSnapshot.reportTime ?? args.baselineSnapshot.reportTime,
    pwaDutyLimitsByDate: args.baselineSnapshot.dutyPeriodLimits,
  });

  const baselineMap = new Map(baselinePeriods.map((period) => [period.dateKey, period]));
  const eventDayLabelMap = new Map<string, { hasMatched: boolean; hasSameAirport: boolean; hasReroute: boolean }>();
  const markEventDay = (event: CalendarUpdateEvent, key: keyof { hasMatched: boolean; hasSameAirport: boolean; hasReroute: boolean }) => {
    const dateKey = toDayLabelFromOccurredAt(event.occurredAt);
    if (!dateKey) {
      return;
    }
    const current = eventDayLabelMap.get(dateKey) ?? { hasMatched: false, hasSameAirport: false, hasReroute: false };
    current[key] = true;
    eventDayLabelMap.set(dateKey, current);
  };
  args.filteredEvents.matchedEvents.forEach((event) => markEventDay(event, "hasMatched"));
  args.filteredEvents.possibleMatches.forEach((event) => markEventDay(event, "hasMatched"));
  args.filteredEvents.sameAirportEvents.forEach((event) => markEventDay(event, "hasSameAirport"));
  args.filteredEvents.unmatchedFlightEvents.forEach((event) => markEventDay(event, "hasReroute"));

  return projectedPeriods.map((projectedPeriod) => {
    const baselinePeriod = baselineMap.get(projectedPeriod.dateKey);
    const modeledBlockMinutes = projectedPeriod.operatingBlockMinutes + projectedPeriod.rtgBlockMinutes;
    const blockLimitMinutes = getUnaugmentedFlightTimeLimitMinutes(projectedPeriod.reportTime);
    const projectedFdpUsedMinutes = projectedPeriod.dutySpanMinutes ?? projectedPeriod.pwaFdpUsedMinutes;
    const fdpLimitMinutes = projectedPeriod.pwaActualMaxFdpMinutes ?? projectedPeriod.pwaScheduledMaxFdpMinutes;
    const fdpRemainingMinutes =
      isFiniteMinutes(projectedFdpUsedMinutes) && isFiniteMinutes(fdpLimitMinutes)
        ? fdpLimitMinutes - projectedFdpUsedMinutes
        : undefined;
    const blockRemainingMinutes =
      isFiniteMinutes(blockLimitMinutes)
        ? blockLimitMinutes - modeledBlockMinutes
        : undefined;
    const eventState = eventDayLabelMap.get(projectedPeriod.dateKey);

    let monitoringStatus: ProjectionMonitoringStatus = "baseline_only";
    const badges: string[] = [];
    if (eventState?.hasSameAirport) {
      monitoringStatus = "same_airport_event_monitoring";
      badges.push("Calendar projection active", "RTG detected", "Possible pay impact", "Refresh MiCrew for confirmation");
    } else if (eventState?.hasReroute) {
      monitoringStatus = "possible_reroute_monitoring";
      badges.push("Calendar projection active", "Possible reroute", "Refresh MiCrew for confirmation");
    } else if (eventState?.hasMatched) {
      monitoringStatus = "timing_updates_detected";
      badges.push("Calendar projection active");
    }
    if (projectedPeriod.rtgBlockMinutes > 0 && !badges.includes("RTG detected")) {
      badges.push("RTG detected");
    }
    if (
      (baselinePeriod && modeledBlockMinutes !== baselinePeriod.operatingBlockMinutes + baselinePeriod.rtgBlockMinutes) ||
      (baselinePeriod && projectedPeriod.deadheadBlockMinutes !== baselinePeriod.deadheadBlockMinutes)
    ) {
      badges.push("Possible pay impact");
    }

    return {
      dateKey: projectedPeriod.dateKey,
      baselineFdpUsedMinutes: baselinePeriod?.pwaFdpUsedMinutes ?? baselinePeriod?.dutySpanMinutes,
      projectedFdpUsedMinutes,
      baselineBlockMinutes: (baselinePeriod?.operatingBlockMinutes ?? 0) + (baselinePeriod?.rtgBlockMinutes ?? 0),
      projectedBlockMinutes: modeledBlockMinutes,
      baselineDeadheadBlockMinutes: baselinePeriod?.deadheadBlockMinutes ?? 0,
      projectedDeadheadBlockMinutes: projectedPeriod.deadheadBlockMinutes,
      fdpRemainingMinutes,
      blockRemainingMinutes,
      monitoringStatus,
      badges: Array.from(new Set(badges)),
    };
  });
}

export function buildLiveTimelineProjection(
  baselineDashboardOrSnapshot: RotationDashboardData | BaselineRotationSnapshot,
  calendarEvents: CalendarUpdateEvent[],
): LiveTimelineProjectionResult {
  const baselineSnapshot = toBaselineSnapshot(baselineDashboardOrSnapshot);
  const baselineDashboard = toTimelineDashboardLike(baselineDashboardOrSnapshot);
  const filteredEvents = filterCalendarEventsForBaseline(baselineSnapshot, calendarEvents);
  const highConfidencePossibleMatches = filteredEvents.possibleMatches.filter((event) => event.confidence === "high");
  const appliedEvents = [
    ...filteredEvents.matchedEvents,
    ...filteredEvents.sameAirportEvents,
    ...highConfidencePossibleMatches,
  ];
  const projectedSnapshot = buildProjectedRotationSnapshot(baselineSnapshot, appliedEvents);
  const { projectedLegs, changeEventsByLegId, insertedSameAirportLegs } = buildProjectedLegsForTimeline(
    baselineSnapshot.legs as RotationDashboardData["legs"],
    filteredEvents.matchedEvents,
    filteredEvents.sameAirportEvents,
    highConfidencePossibleMatches,
  );

  const baselineTimelineItems = buildTodayTimelineItems(baselineDashboard);
  const liveItems: LiveTimelineItem[] = baselineTimelineItems.map((item) => {
    if (item.type === "layover") {
      return {
        key: item.key,
        type: "layover",
        dayLabel: item.dayLabel,
        source: "baseline",
        status: "baseline",
        changeKind: "no_change",
        confidence: "high",
        badgeLabels: [],
        monitoringMessages: [],
        city: item.city,
        layoverDetailIndex: item.layoverDetailIndex,
        layoverDetail: findLayoverDetail(baselineDashboard, item.city, item.layoverDetailIndex),
      };
    }

    const currentLeg =
      projectedLegs.find((leg) => leg.id === item.leg.id) ?? item.leg;
    const events = changeEventsByLegId.get(item.leg.id) ?? [];
    const status = buildLegTimelineStatus(item.leg, currentLeg, events);

    return {
      key: item.key,
      type: "leg",
      dayLabel: item.dayLabel,
      source: events.length > 0 ? "calendar" : "baseline",
      status: status.status,
      changeKind: status.changeKind,
      confidence: status.confidence,
      badgeLabels: status.badgeLabels,
      monitoringMessages: status.monitoringMessages,
      baselineLegId: item.leg.id,
      carrier: currentLeg.carrier,
      flightNumber: currentLeg.flightNumber,
      origin: currentLeg.origin,
      destination: currentLeg.destination,
      isDeadhead: currentLeg.isDeadhead,
      segmentType: currentLeg.segmentType,
      baselineDepartureTime: item.leg.departureTime,
      baselineArrivalTime: item.leg.arrivalTime,
      currentDepartureTime: currentLeg.departureTime,
      currentArrivalTime: currentLeg.arrivalTime,
      actualOut: currentLeg.actualOut,
      actualIn: currentLeg.actualIn,
      baselineBlockMinutes: item.leg.scheduledBlockMinutes,
      currentBlockMinutes: status.currentBlockMinutes,
      blockDeltaMinutes: status.blockDeltaMinutes,
      timeDeltaMinutes: status.timeDeltaMinutes,
    };
  });

  filteredEvents.sameAirportEvents.forEach((event, index) => {
    const syntheticLeg = insertedSameAirportLegs[index];
    if (!syntheticLeg) {
      return;
    }
    const insertionIndex = getInsertionIndex(liveItems, syntheticLeg.dayLabel, event, { preferAfterSameFlight: true });
    liveItems.splice(insertionIndex, 0, buildSameAirportLiveItem(event, syntheticLeg));
  });

  filteredEvents.unmatchedFlightEvents.forEach((event) => {
    const insertionIndex = getInsertionIndex(
      liveItems,
      toDayLabelFromOccurredAt(event.occurredAt) ?? baselineSnapshot.legs.at(-1)?.dayLabel ?? "UNK",
      event,
    );
    liveItems.splice(insertionIndex, 0, buildPossibleRerouteItem(event));
  });

  const dutySummaries = buildLiveDutySummaries({
    baselineSnapshot,
    projectedLegs: [...projectedLegs, ...insertedSameAirportLegs],
    filteredEvents,
    projectedSnapshot,
  });
  const changedLegCount = liveItems.filter(
    (item) =>
      item.type === "leg" &&
      (item.status !== "baseline" || item.changeKind !== "no_change"),
  ).length;
  const updatedLegCount = liveItems.filter((item) => item.type === "leg").length;

  return {
    baselineSnapshot,
    projectedSnapshot,
    filteredEvents,
    appliedEvents,
    items: liveItems,
    dutySummaries,
    updatedLegCount,
    changedLegCount,
    insertedSameAirportEventCount: filteredEvents.sameAirportEvents.length,
    possibleRerouteCount: filteredEvents.unmatchedFlightEvents.length,
    projectionUsable: projectedSnapshot.monitoringSummary.projectionUsable,
  };
}
