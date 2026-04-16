export type ParsedDeltaTimecard = {
  bidPeriod: string | null;
  employeeNumber: string | null;
  pilotName: string | null;
  categoryCode: string | null;
  scheduleStatus: "lineholder" | "reserve" | null;
  alv: string | null;
  totalCredit: string | null;
  creditApplicableToRegGs: string | null;
  regGsTrigger: string | null;
  gsSlipPay: string | null;
  silverSlipPay: string | null;
  quickSlipPay: string | null;
  reserveAssignGqSlipPay: string | null;
  reroutePay: string | null;
  pbsPrPay: string | null;
  sickEntries: number;
  sickBankDeduction: string | null;
  paybackDaysAvailable: number | null;
  authorizedPersonalDrop: string | null;
  vacationDaysAvailable: number | null;
  vacationTimeIn: string | null;
  vacationCreditUsed: string | null;
  additionalPayOnlyTotal: string | null;
  premiumHoursTotal: number;
};

const EMPTY_RESULT: ParsedDeltaTimecard = {
  bidPeriod: null,
  employeeNumber: null,
  pilotName: null,
  categoryCode: null,
  scheduleStatus: null,
  alv: null,
  totalCredit: null,
  creditApplicableToRegGs: null,
  regGsTrigger: null,
  gsSlipPay: null,
  silverSlipPay: null,
  quickSlipPay: null,
  reserveAssignGqSlipPay: null,
  reroutePay: null,
  pbsPrPay: null,
  sickEntries: 0,
  sickBankDeduction: null,
  paybackDaysAvailable: null,
  authorizedPersonalDrop: null,
  vacationDaysAvailable: null,
  vacationTimeIn: null,
  vacationCreditUsed: null,
  additionalPayOnlyTotal: null,
  premiumHoursTotal: 0,
};

