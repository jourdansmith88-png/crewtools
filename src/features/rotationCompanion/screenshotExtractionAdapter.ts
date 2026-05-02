import { parseRotationText } from "../../utils/rotationCompanion.ts";
import type {
  ParseMiCrewScreenshotsOutput,
  ParsedScreenshotRotation,
  UploadedEvidenceSummary,
  UploadedImage,
} from "../../ai/tools/reroutePay/types.ts";
import { parseMiCrewScreenshots } from "../../ai/tools/reroutePay/parseMiCrewScreenshots.ts";

export type RotationScreenshotExtractionResult =
  | {
      ok: true;
      normalizedText: string;
      extracted: {
        legs: Array<{
          sourceType: "original" | "rerouted";
          day?: string | null;
          type?: "flight" | "deadhead" | "unknown";
          flightNumber?: string | null;
          carrier?: string | null;
          origin?: string | null;
          destination?: string | null;
          depTime?: string | null;
          arrTime?: string | null;
          blockMinutes?: number | null;
          turnMinutes?: number | null;
          isDeadhead?: boolean;
          legKind?: "operating" | "deadhead";
          confirmationCode?: string | null;
          sourceText?: string | null;
          sourceImageIndex?: number;
        }>;
        layovers: string[];
        dutyMarkers: string[];
        totals: {
          rotationNumbers: string[];
          totalCreditMinutes?: number;
          totalScheduledBlockMinutes?: number;
          reportTimes: string[];
          releaseTimes: string[];
        };
      };
      confidence: "high" | "medium" | "low";
      warnings: string[];
      missingSections: string[];
      debug: {
        screenshotParsingActive: boolean;
        screenshotsCount: number;
        originalImageCountReceived: number;
        changedImageCountReceived: number;
        visionModelCalled: boolean;
        modelName?: string;
        rawTextPreview: string[];
        rawVisionResponsePreview: string[];
        structuredJsonParseError?: string;
        extractionNotes: string[];
        fallbackRegexLegsParsed: number;
        rotationsParsed: number;
        legsParsed: number;
        combinedTextLength: number;
        deduplicatedLegCount: number;
        duplicateLegsRemoved: number;
        duplicateReasons: string[];
        stitchingWarnings: string[];
        inferredSequence: string[];
        orderingMethod: "inferred" | "upload_order_fallback" | "ambiguous";
        chainLength: number;
        fragmentsDetected: number;
        orderingStrategy: "continuity" | "time_fallback" | "ambiguous";
        unmatchedLegs: number;
        finalOrderedChainCount: number;
        userFacingLegs: number;
        discardedFragments: number;
        discardedFragmentReasons: string[];
        visibleActivityCards: number;
        rawFlightCandidates: number;
        finalFlightSegments: number;
        operatingSegments: number;
        deadheadSegments: number;
        deadheadLegsDetected: number;
        deadheadConfirmationCodes: string[];
        deadheadDetectionNotes: string[];
        returnToGateSegments: number;
        layoverCards: number;
        duplicateSegmentsRemoved: number;
        micrewHeaderFound: boolean;
        parsedHeader: MicrewHeaderSummary;
        tripDatesSource: "header" | "fallback_legs" | "unknown";
        rotationNumberSource: "header" | "unknown";
        perScreenshotTrace: Array<{
          screenshotIndex: number;
          screenshotName: string;
          sourceFormat: "micrew_mobile" | "icrew_printout" | "unknown";
          rawExtractedText: string;
          normalizedText: string;
          detectedFirstLeg?: string;
          detectedLastLeg?: string;
          detectedDates: string[];
          detectedLayovers: string[];
        }>;
        legCandidates: Array<{
          sourceScreenshotIndex: number;
          flightNumber?: string | null;
          departureAirport?: string | null;
          arrivalAirport?: string | null;
          scheduledOut?: string | null;
          scheduledIn?: string | null;
          scheduledBlock?: string | null;
          turn?: string | null;
          date?: string | null;
          isDeadhead: boolean;
          carrier?: string | null;
          confirmationCode?: string | null;
          sourceText?: string | null;
          rawSourceLine: string;
        }>;
        orderedChain: Array<{
          index: number;
          flightNumber?: string | null;
          departureAirport?: string | null;
          arrivalAirport?: string | null;
          scheduledOut?: string | null;
          scheduledIn?: string | null;
          scheduledBlock?: string | null;
          turn?: string | null;
          date?: string | null;
          isDeadhead: boolean;
          carrier?: string | null;
          confirmationCode?: string | null;
          sourceText?: string | null;
        }>;
      };
    }
  | {
      ok: false;
      error: string;
      warnings: string[];
      missingSections: string[];
      debug: {
        screenshotParsingActive: boolean;
        screenshotsCount: number;
        originalImageCountReceived: number;
        changedImageCountReceived: number;
        visionModelCalled: boolean;
        modelName?: string;
        rawTextPreview: string[];
        rawVisionResponsePreview: string[];
        structuredJsonParseError?: string;
        extractionNotes: string[];
        fallbackRegexLegsParsed: number;
        rotationsParsed: number;
        legsParsed: number;
        combinedTextLength: number;
        deduplicatedLegCount: number;
        duplicateLegsRemoved: number;
        duplicateReasons: string[];
        stitchingWarnings: string[];
        inferredSequence: string[];
        orderingMethod: "inferred" | "upload_order_fallback" | "ambiguous";
        chainLength: number;
        fragmentsDetected: number;
        orderingStrategy: "continuity" | "time_fallback" | "ambiguous";
        unmatchedLegs: number;
        finalOrderedChainCount: number;
        userFacingLegs: number;
        discardedFragments: number;
        discardedFragmentReasons: string[];
        visibleActivityCards: number;
        rawFlightCandidates: number;
        finalFlightSegments: number;
        operatingSegments: number;
        deadheadSegments: number;
        deadheadLegsDetected: number;
        deadheadConfirmationCodes: string[];
        deadheadDetectionNotes: string[];
        returnToGateSegments: number;
        layoverCards: number;
        duplicateSegmentsRemoved: number;
        micrewHeaderFound: boolean;
        parsedHeader: MicrewHeaderSummary;
        tripDatesSource: "header" | "fallback_legs" | "unknown";
        rotationNumberSource: "header" | "unknown";
        perScreenshotTrace: Array<{
          screenshotIndex: number;
          screenshotName: string;
          sourceFormat: "micrew_mobile" | "icrew_printout" | "unknown";
          rawExtractedText: string;
          normalizedText: string;
          detectedFirstLeg?: string;
          detectedLastLeg?: string;
          detectedDates: string[];
          detectedLayovers: string[];
        }>;
        legCandidates: Array<{
          sourceScreenshotIndex: number;
          flightNumber?: string | null;
          departureAirport?: string | null;
          arrivalAirport?: string | null;
          scheduledOut?: string | null;
          scheduledIn?: string | null;
          scheduledBlock?: string | null;
          turn?: string | null;
          date?: string | null;
          isDeadhead: boolean;
          carrier?: string | null;
          confirmationCode?: string | null;
          sourceText?: string | null;
          rawSourceLine: string;
        }>;
        orderedChain: Array<{
          index: number;
          flightNumber?: string | null;
          departureAirport?: string | null;
          arrivalAirport?: string | null;
          scheduledOut?: string | null;
          scheduledIn?: string | null;
          scheduledBlock?: string | null;
          turn?: string | null;
          date?: string | null;
          isDeadhead: boolean;
          carrier?: string | null;
          confirmationCode?: string | null;
          sourceText?: string | null;
        }>;
      };
    };

function formatMinutes(minutes?: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) {
    return undefined;
  }
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function normalizeDayLabel(day?: string | null) {
  if (!day) {
    return undefined;
  }
  const trimmed = day.trim();
  const numeric = trimmed.match(/(\d+)/);
  if (numeric?.[1]) {
    return `Day ${numeric[1]}`;
  }
  return trimmed;
}

