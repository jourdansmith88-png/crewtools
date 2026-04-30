export type ParsedRotationLeg = {
  id: string;
  legNumber: number;
  dayNumber: number;
  departureAirport: string;
  arrivalAirport: string;
  flightNumber?: string;
  reportTime?: string;
  scheduledOut?: string;
  scheduledIn?: string;
  scheduledBlock?: number;
  turnAfterPreviousLeg?: number;
  status: "normal" | "tight_turn" | "watch" | "placeholder";
  isDeadhead?: boolean;
  legKind?: "operating" | "deadhead";
  gate?: string;
  equipmentShip?: string;
  confirmationNumber?: string;
  carrier?: string;
  sourceText?: string;
  makeUpMinutes?: number;
  turnSource?: "verified_turn_field" | "safe_schedule_derived" | "unknown";
  hasInboundSegment?: boolean;
  deadheadSource?: "t_column" | "explicit_label" | "micrew_context" | "unknown";
};

export type ParsedRotationDutyPeriod = {
  dayNumber: number;
  date?: string;
  reportTime?: string;
  releaseTime?: string;
  scheduledRest?: number;
  scheduledBlock: number;
  scheduledFdp: number;
  fdpLimit: number;
  fdpMargin: number;
  status: "Good" | "Watch" | "At Risk" | "Likely Timeout" | "Needs full duty period details";
};

export type ParsedRotation = {
  rotationNumber?: string;
  startDate?: string;
  endDate?: string;
  reportTime?: string;
  releaseTime?: string;
  totalCredit?: number;
  totalScheduledBlock?: number;
  deadheadBlock?: number;
  excludedDeadheadLegs: number;
  layoverCities: string[];
  dutyPeriods: ParsedRotationDutyPeriod[];
  legs: ParsedRotationLeg[];
  isPartial: boolean;
  sourceTypes: "text" | "screenshots" | "mixed";
  visibleLegCount: number;
  missingSections: string[];
  partialReason: string | null;
  parseConfidence: "high" | "medium" | "low";
  sourceFormat: "micrew_mobile" | "icrew_printout" | "unknown";
  parserPath: "micrew_mobile_parser" | "icrew_printout_parser" | "generic_parser";
  rowFormat: "icrew_without_mu" | "icrew_with_mu" | "unknown";
  parserWarnings: string[];
  rejectedCandidateRows: string[];
  micrewLegsParsed: number;
  icrewRowsParsed: number;
};

export type RotationLeg = {
  id: string;
  dayLabel: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime?: string;
  arrivalTime?: string;
  scheduledBlockMinutes?: number;
  actualOut?: string;
  actualIn?: string;
  actualBlockMinutes?: number;
  turnMinutes?: number;
  status: "on_time" | "watch" | "tight_turn" | "placeholder";
  aircraft?: string;
  gate?: string;
  isDeadhead?: boolean;
  legKind?: "operating" | "deadhead";
  deadheadSource?: ParsedRotationLeg["deadheadSource"];
  confirmationNumber?: string;
  carrier?: string;
  sourceText?: string;
  excludeFromLogbookExport?: boolean;
};

export type RotationSnapshot = {
  tripDates: string;
  rotationNumber: string;
  totalCreditMinutes: number;
  scheduledBlockMinutes: number;
  legCount: number;
  layoverCities: string[];
  finalArrival: string;
};

export type RotationWhatMattersCard = {
  label: string;
  tone: "good" | "watch" | "risk";
  detail: string;
};

export type RotationDutyDay = {
  label: string;
  scheduledBlockMinutes: number;
  scheduledFdpMinutes: number;
  fdpLimitMinutes: number;
  marginMinutes: number;
  status: "Good" | "Watch" | "At Risk" | "Likely Timeout";
};

export type RotationDashboardData = {
  snapshot: RotationSnapshot;
  legs: RotationLeg[];
  nextLeg?: RotationLeg;
  whatMatters: RotationWhatMattersCard[];
  dutyDays: RotationDutyDay[];
  tonightLayoverCity: string;
  tomorrowReportTime?: string;
  scheduledRestMinutes?: number;
  note?: string;
  source: "parsed" | "mock";
  parsedRotation: ParsedRotation;
};

export type RotationParseResult =
  | {
      ok: true;
      parsedRotation: ParsedRotation;
      dashboard: RotationDashboardData;
    }
  | {
      ok: false;
      error: string;
    };

export const SAMPLE_ROTATION_TEXT = [
  "ROT 4821 29APR-01MAY",
  "Day 1",
  "DL833 SLC-BUR Dep- 0715 Arr- 0916 Blk- 2:01",
  "DL498 BUR-ATL Dep- 1015 Arr- 1714 Blk- 4:19",
  "LAYOVER: ATL",
  "Day 2",
  "DL1682 ATL-IAH Dep- 0830 Arr- 1043 Blk- 2:13",
  "DL1532 IAH-SLC Dep- 1210 Arr- 1525 Blk- 3:15",
  "Credit- 12:23",
].join("\n");

