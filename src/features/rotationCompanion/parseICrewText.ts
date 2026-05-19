import {
  computeSnapshotFromUserFacingChain,
  diagnoseScreenshotRotationPartialStatus,
  excludeDeadheadLegsFromVisibleChain,
  normalizeCarrierFlight,
  type RotationChainCandidate,
  type RotationChainLeg,
} from "./rotationChainBuilder.ts";

export type ICrewHeader = {
  base: string;
  fleetCategory: string;
  rotationNumber: string;
  position: string;
  effectiveDate: string;
  reportTime: string;
  tripDates: string;
  totalCreditMinutes: number | null;
  scheduledBlockMinutes: number | null;
  totalDeadheadBlockMinutes: number | null;
  totalDeadheadBlockSource: "tdhdSummary" | "summedDhdLines" | "none";
  tafbCredit: string | null;
  tafbElapsed: string | null;
};

export type ICrewDeadheadAnnotation = {
  cityPair: string;
  origin: string;
  destination: string;
  carrier: string;
  carrierName?: string;
  flightNumber: string;
  scheduledOut: string;
  scheduledIn: string;
  scheduledBlock: string;
  scheduledBlockMinutes: number;
  confirmationCode?: string;
  marker?: "D" | "O";
  reason:
    | "explicit_D_marker"
    | "attached_from_standalone_dhd_line"
    | "inferred_from_dhd_totals_and_regional_carrier";
};

export type ICrewStandaloneDhdAttachment = {
  line: string;
  minutes: number;
  normalizedBlock: string;
  dayToken: string | null;
  attachedToRoute: string | null;
  attachedToFlight: string | null;
  attachedToBlock: string | null;
  reason:
    | "immediate_preceding_leg_block_match"
    | "nearest_matching_prior_leg"
    | "no_matching_leg";
};

export type ParsedICrewTextResult = {
  header: ICrewHeader;
  layoverCities: string[];
  layoverDetails: Array<{
    city: string;
    hotelName?: string;
    hotelPhone?: string;
    transport?: string;
    transportProvider?: string;
    transportType?: "skyhop" | "ccar" | "limo";
    transportPhone?: string;
    pickup?: string;
    restMinutes?: number;
  }>;
  normalizedCandidates: RotationChainCandidate[];
  allTripSegments: RotationChainLeg[];
  visibleOperatingLegs: RotationChainLeg[];
  logbookLegs: RotationChainLeg[];
  deadheadAnnotations: ICrewDeadheadAnnotation[];
  standaloneDhdAttachments: ICrewStandaloneDhdAttachment[];
  incompleteFragments: string[];
  parserNotes: string[];
  partialStatus: boolean;
  partialReason: string | null;
  finalOperatingArrival: string;
  finalArrivalAfterDeadhead: string;
  operatingScheduledBlockMinutes: number;
  deadheadScheduledBlockMinutes: number;
  scheduledBlockSource: "iCrewSummaryTotals" | "computedFromPartialICrewLegs" | null;
};

export type ICrewParserDiagnostics = {
  rawTextLength: number;
  rawLineCount: number;
  first50RawLines: string[];
  last50RawLines: string[];
  first50NormalizedLines: string[];
  last50NormalizedLines: string[];
  headerCandidateLines: string[];
  totalsCandidateLines: string[];
  legCandidateLines: string[];
  parsedHeader: Partial<ICrewHeader> | null;
  parsedTotals: {
    tripDates?: string | null;
    totalCreditMinutes?: number | null;
    scheduledBlockMinutes?: number | null;
    totalDeadheadBlockMinutes?: number | null;
    totalDeadheadBlockSource?: "tdhdSummary" | "summedDhdLines" | "none" | null;
    tafbCredit?: string | null;
    tafbElapsed?: string | null;
  } | null;
  attemptedLegParseResults: Array<{
    line: string;
    matched: boolean;
    failureReason: string | null;
    parsedTokens?: Record<string, string | null>;
  }>;
  parsedSegments: Array<{
    dayToken: string;
    route: string;
    carrier: string | null;
    flightNumber: string | null;
    scheduledOut: string | null;
    scheduledIn: string | null;
    scheduledBlock: string | null;
    isDeadhead: boolean;
    segmentType: "operating" | "deadhead" | "return_to_gate";
    sourceText: string | null;
  }>;
  standaloneDhdLines: ICrewStandaloneDhdAttachment[];
  resultingDeadheadLegs: string[];
  parserStageFailed: "header" | "totals" | "legs" | "displayModel" | null;
  parserError: string | null;
};

export type ICrewParseDebugResult = {
  parserSucceeded: boolean;
  parsed: ParsedICrewTextResult | null;
  diagnostics: ICrewParserDiagnostics;
};

const REGIONAL_CARRIER_NAMES: Record<string, string> = {
  "9E": "Endeavor Air",
  OO: "SkyWest Airlines",
  YX: "Republic Airways",
};

function normalizeICrewLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function splitRawLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " "))
    .filter((line) => line.trim().length > 0);
}