function buildRotationHeaderLines(rotation: ParsedScreenshotRotation) {
  const lines: string[] = [];
  if (rotation.rotationNumber || rotation.dateRange) {
    lines.push(
      [rotation.rotationNumber ? `ROT ${rotation.rotationNumber}` : null, rotation.dateRange ?? null]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (rotation.reportTime) {
    lines.push(`Rpt- ${rotation.reportTime}`);
  }
  if (rotation.releaseTime) {
    lines.push(`Rls- ${rotation.releaseTime}`);
  }
  if (rotation.creditMinutes != null) {
    lines.push(`Credit- ${formatMinutes(rotation.creditMinutes)}`);
  }
  if (rotation.tafbMinutes != null) {
    lines.push(`TAFB- ${formatMinutes(rotation.tafbMinutes)}`);
  }
  if (rotation.layovers.length > 0) {
    lines.push(`Layover- ${rotation.layovers.join(", ")}`);
  }
  return lines.filter(Boolean);
}

function buildNormalizedTextFromRotations(rotations: ParsedScreenshotRotation[]) {
  const lines: string[] = [];
  rotations.forEach((rotation) => {
    const headerLines = buildRotationHeaderLines(rotation);
    if (headerLines.length > 0) {
      lines.push(...headerLines);
    }

    let lastDayLabel: string | undefined;
    rotation.legs.forEach((leg) => {
      const dayLabel = normalizeDayLabel(leg.day);
      if (dayLabel && dayLabel !== lastDayLabel) {
        lines.push(dayLabel);
        lastDayLabel = dayLabel;
      }

      const route =
        leg.origin && leg.destination ? `${leg.origin.toUpperCase()}-${leg.destination.toUpperCase()}` : undefined;
      const flightLabel = leg.flightNumber ?? null;
      if (route || flightLabel || leg.blockMinutes != null) {
        if (route || flightLabel) {
          lines.push(`${flightLabel ?? "UNK"} : ${route ?? "UNK-UNK"}`);
        }
        if (leg.depTime) {
          lines.push(`Dep- ${leg.depTime}`);
        }
        if (leg.arrTime) {
          lines.push(`Arr- ${leg.arrTime}`);
        }
        if (leg.blockMinutes != null || leg.turnMinutes != null) {
          const block = leg.blockMinutes != null ? `Blk- ${formatMinutes(leg.blockMinutes)}` : null;
          const turn = leg.turnMinutes != null ? `Turn- ${formatMinutes(leg.turnMinutes)}` : null;
          lines.push([block, turn].filter(Boolean).join("/"));
        }
      }
    });

    rotation.layovers.forEach((layover) => {
      lines.push(`LAYOVER: ${layover}`);
    });
    lines.push("");
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function summarizeExtracted(rotations: ParsedScreenshotRotation[]) {
  const legs = rotations.flatMap((rotation) =>
    rotation.legs.map((leg) => ({
      sourceType: rotation.sourceType,
      day: leg.day,
      type: leg.type,
      flightNumber: leg.flightNumber,
      carrier: leg.carrier,
      origin: leg.origin,
      destination: leg.destination,
      depTime: leg.depTime,
      arrTime: leg.arrTime,
      blockMinutes: leg.blockMinutes,
      turnMinutes: leg.turnMinutes,
      isDeadhead: leg.isDeadhead,
      legKind: leg.legKind,
      confirmationCode: leg.confirmationCode,
      sourceText: leg.sourceText,
      sourceImageIndex: leg.sourceImageIndex,
    })),
  );

  return {
    legs,
    layovers: Array.from(new Set(rotations.flatMap((rotation) => rotation.layovers ?? []))),
    dutyMarkers: rotations.flatMap((rotation) =>
      [rotation.reportTime ? `Report- ${rotation.reportTime}` : null, rotation.releaseTime ? `Release- ${rotation.releaseTime}` : null].filter(
        (item): item is string => Boolean(item),
      ),
    ),
    totals: {
      rotationNumbers: rotations
        .map((rotation) => rotation.rotationNumber)
        .filter((item): item is string => Boolean(item)),
      totalCreditMinutes: rotations.find((rotation) => rotation.creditMinutes != null)?.creditMinutes ?? undefined,
      totalScheduledBlockMinutes:
        rotations.find((rotation) => rotation.blockMinutes != null)?.blockMinutes ?? undefined,
      reportTimes: rotations.map((rotation) => rotation.reportTime).filter((item): item is string => Boolean(item)),
      releaseTimes: rotations
        .map((rotation) => rotation.releaseTime)
        .filter((item): item is string => Boolean(item)),
    },
  };
}

function dedupeRotationLegs(rotations: ParsedScreenshotRotation[]) {
  const seen = new Set<string>();
  let duplicateLegsRemoved = 0;
  const stitched = rotations.map((rotation) => {
    const dedupedLegs = rotation.legs.filter((leg) => {
      const dedupeKey = [
        leg.flightNumber?.toUpperCase() ?? "",
        leg.origin?.toUpperCase() ?? "",
        leg.destination?.toUpperCase() ?? "",
        leg.depTime ?? "",
      ].join("|");
      if (!dedupeKey.replace(/\|/g, "")) {
        return true;
      }
      if (seen.has(dedupeKey)) {
        duplicateLegsRemoved += 1;
        return false;
      }
      seen.add(dedupeKey);
      return true;
    });
    return {
      ...rotation,
      legs: dedupedLegs,
    };
  });
  return {
    rotations: stitched,
    duplicateLegsRemoved,
    deduplicatedLegCount: stitched.reduce((sum, rotation) => sum + (rotation.legs?.length ?? 0), 0),
  };
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

type ScreenshotParseEntry = {
  index: number;
  screenshotName: string;
  result: ParseMiCrewScreenshotsOutput;
};

type StitchedLegCandidate = ParsedScreenshotRotation["legs"][number] & {
  sourceType: ParsedScreenshotRotation["sourceType"];
  sequenceHint: number;
  rotationIndex: number;
  screenshotIndex: number;
  dedupeKey: string;
  orderKey: number;
};

type DedupedLegCandidatesResult = {
  deduped: StitchedLegCandidate[];
  duplicateLegsRemoved: number;
  deduplicatedLegCount: number;
  duplicateReasons: string[];
};

type ContinuousLegChainResult = {
  orderedLegs: StitchedLegCandidate[];
  chainLength: number;
  fragmentsDetected: number;
  orderingStrategy: "continuity" | "time_fallback" | "ambiguous";
  unmatchedLegs: number;
  stitchingWarnings: string[];
  discardedFragmentReasons: string[];
};

type MicrewHeaderSummary = {
  rotationNumber?: string;
  base?: string;
  startDate?: string;
  endDate?: string;
  daysCount?: number;
  reportTime?: string;
  reportDate?: string;
  releaseTime?: string;
  releaseDate?: string;
  totalCredit?: string;
  totalScheduledBlock?: string;
  tafb?: string;
  layoverCities: string[];
};

function parseDateToken(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2})([A-Z]{3})/i);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  const month = monthOrder[match[2].toUpperCase()];
  if (!month) {
    return undefined;
  }
  return month * 100 + Number(match[1]);
}

function normalizeDateToken(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2})([A-Z]{3})/i);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  return `${match[1].padStart(2, "0")}${match[2].toUpperCase()}`;
}

function parseTimeToken(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.replace(":", "").match(/(\d{3,4})/);
  if (!match?.[1]) {
    return undefined;
  }
  return Number(match[1].padStart(4, "0"));
}

