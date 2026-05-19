import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";
import {
  formatTripWatchLegSummary,
  type TripWatchComparisonResult,
  type TripWatchRotationSnapshot,
} from "./tripWatchComparison.ts";

export const DELTA_DAILY_MINIMUM_MINUTES = 315;

export type PayWatchDailyRow = {
  dateKey: string;
  protectedBaselineMinutes: number;
  updatedBlockMinutes: number;
  estimatedDayDeltaMinutes: number;
};

export type PayWatchSummary = {
  hasContent: boolean;
  summaryItems: string[];
  rtgAddedItems: string[];
  dailyRows: PayWatchDailyRow[];
  recommendedItems: string[];
};

const EMPTY_PAY_WATCH_SUMMARY: PayWatchSummary = {
  hasContent: false,
  summaryItems: [],
  rtgAddedItems: [],
  dailyRows: [],
  recommendedItems: [],
};

function formatMinutes(value?: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "TBD";
  }
  return `${Math.floor(value / 60)}:${String(Math.abs(value % 60)).padStart(2, "0")}`;
}

function formatDelta(label: string, deltaMinutes?: number | null) {
  if (deltaMinutes == null || deltaMinutes === 0) {
    return null;
  }
  const prefix = deltaMinutes > 0 ? "+" : "-";
  const absolute = Math.abs(deltaMinutes);
  return `${label} ${prefix}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

function buildFlightCode(leg: RotationDashboardData["legs"][number]) {
  const carrierCode = typeof leg.carrier === "string" ? leg.carrier.toUpperCase() : "";
  const normalizedFlight =
    typeof leg.flightNumber === "string" ? leg.flightNumber.toUpperCase() : String(leg.flightNumber ?? "TBD");
  return `${carrierCode && !normalizedFlight.startsWith(carrierCode) ? carrierCode : ""}${normalizedFlight}`;
}

function isReturnToGateLeg(leg: RotationDashboardData["legs"][number]) {
  return leg.segmentType === "return_to_gate" || (!leg.isDeadhead && leg.origin === leg.destination);
}

function getSnapshotLegs(snapshot: TripWatchRotationSnapshot | null | undefined) {
  return Array.isArray(snapshot?.legs) ? snapshot.legs : [];
}

export function getDutyDateKey(leg: RotationDashboardData["legs"][number]) {
  const dayLabel = leg.dayLabel?.toUpperCase().trim();
  if (dayLabel && /^\d{2}[A-Z]{3}$/.test(dayLabel)) {
    return dayLabel;
  }
  const sourceDate = leg.sourceText?.toUpperCase().match(/\b(\d{2}[A-Z]{3})\b/)?.[1];
  if (sourceDate) {
    return sourceDate;
  }
  return null;
}

export function groupLegsByDate(snapshot: TripWatchRotationSnapshot) {
  const grouped = new Map<string, RotationDashboardData["legs"]>();
  for (const leg of getSnapshotLegs(snapshot)) {
    const dateKey = getDutyDateKey(leg);
    if (!dateKey) {
      continue;
    }
    const existing = grouped.get(dateKey) ?? [];
    existing.push(leg);
    grouped.set(dateKey, existing);
  }
  return grouped;
}

export function sumOperatingBlockByDate(snapshot: TripWatchRotationSnapshot) {
  const grouped = groupLegsByDate(snapshot);
  const sums = new Map<string, number>();
  grouped.forEach((legs, dateKey) => {
    const total = legs
      .filter((leg) => !leg.isDeadhead)
      .reduce((sum, leg) => sum + (leg.scheduledBlockMinutes ?? 0), 0);
    sums.set(dateKey, total);
  });
  return sums;
}

function canBuildReliableDailyRows(snapshot: TripWatchRotationSnapshot) {
  const operatingLegs = getSnapshotLegs(snapshot).filter((leg) => !leg.isDeadhead);
  return operatingLegs.length > 0 && operatingLegs.every((leg) => Boolean(getDutyDateKey(leg)));
}

export function buildPayWatchSummary(
  baselineSnapshot: TripWatchRotationSnapshot | null | undefined,
  updatedSnapshot: TripWatchRotationSnapshot | null | undefined,
  comparisonResult: TripWatchComparisonResult | null | undefined,
): PayWatchSummary {
  if (!comparisonResult || comparisonResult.status !== "ok") {
    return EMPTY_PAY_WATCH_SUMMARY;
  }

  const summaryItems = [
    formatDelta("Credit", comparisonResult.creditDeltaMinutes),
    formatDelta("Op block", comparisonResult.operatingBlockDeltaMinutes),
    formatDelta("DH block", comparisonResult.dhBlockDeltaMinutes),
    formatDelta("TAFB", comparisonResult.tafbDeltaMinutes),
  ].filter((item): item is string => Boolean(item));

  const addedLegSummaries = new Set(Array.isArray(comparisonResult.addedLegs) ? comparisonResult.addedLegs : []);
  const updatedLegs = getSnapshotLegs(updatedSnapshot);
  const rtgAddedItems = updatedLegs
    .filter((leg) => isReturnToGateLeg(leg) && addedLegSummaries.has(formatTripWatchLegSummary(leg)))
    .map((leg) => `RTG added: ${leg.origin}-${leg.destination} ${buildFlightCode(leg)} · Block ${formatMinutes(leg.scheduledBlockMinutes)}`);

  let dailyRows: PayWatchDailyRow[] = [];
  if (
    baselineSnapshot &&
    updatedSnapshot &&
    canBuildReliableDailyRows(baselineSnapshot) &&
    canBuildReliableDailyRows(updatedSnapshot)
  ) {
    const baselineByDate = sumOperatingBlockByDate(baselineSnapshot);
    const updatedByDate = sumOperatingBlockByDate(updatedSnapshot);
    const orderedDates = Array.from(new Set([...baselineByDate.keys(), ...updatedByDate.keys()]));
    dailyRows = orderedDates
      .map((dateKey) => {
        const baselineMinutes = baselineByDate.get(dateKey) ?? 0;
        const updatedMinutes = updatedByDate.get(dateKey) ?? 0;
        const protectedBaselineMinutes = Math.max(DELTA_DAILY_MINIMUM_MINUTES, baselineMinutes);
        const estimatedDayDeltaMinutes =
          Math.max(protectedBaselineMinutes, updatedMinutes) - protectedBaselineMinutes;
        return {
          dateKey,
          protectedBaselineMinutes,
          updatedBlockMinutes: updatedMinutes,
          estimatedDayDeltaMinutes,
        };
      })
      .filter((row) => row.estimatedDayDeltaMinutes !== 0);
  }

  const recommendedItems = Array.from(
    new Set(
      [
        summaryItems.length > 0 || rtgAddedItems.length > 0 ? "Pay impact check recommended" : null,
        summaryItems.length > 0 ? "Credit/block changed" : null,
        summaryItems.length > 0 || rtgAddedItems.length > 0 ? "Review Pay Audit" : null,
      ].filter((item): item is string => Boolean(item)),
    ),
  );

  const hasContent =
    summaryItems.length > 0 ||
    rtgAddedItems.length > 0 ||
    dailyRows.length > 0;

  if (!hasContent) {
    return {
      ...EMPTY_PAY_WATCH_SUMMARY,
      recommendedItems,
    };
  }

  return {
    hasContent,
    summaryItems,
    rtgAddedItems,
    dailyRows,
    recommendedItems,
  };
}