export const ROTATION_PARSER_FIXTURES = {
  micrewPartialMobile: [
    "LAYOVER: SLC",
    "Rest- 14:47",
    "",
    "DL2502 : SLC-IAH",
    "Rpt- 0645 29APR",
    "Dep- 0745 29APR",
    "Arr- 1147 29APR +1hr",
    "Blk- 3:02/Turn- 0:38",
    "Gate- A40",
    "Eqp/Ship- 221/8128",
  ].join("\n"),
  icrewPrintoutFull: [
    "*** ROTATION OPER",
    "CHECK IN AT 0856",
    "ACTUAL REPORT TIME 0856/29",
    "DAY FLT T DEPARTS ARRIVES C BLK M/U TURN M EQP",
    "A 833 SLC 1045 BUR 1148 2.03 3.01 0.45 * 223",
    "A 498 BUR 1449 ATL 2208 4.19 0.10 1.02 * 321",
    "29 D1682 ATL 0956 IAH 1109 * 2.13 0.05 1.16 321",
    "B 1532 IAH 1225 SLC 1440 3.15 * 221",
    "ATL 10.18/MARRIOTT ATL APT 4.19BL",
    "PWA FDP/SKD MAX/ACT MAX 10.23/13.00/16.00",
    "REST CLASS- 14.00/16.00/ 9.00",
    "PAY REPORT TIME 0856/29",
  ].join("\n"),
  icrewOfficialWithoutMu: [
    "*** ROTATION OPER",
    "CHECK IN AT 0615",
    "DAY FLT T DEPARTS ARRIVES C BLK TURN M EQP",
    "A 833 SLC 0715 BUR 0916 2.01 0.45 * 320",
    "A 498 BUR 1015 ATL 1714 4.19 1.02 * 321",
    "B 1682 ATL 0956 IAH 1109 * 2.13 1.16 * 321",
    "B 1532 IAH 1225 SLC 1440 3.15 * 221",
    "IAH 11.49/CCA ATG BOOK ROOMS",
    "PWA FDP/SKD MAX/ACT MAX 10.23/13.00/16.00",
    "PAY REPORT TIME 0615/29",
  ].join("\n"),
  icrewPrintoutCropped: [
    "DAY FLT T DEPARTS ARRIVES C BLK M/U TURN M EQP",
    "29 D1682 ATL 0956 IAH 1109 * 2.13 0.05 1.16 321",
    "B 1532 IAH 1225 SLC 1440 3.15 * 221",
  ].join("\n"),
  nonRotationAccounting: [
    "REGULAR",
    "RESERVE",
    "TAFB",
    "HOL",
    "CARVE",
    "SIT",
    "EDP",
    "3.18BL",
    "3.18TL",
    "6.20DHD",
    "BANK",
    "VACATION",
    "GREEN SLIP",
  ].join("\n"),
} as const;

function parseHourMinute(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDotOrColonDuration(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2})[.:](\d{2})/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDateToken(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2})([A-Z]{3})/i);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  const monthOrder: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };
  const month = monthOrder[match[2].toUpperCase()];
  if (!month) {
    return undefined;
  }
  return month * 100 + Number(match[1]);
}

function extractDateTokens(rawText: string) {
  return Array.from(rawText.matchAll(/\b(\d{1,2}[A-Z]{3})\b/gi))
    .map((match) => match[1]?.toUpperCase())
    .filter((item): item is string => Boolean(item));
}

function parseFourDigitTime(value?: string) {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(":", "").padStart(4, "0");
  const hours = Number(normalized.slice(0, 2));
  const minutes = Number(normalized.slice(2));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return undefined;
  }
  return hours * 60 + minutes;
}

