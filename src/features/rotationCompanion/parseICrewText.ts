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
  totalCreditMinutes: number;
  scheduledBlockMinutes: number;
  totalDeadheadBlockMinutes: number;
  tafbCredit: string;
  tafbElapsed: string;
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
  reason: "explicit_D_marker" | "inferred_from_dhd_totals_and_regional_carrier";
};

export type ParsedICrewTextResult = {
  header: ICrewHeader;
  layoverCities: string[];
  normalizedCandidates: RotationChainCandidate[];
  allTripSegments: RotationChainLeg[];
  visibleOperatingLegs: RotationChainLeg[];
  logbookLegs: RotationChainLeg[];
  deadheadAnnotations: ICrewDeadheadAnnotation[];
  partialStatus: boolean;
  partialReason: string | null;
  finalOperatingArrival: string;
  finalArrivalAfterDeadhead: string;
  operatingScheduledBlockMinutes: number;
  deadheadScheduledBlockMinutes: number;
  scheduledBlockSource: "iCrewSummaryTotals";
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
    tafbCredit?: string | null;
    tafbElapsed?: string | null;
  } | null;
  attemptedLegParseResults: Array<{
    line: string;
    matched: boolean;
    failureReason: string | null;
    parsedTokens?: Record<string, string | null>;
  }>;
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

function isDayOnlyToken(token?: string | null) {
  return /^\d{1,2}$/i.test(token ?? "");
}

function isFlightTokenLike(token?: string | null) {
  return /^(?:\d{3,5}|D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}|\d(?:D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5}))$/i.test(
    token ?? "",
  );
}

export function parseICrewFlightToken(dayToken: string, rawToken: string) {
  const normalizedDay = String(Number(dayToken));
  const withoutDayPrefix =
    rawToken.startsWith(normalizedDay) ? rawToken.slice(normalizedDay.length) : rawToken;
  if (/^\d{2,5}$/i.test(withoutDayPrefix)) {
    return {
      marker: null,
      carrier: "DL",
      flightNumber: normalizeCarrierFlight("DL", withoutDayPrefix).flightNumber,
    };
  }
  if (/^D\d+$/i.test(withoutDayPrefix)) {
    return {
      marker: "D" as const,
      carrier: "DL",
      flightNumber: normalizeCarrierFlight("DL", withoutDayPrefix.slice(1)).flightNumber,
    };
  }
  const tokenMatch = withoutDayPrefix.match(/^([A-Z0-9]{2})(\d{2,5})$/i);
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
  const normalized = normalizeCarrierFlight("DL", withoutDayPrefix);
  return {
    marker: null,
    carrier: normalized.carrier || "DL",
    flightNumber: normalized.flightNumber,
  };
}

function parseFlightToken(dayToken: string, rawToken: string) {
  return parseICrewFlightToken(dayToken, rawToken);
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
    legCandidateLines: normalizedLines.filter((line) =>
      /(SLC|SJC|CLE|LGA|MCI|D2903|9E5045|1272|1254|2855|563)/i.test(line),
    ),
    parsedHeader: extra?.parsedHeader ?? null,
    parsedTotals: extra?.parsedTotals ?? null,
    attemptedLegParseResults: extra?.attemptedLegParseResults ?? [],
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

  const missingTotals = [
    !parts.tripDates ? "tripDates" : null,
    !parts.totalCreditToken ? "totalCredit" : null,
    !parts.scheduledBlockToken ? "scheduledBlock" : null,
    !parts.totalDeadheadToken ? "totalDeadheadBlock" : null,
    !parts.tafbCreditToken ? "tafbCredit" : null,
    !parts.tafbElapsedToken ? "tafbElapsed" : null,
  ].filter((value): value is string => Boolean(value));
  if (missingTotals.length > 0) {
    throw new Error(`Unable to parse iCrew totals fields: ${missingTotals.join(", ")}`);
  }

  return {
    fleetCategory: parts.fleetCategory!,
    base: parts.base!,
    rotationNumber: parts.rotationNumber!,
    position: parts.position!,
    effectiveDate: parts.effectiveDate!,
    reportTime: parts.reportTime!,
    tripDates: parts.tripDates!,
    totalCreditMinutes: parseDotDurationToMinutes(parts.totalCreditToken),
    scheduledBlockMinutes: parseDotDurationToMinutes(parts.scheduledBlockToken),
    totalDeadheadBlockMinutes: parseDotDurationToMinutes(parts.totalDeadheadToken),
    tafbCredit: parts.tafbCreditToken!.replace(".", ":"),
    tafbElapsed: parts.tafbElapsedToken!.replace(".", ":"),
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
      ["9E", "OO"].includes((segment.carrier ?? "").toUpperCase()),
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
  });
}