function parseDurationMinutes(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseMicrewHeaderSummary(rawText: string): MicrewHeaderSummary {
  const headerLineMatch = rawText.match(/\b(\d{1,2}[A-Z]{3})\s+([A-Z]{3})\s+(\d{3,5})\b/i);
  const headerSection =
    rawText.split(/\b(?:[DO]\s+)?(?:[A-Z0-9]{1,3})?\d{2,5}\s*[: ]\s*[A-Z]{3}-[A-Z]{3}\b/i)[0] ?? rawText;
  const reportMatch = headerSection.match(/Rpt-\s*(\d{3,4})(?:\s+(\d{1,2}[A-Z]{3}))?/i);
  const releaseMatch = headerSection.match(/Rls-\s*(\d{3,4})(?:\s+(\d{1,2}[A-Z]{3}))?/i);
  const creditMatch = headerSection.match(/Credit-\s*(\d{1,2}:\d{2})/i);
  const scheduledBlockMatch = headerSection.match(/(?:Block|Blk)-\s*(\d{1,2}:\d{2})/i);
  const tafbMatch = headerSection.match(/TAFB-\s*(\d{1,2}:\d{2})/i);
  const layoverMatch = headerSection.match(/Layover-\s*([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)/i);
  const daysMatch = rawText.match(/(\d+)\s+Days\b/i);
  return {
    rotationNumber: headerLineMatch?.[3],
    base: headerLineMatch?.[2]?.toUpperCase(),
    startDate: normalizeDateToken(headerLineMatch?.[1]),
    endDate: normalizeDateToken(releaseMatch?.[2]),
    daysCount: daysMatch?.[1] ? Number(daysMatch[1]) : undefined,
    reportTime: reportMatch?.[1],
    reportDate: normalizeDateToken(reportMatch?.[2] ?? headerLineMatch?.[1]),
    releaseTime: releaseMatch?.[1],
    releaseDate: normalizeDateToken(releaseMatch?.[2]),
    totalCredit: creditMatch?.[1],
    totalScheduledBlock: scheduledBlockMatch?.[1],
    tafb: tafbMatch?.[1],
    layoverCities: layoverMatch?.[1]
      ? layoverMatch[1].split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)
      : [],
  };
}

function mergeMicrewHeaderSummaries(summaries: MicrewHeaderSummary[]) {
  const layoverCities = Array.from(
    new Set(summaries.flatMap((summary) => summary.layoverCities ?? []).filter(Boolean)),
  );
  const datedValues = summaries.flatMap((summary) =>
    [summary.startDate, summary.reportDate, summary.endDate, summary.releaseDate].filter(
      (item): item is string => Boolean(item),
    ),
  );
  const sortedDates = [...datedValues].sort(
    (left, right) => (parseDateToken(left) ?? 99999) - (parseDateToken(right) ?? 99999),
  );
  return {
    rotationNumber: summaries.find((summary) => summary.rotationNumber)?.rotationNumber,
    base: summaries.find((summary) => summary.base)?.base,
    startDate: summaries.find((summary) => summary.startDate)?.startDate ?? sortedDates[0],
    endDate:
      summaries.find((summary) => summary.endDate)?.endDate ??
      summaries.find((summary) => summary.releaseDate)?.releaseDate ??
      sortedDates.at(-1),
    daysCount: summaries.find((summary) => summary.daysCount != null)?.daysCount,
    reportTime: summaries.find((summary) => summary.reportTime)?.reportTime,
    reportDate:
      summaries.find((summary) => summary.reportDate)?.reportDate ??
      summaries.find((summary) => summary.startDate)?.startDate ??
      sortedDates[0],
    releaseTime: summaries.find((summary) => summary.releaseTime)?.releaseTime,
    releaseDate:
      summaries.find((summary) => summary.releaseDate)?.releaseDate ??
      summaries.find((summary) => summary.endDate)?.endDate ??
      sortedDates.at(-1),
    totalCredit: summaries.find((summary) => summary.totalCredit)?.totalCredit,
    totalScheduledBlock: summaries.find((summary) => summary.totalScheduledBlock)?.totalScheduledBlock,
    tafb: summaries.find((summary) => summary.tafb)?.tafb,
    layoverCities,
  } satisfies MicrewHeaderSummary;
}

function deriveOrderingSignals(entry: ScreenshotParseEntry) {
  const rotations = entry.result.rotations ?? [];
  const flatLegs = rotations.flatMap((rotation) => rotation.legs ?? []);
  const firstLeg = flatLegs[0];
  const lastLeg = flatLegs.at(-1);
  const rawText = (entry.result.rawTextPreview ?? []).join(" ");
  const firstDate =
    parseDateToken(rawText.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]) ??
    parseDateToken(rotations.find((rotation) => rotation.dateRange)?.dateRange?.match(/\b(\d{1,2}[A-Z]{3})/i)?.[1]);
  const firstTime =
    parseTimeToken(rotations.find((rotation) => rotation.reportTime)?.reportTime) ??
    parseTimeToken(firstLeg?.depTime);
  return {
    firstDate,
    firstTime,
    firstOrigin: firstLeg?.origin?.toUpperCase(),
    lastDestination: lastLeg?.destination?.toUpperCase(),
    hasLayover: rotations.some((rotation) => (rotation.layovers?.length ?? 0) > 0),
  };
}

function describeLeg(leg?: ParsedScreenshotRotation["legs"][number]) {
  if (!leg) {
    return undefined;
  }
  const route =
    leg.origin && leg.destination ? `${leg.origin.toUpperCase()}-${leg.destination.toUpperCase()}` : undefined;
  const block = formatMinutes(leg.blockMinutes);
  return [leg.flightNumber ?? null, route ?? null, leg.depTime ?? null, leg.arrTime ?? null, block ?? null]
    .filter(Boolean)
    .join(" • ");
}

function extractDatesFromRotation(rotation: ParsedScreenshotRotation) {
  const values = new Set<string>();
  if (rotation.dateRange) {
    Array.from(rotation.dateRange.matchAll(/\b(\d{1,2}[A-Z]{3})\b/gi)).forEach((match) => {
      if (match[1]) {
        values.add(match[1].toUpperCase());
      }
    });
  }
  rotation.legs.forEach((leg) => {
    [leg.depTime, leg.arrTime].forEach((value) => {
      const match = value?.match(/\b(\d{1,2}[A-Z]{3})\b/i);
      if (match?.[1]) {
        values.add(match[1].toUpperCase());
      }
    });
  });
  return Array.from(values);
}

function extractLegDayOrder(day?: string | null) {
  if (!day) {
    return undefined;
  }
  const numericMatch = day.match(/(\d+)/);
  if (numericMatch?.[1]) {
    return Number(numericMatch[1]);
  }
  const alpha = day.trim().toUpperCase();
  if (alpha.length === 1 && alpha >= "A" && alpha <= "Z") {
    return alpha.charCodeAt(0) - 64;
  }
  return undefined;
}

function buildLegOrderKey(leg: ParsedScreenshotRotation["legs"][number], sequenceHint: number) {
  const depDate = parseDateToken(leg.depTime);
  const arrDate = parseDateToken(leg.arrTime);
  const dayOrder = extractLegDayOrder(leg.day);
  const timeValue =
    parseTimeToken(leg.depTime) ??
    parseTimeToken(leg.arrTime) ??
    Number.MAX_SAFE_INTEGER / 4;
  return (
    (depDate ?? arrDate ?? dayOrder ?? 9999) * 10000 +
    Math.min(timeValue, 9999) +
    sequenceHint / 10000
  );
}

function flattenOrderedLegCandidates(entries: ScreenshotParseEntry[]) {
  return entries.flatMap((entry, entryOrderIndex) =>
    (entry.result.rotations ?? []).flatMap((rotation, rotationIndex) =>
      (rotation.legs ?? []).map((leg, legIndex) => {
        const sequenceHint = entryOrderIndex * 1000 + rotationIndex * 100 + legIndex;
        return {
          ...leg,
          sourceType: rotation.sourceType,
          rotationIndex,
          screenshotIndex: entry.index,
          sequenceHint,
          dedupeKey: [
            leg.flightNumber?.toUpperCase() ?? "",
            leg.origin?.toUpperCase() ?? "",
            leg.destination?.toUpperCase() ?? "",
            leg.depTime ?? "",
            normalizeDateToken(leg.depTime) ?? normalizeDateToken(leg.arrTime) ?? leg.day?.trim().toUpperCase() ?? "",
            leg.blockMinutes != null ? String(leg.blockMinutes) : "",
          ].join("|"),
          orderKey: buildLegOrderKey(leg, sequenceHint),
        } satisfies StitchedLegCandidate;
      }),
    ),
  );
}