function formatMinutes(value?: number) {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function formatTime(value?: string) {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(":", "").padStart(4, "0");
  return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
}

function normalizeTripDates(startDate?: string, endDate?: string) {
  if (startDate && endDate) {
    return `${startDate} - ${endDate}`;
  }
  if (startDate) {
    return startDate;
  }
  return "Trip dates TBD";
}

function computeLegTurns(legs: ParsedRotationLeg[]) {
  return legs.map((leg, index) => {
    if (leg.turnAfterPreviousLeg != null && leg.turnSource === "verified_turn_field") {
      const verifiedStatus =
        leg.turnAfterPreviousLeg < 45 ? "tight_turn" : leg.turnAfterPreviousLeg < 60 ? "watch" : leg.status;
      return {
        ...leg,
        status: verifiedStatus,
      };
    }
    if (index === 0) {
      return leg;
    }
    const previous = legs[index - 1]!;
    if (previous.dayNumber !== leg.dayNumber) {
      return leg;
    }
    const previousIn = parseFourDigitTime(previous.scheduledIn);
    const currentOut = parseFourDigitTime(leg.scheduledOut);
    if (previousIn == null || currentOut == null) {
      return leg;
    }
    const turnAfterPreviousLeg = Math.max(0, currentOut - previousIn);
    const status =
      turnAfterPreviousLeg < 45
        ? "tight_turn"
        : turnAfterPreviousLeg < 60
          ? "watch"
          : leg.status;
    return {
      ...leg,
      turnAfterPreviousLeg,
      turnSource: "safe_schedule_derived",
      status,
    };
  });
}

function detectRotationSourceFormat(rawText: string) {
  const micrewClues = [
    /LAYOVER:/i,
    /Rest-/i,
    /(?:D\s+)?DL?\d+\s*:\s*[A-Z]{3}-[A-Z]{3}/i,
    /Rpt-/i,
    /Dep-/i,
    /Arr-/i,
    /Blk-/i,
    /Eqp\/Ship-/i,
    /Confirmation\s*#/i,
  ];
  const icrewClues = [
    /\*\*\*\s*ROTATION\s+OPER/i,
    /EFFECTIVE/i,
    /CHECK\s*IN\s*AT/i,
    /ACTUAL\s+REPORT\s+TIME/i,
    /DAY\s+FLT\s+T\s+DEPARTS\s+ARRIVES\s+C\s+BLK(?:\s+M\/U)?\s+TURN/i,
    /PWA\s+FDP\/SKD\s+MAX\/ACT\s+MAX/i,
    /PAY\s+REPORT\s+TIME/i,
    /\b(?:TL|BL|DHD)\b/i,
  ];
  const micrewScore = micrewClues.filter((pattern) => pattern.test(rawText)).length;
  const icrewScore = icrewClues.filter((pattern) => pattern.test(rawText)).length;
  if (icrewScore > micrewScore && icrewScore >= 2) {
    return "icrew_printout" as const;
  }
  if (micrewScore > 0) {
    return "micrew_mobile" as const;
  }
  return "unknown" as const;
}

function hasContinuousRouteChain(legs: ParsedRotationLeg[]) {
  if (legs.length < 2) {
    return legs.length === 1;
  }
  for (let index = 1; index < legs.length; index += 1) {
    const previous = legs[index - 1];
    const current = legs[index];
    if (!previous || !current) {
      return false;
    }
    if (previous.arrivalAirport !== current.departureAirport) {
      return false;
    }
  }
  return true;
}

type RotationParseAccumulator = {
  layoverCities: string[];
  layoverRestByDay: Map<number, number>;
  legs: ParsedRotationLeg[];
  parserWarnings: string[];
  rejectedCandidateRows: string[];
  micrewLegsParsed: number;
  icrewRowsParsed: number;
  currentDay: number;
  rowFormat: ParsedRotation["rowFormat"];
};

function createAccumulator(): RotationParseAccumulator {
  return {
    layoverCities: [],
    layoverRestByDay: new Map<number, number>(),
    legs: [],
    parserWarnings: [],
    rejectedCandidateRows: [],
    micrewLegsParsed: 0,
    icrewRowsParsed: 0,
    currentDay: 1,
    rowFormat: "unknown",
  };
}

function parseMicrewLines(lines: string[], accumulator: RotationParseAccumulator) {
  let currentLegIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const dayMatch = line.match(/^day\s+(\d+)/i);
    if (dayMatch?.[1]) {
      accumulator.currentDay = Number(dayMatch[1]);
      continue;
    }

    const layoverMatch = line.match(/LAYOVER:\s*([A-Z]{3})/i);
    if (layoverMatch?.[1]) {
      accumulator.layoverCities.push(layoverMatch[1].toUpperCase());
      const restMatch = line.match(/Rest-\s*(\d{1,2}):(\d{2})/i);
      if (restMatch) {
        accumulator.layoverRestByDay.set(
          accumulator.currentDay + 1,
          Number(restMatch[1]) * 60 + Number(restMatch[2]),
        );
      }
      accumulator.currentDay += 1;
      continue;
    }

    const standaloneRestMatch = line.match(/Rest-\s*(\d{1,2}):(\d{2})/i);
    if (standaloneRestMatch) {
      accumulator.layoverRestByDay.set(
        accumulator.currentDay,
        Number(standaloneRestMatch[1]) * 60 + Number(standaloneRestMatch[2]),
      );
    }

    const legMatch = line.match(/(?:\bD\s+)?(?:DL)?(\d{2,4})\s*[: ]\s*([A-Z]{3})-([A-Z]{3})/i);
    if (legMatch) {
      const out = line.match(/(?:Dep|Out)-\s*(\d{3,4})/i)?.[1];
      const inputArrival = line.match(/(?:Arr|In)-\s*(\d{3,4})/i)?.[1];
      const reportMatch = line.match(/Rpt-\s*(\d{3,4})(?:\s+\d{1,2}[A-Z]{3})?/i)?.[1];
      const blockMatch = line.match(/Blk-\s*(\d{1,2}):(\d{2})/i);
      const turnMatch = line.match(/Turn-\s*(\d{1,2}):(\d{2})/i);
      const gateMatch = line.match(/Gate-\s*([A-Z0-9]+)/i)?.[1];
      const equipmentMatch = line.match(/Eqp\/Ship-\s*([A-Z0-9/]+)/i)?.[1];
      const confirmationMatch = line.match(/Confirmation\s*#([A-Z0-9]+)/i)?.[1];
      const scheduledBlock = blockMatch ? Number(blockMatch[1]) * 60 + Number(blockMatch[2]) : undefined;
      const turnAfterPreviousLeg = turnMatch ? Number(turnMatch[1]) * 60 + Number(turnMatch[2]) : undefined;
      const isDeadhead = /^\s*D\s+/.test(line) || /\bDH\b|\bdeadhead\b/i.test(line);
      accumulator.legs.push({
        id: `${legMatch[1]}-${legMatch[2]}-${legMatch[3]}-${index}`,
        legNumber: accumulator.legs.length + 1,
        dayNumber: accumulator.currentDay,
        departureAirport: legMatch[2].toUpperCase(),
        arrivalAirport: legMatch[3].toUpperCase(),
        flightNumber: `DL${legMatch[1]}`,
        reportTime: reportMatch,
        scheduledOut: out,
        scheduledIn: inputArrival,
        scheduledBlock,
        turnAfterPreviousLeg,
        turnSource: turnAfterPreviousLeg != null ? "verified_turn_field" : undefined,
        status: "normal",
        isDeadhead: /\b(?:DH|DHD|DEADHEAD)\b/i.test(line),
        deadheadSource: /\b(?:DH|DHD|DEADHEAD)\b/i.test(line) ? "micrew_context" : undefined,
        gate: gateMatch,
        equipmentShip: equipmentMatch,
        confirmationNumber: confirmationMatch,
      });
      accumulator.micrewLegsParsed += 1;
      currentLegIndex = accumulator.legs.length - 1;
      continue;
    }

    if (currentLegIndex >= 0) {
      const leg = accumulator.legs[currentLegIndex]!;
      const reportMatch = line.match(/Rpt-\s*(\d{3,4})(?:\s+\d{1,2}[A-Z]{3})?/i)?.[1];
      const out = line.match(/(?:Dep|Out)-\s*(\d{3,4})(?:\s+\d{1,2}[A-Z]{3})?(?:\s*\+\d+hr)?/i)?.[1];
      const inputArrival = line.match(/(?:Arr|In)-\s*(\d{3,4})(?:\s+\d{1,2}[A-Z]{3})?(?:\s*\+\d+hr)?/i)?.[1];
      const blockMatch = line.match(/Blk-\s*(\d{1,2}):(\d{2})/i);
      const turnMatch = line.match(/Turn-\s*(\d{1,2}):(\d{2})/i);
      const gateMatch = line.match(/Gate-\s*([A-Z0-9]+)/i)?.[1];
      const equipmentMatch = line.match(/Eqp\/Ship-\s*([A-Z0-9/]+)/i)?.[1];
      const confirmationMatch = line.match(/Confirmation\s*#([A-Z0-9]+)/i)?.[1];
      if (reportMatch) leg.reportTime = reportMatch;
      if (out) leg.scheduledOut = out;
      if (inputArrival) leg.scheduledIn = inputArrival;
      if (blockMatch) leg.scheduledBlock = Number(blockMatch[1]) * 60 + Number(blockMatch[2]);
      if (turnMatch) {
        leg.turnAfterPreviousLeg = Number(turnMatch[1]) * 60 + Number(turnMatch[2]);
        leg.turnSource = "verified_turn_field";
      }
      if (gateMatch) leg.gate = gateMatch;
      if (equipmentMatch) leg.equipmentShip = equipmentMatch;
      if (confirmationMatch) leg.confirmationNumber = confirmationMatch;
    }
  }
}

function alphaDayToNumber(value: string) {
  const upper = value.toUpperCase();
  if (/^\d+$/.test(upper)) {
    return Number(upper);
  }
  if (/^[A-Z]$/.test(upper)) {
    return upper.charCodeAt(0) - 64;
  }
  return undefined;
}

function detectICrewRowFormatFromHeader(line: string): ParsedRotation["rowFormat"] {
  if (/DAY\s+FLT\s+T\s+DEPARTS\s+ARRIVES\s+C\s+BLK\s+M\/U\s+TURN\s+M\s+EQP/i.test(line)) {
    return "icrew_with_mu";
  }
  if (/DAY\s+FLT\s+T\s+DEPARTS\s+ARRIVES\s+C\s+BLK\s+TURN\s+M\s+EQP/i.test(line)) {
    return "icrew_without_mu";
  }
  return "unknown";
}

function looksLikeAccountingLine(line: string) {
  return (
    /^\d+[.:]\d{2}(?:BL|TL|DHD)$/i.test(line.trim()) ||
    /^(?:TAFB|HOL|CARVE|SIT|EDP|REGULAR|RESERVE|BANK|VACATION|G-?SLIP|GREEN SLIP)\b/i.test(line.trim())
  );
}

function parseICrewRow(
  line: string,
  rowFormat: ParsedRotation["rowFormat"],
  rowFormatInferred: boolean,
) {
  const trimmed = line.trim();
  if (!/^(?:\d{1,2}|[A-Z])\s+/.test(trimmed)) {
    return null;
  }
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 7) {
    return null;
  }

  const dayNumber = alphaDayToNumber(tokens[0]!);
  if (!Number.isFinite(dayNumber)) {
    return null;
  }

  let cursor = 1;
  let flightToken = tokens[cursor];
  const maybeTypeToken = tokens[cursor + 1];
  const hasExplicitDeadheadLabel = /\b(?:DHD|DEADHEAD)\b/i.test(trimmed);
  if (!flightToken) {
    return null;
  }
  if (/^D\d{2,4}$/i.test(flightToken)) {
    flightToken = flightToken.slice(1);
  }
  if (!flightToken || !/^\d{2,4}$/i.test(flightToken)) {
    return null;
  }
  const typeTokenLooksAligned = Boolean(maybeTypeToken && /^[A-Z*]+$/i.test(maybeTypeToken));
  const deadheadFromTypeColumn = maybeTypeToken === "D";
  const ambiguousDeadheadSpacing =
    rowFormatInferred &&
    !typeTokenLooksAligned &&
    /\bD\s+\d{2,4}\s+[A-Z]{3}\s+\d{3,4}\s+[A-Z]{3}\s+\d{3,4}/i.test(trimmed);
  if (typeTokenLooksAligned) {
    cursor += 1;
  }
  cursor += 1;

  const departureAirport = tokens[cursor];
  const scheduledOut = tokens[cursor + 1];
  const arrivalAirport = tokens[cursor + 2];
  const scheduledIn = tokens[cursor + 3];
  if (
    !departureAirport ||
    !scheduledOut ||
    !arrivalAirport ||
    !scheduledIn ||
    !/^[A-Z]{3}$/i.test(departureAirport) ||
    !/^\d{3,4}$/.test(scheduledOut) ||
    !/^[A-Z]{3}$/i.test(arrivalAirport) ||
    !/^\d{3,4}$/.test(scheduledIn)
  ) {
    return null;
  }
  cursor += 4;

  let continuationMarker: string | undefined;
  if (tokens[cursor] && tokens[cursor] === "*") {
    continuationMarker = tokens[cursor];
    cursor += 1;
  }

  const blockToken = tokens[cursor];
  const scheduledBlock = parseDotOrColonDuration(blockToken);
  if (scheduledBlock == null) {
    return null;
  }
  cursor += 1;

  const remaining = tokens.slice(cursor);
  const equipmentCandidate = remaining.at(-1);
  const equipmentShip = equipmentCandidate && /^[A-Z0-9]{2,4}$/.test(equipmentCandidate) ? equipmentCandidate : undefined;
  const withoutEquipment = equipmentShip ? remaining.slice(0, -1) : remaining;
  const markerTokens = withoutEquipment.filter((token) => /^[A-Z*]+$/.test(token));
  const durationTokens = withoutEquipment.filter((token) => parseDotOrColonDuration(token) != null);

  let makeUpMinutes: number | undefined;
  let turnAfterPreviousLeg: number | undefined;
  let turnSource: ParsedRotationLeg["turnSource"];
  if (rowFormat === "icrew_with_mu" && durationTokens.length >= 2) {
    makeUpMinutes = parseDotOrColonDuration(durationTokens[0]);
    turnAfterPreviousLeg = parseDotOrColonDuration(durationTokens[1]);
    turnSource = turnAfterPreviousLeg != null ? "verified_turn_field" : undefined;
  } else if (rowFormat === "icrew_with_mu" && durationTokens.length === 1) {
    makeUpMinutes = parseDotOrColonDuration(durationTokens[0]);
    turnSource = "unknown";
  } else if (rowFormat === "icrew_without_mu" && durationTokens.length >= 1) {
    turnAfterPreviousLeg = parseDotOrColonDuration(durationTokens[0]);
    turnSource = turnAfterPreviousLeg != null ? "verified_turn_field" : undefined;
  } else if (rowFormat === "unknown" && durationTokens.length >= 2) {
    makeUpMinutes = parseDotOrColonDuration(durationTokens[0]);
    turnAfterPreviousLeg = parseDotOrColonDuration(durationTokens[1]);
    turnSource = turnAfterPreviousLeg != null ? "verified_turn_field" : undefined;
  } else if (rowFormat === "unknown" && durationTokens.length === 1) {
    turnAfterPreviousLeg = parseDotOrColonDuration(durationTokens[0]);
    turnSource = "unknown";
  }

  return {
    dayNumber,
    flightNumber: `DL${flightToken}`,
    departureAirport: departureAirport.toUpperCase(),
    scheduledOut,
    arrivalAirport: arrivalAirport.toUpperCase(),
    scheduledIn,
    continuationMarker,
    scheduledBlock,
    makeUpMinutes,
    turnAfterPreviousLeg,
    turnSource,
    equipmentShip,
    isDeadhead: Boolean(deadheadFromTypeColumn || hasExplicitDeadheadLabel),
    deadheadSource: deadheadFromTypeColumn ? "t_column" : hasExplicitDeadheadLabel ? "explicit_label" : "unknown",
    hasInboundSegment: Boolean(continuationMarker),
    uncertainColumns: [
      ...(rowFormatInferred ? [`iCrew row format inferred without header: ${trimmed}`] : []),
      ...(rowFormat === "icrew_with_mu" && durationTokens.length === 1
        ? [`Single post-BLK duration treated as M/U, not TURN: ${trimmed}`]
        : []),
      ...(rowFormat === "unknown" ? ["iCrew row format could not be confirmed from header."] : []),
      ...(ambiguousDeadheadSpacing
        ? [
            `Deadhead detection left off because a "D" appeared in an ambiguous position without clear T-column alignment: ${trimmed}`,
          ]
        : []),
      ...(markerTokens.some((token) => token === "*") ? [] : []),
    ],
  };
}

function parseICrewLines(lines: string[], rawText: string, accumulator: RotationParseAccumulator) {
  let currentLegIndex = -1;
  const rejected: string[] = [];
  let sawHeader = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const rowFormatFromHeader = detectICrewRowFormatFromHeader(line);
    if (rowFormatFromHeader !== "unknown") {
      accumulator.rowFormat = rowFormatFromHeader;
      sawHeader = true;
      accumulator.parserWarnings.push(`iCrew printout row parser active (${rowFormatFromHeader}).`);
      continue;
    }
    if (looksLikeAccountingLine(line)) {
      continue;
    }

    const row = parseICrewRow(line, accumulator.rowFormat, !sawHeader);
    if (row) {
      accumulator.legs.push({
        id: `${row.flightNumber}-${row.departureAirport}-${row.arrivalAirport}-${index}`,
        legNumber: accumulator.legs.length + 1,
        dayNumber: row.dayNumber,
        departureAirport: row.departureAirport,
        arrivalAirport: row.arrivalAirport,
        flightNumber: row.flightNumber,
        scheduledOut: row.scheduledOut,
        scheduledIn: row.scheduledIn,
        scheduledBlock: row.scheduledBlock,
        turnAfterPreviousLeg: row.turnAfterPreviousLeg,
        turnSource: row.turnSource,
        makeUpMinutes: row.makeUpMinutes,
        status: "normal",
        isDeadhead: row.isDeadhead,
        equipmentShip: row.equipmentShip,
        hasInboundSegment: row.hasInboundSegment,
      });
      accumulator.icrewRowsParsed += 1;
      accumulator.currentDay = row.dayNumber;
      currentLegIndex = accumulator.legs.length - 1;
      accumulator.parserWarnings.push(...row.uncertainColumns);
      continue;
    }

    const layoverHotelMatch = line.match(/^([A-Z]{3})\s+(\d{1,2}[.:]\d{2})\/(.+)$/i);
    if (layoverHotelMatch?.[1]) {
      accumulator.layoverCities.push(layoverHotelMatch[1].toUpperCase());
      continue;
    }

    const restClassMatch = line.match(/REST\s+CLASS-\s*([\d.]+\/[\d.]+\/\s*[\d.]+)/i);
    if (restClassMatch?.[1]) {
      accumulator.parserWarnings.push(`REST CLASS ${restClassMatch[1]} detected.`);
      continue;
    }

    const pwaFdpMatch = line.match(/PWA\s+FDP\/SKD\s+MAX\/ACT\s+MAX\s+([0-9./]+)/i);
    if (pwaFdpMatch?.[1]) {
      accumulator.parserWarnings.push(`PWA FDP/SKD MAX/ACT MAX ${pwaFdpMatch[1]} detected.`);
      continue;
    }

    const payReportMatch = line.match(/PAY\s+REPORT\s+TIME\s+(\d{3,4})(?:\/\d{1,2})?/i);
    if (payReportMatch?.[1] && accumulator.legs[0]) {
      accumulator.legs[0]!.reportTime = payReportMatch[1];
      continue;
    }

    if (/^(?:\d{1,2}|[A-Z])\s+/.test(line) && /[A-Z]{3}/.test(line) && !looksLikeAccountingLine(line)) {
      rejected.push(line);
    }

    if (currentLegIndex >= 0) {
      const leg = accumulator.legs[currentLegIndex]!;
      const confirmationMatch = line.match(/Confirmation\s*#([A-Z0-9]+)/i)?.[1];
      if (confirmationMatch) {
        leg.confirmationNumber = confirmationMatch;
      }
    }
  }

  accumulator.rejectedCandidateRows.push(...rejected);
  if (rejected.length > 0) {
    accumulator.parserWarnings.push(`${rejected.length} iCrew candidate rows were rejected due to uncertain columns.`);
  }

  if (/PWA\s+FDP\/SKD\s+MAX\/ACT\s+MAX/i.test(rawText) && accumulator.legs.length > 0) {
    accumulator.parserWarnings.push("iCrew legality lines detected.");
  }
  if (!sawHeader && accumulator.icrewRowsParsed > 0) {
    accumulator.parserWarnings.push("iCrew row format was inferred because no header was visible.");
  }
}

function buildDutyPeriods(
  legs: ParsedRotationLeg[],
  fallbackStartDate?: string,
  layoverRestByDay?: Map<number, number>,
): ParsedRotationDutyPeriod[] {
  const byDay = new Map<number, ParsedRotationLeg[]>();
  legs.forEach((leg) => {
    const current = byDay.get(leg.dayNumber) ?? [];
    current.push(leg);
    byDay.set(leg.dayNumber, current);
  });

  return Array.from(byDay.entries()).map(([dayNumber, dayLegs], index) => {
    const scheduledBlock = dayLegs.reduce((sum, leg) => sum + (leg.scheduledBlock ?? 0), 0);
    const firstOut = parseFourDigitTime(dayLegs[0]?.reportTime ?? dayLegs[0]?.scheduledOut);
    const lastIn = parseFourDigitTime(dayLegs.at(-1)?.scheduledIn);
    const hasCompleteDutyTiming = firstOut != null && lastIn != null && scheduledBlock > 0;
    const scheduledFdp =
      hasCompleteDutyTiming && firstOut != null && lastIn != null
        ? Math.max(scheduledBlock, lastIn - firstOut + 45)
        : scheduledBlock > 0
          ? scheduledBlock + 90
          : 0;
    const fdpLimit = index === 0 ? 13 * 60 : 12 * 60 + 30;
    const fdpMargin = fdpLimit - scheduledFdp;
    const status = !hasCompleteDutyTiming
      ? "Needs full duty period details"
      : fdpMargin <= 0
        ? "Likely Timeout"
        : fdpMargin < 30
          ? "At Risk"
          : fdpMargin < 60
            ? "Watch"
            : "Good";
    return {
      dayNumber,
      date: fallbackStartDate,
      reportTime: dayLegs[0]?.reportTime ?? dayLegs[0]?.scheduledOut,
      releaseTime: dayLegs.at(-1)?.scheduledIn,
      scheduledRest: layoverRestByDay?.get(dayNumber),
      scheduledBlock,
      scheduledFdp,
      fdpLimit,
      fdpMargin,
      status,
    };
  });
}

function buildWhatMatters(parsed: ParsedRotation, dutyPeriods: ParsedRotationDutyPeriod[]) {
  const cards: RotationWhatMattersCard[] = [];
  const tightTurn = parsed.legs.find(
    (leg) =>
      !leg.isDeadhead &&
      (leg.turnSource === "verified_turn_field" || leg.turnSource === "safe_schedule_derived") &&
      (leg.turnAfterPreviousLeg ?? 999) < 45,
  );
  if (tightTurn) {
    cards.push({
      label: "Tight turn",
      tone: "risk",
      detail: `${tightTurn.departureAirport}-${tightTurn.arrivalAirport} follows a ${formatMinutes(tightTurn.turnAfterPreviousLeg) ?? "short"} turn (${tightTurn.turnSource}).`,
    });
  }
  const farWatch = dutyPeriods.find((period) => period.fdpMargin < 60);
  if (farWatch) {
    cards.push({
      label: "FAR 117 watch",
      tone: farWatch.fdpMargin < 30 ? "risk" : "watch",
      detail: `Day ${farWatch.dayNumber} is within ${formatMinutes(Math.max(0, farWatch.fdpMargin)) ?? "0:00"} of the FDP limit.`,
    });
  }
  const restPressure = parsed.layoverCities.length > 0 && dutyPeriods.length > 1;
  if (restPressure) {
    const restMinutes =
      (() => {
        const firstRelease = parseFourDigitTime(dutyPeriods[0]?.releaseTime);
        const nextReport = parseFourDigitTime(dutyPeriods[1]?.reportTime);
        if (firstRelease == null || nextReport == null) {
          return undefined;
        }
        return nextReport >= firstRelease ? nextReport - firstRelease : 24 * 60 - firstRelease + nextReport;
      })();
    if (restMinutes != null && restMinutes < 12 * 60) {
      cards.push({
        label: "Rest pressure",
        tone: "watch",
        detail: `The layover into Day 2 appears short at about ${formatMinutes(restMinutes) ?? "TBD"}.`,
      });
    }
  }
  const pressureDay = dutyPeriods.find((period) => {
    const dayLegs = parsed.legs.filter((leg) => leg.dayNumber === period.dayNumber);
    return (
      dayLegs.length >= 3 &&
      dayLegs.some(
        (leg) =>
          !leg.isDeadhead &&
          (leg.turnSource === "verified_turn_field" || leg.turnSource === "safe_schedule_derived") &&
          (leg.turnAfterPreviousLeg ?? 999) < 60,
      )
    );
  });
  if (pressureDay) {
    cards.push({
      label: "Pressure day",
      tone: "watch",
      detail: `Day ${pressureDay.dayNumber} has multiple legs with compressed turns.`,
    });
  }
  const deadheadConnectionRisk = parsed.legs.find(
    (leg) =>
      leg.isDeadhead &&
      (leg.turnSource === "verified_turn_field" || leg.turnSource === "safe_schedule_derived") &&
      (leg.turnAfterPreviousLeg ?? 999) < 45,
  );
  if (deadheadConnectionRisk) {
    cards.push({
      label: "Deadhead connection risk",
      tone: "watch",
      detail: `${deadheadConnectionRisk.departureAirport}-${deadheadConnectionRisk.arrivalAirport} has only ${formatMinutes(deadheadConnectionRisk.turnAfterPreviousLeg) ?? "short"} between segments.`,
    });
  }
  if (cards.length === 0) {
    cards.push({
      label: "No major issues found",
      tone: "good",
      detail: "Nothing obvious is flagged from the scheduled trip shape yet.",
    });
  }
  return cards;
}

function mapParsedLegToDashboardLeg(leg: ParsedRotationLeg): RotationLeg {
  return {
    id: leg.id,
    dayLabel: `Day ${leg.dayNumber}`,
    flightNumber: leg.flightNumber ?? "TBD",
    origin: leg.departureAirport,
    destination: leg.arrivalAirport,
    departureTime: formatTime(leg.scheduledOut),
    arrivalTime: formatTime(leg.scheduledIn),
    scheduledBlockMinutes: leg.scheduledBlock,
    turnMinutes:
      leg.turnSource === "verified_turn_field" || leg.turnSource === "safe_schedule_derived"
        ? leg.turnAfterPreviousLeg
        : undefined,
    status:
      leg.status === "tight_turn"
        ? "tight_turn"
        : leg.status === "watch"
          ? "watch"
          : "on_time",
    aircraft: leg.equipmentShip ?? "Airbus",
    gate: leg.gate ?? "TBD",
    isDeadhead: leg.isDeadhead,
    legKind: leg.isDeadhead ? "deadhead" : "operating",
    deadheadSource: leg.deadheadSource,
    confirmationNumber: leg.confirmationNumber,
    carrier: leg.carrier,
    sourceText: leg.sourceText,
    excludeFromLogbookExport: Boolean(leg.isDeadhead),
  };
}

export function parseRotationText(
  rawText: string,
  options?: {
    sourceTypes?: ParsedRotation["sourceTypes"];
    screenshotsAttached?: number;
  },
): ParsedRotation {
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rotationNumber =
    rawText.match(/\b(?:ROT|Rotation)\s*#?\s*([A-Z0-9-]+)/i)?.[1] ??
    rawText.match(/\*\*\*\s*ROTATION\s+OPER\s+([A-Z0-9-]+)/i)?.[1] ??
    rawText.match(/\b\d{1,2}[A-Z]{3}\s+[A-Z]{3}\s+(\d{3,5})\b/i)?.[1];
  const dateMatch = rawText.match(/\b(\d{1,2}[A-Z]{3})\s*-\s*(\d{1,2}[A-Z]{3})\b/i);
  const visibleDateTokens = extractDateTokens(rawText);
  const sortedVisibleDateTokens = [...visibleDateTokens].sort(
    (left, right) => (parseDateToken(left) ?? 99999) - (parseDateToken(right) ?? 99999),
  );
  const startDate = dateMatch?.[1]?.toUpperCase() ?? sortedVisibleDateTokens[0];
  const endDate = dateMatch?.[2]?.toUpperCase() ?? sortedVisibleDateTokens.at(-1);
  const totalCredit = parseHourMinute(rawText.match(/\b(?:Credit|Cr)\s*[-: ]\s*(\d{1,2}:\d{2})/i)?.[1]);
  const reportTime = formatTime(
    rawText.match(/\b(?:Report|Rpt)\s*[-: ]\s*(\d{3,4})/i)?.[1] ??
      rawText.match(/CHECK\s*IN\s*AT\s*(\d{3,4})/i)?.[1] ??
      rawText.match(/ACTUAL\s+REPORT\s+TIME\s*(\d{3,4})/i)?.[1] ??
      rawText.match(/PAY\s+REPORT\s+TIME\s*(\d{3,4})/i)?.[1],
  );
  const releaseTime = formatTime(rawText.match(/\b(?:Release|Rel|Rls)\s*[-: ]\s*(\d{3,4})/i)?.[1]);

  const sourceFormat = detectRotationSourceFormat(rawText);
  const parserPath =
    sourceFormat === "icrew_printout"
      ? "icrew_printout_parser"
      : sourceFormat === "micrew_mobile"
        ? "micrew_mobile_parser"
        : "generic_parser";
  const accumulator = createAccumulator();
  if (sourceFormat === "icrew_printout") {
    parseICrewLines(lines, rawText, accumulator);
  } else {
    parseMicrewLines(lines, accumulator);
  }

  const normalizedLegs = computeLegTurns(accumulator.legs);
  const dutyPeriods = buildDutyPeriods(normalizedLegs, startDate, accumulator.layoverRestByDay);
  const totalScheduledBlock =
    normalizedLegs.reduce((sum, leg) => sum + (leg.isDeadhead ? 0 : leg.scheduledBlock ?? 0), 0);
  const deadheadBlock =
    normalizedLegs.reduce((sum, leg) => sum + (leg.isDeadhead ? leg.scheduledBlock ?? 0 : 0), 0);
  const excludedDeadheadLegs = normalizedLegs.filter((leg) => leg.isDeadhead).length;
  const missingSections: string[] = [];
  const hasICrewHeader =
    /\*\*\*\s*ROTATION\s+OPER/i.test(rawText) ||
    /CHECK\s*IN\s*AT/i.test(rawText) ||
    /ACTUAL\s+REPORT\s+TIME/i.test(rawText);
  const hasICrewDutyContext =
    /PWA\s+FDP\/SKD\s+MAX\/ACT\s+MAX/i.test(rawText) ||
    /PAY\s+REPORT\s+TIME/i.test(rawText) ||
    /\b(?:TL|BL|DHD)\b/i.test(rawText);
  if (totalCredit == null && sourceFormat !== "icrew_printout") {
    missingSections.push("total credit");
  }
  if (totalScheduledBlock <= 0) {
    missingSections.push("total scheduled block");
  }
  if (!reportTime && !normalizedLegs.some((leg) => leg.reportTime || leg.scheduledOut)) {
    missingSections.push("first report time");
  }
  if (!releaseTime && !normalizedLegs.some((leg) => leg.scheduledIn)) {
    missingSections.push("final release time");
  }
  if (
    dutyPeriods.some((period) => period.status === "Needs full duty period details") &&
    !(sourceFormat === "icrew_printout" && hasICrewDutyContext && normalizedLegs.length > 0)
  ) {
    missingSections.push("full duty periods");
  }
  if (accumulator.layoverCities.length === 0) {
    missingSections.push("complete layover list");
  }
  const visibleLegCount = normalizedLegs.length;
  const distinctDayCount = new Set(normalizedLegs.map((leg) => leg.dayNumber)).size;
  const hasContinuousLegOrder = hasContinuousRouteChain(normalizedLegs);
  const screenshotsAttached = options?.screenshotsAttached ?? 0;
  const sourceTypes =
    options?.sourceTypes ??
    (screenshotsAttached > 0 && rawText.trim() ? "mixed" : screenshotsAttached > 0 ? "screenshots" : "text");
  const hasLikelyFullICrewPrintout =
    sourceFormat === "icrew_printout" &&
    normalizedLegs.length > 0 &&
    (hasICrewHeader || /DAY\s+FLT\s+T\s+DEPARTS/i.test(rawText)) &&
    hasICrewDutyContext &&
    accumulator.rejectedCandidateRows.length === 0;
  const hasLikelyFullMiCrewRotation =
    sourceFormat === "micrew_mobile" &&
    ((Boolean(startDate && endDate) &&
      distinctDayCount >= 2 &&
      normalizedLegs.length >= 4 &&
      Boolean(normalizedLegs[0]?.scheduledOut || normalizedLegs[0]?.reportTime) &&
      Boolean(normalizedLegs.at(-1)?.scheduledIn) &&
      accumulator.rejectedCandidateRows.length === 0) ||
      (hasContinuousLegOrder &&
        distinctDayCount >= 2 &&
        normalizedLegs.length >= 4 &&
        Boolean(normalizedLegs[0]?.scheduledOut || normalizedLegs[0]?.reportTime) &&
        Boolean(normalizedLegs.at(-1)?.scheduledIn) &&
        (accumulator.layoverCities.length > 0 || Boolean(reportTime && releaseTime) || totalCredit != null) &&
        accumulator.rejectedCandidateRows.length === 0));
  const explicitTruncation =
    accumulator.rejectedCandidateRows.length > 0 ||
    /cropped|cut off|truncated/i.test(rawText);
  const isPartial =
    sourceFormat === "icrew_printout"
      ? !hasLikelyFullICrewPrintout || explicitTruncation
      : sourceFormat === "micrew_mobile"
        ? (!hasLikelyFullMiCrewRotation && missingSections.length > 0) || explicitTruncation
      : missingSections.length > 0;
  const parseConfidence =
    sourceFormat === "icrew_printout"
      ? normalizedLegs.length >= 4 && hasLikelyFullICrewPrintout
        ? "high"
        : normalizedLegs.length >= 2
          ? "medium"
          : "low"
      : visibleLegCount >= 4 && missingSections.length <= 2
        ? "high"
        : visibleLegCount >= 2
          ? "medium"
          : "low";
  const partialReason =
    isPartial
      ? sourceFormat === "icrew_printout"
        ? "Partial rotation detected. This iCrew printout appears cropped or is missing enough duty context that the full trip cannot be confirmed."
        : screenshotsAttached > 0 && !rawText.trim()
          ? "Screenshots are attached, but this screen still needs pasted trip text to build a full rotation."
          : "Partial rotation detected. We found visible legs, but earlier or later parts of the trip may be missing."
      : null;

  return {
    rotationNumber,
    startDate,
    endDate,
    reportTime,
    releaseTime,
    totalCredit,
    totalScheduledBlock,
    deadheadBlock,
    excludedDeadheadLegs,
    layoverCities: accumulator.layoverCities,
    dutyPeriods,
    legs: normalizedLegs,
    isPartial,
    sourceTypes,
    visibleLegCount,
    missingSections,
    partialReason,
    parseConfidence,
    sourceFormat,
    parserPath,
    rowFormat: accumulator.rowFormat,
    parserWarnings: accumulator.parserWarnings,
    rejectedCandidateRows: accumulator.rejectedCandidateRows,
    micrewLegsParsed: accumulator.micrewLegsParsed,
    icrewRowsParsed: accumulator.icrewRowsParsed,
  };
}

export function buildRotationDashboardData(rawInput: string): RotationDashboardData {
  const trimmed = rawInput.trim();
  const sourceText = trimmed.length > 0 ? trimmed : SAMPLE_ROTATION_TEXT;
  const source: "parsed" | "mock" = trimmed.length > 0 ? "parsed" : "mock";
  const parsedRotation = parseRotationText(sourceText);
  const legs = parsedRotation.legs.map(mapParsedLegToDashboardLeg);
  const dutyDays = parsedRotation.dutyPeriods.map((period) => ({
    label: `Day ${period.dayNumber}`,
    scheduledBlockMinutes: period.scheduledBlock,
    scheduledFdpMinutes: period.scheduledFdp,
    fdpLimitMinutes: period.fdpLimit,
    marginMinutes: period.fdpMargin,
    status: period.status,
  }));
  const whatMatters = buildWhatMatters(parsedRotation, parsedRotation.dutyPeriods);
  const nextLeg = legs[0];
  const scheduledRestMinutes =
    parsedRotation.dutyPeriods.length > 1
      ? (() => {
          const release = parseFourDigitTime(parsedRotation.dutyPeriods[0]?.releaseTime);
          const nextReport = parseFourDigitTime(parsedRotation.dutyPeriods[1]?.reportTime);
          if (release == null || nextReport == null) {
            return undefined;
          }
          return nextReport >= release ? nextReport - release : 24 * 60 - release + nextReport;
        })()
      : undefined;

  return {
    snapshot: {
      tripDates: normalizeTripDates(parsedRotation.startDate, parsedRotation.endDate),
      rotationNumber: parsedRotation.rotationNumber ?? "Unknown",
      totalCreditMinutes: parsedRotation.totalCredit ?? parsedRotation.totalScheduledBlock ?? 0,
      scheduledBlockMinutes: parsedRotation.totalScheduledBlock ?? 0,
      legCount: legs.length,
      layoverCities: parsedRotation.layoverCities,
      finalArrival: parsedRotation.legs.at(-1)?.arrivalAirport ?? "TBD",
    },
    legs,
    nextLeg,
    whatMatters,
    dutyDays,
    tonightLayoverCity: parsedRotation.layoverCities[0] ?? "Layover TBD",
    tomorrowReportTime: parsedRotation.dutyPeriods[1]?.reportTime,
    scheduledRestMinutes,
    note:
      source === "mock"
        ? "Using a sample rotation until a pasted MiCrew/iCrew trip is loaded."
        : "Rotation dashboard built from the pasted trip details. Live ops feeds are placeholders in this pass.",
    source,
    parsedRotation,
  };
}

export function parseRotationIntoDashboard(rawInput: string): RotationParseResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste your MiCrew / iCrew trip text or use the sample rotation to continue.",
    };
  }
  try {
    const parsedRotation = parseRotationText(trimmed, { sourceTypes: "text" });
    if (parsedRotation.legs.length === 0) {
      return {
        ok: false,
        error: "I couldn't find any leg rows in that trip text yet. Try a fuller MiCrew / iCrew paste or use the sample rotation.",
      };
    }
    return {
      ok: true,
      parsedRotation,
      dashboard: buildRotationDashboardData(trimmed),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to parse the pasted rotation text.",
    };
  }
}
