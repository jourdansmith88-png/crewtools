export type DutyEvent = {
  date: string;
  tripId?: string;
  eventType:
    | "rotation"
    | "pickup"
    | "drop"
    | "gs"
    | "sick"
    | "vacation"
    | "training"
    | "reserve"
    | "deadhead";
  startTime?: string;
  endTime?: string;
  credit?: number;
  notes?: string[];
};

export type PayLineItem = {
  code: string;
  label: string;
  amount: number;
  hours?: number;
  source: "expected" | "actual";
};

export type AuditContext = {
  airline: "DL";
  contractVersion: string;
  base: string;
  fleet: string;
  seat: "FO" | "CA";
  longevityYear: number;
  month: string;
  reserveStatus: boolean;
};

export type PayAuditInputs = {
  hourlyRate: number;
  creditedHours: number;
  premiumHours: number;
  premiumType: "none" | "green-slip" | "silver-slip" | "quick-slip" | "inverse-assignment";
  tafbHours: number;
  missedBreakPay: number;
  actualBasePay: number;
  actualPremiumPay: number;
  actualPerDiem: number;
  actualAdjustments: number;
  actualPostedTotal: number;
};

export type AuditFinding = {
  id: string;
  severity: "info" | "warning" | "high";
  title: string;
  expectedAmount?: number;
  actualAmount?: number;
  variance?: number;
  explanation: string;
  ruleRef: string;
  confidence: "high" | "medium" | "low";
};

export type PayAuditResult = {
  expectedItems: PayLineItem[];
  actualItems: PayLineItem[];
  expectedTotal: number;
  actualTotal: number;
  variance: number;
  findings: AuditFinding[];
  assumptions: string[];
};

const LINEHOLDER_GUARANTEE_HOURS = 65;
const RESERVE_GUARANTEE_FLOOR_HOURS = 72;
const PER_DIEM_RATE = 2.85;
const PREMIUM_MULTIPLIER = 2;

export function buildPayAuditContext(input: {
  base: string;
  fleet: string;
  seat: "FO" | "CA";
  longevityYear: number;
  reserveStatus: boolean;
  month: string;
}): AuditContext {
  return {
    airline: "DL",
    contractVersion: "2026.1",
    ...input,
  };
}