function buildRawSourceLine(candidate: StitchedLegCandidate) {
  const route =
    candidate.origin && candidate.destination
      ? `${candidate.origin.toUpperCase()}-${candidate.destination.toUpperCase()}`
      : "UNK-UNK";
  const block = formatMinutes(candidate.blockMinutes);
  const turn = formatMinutes(candidate.turnMinutes);
  return [
    candidate.isDeadhead || candidate.type === "deadhead" ? "D" : null,
    candidate.flightNumber ?? "UNK",
    route,
    candidate.depTime ? `Dep ${candidate.depTime}` : null,
    candidate.arrTime ? `Arr ${candidate.arrTime}` : null,
    block ? `Blk ${block}` : null,
    turn ? `Turn ${turn}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

function isReturnToGateCandidate(candidate: {
  origin?: string | null;
  destination?: string | null;
  blockMinutes?: number | null;
}) {
  return Boolean(
    candidate.origin &&
      candidate.destination &&
      candidate.origin.toUpperCase() === candidate.destination.toUpperCase() &&
      candidate.blockMinutes != null,
  );
}

function buildLooseOverlapKey(candidate: StitchedLegCandidate) {
  return [
    candidate.flightNumber?.toUpperCase() ?? "",
    candidate.origin?.toUpperCase() ?? "",
    candidate.destination?.toUpperCase() ?? "",
    candidate.depTime ?? "",
    normalizeDateToken(candidate.depTime) ?? normalizeDateToken(candidate.arrTime) ?? candidate.day?.trim().toUpperCase() ?? "",
  ].join("|");
}

function computeCandidateCompletenessScore(candidate: StitchedLegCandidate) {
  let score = 0;
  if (candidate.flightNumber) score += 20;
  if (candidate.origin && candidate.destination) score += 20;
  if (candidate.depTime) score += 15;
  if (candidate.arrTime) score += 15;
  if (candidate.blockMinutes != null) score += 20;
  if (candidate.turnMinutes != null) score += 5;
  if (candidate.day) score += 3;
  if (candidate.sourceImageIndex != null) score += 2;
  return score;
}

function dedupeLegCandidates(candidates: StitchedLegCandidate[]) {
  const strictSeen = new Set<string>();
  const groupedByLooseOverlap = new Map<string, StitchedLegCandidate[]>();
  const duplicateReasons: string[] = [];
  let duplicateLegsRemoved = 0;

  candidates.forEach((candidate) => {
    if (!candidate.dedupeKey.replace(/\|/g, "")) {
      return;
    }
    if (strictSeen.has(candidate.dedupeKey)) {
      duplicateLegsRemoved += 1;
      duplicateReasons.push(
        `Removed overlapping segment ${candidate.flightNumber ?? "UNK"} ${candidate.origin ?? "?"}-${candidate.destination ?? "?"} ` +
          `${candidate.depTime ?? "time?"} ${candidate.day ?? ""} ${formatMinutes(candidate.blockMinutes) ?? "block?"}`.trim(),
      );
      return;
    }
    strictSeen.add(candidate.dedupeKey);
    const looseKey = buildLooseOverlapKey(candidate);
    if (!groupedByLooseOverlap.has(looseKey)) {
      groupedByLooseOverlap.set(looseKey, []);
    }
    groupedByLooseOverlap.get(looseKey)!.push(candidate);
  });

  const deduped: StitchedLegCandidate[] = [];
  groupedByLooseOverlap.forEach((group) => {
    if (group.length === 1) {
      deduped.push(group[0]!);
      return;
    }
    const sorted = [...group].sort((left, right) => {
      const completenessDelta = computeCandidateCompletenessScore(right) - computeCandidateCompletenessScore(left);
      if (completenessDelta !== 0) {
        return completenessDelta;
      }
      return compareCandidateOrder(left, right);
    });
    const keeper = sorted[0]!;
    deduped.push(keeper);
    sorted.slice(1).forEach((candidate) => {
      duplicateLegsRemoved += 1;
      duplicateReasons.push(
        `Removed lower-confidence overlap ${candidate.flightNumber ?? "UNK"} ${candidate.origin ?? "?"}-${candidate.destination ?? "?"} ` +
          `${candidate.depTime ?? "time?"} in favor of a more complete copy.`,
      );
    });
  });

  deduped.sort(compareCandidateOrder);
  return {
    deduped,
    duplicateLegsRemoved,
    deduplicatedLegCount: deduped.length,
    duplicateReasons,
  };
}

function compareCandidateOrder(left: StitchedLegCandidate, right: StitchedLegCandidate) {
  if (left.orderKey !== right.orderKey) {
    return left.orderKey - right.orderKey;
  }
  return left.sequenceHint - right.sequenceHint;
}

function computeContinuityDelta(previous: StitchedLegCandidate, next: StitchedLegCandidate) {
  const previousArrivalTime = parseTimeToken(previous.arrTime);
  const nextDepartureTime = parseTimeToken(next.depTime);
  if (previousArrivalTime == null || nextDepartureTime == null) {
    return Number.MAX_SAFE_INTEGER / 2;
  }
  let delta = nextDepartureTime - previousArrivalTime;
  if (delta < 0) {
    delta += 24 * 60;
  }
  return delta;
}

function pickFragmentStart(remaining: StitchedLegCandidate[]) {
  const arrivalAirports = new Set(
    remaining
      .map((candidate) => candidate.destination?.toUpperCase())
      .filter((item): item is string => Boolean(item)),
  );
  const candidates = remaining.filter((candidate) => {
    const departure = candidate.origin?.toUpperCase();
    return departure ? !arrivalAirports.has(departure) : false;
  });
  const pool = candidates.length > 0 ? candidates : remaining;
  return [...pool].sort(compareCandidateOrder)[0]!;
}

function chooseBestNextLeg(previous: StitchedLegCandidate, remaining: StitchedLegCandidate[]) {
  const previousArrival = previous.destination?.toUpperCase();
  if (!previousArrival) {
    return undefined;
  }
  const matches = remaining.filter((candidate) => candidate.origin?.toUpperCase() === previousArrival);
  if (matches.length === 0) {
    return undefined;
  }
  return [...matches].sort((left, right) => {
    const leftDelta = computeContinuityDelta(previous, left);
    const rightDelta = computeContinuityDelta(previous, right);
    if (leftDelta !== rightDelta) {
      return leftDelta - rightDelta;
    }
    return compareCandidateOrder(left, right);
  })[0];
}

function buildLegFragments(candidates: StitchedLegCandidate[]) {
  const remaining = [...candidates].sort(compareCandidateOrder);
  const fragments: StitchedLegCandidate[][] = [];
  while (remaining.length > 0) {
    const start = pickFragmentStart(remaining);
    const fragment: StitchedLegCandidate[] = [start];
    remaining.splice(remaining.indexOf(start), 1);
    while (remaining.length > 0) {
      const previous = fragment.at(-1)!;
      const next = chooseBestNextLeg(previous, remaining);
      if (!next) {
        break;
      }
      fragment.push(next);
      remaining.splice(remaining.indexOf(next), 1);
    }
    fragments.push(fragment);
  }
  return fragments;
}

function orderLegFragments(fragments: StitchedLegCandidate[][]) {
  return [...fragments].sort((left, right) => {
    const leftFirst = left[0];
    const rightFirst = right[0];
    if (!leftFirst || !rightFirst) {
      return left.length - right.length;
    }
    return compareCandidateOrder(leftFirst, rightFirst);
  });
}

function describeFragment(fragment: StitchedLegCandidate[]) {
  const first = fragment[0];
  const last = fragment.at(-1);
  return `${first?.flightNumber ?? "UNK"} ${first?.origin ?? "?"}-${first?.destination ?? "?"} -> ${last?.flightNumber ?? "UNK"} ${last?.origin ?? "?"}-${last?.destination ?? "?"} (${fragment.length} leg${fragment.length === 1 ? "" : "s"})`;
}

function computeFragmentScore(fragment: StitchedLegCandidate[], preferredTerminalAirport?: string | null) {
  const first = fragment[0];
  const last = fragment.at(-1);
  let score = fragment.length * 1000;
  if (preferredTerminalAirport && last?.destination?.toUpperCase() === preferredTerminalAirport.toUpperCase()) {
    score += 1200;
  }
  if (preferredTerminalAirport && first?.origin?.toUpperCase() === preferredTerminalAirport.toUpperCase()) {
    score += 900;
  }
  const datedLegs = fragment.filter((leg) => parseDateToken(leg.depTime) != null || parseDateToken(leg.arrTime) != null).length;
  score += datedLegs * 25;
  score += (first?.orderKey ?? 0) / 1000000;
  score += (last?.orderKey ?? 0) / 100000;
  return score;
}

function findForwardFragment(
  currentLast: StitchedLegCandidate,
  fragments: StitchedLegCandidate[][],
) {
  const currentArrival = currentLast.destination?.toUpperCase();
  if (!currentArrival) {
    return undefined;
  }
  const candidates = fragments.filter((fragment) => fragment[0]?.origin?.toUpperCase() === currentArrival);
  if (candidates.length === 0) {
    return undefined;
  }
  return [...candidates].sort((left, right) => {
    const leftDelta = computeContinuityDelta(currentLast, left[0]!);
    const rightDelta = computeContinuityDelta(currentLast, right[0]!);
    if (leftDelta !== rightDelta) {
      return leftDelta - rightDelta;
    }
    return compareCandidateOrder(left[0]!, right[0]!);
  })[0];
}

function findBackwardFragment(
  currentFirst: StitchedLegCandidate,
  fragments: StitchedLegCandidate[][],
) {
  const currentOrigin = currentFirst.origin?.toUpperCase();
  if (!currentOrigin) {
    return undefined;
  }
  const candidates = fragments.filter((fragment) => fragment.at(-1)?.destination?.toUpperCase() === currentOrigin);
  if (candidates.length === 0) {
    return undefined;
  }
  return [...candidates].sort((left, right) => {
    const leftDelta = computeContinuityDelta(left.at(-1)!, currentFirst);
    const rightDelta = computeContinuityDelta(right.at(-1)!, currentFirst);
    if (leftDelta !== rightDelta) {
      return leftDelta - rightDelta;
    }
    return compareCandidateOrder(left[0]!, right[0]!);
  })[0];
}

function buildFinalChainFromFragments(
  fragments: StitchedLegCandidate[][],
  preferredTerminalAirport?: string | null,
) {
  if (fragments.length === 0) {
    return {
      finalChain: [] as StitchedLegCandidate[],
      discardedFragments: [] as StitchedLegCandidate[][],
    };
  }
  let bestChain: StitchedLegCandidate[] = [];
  let bestDiscarded: StitchedLegCandidate[][] = fragments;
  let bestScore = -Infinity;

  fragments.forEach((seed) => {
    const pool = [...fragments];
    pool.splice(pool.indexOf(seed), 1);
    const finalFragments: StitchedLegCandidate[][] = [seed];

    let extended = true;
    while (extended) {
      extended = false;
      const forward = findForwardFragment(finalFragments.at(-1)!.at(-1)!, pool);
      if (forward) {
        finalFragments.push(forward);
        pool.splice(pool.indexOf(forward), 1);
        extended = true;
      }
      const backward = findBackwardFragment(finalFragments[0]![0]!, pool);
      if (backward) {
        finalFragments.unshift(backward);
        pool.splice(pool.indexOf(backward), 1);
        extended = true;
      }
    }

    const candidateChain = finalFragments.flat();
    const candidateFirst = candidateChain[0];
    const candidateLast = candidateChain.at(-1);
    let candidateScore = candidateChain.length * 1000;
    if (preferredTerminalAirport && candidateFirst?.origin?.toUpperCase() === preferredTerminalAirport.toUpperCase()) {
      candidateScore += 1500;
    }
    if (preferredTerminalAirport && candidateLast?.destination?.toUpperCase() === preferredTerminalAirport.toUpperCase()) {
      candidateScore += 1800;
    }
    candidateScore += finalFragments.reduce((sum, fragment) => sum + computeFragmentScore(fragment, preferredTerminalAirport), 0);
    candidateScore -= pool.reduce((sum, fragment) => sum + fragment.length, 0) * 200;

    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestChain = candidateChain;
      bestDiscarded = pool;
    }
  });

  return {
    finalChain: bestChain,
    discardedFragments: bestDiscarded,
  };
}

function buildContinuousLegChain(candidates: StitchedLegCandidate[], preferredTerminalAirport?: string | null): ContinuousLegChainResult {
  if (candidates.length === 0) {
    return {
      orderedLegs: [] as StitchedLegCandidate[],
      chainLength: 0,
      fragmentsDetected: 0,
      orderingStrategy: "time_fallback" as const,
      unmatchedLegs: 0,
      stitchingWarnings: ["No leg candidates were available to stitch."],
      discardedFragmentReasons: [],
    };
  }

  const fragments = buildLegFragments(candidates);
  const orderedFragments = orderLegFragments(fragments);
  const { finalChain, discardedFragments } = buildFinalChainFromFragments(orderedFragments, preferredTerminalAirport);
  const orderedLegs = finalChain;
  const unmatchedLegs = discardedFragments.reduce((sum, fragment) => sum + fragment.length, 0);
  const orderingStrategy =
    orderedFragments.length === 1
      ? ("continuity" as const)
      : orderedLegs.length <= 1
        ? ("time_fallback" as const)
        : ("ambiguous" as const);
  const stitchingWarnings: string[] = [];
  const discardedFragmentReasons = discardedFragments.map((fragment) => `Discarded unmatched fragment: ${describeFragment(fragment)}`);
  if (orderingStrategy === "time_fallback") {
    stitchingWarnings.push("Could not build a reliable airport-to-airport continuity chain, so the trip fell back to time-based ordering.");
  } else if (orderingStrategy === "ambiguous") {
    stitchingWarnings.push(
      `Detected ${orderedFragments.length} disconnected leg fragment(s). Selected one final chain with ${orderedLegs.length} leg(s), and discarded ${unmatchedLegs} unmatched leg(s) from leftover fragments.`,
    );
  }

  return {
    orderedLegs,
    chainLength: orderedLegs.length,
    fragmentsDetected: orderedFragments.length,
    orderingStrategy,
    unmatchedLegs,
    stitchingWarnings,
    discardedFragmentReasons,
  };
}

function mergeRotationMetadata(rotations: ParsedScreenshotRotation[]) {
  const dateTokens = rotations.flatMap((rotation) =>
    [rotation.dateRange ?? ""]
      .flatMap((value) => Array.from(value.matchAll(/\b(\d{1,2}[A-Z]{3})\b/gi)).map((match) => match[1]))
      .filter((item): item is string => Boolean(item)),
  );
  const sortedDateTokens = [...dateTokens].sort((left, right) => (parseDateToken(left) ?? 99999) - (parseDateToken(right) ?? 99999));
  const earliestDate = sortedDateTokens[0];
  const latestDate = sortedDateTokens.at(-1);

  return {
    sourceType: "rerouted" as const,
    rotationNumber: rotations.find((rotation) => rotation.rotationNumber)?.rotationNumber ?? null,
    dateRange:
      earliestDate && latestDate
        ? earliestDate === latestDate
          ? earliestDate
          : `${earliestDate}-${latestDate}`
        : rotations.find((rotation) => rotation.dateRange)?.dateRange ?? null,
    base: rotations.find((rotation) => rotation.base)?.base ?? null,
    creditMinutes: rotations.find((rotation) => rotation.creditMinutes != null)?.creditMinutes ?? null,
    blockMinutes: rotations.find((rotation) => rotation.blockMinutes != null)?.blockMinutes ?? null,
    tafbMinutes: rotations.find((rotation) => rotation.tafbMinutes != null)?.tafbMinutes ?? null,
    reportTime: rotations.find((rotation) => rotation.reportTime)?.reportTime ?? null,
    releaseTime: [...rotations].reverse().find((rotation) => rotation.releaseTime)?.releaseTime ?? null,
    layovers: [] as string[],
  };
}

function mergeLayovers(rotations: ParsedScreenshotRotation[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  rotations.forEach((rotation) => {
    (rotation.layovers ?? []).forEach((layover) => {
      const normalized = layover.trim().toUpperCase();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      ordered.push(normalized);
    });
  });
  return ordered;
}

function buildPerScreenshotTrace(entries: ScreenshotParseEntry[]) {
  return entries.map((entry) => {
    const rotations = entry.result.rotations ?? [];
    const normalizedText = buildNormalizedTextFromRotations(rotations);
    const parsed = parseRotationText(normalizedText, {
      sourceTypes: "screenshots",
      screenshotsAttached: 1,
    });
    const flatLegs = rotations.flatMap((rotation) => rotation.legs ?? []);
    const dates = Array.from(new Set(rotations.flatMap((rotation) => extractDatesFromRotation(rotation))));
    const layovers = Array.from(new Set(rotations.flatMap((rotation) => rotation.layovers ?? [])));
    return {
      screenshotIndex: entry.index,
      screenshotName: entry.screenshotName,
      sourceFormat: parsed.sourceFormat,
      rawExtractedText: (entry.result.rawExtractedText ?? []).join("\n\n"),
      normalizedText,
      detectedFirstLeg: describeLeg(flatLegs[0]),
      detectedLastLeg: describeLeg(flatLegs.at(-1)),
      detectedDates: dates,
      detectedLayovers: layovers,
    };
  });
}

function buildLegCandidateTrace(candidates: StitchedLegCandidate[]) {
  return candidates.map((candidate) => ({
    sourceScreenshotIndex: candidate.screenshotIndex,
    flightNumber: candidate.flightNumber ?? null,
    departureAirport: candidate.origin ?? null,
    arrivalAirport: candidate.destination ?? null,
    scheduledOut: candidate.depTime ?? null,
    scheduledIn: candidate.arrTime ?? null,
    scheduledBlock: formatMinutes(candidate.blockMinutes) ?? null,
    turn: formatMinutes(candidate.turnMinutes) ?? null,
    date:
      candidate.depTime?.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]?.toUpperCase() ??
      candidate.arrTime?.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]?.toUpperCase() ??
      candidate.day ??
      null,
    isDeadhead: Boolean(candidate.isDeadhead || candidate.type === "deadhead"),
    carrier: candidate.carrier ?? null,
    confirmationCode: candidate.confirmationCode ?? null,
    sourceText: candidate.sourceText ?? null,
    segmentType: isReturnToGateCandidate(candidate)
      ? "return_to_gate"
      : Boolean(candidate.isDeadhead || candidate.type === "deadhead")
        ? "deadhead"
        : "operating",
    rawSourceLine: buildRawSourceLine(candidate),
  }));
}

function buildOrderedChainTrace(candidates: StitchedLegCandidate[]) {
  return candidates.map((candidate, index) => ({
    index: index + 1,
    flightNumber: candidate.flightNumber ?? null,
    departureAirport: candidate.origin ?? null,
    arrivalAirport: candidate.destination ?? null,
    scheduledOut: candidate.depTime ?? null,
    scheduledIn: candidate.arrTime ?? null,
    scheduledBlock: formatMinutes(candidate.blockMinutes) ?? null,
    turn: formatMinutes(candidate.turnMinutes) ?? null,
    date:
      candidate.depTime?.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]?.toUpperCase() ??
      candidate.arrTime?.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]?.toUpperCase() ??
      candidate.day ??
      null,
    isDeadhead: Boolean(candidate.isDeadhead || candidate.type === "deadhead"),
    carrier: candidate.carrier ?? null,
    confirmationCode: candidate.confirmationCode ?? null,
    sourceText: candidate.sourceText ?? null,
    segmentType: isReturnToGateCandidate(candidate)
      ? "return_to_gate"
      : Boolean(candidate.isDeadhead || candidate.type === "deadhead")
        ? "deadhead"
        : "operating",
  }));
}

function orderScreenshotEntries(entries: ScreenshotParseEntry[]) {
  const entriesWithSignals = entries.map((entry) => ({
    entry,
    signal: deriveOrderingSignals(entry),
  }));

  const signalCount = entriesWithSignals.filter(
    ({ signal }) => signal.firstDate != null || signal.firstTime != null,
  ).length;
  if (signalCount === 0) {
    return {
      ordered: entries,
      orderingMethod: "upload_order_fallback" as const,
      inferredSequence: entries.map((entry) => `#${entry.index + 1} ${entry.screenshotName}`),
      stitchingWarnings: ["Could not infer screenshot order from extracted content, so upload order was used."],
    };
  }

  const preSorted = [...entriesWithSignals].sort((left, right) => {
    const leftDate = left.signal.firstDate ?? Number.MAX_SAFE_INTEGER;
    const rightDate = right.signal.firstDate ?? Number.MAX_SAFE_INTEGER;
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    const leftTime = left.signal.firstTime ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.signal.firstTime ?? Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.entry.index - right.entry.index;
  });

  const remaining = [...preSorted];
  const ordered: typeof preSorted = [];
  let current = remaining.shift();
  if (current) {
    ordered.push(current);
  }
  while (remaining.length > 0) {
    const previous = ordered.at(-1);
    const previousDestination = previous?.signal.lastDestination;
    let nextIndex = 0;
    let bestScore = -Infinity;
    remaining.forEach((candidate, index) => {
      let score = 0;
      if (previousDestination && candidate.signal.firstOrigin && previousDestination === candidate.signal.firstOrigin) {
        score += 100;
      }
      if (
        (candidate.signal.firstDate ?? Number.MAX_SAFE_INTEGER) >=
        (previous?.signal.firstDate ?? -1)
      ) {
        score += 20;
      }
      if (candidate.signal.hasLayover) {
        score += 5;
      }
      score -= candidate.entry.index * 0.01;
      if (score > bestScore) {
        bestScore = score;
        nextIndex = index;
      }
    });
    ordered.push(remaining.splice(nextIndex, 1)[0]!);
  }

  const ambiguous = ordered.some(
    ({ signal }) => signal.firstDate == null && signal.firstTime == null,
  );
  return {
    ordered: ordered.map(({ entry }) => entry),
    orderingMethod: ambiguous ? ("ambiguous" as const) : ("inferred" as const),
    inferredSequence: ordered.map(
      ({ entry, signal }) =>
        `#${entry.index + 1} ${entry.screenshotName} (${signal.firstDate ?? "date?"}/${signal.firstTime ?? "time?"})`,
    ),
    stitchingWarnings: ambiguous
      ? ["Screenshot order was only partially inferred; upload order was used as a tie-breaker for ambiguous images."]
      : [],
  };
}