export function parseDeltaTimecard(rawText: string): ParsedDeltaTimecard | null {
  const cleaned = rawText.replace(/\r/g, "");
  if (!cleaned.trim()) {
    return null;
  }

  const gsSlipPay = captureTime(cleaned, /G\/SLIP PAY\s*:\s*([0-9]{1,3}:\d{2})/i);
  const silverSlipPay = captureTime(cleaned, /S\/SLIP PAY\s*:\s*([0-9]{1,3}:\d{2})/i);
  const quickSlipPay = captureTime(cleaned, /IA\/Q-SLIP PAY\s*:\s*([0-9]{1,3}:\d{2})/i);
  const reserveAssignGqSlipPay = captureTime(
    cleaned,
    /RES ASSIGN-G\/Q SLIP PAY\s*:\s*([0-9]{1,3}:\d{2})/i
  );
  const reserveEntries = countMatches(cleaned, /^\s*\d{2}[A-Z]{3}\s+RES\b/gim);
  const regularEntries = countMatches(cleaned, /^\s*\d{2}[A-Z]{3}\s+REG\b/gim);
  const sickEntries = countMatches(cleaned, /^\s*\d{2}[A-Z]{3}\s+(?:REG|RES)\s+SICK\b/gim);
  const dailyMetrics = summarizeDailyTimecardRows(cleaned);
  const bankValues = captureTimes(
    cleaned,
    /TEMP\s+IN\s+BANK\s+BANK\s+ADJ\s+IN\s+BANK\s+ALV\s+([0-9]{1,3}:\d{2})\s+([0-9]{1,3}:\d{2})\s+([0-9]{1,3}:\d{2})\s+([0-9]{1,3}:\d{2})/i
  );
  const summaryCreditValues = captureTimes(
    cleaned,
    /TTL\s+CREDIT\s+([0-9]{1,3}:\d{2})\s+BANK\s+OPT\s+1\s+LIMIT\s+([0-9]{1,3}:\d{2})/i
  );
  const creditBreakdownValues = captureTimes(
    cleaned,
    /([0-9]{1,3}:\d{2})\s*\+\s*([0-9]{1,3}:\d{2})\s*\+\s*([0-9]{1,3}:\d{2})\s*=\s*([0-9]{1,3}:\d{2})\s*-\s*([0-9]{1,3}:\d{2})\s*\+\s*([0-9]{1,3}:\d{2})\s*=\s*([0-9]{1,3}:\d{2})\s*([0-9]{1,3}:\d{2})/i
  );
  const scheduleStatus =
    reserveEntries > regularEntries
      ? "reserve"
      : regularEntries > 0
        ? "lineholder"
        : null;

  return {
    bidPeriod: captureText(cleaned, /BID PERIOD:\s*([^\n]+)/i),
    employeeNumber: captureText(cleaned, /EMP NBR:?\s*([0-9]+)/i),
    pilotName: captureText(cleaned, /NAME:\s*([^\n]+)/i),
    categoryCode: captureText(cleaned, /\b([A-Z]{3}\s+[0-9A-Z]{3,4}\s+[AB])\b/i),
    scheduleStatus,
    alv: bankValues?.[3] ?? captureText(cleaned, /ALV\s+([0-9]{1,3}:\d{2})/i),
    totalCredit:
      summaryCreditValues?.[0] ??
      creditBreakdownValues?.[6] ??
      captureTime(cleaned, /(?:SUB\s+TTL|TTL)\s+CREDIT\s+([0-9]{1,3}:\d{2})/i),
    creditApplicableToRegGs: captureTime(
      cleaned,
      /CREDIT APPLICABLE TO REG G\/S SLIP PAY:\s*([0-9]{1,3}:\d{2})/i
    ),
    regGsTrigger: captureTime(cleaned, /REG G\/S TRIGGER:\s*([0-9]{1,3}:\d{2})/i),
    gsSlipPay,
    silverSlipPay,
    quickSlipPay,
    reserveAssignGqSlipPay,
    reroutePay: captureTime(cleaned, /REROUTE PAY\s*:\s*([0-9]{1,3}:\d{2})/i),
    pbsPrPay: captureTime(cleaned, /PBS\/PR PAY\s*:\s*([0-9]{1,3}:\d{2})/i),
    sickEntries,
    sickBankDeduction: captureTime(
      cleaned,
      /SICK BANK DEDUCTION[^:\n]*:\s*-?\s*([0-9]{1,3}:\d{2})/i
    ),
    paybackDaysAvailable: captureNumber(
      cleaned,
      /NBR PAYBACK DAYS AVAILABLE FOR USE:\s*([0-9]+)/i
    ),
    authorizedPersonalDrop: captureText(
      cleaned,
      /AUTHORIZED PERSONAL DROP AVAILABLE FOR USE:\s*([A-Z])/i
    ),
    vacationDaysAvailable: captureNumber(
      cleaned,
      /INDIVIDUAL VACATION DAYS AVAILABLE:\s*([0-9]+)/i
    ),
    vacationTimeIn:
      captureTime(cleaned, /VAC TIME IN[\s\S]{0,120}?\n\s*([0-9]{1,3}:\d{2})/i) ??
      captureTime(cleaned, /VAC TIME IN\s+([0-9]{1,3}:\d{2})/i),
    vacationCreditUsed: dailyMetrics.vacationCreditUsed,
    additionalPayOnlyTotal: dailyMetrics.additionalPayOnlyTotal,
    premiumHoursTotal:
      parseTimeValue(gsSlipPay) +
      parseTimeValue(silverSlipPay) +
      parseTimeValue(quickSlipPay) +
      parseTimeValue(reserveAssignGqSlipPay),
  };
}

export function parseTimeValue(value: string | null): number {
  if (!value) {
    return 0;
  }
  const match = value.match(/^(\d+):(\d{2})$/);
  if (!match) {
    return 0;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours + minutes / 60;
}

function captureText(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function captureTime(text: string, pattern: RegExp): string | null {
  return captureText(text, pattern);
}

function captureNumber(text: string, pattern: RegExp): number | null {
  const value = captureText(text, pattern);
  return value ? Number(value) : null;
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function captureTimes(text: string, pattern: RegExp): string[] | null {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  return match.slice(1).map((value) => value.trim());
}

function summarizeDailyTimecardRows(text: string) {
  const lines = text.split("\n");
  let vacationCreditUsedHours = 0;
  let additionalPayOnlyHours = 0;

  for (const line of lines) {
    if (!/^\s*\d{2}[A-Z]{3}\b/.test(line)) {
      continue;
    }

    const times = [...line.matchAll(/(\d{1,3}:\d{2})/g)].map((match) => match[1]);
    if (times.length === 0) {
      continue;
    }

    if (/\bVAC\b/i.test(line)) {
      vacationCreditUsedHours += parseTimeValue(times[times.length - 1] ?? null);
    }

    if (times.length >= 5) {
      additionalPayOnlyHours += parseTimeValue(times[times.length - 1] ?? null);
    }
  }

  return {
    vacationCreditUsed:
      vacationCreditUsedHours > 0 ? formatHoursToTime(vacationCreditUsedHours) : null,
    additionalPayOnlyTotal:
      additionalPayOnlyHours > 0 ? formatHoursToTime(additionalPayOnlyHours) : null,
  };
}

function formatHoursToTime(value: number) {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

export { EMPTY_RESULT as emptyParsedDeltaTimecard };
