import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";
import { buildDutyPeriodsFromRotationLegs, type RotationDutyPeriodSummary } from "./dutyPeriods.ts";
import { getUnaugmentedFlightTimeLimitMinutes } from "./far117Limits.ts";
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
  statusLabel: "Within parsed iCrew max" | "Within modeled limits" | "Caution" | "Exceeded modeled limit" | "Needs more info";
  dateLabel: string;
  fdpAllowableLabel?: string;
  fdpScheduledLabel?: string;
  fdpCurrentLabel?: string;
  fdpLabel?: string;
  fdpRemainingLabel?: string;
  blockAllowableLabel?: string;
  blockScheduledLabel?: string;
  blockCurrentLabel?: string;
  blockLabel?: string;
  blockRemainingLabel?: string;
  blockPendingNote?: string;
  changeLabel?: string;
  primaryLine: string;
  blockLine?: string;
  secondaryLine?: string;
  inlineStatusLabel?: "Caution" | "Exceeded modeled limit" | "Needs more info";
  highlights: string[];
  notes: string[];
};

export type DutyWatchSummary = {
  hasContent: boolean;
  overallStatus: DutyLimitWatchStatus;
  overallStatusLabel: "Within parsed iCrew max" | "Within modeled limits" | "Caution" | "Exceeded modeled limit" | "Needs more info";
  rows: DutyWatchSummaryRow[];
  recommendedItems: string[];
  debug: {
    baselineDutyPeriodsCount: number;
    updatedDutyPeriodsCount: number;
    evaluatedStatusesByDate: string[];
    includeRtgInBlockLimit: boolean;
  };
};

export type DutyTimelineHeaderRow = {
  dateKey: string;
  status: DutyLimitWatchStatus;
  statusLabel: DutyWatchSummaryRow["statusLabel"];
  inlineStatusLabel?: DutyWatchSummaryRow["inlineStatusLabel"];
  dateLabel: string;
  fdpAllowableLabel?: string;
  fdpScheduledLabel?: string;
  fdpCurrentLabel?: string;
  fdpLabel?: string;
  fdpRemainingLabel?: string;
  blockAllowableLabel?: string;
  blockScheduledLabel?: string;
  blockCurrentLabel?: string;
  blockLabel?: string;
  blockRemainingLabel?: string;
  blockPendingNote?: string;
  changeLabel?: string;
};