function parseICrewSegments(rawText: string) {
  const segments: Array<
    RotationChainCandidate & {
      dayToken: string;
      marker?: "D" | "O" | null;
      confirmationCode?: string | null;
    }
  > = [];
  const attemptedLegParseResults: ICrewParserDiagnostics["attemptedLegParseResults"] = [];
  let currentDayToken: string | null = null;
  let lastSegment: (typeof segments)[number] | null = null;
  let lastRawFlightToken: string | null = null;

  for (const line of splitRawLines(rawText)) {
    const normalizedLine = normalizeICrewLine(line);
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

    const startsLikeContinuationRow =
      tokens[0] &&
      isAirportToken(tokens[0]) &&
      /^\d{4}$/.test(tokens[1] ?? "") &&
      isArrivalToken(tokens[2]) &&
      lastRawFlightToken;

    if (tokens[0] && isDayOnlyToken(tokens[0]) && tokens[1] && isFlightTokenLike(tokens[1])) {
      dayToken = tokens[0].padStart(2, "0");
      currentDayToken = dayToken;
      rawFlightToken = tokens[1];
      cursor = 2;
    } else if (tokens[0] && /^(\d)(D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5})$/i.test(tokens[0])) {
      const match = tokens[0].match(/^(\d)(D\d{2,5}|DL\d{2,5}|9E\d{2,5}|OO\d{2,5})$/i);
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
    let trailingTokens = tokens.slice(cursor + 3);

    const gluedDepartureMatch = departureAirportToken?.match(/^(\*?[A-Z]{3})(\d{4})$/i);
    if (gluedDepartureMatch?.[1] && gluedDepartureMatch?.[2]) {
      departureAirportToken = gluedDepartureMatch[1];
      departureTimeToken = gluedDepartureMatch[2];
      arrivalToken = tokens[cursor + 1] ?? null;
      trailingTokens = tokens.slice(cursor + 2);
    }

    if (!isAirportToken(departureAirportToken) || !/^\d{4}$/.test(departureTimeToken ?? "") || !isArrivalToken(arrivalToken)) {
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
        },
      });
      continue;
    }

    let blockToken: string | null = null;
    for (const trailingToken of trailingTokens) {
      const stripped = trailingToken.replace(/^\*+/, "");
      if (/^\d{1,2}[.:]\d{2}(?:BL)?$/i.test(stripped)) {
        blockToken = stripped.replace(/BL$/i, "");
        break;
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

    const arrivalMatch = arrivalToken.match(/^\*?([A-Z]{3})\.(\d{4})$/i);
    const token = parseFlightToken(dayToken, rawFlightToken.toUpperCase());
    const confirmationCode = normalizedLine.match(/CONFIRMATION\s+#?([A-Z0-9]+)/i)?.[1]?.toUpperCase() ?? null;
    const parsedSegment = {
      dayToken,
      date: `${dayToken}APR`,
      flightNumber: token.flightNumber,
      carrier: token.carrier,
      departureAirport: stripLeadingMarkerAirport(departureAirportToken),
      arrivalAirport: arrivalMatch?.[1]?.toUpperCase() ?? null,
      scheduledOut: `${formatClockDigits(departureTimeToken)} ${dayToken}APR`,
      scheduledIn: `${formatClockDigits(arrivalMatch?.[2])} ${dayToken}APR`,
      scheduledBlock: formatDurationString(blockToken),
      sourceText: normalizedLine,
      rawSourceLine: line.trim(),
      confirmationCode,
      marker: token.marker,
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
        arrivalTime: arrivalMatch?.[2] ?? null,
        blockToken,
        confirmationCode,
      },
    });
  }

  return { segments, attemptedLegParseResults };
}