function parseDotDurationToMinutes(value?: string | null) {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(":", ".");
  const match = normalized.match(/^(\d{1,2})\.(\d{2})$/);
  if (!match?.[1] || !match?.[2]) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}:${String(remaining).padStart(2, "0")}`;
}

function formatClockDigits(value?: string | null) {
  if (!value) {
    return "";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 4) {
    return value.replace(/\D/g, "");
  }
  return digits;
}

function formatDurationString(value?: string | null) {
  if (!value) {
    return "0:00";
  }
  return formatMinutes(parseDotDurationToMinutes(value));
}

function extractFirstDuration(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ?? match?.[2];
    if (value) {
      return value.replace(":", ".").toUpperCase();
    }
  }
  return null;
}

function stripLeadingMarkerAirport(token?: string | null) {
  return (token ?? "").replace(/^\*+/, "").toUpperCase();
}

function isAirportToken(token?: string | null) {
  return /^\*?[A-Z]{3}$/i.test(token ?? "");
}

function isArrivalToken(token?: string | null) {
  return /^\*?[A-Z]{3}\.\d{4}$/i.test(token ?? "");
}

function isArrivalAirportToken(token?: string | null) {
  return /^\*?[A-Z]{3}$/i.test(token ?? "");
}

function isDayOnlyToken(token?: string | null) {
  return /^\d{1,2}$/i.test(token ?? "");
}

function extractEffectiveMonth(rawText: string) {
  const normalizedText = splitRawLines(rawText).map(normalizeICrewLine).join("\n");
  return normalizedText.match(/\bEFFECTIVE\s+([A-Z]{3})\d{2}\b/i)?.[1]?.toUpperCase() ?? null;
}

function buildICrewDateLabel(dayToken: string, effectiveMonth?: string | null) {
  const normalizedDay = dayToken.padStart(2, "0");
  const month = (effectiveMonth ?? "APR").toUpperCase();
  return `${normalizedDay}${month}`;
}

function isFlightTokenLike(token?: string | null) {
  return /^(?:\d{3,5}|D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}|YX\d{2,5}|\d{1,2}(?:D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}|YX\d{2,5}))$/i.test(
    token ?? "",
  );
}

function looksLikePotentialICrewLegLine(line: string) {
  return /(?:\*?[A-Z]{3}\*?\d{4}\s+\*?[A-Z]{3}\.\d{4}|\*?[A-Z]{3}\s+\d{4}\s+\*?[A-Z]{3}\.\d{4}|\b(?:D|DL|9E|OO|YX)\d{2,5}\b|\b\d{1,2}\s+\d?(?:D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}|YX\d{2,5}|\d{3,5})\b)/i.test(
    line,
  );
}

export function parseICrewFlightToken(dayToken: string, rawToken: string) {
  const normalizedDay = String(Number(dayToken));
  const compactDayPrefixedToken = new RegExp(
    `^(?:${dayToken}|${normalizedDay})(?:D\\d{2,5}|DL\\d{2,5}|9E\\d{2,5}|OO\\d{2,5}|YX\\d{2,5})$`,
    "i",
  );
  const withoutDayPrefix = compactDayPrefixedToken.test(rawToken)
    ? rawToken.replace(new RegExp(`^(?:${dayToken}|${normalizedDay})`, "i"), "")
    : rawToken;
  const withoutDutySequencePrefix = /^\d(?:D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}|YX\d{2,5})$/i.test(withoutDayPrefix)
    ? withoutDayPrefix.slice(1)
    : withoutDayPrefix;
  if (/^\d{2,5}$/i.test(withoutDutySequencePrefix)) {
    return {
      marker: null,
      carrier: "DL",
      flightNumber: normalizeCarrierFlight("DL", withoutDutySequencePrefix).flightNumber,
    };
  }
  if (/^D\d+$/i.test(withoutDutySequencePrefix)) {
    return {
      marker: "D" as const,
      carrier: "DL",
      flightNumber: normalizeCarrierFlight("DL", withoutDutySequencePrefix.slice(1)).flightNumber,
    };
  }
  const tokenMatch = withoutDutySequencePrefix.match(/^([A-Z0-9]{2})(\d{2,5})$/i);
  if (tokenMatch?.[1] && tokenMatch?.[2]) {
    const normalized = normalizeCarrierFlight(tokenMatch[1].toUpperCase(), tokenMatch[2]);
    return {
      marker: (normalized.carrier === "O" || normalized.carrier === "D" ? normalized.carrier : null) as "D" | "O" | null,
      carrier:
        normalized.carrier === "O" || normalized.carrier === "D"
          ? "DL"
          : normalized.carrier,
      flightNumber: normalized.flightNumber,
    };
  }
  const normalized = normalizeCarrierFlight("DL", withoutDutySequencePrefix);
  return {
    marker: null,
    carrier: normalized.carrier || "DL",
    flightNumber: normalized.flightNumber,
  };
}

function parseFlightToken(dayToken: string, rawToken: string) {
  return parseICrewFlightToken(dayToken, rawToken);
}

function isEquipmentLikeToken(token?: string | null) {
  return /^[A-Z]?\d{2,4}$/i.test(token ?? "");
}

function parseICrewPostBlockColumns(
  tokens: string[],
  options?: {
    preferSingleDurationAsTurn?: boolean;
  },
) {
  const durationColumns: Array<{
    duration: string;
    raw: string;
    suffix: string;
    mealMarker: string | null;
    equipmentShip: string | null;
  }> = [];
  let standaloneEquipmentShip: string | null = null;
  let standaloneMealMarker: string | null = null;

  for (const token of tokens) {
    const stripped = token.replace(/^\*+/, "");
    const durationMatch = stripped.match(/^(\d{1,2}[.:]\d{2})([A-Z0-9]*)$/i);
    if (durationMatch?.[1]) {
      const suffix = durationMatch[2] ?? "";
      const mealMarker = /^M/i.test(suffix) ? "M" : null;
      const equipmentShip = suffix.replace(/^M/i, "");
      durationColumns.push({
        duration: durationMatch[1],
        raw: stripped,
        suffix,
        mealMarker,
        equipmentShip: equipmentShip && isEquipmentLikeToken(equipmentShip) ? equipmentShip : null,
      });
      continue;
    }

    if (/^M$/i.test(stripped)) {
      standaloneMealMarker = "M";
      continue;
    }

    if (isEquipmentLikeToken(stripped)) {
      standaloneEquipmentShip = stripped.replace(/^M/i, "");
    }
  }

  let makeUpToken: string | null = null;
  let turnToken: string | null = null;

  if (durationColumns.length >= 2) {
    makeUpToken = durationColumns[0]?.duration ?? null;
    turnToken = durationColumns[1]?.duration ?? null;
  } else if (durationColumns.length === 1) {
    const loneDuration = durationColumns[0];
    const hasSeparateEquipmentEvidence =
      Boolean(standaloneEquipmentShip) || Boolean(loneDuration?.equipmentShip) || Boolean(loneDuration?.mealMarker);
    if (options?.preferSingleDurationAsTurn) {
      turnToken = loneDuration?.duration ?? null;
    } else if (hasSeparateEquipmentEvidence) {
      makeUpToken = loneDuration?.duration ?? null;
    } else {
      makeUpToken = loneDuration?.duration ?? null;
    }
  }

  const mealMarker =
    durationColumns[1]?.mealMarker ??
    durationColumns[0]?.mealMarker ??
    standaloneMealMarker ??
    null;
  const equipmentShip =
    durationColumns[1]?.equipmentShip ??
    durationColumns[0]?.equipmentShip ??
    standaloneEquipmentShip ??
    null;

  return {
    makeUpToken,
    turnToken,
    mealMarker,
    equipmentShip,
  };
}

function buildICrewParserDiagnostics(
  rawText: string,
  parserStageFailed: ICrewParserDiagnostics["parserStageFailed"],
  parserError: string | null,
  extra?: Partial<ICrewParserDiagnostics>,
): ICrewParserDiagnostics {
  const rawLines = splitRawLines(rawText);
  const normalizedLines = rawLines.map(normalizeICrewLine);
  return {
    rawTextLength: rawText.length,
    rawLineCount: rawLines.length,
    first50RawLines: rawLines.slice(0, 50),
    last50RawLines: rawLines.slice(-50),
    first50NormalizedLines: normalizedLines.slice(0, 50),
    last50NormalizedLines: normalizedLines.slice(-50),
    headerCandidateLines: normalizedLines.filter((line) =>
      /(ROTATION|0233|EFFECTIVE|CHECK IN|ACTUAL REPORT|PILOT|POS-)/i.test(line),
    ),
    totalsCandidateLines: normalizedLines.filter((line) =>
      /(REGULAR-|RESERVE-|TBL|TDHD|TAFB|TAFBCR|TAFBELP|TL)/i.test(line),
    ),
    legCandidateLines: normalizedLines.filter((line) => looksLikePotentialICrewLegLine(line)),
    parsedHeader: extra?.parsedHeader ?? null,
    parsedTotals: extra?.parsedTotals ?? null,
    attemptedLegParseResults: extra?.attemptedLegParseResults ?? [],
    parsedSegments: extra?.parsedSegments ?? [],
    standaloneDhdLines: extra?.standaloneDhdLines ?? [],
    resultingDeadheadLegs: extra?.resultingDeadheadLegs ?? [],
    parserStageFailed,
    parserError,
  };
}

function extractICrewHeaderParts(rawText: string, parsedSegments: Array<RotationChainCandidate & { dayToken: string }>) {
  const lines = splitRawLines(rawText);
  const normalizedLines = lines.map(normalizeICrewLine);
  const normalizedText = normalizedLines.join("\n");

  const fleetMatch = normalizedText.match(/\bPILOT\s+(\d{2,3})\b/i);
  const baseMatch =
    normalizedText.match(/\b([A-Z]{3})\s+PILOT\s+\d{2,3}\b/i) ??
    normalizedText.match(/\bPILOT\s+\d{2,3}\s+([A-Z]{3})\b/i);
  const rotationLine =
    normalizedLines.find((line) => /\b\d{3,5}\b.*\bPOS-?[A-Z]{1,3}\b.*\bEFFECTIVE\b/i.test(line)) ??
    normalizedLines.find((line) => /\bROTATION\b.*\bOPER\b/i.test(line));
  const rotationPositionMatch =
    normalizedText.match(/\b(\d{3,5})\s+POS-?([A-Z]{1,3})\s+EFFECTIVE\s+([A-Z]{3}\d{2})\b/i) ??
    normalizedText.match(/\bPILOT\s+\d{2,3}\s+[A-Z]{3}\s+(\d{3,5})\s+([A-Z]{1,3})\s+([A-Z]{3}\d{2})\s+CHECK\s*IN\b/i) ??
    rotationLine?.match(/\b(\d{3,5})\s+POS-?([A-Z]{1,3})\s+EFFECTIVE\s+([A-Z]{3}\d{2})\b/i) ??
    null;
  const checkInMatch =
    normalizedText.match(/\bCHECK\s*IN(?:\s+AT)?\s+(\d{2})[.:]?(\d{2})\b/i) ??
    normalizedText.match(/\bACTUAL REPORT TIME\s+(\d{2})(\d{2})\b/i);

  const tripDates =
    normalizedText.match(/\bTRIP DATES?\s+(\d{2}[A-Z]{3}\s*-\s*\d{2}[A-Z]{3})\b/i)?.[1]?.replace(/\s+/g, " ").toUpperCase() ??
    (() => {
      const dayTokens = parsedSegments
        .map((segment) => segment.date?.match(/^(\d{2}[A-Z]{3})$/i)?.[1]?.toUpperCase())
        .filter((value): value is string => Boolean(value));
      return dayTokens.length > 0 ? `${dayTokens[0]} - ${dayTokens.at(-1)}` : null;
    })();

  const totalCreditToken = extractFirstDuration(normalizedText, [
    /\bCREDIT\s+(\d{1,2}[.:]\d{2})\b/i,
    /\bREGULAR-\s*(\d{1,2}[.:]\d{2})(?:TL)?/i,
  ]);
  const scheduledBlockToken = extractFirstDuration(normalizedText, [
    /\bTBL\s+(\d{1,2}[.:]\d{2})\b/i,
    /\b(\d{1,2}[.:]\d{2})TBL\b/i,
    /\bREGULAR-.*?(\d{1,2}[.:]\d{2})BL\b/i,
  ]);
  const totalDeadheadToken = extractFirstDuration(normalizedText, [
    /\bTDHD\s+(\d{1,2}[.:]\d{2})\b/i,
    /\b(\d{1,2}[.:]\d{2})TDHD\b/i,
  ]);
  const tafbCreditToken = extractFirstDuration(normalizedText, [
    /\bTAFBCR\s+(\d{1,2}[.:]\d{2})\b/i,
    /\b(\d{1,2}[.:]\d{2})TAFBCR\b/i,
    /\bTAFB\s+(\d{1,2}[.:]\d{2})CR\b/i,
  ]);
  const tafbElapsedToken = extractFirstDuration(normalizedText, [
    /\bTAFBELP\s+(\d{1,2}[.:]\d{2})\b/i,
    /\b(\d{1,2}[.:]\d{2})TAFBELP\b/i,
    /\bTAFB\s+(\d{1,2}[.:]\d{2})EX\b/i,
  ]);

  return {
    fleetCategory: fleetMatch?.[1] ? `PILOT ${fleetMatch[1]}` : null,
    base: baseMatch?.[1]?.toUpperCase() ?? null,
    rotationNumber: rotationPositionMatch?.[1] ?? null,
    position: rotationPositionMatch?.[2]?.toUpperCase() ?? null,
    effectiveDate: rotationPositionMatch?.[3]?.toUpperCase() ?? null,
    reportTime:
      checkInMatch?.[1] && checkInMatch?.[2] ? `${checkInMatch[1]}${checkInMatch[2]}` : null,
    tripDates,
    totalCreditToken,
    scheduledBlockToken,
    totalDeadheadToken,
    tafbCreditToken,
    tafbElapsedToken,
  };
}

function parseICrewHeader(rawText: string, parsedSegments: Array<RotationChainCandidate & { dayToken: string }>): ICrewHeader {
  const parts = extractICrewHeaderParts(rawText, parsedSegments);

  const missingHeaderFields = [
    !parts.fleetCategory ? "fleetCategory" : null,
    !parts.base ? "base" : null,
    !parts.rotationNumber ? "rotationNumber" : null,
    !parts.position ? "position" : null,
    !parts.effectiveDate ? "effectiveDate" : null,
    !parts.reportTime ? "reportTime" : null,
  ].filter((value): value is string => Boolean(value));
  if (missingHeaderFields.length > 0) {
    throw new Error(`Unable to parse iCrew header fields: ${missingHeaderFields.join(", ")}`);
  }
  if (!parts.tripDates) {
    throw new Error("Unable to parse iCrew header fields: tripDates");
  }

  return {
    fleetCategory: parts.fleetCategory!,
    base: parts.base!,
    rotationNumber: parts.rotationNumber!,
    position: parts.position!,
    effectiveDate: parts.effectiveDate!,
    reportTime: parts.reportTime!,
    tripDates: parts.tripDates!,
    totalCreditMinutes: parts.totalCreditToken ? parseDotDurationToMinutes(parts.totalCreditToken) : null,
    scheduledBlockMinutes: parts.scheduledBlockToken ? parseDotDurationToMinutes(parts.scheduledBlockToken) : null,
    totalDeadheadBlockMinutes: parts.totalDeadheadToken ? parseDotDurationToMinutes(parts.totalDeadheadToken) : null,
    totalDeadheadBlockSource: parts.totalDeadheadToken ? "tdhdSummary" : "none",
    tafbCredit: parts.tafbCreditToken ? parts.tafbCreditToken.replace(".", ":") : null,
    tafbElapsed: parts.tafbElapsedToken ? parts.tafbElapsedToken.replace(".", ":") : null,
  };
}

function parseDayLevelDhdTotals(rawText: string) {
  const totals = new Map<string, { operatingBlockMinutes: number; deadheadBlockMinutes: number }>();
  for (const line of splitRawLines(rawText)) {
    const normalizedLine = normalizeICrewLine(line);
    const match = normalizedLine.match(/^(\d{2})\s+TOTAL\s+(\d{1,2}[.:]\d{2})BL\s+(\d{1,2}[.:]\d{2})DHD/i);
    if (!match?.[1] || !match?.[2] || !match?.[3]) {
      continue;
    }
    totals.set(match[1], {
      operatingBlockMinutes: parseDotDurationToMinutes(match[2]),
      deadheadBlockMinutes: parseDotDurationToMinutes(match[3]),
    });
  }
  return totals;
}

function parseICrewLayoverCities(rawText: string) {
  const layovers: string[] = [];
  for (const line of splitRawLines(rawText)) {
    const normalizedLine = normalizeICrewLine(line);
    const match = normalizedLine.match(
      /^([A-Z]{3})\s+(\d{1,2}[.:]\d{2})\s*\/\s*(?:[A-Z0-9].+)?$/i,
    );
    if (!match?.[1] || !match?.[2]) {
      continue;
    }
    layovers.push(match[1].toUpperCase());
  }
  return Array.from(new Set(layovers));
}

export function parseICrewLayoverDetails(rawText: string) {
  const splitLabelAndPhone = (value: string) => {
    const trimmed = value.trim();
    const phoneMatch = trimmed.match(/^(.*?)(?:\s+)?((?:\d{3}-\d{3}-\d{4})|(?:\d{10,11}))$/);
    if (!phoneMatch) {
      return { label: trimmed, phone: undefined as string | undefined };
    }
    return {
      label: phoneMatch[1]?.trim() || undefined,
      phone: phoneMatch[2]?.trim() || undefined,
    };
  };
  const detailsByCity = new Map<
    string,
    {
      city: string;
      hotelName?: string;
      hotelPhone?: string;
      transport?: string;
      transportProvider?: string;
      transportType?: "skyhop" | "ccar" | "limo";
      transportPhone?: string;
      pickup?: string;
      restMinutes?: number;
    }
  >();
  const lines = splitRawLines(rawText);
  let currentCity: string | null = null;

  const upsert = (city: string) => {
    const normalizedCity = city.toUpperCase();
    const existing = detailsByCity.get(normalizedCity) ?? { city: normalizedCity };
    detailsByCity.set(normalizedCity, existing);
    currentCity = normalizedCity;
    return existing;
  };

  for (const line of lines) {
    const rawLine = line.trimEnd();
    const normalizedLine = normalizeICrewLine(rawLine);
    const compactLayoverMatch = rawLine.match(/^([A-Z]{3})\s+(\d{1,2}[.:]\d{2})\s*\/\s*(.+)$/i);
    if (compactLayoverMatch?.[1] && compactLayoverMatch?.[2]) {
      const detail = upsert(compactLayoverMatch[1]);
      const parsedRest = parseDotDurationToMinutes(compactLayoverMatch[2]);
      if (parsedRest > 0) {
        detail.restMinutes = parsedRest;
      }
      const compactHotelName = compactLayoverMatch[3]?.trim();
      if (compactHotelName && !detail.hotelName) {
        detail.hotelName = compactHotelName;
      }
      continue;
    }

    const hotelHeaderMatch = rawLine.match(
      /^([A-Z]{3})\s*-\s*HOTEL\s*-\s*(.+?)(?:\s{2,}(\d{3}-\d{3}-\d{4}))?$/i,
    );
    if (hotelHeaderMatch?.[1]) {
      const detail = upsert(hotelHeaderMatch[1]);
      const hotelName = hotelHeaderMatch[2]?.trim();
      const hotelPhone = hotelHeaderMatch[3]?.trim();
      if (hotelName) {
        detail.hotelName = hotelName;
      }
      if (hotelPhone) {
        detail.hotelPhone = hotelPhone;
      }
      continue;
    }

    if (!currentCity) {
      continue;
    }

    const activeDetail = detailsByCity.get(currentCity);
    if (!activeDetail) {
      continue;
    }

    const hotelPhoneMatch = normalizedLine.match(/\b(\d{3}-\d{3}-\d{4})\b/);
    if (!activeDetail.hotelPhone && hotelPhoneMatch?.[1]) {
      activeDetail.hotelPhone = hotelPhoneMatch[1];
    }

    const transportMatch = rawLine.match(/^\s*TRANSPORTATION\s*-\s*(.+)$/i);
    if (transportMatch?.[1]) {
      const transportValue = splitLabelAndPhone(transportMatch[1]);
      const providerLabel = transportValue.label ?? transportMatch[1].trim();
      activeDetail.transportProvider = providerLabel;
      activeDetail.transportPhone = transportValue.phone ?? activeDetail.transportPhone;
      if (/SKYHOP/i.test(providerLabel)) {
        activeDetail.transportType = "skyhop";
        activeDetail.transportProvider = "SkyHop Global";
      }
      activeDetail.transport = activeDetail.transportProvider;
      continue;
    }

    const transportTypeMatch = rawLine.match(/^\s*(CCAR|LIMO)\s+(.+)$/i);
    if (transportTypeMatch?.[1] && transportTypeMatch?.[2]) {
      const transportTypeToken = transportTypeMatch[1].trim().toUpperCase();
      const typedTransportValue = splitLabelAndPhone(transportTypeMatch[2]);
      const isSkyHopLabel = Boolean(typedTransportValue.label && /SKYHOP/i.test(typedTransportValue.label));
      if (activeDetail.transportType !== "skyhop") {
        activeDetail.transportType =
          transportTypeToken === "CCAR"
            ? "ccar"
            : isSkyHopLabel
              ? "skyhop"
              : "limo";
      }
      if (typedTransportValue.phone) {
        activeDetail.transportPhone = typedTransportValue.phone;
      }
      if ((activeDetail.transportType === "limo" || activeDetail.transportType === "skyhop") && typedTransportValue.label) {
        activeDetail.transportProvider = /SKYHOP/i.test(typedTransportValue.label)
          ? "SkyHop Global"
          : typedTransportValue.label;
      }
      if (activeDetail.transportType === "ccar") {
        activeDetail.transportProvider = activeDetail.transportProvider || "Hotel / CCAR";
      }
      activeDetail.transport =
        activeDetail.transportProvider ??
        (activeDetail.transportType === "ccar"
          ? "Hotel / CCAR"
          : activeDetail.transportType === "skyhop"
            ? "SkyHop Global"
            : "Limo");
      continue;
    }

    const pickupMatch = rawLine.match(/^\s*(?:CREW\s+PICK\s*UP|PICK\s*UP)\s*-\s*(.+)$/i);
    if (pickupMatch?.[1]) {
      activeDetail.pickup = pickupMatch[1].trim();
      continue;
    }
  }

  return Array.from(detailsByCity.values());
}

function applyRegionalDeadheadInference(args: {
  segments: Array<
    RotationChainCandidate & {
      dayToken: string;
      marker?: "D" | "O" | null;
      confirmationCode?: string | null;
      isDeadhead: boolean;
      segmentType: "operating" | "deadhead";
    }
  >;
  targetDeadheadMinutes: number;
}) {
  const { segments, targetDeadheadMinutes } = args;
  if (targetDeadheadMinutes <= 0) {
    return;
  }

  const explicitDeadheadMinutes = segments
    .filter((segment) => segment.marker === "D")
    .reduce((sum, segment) => sum + parseDotDurationToMinutes(segment.scheduledBlock), 0);
  if (explicitDeadheadMinutes >= targetDeadheadMinutes) {
    return;
  }

  const unresolvedRegional = segments.filter(
    (segment) =>
      !segment.isDeadhead &&
      ["9E", "OO", "YX"].includes((segment.carrier ?? "").toUpperCase()),
  );
  if (unresolvedRegional.length === 0) {
    return;
  }

  const minutesNeeded = targetDeadheadMinutes - explicitDeadheadMinutes;
  const matchingRegionalIndexes: number[] = [];

  function search(index: number, remaining: number, chosen: number[]) {
    if (remaining === 0) {
      matchingRegionalIndexes.splice(0, matchingRegionalIndexes.length, ...chosen);
      return true;
    }
    if (remaining < 0 || index >= unresolvedRegional.length) {
      return false;
    }
    const currentMinutes = parseDotDurationToMinutes(unresolvedRegional[index]?.scheduledBlock);
    if (search(index + 1, remaining - currentMinutes, [...chosen, index])) {
      return true;
    }
    return search(index + 1, remaining, chosen);
  }

  if (!search(0, minutesNeeded, [])) {
    return;
  }

  matchingRegionalIndexes.forEach((chosenIndex) => {
    const segment = unresolvedRegional[chosenIndex];
    if (!segment) {
      return;
    }
    segment.isDeadhead = true;
    segment.segmentType = "deadhead";
    segment.deadheadSource = "inferred_from_dhd_totals_and_regional_carrier";
  });
}

function parseICrewSegments(rawText: string) {
  const segments: Array<
    RotationChainCandidate & {
      dayToken: string;
      marker?: "D" | "O" | null;
      confirmationCode?: string | null;
      isDeadhead?: boolean;
      deadheadSource?:
        | "explicit_D_marker"
        | "standalone_dhd_line"
        | "inferred_from_dhd_totals_and_regional_carrier";
      segmentType?: "operating" | "deadhead" | "return_to_gate";
      makeUp?: string | null;
      mealMarker?: string | null;
      equipmentShip?: string | null;
      sourceLineIndex: number;
    }
  > = [];
  const attemptedLegParseResults: ICrewParserDiagnostics["attemptedLegParseResults"] = [];
  const standaloneDhdLines: ICrewStandaloneDhdAttachment[] = [];
  let currentDayToken: string | null = null;
  let lastSegment: (typeof segments)[number] | null = null;
  let lastRawFlightToken: string | null = null;
  const effectiveMonth = extractEffectiveMonth(rawText);

  for (const [lineIndex, line] of splitRawLines(rawText).entries()) {
    const normalizedLine = normalizeICrewLine(line);
    const standaloneDhdMatch = normalizedLine.match(/^(\d{1,2}[.:]\d{2})DHD\b/i);
    if (standaloneDhdMatch?.[1]) {
      const minutes = parseDotDurationToMinutes(standaloneDhdMatch[1]);
      const normalizedBlock = formatDurationString(standaloneDhdMatch[1]);
      const activeDayToken = currentDayToken ?? lastSegment?.dayToken ?? null;
      let attachedSegment: (typeof segments)[number] | null = null;
      let reason: ICrewStandaloneDhdAttachment["reason"] = "no_matching_leg";

      if (
        lastSegment &&
        (!activeDayToken || lastSegment.dayToken === activeDayToken) &&
        parseDotDurationToMinutes(lastSegment.scheduledBlock) === minutes
      ) {
        attachedSegment = lastSegment;
        reason = "immediate_preceding_leg_block_match";
      } else {
        attachedSegment =
          [...segments]
            .reverse()
            .find(
              (segment) =>
                (!activeDayToken || segment.dayToken === activeDayToken) &&
                parseDotDurationToMinutes(segment.scheduledBlock) === minutes,
            ) ?? null;
        if (attachedSegment) {
          reason = "nearest_matching_prior_leg";
        }
      }

      if (attachedSegment) {
        attachedSegment.isDeadhead = true;
        attachedSegment.segmentType = "deadhead";
        attachedSegment.deadheadSource = "standalone_dhd_line";
      }

      standaloneDhdLines.push({
        line: normalizedLine,
        minutes,
        normalizedBlock,
        dayToken: activeDayToken,
        attachedToRoute: attachedSegment ? `${attachedSegment.departureAirport}-${attachedSegment.arrivalAirport}` : null,
        attachedToFlight: attachedSegment ? `${attachedSegment.carrier ?? "DL"}${attachedSegment.flightNumber ?? ""}` : null,
        attachedToBlock: attachedSegment?.scheduledBlock ?? null,
        reason,
      });
      continue;
    }

    if (!/(?:[A-Z]{3}\.?\d{4}|\bD\d{3,5}\b|\b9E\d{3,5}\b|\bOO\d{3,5}\b|\b\d{3,5}\b)/i.test(normalizedLine)) {
      continue;
    }
    if (/^CONFIRMATION\s+#?[A-Z0-9]+$/i.test(normalizedLine)) {
      const confirmationCode = normalizedLine.match(/CONFIRMATION\s+#?([A-Z0-9]+)/i)?.[1]?.toUpperCase() ?? null;
      if (lastSegment && confirmationCode) {
        lastSegment.confirmationCode = confirmationCode;
        lastSegment.sourceText = `${lastSegment.sourceText ?? ""} ${normalizedLine}`.trim();
        lastSegment.rawSourceLine = `${lastSegment.rawSourceLine ?? ""} ${line.trim()}`.trim();
      }
      attemptedLegParseResults.push({
        line: normalizedLine,
        matched: Boolean(lastSegment && confirmationCode),
        failureReason: lastSegment && confirmationCode ? null : "confirmation_line_without_prior_segment",
        parsedTokens: {
          confirmationCode,
        },
      });
      continue;
    }

    const tokens = normalizedLine.split(/\s+/);
    let cursor = 0;
    let dayToken = currentDayToken;
    let rawFlightToken: string | null = null;

    const leadingGluedContinuationMatch = tokens[0]?.match(/^(\*?[A-Z]{3})\*?(\d{4})$/i);
    const startsLikeContinuationRow =
      Boolean(lastRawFlightToken) &&
      Boolean(
        (
          tokens[0] &&
          isAirportToken(tokens[0]) &&
          /^\d{4}$/.test(tokens[1] ?? "") &&
          ((isArrivalToken(tokens[2]) as boolean) ||
            (isArrivalAirportToken(tokens[2]) && /^\d{4}$/.test(tokens[3] ?? "")))
        ) ||
          (
            leadingGluedContinuationMatch?.[1] &&
            leadingGluedContinuationMatch?.[2] &&
            ((isArrivalToken(tokens[1]) as boolean) ||
              (isArrivalAirportToken(tokens[1]) && /^\d{4}$/.test(tokens[2] ?? "")))
          ),
      );

    if (tokens[0] && isDayOnlyToken(tokens[0]) && tokens[1] && isFlightTokenLike(tokens[1])) {
      dayToken = tokens[0].padStart(2, "0");
      currentDayToken = dayToken;
      rawFlightToken = tokens[1];
      cursor = 2;
    } else if (
      tokens[0] &&
      isDayOnlyToken(tokens[0]) &&
      /^(D|O)$/i.test(tokens[1] ?? "") &&
      tokens[2] &&
      isFlightTokenLike(tokens[2])
    ) {
      dayToken = tokens[0].padStart(2, "0");
      currentDayToken = dayToken;
      rawFlightToken = `${tokens[1]}${tokens[2]}`;
      cursor = 3;
    } else if (tokens[0] && /^(\d{1,2})(D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}|YX\d{2,5})$/i.test(tokens[0])) {
      const match = tokens[0].match(/^(\d{1,2})(D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}|YX\d{2,5})$/i);
      dayToken = match?.[1]?.padStart(2, "0") ?? currentDayToken;
      currentDayToken = dayToken;
      rawFlightToken = tokens[0];
      cursor = 1;
    } else if (tokens[0] && isFlightTokenLike(tokens[0])) {
      rawFlightToken = tokens[0];
      cursor = 1;
    } else if (startsLikeContinuationRow) {
      rawFlightToken = lastRawFlightToken;
      cursor = 0;
    }

    if (!dayToken || !rawFlightToken) {
      attemptedLegParseResults.push({
        line: normalizedLine,
        matched: false,
        failureReason: !dayToken ? "missing_day_token" : "missing_flight_token",
      });
      continue;
    }

    let departureAirportToken = tokens[cursor] ?? null;
    let departureTimeToken = tokens[cursor + 1] ?? null;
    let arrivalToken = tokens[cursor + 2] ?? null;
    let arrivalAirportToken = arrivalToken;
    let arrivalTimeToken: string | null = null;
    let trailingTokens = tokens.slice(cursor + 3);

    const gluedDepartureMatch = departureAirportToken?.match(/^(\*?[A-Z]{3})\*?(\d{4})$/i);
    if (gluedDepartureMatch?.[1] && gluedDepartureMatch?.[2]) {
      departureAirportToken = gluedDepartureMatch[1];
      departureTimeToken = gluedDepartureMatch[2];
      arrivalToken = tokens[cursor + 1] ?? null;
      arrivalAirportToken = arrivalToken;
      trailingTokens = tokens.slice(cursor + 2);
    }

    if (isArrivalToken(arrivalToken)) {
      const inlineArrivalMatch = arrivalToken.match(/^\*?([A-Z]{3})\.(\d{4})$/i);
      arrivalAirportToken = inlineArrivalMatch?.[1] ?? null;
      arrivalTimeToken = inlineArrivalMatch?.[2] ?? null;
    } else if (isArrivalAirportToken(arrivalAirportToken) && /^\d{4}$/.test(tokens[cursor + 3] ?? "")) {
      arrivalTimeToken = tokens[cursor + 3] ?? null;
      trailingTokens = tokens.slice(cursor + 4);
    }

    if (
      !isAirportToken(departureAirportToken) ||
      !/^\d{4}$/.test(departureTimeToken ?? "") ||
      !isArrivalAirportToken(arrivalAirportToken) ||
      !/^\d{4}$/.test(arrivalTimeToken ?? "")
    ) {
      attemptedLegParseResults.push({
        line: normalizedLine,
        matched: false,
        failureReason: "missing_airport_or_time_tokens",
        parsedTokens: {
          dayToken,
          rawFlightToken,
          departureAirportToken: departureAirportToken ?? null,
          departureTimeToken: departureTimeToken ?? null,
          arrivalToken: arrivalToken ?? null,
          arrivalAirportToken: arrivalAirportToken ?? null,
          arrivalTimeToken: arrivalTimeToken ?? null,
        },
      });
      continue;
    }

    let blockToken: string | null = null;
    const trailingAfterBlock: string[] = [];
    for (const trailingToken of trailingTokens) {
      const stripped = trailingToken.replace(/^\*+/, "");
      if (!blockToken && /^\d{1,2}[.:]\d{2}(?:BL)?$/i.test(stripped)) {
        blockToken = stripped.replace(/BL$/i, "");
        continue;
      }
      if (blockToken) {
        trailingAfterBlock.push(stripped);
      }
    }
    if (!blockToken) {
      attemptedLegParseResults.push({
        line: normalizedLine,
        matched: false,
        failureReason: "missing_block_token",
        parsedTokens: {
          dayToken,
          rawFlightToken,
          departureAirportToken,
          departureTimeToken,
          arrivalToken,
        },
      });
      continue;
    }
    const token = parseFlightToken(dayToken, rawFlightToken.toUpperCase());
    const confirmationCode = normalizedLine.match(/CONFIRMATION\s+#?([A-Z0-9]+)/i)?.[1]?.toUpperCase() ?? null;
    const dateLabel = buildICrewDateLabel(dayToken, effectiveMonth);
    const departureAirport = stripLeadingMarkerAirport(departureAirportToken);
    const arrivalAirport = stripLeadingMarkerAirport(arrivalAirportToken);
    const segmentType =
      departureAirport && arrivalAirport && departureAirport === arrivalAirport
        ? ("return_to_gate" as const)
        : ("operating" as const);
    const parsedPostBlockColumns = parseICrewPostBlockColumns(trailingAfterBlock, {
      preferSingleDurationAsTurn: segmentType === "return_to_gate",
    });
    const parsedSegment = {
      dayToken,
      date: dateLabel,
      flightNumber: token.flightNumber,
      carrier: token.carrier,
      departureAirport,
      arrivalAirport,
      scheduledOut: `${formatClockDigits(departureTimeToken)} ${dateLabel}`,
      scheduledIn: `${formatClockDigits(arrivalTimeToken)} ${dateLabel}`,
      scheduledBlock: formatDurationString(blockToken),
      turn: parsedPostBlockColumns.turnToken
        ? formatDurationString(parsedPostBlockColumns.turnToken)
        : null,
      makeUp: parsedPostBlockColumns.makeUpToken
        ? formatDurationString(parsedPostBlockColumns.makeUpToken)
        : null,
      mealMarker: parsedPostBlockColumns.mealMarker,
      equipmentShip: parsedPostBlockColumns.equipmentShip,
      sourceText: normalizedLine,
      rawSourceLine: line.trim(),
      confirmationCode,
      marker: token.marker,
      segmentType,
      sourceLineIndex: lineIndex,
    };
    segments.push(parsedSegment);
    lastSegment = parsedSegment;
    lastRawFlightToken = rawFlightToken;
    attemptedLegParseResults.push({
      line: normalizedLine,
      matched: true,
      failureReason: null,
      parsedTokens: {
        dayToken,
        rawFlightToken,
        carrier: token.carrier,
        flightNumber: token.flightNumber,
        departureAirport: parsedSegment.departureAirport,
        departureTime: departureTimeToken,
        arrivalAirport: parsedSegment.arrivalAirport,
        arrivalTime: arrivalTimeToken ?? null,
        blockToken,
        makeUpToken: parsedPostBlockColumns.makeUpToken,
        turnToken: parsedPostBlockColumns.turnToken,
        mealMarker: parsedPostBlockColumns.mealMarker,
        equipmentShip: parsedPostBlockColumns.equipmentShip,
        confirmationCode,
        segmentType,
      },
    });
  }

  return { segments, attemptedLegParseResults, standaloneDhdLines };
}

function collectICrewIncompleteFragments(
  attemptedLegParseResults: ICrewParserDiagnostics["attemptedLegParseResults"],
) {
  return attemptedLegParseResults
    .filter((result) => {
      if (result.matched) {
        return false;
      }
      if (!result.line || result.failureReason == null) {
        return false;
      }
      if (!/(?:\*?[A-Z]{3}\s+\d{4}\s+\*?[A-Z]{3}\.\d{4}|\*?[A-Z]{3}\d{4}\s+\*?[A-Z]{3}\.\d{4})/i.test(result.line)) {
        return false;
      }
      return [
        "missing_block_token",
        "missing_airport_or_time_tokens",
        "missing_flight_token",
      ].includes(result.failureReason);
    })
    .map((result) => result.line);
}

function parseICrewTextInternal(rawText: string): ParsedICrewTextResult {
  const parsedSegmentAttempt = parseICrewSegments(rawText);
  const parsedSegments = parsedSegmentAttempt.segments;
  if (parsedSegments.length === 0) {
    throw new Error("Unable to parse iCrew leg rows from the provided text.");
  }

  let header = parseICrewHeader(rawText, parsedSegments);
  const layoverCities = parseICrewLayoverCities(rawText);
  const layoverDetails = parseICrewLayoverDetails(rawText);
  const dayTotals = parseDayLevelDhdTotals(rawText);
  const summedDayDeadheadMinutes = Array.from(dayTotals.values()).reduce(
    (sum, totals) => sum + totals.deadheadBlockMinutes,
    0,
  );
  const summedStandaloneDeadheadMinutes = parsedSegmentAttempt.standaloneDhdLines.reduce(
    (sum, entry) => sum + entry.minutes,
    0,
  );
  if (header.totalDeadheadBlockMinutes == null) {
    if (summedDayDeadheadMinutes > 0 || summedStandaloneDeadheadMinutes > 0) {
      header = {
        ...header,
        totalDeadheadBlockMinutes: summedDayDeadheadMinutes > 0 ? summedDayDeadheadMinutes : summedStandaloneDeadheadMinutes,
        totalDeadheadBlockSource: "summedDhdLines",
      };
    }
  }
  const totalDeadheadBlockRecoveredFromDayLines = header.totalDeadheadBlockSource === "summedDhdLines";
  const incompleteFragments = collectICrewIncompleteFragments(
    parsedSegmentAttempt.attemptedLegParseResults,
  );
  const parserNotes: string[] = [];
  const missingTotals = [
    header.totalCreditMinutes == null ? "totalCredit" : null,
    header.scheduledBlockMinutes == null ? "scheduledBlock" : null,
    header.totalDeadheadBlockMinutes == null &&
    header.totalDeadheadBlockSource !== "summedDhdLines"
      ? "totalDeadheadBlock"
      : null,
    header.tafbCredit == null ? "tafbCredit" : null,
    header.tafbElapsed == null ? "tafbElapsed" : null,
  ].filter((value): value is string => Boolean(value));
  if (missingTotals.length > 0) {
    parserNotes.push(
      `iCrew partial text did not include summary totals for: ${missingTotals.join(", ")}.`,
    );
  }
  if (header.totalDeadheadBlockSource === "summedDhdLines") {
    parserNotes.push("Deadhead total recovered from day-level DHD lines.");
  }
  if (parsedSegmentAttempt.standaloneDhdLines.length > 0) {
    parserNotes.push(
      `Attached ${parsedSegmentAttempt.standaloneDhdLines.length} standalone DHD line${parsedSegmentAttempt.standaloneDhdLines.length === 1 ? "" : "s"} to matching leg block evidence.`,
    );
  }
  if (incompleteFragments.length > 0) {
    parserNotes.push(
      `iCrew partial text ended with ${incompleteFragments.length} incomplete leg row${incompleteFragments.length === 1 ? "" : "s"}.`,
    );
  }
  const segmentsWithKinds = parsedSegments.map((segment) => {
    const explicitDeadhead = segment.marker === "D";
    const standaloneDeadhead = segment.isDeadhead === true;
    return {
      ...segment,
      isDeadhead: explicitDeadhead || standaloneDeadhead,
      segmentType: explicitDeadhead || standaloneDeadhead
        ? ("deadhead" as const)
        : segment.segmentType ?? ("operating" as const),
    };
  });

  const segmentsByDay = new Map<string, typeof segmentsWithKinds>();
  for (const segment of segmentsWithKinds) {
    const existing = segmentsByDay.get(segment.dayToken) ?? [];
    existing.push(segment);
    segmentsByDay.set(segment.dayToken, existing);
  }

  for (const [dayToken, daySegments] of segmentsByDay) {
    const totals = dayTotals.get(dayToken);
    if (!totals || totals.deadheadBlockMinutes <= 0) {
      continue;
    }
    applyRegionalDeadheadInference({
      segments: daySegments,
      targetDeadheadMinutes: totals.deadheadBlockMinutes,
    });
  }

  const currentDeadheadMinutes = segmentsWithKinds
    .filter((segment) => segment.isDeadhead)
    .reduce((sum, segment) => sum + parseDotDurationToMinutes(segment.scheduledBlock), 0);
  if (
    typeof header.totalDeadheadBlockMinutes === "number" &&
    currentDeadheadMinutes !== header.totalDeadheadBlockMinutes
  ) {
    applyRegionalDeadheadInference({
      segments: segmentsWithKinds,
      targetDeadheadMinutes: header.totalDeadheadBlockMinutes,
    });
  } else if (typeof header.totalDeadheadBlockMinutes !== "number") {
    const unresolvedRegionalCandidates = segmentsWithKinds.filter(
      (segment) =>
        !segment.isDeadhead &&
        ["9E", "OO", "YX"].includes((segment.carrier ?? "").toUpperCase()),
    );
    if (unresolvedRegionalCandidates.length > 0) {
      parserNotes.push(
        "Regional/offline carrier segments were preserved without confirmed deadhead classification because DHD/TDHD totals were not available.",
      );
    }
  }

  const allTripSegments: RotationChainLeg[] = segmentsWithKinds.map((segment, index) => ({
    index: index + 1,
    flightNumber: segment.flightNumber,
    departureAirport: segment.departureAirport,
    arrivalAirport: segment.arrivalAirport,
    scheduledOut: segment.scheduledOut,
    scheduledIn: segment.scheduledIn,
    scheduledBlock: segment.scheduledBlock,
    turn: segment.turn,
    date: segment.date,
    isDeadhead: segment.isDeadhead,
    carrier: segment.carrier,
    confirmationCode: segment.confirmationCode,
    sourceText: segment.sourceText,
    segmentType: segment.isDeadhead ? "deadhead" : segment.segmentType ?? "operating",
  }));

  for (let index = 1; index < allTripSegments.length; index += 1) {
    const previousSegment = allTripSegments[index - 1];
    const currentSegment = allTripSegments[index];
    if (
      previousSegment?.arrivalAirport &&
      currentSegment?.departureAirport &&
      previousSegment.arrivalAirport !== currentSegment.departureAirport
    ) {
      parserNotes.push(
        `Route continuity warning: ${previousSegment.arrivalAirport} does not connect directly to ${currentSegment.departureAirport} between ${previousSegment.departureAirport}-${previousSegment.arrivalAirport} and ${currentSegment.departureAirport}-${currentSegment.arrivalAirport}.`,
      );
      break;
    }
  }

  const deadheadAnnotations: ICrewDeadheadAnnotation[] = segmentsWithKinds
    .filter((segment) => segment.isDeadhead)
    .map((segment) => ({
      cityPair: `${segment.departureAirport}-${segment.arrivalAirport}`,
      origin: segment.departureAirport ?? "?",
      destination: segment.arrivalAirport ?? "?",
      carrier: segment.carrier ?? "DL",
      carrierName: REGIONAL_CARRIER_NAMES[(segment.carrier ?? "").toUpperCase()],
      flightNumber: normalizeCarrierFlight(segment.carrier, segment.flightNumber).flightNumber,
      scheduledOut: segment.scheduledOut ?? "TBD",
      scheduledIn: segment.scheduledIn ?? "TBD",
      scheduledBlock: segment.scheduledBlock ?? "0:00",
      scheduledBlockMinutes: parseDotDurationToMinutes(segment.scheduledBlock?.replace(":", ".")),
      confirmationCode: segment.confirmationCode ?? undefined,
      marker: segment.marker,
      reason:
        segment.marker === "D"
          ? "explicit_D_marker"
          : segment.deadheadSource === "standalone_dhd_line"
            ? "attached_from_standalone_dhd_line"
          : "inferred_from_dhd_totals_and_regional_carrier",
    }));

  const visibleOperatingLegs = excludeDeadheadLegsFromVisibleChain(allTripSegments, deadheadAnnotations)
    .map((leg, index) => ({
      ...leg,
      index: index + 1,
      isDeadhead: false,
      segmentType: leg.segmentType === "return_to_gate" ? "return_to_gate" : ("operating" as const),
    }));

  const snapshot = computeSnapshotFromUserFacingChain({
    userFacingLegs: visibleOperatingLegs,
    headerScheduledBlockMinutes: undefined,
    fallbackScheduledBlockMinutes: 0,
    finalArrivalFallback: "TBD",
  });
  const partialDiagnosis = diagnoseScreenshotRotationPartialStatus({
    userFacingLegs: visibleOperatingLegs,
    allTripSegments,
    context: {
      base: header.base,
      startDate: header.tripDates.split("-")[0]?.trim(),
      endDate: header.tripDates.split("-")[1]?.trim(),
    },
  });
  const operatingScheduledBlockMinutes =
    typeof header.scheduledBlockMinutes === "number"
      ? header.scheduledBlockMinutes
      : snapshot.scheduledBlockMinutes;
  const deadheadScheduledBlockMinutes = deadheadAnnotations.reduce(
    (sum, annotation) => sum + annotation.scheduledBlockMinutes,
    0,
  );
  const scheduledBlockSource: ParsedICrewTextResult["scheduledBlockSource"] =
    typeof header.scheduledBlockMinutes === "number"
      ? "iCrewSummaryTotals"
      : visibleOperatingLegs.length > 0
        ? "computedFromPartialICrewLegs"
        : null;
  const hasRequiredICrewSummaryFields =
    header.rotationNumber != null &&
    header.effectiveDate != null &&
    header.tripDates != null &&
    header.totalCreditMinutes != null &&
    header.scheduledBlockMinutes != null &&
    header.tafbCredit != null &&
    header.tafbElapsed != null;
  const hasResolvedDeadheadSummary =
    header.totalDeadheadBlockMinutes != null ||
    deadheadScheduledBlockMinutes > 0 ||
    totalDeadheadBlockRecoveredFromDayLines;
  const hasCompleteICrewRotationEnvelope =
    hasRequiredICrewSummaryFields &&
    (hasResolvedDeadheadSummary || deadheadAnnotations.length === 0);
  const iCrewTotalsAreIncomplete =
    header.totalCreditMinutes == null ||
    header.scheduledBlockMinutes == null ||
    header.tafbCredit == null ||
    header.tafbElapsed == null ||
    (!hasResolvedDeadheadSummary && deadheadAnnotations.length > 0);
  const partialStatus =
    incompleteFragments.length > 0 ||
    iCrewTotalsAreIncomplete ||
    (!hasCompleteICrewRotationEnvelope && partialDiagnosis.isPartial);
  const partialReason =
    iCrewTotalsAreIncomplete || incompleteFragments.length > 0
      ? "Partial iCrew text detected. Please paste the full rotation text."
      : partialDiagnosis.partialReason;

  return {
    header,
    layoverCities,
    layoverDetails,
    normalizedCandidates: segmentsWithKinds,
    allTripSegments,
    visibleOperatingLegs,
    logbookLegs: visibleOperatingLegs,
    deadheadAnnotations,
    standaloneDhdAttachments: parsedSegmentAttempt.standaloneDhdLines,
    incompleteFragments,
    parserNotes,
    partialStatus,
    partialReason,
    finalOperatingArrival: snapshot.finalArrival,
    finalArrivalAfterDeadhead: allTripSegments.at(-1)?.arrivalAirport ?? snapshot.finalArrival,
    operatingScheduledBlockMinutes,
    deadheadScheduledBlockMinutes,
    scheduledBlockSource,
  };
}

export function parseICrewTextWithDiagnostics(rawText: string): ICrewParseDebugResult {
  try {
    const parsedSegmentAttempt = parseICrewSegments(rawText);
    const parsedHeaderParts = extractICrewHeaderParts(rawText, parsedSegmentAttempt.segments);
    const dayTotals = parseDayLevelDhdTotals(rawText);
    const summedDayDeadheadMinutes = Array.from(dayTotals.values()).reduce(
      (sum, totals) => sum + totals.deadheadBlockMinutes,
      0,
    );
    const summedStandaloneDeadheadMinutes = parsedSegmentAttempt.standaloneDhdLines.reduce(
      (sum, entry) => sum + entry.minutes,
      0,
    );
    const partialHeader = {
      fleetCategory: parsedHeaderParts.fleetCategory ?? undefined,
      base: parsedHeaderParts.base ?? undefined,
      rotationNumber: parsedHeaderParts.rotationNumber ?? undefined,
      position: parsedHeaderParts.position ?? undefined,
      effectiveDate: parsedHeaderParts.effectiveDate ?? undefined,
      reportTime: parsedHeaderParts.reportTime ?? undefined,
      tripDates: parsedHeaderParts.tripDates ?? undefined,
    };
    const partialTotals = {
      tripDates: parsedHeaderParts.tripDates ?? null,
      totalCreditMinutes: parsedHeaderParts.totalCreditToken ? parseDotDurationToMinutes(parsedHeaderParts.totalCreditToken) : null,
      scheduledBlockMinutes: parsedHeaderParts.scheduledBlockToken ? parseDotDurationToMinutes(parsedHeaderParts.scheduledBlockToken) : null,
      totalDeadheadBlockMinutes: parsedHeaderParts.totalDeadheadToken
        ? parseDotDurationToMinutes(parsedHeaderParts.totalDeadheadToken)
        : summedDayDeadheadMinutes > 0
          ? summedDayDeadheadMinutes
          : summedStandaloneDeadheadMinutes > 0
            ? summedStandaloneDeadheadMinutes
          : null,
      totalDeadheadBlockSource: parsedHeaderParts.totalDeadheadToken
        ? "tdhdSummary"
        : summedDayDeadheadMinutes > 0
          ? "summedDhdLines"
          : summedStandaloneDeadheadMinutes > 0
            ? "summedDhdLines"
          : "none",
      tafbCredit: parsedHeaderParts.tafbCreditToken ? parsedHeaderParts.tafbCreditToken.replace(".", ":") : null,
      tafbElapsed: parsedHeaderParts.tafbElapsedToken ? parsedHeaderParts.tafbElapsedToken.replace(".", ":") : null,
    };
    if (parsedSegmentAttempt.segments.length === 0) {
      return {
        parserSucceeded: false,
        parsed: null,
        diagnostics: buildICrewParserDiagnostics(
          rawText,
          "legs",
          "Unable to parse iCrew leg rows from the provided text.",
          {
            parsedHeader: partialHeader,
            parsedTotals: partialTotals,
            attemptedLegParseResults: parsedSegmentAttempt.attemptedLegParseResults,
            parsedSegments: parsedSegmentAttempt.segments.map((segment) => ({
              dayToken: segment.dayToken,
              route: `${segment.departureAirport}-${segment.arrivalAirport}`,
              carrier: segment.carrier ?? null,
              flightNumber: segment.flightNumber ?? null,
              scheduledOut: segment.scheduledOut ?? null,
              scheduledIn: segment.scheduledIn ?? null,
              scheduledBlock: segment.scheduledBlock ?? null,
              isDeadhead: Boolean(segment.isDeadhead),
              segmentType: segment.isDeadhead ? "deadhead" : segment.segmentType ?? "operating",
              sourceText: segment.sourceText ?? null,
            })),
            standaloneDhdLines: parsedSegmentAttempt.standaloneDhdLines,
          },
        ),
      };
    }

    let parsed: ParsedICrewTextResult;
    try {
      parsed = parseICrewTextInternal(rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse iCrew text.";
      const stage: ICrewParserDiagnostics["parserStageFailed"] =
        message.includes("header fields")
          ? "header"
          : message.includes("totals fields")
            ? "totals"
            : message.includes("leg rows")
              ? "legs"
              : "displayModel";
      return {
        parserSucceeded: false,
        parsed: null,
        diagnostics: buildICrewParserDiagnostics(rawText, stage, message, {
          parsedHeader: partialHeader,
          parsedTotals: partialTotals,
          attemptedLegParseResults: parsedSegmentAttempt.attemptedLegParseResults,
          parsedSegments: parsedSegmentAttempt.segments.map((segment) => ({
            dayToken: segment.dayToken,
            route: `${segment.departureAirport}-${segment.arrivalAirport}`,
            carrier: segment.carrier ?? null,
            flightNumber: segment.flightNumber ?? null,
            scheduledOut: segment.scheduledOut ?? null,
            scheduledIn: segment.scheduledIn ?? null,
            scheduledBlock: segment.scheduledBlock ?? null,
            isDeadhead: Boolean(segment.isDeadhead),
            segmentType: segment.isDeadhead ? "deadhead" : segment.segmentType ?? "operating",
            sourceText: segment.sourceText ?? null,
          })),
          standaloneDhdLines: parsedSegmentAttempt.standaloneDhdLines,
        }),
      };
    }

    return {
      parserSucceeded: true,
        parsed,
        diagnostics: buildICrewParserDiagnostics(rawText, null, null, {
          parsedHeader: partialHeader,
          parsedTotals: partialTotals,
          attemptedLegParseResults: parsedSegmentAttempt.attemptedLegParseResults,
          parsedSegments: parsed.allTripSegments.map((segment) => ({
            dayToken: segment.date?.match(/^(\d{2}[A-Z]{3})$/i)?.[1]?.slice(0, 2) ?? "??",
            route: `${segment.departureAirport}-${segment.arrivalAirport}`,
            carrier: segment.carrier ?? null,
            flightNumber: segment.flightNumber ?? null,
            scheduledOut: segment.scheduledOut ?? null,
            scheduledIn: segment.scheduledIn ?? null,
            scheduledBlock: segment.scheduledBlock ?? null,
            isDeadhead: Boolean(segment.isDeadhead),
            segmentType: segment.segmentType ?? (segment.isDeadhead ? "deadhead" : "operating"),
            sourceText: segment.sourceText ?? null,
          })),
          standaloneDhdLines: parsed.standaloneDhdAttachments,
          resultingDeadheadLegs: parsed.deadheadAnnotations.map(
            (annotation) =>
              `${annotation.cityPair} ${annotation.carrier}${annotation.flightNumber} ${annotation.scheduledBlock} ${annotation.reason}`,
          ),
        }),
      };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse iCrew text.";
    return {
      parserSucceeded: false,
      parsed: null,
      diagnostics: buildICrewParserDiagnostics(rawText, "displayModel", message),
    };
  }
}

export function parseICrewText(rawText: string): ParsedICrewTextResult {
  const result = parseICrewTextWithDiagnostics(rawText);
  if (!result.parserSucceeded || !result.parsed) {
    throw new Error(result.diagnostics.parserError ?? "Unable to parse iCrew text.");
  }
  return result.parsed;
}