const EMPTY_DUTY_WATCH_SUMMARY: DutyWatchSummary = {
  hasContent: false,
  overallStatus: "needs_more_info",
  overallStatusLabel: "Needs more info",
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

function getStatusLabel(
  status: DutyLimitWatchStatus,
  source?: string | null,
): DutyWatchSummaryRow["statusLabel"] {
  switch (status) {
    case "within_limits":
      return source === "icrew_pwa_fdp_line" ? "Within parsed iCrew max" : "Within modeled limits";
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

function getStatusPriority(status: DutyLimitWatchStatus) {
  switch (status) {
    case "exceeded":
      return 0;
    case "caution":
      return 1;
    case "needs_more_info":
      return 2;
    case "within_limits":
      return 3;
    default:
      return 4;
  }
}

function getDateSortValue(dateKey: string) {
  const match = dateKey.match(/^(\d{2})/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function formatPendingValue() {
  return "—";
}

function buildModeledBlockMinutes(period: RotationDutyPeriodSummary, includeRtgInBlockLimit: boolean) {
  return period.operatingBlockMinutes + (includeRtgInBlockLimit ? period.rtgBlockMinutes : 0);
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
    pwaDutyLimitsByDate: snapshot.dutyPeriodLimits,
  });
}

export function evaluateDutyPeriodLimits(
  period: RotationDutyPeriodSummary,
  options: DutyLimitWatchOptions = {},
): DutyLimitWatchEvaluation {
  const includeRtgInBlockLimit = options.includeRtgInBlockLimit ?? true;
  const source =
    options.source ??
    period.pwaLimitSource ??
    DUTY_LIMIT_WATCH_SOURCE;
  const fdpLimitMinutes = isFiniteMinutes(options.fdpLimitMinutes)
    ? options.fdpLimitMinutes
    : isFiniteMinutes(period.pwaActualMaxFdpMinutes)
      ? period.pwaActualMaxFdpMinutes
      : isFiniteMinutes(period.pwaScheduledMaxFdpMinutes)
        ? period.pwaScheduledMaxFdpMinutes
        : undefined;
  const blockLimitMinutes = isFiniteMinutes(options.blockLimitMinutes)
    ? options.blockLimitMinutes
    : getUnaugmentedFlightTimeLimitMinutes(period.reportTime);
  const modeledFdpMinutes = isFiniteMinutes(period.pwaFdpUsedMinutes) ? period.pwaFdpUsedMinutes : period.dutySpanMinutes;
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

  if (!isFiniteMinutes(fdpLimitMinutes) && !isFiniteMinutes(blockLimitMinutes)) {
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

  const fdpRemainingMinutes = isFiniteMinutes(modeledFdpMinutes) && isFiniteMinutes(fdpLimitMinutes)
    ? fdpLimitMinutes - modeledFdpMinutes
    : undefined;
  const blockRemainingMinutes = isFiniteMinutes(blockLimitMinutes) ? blockLimitMinutes - modeledBlockMinutes : undefined;

  let status: DutyLimitWatchStatus = "within_limits";
  if (
    (isFiniteMinutes(modeledFdpMinutes) && isFiniteMinutes(fdpLimitMinutes) && modeledFdpMinutes > fdpLimitMinutes) ||
    (isFiniteMinutes(blockLimitMinutes) && modeledBlockMinutes > blockLimitMinutes)
  ) {
    status = "exceeded";
  } else if (
    (isFiniteMinutes(fdpRemainingMinutes) && fdpRemainingMinutes <= 30) ||
    (isFiniteMinutes(blockRemainingMinutes) && blockRemainingMinutes <= 30)
  ) {
    status = "caution";
  }

  if (status === "exceeded") {
    if (isFiniteMinutes(modeledFdpMinutes) && isFiniteMinutes(fdpLimitMinutes) && modeledFdpMinutes > fdpLimitMinutes) {
      flags.push("Modeled FDP usage exceeds the modeled FDP limit.");
    }
    if (isFiniteMinutes(blockLimitMinutes) && modeledBlockMinutes > blockLimitMinutes) {
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

      if (typeof updatedPeriod.pwaFdpUsedMinutes === "number") {
        const maxFdpMinutes =
          updatedPeriod.pwaActualMaxFdpMinutes ?? updatedPeriod.pwaScheduledMaxFdpMinutes;
        if (typeof maxFdpMinutes === "number") {
          highlights.push(`FDP ${formatMinutes(updatedPeriod.pwaFdpUsedMinutes)} / ${formatMinutes(maxFdpMinutes)}`);
        }
      }
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
        if (evaluation.status !== "within_limits") {
          notes.push(getStatusLabel(evaluation.status, evaluation.source));
        }
        if (typeof evaluation.fdpRemainingMinutes === "number") {
          notes.push(`FDP remaining ${formatMinutes(evaluation.fdpRemainingMinutes)}`);
        }
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

      const dateLabel = dateKey;
      let fdpLabel: string | undefined;
      let fdpRemainingLabel: string | undefined;
      let blockLabel: string | undefined;
      let blockRemainingLabel: string | undefined;
      let blockPendingNote: string | undefined;
      let fdpAllowableLabel: string | undefined;
      let fdpScheduledLabel: string | undefined;
      let fdpCurrentLabel: string | undefined;
      let blockAllowableLabel: string | undefined;
      let blockScheduledLabel: string | undefined;
      let blockCurrentLabel: string | undefined;
      const baselineModeledBlockMinutes = baselinePeriod
        ? buildModeledBlockMinutes(baselinePeriod, includeRtgInBlockLimit)
        : undefined;
      const updatedModeledBlockMinutes = buildModeledBlockMinutes(updatedPeriod, includeRtgInBlockLimit);
      if (typeof updatedPeriod.pwaFdpUsedMinutes === "number") {
        const maxFdpMinutes =
          updatedPeriod.pwaActualMaxFdpMinutes ?? updatedPeriod.pwaScheduledMaxFdpMinutes;
        if (typeof maxFdpMinutes === "number") {
          fdpLabel = `FDP ${formatMinutes(updatedPeriod.pwaFdpUsedMinutes)}/${formatMinutes(maxFdpMinutes)}`;
          fdpAllowableLabel = formatMinutes(maxFdpMinutes);
        }
        fdpCurrentLabel = formatMinutes(updatedPeriod.pwaFdpUsedMinutes);
      } else if (typeof updatedPeriod.dutySpanMinutes === "number") {
        fdpCurrentLabel = formatMinutes(updatedPeriod.dutySpanMinutes);
      }
      if (typeof baselinePeriod?.pwaFdpUsedMinutes === "number") {
        fdpScheduledLabel = formatMinutes(baselinePeriod.pwaFdpUsedMinutes);
      } else if (!baselinePeriod && fdpCurrentLabel) {
        fdpScheduledLabel = fdpCurrentLabel;
      }
      if (typeof evaluation.fdpRemainingMinutes === "number") {
        fdpRemainingLabel = `FDP rem ${formatMinutes(evaluation.fdpRemainingMinutes)}`;
      }
      blockCurrentLabel = formatMinutes(updatedModeledBlockMinutes);
      if (typeof baselineModeledBlockMinutes === "number") {
        blockScheduledLabel = formatMinutes(baselineModeledBlockMinutes);
      } else {
        blockScheduledLabel = blockCurrentLabel;
      }
      blockLabel = `Block ${blockCurrentLabel}`;
      blockRemainingLabel =
        typeof evaluation.blockRemainingMinutes === "number"
          ? `Block rem ${formatMinutes(evaluation.blockRemainingMinutes)}`
          : formatPendingValue();
      blockAllowableLabel =
        typeof evaluation.blockLimitMinutes === "number"
          ? formatMinutes(evaluation.blockLimitMinutes)
          : formatPendingValue();
      if (blockAllowableLabel === formatPendingValue()) {
        blockPendingNote = "Block max pending";
      }

      const secondaryParts: string[] = [];
      if (rtgBlockDeltaMinutes > 0) {
        secondaryParts.push(`RTG +${formatMinutes(rtgBlockDeltaMinutes)}`);
      }
      if (deadheadBlockDeltaMinutes !== 0) {
        const formattedDh = formatDeltaMinutes(deadheadBlockDeltaMinutes);
        if (formattedDh) {
          secondaryParts.push(`DH ${formattedDh}`);
        }
      }
      if (operatingBlockDeltaMinutes !== 0 || dutySpanChanged || rtgBlockDeltaMinutes !== 0) {
        secondaryParts.push("Block/FDP changed");
      }
      if (secondaryParts.length === 0 && evaluation.status === "needs_more_info") {
        secondaryParts.push("Limit check needs Delta table source");
      }

      return {
        dateKey,
        status: evaluation.status,
        statusLabel: getStatusLabel(evaluation.status, evaluation.source),
        dateLabel,
        fdpAllowableLabel,
        fdpScheduledLabel,
        fdpCurrentLabel,
        fdpLabel,
        fdpRemainingLabel,
        blockAllowableLabel,
        blockScheduledLabel,
        blockCurrentLabel,
        blockLabel,
        blockRemainingLabel,
        blockPendingNote,
        changeLabel: secondaryParts.join(" · ") || undefined,
        primaryLine: [
          dateLabel,
          fdpAllowableLabel ? `FDP Allow ${fdpAllowableLabel}` : null,
          fdpCurrentLabel ? `Current ${fdpCurrentLabel}` : null,
          fdpRemainingLabel,
        ]
          .filter(Boolean)
          .join(" · "),
        blockLine: [blockLabel, blockRemainingLabel].filter(Boolean).join(" · "),
        secondaryLine: secondaryParts.join(" · ") || undefined,
        inlineStatusLabel:
          evaluation.status === "within_limits" ? undefined : getStatusLabel(evaluation.status, evaluation.source),
        highlights,
        notes: Array.from(new Set(notes)),
      } satisfies DutyWatchSummaryRow;
    })
    .filter((row): row is DutyWatchSummaryRow => Boolean(row))
    .sort((left, right) => {
      const statusPriority = getStatusPriority(left.status) - getStatusPriority(right.status);
      if (statusPriority !== 0) {
        return statusPriority;
      }
      const leftHasRtg = left.highlights.some((item) => item.startsWith("RTG added")) ? 0 : 1;
      const rightHasRtg = right.highlights.some((item) => item.startsWith("RTG added")) ? 0 : 1;
      if (leftHasRtg !== rightHasRtg) {
        return leftHasRtg - rightHasRtg;
      }
      const leftDeltaScore = left.highlights.filter((item) => item.includes("Block") || item.includes("DH block") || item.includes("RTG")).length;
      const rightDeltaScore = right.highlights.filter((item) => item.includes("Block") || item.includes("DH block") || item.includes("RTG")).length;
      if (leftDeltaScore !== rightDeltaScore) {
        return rightDeltaScore - leftDeltaScore;
      }
      return getDateSortValue(left.dateKey) - getDateSortValue(right.dateKey);
    });

  const overallStatus = rows.length
    ? rows.slice(1).reduce<DutyLimitWatchStatus>(
        (current, row) => (getStatusPriority(row.status) < getStatusPriority(current) ? row.status : current),
        rows[0].status,
      )
    : "needs_more_info";
  const overallStatusLabel = rows.length
    ? getStatusLabel(
        overallStatus,
        rows.every((row) => row.status === "within_limits" && row.statusLabel === "Within parsed iCrew max")
          ? "icrew_pwa_fdp_line"
          : undefined,
      )
    : "Needs more info";

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
    overallStatus,
    overallStatusLabel,
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

export function buildDutyTimelineHeaderRows(
  snapshot: TripWatchRotationSnapshot | null | undefined,
  comparisonResult?: TripWatchComparisonResult | null,
  baselineSnapshot?: TripWatchRotationSnapshot | null,
  options: DutyLimitWatchOptions = {},
): DutyTimelineHeaderRow[] {
  if (!snapshot) {
    return [];
  }

  const includeRtgInBlockLimit = options.includeRtgInBlockLimit ?? true;
  const periods = snapshotToDutyPeriods(snapshot);
  const evaluations = evaluateRotationDutyLimits(periods, options);
  const baselineMap = buildPeriodMap(snapshotToDutyPeriods(baselineSnapshot));

  return periods.map((period) => {
    const evaluation = evaluations.find((item) => item.dateKey === period.dateKey);
    const baselinePeriod = baselineMap.get(period.dateKey);
    const modeledBlockMinutes = buildModeledBlockMinutes(period, includeRtgInBlockLimit);
    const baselineModeledBlockMinutes = baselinePeriod
      ? buildModeledBlockMinutes(baselinePeriod, includeRtgInBlockLimit)
      : undefined;
    const rtgBlockDeltaMinutes = (period.rtgBlockMinutes ?? 0) - (baselinePeriod?.rtgBlockMinutes ?? 0);
    const deadheadBlockDeltaMinutes = (period.deadheadBlockMinutes ?? 0) - (baselinePeriod?.deadheadBlockMinutes ?? 0);
    const operatingBlockDeltaMinutes = (period.operatingBlockMinutes ?? 0) - (baselinePeriod?.operatingBlockMinutes ?? 0);

    const fdpMaxMinutes = period.pwaActualMaxFdpMinutes ?? period.pwaScheduledMaxFdpMinutes;
    const fdpLabel =
      typeof period.pwaFdpUsedMinutes === "number" && typeof fdpMaxMinutes === "number"
        ? `FDP ${formatMinutes(period.pwaFdpUsedMinutes)}/${formatMinutes(fdpMaxMinutes)}`
        : undefined;
    const fdpAllowableLabel = typeof fdpMaxMinutes === "number" ? formatMinutes(fdpMaxMinutes) : undefined;
    const fdpScheduledLabel =
      typeof baselinePeriod?.pwaFdpUsedMinutes === "number"
        ? formatMinutes(baselinePeriod.pwaFdpUsedMinutes)
        : typeof period.pwaFdpUsedMinutes === "number"
          ? formatMinutes(period.pwaFdpUsedMinutes)
          : undefined;
    const fdpCurrentLabel =
      typeof period.pwaFdpUsedMinutes === "number"
        ? formatMinutes(period.pwaFdpUsedMinutes)
        : typeof period.dutySpanMinutes === "number"
          ? formatMinutes(period.dutySpanMinutes)
          : undefined;
    const fdpRemainingLabel =
      typeof evaluation?.fdpRemainingMinutes === "number"
        ? `FDP rem ${formatMinutes(evaluation.fdpRemainingMinutes)}`
        : undefined;
    const blockLabel =
      period.deadheadBlockMinutes > 0 && period.operatingBlockMinutes > 0
        ? `Block ${formatMinutes(modeledBlockMinutes)} + DH ${formatMinutes(period.deadheadBlockMinutes)}`
        : period.deadheadBlockMinutes > 0 && modeledBlockMinutes === 0
          ? `DH ${formatMinutes(period.deadheadBlockMinutes)}`
          : `Block ${formatMinutes(modeledBlockMinutes)}`;
    const blockAllowableLabel =
      typeof evaluation?.blockLimitMinutes === "number"
        ? formatMinutes(evaluation.blockLimitMinutes)
        : formatPendingValue();
    const blockScheduledLabel =
      typeof baselineModeledBlockMinutes === "number"
        ? formatMinutes(baselineModeledBlockMinutes)
        : formatMinutes(modeledBlockMinutes);
    const blockCurrentLabel = formatMinutes(modeledBlockMinutes);
    const blockRemainingLabel =
      typeof evaluation?.blockRemainingMinutes === "number"
        ? `Block rem ${formatMinutes(evaluation.blockRemainingMinutes)}`
        : formatPendingValue();
    const blockPendingNote =
      blockAllowableLabel === formatPendingValue() || blockRemainingLabel === formatPendingValue()
        ? "Block max pending"
        : undefined;

    const changeParts: string[] = [];
    if (comparisonResult?.status === "ok" && baselineSnapshot) {
      if (rtgBlockDeltaMinutes > 0) {
        changeParts.push(`RTG +${formatMinutes(rtgBlockDeltaMinutes)}`);
      }
      if (deadheadBlockDeltaMinutes !== 0) {
        const formattedDh = formatDeltaMinutes(deadheadBlockDeltaMinutes);
        if (formattedDh) {
          changeParts.push(`DH ${formattedDh}`);
        }
      }
      if (operatingBlockDeltaMinutes !== 0 || deadheadBlockDeltaMinutes !== 0 || rtgBlockDeltaMinutes !== 0) {
        changeParts.push(deadheadBlockDeltaMinutes !== 0 && rtgBlockDeltaMinutes === 0 ? "Block/DH changed" : "Block/FDP changed");
      }
    }

    return {
      dateKey: period.dateKey,
      status: evaluation?.status ?? "needs_more_info",
      statusLabel: getStatusLabel(evaluation?.status ?? "needs_more_info", evaluation?.source),
      inlineStatusLabel:
        evaluation?.status && evaluation.status !== "within_limits"
          ? getStatusLabel(evaluation.status, evaluation.source)
          : undefined,
      dateLabel: period.dateKey,
      fdpAllowableLabel,
      fdpScheduledLabel,
      fdpCurrentLabel,
      fdpLabel,
      fdpRemainingLabel,
      blockAllowableLabel,
      blockScheduledLabel,
      blockCurrentLabel,
      blockLabel,
      blockRemainingLabel,
      blockPendingNote,
      changeLabel: changeParts.join(" · ") || undefined,
    };
  });
}