function parseICrewTextInternal(rawText: string): ParsedICrewTextResult {
  const parsedSegments = parseICrewSegments(rawText).segments;
  if (parsedSegments.length === 0) {
    throw new Error("Unable to parse iCrew leg rows from the provided text.");
  }

  const header = parseICrewHeader(rawText, parsedSegments);
  const layoverCities = parseICrewLayoverCities(rawText);
  const dayTotals = parseDayLevelDhdTotals(rawText);
  const segmentsWithKinds = parsedSegments.map((segment) => {
    const explicitDeadhead = segment.marker === "D";
    return {
      ...segment,
      isDeadhead: explicitDeadhead,
      segmentType: explicitDeadhead ? ("deadhead" as const) : ("operating" as const),
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
  if (currentDeadheadMinutes !== header.totalDeadheadBlockMinutes) {
    applyRegionalDeadheadInference({
      segments: segmentsWithKinds,
      targetDeadheadMinutes: header.totalDeadheadBlockMinutes,
    });
  }

  const allTripSegments: RotationChainLeg[] = segmentsWithKinds.map((segment, index) => ({
    index: index + 1,
    flightNumber: segment.flightNumber,
    departureAirport: segment.departureAirport,
    arrivalAirport: segment.arrivalAirport,
    scheduledOut: segment.scheduledOut,
    scheduledIn: segment.scheduledIn,
    scheduledBlock: segment.scheduledBlock,
    date: segment.date,
    isDeadhead: segment.isDeadhead,
    carrier: segment.carrier,
    confirmationCode: segment.confirmationCode,
    sourceText: segment.sourceText,
    segmentType: segment.isDeadhead ? "deadhead" : "operating",
  }));

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
          : "inferred_from_dhd_totals_and_regional_carrier",
    }));

  const visibleOperatingLegs = excludeDeadheadLegsFromVisibleChain(allTripSegments, deadheadAnnotations)
    .map((leg, index) => ({ ...leg, index: index + 1, isDeadhead: false, segmentType: "operating" as const }));

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

  return {
    header,
    layoverCities,
    normalizedCandidates: segmentsWithKinds,
    allTripSegments,
    visibleOperatingLegs,
    logbookLegs: visibleOperatingLegs,
    deadheadAnnotations,
    partialStatus: partialDiagnosis.isPartial,
    partialReason: partialDiagnosis.partialReason,
    finalOperatingArrival: snapshot.finalArrival,
    finalArrivalAfterDeadhead: deadheadAnnotations.at(-1)?.destination ?? snapshot.finalArrival,
    operatingScheduledBlockMinutes: snapshot.scheduledBlockMinutes,
    deadheadScheduledBlockMinutes: deadheadAnnotations.reduce((sum, annotation) => sum + annotation.scheduledBlockMinutes, 0),
    scheduledBlockSource: "iCrewSummaryTotals",
  };
}

export function parseICrewTextWithDiagnostics(rawText: string): ICrewParseDebugResult {
  try {
    const parsedSegmentAttempt = parseICrewSegments(rawText);
    const parsedHeaderParts = extractICrewHeaderParts(rawText, parsedSegmentAttempt.segments);
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
      totalDeadheadBlockMinutes: parsedHeaderParts.totalDeadheadToken ? parseDotDurationToMinutes(parsedHeaderParts.totalDeadheadToken) : null,
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
