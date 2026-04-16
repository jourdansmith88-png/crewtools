import { SeniorityRow } from "../data/mockSeniority";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function computePayAudit(
  hourlyRate: number,
  creditedHours: number,
  premiumHours: number,
  tafbHours: number,
  missedBreakPay: number
) {
  const basePay = hourlyRate * creditedHours;
  const premiumPay = hourlyRate * 2 * premiumHours;
  const perDiem = tafbHours * 2.85;
  const totalExpected = basePay + premiumPay + perDiem + missedBreakPay;

  return {
    basePay,
    premiumPay,
    perDiem,
    totalExpected,
  };
}

export function computeTripHealth(
  blockHours: number,
  dutyHours: number,
  layoverHours: number,
  legs: number
) {
  const productivity = dutyHours === 0 ? 0 : blockHours / dutyHours;
  const fatigueIndex = layoverHours < 10 ? 78 : layoverHours < 12 ? 52 : 28;
  const complexity = clamp(legs * 11 + dutyHours * 2, 0, 100);

  return {
    productivity,
    fatigueIndex,
    complexity,
    recommendation:
      fatigueIndex > 70
        ? "High fatigue risk. Flag for reroute or pay-protection review."
        : productivity > 0.58
          ? "Efficient pairing with good utilization."
          : "Moderate pairing. Check soft time and report margins.",
  };
}

export function evaluateSeniorityFit(
  record: SeniorityRow,
  userPercentile: number
) {
  const totalSeats =
    record.seniorBucket + record.middleBucket + record.juniorBucket;
  const bucketScore =
    userPercentile <= 33
      ? record.juniorBucket
      : userPercentile <= 66
        ? record.middleBucket
        : record.seniorBucket;

  const seatAccessScore = totalSeats === 0 ? 0 : (bucketScore / totalSeats) * 100;
  const recommendation =
    seatAccessScore > 42
      ? "Strong seat access for your current seniority band."
      : seatAccessScore > 28
        ? "Competitive but workable. Keep this as a live option."
        : "Likely a stretch unless movement improves.";

  return {
    seatAccessScore,
    recommendation,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
