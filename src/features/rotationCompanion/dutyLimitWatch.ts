import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";
import { buildDutyPeriodsFromRotationLegs, type RotationDutyPeriodSummary } from "./dutyPeriods.ts";
import type { TripWatchComparisonResult, TripWatchRotationSnapshot } from "./tripWatchComparison.ts";

export const DUTY_LIMIT_WATCH_SOURCE = "delta_table_placeholder_v1";

export type DutyLimitWatchStatus = "within_limits" | "caution" | "exceeded" | "needs_more_info";

export type DutyLimitWatchEvaluation = {
  dateKey: string;
  reportTime?: string;
  dutySpanMinutes?: number;
  operatingBlockMinutes: number;
  rtgBlockMinutes: number;
  deadheadBlockMinutes: number;
  operatingLegCount: number;
  fdpLimitMinutes?: number;
  blockLimitMinutes?: number;
  fdpRemainingMinutes?: number;
  blockRemainingMinutes?: number;
  status: DutyLimitWatchStatus;
  flags: string[];
  notes: string[];
  source: string;
  includeRtgInBlockLimit: boolean;
};

export type DutyLimitWatchOptions = {
  fdpLimitMinutes?: number | null;
  blockLimitMinutes?: number | null;
  includeRtgInBlockLimit?: boolean;
  source?: string;
};

export type DutyWatchSummaryRow = {
  dateKey: string;
  status: DutyLimitWatchStatus;
  statusLabel: "Within modeled limits" | "Caution" | "Exceeded modeled limit" | "Needs more info";
  highlights: string[];
  notes: string[];
};

export type DutyWatchSummary = {
  hasContent: boolean;
  rows: DutyWatchSummaryRow[];
  recommendedItems: string[];
  debug: {
    baselineDutyPeriodsCount: number;
    updatedDutyPeriodsCount: number;
    evaluatedStatusesByDate: string[];
    includeRtgInBlockLimit: boolean;
  };
};

const EMPTY_DUTY_WATCH_SUMMARY: DutyWatchSummary = {
  hasContent: false,
  rows: [],
  recommendedItems: [],
  debug: {
    baselineDutyPeriodsCount: 0,
    updatedDutyPeriodsCount: 0,
    evaluatedStatusesByDate: [],
    includeRtgInBlockLimit: true,
  },
};