function buildWarningsFromScreenshotParse(result: ParseMiCrewScreenshotsOutput) {
  return Array.from(
    new Set([
      ...(result.missingFacts ?? []),
      ...(result.missingParseItems ?? []),
      ...(result.extractionNotes ?? []),
    ]),
  );
}

function buildDebug(
  result: ParseMiCrewScreenshotsOutput,
  originalImageCountReceived: number,
  changedImageCountReceived: number,
  extras?: {
    screenshotsCount?: number;
    combinedTextLength?: number;
    deduplicatedLegCount?: number;
    duplicateLegsRemoved?: number;
    duplicateReasons?: string[];
    stitchingWarnings?: string[];
    inferredSequence?: string[];
    orderingMethod?: "inferred" | "upload_order_fallback" | "ambiguous";
    chainLength?: number;
    fragmentsDetected?: number;
    orderingStrategy?: "continuity" | "time_fallback" | "ambiguous";
    unmatchedLegs?: number;
    finalOrderedChainCount?: number;
    userFacingLegs?: number;
    discardedFragments?: number;
    discardedFragmentReasons?: string[];
    visibleActivityCards?: number;
    rawFlightCandidates?: number;
    finalFlightSegments?: number;
    operatingSegments?: number;
    deadheadSegments?: number;
    deadheadLegsDetected?: number;
    deadheadConfirmationCodes?: string[];
    deadheadDetectionNotes?: string[];
    returnToGateSegments?: number;
    layoverCards?: number;
    duplicateSegmentsRemoved?: number;
    micrewHeaderFound?: boolean;
    parsedHeader?: MicrewHeaderSummary;
    tripDatesSource?: "header" | "fallback_legs" | "unknown";
    rotationNumberSource?: "header" | "unknown";
    perScreenshotTrace?: Array<{
      screenshotIndex: number;
      screenshotName: string;
      sourceFormat: "micrew_mobile" | "icrew_printout" | "unknown";
      rawExtractedText: string;
      normalizedText: string;
      detectedFirstLeg?: string;
      detectedLastLeg?: string;
      detectedDates: string[];
      detectedLayovers: string[];
    }>;
    legCandidates?: Array<{
      sourceScreenshotIndex: number;
      flightNumber?: string | null;
      departureAirport?: string | null;
      arrivalAirport?: string | null;
      scheduledOut?: string | null;
      scheduledIn?: string | null;
      scheduledBlock?: string | null;
      turn?: string | null;
      date?: string | null;
      isDeadhead: boolean;
      carrier?: string | null;
      confirmationCode?: string | null;
      sourceText?: string | null;
      segmentType?: "operating" | "deadhead" | "return_to_gate";
      rawSourceLine: string;
    }>;
    orderedChain?: Array<{
      index: number;
      flightNumber?: string | null;
      departureAirport?: string | null;
      arrivalAirport?: string | null;
      scheduledOut?: string | null;
      scheduledIn?: string | null;
      scheduledBlock?: string | null;
      turn?: string | null;
      date?: string | null;
      isDeadhead?: boolean;
      carrier?: string | null;
      confirmationCode?: string | null;
      sourceText?: string | null;
      segmentType?: "operating" | "deadhead" | "return_to_gate";
    }>;
  },
) {
  const rotationsParsed = result.rotations?.length ?? 0;
  const legsParsed = result.rotations?.reduce((sum, rotation) => sum + (rotation.legs?.length ?? 0), 0) ?? 0;
  return {
    screenshotParsingActive: result.screenshotParsingActive,
    screenshotsCount: extras?.screenshotsCount ?? changedImageCountReceived,
    originalImageCountReceived,
    changedImageCountReceived,
    visionModelCalled: result.visionModelCalled ?? false,
    modelName: result.modelSelected,
    rawTextPreview: result.rawTextPreview ?? [],
    rawVisionResponsePreview: result.rawVisionResponsePreview ?? [],
    structuredJsonParseError: result.structuredJsonParseError,
    extractionNotes: result.extractionNotes ?? [],
    fallbackRegexLegsParsed: result.fallbackRegexLegsParsed ?? 0,
    rotationsParsed,
    legsParsed,
    combinedTextLength: extras?.combinedTextLength ?? 0,
    deduplicatedLegCount: extras?.deduplicatedLegCount ?? legsParsed,
    duplicateLegsRemoved: extras?.duplicateLegsRemoved ?? 0,
    duplicateReasons: extras?.duplicateReasons ?? [],
    stitchingWarnings: extras?.stitchingWarnings ?? [],
    inferredSequence: extras?.inferredSequence ?? [],
    orderingMethod: extras?.orderingMethod ?? "upload_order_fallback",
    chainLength: extras?.chainLength ?? 0,
    fragmentsDetected: extras?.fragmentsDetected ?? 0,
    orderingStrategy: extras?.orderingStrategy ?? "time_fallback",
    unmatchedLegs: extras?.unmatchedLegs ?? 0,
    finalOrderedChainCount: extras?.finalOrderedChainCount ?? extras?.finalFlightSegments ?? 0,
    userFacingLegs: extras?.userFacingLegs ?? extras?.finalFlightSegments ?? 0,
    discardedFragments: extras?.discardedFragments ?? extras?.unmatchedLegs ?? 0,
    discardedFragmentReasons: extras?.discardedFragmentReasons ?? [],
    visibleActivityCards: extras?.visibleActivityCards ?? legsParsed,
    rawFlightCandidates: extras?.rawFlightCandidates ?? legsParsed,
    finalFlightSegments: extras?.finalFlightSegments ?? extras?.deduplicatedLegCount ?? legsParsed,
    operatingSegments: extras?.operatingSegments ?? 0,
    deadheadSegments: extras?.deadheadSegments ?? 0,
    deadheadLegsDetected: extras?.deadheadLegsDetected ?? extras?.deadheadSegments ?? 0,
    deadheadConfirmationCodes: extras?.deadheadConfirmationCodes ?? [],
    deadheadDetectionNotes: extras?.deadheadDetectionNotes ?? [],
    returnToGateSegments: extras?.returnToGateSegments ?? 0,
    layoverCards: extras?.layoverCards ?? 0,
    duplicateSegmentsRemoved: extras?.duplicateSegmentsRemoved ?? extras?.duplicateLegsRemoved ?? 0,
    micrewHeaderFound: extras?.micrewHeaderFound ?? false,
    parsedHeader: extras?.parsedHeader ?? { layoverCities: [] },
    tripDatesSource: extras?.tripDatesSource ?? "unknown",
    rotationNumberSource: extras?.rotationNumberSource ?? "unknown",
    perScreenshotTrace: extras?.perScreenshotTrace ?? [],
    legCandidates: extras?.legCandidates ?? [],
    orderedChain: extras?.orderedChain ?? [],
  };
}