export function buildPayAuditResult(
  context: AuditContext,
  inputs: PayAuditInputs
): PayAuditResult {
  const guaranteeHours = context.reserveStatus
    ? RESERVE_GUARANTEE_FLOOR_HOURS
    : LINEHOLDER_GUARANTEE_HOURS;
  const expectedBaseHours = Math.max(inputs.creditedHours, guaranteeHours);
  const expectedBasePay = inputs.hourlyRate * expectedBaseHours;
  const expectedPremiumPay =
    inputs.premiumType === "none"
      ? 0
      : inputs.hourlyRate * PREMIUM_MULTIPLIER * inputs.premiumHours;
  const expectedPerDiem = inputs.tafbHours * PER_DIEM_RATE;
  const expectedMissedBreak = inputs.missedBreakPay;

  const expectedItems: PayLineItem[] = [
    {
      code: "BASE",
      label: context.reserveStatus ? "Reserve guarantee/base pay" : "Lineholder guarantee/base pay",
      amount: expectedBasePay,
      hours: expectedBaseHours,
      source: "expected" as const,
    },
    {
      code: "PREM",
      label:
        inputs.premiumType === "none"
          ? "Premium pay"
          : `${formatPremiumType(inputs.premiumType)} premium pay`,
      amount: expectedPremiumPay,
      hours: inputs.premiumHours,
      source: "expected" as const,
    },
    {
      code: "PERDIEM",
      label: "Per diem",
      amount: expectedPerDiem,
      source: "expected" as const,
    },
    {
      code: "MBRK",
      label: "Missed break / manual premium",
      amount: expectedMissedBreak,
      source: "expected" as const,
    },
  ].filter((item) => item.amount !== 0);

  const actualItems: PayLineItem[] = [
    {
      code: "BASE_ACT",
      label: "Posted base pay",
      amount: inputs.actualBasePay,
      source: "actual" as const,
    },
    {
      code: "PREM_ACT",
      label: "Posted premium pay",
      amount: inputs.actualPremiumPay,
      source: "actual" as const,
    },
    {
      code: "PERDIEM_ACT",
      label: "Posted per diem",
      amount: inputs.actualPerDiem,
      source: "actual" as const,
    },
    {
      code: "ADJ_ACT",
      label: "Posted adjustments",
      amount: inputs.actualAdjustments,
      source: "actual" as const,
    },
  ].filter((item) => item.amount !== 0);

  const expectedTotal = expectedItems.reduce((sum, item) => sum + item.amount, 0);
  const computedActualTotal = actualItems.reduce((sum, item) => sum + item.amount, 0);
  const actualTotal = inputs.actualPostedTotal > 0 ? inputs.actualPostedTotal : computedActualTotal;
  const variance = actualTotal - expectedTotal;
  const reconciliationExpectedTotal = expectedBasePay + expectedPremiumPay;
  const reconciliationActualTotal = inputs.actualBasePay + inputs.actualPremiumPay;
  const reconciliationVariance = reconciliationActualTotal - reconciliationExpectedTotal;
  const findings: AuditFinding[] = [];

  if (
    inputs.actualBasePay > 0 &&
    inputs.creditedHours < guaranteeHours &&
    inputs.actualBasePay + 1 < expectedBasePay
  ) {
    findings.push({
      id: "guarantee-shortfall",
      severity: "high",
      title: "Possible guarantee shortfall",
      expectedAmount: expectedBasePay,
      actualAmount: inputs.actualBasePay,
      variance: inputs.actualBasePay - expectedBasePay,
      explanation: `Credited hours were ${inputs.creditedHours.toFixed(
        1
      )}, below the ${guaranteeHours}-hour ${
        context.reserveStatus ? "reserve" : "lineholder"
      } guarantee. Posted base pay is below the expected guarantee-based amount.`,
      ruleRef: context.reserveStatus ? "DL.RESERVE.GUARANTEE" : "DL.LINEHOLDER.GUARANTEE",
      confidence: "high",
    });
  }

  if (inputs.premiumType !== "none" && inputs.premiumHours > 0 && inputs.actualPremiumPay <= 0) {
    findings.push({
      id: "missing-premium",
      severity: "high",
      expectedAmount: expectedPremiumPay,
      actualAmount: inputs.actualPremiumPay,
      variance: inputs.actualPremiumPay - expectedPremiumPay,
      title: "Possible missing premium",
      explanation: `The audit expects ${formatPremiumType(inputs.premiumType)} pay for ${inputs.premiumHours.toFixed(
        1
      )} hours at ${PREMIUM_MULTIPLIER.toFixed(2)}x, but no posted premium pay was entered.`,
      ruleRef: "DL.PREMIUM.MISSING",
      confidence: "high",
    });
  }

  if (
    inputs.premiumType !== "none" &&
    inputs.premiumHours > 0 &&
    inputs.actualPremiumPay > 0 &&
    Math.abs(inputs.actualPremiumPay - expectedPremiumPay) > 25
  ) {
    findings.push({
      id: "premium-rate-mismatch",
      severity: "warning",
      title: "Premium pay may be at the wrong rate",
      expectedAmount: expectedPremiumPay,
      actualAmount: inputs.actualPremiumPay,
      variance: inputs.actualPremiumPay - expectedPremiumPay,
      explanation: `${formatPremiumType(
        inputs.premiumType
      )} was modeled at ${PREMIUM_MULTIPLIER.toFixed(2)}x for ${inputs.premiumHours.toFixed(
        1
      )} hours, but the posted premium amount does not reconcile to that rate.`,
      ruleRef: "DL.PREMIUM.RATE",
      confidence: inputs.premiumType === "inverse-assignment" ? "low" : "medium",
    });
  }

  if (inputs.actualPerDiem > 0 && Math.abs(inputs.actualPerDiem - expectedPerDiem) > 25) {
    findings.push({
      id: "per-diem-variance",
      severity: "warning",
      title: "Per diem does not reconcile",
      expectedAmount: expectedPerDiem,
      actualAmount: inputs.actualPerDiem,
      variance: inputs.actualPerDiem - expectedPerDiem,
      explanation: `Expected per diem based on ${inputs.tafbHours.toFixed(
        2
      )} TAFB hours differs from the posted per diem amount that was entered for comparison.`,
      ruleRef: "DL.PERDIEM.CHECK",
      confidence: "medium",
    });
  }

  if ((inputs.actualBasePay > 0 || inputs.actualPostedTotal > 0) && Math.abs(reconciliationVariance) > 50) {
    findings.push({
      id: "total-variance",
      severity: Math.abs(reconciliationVariance) > 300 ? "high" : "warning",
      title: "Total pay variance",
      expectedAmount: reconciliationExpectedTotal,
      actualAmount: reconciliationActualTotal,
      variance: reconciliationVariance,
      explanation: `Timecard-comparable pay differs by ${formatSignedCurrency(
        reconciliationVariance
      )}. This check compares base pay and premium pay only, and intentionally leaves estimated per diem and other off-timecard extras out of the mismatch.`,
      ruleRef: "DL.RECON.TOTAL",
      confidence: "medium",
    });
  }

  if (inputs.actualPostedTotal > 0 && Math.abs(inputs.actualPostedTotal - computedActualTotal) > 25) {
    findings.push({
      id: "posted-vs-line-items",
      severity: "info",
      title: "Posted total does not match entered line items",
      expectedAmount: computedActualTotal,
      actualAmount: inputs.actualPostedTotal,
      variance: inputs.actualPostedTotal - computedActualTotal,
      explanation:
        "The entered posted total differs from the entered actual line items. That usually means there is another adjustment, deduction, or classification not yet captured.",
      ruleRef: "DL.INPUT.REVIEW",
      confidence: "high",
    });
  }

  const assumptions = [
    context.reserveStatus
      ? `Reserve guarantee currently modeled at the 72-hour floor from Section 4 C.1. Actual reserve guarantee can float higher with ALV and category specifics.`
      : "Regular line guarantee currently modeled at 65 hours from Section 4 B.1.",
    `Per diem modeled at $${PER_DIEM_RATE.toFixed(2)}/hour TAFB`,
    inputs.premiumType === "none"
      ? "No premium event selected for this audit pass."
      : `${formatPremiumType(inputs.premiumType)} is being tested at the Delta 2.00x premium rate.`,
    "Missed break input treated as manual premium / adjustment",
    "This MVP audits summary pay lines, not full trip-by-trip payroll yet",
    "First Delta-specific rule targets are reroute pay, payback days, premium events, sick/pickup interactions, and leave/guarantee logic.",
  ];

  return {
    expectedItems,
    actualItems,
    expectedTotal,
    actualTotal,
    variance,
    findings,
    assumptions,
  };
}

function formatSignedCurrency(value: number) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return `${value >= 0 ? "+" : "-"}${formatter.format(Math.abs(value))}`;
}

function formatPremiumType(value: PayAuditInputs["premiumType"]) {
  switch (value) {
    case "green-slip":
      return "Green Slip";
    case "silver-slip":
      return "Silver Slip";
    case "quick-slip":
      return "Quick Slip";
    case "inverse-assignment":
      return "Inverse Assignment";
    default:
      return "Premium";
  }
}
