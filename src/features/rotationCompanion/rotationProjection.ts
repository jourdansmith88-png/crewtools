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
  | "possible_pay_impact"
  | "possible_117_impact";

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

function getEventTargetIndex(
  event: CalendarUpdateEvent,
  legs: RotationDashboardData["legs"],
) {
  if (typeof event.legSequenceNumber === "number" && event.legSequenceNumber > 0) {
    return event.legSequenceNumber - 1;
  }

  return legs.findIndex((leg) => {
    if (event.flightNumber && leg.flightNumber !== event.flightNumber) {
      return false;
    }
    if (event.carrier && leg.carrier !== event.carrier) {
      return false;
    }
    if (event.origin && leg.origin !== event.origin) {
      return false;
    }
    if (event.destination && leg.destination !== event.destination) {
      return false;
    }
    return Boolean(event.flightNumber || event.carrier || event.origin || event.destination);
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
  };

  provisional.refreshRecommendation = evaluateRefreshRecommendation(baselineSnapshot, provisional, updateEvents);
  return provisional;
}