export async function extractRotationTextFromScreenshots(args: {
  screenshots: UploadedImage[];
  uploadedEvidenceSummary?: UploadedEvidenceSummary;
}): Promise<RotationScreenshotExtractionResult> {
  const uploadedEvidenceSummary: UploadedEvidenceSummary = args.uploadedEvidenceSummary ?? {
    originalScreenshotNames: [],
    changedScreenshotNames: [],
    originalScreenshotCount: 0,
    changedScreenshotCount: args.screenshots.length,
    originalFilenames: [],
    changedFilenames: args.screenshots.map((image) => image.name),
    screenshotNames: args.screenshots.map((image) => image.name),
    screenshotParsingActive: true,
    notes: [],
  };

  const perScreenshotResults = await Promise.all(
    args.screenshots.map((screenshot, index) =>
      parseMiCrewScreenshots({
        originalImages: [],
        changedImages: [screenshot],
        uploadedEvidenceSummary: {
          ...uploadedEvidenceSummary,
          changedScreenshotNames: [screenshot.name],
          changedScreenshotCount: 1,
          changedFilenames: [screenshot.name],
          screenshotNames: [screenshot.name],
        },
      }).then((result) => ({ index, screenshotName: screenshot.name, result })),
    ),
  );

  const combinedResult: ParseMiCrewScreenshotsOutput = {
    screenshotParsingActive: args.screenshots.length > 0,
    uploadedEvidenceSummary,
    missingFacts: perScreenshotResults.flatMap(({ result }) => result.missingFacts ?? []),
    rotations: perScreenshotResults.flatMap(({ result }) => result.rotations ?? []),
    parseConfidence:
      perScreenshotResults.some(({ result }) => result.parseConfidence === "high")
        ? "high"
        : perScreenshotResults.some(({ result }) => result.parseConfidence === "medium")
          ? "medium"
          : "low",
    missingParseItems: perScreenshotResults.flatMap(({ result }) => result.missingParseItems ?? []),
    extractionNotes: perScreenshotResults.flatMap(({ result }, index) => [
      `Screenshot ${index + 1}: ${(result.extractionNotes ?? []).join(" | ") || "No extraction notes"}`,
    ]),
    rawVisionResponsePreview: perScreenshotResults.flatMap(({ result }, index) =>
      (result.rawVisionResponsePreview ?? []).map((preview) => `Screenshot ${index + 1}: ${preview}`),
    ),
    rawTextPreview: perScreenshotResults.flatMap(({ result }, index) =>
      (result.rawTextPreview ?? []).map((preview) => `Screenshot ${index + 1}: ${preview}`),
    ),
    structuredJsonParseError: perScreenshotResults
      .map(({ result }) => result.structuredJsonParseError)
      .filter((item): item is string => Boolean(item))
      .join(" | "),
    visionModelCalled: perScreenshotResults.some(({ result }) => result.visionModelCalled),
    modelSelected: perScreenshotResults.find(({ result }) => result.modelSelected)?.result.modelSelected,
    fallbackRegexLegsParsed: perScreenshotResults.reduce(
      (sum, { result }) => sum + (result.fallbackRegexLegsParsed ?? 0),
      0,
    ),
  };

  const orderedEntryResult = orderScreenshotEntries(perScreenshotResults);
  const stitchedWarningList: string[] = [...orderedEntryResult.stitchingWarnings];
  const orderedRotations = orderedEntryResult.ordered.flatMap((entry) => entry.result.rotations ?? []);
  const headerSummaries = orderedEntryResult.ordered
    .map((entry) => parseMicrewHeaderSummary((entry.result.rawExtractedText ?? []).join("\n\n")))
    .filter((summary) =>
      Boolean(
        summary.rotationNumber ||
          summary.startDate ||
          summary.reportDate ||
          summary.endDate ||
          summary.releaseDate ||
          summary.totalCredit ||
          summary.tafb ||
          summary.layoverCities.length > 0,
      ),
    );
  const mergedHeader = mergeMicrewHeaderSummaries(headerSummaries);
  const legCandidates = flattenOrderedLegCandidates(orderedEntryResult.ordered);
  const legCandidateTrace = buildLegCandidateTrace(legCandidates);
  const dedupedLegCandidates = dedupeLegCandidates(legCandidates);
  const legChain = buildContinuousLegChain(dedupedLegCandidates.deduped, mergedHeader.base ?? null);
  stitchedWarningList.push(...legChain.stitchingWarnings);
  stitchedWarningList.push(...legChain.discardedFragmentReasons);
  if (dedupedLegCandidates.duplicateLegsRemoved > 0) {
    stitchedWarningList.push(`Removed ${dedupedLegCandidates.duplicateLegsRemoved} duplicate overlapping leg(s).`);
  }
  const mergedRotationMetadata = mergeRotationMetadata(orderedRotations);
  const mergedLayovers = Array.from(
    new Set([...(mergedHeader.layoverCities ?? []), ...mergeLayovers(orderedRotations)]),
  );
  const rawLayoverCards = orderedRotations.reduce((sum, rotation) => sum + (rotation.layovers?.length ?? 0), 0);
  const finalFlightSegments = legChain.orderedLegs.length;
  const deadheadSegments = legChain.orderedLegs.filter((leg) => Boolean(leg.isDeadhead || leg.type === "deadhead")).length;
  const deadheadConfirmationCodes = Array.from(
    new Set(
      legChain.orderedLegs
        .filter((leg) => Boolean(leg.isDeadhead || leg.type === "deadhead"))
        .map((leg) => leg.confirmationCode?.trim().toUpperCase())
        .filter((item): item is string => Boolean(item)),
    ),
  );
  const deadheadDetectionNotes = legChain.orderedLegs
    .filter((leg) => Boolean(leg.isDeadhead || leg.type === "deadhead"))
    .map((leg) =>
      leg.confirmationCode
        ? `Deadhead detected on ${leg.flightNumber ?? "UNK"} ${leg.origin ?? "?"}-${leg.destination ?? "?"} with confirmation ${leg.confirmationCode}.`
        : `Deadhead detected on ${leg.flightNumber ?? "UNK"} ${leg.origin ?? "?"}-${leg.destination ?? "?"}.`,
    );
  const returnToGateSegments = legChain.orderedLegs.filter((leg) => isReturnToGateCandidate(leg)).length;
  const operatingSegments = finalFlightSegments - deadheadSegments;
  const stitchedRotation: ParsedScreenshotRotation = {
    ...mergedRotationMetadata,
    rotationNumber: mergedHeader.rotationNumber ?? mergedRotationMetadata.rotationNumber,
    dateRange:
      mergedHeader.startDate && mergedHeader.endDate
        ? `${mergedHeader.startDate}-${mergedHeader.endDate}`
        : mergedRotationMetadata.dateRange,
    base: mergedHeader.base ?? mergedRotationMetadata.base,
    creditMinutes:
      mergedHeader.totalCredit != null
        ? parseDurationMinutes(mergedHeader.totalCredit) ?? mergedRotationMetadata.creditMinutes
        : mergedRotationMetadata.creditMinutes,
    blockMinutes:
      mergedHeader.totalScheduledBlock != null
        ? parseDurationMinutes(mergedHeader.totalScheduledBlock) ?? mergedRotationMetadata.blockMinutes
        : mergedRotationMetadata.blockMinutes,
    tafbMinutes:
      mergedHeader.tafb != null
        ? parseDurationMinutes(mergedHeader.tafb) ?? mergedRotationMetadata.tafbMinutes
        : mergedRotationMetadata.tafbMinutes,
    reportTime:
      mergedHeader.reportTime && mergedHeader.reportDate
        ? `${mergedHeader.reportTime} ${mergedHeader.reportDate}`
        : mergedRotationMetadata.reportTime,
    releaseTime:
      mergedHeader.releaseTime && mergedHeader.releaseDate
        ? `${mergedHeader.releaseTime} ${mergedHeader.releaseDate}`
        : mergedRotationMetadata.releaseTime,
    layovers: mergedLayovers,
    legs: legChain.orderedLegs.map(
      ({
        sourceType: _sourceType,
        sequenceHint: _sequenceHint,
        rotationIndex: _rotationIndex,
        screenshotIndex: _screenshotIndex,
        dedupeKey: _dedupeKey,
        orderKey: _orderKey,
        ...leg
      }) => leg,
    ),
  };
  const normalizedText = buildNormalizedTextFromRotations([stitchedRotation]);
  const debug = buildDebug(combinedResult, 0, args.screenshots.length, {
    screenshotsCount: args.screenshots.length,
    combinedTextLength: normalizedText.length,
    deduplicatedLegCount: dedupedLegCandidates.deduplicatedLegCount,
    duplicateLegsRemoved: dedupedLegCandidates.duplicateLegsRemoved,
    duplicateReasons: dedupedLegCandidates.duplicateReasons,
    stitchingWarnings: stitchedWarningList,
    inferredSequence: orderedEntryResult.inferredSequence,
    orderingMethod: orderedEntryResult.orderingMethod,
    chainLength: legChain.chainLength,
    fragmentsDetected: legChain.fragmentsDetected,
    orderingStrategy: legChain.orderingStrategy,
    unmatchedLegs: legChain.unmatchedLegs,
    finalOrderedChainCount: legChain.orderedLegs.length,
    userFacingLegs: legChain.orderedLegs.length,
    discardedFragments: legChain.unmatchedLegs,
    discardedFragmentReasons: legChain.discardedFragmentReasons,
    visibleActivityCards: legCandidates.length + rawLayoverCards,
    rawFlightCandidates: legCandidates.length,
    finalFlightSegments,
    operatingSegments,
    deadheadSegments,
    deadheadLegsDetected: deadheadSegments,
    deadheadConfirmationCodes,
    deadheadDetectionNotes,
    returnToGateSegments,
    layoverCards: rawLayoverCards,
    duplicateSegmentsRemoved: dedupedLegCandidates.duplicateLegsRemoved,
    micrewHeaderFound: headerSummaries.length > 0,
    parsedHeader: mergedHeader,
    tripDatesSource:
      mergedHeader.startDate || mergedHeader.endDate
        ? "header"
        : legChain.orderedLegs.length > 0
          ? "fallback_legs"
          : "unknown",
    rotationNumberSource: mergedHeader.rotationNumber ? "header" : "unknown",
    perScreenshotTrace: buildPerScreenshotTrace(orderedEntryResult.ordered),
    legCandidates: legCandidateTrace,
    orderedChain: buildOrderedChainTrace(legChain.orderedLegs),
  });
  const warnings = Array.from(new Set([...buildWarningsFromScreenshotParse(combinedResult), ...stitchedWarningList]));

  if (!normalizedText.trim()) {
    return {
      ok: false,
      error:
        combinedResult.missingFacts?.[0] ??
        "Could not read screenshots clearly",
      warnings,
      missingSections: ["visible trip text"],
      debug,
    };
  }

  const parsedRotation = parseRotationText(normalizedText, {
    sourceTypes: "screenshots",
    screenshotsAttached: args.screenshots.length,
  });

  return {
    ok: true,
    normalizedText,
    extracted: summarizeExtracted([stitchedRotation]),
    confidence: combinedResult.parseConfidence ?? parsedRotation.parseConfidence,
    warnings,
    missingSections: parsedRotation.missingSections,
    debug,
  };
}