function isFiniteMinutes(value?: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMinutes(value?: number | null) {
  if (!isFiniteMinutes(value)) {
    return "TBD";
  }
  return `${Math.floor(value / 60)}:${String(Math.abs(value % 60)).padStart(2, "0")}`;
}

function formatDeltaMinutes(value?: number | null) {
  if (!isFiniteMinutes(value) || value === 0) {
    return null;
  }
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatMinutes(Math.abs(value))}`;
}

function getStatusLabel(status: DutyLimitWatchStatus): DutyWatchSummaryRow["statusLabel"] {
  switch (status) {
    case "within_limits":
      return "Within modeled limits";
    case "caution":
      return "Caution";
    case "exceeded":
      return "Exceeded modeled limit";
    default:
      return "Needs more info";
  }
}

function buildPeriodMap(periods: RotationDutyPeriodSummary[]) {
  return new Map(periods.map((period) => [period.dateKey, period]));
}

function snapshotToDutyPeriods(snapshot?: TripWatchRotationSnapshot | null) {
  if (!snapshot) {
    return [];
  }
  const legs = Array.isArray(snapshot.legs) ? snapshot.legs : [];
  if (legs.length === 0) {
    return [];
  }
  return buildDutyPeriodsFromRotationLegs({
    legs: legs as RotationDashboardData["legs"],
    rotationReportTime: snapshot.reportTime,
  });
}

export function evaluateDutyPeriodLimits(
  period: RotationDutyPeriodSummary,
  options: DutyLimitWatchOptions = {},
): DutyLimitWatchEvaluation {
  const includeRtgInBlockLimit = options.includeRtgInBlockLimit ?? true;
  const source = options.source ?? DUTY_LIMIT_WATCH_SOURCE;
  const fdpLimitMinutes = isFiniteMinutes(options.fdpLimitMinutes) ? options.fdpLimitMinutes : undefined;
  const blockLimitMinutes = isFiniteMinutes(options.blockLimitMinutes) ? options.blockLimitMinutes : undefined;
  const modeledBlockMinutes = period.operatingBlockMinutes + (includeRtgInBlockLimit ? period.rtgBlockMinutes : 0);
  const flags: string[] = [];
  const notes: string[] = [];

  if (period.rtgBlockMinutes > 0) {
    notes.push(
      includeRtgInBlockLimit
        ? "RTG block is included in the modeled block check."
        : "RTG block is excluded from the modeled block check.",
    );
  }

  if (!isFiniteMinutes(fdpLimitMinutes) || !isFiniteMinutes(blockLimitMinutes)) {
    notes.push("Limit check needs Delta table source.");
    return {
      dateKey: period.dateKey,
      reportTime: period.reportTime,
      dutySpanMinutes: period.dutySpanMinutes,
      operatingBlockMinutes: period.operatingBlockMinutes,
      rtgBlockMinutes: period.rtgBlockMinutes,
      deadheadBlockMinutes: period.deadheadBlockMinutes,
      operatingLegCount: period.operatingLegCount,
      fdpLimitMinutes,
      blockLimitMinutes,
      fdpRemainingMinutes: undefined,
      blockRemainingMinutes: undefined,
      status: "needs_more_info",
      flags,
      notes,
      source,
      includeRtgInBlockLimit,
    };
  }

  const fdpRemainingMinutes = isFiniteMinutes(period.dutySpanMinutes)
    ? fdpLimitMinutes - period.dutySpanMinutes
    : undefined;
  const blockRemainingMinutes = blockLimitMinutes - modeledBlockMinutes;

  let status: DutyLimitWatchStatus = "within_limits";
  if ((isFiniteMinutes(period.dutySpanMinutes) && period.dutySpanMinutes > fdpLimitMinutes) || modeledBlockMinutes > blockLimitMinutes) {
    status = "exceeded";
  } else if (
    (isFiniteMinutes(fdpRemainingMinutes) && fdpRemainingMinutes <= 30) ||
    (isFiniteMinutes(blockRemainingMinutes) && blockRemainingMinutes <= 30)
  ) {
    status = "caution";
  }

  if (status === "exceeded") {
    if (isFiniteMinutes(period.dutySpanMinutes) && period.dutySpanMinutes > fdpLimitMinutes) {
      flags.push("Duty span exceeds modeled FDP limit.");
    }
    if (modeledBlockMinutes > blockLimitMinutes) {
      flags.push("Block exceeds modeled block limit.");
    }
  } else if (status === "caution") {
    if (isFiniteMinutes(fdpRemainingMinutes) && fdpRemainingMinutes <= 30) {
      flags.push("FDP remaining is 30 minutes or less.");
    }
    if (isFiniteMinutes(blockRemainingMinutes) && blockRemainingMinutes <= 30) {
      flags.push("Block remaining is 30 minutes or less.");
    }
  }

  return {
    dateKey: period.dateKey,
    reportTime: period.reportTime,
    dutySpanMinutes: period.dutySpanMinutes,
    operatingBlockMinutes: period.operatingBlockMinutes,
    rtgBlockMinutes: period.rtgBlockMinutes,
    deadheadBlockMinutes: period.deadheadBlockMinutes,
    operatingLegCount: period.operatingLegCount,
    fdpLimitMinutes,
    blockLimitMinutes,
    fdpRemainingMinutes,
    blockRemainingMinutes,
    status,
    flags,
    notes,
    source,
    includeRtgInBlockLimit,
  };
}

export function evaluateRotationDutyLimits(
  periods: RotationDutyPeriodSummary[],
  options: DutyLimitWatchOptions = {},
) {
  return periods.map((period) => evaluateDutyPeriodLimits(period, options));
}

export function buildDutyWatchSummary(
  baselineSnapshot: TripWatchRotationSnapshot | null | undefined,
  updatedSnapshot: TripWatchRotationSnapshot | null | undefined,
  comparisonResult: TripWatchComparisonResult | null | undefined,
  options: DutyLimitWatchOptions = {},
): DutyWatchSummary | null {
  if (!comparisonResult || comparisonResult.status !== "ok" || !baselineSnapshot || !updatedSnapshot) {
    return null;
  }

  const isDifferentRotation =
    Boolean(baselineSnapshot.rotationNumber) &&
    Boolean(updatedSnapshot.rotationNumber) &&
    baselineSnapshot.rotationNumber !== updatedSnapshot.rotationNumber;
  if (isDifferentRotation || comparisonResult.title === "Different rotation detected") {
    return null;
  }

  const includeRtgInBlockLimit = options.includeRtgInBlockLimit ?? true;
  const baselinePeriods = snapshotToDutyPeriods(baselineSnapshot);
  const updatedPeriods = snapshotToDutyPeriods(updatedSnapshot);
  const baselineMap = buildPeriodMap(baselinePeriods);
  const updatedMap = buildPeriodMap(updatedPeriods);
  const allDates = Array.from(new Set([...baselineMap.keys(), ...updatedMap.keys()]));
  const evaluations = evaluateRotationDutyLimits(updatedPeriods, options);
  const evaluationMap = new Map(evaluations.map((evaluation) => [evaluation.dateKey, evaluation]));

  const rows = allDates
    .map((dateKey) => {
      const baselinePeriod = baselineMap.get(dateKey);
      const updatedPeriod = updatedMap.get(dateKey);
      const evaluation = evaluationMap.get(dateKey);
      if (!updatedPeriod || !evaluation) {
        return null;
      }

      const operatingBlockDeltaMinutes = (updatedPeriod.operatingBlockMinutes ?? 0) - (baselinePeriod?.operatingBlockMinutes ?? 0);
      const deadheadBlockDeltaMinutes = (updatedPeriod.deadheadBlockMinutes ?? 0) - (baselinePeriod?.deadheadBlockMinutes ?? 0);
      const rtgBlockDeltaMinutes = (updatedPeriod.rtgBlockMinutes ?? 0) - (baselinePeriod?.rtgBlockMinutes ?? 0);
      const dutySpanChanged =
        isFiniteMinutes(updatedPeriod.dutySpanMinutes) &&
        isFiniteMinutes(baselinePeriod?.dutySpanMinutes) &&
        updatedPeriod.dutySpanMinutes !== baselinePeriod?.dutySpanMinutes;
      const statusChanged = !baselinePeriod || evaluation.status !== evaluateDutyPeriodLimits(baselinePeriod, options).status;

      const highlights: string[] = [];
      const notes: string[] = [];

      if (rtgBlockDeltaMinutes > 0) {
        highlights.push(`RTG added: +${formatMinutes(rtgBlockDeltaMinutes)}`);
      }
      if (operatingBlockDeltaMinutes !== 0 || deadheadBlockDeltaMinutes !== 0 || dutySpanChanged || rtgBlockDeltaMinutes !== 0) {
        highlights.push("Block/FDP inputs changed");
      }
      if (deadheadBlockDeltaMinutes !== 0) {
        const formattedDh = formatDeltaMinutes(deadheadBlockDeltaMinutes);
        if (formattedDh) {
          highlights.push(`DH block ${formattedDh}`);
        }
      }

      if (evaluation.status === "needs_more_info") {
        notes.push("Limit check needs Delta table source");
      } else {
        notes.push(getStatusLabel(evaluation.status));
      }
      notes.push(...evaluation.flags);

      const changed =
        highlights.length > 0 ||
        statusChanged ||
        operatingBlockDeltaMinutes !== 0 ||
        deadheadBlockDeltaMinutes !== 0 ||
        rtgBlockDeltaMinutes !== 0 ||
        dutySpanChanged;
      if (!changed) {
        return null;
      }

      return {
        dateKey,
        status: evaluation.status,
        statusLabel: getStatusLabel(evaluation.status),
        highlights,
        notes: Array.from(new Set(notes)),
      } satisfies DutyWatchSummaryRow;
    })
    .filter((row): row is DutyWatchSummaryRow => Boolean(row));

  const recommendedItems = rows.length
    ? Array.from(
        new Set(
          [
            "Check 117",
            "Review duty periods",
          ].filter(Boolean),
        ),
      )
    : [];

  return {
    hasContent: rows.length > 0,
    rows,
    recommendedItems,
    debug: {
      baselineDutyPeriodsCount: baselinePeriods.length,
      updatedDutyPeriodsCount: updatedPeriods.length,
      evaluatedStatusesByDate: evaluations.map((evaluation) => `${evaluation.dateKey}:${evaluation.status}`),
      includeRtgInBlockLimit,
    },
  };
}
