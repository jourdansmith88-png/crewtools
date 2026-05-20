import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";

export type RotationDutyPeriodSummary = {
  dateKey: string;
  reportTime?: string;
  reportTimeSource: "rotation_report_time" | "first_leg_departure";
  firstOperatingDeparture?: string;
  lastOperatingArrival?: string;
  dutyEndTime?: string;
  dutySpanMinutes?: number;
  operatingBlockMinutes: number;
  deadheadBlockMinutes: number;
  rtgBlockMinutes: number;
  pwaFdpUsedMinutes?: number;
  pwaScheduledMaxFdpMinutes?: number;
  pwaActualMaxFdpMinutes?: number;
  pwaLimitSource?: "icrew_pwa_fdp_line";
  legCount: number;
  operatingLegCount: number;
  deadheadLegCount: number;
  rtgLegCount: number;
  operatingLegs: RotationDashboardData["legs"];
  deadheadLegs: RotationDashboardData["legs"];
  rtgLegs: RotationDashboardData["legs"];
};

function parseClockMinutes(value?: string | null) {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) {
    return null;
  }
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function normalizeClock(value?: string | null) {
  const digits = value?.replace(/\D/g, "");
  if (!digits || digits.length < 4) {
    return undefined;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function isReturnToGateLeg(leg: RotationDashboardData["legs"][number]) {
  return leg.segmentType === "return_to_gate" || (!leg.isDeadhead && leg.origin === leg.destination);
}

function compareByDeparture(left: RotationDashboardData["legs"][number], right: RotationDashboardData["legs"][number]) {
  return (parseClockMinutes(left.departureTime) ?? 0) - (parseClockMinutes(right.departureTime) ?? 0);
}

export function buildDutyPeriodsFromRotationLegs(args: {
  legs: RotationDashboardData["legs"];
  rotationReportTime?: string;
  pwaDutyLimitsByDate?: Array<{
    dateKey?: string;
    pwaFdpUsedMinutes?: number;
    pwaScheduledMaxFdpMinutes?: number;
    pwaActualMaxFdpMinutes?: number;
    pwaLimitSource?: "icrew_pwa_fdp_line";
  }>;
}): RotationDutyPeriodSummary[] {
  const legs = Array.isArray(args.legs) ? [...args.legs] : [];
  const grouped = new Map<string, RotationDashboardData["legs"]>();
  const pwaByDate = new Map(
    (args.pwaDutyLimitsByDate ?? [])
      .filter((item) => Boolean(item.dateKey))
      .map((item) => [item.dateKey!.trim().toUpperCase(), item] as const),
  );

  legs.forEach((leg) => {
    const dateKey = leg.dayLabel?.trim() || "UNKNOWN";
    const bucket = grouped.get(dateKey) ?? [];
    bucket.push(leg);
    grouped.set(dateKey, bucket);
  });

  return Array.from(grouped.entries()).map(([dateKey, dayLegs], index) => {
    const orderedLegs = [...dayLegs].sort(compareByDeparture);
    const operatingLegs = orderedLegs.filter((leg) => !leg.isDeadhead && !isReturnToGateLeg(leg));
    const deadheadLegs = orderedLegs.filter((leg) => leg.isDeadhead || leg.segmentType === "deadhead");
    const rtgLegs = orderedLegs.filter((leg) => !leg.isDeadhead && isReturnToGateLeg(leg));

    const reportTime =
      index === 0 && normalizeClock(args.rotationReportTime)
        ? normalizeClock(args.rotationReportTime)
        : normalizeClock(orderedLegs[0]?.departureTime);
    const reportTimeSource =
      index === 0 && normalizeClock(args.rotationReportTime) ? "rotation_report_time" : "first_leg_departure";
    const dutyEndTime = normalizeClock(orderedLegs.at(-1)?.arrivalTime);
    const reportMinutes = parseClockMinutes(reportTime);
    let dutySpanMinutes: number | undefined;
    const dutyEndMinutes = parseClockMinutes(dutyEndTime);
    if (reportMinutes != null && dutyEndMinutes != null) {
      dutySpanMinutes = dutyEndMinutes >= reportMinutes ? dutyEndMinutes - reportMinutes : dutyEndMinutes + 24 * 60 - reportMinutes;
    }

    const pwa = pwaByDate.get(dateKey.trim().toUpperCase());
    return {
      dateKey,
      reportTime,
      reportTimeSource,
      firstOperatingDeparture: normalizeClock(operatingLegs[0]?.departureTime),
      lastOperatingArrival: normalizeClock(operatingLegs.at(-1)?.arrivalTime),
      dutyEndTime,
      dutySpanMinutes,
      operatingBlockMinutes: operatingLegs.reduce((sum, leg) => sum + (leg.scheduledBlockMinutes ?? 0), 0),
      deadheadBlockMinutes: deadheadLegs.reduce((sum, leg) => sum + (leg.scheduledBlockMinutes ?? 0), 0),
      rtgBlockMinutes: rtgLegs.reduce((sum, leg) => sum + (leg.scheduledBlockMinutes ?? 0), 0),
      pwaFdpUsedMinutes: pwa?.pwaFdpUsedMinutes,
      pwaScheduledMaxFdpMinutes: pwa?.pwaScheduledMaxFdpMinutes,
      pwaActualMaxFdpMinutes: pwa?.pwaActualMaxFdpMinutes,
      pwaLimitSource: pwa?.pwaLimitSource,
      legCount: orderedLegs.length,
      operatingLegCount: operatingLegs.length,
      deadheadLegCount: deadheadLegs.length,
      rtgLegCount: rtgLegs.length,
      operatingLegs,
      deadheadLegs,
      rtgLegs,
    };
  });
}
