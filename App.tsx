import { StatusBar } from "expo-status-bar";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import {
  Image,
  useColorScheme,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { FliegerMarker } from "./src/components/FliegerMarker";
import { BottomNavItem } from "./src/components/BottomNavItem";
import { DecisionRow } from "./src/components/DecisionRow";
import { InstrumentField } from "./src/components/InstrumentField";
import { InstrumentButton, InstrumentChip } from "./src/components/InstrumentButton";
import { InstrumentPanel } from "./src/components/InstrumentPanel";
import { deltaCharts as embeddedDeltaCharts } from "./src/data/deltaCharts";
import { deltaSnapshot } from "./src/data/deltaSnapshot";
import { payAuditPriorityRules } from "./src/data/payAuditRules";
import {
  annualTakeHomeRate,
  definedContributionRate,
  payScales,
  payScenarioOptions,
  profitSharingRate,
  profitSharingTakeHomeRate,
  resolvePayScenario,
} from "./src/data/payScales";
import {
  computePayAudit,
  computeTripHealth,
  formatCurrency,
  formatPercent,
} from "./src/utils/calculators";
import {
  buildPayAuditContext,
  buildPayAuditResult,
} from "./src/utils/payAuditEngine";
import { parseDeltaTimecard, parseTimeValue } from "./src/utils/deltaTimecardParser";
import {
  analyzeCurrentAE,
  forecastHoldability,
  type CurrentAeAnalysisResult,
  type HoldForecastResult,
} from "./src/utils/holdForecast";
import {
  buildRotationDashboardData,
  parseRotationIntoDashboard,
  SAMPLE_ROTATION_TEXT,
  type RotationDashboardData,
  type RotationLayoverDetail,
} from "./src/utils/rotationCompanion";
import { ContractCopilotPanel } from "./src/components/contractCopilot/ContractCopilotPanel";
import {
  buildContractCopilotAdapter,
  buildPayImpactAdapter,
  buildRerouteCalculatorAdapter,
  buildRotationCompanionContext,
  rotationCompanionToolRegistry,
  type RotationCompanionContext,
} from "./src/features/rotationCompanion/toolAdapters";
import {
  buildScreenshotUserFacingChain as buildScreenshotUserFacingChainPure,
  computeSnapshotFromUserFacingChain as computeSnapshotFromUserFacingChainPure,
  diagnoseScreenshotRotationPartialStatus as diagnoseScreenshotRotationPartialStatusPure,
} from "./src/features/rotationCompanion/rotationChainBuilder";
import {
  parseICrewTextWithDiagnostics,
  type ICrewParserDiagnostics,
} from "./src/features/rotationCompanion/parseICrewText";
import type { RotationChainCandidate } from "./src/features/rotationCompanion/rotationChainBuilder";
import { fliegerTypography, getFliegerPalette } from "./src/theme/flieger";
import type {
  RerouteAnalysisOutput,
  RerouteAnalyzerChoice,
  ReroutePayAnalyzeApiResponse,
  ReroutePilotStatus,
  RerouteTiming,
} from "./src/ai/tools/reroutePay/types";

type RerouteScreenshotAttachment = {
  name: string;
  dataUrl: string;
  previewUri?: string;
};

type RotationScreenshotAttachment = {
  name: string;
  dataUrl: string;
  previewUri: string;
  mimeType?: string;
};

const DELTA_CHECK_IN_URL = "https://www.delta.com/check-in";
const SKYHOP_URL = "https://www.skyhopglobal.com";

type RotationScreenshotParseResponse =
  | {
      ok: true;
      analysisRunId?: number;
      analysisTimestamp?: string;
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
        parsedHeader: {
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
          segmentType?: "operating" | "deadhead" | "return_to_gate";
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
          segmentType?: "operating" | "deadhead" | "return_to_gate";
        }>;
      };
    }
  | {
      ok: false;
      analysisRunId?: number;
      analysisTimestamp?: string;
      error: string;
      warnings: string[];
      missingSections: string[];
      debug?: {
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
        parsedHeader: {
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
          segmentType?: "operating" | "deadhead" | "return_to_gate";
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
          segmentType?: "operating" | "deadhead" | "return_to_gate";
        }>;
      };
    };

type RerouteRequestImageDiagnostics = {
  originalScreenshotsAttached: number;
  changedScreenshotsAttached: number;
  firstOriginalStartsWithDataImage: boolean;
  firstChangedStartsWithDataImage: boolean;
  originalCompressedBytes?: number[];
  changedCompressedBytes?: number[];
};

function buildUnreadableScreenshotParserResponse(
  status: number,
  contentType: string,
  rawText: string,
): RotationScreenshotParseResponse {
  const bodySnippet = rawText.slice(0, 400);
  const looksLikeHtml = /<!doctype html|<html/i.test(bodySnippet);
  return {
    ok: false,
    error: looksLikeHtml
      ? "Screenshot parser route returned HTML instead of JSON. The local server may need a restart."
      : "Screenshot parser returned an unreadable response.",
    warnings: [
      `HTTP ${status}`,
      `Content-Type: ${contentType || "unknown"}`,
      ...(bodySnippet ? [`Body preview: ${bodySnippet}`] : []),
    ],
    missingSections: ["normalized screenshot text"],
    debug: {
      screenshotParsingActive: true,
      screenshotsCount: 0,
      originalImageCountReceived: 0,
      changedImageCountReceived: 0,
      visionModelCalled: false,
      modelName: undefined,
      rawTextPreview: [],
      rawVisionResponsePreview: bodySnippet ? [bodySnippet] : [],
      structuredJsonParseError: looksLikeHtml ? "HTML fallback received" : "Non-JSON response received",
      extractionNotes: ["The screenshot parser route did not return JSON."],
      fallbackRegexLegsParsed: 0,
      rotationsParsed: 0,
      legsParsed: 0,
      combinedTextLength: 0,
      deduplicatedLegCount: 0,
      duplicateLegsRemoved: 0,
      duplicateReasons: [],
      stitchingWarnings: [],
      inferredSequence: [],
      orderingMethod: "upload_order_fallback",
      chainLength: 0,
      fragmentsDetected: 0,
      orderingStrategy: "time_fallback",
      unmatchedLegs: 0,
      finalOrderedChainCount: 0,
      userFacingLegs: 0,
      discardedFragments: 0,
      discardedFragmentReasons: [],
      visibleActivityCards: 0,
      rawFlightCandidates: 0,
      finalFlightSegments: 0,
      operatingSegments: 0,
      deadheadSegments: 0,
      deadheadLegsDetected: 0,
      deadheadConfirmationCodes: [],
      deadheadDetectionNotes: [],
      returnToGateSegments: 0,
      layoverCards: 0,
      duplicateSegmentsRemoved: 0,
      micrewHeaderFound: false,
      parsedHeader: { layoverCities: [] },
      tripDatesSource: "unknown",
      rotationNumberSource: "unknown",
      perScreenshotTrace: [],
      legCandidates: [],
      orderedChain: [],
    },
  };
}

function parseClockishMinutes(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function extractCompactClock(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(\d{3,4})\b/);
  if (!match?.[1]) {
    return undefined;
  }
  const digits = match[1].padStart(4, "0");
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function extractCompactClockDigits(value?: string | null) {
  return extractCompactClock(value)?.replace(":", "");
}

function formatTraceList(values?: Array<string | null | undefined>) {
  const filtered = (values ?? []).filter((value): value is string => Boolean(value));
  return filtered.length > 0 ? filtered.join(", ") : "None";
}

function formatBuilderCandidateMinutes(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function buildBuilderCandidateStableKey(candidate: RotationChainCandidate) {
  return [
    (candidate.date ?? "").trim().toUpperCase(),
    (candidate.departureAirport ?? "").trim().toUpperCase(),
    (candidate.arrivalAirport ?? "").trim().toUpperCase(),
    (candidate.carrier ?? "").trim().toUpperCase(),
    (candidate.flightNumber ?? "").trim().toUpperCase(),
    (candidate.scheduledOut ?? "").trim(),
    (candidate.scheduledIn ?? "").trim(),
    (candidate.scheduledBlock ?? "").trim(),
  ].join("|");
}

type LiveChainInputSourceSummary = {
  name: string;
  count: number;
  cityPairs: string[];
  containsSlcDtw: boolean;
  containsDtwMsp: boolean;
  containsMspRdu: boolean;
  containsSatSlc: boolean;
};

function summarizeLiveChainInputSource(name: string, candidates: RotationChainCandidate[]): LiveChainInputSourceSummary {
  const cityPairs = candidates.map(
    (candidate) =>
      `${candidate.departureAirport ?? "?"}-${candidate.arrivalAirport ?? "?"} | ${candidate.scheduledOut ?? "?"} | ${candidate.scheduledIn ?? "?"} | ${candidate.scheduledBlock ?? "?"} | ${candidate.carrier ?? "?"} | ${candidate.flightNumber ?? "?"}`,
  );
  const hasPair = (origin: string, destination: string) =>
    candidates.some(
      (candidate) =>
        (candidate.departureAirport ?? "").toUpperCase() === origin &&
        (candidate.arrivalAirport ?? "").toUpperCase() === destination,
    );
  return {
    name,
    count: candidates.length,
    cityPairs,
    containsSlcDtw: hasPair("SLC", "DTW"),
    containsDtwMsp: hasPair("DTW", "MSP"),
    containsMspRdu: hasPair("MSP", "RDU"),
    containsSatSlc: hasPair("SAT", "SLC"),
  };
}

function getLiveChainInputSources(
  screenshotParseResult: RotationScreenshotParseResponse & {
    debug: NonNullable<RotationScreenshotParseResponse["debug"]>;
  },
) {
  const sortCandidatesDeterministically = (candidates: RotationChainCandidate[]) =>
    [...candidates].sort((left, right) => buildBuilderCandidateStableKey(left).localeCompare(buildBuilderCandidateStableKey(right)));
  const debugLegCandidates: RotationChainCandidate[] = (screenshotParseResult.debug?.legCandidates ?? []).map((candidate) => ({
    sourceScreenshotIndex: candidate.sourceScreenshotIndex,
    flightNumber: candidate.flightNumber ?? null,
    departureAirport: candidate.departureAirport ?? null,
    arrivalAirport: candidate.arrivalAirport ?? null,
    scheduledOut: candidate.scheduledOut ?? null,
    scheduledIn: candidate.scheduledIn ?? null,
    scheduledBlock: candidate.scheduledBlock ?? null,
    turn: candidate.turn ?? null,
    date: candidate.date ?? null,
    isDeadhead: candidate.isDeadhead,
    carrier: candidate.carrier ?? null,
    confirmationCode: candidate.confirmationCode ?? null,
    sourceText: candidate.sourceText ?? null,
    segmentType: candidate.segmentType,
    rawSourceLine: candidate.rawSourceLine,
  }));
  const extractedLegs: RotationChainCandidate[] = screenshotParseResult.ok
    ? (screenshotParseResult.extracted?.legs ?? []).map((leg) => ({
        sourceScreenshotIndex: leg.sourceImageIndex,
        flightNumber: leg.flightNumber ?? null,
        departureAirport: leg.origin ?? null,
        arrivalAirport: leg.destination ?? null,
        scheduledOut: leg.depTime ?? null,
        scheduledIn: leg.arrTime ?? null,
        scheduledBlock: formatBuilderCandidateMinutes(leg.blockMinutes),
        turn: formatBuilderCandidateMinutes(leg.turnMinutes),
        date: typeof leg.day === "string" ? leg.day.toUpperCase() : leg.day ?? null,
        isDeadhead: leg.isDeadhead ?? (leg.legKind === "deadhead"),
        carrier: leg.carrier ?? null,
        confirmationCode: leg.confirmationCode ?? null,
        sourceText: leg.sourceText ?? null,
        segmentType:
          leg.isDeadhead || leg.legKind === "deadhead"
            ? "deadhead"
            : leg.origin && leg.destination && leg.origin === leg.destination && leg.blockMinutes
              ? "return_to_gate"
              : "operating",
      }))
    : [];
  const orderedChainCandidates: RotationChainCandidate[] = (screenshotParseResult.debug?.orderedChain ?? []).map((leg) => ({
    sourceScreenshotIndex: undefined,
    flightNumber: leg.flightNumber ?? null,
    departureAirport: leg.departureAirport ?? null,
    arrivalAirport: leg.arrivalAirport ?? null,
    scheduledOut: leg.scheduledOut ?? null,
    scheduledIn: leg.scheduledIn ?? null,
    scheduledBlock: leg.scheduledBlock ?? null,
    turn: leg.turn ?? null,
    date: leg.date ?? null,
    isDeadhead: leg.isDeadhead,
    carrier: leg.carrier ?? null,
    confirmationCode: leg.confirmationCode ?? null,
    sourceText: leg.sourceText ?? null,
    segmentType: leg.segmentType,
  }));

  const merged = new Map<string, RotationChainCandidate>();
  for (const candidate of [...debugLegCandidates, ...extractedLegs, ...orderedChainCandidates]) {
    const key = buildBuilderCandidateStableKey(candidate);
    if (!key.replace(/\|/g, "").trim()) {
      continue;
    }
    if (!merged.has(key)) {
      merged.set(key, candidate);
    }
  }
  const mergedCandidates = sortCandidatesDeterministically(Array.from(merged.values()));

  const sourceEntries = [
    { name: "mergedDebugExtractedOrdered", candidates: mergedCandidates },
    { name: "debugLegCandidates", candidates: sortCandidatesDeterministically(debugLegCandidates) },
    { name: "extractedLegs", candidates: sortCandidatesDeterministically(extractedLegs) },
    { name: "orderedChain", candidates: sortCandidatesDeterministically(orderedChainCandidates) },
  ];
  const sourceSummaries = sourceEntries.map(({ name, candidates }) => summarizeLiveChainInputSource(name, candidates));
  const preferredSource =
    sourceEntries.find(({ candidates }) => {
      const summary = summarizeLiveChainInputSource("candidate", candidates);
      return summary.containsSlcDtw && summary.containsDtwMsp && summary.containsMspRdu && summary.containsSatSlc;
    }) ?? sourceEntries[0];

  return {
    selectedSourceName: preferredSource.name,
    selectedCandidates: preferredSource.candidates,
    sourceSummaries,
  };
}

function buildLiveChainDebugExport(args: {
  rotationDashboard: RotationDashboardData;
  screenshotParseResult: RotationScreenshotParseResponse & {
    debug: NonNullable<RotationScreenshotParseResponse["debug"]>;
  };
  rotationScreenshots: RotationScreenshotAttachment[];
}) {
  const { rotationDashboard, screenshotParseResult, rotationScreenshots } = args;
  const liveChainInputSources = getLiveChainInputSources(screenshotParseResult);
  const header = screenshotParseResult.debug?.parsedHeader ?? { layoverCities: [] };
  const rawFinalOrderedChain = screenshotParseResult.debug?.orderedChain ?? [];
  const chainBuildResult = buildScreenshotUserFacingChainPure({
    rawFinalOrderedChain,
    legCandidates: liveChainInputSources.selectedCandidates,
    context: {
      base: header.base ?? null,
      layoverCities: header.layoverCities ?? [],
      startDate: header.startDate,
      endDate: header.endDate,
      reportTime: header.reportTime ?? null,
    },
  });
  const visibleOperatingLegs = chainBuildResult.userFacingLegs.filter((leg) => !leg.isDeadhead);
  const dhTimelineLegs = chainBuildResult.userFacingLegs.filter((leg) => leg.isDeadhead);
  const snapshotComputation = computeSnapshotFromUserFacingChainPure({
    userFacingLegs: chainBuildResult.userFacingLegs,
    headerScheduledBlockMinutes: undefined,
    fallbackScheduledBlockMinutes: rotationDashboard.snapshot.scheduledBlockMinutes,
    finalArrivalFallback: rotationDashboard.snapshot.finalArrival,
  });
  const orderedChainKeys = new Set(
    rawFinalOrderedChain.map((candidate) => buildBuilderCandidateStableKey(candidate)),
  );
  const builderOutputKeys = new Set(
    chainBuildResult.userFacingLegs.map((candidate) => buildBuilderCandidateStableKey(candidate)),
  );
  const unmatchedCandidates = liveChainInputSources.selectedCandidates
    .filter((candidate) => !orderedChainKeys.has(buildBuilderCandidateStableKey(candidate)))
    .map((candidate) => ({
      sourceArrayName: liveChainInputSources.selectedSourceName,
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceScreenshotIndex: candidate.sourceScreenshotIndex ?? null,
      rawSourceLine: candidate.rawSourceLine ?? null,
      sourceText: candidate.sourceText ?? null,
      confidence: null,
    }));
  const discardedFragments = rawFinalOrderedChain
    .filter((candidate) => !builderOutputKeys.has(buildBuilderCandidateStableKey(candidate)))
    .map((candidate) => ({
      sourceArrayName: "selectedSeedChain",
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceScreenshotIndex: null,
      rawSourceLine: null,
      sourceText: candidate.sourceText ?? null,
      confidence: null,
    }));

  return {
    analysisRunId: screenshotParseResult.analysisRunId ?? null,
    analysisTimestamp: screenshotParseResult.analysisTimestamp ?? null,
    screenshotCount: rotationScreenshots.length,
    screenshotFilenames: rotationScreenshots.map((item) => item.name),
    rotationNumber: rotationDashboard.snapshot.rotationNumber,
    tripDates: rotationDashboard.snapshot.tripDates,
    headerTotals: {
      totalCreditMinutes: rotationDashboard.snapshot.totalCreditMinutes,
      headerScheduledBlockMinutes: parseClockishMinutes(header.totalScheduledBlock) ?? null,
      tafb: screenshotParseResult.debug?.parsedHeader?.tafb ?? null,
      reportTime: screenshotParseResult.debug?.parsedHeader?.reportTime ?? null,
      releaseTime: screenshotParseResult.debug?.parsedHeader?.releaseTime ?? null,
    },
    candidateSourcesInspected: liveChainInputSources.sourceSummaries.map((source) => ({
      sourceName: source.name,
      count: source.count,
      firstFiveCityPairs: source.cityPairs.slice(0, 5),
      allCityPairs: source.count < 25 ? source.cityPairs : undefined,
      containsSlcDtw: source.containsSlcDtw,
      containsDtwMsp: source.containsDtwMsp,
      containsMspRdu: source.containsMspRdu,
      containsSatSlc: source.containsSatSlc,
    })),
    builderInputSourceName: liveChainInputSources.selectedSourceName,
    canonicalCandidateSource: chainBuildResult.canonicalCandidateSource,
    builderInputCandidates: liveChainInputSources.selectedCandidates.map((candidate) => ({
      sourceArrayName: liveChainInputSources.selectedSourceName,
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceScreenshotIndex: candidate.sourceScreenshotIndex ?? null,
      rawSourceLine: candidate.rawSourceLine ?? null,
      sourceText: candidate.sourceText ?? null,
      confidence: null,
    })),
    selectedSeedChain: rawFinalOrderedChain.map((candidate) => ({
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceText: candidate.sourceText ?? null,
    })),
    allTripSegments: chainBuildResult.allTripSegments.map((candidate) => ({
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceText: candidate.sourceText ?? null,
    })),
    builderOutputUserFacingLegs: chainBuildResult.userFacingLegs.map((candidate) => ({
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceText: candidate.sourceText ?? null,
      isDeadhead: Boolean(candidate.isDeadhead),
    })),
    deadheadAnnotations: chainBuildResult.deadheadAnnotations,
    visibleOperatingLegs: visibleOperatingLegs.map((candidate) => ({
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceText: candidate.sourceText ?? null,
    })),
    tripTimelineLegs: chainBuildResult.userFacingLegs.map((candidate) => ({
      key: buildBuilderCandidateStableKey(candidate),
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlockMinutes: parseClockishMinutes(candidate.scheduledBlock) ?? null,
      sourceText: candidate.sourceText ?? null,
      isDeadhead: Boolean(candidate.isDeadhead),
    })),
    discardedFragments,
    unmatchedCandidates,
    runtimeSummary: {
      rawFinalOrderedChainCount: rawFinalOrderedChain.length,
      runtimeBuilderInputCandidateCount: liveChainInputSources.selectedCandidates.length,
      chainAnchorReason: chainBuildResult.chainAnchorReason,
      anchoredFirstLeg: chainBuildResult.anchoredFirstLeg,
      wasChainRotated: chainBuildResult.wasChainRotated,
      builderOutputLegCount: chainBuildResult.userFacingLegs.length,
      builderOutputFirstLeg: chainBuildResult.userFacingLegs[0]
        ? `${chainBuildResult.userFacingLegs[0]?.departureAirport ?? "?"}-${chainBuildResult.userFacingLegs[0]?.arrivalAirport ?? "?"}`
        : "unknown",
      builderOutputLastLeg: chainBuildResult.userFacingLegs.at(-1)
        ? `${chainBuildResult.userFacingLegs.at(-1)?.departureAirport ?? "?"}-${chainBuildResult.userFacingLegs.at(-1)?.arrivalAirport ?? "?"}`
        : "unknown",
      tripTimelineLegCount: chainBuildResult.userFacingLegs.length,
      operatingLegCount: visibleOperatingLegs.length,
      dhLegCount: dhTimelineLegs.length,
      logbookExportLegCount: visibleOperatingLegs.length,
      scheduledBlock: snapshotComputation.scheduledBlockMinutes,
      scheduledBlockSource: snapshotComputation.scheduledBlockSource,
      nextFlight: snapshotComputation.nextFlightCityPair,
      finalArrival: snapshotComputation.finalArrival,
      discardedAfterTerminal: chainBuildResult.discardedAfterTerminal,
      unmatchedCandidateCount: unmatchedCandidates.length,
      partialBannerVisible: rotationDashboard.parsedRotation.isPartial,
      partialSourceUsed: "displayModel.partialDiagnosis.isPartial",
    },
  };
}

function buildICrewDebugExport(args: {
  rawText: string;
  parsed: ReturnType<typeof parseICrewTextWithDiagnostics>["parsed"];
  diagnostics: ICrewParserDiagnostics | null;
  parserError?: string | null;
}) {
  const { rawText, parsed, diagnostics, parserError } = args;
  const rawTextLength = rawText.length;
  const rawTextFirst500 = rawText.slice(0, 500);
  const rawTextLast500 = rawText.slice(Math.max(0, rawText.length - 500));
  if (!parsed) {
    return {
      sourceType: "iCrewText" as const,
      rawTextLength,
      rawLineCount: diagnostics?.rawLineCount ?? rawText.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
      rawTextFirst500,
      rawTextLast500,
      parserSucceeded: false,
      parserError: parserError ?? "Unknown iCrew parser error.",
      first50RawLines: diagnostics?.first50RawLines ?? [],
      last50RawLines: diagnostics?.last50RawLines ?? [],
      first50NormalizedLines: diagnostics?.first50NormalizedLines ?? [],
      last50NormalizedLines: diagnostics?.last50NormalizedLines ?? [],
      parserStageFailed: diagnostics?.parserStageFailed ?? null,
      headerCandidateLines: diagnostics?.headerCandidateLines ?? [],
      totalsCandidateLines: diagnostics?.totalsCandidateLines ?? [],
      legCandidateLines: diagnostics?.legCandidateLines ?? [],
      parsedHeader: diagnostics?.parsedHeader ?? null,
      parsedTotals: diagnostics?.parsedTotals ?? null,
      parsedSegments: [],
      allTripSegments: [],
      visibleOperatingLegs: [],
      deadheadAnnotations: [],
      logbookLegs: [],
      incompleteFragments: [],
      scheduledBlock: 0,
      scheduledBlockSource: null,
      totalDeadheadBlock: 0,
      dashboardPreviewSource: null,
      partialStatus: null,
      finalOperatingArrival: null,
      finalArrivalAfterDh: null,
      reconciliation: {
        tblFromSummary: null,
        summedOperatingBlock: null,
        tdhdFromSummary: null,
        summedDeadheadBlock: null,
        tblMatches: false,
        tdhdMatches: false,
      },
      attemptedLegParseResults: diagnostics?.attemptedLegParseResults ?? [],
      parserNotes: [
        "Debug-only iCrew parse path bypassed the legacy MiCrew text analyzer.",
        "Parser failed before normalized display-model output could be built.",
      ],
    };
  }
  return {
    sourceType: "iCrewText" as const,
    rawTextLength,
    rawLineCount: diagnostics?.rawLineCount ?? rawText.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
    rawTextFirst500,
    rawTextLast500,
    parserSucceeded: true,
    parserError: null,
    first50RawLines: diagnostics?.first50RawLines ?? [],
    last50RawLines: diagnostics?.last50RawLines ?? [],
    first50NormalizedLines: diagnostics?.first50NormalizedLines ?? [],
    last50NormalizedLines: diagnostics?.last50NormalizedLines ?? [],
    parserStageFailed: diagnostics?.parserStageFailed ?? null,
    headerCandidateLines: diagnostics?.headerCandidateLines ?? [],
    totalsCandidateLines: diagnostics?.totalsCandidateLines ?? [],
    legCandidateLines: diagnostics?.legCandidateLines ?? [],
    attemptedLegParseResults: diagnostics?.attemptedLegParseResults ?? [],
    parsedHeader: {
      base: parsed.header.base,
      fleetCategory: parsed.header.fleetCategory,
      rotationNumber: parsed.header.rotationNumber,
      position: parsed.header.position,
      effectiveDate: parsed.header.effectiveDate,
      reportTime: parsed.header.reportTime,
      tripDates: parsed.header.tripDates,
    },
    parsedTotals: {
      totalCreditMinutes: parsed.header.totalCreditMinutes,
      scheduledBlockMinutes: parsed.header.scheduledBlockMinutes,
      totalDeadheadBlockMinutes: parsed.header.totalDeadheadBlockMinutes,
      tafbCredit: parsed.header.tafbCredit,
      tafbElapsed: parsed.header.tafbElapsed,
    },
    parsedSegments: parsed.normalizedCandidates.map((candidate) => ({
      date: candidate.date ?? null,
      origin: candidate.departureAirport ?? null,
      destination: candidate.arrivalAirport ?? null,
      carrier: candidate.carrier ?? null,
      flightNumber: candidate.flightNumber ?? null,
      scheduledOut: candidate.scheduledOut ?? null,
      scheduledIn: candidate.scheduledIn ?? null,
      scheduledBlock: candidate.scheduledBlock ?? null,
      sourceText: candidate.sourceText ?? null,
      confirmationCode: candidate.confirmationCode ?? null,
      isDeadhead: candidate.isDeadhead ?? false,
      segmentType: candidate.segmentType ?? null,
    })),
    allTripSegments: parsed.allTripSegments.map((leg) => ({
      date: leg.date ?? null,
      origin: leg.departureAirport ?? null,
      destination: leg.arrivalAirport ?? null,
      carrier: leg.carrier ?? null,
      flightNumber: leg.flightNumber ?? null,
      scheduledOut: leg.scheduledOut ?? null,
      scheduledIn: leg.scheduledIn ?? null,
      scheduledBlock: leg.scheduledBlock ?? null,
      isDeadhead: leg.isDeadhead ?? false,
      segmentType: leg.segmentType ?? null,
      confirmationCode: leg.confirmationCode ?? null,
      sourceText: leg.sourceText ?? null,
    })),
    visibleOperatingLegs: parsed.visibleOperatingLegs.map((leg) => ({
      date: leg.date ?? null,
      origin: leg.departureAirport ?? null,
      destination: leg.arrivalAirport ?? null,
      carrier: leg.carrier ?? null,
      flightNumber: leg.flightNumber ?? null,
      scheduledOut: leg.scheduledOut ?? null,
      scheduledIn: leg.scheduledIn ?? null,
      scheduledBlock: leg.scheduledBlock ?? null,
      sourceText: leg.sourceText ?? null,
    })),
    deadheadAnnotations: parsed.deadheadAnnotations,
    incompleteFragments: parsed.incompleteFragments,
    logbookLegs: parsed.logbookLegs.map((leg) => ({
      date: leg.date ?? null,
      origin: leg.departureAirport ?? null,
      destination: leg.arrivalAirport ?? null,
      carrier: leg.carrier ?? null,
      flightNumber: leg.flightNumber ?? null,
      scheduledOut: leg.scheduledOut ?? null,
      scheduledIn: leg.scheduledIn ?? null,
      scheduledBlock: leg.scheduledBlock ?? null,
      sourceText: leg.sourceText ?? null,
    })),
    scheduledBlock: parsed.operatingScheduledBlockMinutes,
    scheduledBlockSource: parsed.scheduledBlockSource,
    totalDeadheadBlock: parsed.deadheadScheduledBlockMinutes,
    dashboardPreviewSource: "iCrewDebugParse",
    partialStatus: parsed.partialStatus,
    partialReason: parsed.partialReason,
    finalOperatingArrival: parsed.finalOperatingArrival,
    finalArrivalAfterDh: parsed.finalArrivalAfterDeadhead,
    reconciliation: {
      tblFromSummary: parsed.header.scheduledBlockMinutes,
      summedOperatingBlock: parsed.operatingScheduledBlockMinutes,
      tdhdFromSummary: parsed.header.totalDeadheadBlockMinutes,
      summedDeadheadBlock: parsed.deadheadScheduledBlockMinutes,
      tblMatches:
        typeof parsed.header.scheduledBlockMinutes === "number"
          ? parsed.header.scheduledBlockMinutes === parsed.operatingScheduledBlockMinutes
          : null,
      tdhdMatches:
        typeof parsed.header.totalDeadheadBlockMinutes === "number"
          ? parsed.header.totalDeadheadBlockMinutes === parsed.deadheadScheduledBlockMinutes
          : null,
    },
    parserNotes: [
      "Debug-only iCrew parse path bypassed the legacy MiCrew text analyzer.",
      "Parsed output was built through shared display-model helpers inside parseICrewText.",
      ...parsed.parserNotes,
    ],
  };
}

function looksLikeICrewRotationText(rawText: string) {
  const normalized = rawText.replace(/\s+/g, " ").toUpperCase();
  const strongMarkers = [
    "*** ROTATION OPER",
    "REGULAR-",
    "TDHD",
    "TAFB",
    "PWA FDP/SKD MAX/ACT MAX",
    "ROT GUAR",
  ];
  const matchedMarkerCount = strongMarkers.filter((marker) => normalized.includes(marker)).length;
  const hasDayFlightHeader = /DAY\s+FLT\s+T\s+DEPARTS\s+ARRIVES/i.test(normalized);
  const hasRotationHeader = /POS-[A-Z0-9]{1,3}.*EFFECTIVE\s+[A-Z]{3}\d{2}/i.test(normalized);
  return matchedMarkerCount >= 2 || (matchedMarkerCount >= 1 && hasDayFlightHeader) || (matchedMarkerCount >= 2 && hasRotationHeader);
}

function buildICrewParsedDashboard(
  parsed: NonNullable<ReturnType<typeof parseICrewTextWithDiagnostics>["parsed"]>,
  options?: {
    previewNote?: string;
  },
): RotationDashboardData {
  const base = parsed.header.base;
  const tripTimelineLegs = parsed.allTripSegments;
  const firstLeg = tripTimelineLegs[0];
  const finalOperatingArrival = parsed.finalOperatingArrival;
  const finalArrivalAfterDh = parsed.finalArrivalAfterDeadhead;
  const layoverCities = parsed.layoverCities;
  const layoverDetails: RotationLayoverDetail[] = parsed.layoverDetails.map((detail) => ({
    city: detail.city,
    hotelName: detail.hotelName,
    hotelPhone: detail.hotelPhone,
    transport: detail.transport,
    transportProvider: detail.transportProvider,
    transportType: detail.transportType,
    transportPhone: detail.transportPhone,
    pickup: detail.pickup,
    restMinutes: detail.restMinutes,
  }));
  const firstLayoverDetail = layoverDetails[0];
  const findSegmentEquipment = (leg: RotationChainLeg) =>
    parsed.normalizedCandidates.find(
      (candidate) =>
        candidate.flightNumber === leg.flightNumber &&
        candidate.departureAirport === leg.departureAirport &&
        candidate.arrivalAirport === leg.arrivalAirport &&
        candidate.scheduledOut === leg.scheduledOut &&
        candidate.scheduledIn === leg.scheduledIn,
    )?.equipmentShip;
  const mappedLegs = tripTimelineLegs.map((leg, index) => ({
    id: `icrew-debug-leg-${index + 1}-${leg.flightNumber ?? "unk"}-${leg.departureAirport ?? "x"}-${leg.arrivalAirport ?? "x"}-${leg.scheduledOut ?? "na"}`,
    dayLabel: leg.date ?? `Day ${index + 1}`,
    flightNumber: leg.flightNumber ?? "TBD",
    origin: leg.departureAirport ?? "TBD",
    destination: leg.arrivalAirport ?? "TBD",
    departureTime: extractCompactClock(leg.scheduledOut),
    arrivalTime: extractCompactClock(leg.scheduledIn),
    scheduledBlockMinutes: parseClockishMinutes(leg.scheduledBlock),
    turnMinutes: parseClockishMinutes(leg.turn),
    status: "placeholder" as const,
    aircraft: findSegmentEquipment(leg) ?? undefined,
    gate: undefined,
    isDeadhead: Boolean(leg.isDeadhead),
    legKind: leg.isDeadhead ? ("deadhead" as const) : ("operating" as const),
    deadheadSource: leg.isDeadhead ? "micrew_context" : undefined,
    confirmationNumber: leg.confirmationCode ?? undefined,
    carrier: leg.carrier ?? undefined,
    sourceText: leg.sourceText ?? undefined,
    excludeFromLogbookExport: Boolean(leg.isDeadhead),
  }));
  const parsedRotationLegs = mappedLegs.map((leg, index) => ({
    id: leg.id,
    legNumber: index + 1,
    dayNumber: index + 1,
    departureAirport: leg.origin,
    arrivalAirport: leg.destination,
    flightNumber: leg.flightNumber,
    scheduledOut: extractCompactClockDigits(leg.departureTime),
    scheduledIn: extractCompactClockDigits(leg.arrivalTime),
    scheduledBlock: leg.scheduledBlockMinutes,
    turnAfterPreviousLeg: leg.turnMinutes,
    status: "placeholder" as const,
    isDeadhead: leg.isDeadhead,
    legKind: leg.isDeadhead ? ("deadhead" as const) : ("operating" as const),
    confirmationNumber: leg.confirmationNumber,
    carrier: leg.carrier,
    sourceText: leg.sourceText,
    deadheadSource: leg.deadheadSource,
  }));
  const nextLeg = firstLeg
    ? {
        id: "icrew-debug-next-leg",
        dayLabel: firstLeg.date ?? "Day 1",
        flightNumber: firstLeg.flightNumber ?? "TBD",
        origin: firstLeg.departureAirport ?? "TBD",
        destination: firstLeg.arrivalAirport ?? "TBD",
        departureTime: extractCompactClock(firstLeg.scheduledOut),
        arrivalTime: extractCompactClock(firstLeg.scheduledIn),
        scheduledBlockMinutes: parseClockishMinutes(firstLeg.scheduledBlock),
        turnMinutes: parseClockishMinutes(firstLeg.turn),
        status: "placeholder" as const,
        aircraft: findSegmentEquipment(firstLeg) ?? undefined,
        gate: undefined,
        isDeadhead: Boolean(firstLeg.isDeadhead),
        legKind: firstLeg.isDeadhead ? ("deadhead" as const) : ("operating" as const),
        deadheadSource: firstLeg.isDeadhead ? "micrew_context" : undefined,
        confirmationNumber: firstLeg.confirmationCode ?? undefined,
        carrier: firstLeg.carrier ?? undefined,
        sourceText: firstLeg.sourceText ?? undefined,
        excludeFromLogbookExport: Boolean(firstLeg.isDeadhead),
      }
    : undefined;
  const whatMatters = parsed.deadheadAnnotations.map((annotation) => ({
    label:
      (annotation.destination ?? "").toUpperCase() === base.toUpperCase()
        ? "DEADHEAD HOME"
        : "DEADHEAD",
    tone: "watch" as const,
    detail: `Deadhead ${annotation.cityPair} on ${annotation.carrier ?? "DL"}${annotation.flightNumber ? annotation.flightNumber : ""} departs ${annotation.scheduledOut ?? "TBD"}${
      annotation.confirmationCode
        ? `. Confirmation #${annotation.confirmationCode}.`
        : ". DH confirmation not found. Add MiCrew DH card to enable check-in actions."
    }`,
    actionLabel: annotation.confirmationCode ? "Copy confirmation code" : undefined,
    actionCopyValue: annotation.confirmationCode ?? undefined,
    secondaryActionLabel: annotation.confirmationCode ? "Check in" : undefined,
    secondaryActionUrl: annotation.confirmationCode ? DELTA_CHECK_IN_URL : undefined,
  }));

  return {
    snapshot: {
      tripDates: parsed.header.tripDates,
      rotationNumber: parsed.header.rotationNumber,
      totalCreditMinutes: parsed.header.totalCreditMinutes ?? 0,
      scheduledBlockMinutes: parsed.operatingScheduledBlockMinutes,
      legCount: mappedLegs.length,
      layoverCities,
      finalArrival: finalOperatingArrival,
    },
    legs: mappedLegs,
    nextLeg,
    whatMatters,
    layoverDetails,
    dutyDays: [],
    tonightLayoverCity: layoverCities[0] ?? "TBD",
    tomorrowReportTime: undefined,
    scheduledRestMinutes: firstLayoverDetail?.restMinutes,
    note: options?.previewNote ?? "Loaded from iCrew text.",
    source: "parsed",
    parsedRotation: {
      rotationNumber: parsed.header.rotationNumber,
      startDate: parsed.header.tripDates.split("-")[0]?.trim(),
      endDate: parsed.header.tripDates.split("-")[1]?.trim(),
      reportTime: parsed.header.reportTime,
      releaseTime: undefined,
      totalCredit: parsed.header.totalCreditMinutes ?? undefined,
      totalScheduledBlock: parsed.operatingScheduledBlockMinutes,
      deadheadBlock: parsed.deadheadScheduledBlockMinutes,
      finalArrivalAfterDh,
      excludedDeadheadLegs: parsed.deadheadAnnotations.length,
      layoverCities,
      dutyPeriods: [],
      legs: parsedRotationLegs,
      isPartial: parsed.partialStatus,
      sourceTypes: "text",
      visibleLegCount: mappedLegs.length,
      missingSections: [],
      partialReason: parsed.partialReason,
      parseConfidence: "high",
      sourceFormat: "icrew_printout",
      parserPath: "icrew_printout_parser",
      rowFormat: "icrew_without_mu",
      parserWarnings: [],
      rejectedCandidateRows: [],
      micrewLegsParsed: 0,
      icrewRowsParsed: parsed.normalizedCandidates.length,
      deadheadAnnotations: parsed.deadheadAnnotations,
    },
  };
}

function extractHeaderBlockTimeCreditPairs(values: string[]) {
  const matches = values.flatMap((value) => {
    const found = value.match(
      /\b(?:Credit|TAFB|Block|Blk|Rpt|Rls|Report|Release|Rotation\s*#|Trip dates?)\s*[-:#]?\s*([A-Z0-9:, ]{2,40})/gi,
    );
    return found ?? [];
  });
  return Array.from(new Set(matches));
}

function buildRotationParseTraceWarnings(args: {
  screenshotParseResult: RotationScreenshotParseResponse | null;
  dashboard: RotationDashboardData | null;
}) {
  const warnings: string[] = [];
  const orderedChain = args.screenshotParseResult?.debug?.orderedChain ?? [];
  const parsedHeader = args.screenshotParseResult?.debug?.parsedHeader;
  const nextFlight = args.dashboard?.nextLeg;

  const totalScheduledBlock = args.dashboard?.snapshot.scheduledBlockMinutes;
  if (
    totalScheduledBlock != null &&
    orderedChain.some((leg) => parseClockishMinutes(leg.scheduledIn) === totalScheduledBlock)
  ) {
    warnings.push("Total scheduled block matches a leg arrival clock time, which suggests a field-mapping bug.");
  }

  orderedChain.forEach((leg) => {
    const blockMinutes = parseClockishMinutes(leg.scheduledBlock);
    if (blockMinutes != null && blockMinutes > 12 * 60) {
      warnings.push(
        `Leg ${leg.index} ${leg.flightNumber ?? "UNK"} has a scheduled block over 12:00 (${leg.scheduledBlock}), which is suspicious.`,
      );
    }
    if (leg.scheduledBlock && leg.scheduledIn && leg.scheduledBlock === leg.scheduledIn) {
      warnings.push(
        `Leg ${leg.index} ${leg.flightNumber ?? "UNK"} has scheduled block equal to scheduled in (${leg.scheduledBlock}).`,
      );
    }
  });

  const lastOrderedLeg = orderedChain.at(-1);
  if (
    lastOrderedLeg?.arrivalAirport &&
    args.dashboard?.snapshot.finalArrival &&
    args.dashboard.snapshot.finalArrival !== lastOrderedLeg.arrivalAirport
  ) {
    warnings.push(
      `Final arrival (${args.dashboard.snapshot.finalArrival}) does not match the last ordered chain leg arrival (${lastOrderedLeg.arrivalAirport}).`,
    );
  }

  const firstOrderedLeg = orderedChain[0];
  if (
    firstOrderedLeg &&
    nextFlight &&
    (nextFlight.origin !== firstOrderedLeg.departureAirport ||
      nextFlight.destination !== firstOrderedLeg.arrivalAirport ||
      nextFlight.departureTime !== firstOrderedLeg.scheduledOut)
  ) {
    warnings.push("Next Flight does not match the first leg in the ordered chain, even though no current-time logic is applied yet.");
  }

  if (args.dashboard?.parsedRotation.isPartial && orderedChain.length > 0) {
    warnings.push("The dashboard is currently marked partial even though an ordered screenshot chain exists. Check partial-state aggregation.");
  }
  if (!parsedHeader?.startDate || !parsedHeader?.endDate) {
    warnings.push("Missing header start/end date");
  }

  return Array.from(new Set(warnings));
}

function buildScreenshotBackedDashboardModel(
  dashboard: RotationDashboardData,
  screenshotParseResult: RotationScreenshotParseResponse & {
    debug: NonNullable<RotationScreenshotParseResponse["debug"]>;
  },
): RotationDashboardData {
  const rawFinalOrderedChain = screenshotParseResult.debug?.orderedChain ?? [];
  const header = screenshotParseResult.debug?.parsedHeader ?? { layoverCities: [] };
  const liveChainInputSources = getLiveChainInputSources(screenshotParseResult);
  const runtimeBuilderInputCandidates = liveChainInputSources.selectedCandidates;
  const candidateCityPairs = runtimeBuilderInputCandidates.map(
    (candidate) =>
      `${candidate.departureAirport ?? "?"}-${candidate.arrivalAirport ?? "?"} | ${candidate.scheduledOut ?? "?"} | ${candidate.scheduledIn ?? "?"} | ${candidate.scheduledBlock ?? "?"} | ${candidate.carrier ?? "?"} | ${candidate.flightNumber ?? "?"}`,
  );
  const chainBuildResult = buildScreenshotUserFacingChainPure({
    rawFinalOrderedChain,
    legCandidates: runtimeBuilderInputCandidates,
    context: {
      base: header.base ?? null,
      layoverCities: header.layoverCities ?? [],
      startDate: header.startDate,
      endDate: header.endDate,
      reportTime: header.reportTime ?? null,
    },
  });
  const deadheadAnnotations = chainBuildResult.deadheadAnnotations;
  const userFacingLegs = chainBuildResult.userFacingLegs;
  const hasAuthoritativeUserFacingChain =
    userFacingLegs.length > 0 || chainBuildResult.allTripSegments.length > 0;
  if (!hasAuthoritativeUserFacingChain) {
    return {
      ...dashboard,
      note: dashboard.note,
      parsedRotation: {
        ...dashboard.parsedRotation,
        parserWarnings: Array.from(new Set([
          ...(dashboard.parsedRotation.parserWarnings ?? []),
          "Screenshot chain builder could not produce a final ordered route chain from the extracted candidate pool.",
        ])),
      },
    };
  }
  const operatingLegs = userFacingLegs.filter((leg) => !leg.isDeadhead);
  const deadheadLegs = userFacingLegs.filter((leg) => leg.isDeadhead);
  const mappedUserFacingLegs = userFacingLegs.map((leg, index) => {
    const inferredDayLabel =
      leg.date ? leg.date.toUpperCase() : `Leg ${index + 1}`;
    const departureTime = extractCompactClock(leg.scheduledOut);
    const arrivalTime = extractCompactClock(leg.scheduledIn);
    return {
      id: `screenshot-leg-${index + 1}-${leg.flightNumber ?? "unk"}-${leg.departureAirport ?? "x"}-${leg.arrivalAirport ?? "x"}-${leg.scheduledOut ?? "na"}`,
      dayLabel: inferredDayLabel,
      flightNumber: leg.flightNumber ?? "TBD",
      origin: leg.departureAirport ?? "TBD",
      destination: leg.arrivalAirport ?? "TBD",
      departureTime,
      arrivalTime,
      scheduledBlockMinutes: parseClockishMinutes(leg.scheduledBlock),
      turnMinutes: parseClockishMinutes(leg.turn),
      status: "placeholder" as const,
      aircraft: undefined,
      gate: undefined,
      isDeadhead: Boolean(leg.isDeadhead),
      legKind: leg.isDeadhead ? ("deadhead" as const) : ("operating" as const),
      deadheadSource: leg.isDeadhead ? "micrew_context" : undefined,
      confirmationNumber: leg.confirmationCode ?? undefined,
      carrier: leg.carrier ?? undefined,
      sourceText: leg.sourceText ?? undefined,
      excludeFromLogbookExport: Boolean(leg.isDeadhead),
    };
  });
  const deadheadReturnHome = deadheadAnnotations.find(
    (annotation) =>
      (annotation.destination ?? "").toUpperCase() ===
      (header.base ?? userFacingLegs[0]?.departureAirport ?? "").toUpperCase(),
  );
  const snapshotComputation = computeSnapshotFromUserFacingChainPure({
    userFacingLegs,
    headerScheduledBlockMinutes: undefined,
    fallbackScheduledBlockMinutes: dashboard.snapshot.scheduledBlockMinutes,
    finalArrivalFallback: dashboard.snapshot.finalArrival,
  });
  const partialDiagnosis = diagnoseScreenshotRotationPartialStatusPure({
    userFacingLegs,
    allTripSegments: chainBuildResult.allTripSegments,
    context: {
      base: header.base ?? userFacingLegs[0]?.departureAirport ?? null,
      layoverCities: header.layoverCities ?? [],
      startDate: header.startDate,
      endDate: header.endDate,
    },
  });
  const shouldDowngradePartialToDeadheadReturn =
    partialDiagnosis.isPartial &&
    (partialDiagnosis.partialReason ?? "").includes("does not return to base") &&
    Boolean(deadheadReturnHome);
  const operatingBlockMinutes = snapshotComputation.computedUserFacingScheduledBlock;
  const deadheadBlockMinutes = deadheadLegs.reduce(
    (sum, leg) => sum + (parseClockishMinutes(leg.scheduledBlock) ?? 0),
    0,
  );
  const missingBlockWarnings = operatingLegs
    .filter((leg) => !leg.scheduledBlock)
    .map((leg) => `Missing block for leg ${leg.flightNumber ?? "unknown"}`);
  const validationWarnings: string[] = [];
  if (userFacingLegs.some((leg) => parseClockishMinutes(leg.scheduledIn) === snapshotComputation.scheduledBlockMinutes)) {
    validationWarnings.push("Operating scheduled block matches a leg arrival clock time, which suggests a field-mapping bug.");
  }
  const parsedOperatingBlockMinutes = dashboard.parsedRotation.totalScheduledBlock ?? 0;
  if (
    snapshotComputation.scheduledBlockSource !== "header" &&
    Math.abs(parsedOperatingBlockMinutes - snapshotComputation.computedUserFacingScheduledBlock) > 5
  ) {
    validationWarnings.push(
      `Operating block mismatch: dashboard parser has ${parsedOperatingBlockMinutes} minutes but explicit Blk rows total ${snapshotComputation.computedUserFacingScheduledBlock}.`,
    );
  }
  const firstOrderedLeg = userFacingLegs[0];
  const lastOrderedLeg = userFacingLegs.at(-1);
  const lastOperatingLeg = operatingLegs.at(-1);
  if (
    firstOrderedLeg &&
    (dashboard.nextLeg?.origin !== firstOrderedLeg.departureAirport ||
      dashboard.nextLeg?.destination !== firstOrderedLeg.arrivalAirport)
  ) {
    validationWarnings.push("Next Flight was not the first leg in the ordered chain, so it was reset to the first ordered leg.");
  }
  if (
    lastOrderedLeg?.arrivalAirport &&
    dashboard.snapshot.finalArrival !== lastOrderedLeg.arrivalAirport
  ) {
    validationWarnings.push("Final arrival did not match the last ordered chain leg, so it was reset from the ordered chain.");
  }

  const nextLeg = firstOrderedLeg
    ? {
        ...dashboard.nextLeg,
        dayLabel: dashboard.nextLeg?.dayLabel ?? "Day 1",
        flightNumber: firstOrderedLeg.flightNumber ?? dashboard.nextLeg?.flightNumber ?? "TBD",
        origin: firstOrderedLeg.departureAirport ?? dashboard.nextLeg?.origin ?? "TBD",
        destination: firstOrderedLeg.arrivalAirport ?? dashboard.nextLeg?.destination ?? "TBD",
        departureTime: extractCompactClock(firstOrderedLeg.scheduledOut) ?? dashboard.nextLeg?.departureTime,
        arrivalTime: extractCompactClock(firstOrderedLeg.scheduledIn) ?? dashboard.nextLeg?.arrivalTime,
        scheduledBlockMinutes: parseClockishMinutes(firstOrderedLeg.scheduledBlock) ?? dashboard.nextLeg?.scheduledBlockMinutes,
        turnMinutes: parseClockishMinutes(firstOrderedLeg.turn) ?? dashboard.nextLeg?.turnMinutes,
        isDeadhead: Boolean(firstOrderedLeg.isDeadhead),
        legKind: firstOrderedLeg.isDeadhead ? ("deadhead" as const) : ("operating" as const),
        confirmationNumber: firstOrderedLeg.confirmationCode ?? undefined,
        carrier: firstOrderedLeg.carrier ?? undefined,
        sourceText: firstOrderedLeg.sourceText ?? dashboard.nextLeg?.sourceText,
        excludeFromLogbookExport: Boolean(firstOrderedLeg.isDeadhead),
      }
    : dashboard.nextLeg;

  const partialWhatMattersCard = partialDiagnosis.isPartial && !shouldDowngradePartialToDeadheadReturn
    ? {
        label: "Partial rotation",
        tone: "watch" as const,
        detail: `This screenshot set does not appear to include the full rotation. The visible chain ends at ${lastOrderedLeg ? `${lastOrderedLeg.departureAirport ?? "?"}-${lastOrderedLeg.arrivalAirport ?? "?"}` : "the current last visible leg"} with final arrival ${snapshotComputation.finalArrival}${partialDiagnosis.rotationBase ? ` instead of returning to ${partialDiagnosis.rotationBase}` : ""}. Add the remaining screenshot(s) or paste the full rotation text.`,
      }
    : null;
  const deadheadWhatMattersCards = deadheadAnnotations.map((annotation) => ({
    label:
      (annotation.destination ?? "").toUpperCase() ===
      (header.base ?? userFacingLegs[0]?.departureAirport ?? "").toUpperCase()
        ? "DEADHEAD HOME"
        : "DEADHEAD",
    tone: "watch" as const,
    detail: `Deadhead ${annotation.cityPair} on ${annotation.carrier ?? "DL"}${annotation.flightNumber ? annotation.flightNumber : ""} departs ${annotation.scheduledOut ?? "TBD"}${
      annotation.confirmationCode
        ? `. Confirmation #${annotation.confirmationCode}.`
        : ". DH confirmation not found. Add MiCrew DH card to enable check-in actions."
    }`,
    actionLabel: annotation.confirmationCode ? "Copy confirmation code" : undefined,
    actionCopyValue: annotation.confirmationCode ?? undefined,
    secondaryActionLabel: annotation.confirmationCode ? "Check in" : undefined,
    secondaryActionUrl: annotation.confirmationCode ? DELTA_CHECK_IN_URL : undefined,
  }));

  const screenshotDutyPeriods = dashboard.parsedRotation.dutyPeriods.map((period) => ({
    ...period,
    status: "Needs full duty period details" as const,
  }));
  const headerLooksComplete =
    Boolean(header?.rotationNumber) &&
    Boolean(header?.startDate && header?.endDate) &&
    Boolean(header?.reportTime && header?.releaseTime) &&
    Boolean(header?.totalCredit) &&
    (header?.layoverCities?.length ?? 0) > 0;
  const shouldTreatRotationAsFull =
    headerLooksComplete &&
    userFacingLegs.length > 0 &&
    partialDiagnosis.hasTerminalReturnToBase &&
    (lastOrderedLeg?.arrivalAirport ?? snapshotComputation.finalArrival) ===
      (partialDiagnosis.rotationBase ?? (lastOrderedLeg?.arrivalAirport ?? snapshotComputation.finalArrival));
  const parserWarnings = [...(dashboard.parsedRotation.parserWarnings ?? []), ...missingBlockWarnings, ...validationWarnings];
  if (shouldTreatRotationAsFull && chainBuildResult.discardedAfterTerminal > 0) {
    parserWarnings.push("Discarded unmatched screenshot fragments after building complete route chain.");
  }

  const partialBannerVisible = !shouldDowngradePartialToDeadheadReturn && partialDiagnosis.isPartial;
  const partialSourceUsed = "displayModel.partialDiagnosis.isPartial";
  const visibleRotationSourceDebug = {
    usedExportedBuilder: true,
    canonicalCandidateSource: chainBuildResult.canonicalCandidateSource,
    runtimeBuilderInputSource: liveChainInputSources.selectedSourceName,
    rawFinalOrderedChainCount: rawFinalOrderedChain.length,
    runtimeRawCandidateCount: screenshotParseResult.debug?.legCandidates?.length ?? 0,
    runtimeBuilderInputCandidateCount: runtimeBuilderInputCandidates.length,
    runtimeBuilderInputCandidates: candidateCityPairs,
    selectedSeedFirstLegBeforeBuilder: rawFinalOrderedChain[0]
      ? `${rawFinalOrderedChain[0]?.departureAirport ?? "?"}-${rawFinalOrderedChain[0]?.arrivalAirport ?? "?"}`
      : "unknown",
    chainBeforePrefixRecoveryCount: chainBuildResult.chainBeforePrefixRecoveryCount,
    chainAfterPrefixRecoveryCount: chainBuildResult.chainAfterPrefixRecoveryCount,
    chainAnchorReason: chainBuildResult.chainAnchorReason,
    anchoredFirstLeg: chainBuildResult.anchoredFirstLeg,
    wasChainRotated: chainBuildResult.wasChainRotated,
    prefixRecoveryAttempted: chainBuildResult.prefixRecoveryAttempted,
    prefixRecoveredCount: chainBuildResult.prefixRecoveredCount,
    recoveredPrefixLegs: chainBuildResult.recoveredPrefixLegs.join(", ") || "none",
    sanitizedUserFacingLegsCount: userFacingLegs.length,
    userFacingLegsCount: userFacingLegs.length,
    operatingLegsCount: operatingLegs.length,
    dhLegsCount: deadheadLegs.length,
    firstUserFacingLeg: firstOrderedLeg ? `${firstOrderedLeg.departureAirport ?? "?"}-${firstOrderedLeg.arrivalAirport ?? "?"}` : "unknown",
    lastUserFacingLeg: lastOrderedLeg ? `${lastOrderedLeg.departureAirport ?? "?"}-${lastOrderedLeg.arrivalAirport ?? "?"}` : "unknown",
    terminalReturnLeg: chainBuildResult.terminalReturnLeg,
    terminalCutIndex: chainBuildResult.terminalCutIndex,
    discardedAfterTerminal: chainBuildResult.discardedAfterTerminal,
    partialBannerVisible,
    partialSourceUsed,
    partialVisibleLegsCount: userFacingLegs.length,
    canonicalChainSource: chainBuildResult.canonicalCandidateSource,
    builderOutputFirstLeg: firstOrderedLeg ? `${firstOrderedLeg.departureAirport ?? "?"}-${firstOrderedLeg.arrivalAirport ?? "?"}` : "unknown",
    builderOutputLegCount: userFacingLegs.length,
    scheduledBlock: snapshotComputation.scheduledBlockMinutes,
    scheduledBlockSource: snapshotComputation.scheduledBlockSource,
    headerScheduledBlock: snapshotComputation.headerScheduledBlock ?? "none",
    computedUserFacingScheduledBlock: snapshotComputation.computedUserFacingScheduledBlock,
    finalArrival: snapshotComputation.finalArrival,
    nextFlightCityPair: snapshotComputation.nextFlightCityPair,
    logbookLegCount: userFacingLegs.length,
    lastLogbookLeg: lastOrderedLeg ? `${lastOrderedLeg.departureAirport ?? "?"}-${lastOrderedLeg.arrivalAirport ?? "?"}` : "unknown",
  };
  if (__DEV__) {
    console.log("LIVE_CHAIN_BUILDER_PARITY_DEBUG", {
      usedExportedBuilder: true,
      canonicalCandidateSource: chainBuildResult.canonicalCandidateSource,
      runtimeBuilderInputSource: liveChainInputSources.selectedSourceName,
      runtimeRawCandidateCount: visibleRotationSourceDebug.runtimeRawCandidateCount,
      runtimeBuilderInputCandidateCount: runtimeBuilderInputCandidates.length,
      runtimeBuilderInputCandidates: candidateCityPairs,
      selectedSeedFirstLegBeforeBuilder: visibleRotationSourceDebug.selectedSeedFirstLegBeforeBuilder,
      runtimeBuilderUserFacingCount: userFacingLegs.length,
      runtimeUserFacingLegs: userFacingLegs.map(
        (leg) => `${leg.departureAirport ?? "?"}-${leg.arrivalAirport ?? "?"}`,
      ),
      runtimeOperatingLegCount: operatingLegs.length,
      runtimeDeadheadLegCount: deadheadLegs.length,
      runtimeLogbookExportLegCount: operatingLegs.length,
      builderOutputFirstLeg: visibleRotationSourceDebug.builderOutputFirstLeg,
      builderOutputLegCount: visibleRotationSourceDebug.builderOutputLegCount,
      runtimeFirstLeg: visibleRotationSourceDebug.firstUserFacingLeg,
      runtimeLastLeg: visibleRotationSourceDebug.lastUserFacingLeg,
      runtimeFinalArrival: snapshotComputation.finalArrival,
      runtimeScheduledBlock: snapshotComputation.scheduledBlockMinutes,
      runtimeScheduledBlockSource: snapshotComputation.scheduledBlockSource,
      runtimeNextFlight: snapshotComputation.nextFlightCityPair,
      runtimeLogbookLegCount: userFacingLegs.length,
      partialBannerVisible,
      partialSourceUsed,
    });
  }

  return {
    ...dashboard,
    snapshot: {
      ...dashboard.snapshot,
      tripDates:
        header?.startDate && header?.endDate
          ? `${header.startDate} - ${header.endDate}`
          : dashboard.snapshot.tripDates,
      rotationNumber: header?.rotationNumber ?? dashboard.snapshot.rotationNumber,
      totalCreditMinutes: parseClockishMinutes(header?.totalCredit) ?? dashboard.snapshot.totalCreditMinutes,
      scheduledBlockMinutes: snapshotComputation.scheduledBlockMinutes,
      legCount: mappedUserFacingLegs.length,
      layoverCities: (header?.layoverCities?.length ?? 0) > 0 ? header.layoverCities : dashboard.snapshot.layoverCities,
      finalArrival: snapshotComputation.finalArrival,
    },
    legs: mappedUserFacingLegs,
    nextLeg,
    whatMatters: [
      ...deadheadWhatMattersCards,
      ...(partialWhatMattersCard ? [partialWhatMattersCard] : []),
      ...(deadheadWhatMattersCards.length === 0 && !partialWhatMattersCard
        ? dashboard.whatMatters.filter((card) => card.label !== "FAR 117 watch")
        : []),
    ],
    dutyDays: screenshotDutyPeriods.map((period) => ({
      label: `Day ${period.dayNumber}`,
      scheduledBlockMinutes: period.scheduledBlock,
      scheduledFdpMinutes: 0,
      fdpLimitMinutes: 0,
      marginMinutes: 0,
      status: "Good" as const,
    })),
    note: dashboard.note,
    parsedRotation: {
      ...dashboard.parsedRotation,
      totalCredit: parseClockishMinutes(header?.totalCredit) ?? dashboard.parsedRotation.totalCredit,
      totalScheduledBlock: snapshotComputation.scheduledBlockMinutes,
      deadheadBlock: deadheadBlockMinutes,
      excludedDeadheadLegs: deadheadLegs.length,
      finalArrivalAfterDh: lastOrderedLeg?.arrivalAirport ?? snapshotComputation.finalArrival,
      chainAnchorReason: chainBuildResult.chainAnchorReason,
      anchoredFirstLeg: chainBuildResult.anchoredFirstLeg,
      wasChainRotated: chainBuildResult.wasChainRotated,
      layoverCities: (header?.layoverCities?.length ?? 0) > 0 ? header.layoverCities : dashboard.parsedRotation.layoverCities,
      dutyPeriods: screenshotDutyPeriods,
      legs: mappedUserFacingLegs.map((leg, index) => ({
        ...dashboard.parsedRotation.legs[index],
        id: leg.id,
        legNumber: index + 1,
        dayNumber: index + 1,
        departureAirport: leg.origin,
        arrivalAirport: leg.destination,
        flightNumber: leg.flightNumber,
        scheduledOut: extractCompactClockDigits(leg.departureTime),
        scheduledIn: extractCompactClockDigits(leg.arrivalTime),
        scheduledBlock: leg.scheduledBlockMinutes,
        turnAfterPreviousLeg: leg.turnMinutes,
        status: "placeholder" as const,
        isDeadhead: leg.isDeadhead,
        legKind: leg.legKind,
        confirmationNumber: leg.confirmationNumber,
        carrier: leg.carrier,
        sourceText: leg.sourceText,
        deadheadSource: leg.deadheadSource,
      })),
      visibleLegCount: mappedUserFacingLegs.length,
      isPartial: partialBannerVisible,
      partialReason: partialBannerVisible
        ? partialDiagnosis.partialReason ?? dashboard.parsedRotation.partialReason
        : null,
      parserWarnings: Array.from(new Set(parserWarnings)),
      deadheadAnnotations,
    },
    note:
      shouldDowngradePartialToDeadheadReturn && deadheadReturnHome
      ? `${dashboard.note ?? ""}${dashboard.note ? " " : ""}Deadhead segment detected: ${deadheadReturnHome.cityPair}.`
      : dashboard.note,
  };
}

const embeddedChartData = embeddedDeltaCharts as unknown as DeltaChartsData;
const appStylePalette = getFliegerPalette();
const appStyleIsDark = appStylePalette.textPrimary === "#F2E9DC";
const appDecisionRowSurface = appStyleIsDark ? "#303840" : "#D2D8DE";
const appDecisionRowHighlight = appStyleIsDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)";
const appDecisionRowShadowEdge = appStyleIsDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.08)";
const reroutePilotStatusOptions: Array<{ key: Exclude<ReroutePilotStatus, "unknown">; label: string }> = [
  { key: "lineholder", label: "Lineholder" },
  { key: "reserve", label: "Reserve" },
];

const premiumTypeOptions = [
  { key: "none", label: "None" },
  { key: "green-slip", label: "Green Slip" },
  { key: "silver-slip", label: "Silver Slip" },
  { key: "quick-slip", label: "Quick Slip" },
  { key: "inverse-assignment", label: "Inverse Assignment" },
] as const;

const payToolCards = [
  {
    key: "timecard-auditor",
    title: "Time Card Auditor",
    subtitle: "Paste a Delta monthly timecard and scan premiums, sick interactions, and payback clues.",
    cta: "Open Auditor",
    badge: "Live",
    glyph: "TC",
  },
  {
    key: "rotation-importer",
    title: "Rotation Importer",
    subtitle: "Connect the timecard back to the trip so we can audit what really happened operationally.",
    cta: "Coming Next",
    badge: "Roadmap",
    glyph: "RI",
  },
  {
    key: "statement-translator",
    title: "Statement Translator",
    subtitle: "Turn posted pay codes into plain English with Delta contract breadcrumbs.",
    cta: "Coming Next",
    badge: "Roadmap",
    glyph: "ST",
  },
  {
    key: "reroute-calculator",
    title: "Reroute Calculator",
    subtitle: "Check reroute and reassignment outcomes against the PWA instead of trusting payroll math.",
    cta: "Open Calculator",
    badge: "Live",
    glyph: "RR",
  },
  {
    key: "flight-pay",
    title: "Flight Pay Calculator",
    subtitle: "Roll the whole month together once schedules, leaves, premiums, and statements are all parsed.",
    cta: "Coming Next",
    badge: "Roadmap",
    glyph: "FP",
  },
] as const;

type TabKey = "today" | "far117" | "logbook" | "tools" | "home" | "schedule" | "pay" | "seniority" | "ae";
type SeatFilter = "All" | "Captain" | "First Officer";
type ChartStartMode = "hire" | "today";
type PayToolKey = (typeof payToolCards)[number]["key"];
type ToolDestinationKey = "home" | "seniority" | "ae" | "schedule" | "pay";
type RotationToolBanner = {
  title: string;
  detail: string;
};
type QuickContactKey = "crewScheduling" | "dispatch" | "van" | "hotel";
type QuickContacts = Record<QuickContactKey, string>;
type HoldLabel = "Current category" | "Can Hold" | "Close" | "Senior to You" | "No pilot";
type AeReachLabel =
  | "Junior to You"
  | "Close"
  | "Senior to You"
  | "No line yet"
  | "No pilot";
type PilotPriorityKey =
  | "upgrade-in-base"
  | "widebody-fo"
  | "better-captain-seat"
  | "commute-quality"
  | "systemwide-opportunities";
type MobileCategoryFilterKey =
  | "all"
  | "can-hold"
  | "close"
  | "senior-to-you"
  | "captain"
  | "fo"
  | "my-bases"
  | "goals";
type HoldPlannerView = "ae" | "forecast";
type PilotPreferences = {
  currentCategory: string;
  homeBase: string;
  commute: boolean;
  commuteOrigin: string;
  commuterBases: string[];
  priority: PilotPriorityKey;
  goalCategories: string[];
};

type CategoryEntry = {
  key: string;
  base: string;
  fleet: string;
  seat: string;
  pilotCount: number;
  mostSeniorNumber: number;
  middleSeniorityNumber: number | null;
  mostJuniorNumber: number;
};

type AeEntry = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  awards: number;
  bypassAwards: number;
  mostSeniorAwardNumber: number | null;
  middleAwardNumber: number | null;
  mostJuniorAwardNumber: number | null;
};
type AeHistoryPoint = {
  sourceFile: string;
  monthKey: string;
  awards: number;
  highestSeniorityNumber: number | null;
};
type AeHistoryRecord = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  points: AeHistoryPoint[];
};
type AeTrendEntry = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  latestAwards: number;
  previousAwards: number | null;
  awardsDelta: number | null;
  latestJuniorNumber: number | null;
  previousJuniorNumber: number | null;
  lineMovement: number | null;
};
type LatestAeAwardRow = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  employeeNumber: string;
  name: string;
  seniorityNumber: number;
  previousCategory: string;
  bypassAward: boolean;
  outOfSequence: boolean;
  projectedTrainingMonth: string | null;
  payProtectionDate: string | null;
  scheduledRetireDate: string | null;
  sourceFile: string;
};
type LatestCategoryAssignment = {
  employeeNumber: string;
  name: string;
  seniorityNumber: number;
  base: string;
  fleet: string;
  seat: string;
  categoryKey: string;
  awardCategory: string;
  scheduledRetireDate: string | null;
};
type AeDetailSelection = {
  awardCategory: string;
  seat: string;
};
type CategoryDetailSelection = {
  categoryKey: string;
  label: string;
};
type AeMovementSummary = {
  aeIn: number;
  aeOut: number;
  net: number;
};
type AeResidualSummary = {
  categoryDelta: number | null;
  aeNet: number;
  residual: number | null;
};
type PilotRecord = {
  employeeNumber: string;
  name: string;
  seniorityNumber: number;
  currentCategoryCode: string;
  currentCategoryKey: string;
  pilotHireDate: string;
  scheduledRetireDate: string;
  currentCategoryRank?: number | null;
  currentCategoryTotal?: number | null;
};
type BaseEntry = {
  base: string;
  isCarveout?: boolean;
  categories: number;
  pilots: number;
  instructors: number;
};
type PilotHistoryPoint = {
  sourceFile: string;
  monthKey: string;
  seniorityNumber: number;
  totalPilots: number;
  systemPercent: number | null;
  categoryCode: string;
};
type PilotHistoryRecord = {
  employeeNumber: string;
  name: string;
  points: PilotHistoryPoint[];
};
type MonthlyPilotCount = {
  sourceFile?: string;
  monthKey: string;
  pilotCount: number;
};
type DeltaChartsData = {
  generatedAt: string;
  monthlyPilotCounts: readonly MonthlyPilotCount[];
  pilotHistoryByEmployee: readonly PilotHistoryRecord[];
  pilotHistoryShardBaseUrl?: string;
};
type ChartPoint = {
  label: string;
  value: number;
  valueLabel: string;
  tone: "past" | "future";
  timeMs?: number;
  referenceOnePercent?: number | null;
  referenceTwoPercent?: number | null;
};

const tabs: { key: Extract<TabKey, "today" | "far117" | "logbook" | "tools">; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "◷" },
  { key: "far117", label: "FAR 117", icon: "Δ" },
  { key: "logbook", label: "Logbook", icon: "☰" },
  { key: "tools", label: "Tools", icon: "⌘" },
];

const toolDestinationCards: Array<{
  key: ToolDestinationKey;
  title: string;
  subtitle: string;
  badge: string;
}> = [
  {
    key: "home",
    title: "Seniority Dashboard",
    subtitle: "Keep the original progression dashboard and personalized list read close by.",
    badge: "Free Hook",
  },
  {
    key: "seniority",
    title: "Seniority Explorer",
    subtitle: "Browse current category holdability and monthly award ranges.",
    badge: "Core Tool",
  },
  {
    key: "ae",
    title: "AE Tracker",
    subtitle: "See latest AE movement, junior award lines, and the forecast panels.",
    badge: "Core Tool",
  },
  {
    key: "schedule",
    title: "Contract / Schedule Lab",
    subtitle: "Trip quality, fatigue context, and Contract Copilot remain available here.",
    badge: "Lab",
  },
  {
    key: "pay",
    title: "Pay Tools",
    subtitle: "Timecard Auditor and Reroute Pay Calculator stay intact inside Tools.",
    badge: "Live",
  },
];

const preferenceStorageKey = "crewtools.mobilePreferences";
const pilotPriorities: { key: PilotPriorityKey; label: string; shortLabel: string }[] = [
  { key: "upgrade-in-base", label: "Upgrade in base", shortLabel: "Upgrade" },
  { key: "widebody-fo", label: "Widebody FO", shortLabel: "Widebody FO" },
  { key: "better-captain-seat", label: "Better captain seat", shortLabel: "Better CA" },
  { key: "commute-quality", label: "Commute quality", shortLabel: "Commute" },
  { key: "systemwide-opportunities", label: "Systemwide opportunities", shortLabel: "Systemwide" },
];
const mobileCategoryFilters: { key: MobileCategoryFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "can-hold", label: "Can Hold" },
  { key: "close", label: "Close" },
  { key: "senior-to-you", label: "Senior to You" },
  { key: "captain", label: "Captain" },
  { key: "fo", label: "FO" },
  { key: "my-bases", label: "My Bases" },
  { key: "goals", label: "Goals" },
];
const quickContactStorageKey = "crewtools.rotationQuickContacts";

const seatFilters: SeatFilter[] = ["All", "Captain", "First Officer"];
const growthRates = Array.from({ length: 6 }, (_, index) => ({
  label: `${index}%`,
  value: index / 100,
}));
const forecastGrowthRates = Array.from({ length: 5 }, (_, index) => ({
  label: `${index + 1}%`,
  value: (index + 1) / 100,
}));
const chartStartModes: { label: string; value: ChartStartMode }[] = [
  { label: "Since Hire Date", value: "hire" },
  { label: "From Today", value: "today" },
];
const bases = deltaSnapshot.operationalBases.map((entry) => entry.base);
const aeBaseFilters = ["All", ...bases];

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (Platform.OS === "web") {
      console.error("CrewTools runtime error", error);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.container, { justifyContent: "center", flexGrow: 1 }]}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>CrewTools hit a runtime error</Text>
              <Text style={styles.sectionDescription}>
                The page loaded, but one screen crashed during render.
              </Text>
              <View style={styles.identityCard}>
                <Text style={styles.identityName}>Error details</Text>
                <Text style={styles.identityMeta}>
                  {this.state.error.message || "Unknown runtime error"}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const flieger = getFliegerPalette(colorScheme);
  const isCompactMobile = width < 520;
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [rotationPasteInput, setRotationPasteInput] = useState("");
  const [rotationScreenshots, setRotationScreenshots] = useState<RotationScreenshotAttachment[]>([]);
  const [rotationAnalyzeBusy, setRotationAnalyzeBusy] = useState(false);
  const [rotationAnalyzeError, setRotationAnalyzeError] = useState("");
  const [rotationDashboard, setRotationDashboard] = useState<RotationDashboardData | null>(null);
  const [rotationScreenshotParseResult, setRotationScreenshotParseResult] =
    useState<RotationScreenshotParseResponse | null>(null);
  const [rotationParseTraceOpen, setRotationParseTraceOpen] = useState<Record<string, boolean>>({});
  const [rotationCopiedConfirmation, setRotationCopiedConfirmation] = useState<string | null>(null);
  const [rotationCopiedDebugJson, setRotationCopiedDebugJson] = useState(false);
  const [rotationICrewDebugResult, setRotationICrewDebugResult] =
    useState<ReturnType<typeof parseICrewTextWithDiagnostics>["parsed"]>(null);
  const [rotationICrewDebugDiagnostics, setRotationICrewDebugDiagnostics] =
    useState<ICrewParserDiagnostics | null>(null);
  const [rotationICrewDebugError, setRotationICrewDebugError] = useState("");
  const [rotationCopiedICrewDebugJson, setRotationCopiedICrewDebugJson] = useState(false);
  const [rotationToolBanner, setRotationToolBanner] = useState<RotationToolBanner | null>(null);
  const [contractCopilotStarterQuestion, setContractCopilotStarterQuestion] = useState("");
  const [quickContacts, setQuickContacts] = useState<QuickContacts>({
    crewScheduling: "",
    dispatch: "",
    van: "",
    hotel: "",
  });
  const [employeeNumberInput, setEmployeeNumberInput] = useState("");
  const [growthRate, setGrowthRate] = useState(0.01);
  const [growthMenuOpen, setGrowthMenuOpen] = useState(false);
  const [forecastGrowthRate, setForecastGrowthRate] = useState(0.01);
  const [forecastGrowthMenuOpen, setForecastGrowthMenuOpen] = useState(false);
  const [payScenarioMenuOpen, setPayScenarioMenuOpen] = useState(false);
  const [selectedAeBaseFilter, setSelectedAeBaseFilter] = useState("All");
  const [selectedAeFleetFilter, setSelectedAeFleetFilter] = useState("All");
  const [selectedCategoryBaseFilter, setSelectedCategoryBaseFilter] = useState("All");
  const [chartStartMode, setChartStartMode] = useState<ChartStartMode>("hire");
  const [selectedPayScenarioCode, setSelectedPayScenarioCode] = useState("");
  const [monthlyCreditHours, setMonthlyCreditHours] = useState(75);
  const [whatIfSeat, setWhatIfSeat] = useState<Exclude<SeatFilter, "All">>("Captain");
  const [selectedWhatIfFleet, setSelectedWhatIfFleet] = useState("");
  const [selectedWhatIfBase, setSelectedWhatIfBase] = useState("");
  const [selectedAeDetailCategory, setSelectedAeDetailCategory] = useState<AeDetailSelection | null>(null);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<CategoryDetailSelection | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [aeSearch, setAeSearch] = useState("");
  const [categorySeatFilter, setCategorySeatFilter] = useState<SeatFilter>("All");
  const [aeSeatFilter, setAeSeatFilter] = useState<SeatFilter>("All");
  const [mobilePreferences, setMobilePreferences] = useState<PilotPreferences>({
    currentCategory: "",
    homeBase: "",
    commute: false,
    commuteOrigin: "",
    commuterBases: [],
    priority: "upgrade-in-base",
    goalCategories: [],
  });
  const rotationDebugEnabled = useMemo(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return false;
    }
    return new URLSearchParams(window.location.search).get("rotationDebug") === "1";
  }, []);
  const rotationDebugPreviewDashboard = useMemo(
    () =>
      rotationDebugEnabled && rotationICrewDebugResult
        ? buildICrewParsedDashboard(rotationICrewDebugResult, {
            previewNote: "Previewing iCrew debug parse through the shared rotation display model.",
          })
        : null,
    [rotationDebugEnabled, rotationICrewDebugResult],
  );
  const displayedRotationDashboard = rotationDebugPreviewDashboard ?? rotationDashboard;
  const hasICrewDebugParseAttempt =
    rotationDebugEnabled &&
    Boolean(rotationICrewDebugResult || rotationICrewDebugDiagnostics || rotationICrewDebugError);
  const dashboardSourceNote = useMemo(() => {
    if (!displayedRotationDashboard) {
      return null;
    }
    if (rotationDebugPreviewDashboard) {
      return "Loaded from iCrew text";
    }
    if (rotationScreenshots.length > 0 || rotationScreenshotParseResult) {
      return "Loaded from screenshots";
    }
    if (displayedRotationDashboard.parsedRotation.sourceFormat === "icrew_printout") {
      return "Loaded from iCrew text";
    }
    return "Loaded from pasted rotation text";
  }, [
    displayedRotationDashboard,
    rotationDebugPreviewDashboard,
    rotationScreenshots.length,
    rotationScreenshotParseResult,
  ]);

  const formatLegFlightDisplay = (leg: RotationDashboardData["legs"][number]) => {
    const carrierPrefix =
      leg.flightNumber && leg.carrier && !leg.flightNumber.toUpperCase().startsWith(leg.carrier.toUpperCase())
        ? leg.carrier.toUpperCase()
        : "";
    const flightCode = `${carrierPrefix}${leg.flightNumber ?? "TBD"}`;
    return `Flight ${flightCode}`;
  };

  const formatLegEquipmentDisplay = (leg: RotationDashboardData["legs"][number]) => {
    return leg.aircraft ? String(leg.aircraft) : "TBD";
  };

  const formatLegGateDisplay = (leg: RotationDashboardData["legs"][number]) => {
    return leg.gate ?? "TBD";
  };

  const shouldShowLegStatus = (leg: RotationDashboardData["legs"][number]) =>
    !leg.isDeadhead && leg.status !== "placeholder";
  const [mobilePreferencesLoaded, setMobilePreferencesLoaded] = useState(false);
  const [mobilePreferencesEditing, setMobilePreferencesEditing] = useState(true);
  const [mobilePreferencesEditorInitialized, setMobilePreferencesEditorInitialized] = useState(false);
  const [mobileGoalInput, setMobileGoalInput] = useState("");
  const [mobileCategoryFilter, setMobileCategoryFilter] =
    useState<MobileCategoryFilterKey>("all");
  const [holdPlannerView, setHoldPlannerView] = useState<HoldPlannerView>("forecast");

  const [blockHours, setBlockHours] = useState("18");
  const [dutyHours, setDutyHours] = useState("31");
  const [layoverHours, setLayoverHours] = useState("11");
  const [legs, setLegs] = useState("5");

  const [hourlyRate, setHourlyRate] = useState("243");
  const [creditedHours, setCreditedHours] = useState("0");
  const [premiumHours, setPremiumHours] = useState("0");
  const [premiumType, setPremiumType] = useState<(typeof premiumTypeOptions)[number]["key"]>(
    "green-slip"
  );
  const [selectedPayTool, setSelectedPayTool] = useState<PayToolKey>("timecard-auditor");
  const [rerouteOriginalRotationText, setRerouteOriginalRotationText] = useState("");
  const [rerouteChangedRotationText, setRerouteChangedRotationText] = useState("");
  const [rerouteDescription, setRerouteDescription] = useState("");
  const [reroutePilotStatus, setReroutePilotStatus] = useState<Exclude<ReroutePilotStatus, "unknown"> | "">("");
  const [rerouteTiming, setRerouteTiming] = useState<RerouteTiming>("unknown");
  const [rerouteFinalCreditDecreased, setRerouteFinalCreditDecreased] =
    useState<RerouteAnalyzerChoice>("unknown");
  const [rerouteTouchedXDay, setRerouteTouchedXDay] = useState<RerouteAnalyzerChoice>("unknown");
  const [rerouteDeadheadInvolved, setRerouteDeadheadInvolved] =
    useState<RerouteAnalyzerChoice>("unknown");
  const [rerouteBidPeriodCrossover, setRerouteBidPeriodCrossover] =
    useState<RerouteAnalyzerChoice>("unknown");
  const [rerouteOriginalScreenshots, setRerouteOriginalScreenshots] = useState<RerouteScreenshotAttachment[]>([]);
  const [rerouteChangedScreenshots, setRerouteChangedScreenshots] = useState<RerouteScreenshotAttachment[]>([]);
  const [rerouteAnalyzeBusy, setRerouteAnalyzeBusy] = useState(false);
  const [rerouteAnalyzeError, setRerouteAnalyzeError] = useState("");
  const [rerouteLastRequestImageDiagnostics, setRerouteLastRequestImageDiagnostics] =
    useState<RerouteRequestImageDiagnostics | null>(null);
  const [rerouteAnalysisResult, setRerouteAnalysisResult] = useState<{
    analysisId: number;
    result: RerouteAnalysisOutput;
  } | null>(null);
  const [rerouteCurrentAnalysisId, setRerouteCurrentAnalysisId] = useState<number | null>(null);
  const [rerouteEvidenceOpen, setRerouteEvidenceOpen] = useState(false);
  const [rerouteSupportOpen, setRerouteSupportOpen] = useState(false);
  const [rerouteDetectedFactsOpen, setRerouteDetectedFactsOpen] = useState(false);
  const [perDiemHours, setPerDiemHours] = useState("0");
  const [missedBreakPay, setMissedBreakPay] = useState("0");
  const [timecardRawInput, setTimecardRawInput] = useState("");
  const [timecardAuditRequested, setTimecardAuditRequested] = useState(false);
  const [actualBasePay, setActualBasePay] = useState("0");
  const [actualPremiumPay, setActualPremiumPay] = useState("0");
  const [actualPerDiem, setActualPerDiem] = useState("0");
  const [actualAdjustments, setActualAdjustments] = useState("0");
  const [actualPostedTotal, setActualPostedTotal] = useState("0");
  const [reserveStatus, setReserveStatus] = useState(false);
  const [pilotHistoryCache, setPilotHistoryCache] = useState<Record<string, PilotHistoryRecord>>({});
  const [loadedPilotHistoryShards, setLoadedPilotHistoryShards] = useState<Record<string, true>>(
    {}
  );
  const scrollRef = useRef<ScrollView | null>(null);
  const [whatIfSectionY, setWhatIfSectionY] = useState(0);
  const rerouteAnalysisCounterRef = useRef(0);
  const rerouteActiveRequestIdRef = useRef<number | null>(null);
  const rotationAnalysisCounterRef = useRef(0);
  const rotationActiveRunIdRef = useRef<number | null>(null);

  const clearRotationCompanion = () => {
    setRotationPasteInput("");
    setRotationScreenshots([]);
    setRotationAnalyzeBusy(false);
    setRotationAnalyzeError("");
    setRotationDashboard(null);
    setRotationScreenshotParseResult(null);
    setRotationCopiedDebugJson(false);
    setRotationParseTraceOpen({});
    setRotationToolBanner(null);
    setContractCopilotStarterQuestion("");
    setActiveTab("today");
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(quickContactStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<QuickContacts>;
      setQuickContacts((current) => ({
        ...current,
        crewScheduling: typeof parsed.crewScheduling === "string" ? parsed.crewScheduling : current.crewScheduling,
        dispatch: typeof parsed.dispatch === "string" ? parsed.dispatch : current.dispatch,
        van: typeof parsed.van === "string" ? parsed.van : current.van,
        hotel: typeof parsed.hotel === "string" ? parsed.hotel : current.hotel,
      }));
    } catch {
      // Keep defaults if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    window.localStorage.setItem(quickContactStorageKey, JSON.stringify(quickContacts));
  }, [quickContacts]);

  const clearRerouteAnalyzer = () => {
    setRerouteOriginalRotationText("");
    setRerouteChangedRotationText("");
    setRerouteDescription("");
    setReroutePilotStatus("");
    setRerouteTiming("unknown");
    setRerouteFinalCreditDecreased("unknown");
    setRerouteTouchedXDay("unknown");
    setRerouteDeadheadInvolved("unknown");
    setRerouteBidPeriodCrossover("unknown");
    setRerouteOriginalScreenshots([]);
    setRerouteChangedScreenshots([]);
    setRerouteAnalyzeError("");
    setRerouteAnalysisResult(null);
    setRerouteLastRequestImageDiagnostics(null);
    setRerouteCurrentAnalysisId(null);
    rerouteActiveRequestIdRef.current = null;
    setRerouteEvidenceOpen(false);
    setRerouteDetectedFactsOpen(false);
    setRerouteSupportOpen(false);
  };

  const pickRotationEvidence = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setRotationAnalyzeError("Screenshot upload is currently available on web only in this pass.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
    input.multiple = true;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      document.body.removeChild(input);
      if (files.length === 0) {
        return;
      }
      const readers = files.map(
        (file) =>
          new Promise<RotationScreenshotAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") {
                reject(new Error(`Unable to read ${file.name}`));
                return;
              }
              resolve({
                name: file.name,
                dataUrl: reader.result,
                previewUri: reader.result,
                mimeType: file.type,
              });
            };
            reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${file.name}`));
            reader.readAsDataURL(file);
          }),
      );
      Promise.all(readers)
        .then((attachments) => {
          rotationActiveRunIdRef.current = null;
          setRotationScreenshotParseResult(null);
          setRotationCopiedDebugJson(false);
          setRotationScreenshots((current) => [...current, ...attachments]);
          setRotationAnalyzeError("");
        })
        .catch((error) => {
          setRotationAnalyzeError(error instanceof Error ? error.message : "Unable to attach screenshots.");
        });
    };
    input.click();
  };

  const removeRotationScreenshot = (index: number) => {
    rotationActiveRunIdRef.current = null;
    setRotationScreenshotParseResult(null);
    setRotationCopiedDebugJson(false);
    setRotationScreenshots((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const clearRotationScreenshots = () => {
    rotationActiveRunIdRef.current = null;
    setRotationScreenshotParseResult(null);
    setRotationCopiedDebugJson(false);
    setRotationScreenshots([]);
  };

  const toggleRotationParseTrace = (key: string) => {
    setRotationParseTraceOpen((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const copyRotationNormalizedText = async (value: string) => {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setRotationAnalyzeError("Copy is currently available in the web build only.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setRotationAnalyzeError("");
    } catch (error) {
      setRotationAnalyzeError(error instanceof Error ? error.message : "Unable to copy normalized text.");
    }
  };

  const copyTextToClipboard = async (value: string) => {
    if (Platform.OS !== "web") {
      return false;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    if (typeof document !== "undefined") {
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.setAttribute("readonly", "true");
      textArea.style.position = "absolute";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textArea);
      return copied;
    }
    return false;
  };

  const copyRotationConfirmationCode = async (value?: string | null) => {
    if (!value) {
      setRotationAnalyzeError("No confirmation code was available to copy.");
      return;
    }
    try {
      const copied = await copyTextToClipboard(value);
      if (!copied) {
        setRotationAnalyzeError("Copy confirmation is currently available in the web build only.");
        return;
      }
      setRotationCopiedConfirmation(value);
      setRotationAnalyzeError("");
      setTimeout(() => {
        setRotationCopiedConfirmation((current) => (current === value ? null : current));
      }, 1600);
    } catch (error) {
      setRotationAnalyzeError(error instanceof Error ? error.message : "Unable to copy confirmation code.");
    }
  };

  const openRotationExternalUrl = (value?: string | null) => {
    if (!value) {
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(value, "_blank", "noopener,noreferrer");
      return;
    }
    setRotationAnalyzeError("Open link is currently available in the web build only.");
  };

  const copyLiveChainDebugJson = async () => {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setRotationAnalyzeError("Copy live chain debug JSON is currently available in the web build only.");
      return;
    }
    try {
      const payload =
        rotationDashboard && rotationScreenshotParseResult?.debug
          ? buildLiveChainDebugExport({
              rotationDashboard,
              screenshotParseResult: rotationScreenshotParseResult as RotationScreenshotParseResponse & {
                debug: NonNullable<RotationScreenshotParseResponse["debug"]>;
              },
              rotationScreenshots,
            })
          : {
              error: "payload missing",
              visibleSnapshotPathConfirmed: true,
              availableTopLevelKeys: {
                hasRotationDashboard: Boolean(rotationDashboard),
                hasRotationScreenshotParseResult: Boolean(rotationScreenshotParseResult),
                rotationScreenshotParseResultKeys:
                  rotationScreenshotParseResult && typeof rotationScreenshotParseResult === "object"
                    ? Object.keys(rotationScreenshotParseResult)
                    : [],
              },
            };
      console.log("LIVE_CHAIN_DEBUG_JSON_COPIED", payload);
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setRotationCopiedDebugJson(true);
      setRotationAnalyzeError("");
      setTimeout(() => setRotationCopiedDebugJson(false), 2000);
    } catch (error) {
      setRotationAnalyzeError(error instanceof Error ? error.message : "Unable to copy live chain debug JSON.");
    }
  };

  const parseRotationICrewDebugText = () => {
    try {
      const trimmed = rotationPasteInput.trim();
      if (!trimmed) {
        setRotationICrewDebugError("Paste iCrew raw text first.");
        setRotationICrewDebugResult(null);
        setRotationICrewDebugDiagnostics(null);
        return;
      }
      const debugResult = parseICrewTextWithDiagnostics(trimmed);
      setRotationICrewDebugResult(debugResult.parsed);
      setRotationICrewDebugDiagnostics(debugResult.diagnostics);
      setRotationICrewDebugError(debugResult.parserSucceeded ? "" : debugResult.diagnostics.parserError ?? "Unable to parse iCrew raw text.");
      setRotationCopiedICrewDebugJson(false);
    } catch (error) {
      setRotationICrewDebugResult(null);
      setRotationICrewDebugDiagnostics(null);
      setRotationICrewDebugError(error instanceof Error ? error.message : "Unable to parse iCrew raw text.");
      setRotationCopiedICrewDebugJson(false);
    }
  };

  const copyICrewDebugJson = async () => {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setRotationAnalyzeError("Copy iCrew debug JSON is currently available in the web build only.");
      return;
    }
    try {
      const payload = buildICrewDebugExport({
        rawText: rotationPasteInput.trim(),
        parsed: rotationICrewDebugResult,
        diagnostics: rotationICrewDebugDiagnostics,
        parserError: rotationICrewDebugError || null,
      });
      console.log("ICREW_DEBUG_JSON_COPIED", payload);
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setRotationCopiedICrewDebugJson(true);
      setRotationICrewDebugError("");
      setTimeout(() => setRotationCopiedICrewDebugJson(false), 2000);
    } catch (error) {
      setRotationICrewDebugError(error instanceof Error ? error.message : "Unable to copy iCrew debug JSON.");
    }
  };

  const parseRotationScreenshots = async (analysisRunId: number): Promise<RotationScreenshotParseResponse> => {
    const response = await fetch("/api/ai/rotation-companion/parse-screenshots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          screenshots: rotationScreenshots.map((item) => ({
            name: item.name,
            dataUrl: item.dataUrl,
          })),
        },
      }),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const rawText = await response.text();
    try {
      const parsed = JSON.parse(rawText) as RotationScreenshotParseResponse;
      return {
        ...parsed,
        analysisRunId,
        analysisTimestamp: new Date().toISOString(),
      };
    } catch {
      return {
        ...buildUnreadableScreenshotParserResponse(response.status, contentType, rawText),
        analysisRunId,
        analysisTimestamp: new Date().toISOString(),
      };
    }
  };

  const analyzeRotationCompanion = async () => {
    const analysisRunId = Date.now() + (rotationAnalysisCounterRef.current += 1);
    rotationActiveRunIdRef.current = analysisRunId;
    setRotationAnalyzeBusy(true);
    setRotationAnalyzeError("");
    setRotationScreenshotParseResult(null);
    setRotationCopiedDebugJson(false);
    setRotationDashboard(null);
    setRotationICrewDebugResult(null);
    setRotationICrewDebugDiagnostics(null);
    setRotationICrewDebugError("");
    setRotationCopiedICrewDebugJson(false);
    try {
      const trimmedText = rotationPasteInput.trim();
      const hasText = trimmedText.length > 0;
      const hasScreenshots = rotationScreenshots.length > 0;
      if (!hasText && !hasScreenshots) {
        setRotationAnalyzeError("Paste trip text, upload screenshots, or use the sample rotation.");
        setRotationDashboard(null);
        return;
      }

      let screenshotParse: RotationScreenshotParseResponse | null = null;
      if (hasScreenshots) {
        screenshotParse = await parseRotationScreenshots(analysisRunId);
        if (rotationActiveRunIdRef.current !== analysisRunId) {
          console.warn("STALE_SCREENSHOT_PARSE_RESULT_IGNORED", {
            attemptedRunId: analysisRunId,
            activeRunId: rotationActiveRunIdRef.current,
            screenshots: rotationScreenshots.map((item) => item.name),
          });
          return;
        }
        setRotationScreenshotParseResult(screenshotParse);
      }

      if (hasText && !hasScreenshots && looksLikeICrewRotationText(trimmedText)) {
        const debugResult = parseICrewTextWithDiagnostics(trimmedText);
        setRotationICrewDebugResult(debugResult.parsed);
        setRotationICrewDebugDiagnostics(debugResult.diagnostics);
        setRotationICrewDebugError(
          debugResult.parserSucceeded
            ? ""
            : debugResult.diagnostics.parserError ?? "Unable to parse iCrew raw text.",
        );
        setRotationCopiedICrewDebugJson(false);
        if (!debugResult.parserSucceeded || !debugResult.parsed) {
          setRotationAnalyzeError(
            "iCrew rotation detected, but we could not parse the full rotation. Paste the full printout or try again.",
          );
          setRotationDashboard(null);
          return;
        }
        if (rotationActiveRunIdRef.current !== analysisRunId) {
          console.warn("STALE_SCREENSHOT_PARSE_RESULT_IGNORED", {
            attemptedRunId: analysisRunId,
            activeRunId: rotationActiveRunIdRef.current,
            phase: "before_icrew_dashboard_apply",
          });
          return;
        }
        setRotationDashboard(buildICrewParsedDashboard(debugResult.parsed));
        setActiveTab("today");
        return;
      }

      const normalizedScreenshotText = screenshotParse?.ok ? screenshotParse.normalizedText.trim() : "";
      const combinedInput = [trimmedText, normalizedScreenshotText].filter(Boolean).join("\n\n");
      const parsed = parseRotationIntoDashboard(combinedInput);
      if (!parsed.ok) {
        if (!hasText && screenshotParse && !screenshotParse.ok) {
          setRotationAnalyzeError(screenshotParse.error);
        } else if (rotationScreenshots.length > 0 && !combinedInput.trim()) {
          setRotationAnalyzeError(
            "Screenshots were attached, but I could not turn them into readable rotation text yet. Try clearer screenshots or paste visible rows.",
          );
        } else {
          setRotationAnalyzeError(parsed.error);
        }
        setRotationDashboard(null);
        return;
      }

      const screenshotWarnings = screenshotParse?.warnings ?? [];
      const screenshotMissingSections = screenshotParse?.missingSections ?? [];
      const mergedMissingSections = Array.from(
        new Set([...parsed.dashboard.parsedRotation.missingSections, ...screenshotMissingSections]),
      );
      const derivedSourceType =
        hasScreenshots && hasText ? "mixed" : hasScreenshots ? "screenshots" : "text";
      const screenshotPartialReason =
        screenshotParse?.ok && screenshotMissingSections.length > 0
          ? "Partial rotation detected. We found visible legs from your screenshot, but may be missing earlier or later parts of the trip."
          : screenshotParse?.ok === false && hasScreenshots
            ? "Partial rotation detected. Screenshot extraction was incomplete, so some trip sections still need full text or more screenshots."
            : parsed.dashboard.parsedRotation.partialReason;

      const baseDashboard = {
        ...parsed.dashboard,
        parsedRotation: {
          ...parsed.dashboard.parsedRotation,
          sourceTypes: derivedSourceType,
          isPartial:
            parsed.dashboard.parsedRotation.isPartial ||
            screenshotMissingSections.length > 0 ||
            screenshotParse?.ok === false,
          partialReason: screenshotPartialReason,
          missingSections: mergedMissingSections,
        },
        note: hasScreenshots
          ? `Loaded from ${rotationScreenshots.length} screenshot${rotationScreenshots.length === 1 ? "" : "s"}.`
          : parsed.dashboard.note,
      };
      const hasRuntimeBuilderInput =
        Boolean(screenshotParse?.debug) &&
        getLiveChainInputSources(
          screenshotParse as RotationScreenshotParseResponse & {
            debug: NonNullable<RotationScreenshotParseResponse["debug"]>;
          },
        ).selectedCandidates.length > 0;
      if (rotationActiveRunIdRef.current !== analysisRunId) {
        console.warn("STALE_SCREENSHOT_PARSE_RESULT_IGNORED", {
          attemptedRunId: analysisRunId,
          activeRunId: rotationActiveRunIdRef.current,
          phase: "before_dashboard_apply",
          screenshots: rotationScreenshots.map((item) => item.name),
        });
        return;
      }
      setRotationDashboard(
        hasRuntimeBuilderInput && screenshotParse?.debug
          ? buildScreenshotBackedDashboardModel(
              baseDashboard,
              screenshotParse as RotationScreenshotParseResponse & {
                debug: NonNullable<RotationScreenshotParseResponse["debug"]>;
              },
            )
          : baseDashboard,
      );
      setActiveTab("today");
    } catch (error) {
      if (rotationActiveRunIdRef.current === analysisRunId) {
        setRotationAnalyzeError(error instanceof Error ? error.message : "Unable to load the rotation.");
      }
    } finally {
      if (rotationActiveRunIdRef.current === analysisRunId) {
        setRotationAnalyzeBusy(false);
      }
    }
  };

  const useSampleRotation = () => {
    setRotationPasteInput(SAMPLE_ROTATION_TEXT);
    setRotationAnalyzeError("");
    setRotationScreenshotParseResult(null);
    setRotationCopiedDebugJson(false);
    const sampleDashboard = buildRotationDashboardData(SAMPLE_ROTATION_TEXT);
    setRotationDashboard(sampleDashboard);
    setActiveTab("today");
  };

  const rotationParseTraceWarnings = useMemo(
    () =>
      buildRotationParseTraceWarnings({
        screenshotParseResult: rotationScreenshotParseResult,
        dashboard: rotationDashboard,
      }),
    [rotationScreenshotParseResult, rotationDashboard],
  );

  const compressRerouteImageFile = (file: File) =>
    new Promise<RerouteScreenshotAttachment>((resolve, reject) => {
      if (typeof document === "undefined") {
        reject(new Error("Image compression is only available on web."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          reject(new Error(`Unable to read ${file.name}`));
          return;
        }
        const image = new window.Image();
        image.onload = () => {
          const maxWidth = 2200;
          const scale = image.width > maxWidth ? maxWidth / image.width : 1;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          if (!context) {
            resolve({ name: file.name, dataUrl, previewUri: dataUrl });
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const shouldKeepPng = file.type === "image/png" && dataUrl.length <= 2_500_000;
          const compressedDataUrl = shouldKeepPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9);
          console.log("[rp-images] compression", {
            name: file.name,
            mimeType: file.type,
            originalBytes: dataUrl.length,
            compressedBytes: compressedDataUrl.length,
            width: image.width,
            height: image.height,
            scaledWidth: canvas.width,
            scaledHeight: canvas.height,
            preservedPng: shouldKeepPng,
          });
          resolve({
            name: file.name,
            dataUrl: compressedDataUrl,
            previewUri: compressedDataUrl,
          });
        };
        image.onerror = () => reject(new Error(`Unable to decode ${file.name}`));
        image.src = dataUrl;
      };
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const pickRerouteEvidence = (sourceType: "original" | "rerouted") => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setRerouteAnalyzeError("Screenshot upload is currently available on web only in this V1 build.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.onchange = async () => {
      const files = input.files ? Array.from(input.files) : [];
      document.body.removeChild(input);
      if (files.length === 0) {
        return;
      }
      const attachments = await Promise.all(files.map((file) => compressRerouteImageFile(file)));
      if (sourceType === "original") {
        setRerouteOriginalScreenshots(attachments);
      } else {
        setRerouteChangedScreenshots(attachments);
      }
      setRerouteAnalyzeError("");
    };
    input.click();
  };

  const removeRerouteScreenshot = (sourceType: "original" | "rerouted", index: number) => {
    const updater =
      sourceType === "original" ? setRerouteOriginalScreenshots : setRerouteChangedScreenshots;
    updater((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const analyzeReroute = async () => {
    const description = rerouteDescription.trim();
    const hasOriginalScreenshots = rerouteOriginalScreenshots.length > 0;
    const hasChangedScreenshots = rerouteChangedScreenshots.length > 0;
    const hasOriginalText = rerouteOriginalRotationText.trim().length > 0;
    const hasChangedText = rerouteChangedRotationText.trim().length > 0;
    const hasUsableEvidence =
      hasOriginalScreenshots || hasChangedScreenshots || hasOriginalText || hasChangedText || description.length > 0;
    if (!reroutePilotStatus) {
      setRerouteAnalyzeError("Choose Lineholder or Reserve first.");
      return;
    }
    if (!hasUsableEvidence) {
      setRerouteAnalyzeError("Add screenshots, paste trip text, or describe what changed.");
      return;
    }

    setRerouteAnalyzeBusy(true);
    setRerouteAnalyzeError("");
    const analysisRunId = ++rerouteAnalysisCounterRef.current;
    rerouteActiveRequestIdRef.current = analysisRunId;
    setRerouteCurrentAnalysisId(analysisRunId);
    setRerouteAnalysisResult(null);
    setRerouteDetectedFactsOpen(false);
    const requestInput = {
      originalRotationText: rerouteOriginalRotationText.trim() || undefined,
      changedRotationText: rerouteChangedRotationText.trim() || undefined,
      description,
      pilotStatus: reroutePilotStatus,
      rerouteTiming,
      finalCreditDecreased: rerouteFinalCreditDecreased,
      touchedXDay: rerouteTouchedXDay,
      deadheadInvolved: rerouteDeadheadInvolved,
      bidPeriodCrossover: rerouteBidPeriodCrossover,
      uploadedEvidenceSummary: {
        screenshotNames: [
          ...rerouteOriginalScreenshots.map((item) => item.name),
          ...rerouteChangedScreenshots.map((item) => item.name),
        ],
        originalScreenshotName: rerouteOriginalScreenshots[0]?.name,
        changedScreenshotName: rerouteChangedScreenshots[0]?.name,
        originalScreenshotNames: rerouteOriginalScreenshots.map((item) => item.name),
        changedScreenshotNames: rerouteChangedScreenshots.map((item) => item.name),
        originalScreenshotCount: rerouteOriginalScreenshots.length,
        changedScreenshotCount: rerouteChangedScreenshots.length,
        originalFilenames: rerouteOriginalScreenshots.map((item) => item.name),
        changedFilenames: rerouteChangedScreenshots.map((item) => item.name),
        screenshotParsingActive: false,
        notes: [],
      },
      originalImages: rerouteOriginalScreenshots.map((item) => ({
        name: item.name,
        dataUrl: item.dataUrl,
      })),
      changedImages: rerouteChangedScreenshots.map((item) => ({
        name: item.name,
        dataUrl: item.dataUrl,
      })),
    };
    const requestImageDiagnostics = {
      originalScreenshotsAttached: rerouteOriginalScreenshots.length,
      changedScreenshotsAttached: rerouteChangedScreenshots.length,
      firstOriginalStartsWithDataImage: rerouteOriginalScreenshots[0]?.dataUrl.startsWith("data:image/") ?? false,
      firstChangedStartsWithDataImage: rerouteChangedScreenshots[0]?.dataUrl.startsWith("data:image/") ?? false,
      originalCompressedBytes: rerouteOriginalScreenshots.map((item) => item.dataUrl.length),
      changedCompressedBytes: rerouteChangedScreenshots.map((item) => item.dataUrl.length),
    };
    console.log("[rp-images] ui request diagnostics", requestImageDiagnostics);
    setRerouteLastRequestImageDiagnostics(requestImageDiagnostics);

    try {
      const response = await fetch("/api/tools/reroute-pay/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: requestInput,
        }),
      });
      const responseText = await response.text();
      let payload: ReroutePayAnalyzeApiResponse | null = null;
      try {
        payload = JSON.parse(responseText) as ReroutePayAnalyzeApiResponse;
      } catch {
        throw new Error("Reroute Pay Calculator returned a non-JSON response. Check the local API server.");
      }
      if (rerouteActiveRequestIdRef.current !== analysisRunId) {
        return;
      }
      if (!response.ok || !payload.ok) {
        if (!payload.ok && payload.result) {
          setRerouteAnalysisResult({ analysisId: analysisRunId, result: payload.result });
          setRerouteAnalyzeError(payload.error);
          setRerouteSupportOpen(false);
          return;
        }
        throw new Error(payload.ok ? "Unable to analyze reroute." : payload.error);
      }
      void requestInput;
      setRerouteAnalysisResult({ analysisId: analysisRunId, result: payload.result });
      setRerouteSupportOpen(false);
    } catch (error) {
      if (rerouteActiveRequestIdRef.current !== analysisRunId) {
        return;
      }
      setRerouteAnalyzeError(error instanceof Error ? error.message : "Unable to analyze reroute.");
      setRerouteAnalysisResult(null);
    } finally {
      if (rerouteActiveRequestIdRef.current === analysisRunId) {
        setRerouteAnalyzeBusy(false);
      }
    }
  };

  const rerouteRenderModel = (() => {
    if (!rerouteAnalysisResult) {
      return null;
    }

    try {
      const result = rerouteAnalysisResult.result as Record<string, unknown>;
      const changedRotation = (result.changedRotation as Record<string, unknown> | undefined) ?? undefined;
      const originalRotation = (result.originalRotation as Record<string, unknown> | undefined) ?? undefined;
      const supportCards = asObjectArray<Record<string, unknown>>(result.supportCards);
      const payItems = asObjectArray<Record<string, unknown>>(result.payItems);
      const calculation = (result.calculation as Record<string, unknown> | undefined) ?? {};
      const calculationSteps = asStringArray(calculation.calculationSteps);
      const warnings = asStringArray(result.warnings);
      const whatThisDependsOn = asStringArray(result.whatThisDependsOn);
      const likelyPaths = asStringArray(result.likelyPaths);
      const whatToCheck = asStringArray(result.whatToCheck);
      const sourceLimitations = asStringArray(result.sourceLimitations);
      const factsUsed = asStringArray(result.factsUsed);
      const focusedQuestions =
        asStringArray(result.focusedQuestions).length > 0
          ? asStringArray(result.focusedQuestions)
          : asStringArray(result.missingFacts).length > 0
            ? asStringArray(result.missingFacts)
            : asStringArray((result.classification as Record<string, unknown> | undefined)?.missingFacts);
      const whatControlsValue = result.whatControls;
      const whatControlsLines =
        typeof whatControlsValue === "string"
          ? [whatControlsValue]
          : asStringArray(whatControlsValue);
      const screenshotParserSummary =
        (result.screenshotParserSummary as Record<string, unknown> | undefined) ?? undefined;
      const rerouteEvent = (result.rerouteEvent as Record<string, unknown> | undefined) ?? {};
      const currentDetectedFacts = {
        pilotStatus:
          typeof rerouteEvent.pilotStatus === "string"
            ? rerouteEvent.pilotStatus
            : typeof result.ruleEvent === "object" &&
                result.ruleEvent &&
                typeof (result.ruleEvent as Record<string, unknown>).pilotStatus === "string"
              ? ((result.ruleEvent as Record<string, unknown>).pilotStatus as string)
              : "",
        affectedOriginalPortion:
          typeof rerouteEvent.affectedOriginalPortion === "string"
            ? rerouteEvent.affectedOriginalPortion
            : typeof rerouteEvent.originalAffectedFlying === "string"
              ? rerouteEvent.originalAffectedFlying
              : "",
        reroutedPortion:
          typeof rerouteEvent.reroutedPortion === "string"
            ? rerouteEvent.reroutedPortion
            : typeof rerouteEvent.reroutedFlying === "string"
              ? rerouteEvent.reroutedFlying
              : "",
        rejoinPoint: typeof rerouteEvent.rejoinPoint === "string" ? rerouteEvent.rejoinPoint : "",
        originalAffectedMinutes:
          typeof rerouteEvent.originalAffectedMinutes === "number" ? rerouteEvent.originalAffectedMinutes : undefined,
        reroutedMinutes: typeof rerouteEvent.reroutedMinutes === "number" ? rerouteEvent.reroutedMinutes : undefined,
        timing:
          typeof rerouteEvent.timing === "string" &&
          (rerouteEvent.timing === "unknown" ||
            rerouteEvent.timing === "before_report" ||
            rerouteEvent.timing === "after_report" ||
            rerouteEvent.timing === "after_first_airborne")
            ? (rerouteEvent.timing as RerouteTiming)
            : "unknown",
        touchedXDay: typeof rerouteEvent.touchedXDay === "boolean" ? rerouteEvent.touchedXDay : undefined,
        breakInDuty: typeof rerouteEvent.breakInDuty === "boolean" ? rerouteEvent.breakInDuty : undefined,
        releaseMoreThanFourHoursLate:
          typeof rerouteEvent.releaseMoreThanFourHoursLate === "boolean"
            ? rerouteEvent.releaseMoreThanFourHoursLate
            : undefined,
        oceanCrossing: typeof rerouteEvent.oceanCrossing === "boolean" ? rerouteEvent.oceanCrossing : undefined,
      };
      const detectedLayovers = asStringArray(changedRotation?.layovers).length > 0
        ? asStringArray(changedRotation?.layovers)
        : asStringArray(originalRotation?.layovers);
      const detectedLegs = asObjectArray<Record<string, unknown>>(changedRotation?.legs).length > 0
        ? asObjectArray<Record<string, unknown>>(changedRotation?.legs)
        : asObjectArray<Record<string, unknown>>(originalRotation?.legs);
      const hasStructuredRotationEvidence =
        rerouteChangedRotationText.trim().length > 0 ||
        rerouteOriginalRotationText.trim().length > 0 ||
        rerouteOriginalScreenshots.length > 0 ||
        rerouteChangedScreenshots.length > 0;
      const screenshotSummary = screenshotParserSummary
        ? {
            screenshotParsingActive: Boolean(screenshotParserSummary.screenshotParsingActive),
            originalScreenshotsRead:
              typeof screenshotParserSummary.originalScreenshotsRead === "number"
                ? screenshotParserSummary.originalScreenshotsRead
                : 0,
            changedScreenshotsRead:
              typeof screenshotParserSummary.changedScreenshotsRead === "number"
                ? screenshotParserSummary.changedScreenshotsRead
                : 0,
            originalImagesReceived:
              typeof screenshotParserSummary.originalImagesReceived === "number"
                ? screenshotParserSummary.originalImagesReceived
                : 0,
            changedImagesReceived:
              typeof screenshotParserSummary.changedImagesReceived === "number"
                ? screenshotParserSummary.changedImagesReceived
                : 0,
            firstOriginalImageName:
              typeof screenshotParserSummary.firstOriginalImageName === "string"
                ? screenshotParserSummary.firstOriginalImageName
                : "",
            firstChangedImageName:
              typeof screenshotParserSummary.firstChangedImageName === "string"
                ? screenshotParserSummary.firstChangedImageName
                : "",
            firstOriginalStartsWithDataImage: Boolean(screenshotParserSummary.firstOriginalStartsWithDataImage),
            firstChangedStartsWithDataImage: Boolean(screenshotParserSummary.firstChangedStartsWithDataImage),
            visionModelCalled: Boolean(screenshotParserSummary.visionModelCalled),
            modelSelected:
              typeof screenshotParserSummary.modelSelected === "string"
                ? screenshotParserSummary.modelSelected
                : "",
            parseConfidence:
              screenshotParserSummary.parseConfidence === "high" ||
              screenshotParserSummary.parseConfidence === "medium" ||
              screenshotParserSummary.parseConfidence === "low"
                ? screenshotParserSummary.parseConfidence
                : "low",
            rotationCount:
              typeof screenshotParserSummary.rotationCount === "number"
                ? screenshotParserSummary.rotationCount
                : 0,
            legsDetected:
              typeof screenshotParserSummary.legsDetected === "number"
                ? screenshotParserSummary.legsDetected
                : 0,
            missingParseItems: asStringArray(screenshotParserSummary.missingParseItems),
            extractionNotes: asStringArray(screenshotParserSummary.extractionNotes),
            rawVisionResponsePreview: asStringArray(screenshotParserSummary.rawVisionResponsePreview),
            rawTextPreview: asStringArray(screenshotParserSummary.rawTextPreview),
            structuredJsonParseError:
              typeof screenshotParserSummary.structuredJsonParseError === "string"
                ? screenshotParserSummary.structuredJsonParseError
                : "",
            fallbackRegexLegsParsed:
              typeof screenshotParserSummary.fallbackRegexLegsParsed === "number"
                ? screenshotParserSummary.fallbackRegexLegsParsed
                : 0,
            parsedLegs: asObjectArray<Record<string, unknown>>(screenshotParserSummary.parsedLegs),
          }
        : null;
      const additionalPremiumMissingFacts = focusedQuestions.filter((item) =>
        /release times?|scheduled release|late-release|late release|additional duty|x-day|line day-off/i.test(item),
      );
      const coreMissingFacts = focusedQuestions.filter((item) => !additionalPremiumMissingFacts.includes(item));

      return {
        status:
          result.status === "resolved" || result.status === "warning" || result.status === "caution"
            ? result.status
            : "caution",
        likelyIssue: typeof result.likelyIssue === "string" ? result.likelyIssue : "Reroute calculation result",
        shortAnswer:
          typeof result.shortAnswer === "string"
            ? result.shortAnswer
            : "The calculator returned a result, but some summary fields are missing.",
        estimatedPayLabel:
          typeof result.estimatedPayLabel === "string"
            ? result.estimatedPayLabel
            : rerouteFormatMinutes(
                typeof result.estimatedAdditionalPayMinutes === "number" ? result.estimatedAdditionalPayMinutes : undefined,
              ) || "Need more facts",
        changedRotation,
        originalRotation,
        supportCards,
        payItems,
        calculationSteps,
        warnings,
        whatThisDependsOn,
        likelyPaths,
        whatToCheck,
        sourceLimitations,
        factsUsed,
        focusedQuestions,
        coreMissingFacts,
        additionalPremiumMissingFacts,
        whatControlsLines,
        detectedLayovers,
        detectedLegs,
        hasStructuredRotationEvidence,
        screenshotSummary,
        requestImageDiagnostics: rerouteLastRequestImageDiagnostics,
        currentDetectedFacts,
        currentAnalysisId: rerouteCurrentAnalysisId,
        resultAnalysisId: rerouteAnalysisResult.analysisId,
        detectedFactsSource:
          currentDetectedFacts.affectedOriginalPortion ||
          currentDetectedFacts.reroutedPortion ||
          typeof currentDetectedFacts.reroutedMinutes === "number"
            ? ("current_result" as const)
            : ("none" as const),
        renderError: null as string | null,
      };
    } catch (error) {
      return {
        status: "warning" as const,
        likelyIssue: "Reroute calculation result",
        shortAnswer: "Analyzer returned a result, but the UI could not render one section.",
        estimatedPayLabel: "Unavailable",
        changedRotation: undefined,
        originalRotation: undefined,
        supportCards: [],
        payItems: [],
        calculationSteps: [],
        warnings: [],
        whatThisDependsOn: [],
        likelyPaths: [],
        whatToCheck: [],
        sourceLimitations: [],
        factsUsed: [],
        focusedQuestions: [],
        coreMissingFacts: [],
        additionalPremiumMissingFacts: [],
        whatControlsLines: [],
        detectedLayovers: [],
        detectedLegs: [],
        hasStructuredRotationEvidence: false,
        screenshotSummary: null,
        requestImageDiagnostics: rerouteLastRequestImageDiagnostics,
        currentDetectedFacts: {
          affectedOriginalPortion: "",
          reroutedPortion: "",
          rejoinPoint: "",
          originalAffectedMinutes: undefined,
          reroutedMinutes: undefined,
          timing: "unknown" as RerouteTiming,
          touchedXDay: undefined,
          breakInDuty: undefined,
          releaseMoreThanFourHoursLate: undefined,
          oceanCrossing: undefined,
        },
        currentAnalysisId: rerouteCurrentAnalysisId,
        resultAnalysisId: rerouteAnalysisResult.analysisId,
        detectedFactsSource: "none" as const,
        renderError: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  })();
  const rerouteDetectedTiming = rerouteRenderModel?.currentDetectedFacts.timing ?? "unknown";

  const rerouteBooleanChoice = (value: boolean | undefined): RerouteAnalyzerChoice =>
    value == null ? "unknown" : value ? "yes" : "no";

  const rerouteFormatMinutes = (value?: number) =>
    value == null ? "" : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;

  const rotationFormatMinutes = (value?: number) =>
    value == null ? "TBD" : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;

  const rotationCompanionContext = useMemo<RotationCompanionContext | null>(
    () =>
      buildRotationCompanionContext({
        dashboard: rotationDashboard,
        rawRotationText: rotationPasteInput,
      }),
    [rotationDashboard, rotationPasteInput],
  );

  const openRerouteCalculatorFromRotation = () => {
    if (!rotationCompanionContext) {
      setActiveTab("pay");
      setSelectedPayTool("reroute-calculator");
      return;
    }
    const adapter = buildRerouteCalculatorAdapter(rotationCompanionContext);
    setSelectedPayTool("reroute-calculator");
    setRerouteOriginalRotationText(adapter.originalRotationText ?? "");
    setRerouteChangedRotationText(adapter.changedRotationText ?? "");
    setRerouteDescription(adapter.description);
    setRotationToolBanner(adapter.toolBanner);
    setActiveTab("pay");
  };

  const openPayImpactFromRotation = () => {
    if (!rotationCompanionContext) {
      setActiveTab("pay");
      return;
    }
    const adapter = buildPayImpactAdapter(rotationCompanionContext);
    setRotationToolBanner(adapter.toolBanner);
    setActiveTab("pay");
  };

  const openContractCopilotFromRotation = () => {
    if (!rotationCompanionContext) {
      setActiveTab("schedule");
      return;
    }
    const adapter = buildContractCopilotAdapter(rotationCompanionContext);
    setContractCopilotStarterQuestion(adapter.starterQuestion);
    setRotationToolBanner(adapter.toolBanner);
    setActiveTab("schedule");
  };

  const openFar117FromRotation = () => {
    setActiveTab("far117");
  };

  const activeBottomTabKey: Extract<TabKey, "today" | "far117" | "logbook" | "tools"> =
    activeTab === "today" || activeTab === "far117" || activeTab === "logbook" || activeTab === "tools"
      ? activeTab
      : "tools";

  const canOpenRotationSecondaryTabs = Boolean(displayedRotationDashboard);

  const handleQuickContactPress = (key: QuickContactKey) => {
    const currentValue = quickContacts[key];
    if (currentValue) {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = `tel:${currentValue}`;
      }
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const labelMap: Record<QuickContactKey, string> = {
        crewScheduling: "Crew Scheduling",
        dispatch: "Dispatch",
        van: "Van",
        hotel: "Hotel",
      };
      const entered = window.prompt(`Add ${labelMap[key]} number`, "");
      if (entered && entered.trim()) {
        setQuickContacts((current) => ({
          ...current,
          [key]: entered.trim(),
        }));
      }
    }
  };

  const openLayoverHotelMap = (detail: RotationLayoverDetail | null) => {
    if (!detail?.hotelName) {
      return;
    }
    const query = [detail.hotelName, detail.city].filter(Boolean).join(" ");
    if (!query) {
      return;
    }
    openRotationExternalUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
  };

  const currentPilot = useMemo(
    () => findPilotByEmployeeNumber(deltaSnapshot.pilotDirectory, employeeNumberInput),
    [employeeNumberInput]
  );

  useEffect(() => {
    if (Platform.OS !== "web") {
      setMobilePreferencesLoaded(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(preferenceStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PilotPreferences>;
        setMobilePreferences((current) => ({
          ...current,
          ...parsed,
          commuterBases: Array.isArray(parsed.commuterBases) ? parsed.commuterBases : current.commuterBases,
          goalCategories: Array.isArray(parsed.goalCategories) ? parsed.goalCategories : current.goalCategories,
          priority:
            parsed.priority && pilotPriorities.some((option) => option.key === parsed.priority)
              ? parsed.priority
              : current.priority,
        }));
      }
    } catch {
      // Keep defaults if storage is unavailable or malformed.
    } finally {
      setMobilePreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!mobilePreferencesLoaded || Platform.OS !== "web") {
      return;
    }

    window.localStorage.setItem(preferenceStorageKey, JSON.stringify(mobilePreferences));
  }, [mobilePreferences, mobilePreferencesLoaded]);

  useEffect(() => {
    if (!mobilePreferencesLoaded || mobilePreferencesEditorInitialized) {
      return;
    }

    const seededHomeBase =
      mobilePreferences.homeBase || currentPilot?.currentCategoryCode?.slice(0, 3) || "";
    const preferencesAreComplete = Boolean(
      currentPilot &&
        seededHomeBase &&
        (!mobilePreferences.commute ||
          mobilePreferences.commuterBases.length > 0 ||
          mobilePreferences.commuteOrigin.trim())
    );

    setMobilePreferencesEditing(!preferencesAreComplete);
    setMobilePreferencesEditorInitialized(true);
  }, [
    mobilePreferencesLoaded,
    mobilePreferencesEditorInitialized,
    mobilePreferences.homeBase,
    mobilePreferences.commute,
    mobilePreferences.commuterBases,
    mobilePreferences.commuteOrigin,
    currentPilot,
  ]);

  useEffect(() => {
    if (!currentPilot) {
      return;
    }

    setMobilePreferences((current) => ({
      ...current,
      currentCategory: current.currentCategory || currentPilot.currentCategoryCode,
      homeBase: current.homeBase || currentPilot.currentCategoryCode?.slice(0, 3) || "",
    }));
  }, [currentPilot]);

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !currentPilot ||
      !embeddedChartData.pilotHistoryShardBaseUrl
    ) {
      return;
    }

    const normalizedEmployeeNumber = normalizeDigits(currentPilot.employeeNumber);
    const shardKey = buildPilotHistoryShardKey(normalizedEmployeeNumber);
    if (loadedPilotHistoryShards[shardKey]) {
      return;
    }

    let cancelled = false;

    fetch(`${embeddedChartData.pilotHistoryShardBaseUrl}/${shardKey}.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load pilot history shard: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          const shardEntries = data as Record<string, PilotHistoryRecord>;
          setPilotHistoryCache((current) => ({ ...current, ...shardEntries }));
          setLoadedPilotHistoryShards((current) => ({ ...current, [shardKey]: true }));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [currentPilot, loadedPilotHistoryShards]);

  const userSeniorityNumber = currentPilot?.seniorityNumber ?? 0;
  const currentCategoryKey = currentPilot?.currentCategoryKey ?? null;

  const tripHealth = useMemo(
    () =>
      computeTripHealth(
        Number(blockHours) || 0,
        Number(dutyHours) || 0,
        Number(layoverHours) || 0,
        Number(legs) || 0
      ),
    [blockHours, dutyHours, layoverHours, legs]
  );

  const payAudit = useMemo(
    () =>
      computePayAudit(
        Number(hourlyRate) || 0,
        Number(creditedHours) || 0,
        Number(premiumHours) || 0,
        parseAuditHoursInput(perDiemHours),
        Number(missedBreakPay) || 0
      ),
    [hourlyRate, creditedHours, premiumHours, perDiemHours, missedBreakPay]
  );

  const filteredCategories = useMemo(
    () =>
      deltaSnapshot.categories.filter((entry) => {
        const matchesBase =
          selectedCategoryBaseFilter === "All" || entry.base === selectedCategoryBaseFilter;
        const matchesSeat =
          categorySeatFilter === "All" || entry.seat === categorySeatFilter;
        const query = categorySearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query) ||
          entry.key.toLowerCase().includes(query);
        return matchesBase && matchesSeat && matchesQuery;
      }),
    [selectedCategoryBaseFilter, categorySearch, categorySeatFilter]
  );

  const categoryTrendMap = useMemo(
    () => new Map(deltaSnapshot.categoryTrends.map((entry) => [entry.key, entry])),
    []
  );
  const aeHistoryByAwardCategory = useMemo(
    () =>
      new Map(
        ((deltaSnapshot as unknown as { aeHistoryByCategory?: readonly AeHistoryRecord[] })
          .aeHistoryByCategory ?? []).map((entry) => [entry.awardCategory, entry])
      ),
    []
  );

  const groupedCategoryTables = useMemo(
    () =>
      bases
        .map((base) => ({
          base,
          summary: buildBaseCategorySummary(
            filteredCategories.filter((entry) => entry.base === base),
            categoryTrendMap
          ),
          rows: filteredCategories
            .filter((entry) => entry.base === base)
            .sort((left, right) => {
              const seatOrder =
                (left.seat === "Captain" ? 0 : 1) - (right.seat === "Captain" ? 0 : 1);
              if (seatOrder !== 0) {
                return seatOrder;
              }
              return left.fleet.localeCompare(right.fleet);
            }),
        }))
        .filter((group) => group.rows.length > 0),
    [filteredCategories, categoryTrendMap]
  );

  const filteredSeniorityAe = useMemo(
    () =>
      deltaSnapshot.aeOpportunities.filter((entry) => {
        const matchesBase =
          selectedCategoryBaseFilter === "All" || entry.base === selectedCategoryBaseFilter;
        const matchesSeat = categorySeatFilter === "All" || entry.seat === categorySeatFilter;
        const query = categorySearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query) ||
          entry.awardCategory.toLowerCase().includes(query);
        return matchesBase && matchesSeat && matchesQuery;
      }),
    [selectedCategoryBaseFilter, categorySeatFilter, categorySearch]
  );

  const groupedSeniorityAeTables = useMemo(
    () =>
      bases
        .map((base) => ({
          base,
          rows: filteredSeniorityAe
            .filter((entry) => entry.base === base)
            .sort((left, right) => {
              const seatOrder =
                (left.seat === "Captain" ? 0 : 1) - (right.seat === "Captain" ? 0 : 1);
              if (seatOrder !== 0) {
                return seatOrder;
              }
              return left.fleet.localeCompare(right.fleet);
            }),
        }))
        .filter((group) => group.rows.length > 0),
    [filteredSeniorityAe]
  );

  const filteredAe = useMemo(
    () =>
      deltaSnapshot.aeOpportunities.filter((entry) => {
        const matchesBase =
          selectedAeBaseFilter === "All" || entry.base === selectedAeBaseFilter;
        const matchesFleet =
          selectedAeFleetFilter === "All" || entry.fleet === selectedAeFleetFilter;
        const matchesSeat = aeSeatFilter === "All" || entry.seat === aeSeatFilter;
        const query = aeSearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query) ||
          entry.awardCategory.toLowerCase().includes(query);
        return matchesBase && matchesFleet && matchesSeat && matchesQuery;
      }),
    [selectedAeBaseFilter, selectedAeFleetFilter, aeSearch, aeSeatFilter]
  );

  const aeFleetOptions = useMemo(
    () =>
      Array.from(
        new Set(
          deltaSnapshot.aeOpportunities
            .filter((entry) => aeSeatFilter === "All" || entry.seat === aeSeatFilter)
            .map((entry) => entry.fleet)
        )
      ).sort(),
    [aeSeatFilter]
  );

  const aeBaseOptions = useMemo(
    () =>
      Array.from(
        new Set(
          deltaSnapshot.aeOpportunities
            .filter((entry) => {
              const matchesSeat = aeSeatFilter === "All" || entry.seat === aeSeatFilter;
              const matchesFleet =
                selectedAeFleetFilter === "All" || entry.fleet === selectedAeFleetFilter;
              return matchesSeat && matchesFleet;
            })
            .map((entry) => entry.base)
        )
      ).sort(),
    [aeSeatFilter, selectedAeFleetFilter]
  );

  useEffect(() => {
    if (
      selectedAeFleetFilter !== "All" &&
      !aeFleetOptions.some((fleet) => fleet === selectedAeFleetFilter)
    ) {
      setSelectedAeFleetFilter("All");
    }
  }, [selectedAeFleetFilter, aeFleetOptions]);

  useEffect(() => {
    if (
      selectedAeBaseFilter !== "All" &&
      !aeBaseOptions.some((base) => base === selectedAeBaseFilter)
    ) {
      setSelectedAeBaseFilter("All");
    }
  }, [selectedAeBaseFilter, aeBaseOptions]);

  const whatIfCategoryOptions = useMemo(
    () =>
      deltaSnapshot.categories
        .filter((entry) => {
          return entry.seat === whatIfSeat;
        })
        .sort((left, right) => {
          return (
            left.fleet.localeCompare(right.fleet) ||
            left.base.localeCompare(right.base)
          );
        }),
    [whatIfSeat]
  );

  const whatIfFleetOptions = useMemo(
    () => Array.from(new Set(whatIfCategoryOptions.map((entry) => entry.fleet))),
    [whatIfCategoryOptions]
  );

  const whatIfBaseOptions = useMemo(
    () =>
      Array.from(
        new Set(
          whatIfCategoryOptions
            .filter((entry) => entry.fleet === selectedWhatIfFleet)
            .map((entry) => entry.base)
        )
      ),
    [whatIfCategoryOptions, selectedWhatIfFleet]
  );

  useEffect(() => {
    if (!whatIfFleetOptions.length) {
      setSelectedWhatIfFleet("");
      return;
    }

    if (!whatIfFleetOptions.some((fleet) => fleet === selectedWhatIfFleet)) {
      setSelectedWhatIfFleet(whatIfFleetOptions[0]);
    }
  }, [selectedWhatIfFleet, whatIfFleetOptions]);

  useEffect(() => {
    if (!whatIfBaseOptions.length) {
      setSelectedWhatIfBase("");
      return;
    }

    if (!whatIfBaseOptions.some((base) => base === selectedWhatIfBase)) {
      setSelectedWhatIfBase(whatIfBaseOptions[0]);
    }
  }, [selectedWhatIfBase, whatIfBaseOptions]);

  const activeWhatIfCategory = useMemo(
    () =>
      whatIfCategoryOptions.find(
        (entry) =>
          entry.seat === whatIfSeat &&
          entry.fleet === selectedWhatIfFleet &&
          entry.base === selectedWhatIfBase
      ) ?? null,
    [whatIfCategoryOptions, whatIfSeat, selectedWhatIfFleet, selectedWhatIfBase]
  );
  const activeWhatIfAwardCategory = activeWhatIfCategory
    ? formatCategoryEntryCode(activeWhatIfCategory)
    : null;
  const activeWhatIfAeEntry = useMemo(
    () =>
      activeWhatIfAwardCategory
        ? deltaSnapshot.aeOpportunities.find((entry) => entry.awardCategory === activeWhatIfAwardCategory) ??
          null
        : null,
    [activeWhatIfAwardCategory]
  );
  const activeWhatIfAeHistory = useMemo(
    () => (activeWhatIfAwardCategory ? aeHistoryByAwardCategory.get(activeWhatIfAwardCategory) ?? null : null),
    [activeWhatIfAwardCategory, aeHistoryByAwardCategory]
  );
  const activeWhatIfCategoryTrend = useMemo(
    () => (activeWhatIfCategory ? categoryTrendMap.get(activeWhatIfCategory.key) ?? null : null),
    [activeWhatIfCategory, categoryTrendMap]
  );

  const groupedAeTables = useMemo(
    () =>
      bases
        .map((base) => ({
          base,
          rows: filteredAe
            .filter((entry) => entry.base === base)
            .sort((left, right) => {
              const seatOrder =
                (left.seat === "Captain" ? 0 : 1) - (right.seat === "Captain" ? 0 : 1);
              if (seatOrder !== 0) {
                return seatOrder;
              }
              return left.fleet.localeCompare(right.fleet);
            }),
        }))
        .filter((group) => group.rows.length > 0),
    [filteredAe]
  );

  const latestAeAwardRows =
    (((deltaSnapshot as unknown as { latestAeAwards?: readonly LatestAeAwardRow[] }).latestAeAwards ??
      []) as readonly LatestAeAwardRow[]);
  const latestCategoryAssignments =
    (((deltaSnapshot as unknown as {
      latestCategoryAssignments?: readonly LatestCategoryAssignment[];
    }).latestCategoryAssignments ?? []) as readonly LatestCategoryAssignment[]);

  const activeAeAwardRows = useMemo(
    () =>
      selectedAeDetailCategory
        ? latestAeAwardRows.filter(
            (entry) =>
              entry.awardCategory === selectedAeDetailCategory.awardCategory &&
              entry.seat === selectedAeDetailCategory.seat
          )
        : [],
    [latestAeAwardRows, selectedAeDetailCategory]
  );

  const activeAeLeavingRows = useMemo(
    () =>
      selectedAeDetailCategory
        ? latestAeAwardRows
            .filter(
              (entry) =>
                entry.previousCategory === selectedAeDetailCategory.awardCategory
            )
            .sort((left, right) => left.seniorityNumber - right.seniorityNumber)
        : [],
    [latestAeAwardRows, selectedAeDetailCategory]
  );

  const activeCurrentCategoryList = useMemo(
    () =>
      selectedAeDetailCategory
        ? latestCategoryAssignments
            .filter(
              (entry) =>
                entry.categoryKey ===
                buildCategoryKeyFromAeCategory(selectedAeDetailCategory.awardCategory)
            )
            .sort((left, right) => left.seniorityNumber - right.seniorityNumber)
        : [],
    [latestCategoryAssignments, selectedAeDetailCategory]
  );

  const selectedCategoryAssignments = useMemo(
    () =>
      selectedCategoryDetail
        ? latestCategoryAssignments
            .filter((entry) => entry.categoryKey === selectedCategoryDetail.categoryKey)
            .sort((left, right) => left.seniorityNumber - right.seniorityNumber)
        : [],
    [latestCategoryAssignments, selectedCategoryDetail]
  );

  const selectedCategoryPreviewRows = useMemo(() => {
    if (!selectedCategoryDetail) {
      return [];
    }

    const existing = [...selectedCategoryAssignments];
    if (!currentPilot || !userSeniorityNumber) {
      return existing;
    }

    const alreadyListed = existing.some(
      (assignment) => assignment.employeeNumber === currentPilot.employeeNumber
    );
    if (alreadyListed) {
      return existing;
    }

    const userRow: LatestCategoryAssignment & { synthetic?: boolean } = {
      employeeNumber: currentPilot.employeeNumber,
      name: currentPilot.name,
      seniorityNumber: currentPilot.seniorityNumber,
      base: "",
      fleet: "",
      seat: "",
      categoryKey: selectedCategoryDetail.categoryKey,
      awardCategory: selectedCategoryDetail.label,
      scheduledRetireDate: currentPilot.scheduledRetireDate,
      synthetic: true,
    };

    const inserted = [...existing, userRow];
    inserted.sort((left, right) => left.seniorityNumber - right.seniorityNumber);
    return inserted;
  }, [selectedCategoryAssignments, selectedCategoryDetail, currentPilot, userSeniorityNumber]);

  const categoryAssignmentsByKey = useMemo(() => {
    const grouped = new Map<string, LatestCategoryAssignment[]>();

    latestCategoryAssignments.forEach((assignment) => {
      const bucket = grouped.get(assignment.categoryKey) ?? [];
      bucket.push(assignment);
      grouped.set(assignment.categoryKey, bucket);
    });

    grouped.forEach((assignments) => {
      assignments.sort((left, right) => left.seniorityNumber - right.seniorityNumber);
    });

    return grouped;
  }, [latestCategoryAssignments]);

  const aeMovementByCategory = useMemo(() => {
    const movement = new Map<string, AeMovementSummary>();

    latestAeAwardRows.forEach((row) => {
      const current = movement.get(row.awardCategory) ?? { aeIn: 0, aeOut: 0, net: 0 };
      current.aeIn += 1;
      movement.set(row.awardCategory, current);

      if (row.previousCategory) {
        const previous = movement.get(row.previousCategory) ?? { aeIn: 0, aeOut: 0, net: 0 };
        previous.aeOut += 1;
        movement.set(row.previousCategory, previous);
      }
    });

    movement.forEach((entry) => {
      entry.net = entry.aeIn - entry.aeOut;
    });

    return movement;
  }, [latestAeAwardRows]);

  const aeMovementByBase = useMemo(() => {
    const movement = new Map<string, AeMovementSummary>();

    latestAeAwardRows.forEach((row) => {
      const incoming = movement.get(row.base) ?? { aeIn: 0, aeOut: 0, net: 0 };
      incoming.aeIn += 1;
      movement.set(row.base, incoming);

      const previousBase = row.previousCategory.split("-")[0] ?? "";
      if (previousBase) {
        const outgoing = movement.get(previousBase) ?? { aeIn: 0, aeOut: 0, net: 0 };
        outgoing.aeOut += 1;
        movement.set(previousBase, outgoing);
      }
    });

    movement.forEach((entry) => {
      entry.net = entry.aeIn - entry.aeOut;
    });

    return movement;
  }, [latestAeAwardRows]);

  const activeAeMovement = useMemo(
    () =>
      selectedAeDetailCategory
        ? aeMovementByCategory.get(selectedAeDetailCategory.awardCategory) ?? {
            aeIn: activeAeAwardRows.length,
            aeOut: 0,
            net: activeAeAwardRows.length,
          }
        : null,
    [activeAeAwardRows.length, aeMovementByCategory, selectedAeDetailCategory]
  );

  const aeResidualByCategory = useMemo(() => {
    const residuals = new Map<string, AeResidualSummary>();
    const trendLookup = categoryTrendMap as ReadonlyMap<
      string,
      { pilotCountDelta: number | null }
    >;

    aeMovementByCategory.forEach((movement, awardCategory) => {
      const trend = trendLookup.get(buildCategoryKeyFromAeCategory(awardCategory)) ?? null;
      const categoryDelta = trend?.pilotCountDelta ?? null;
      residuals.set(awardCategory, {
        categoryDelta,
        aeNet: movement.net,
        residual: categoryDelta != null ? categoryDelta - movement.net : null,
      });
    });

    return residuals;
  }, [aeMovementByCategory, categoryTrendMap]);

  const aeResidualByBase = useMemo(() => {
    const residuals = new Map<string, AeResidualSummary>();

    bases.forEach((base) => {
      const categoryDelta = deltaSnapshot.categoryTrends
        .filter((entry) => entry.base === base)
        .reduce((sum, entry) => sum + (entry.pilotCountDelta ?? 0), 0);
      const aeNet = aeMovementByBase.get(base)?.net ?? 0;
      residuals.set(base, {
        categoryDelta,
        aeNet,
        residual: categoryDelta - aeNet,
      });
    });

    return residuals;
  }, [aeMovementByBase]);

  const activeAeResidual = useMemo(
    () =>
      selectedAeDetailCategory
        ? aeResidualByCategory.get(selectedAeDetailCategory.awardCategory) ?? null
        : null,
    [aeResidualByCategory, selectedAeDetailCategory]
  );

  const holdSummary = useMemo(
    () => buildHoldSummary(deltaSnapshot.categories, userSeniorityNumber, currentCategoryKey),
    [userSeniorityNumber, currentCategoryKey]
  );

  const otherPilotSummary = useMemo(
    () => ({
      instructors: deltaSnapshot.operationalBases.reduce(
        (sum: number, base: BaseEntry) => sum + base.instructors,
        0
      ),
      carveoutPilots: deltaSnapshot.carveoutBases.reduce(
        (sum: number, base: BaseEntry) => sum + base.pilots,
        0
      ),
      total:
        deltaSnapshot.operationalBases.reduce(
          (sum: number, base: BaseEntry) => sum + base.instructors,
          0
        ) +
        deltaSnapshot.carveoutBases.reduce((sum: number, base: BaseEntry) => sum + base.pilots, 0),
    }),
    []
  );

  const totalInactivePilots = otherPilotSummary.carveoutPilots;

  const aeSummary = useMemo(
    () => buildAeSummary(deltaSnapshot.aeOpportunities, userSeniorityNumber),
    [userSeniorityNumber]
  );

  const careerProjection = useMemo(
    () =>
      currentPilot
        ? buildCareerProjection(
            currentPilot,
            deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
            growthRate,
            chartStartMode
          )
        : [],
    [currentPilot, growthRate, chartStartMode]
  );

  const currentAeAnalysis = useMemo<CurrentAeAnalysisResult | null>(
    () =>
      analyzeCurrentAE({
        pilot: currentPilot,
        target: activeWhatIfCategory,
        latestAe: activeWhatIfAeEntry,
        aeHistory: activeWhatIfAeHistory,
      }),
    [currentPilot, activeWhatIfCategory, activeWhatIfAeEntry, activeWhatIfAeHistory]
  );

  const holdForecast = useMemo<HoldForecastResult | null>(
    () =>
      forecastHoldability({
        pilot: currentPilot,
        target: activeWhatIfCategory,
        latestAe: activeWhatIfAeEntry,
        aeHistory: activeWhatIfAeHistory,
        categoryTrend: activeWhatIfCategoryTrend,
        pilots: deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
        growthRate: forecastGrowthRate,
      }),
    [
      currentPilot,
      activeWhatIfCategory,
      activeWhatIfAeEntry,
      activeWhatIfAeHistory,
      activeWhatIfCategoryTrend,
      forecastGrowthRate,
    ]
  );

  const pilotHistory = useMemo(() => {
    if (!currentPilot) {
      return null;
    }
    return pilotHistoryCache[normalizeDigits(currentPilot.employeeNumber)] ?? null;
  }, [currentPilot, pilotHistoryCache]);

  const seniorityPercentSeries = useMemo(() => {
    const allPoints =
      chartStartMode === "hire"
        ? careerProjection.map((point) => {
            const checkpointDate = point.timeMs != null ? new Date(point.timeMs) : null;
            const estimatedPast = checkpointDate != null
              ? buildEstimatedPastPoint(
                  currentPilot,
                  checkpointDate,
                  embeddedChartData.monthlyPilotCounts
                )
              : null;
            const isHistorical = checkpointDate != null && checkpointDate <= new Date();
            const historicalPoint =
              checkpointDate != null ? findHistoryPointAtOrBefore(pilotHistory, checkpointDate) : null;
            const actualValue =
              historicalPoint?.systemPercent ?? estimatedPast?.systemPercent ?? point.systemPercent;
            const value = isHistorical ? actualValue : point.systemPercent;
            const valueLabel = isHistorical ? `~${value}%` : `${point.systemPercent}%`;

            return {
              label: point.label,
              value,
              valueLabel,
              tone: isHistorical ? ("past" as const) : ("future" as const),
              timeMs: point.timeMs,
            };
          })
        : [
            ...(pilotHistory?.points
              .filter((point) => {
                const earliestDate = currentPilot
                  ? resolvePilotChartStartDate(currentPilot, pilotHistory, chartStartMode)
                  : null;
                if (!earliestDate) {
                  return false;
                }
                const pointDate = dateFromMonthKey(point.monthKey);
                return pointDate != null && pointDate >= earliestDate && pointDate <= new Date();
              })
              .map((point) => {
                const pointDate = dateFromMonthKey(point.monthKey);
                return {
                  label: shortenMonthLabel(point.monthKey),
                  value: point.systemPercent ?? 0,
                  valueLabel: point.systemPercent != null ? `${point.systemPercent}%` : "-",
                  tone: "past" as const,
                  timeMs: pointDate?.getTime(),
                };
              }) ?? []),
            ...careerProjection.map((point) => ({
              label: point.label,
              value: point.systemPercent,
              valueLabel: `${point.systemPercent}%`,
              tone: "future" as const,
              timeMs: point.timeMs,
            })),
          ];

    return dedupeChartPointsByLabel(
      allPoints.map((point) => ({
        ...point,
        referenceOnePercent:
          currentPilot && point.timeMs != null
            ? buildReferencePercentAtTime(
                currentPilot,
                deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
                0.01,
                chartStartMode,
                point.timeMs
              )
            : null,
        referenceTwoPercent:
          currentPilot && point.timeMs != null
            ? buildReferencePercentAtTime(
                currentPilot,
                deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
                0.02,
                chartStartMode,
                point.timeMs
              )
            : null,
      }))
    );
  }, [pilotHistory, careerProjection, currentPilot, chartStartMode]);

  const totalPilotCountSeries = useMemo(() => {
    const earliestDate = resolveListChartStartDate(
      currentPilot,
      pilotHistory,
      chartStartMode,
      embeddedChartData.monthlyPilotCounts
    );
    const past: ChartPoint[] = embeddedChartData.monthlyPilotCounts
      .filter((point) => {
        if (!earliestDate) {
          return false;
        }
        const pointDate = dateFromMonthKey(point.monthKey);
        return pointDate != null && pointDate >= earliestDate && pointDate <= new Date();
      })
        .map((point) => ({
          label: shortenMonthLabel(point.monthKey),
          value: point.pilotCount,
          valueLabel: `${point.pilotCount}`,
          tone: "past",
          timeMs: dateFromMonthKey(point.monthKey)?.getTime(),
        }));

    const lastCount = past.at(-1)?.value ?? 0;
    const future = buildProjectedPilotCountSeries(
      lastCount,
      currentPilot?.scheduledRetireDate ?? null,
      forecastGrowthRate,
      chartStartMode
    );

    return dedupeChartPointsByLabel([...past, ...future]);
  }, [currentPilot, forecastGrowthRate, chartStartMode, pilotHistory]);

  const seniorityNumberSeries = useMemo(() => {
    if (chartStartMode === "hire") {
      return careerProjection.map((point) => {
        const checkpointDate = point.timeMs != null ? new Date(point.timeMs) : null;
        const estimatedPast =
          checkpointDate != null
            ? buildEstimatedPastPoint(
                currentPilot,
                checkpointDate,
                embeddedChartData.monthlyPilotCounts
              )
            : null;
        const historicalPoint =
          checkpointDate != null ? findHistoryPointAtOrBefore(pilotHistory, checkpointDate) : null;
        const isHistorical = checkpointDate != null && checkpointDate <= new Date();
        const actualValue =
          historicalPoint?.seniorityNumber ?? estimatedPast?.seniorityNumber ?? point.projectedRank;
        const value = isHistorical ? actualValue : point.projectedRank;
        const valueLabel = isHistorical ? `~#${value}` : `#${point.projectedRank}`;

        return {
          label: point.label,
          value,
          valueLabel,
          tone: isHistorical ? ("past" as const) : ("future" as const),
          timeMs: point.timeMs,
        };
      });
    }

    const earliestDate = currentPilot
      ? resolvePilotChartStartDate(currentPilot, pilotHistory, chartStartMode)
      : null;
    const past: ChartPoint[] =
      pilotHistory?.points
        .filter((point) => {
          if (!earliestDate) {
            return false;
          }
          const pointDate = dateFromMonthKey(point.monthKey);
          return pointDate != null && pointDate >= earliestDate && pointDate <= new Date();
        })
        .map((point) => ({
          label: shortenMonthLabel(point.monthKey),
          value: point.seniorityNumber,
          valueLabel: `#${point.seniorityNumber}`,
          tone: "past",
          timeMs: dateFromMonthKey(point.monthKey)?.getTime(),
        })) ?? [];

    const future: ChartPoint[] = careerProjection.map((point) => ({
      label: point.label,
      value: point.projectedRank,
      valueLabel: `#${point.projectedRank}`,
      tone: "future",
      timeMs: point.timeMs,
    }));

    return dedupeChartPointsByLabel([...past, ...future]);
  }, [pilotHistory, careerProjection, currentPilot, chartStartMode]);

  const visibleCategoryTrends = useMemo(
    () =>
      deltaSnapshot.categoryTrends.filter((entry) => {
        const matchesSeat =
          categorySeatFilter === "All" || entry.seat === categorySeatFilter;
        const query = categorySearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query);
        return matchesSeat && matchesQuery;
      }),
    [categorySearch, categorySeatFilter]
  );

  const visibleAeTrends = useMemo(
    () =>
      (deltaSnapshot.aeTrends as unknown as readonly AeTrendEntry[]).filter(
        (entry) =>
          (selectedAeBaseFilter === "All" || entry.base === selectedAeBaseFilter) &&
          (selectedAeFleetFilter === "All" || entry.fleet === selectedAeFleetFilter) &&
          (aeSeatFilter === "All" || entry.seat === aeSeatFilter) &&
          (aeSearch.trim().length === 0 ||
            entry.base.toLowerCase().includes(aeSearch.trim().toLowerCase()) ||
            entry.fleet.toLowerCase().includes(aeSearch.trim().toLowerCase()) ||
            entry.awardCategory.toLowerCase().includes(aeSearch.trim().toLowerCase()))
      ),
    [selectedAeBaseFilter, selectedAeFleetFilter, aeSeatFilter, aeSearch]
  );

  const systemTotalPilots = deltaSnapshot.pilotDirectory.length;
  const systemPercent = currentPilot
    ? Math.round((currentPilot.seniorityNumber / Math.max(systemTotalPilots, 1)) * 100)
    : null;
  const currentCategorySummary = currentPilot
    ? deltaSnapshot.categories.find((entry) => entry.key === currentPilot.currentCategoryKey) ?? null
    : null;
  const currentCategoryPercent =
    currentPilot?.currentCategoryRank && currentPilot?.currentCategoryTotal
      ? Math.round((currentPilot.currentCategoryRank / currentPilot.currentCategoryTotal) * 100)
      : null;
  const currentCategoryTrend = currentPilot
    ? deltaSnapshot.categoryTrends.find((entry) => entry.key === currentPilot.currentCategoryKey) ?? null
    : null;
  const projectedCategoryTotal =
    currentPilot?.currentCategoryTotal && currentCategoryTrend?.pilotCountDelta != null
      ? Math.max(1, currentPilot.currentCategoryTotal + currentCategoryTrend.pilotCountDelta)
      : currentPilot?.currentCategoryTotal ?? null;
  const projectedCategoryRank =
    currentPilot?.currentCategoryRank && currentPilot?.currentCategoryTotal && projectedCategoryTotal
      ? Math.max(
          1,
          Math.round(
            (currentPilot.currentCategoryRank / currentPilot.currentCategoryTotal) *
              projectedCategoryTotal
          )
        )
      : null;
  const projectedCategoryPercent =
    projectedCategoryRank && projectedCategoryTotal
      ? Math.round((projectedCategoryRank / projectedCategoryTotal) * 100)
      : null;
  const payEstimate = currentPilot
    ? buildPayEstimate(
        currentPilot,
        selectedPayScenarioCode ||
          derivePilotPayScenarioCode(currentPilot) ||
          payScenarioOptions[0]?.code ||
          "",
        monthlyCreditHours
      )
    : buildPayEstimate(
        null,
        selectedPayScenarioCode || payScenarioOptions[0]?.code || "",
        monthlyCreditHours
      );
  const activePayScenario =
    resolvePayScenario(selectedPayScenarioCode) ??
    (currentPilot ? resolvePayScenario(derivePilotPayScenarioCode(currentPilot) ?? "") : null) ??
    payScenarioOptions[0] ??
    null;
  const preferredCurrentCategoryCode =
    currentPilot?.currentCategoryCode || mobilePreferences.currentCategory || "";
  const preferredCurrentCategoryKey =
    buildCategoryKeyFromCategoryCode(preferredCurrentCategoryCode) ||
    currentPilot?.currentCategoryKey ||
    null;
  const preferredHomeBase =
    mobilePreferences.homeBase || currentPilot?.currentCategoryCode?.slice(0, 3) || "";
  const relevantBases = useMemo(() => {
    const basesToUse = [
      preferredHomeBase,
      ...(mobilePreferences.commute ? mobilePreferences.commuterBases : []),
    ].filter(Boolean);
    return Array.from(new Set(basesToUse));
  }, [preferredHomeBase, mobilePreferences.commute, mobilePreferences.commuterBases]);
  const goalCategoryKeys = useMemo(
    () =>
      mobilePreferences.goalCategories
        .map((goal) => normalizeCategoryPreference(goal))
        .filter(Boolean) as string[],
    [mobilePreferences.goalCategories]
  );
  const preferredCurrentCategoryEntry =
    deltaSnapshot.categories.find((entry) => entry.key === preferredCurrentCategoryKey) ?? null;
  const preferredCurrentAeEntry =
    deltaSnapshot.aeOpportunities.find(
      (entry) => entry.awardCategory === buildAwardCategoryFromCategoryCode(preferredCurrentCategoryCode)
    ) ?? null;
  const preferredCurrentAeTrend =
    (deltaSnapshot.aeTrends as readonly AeTrendEntry[]).find(
      (entry) => entry.awardCategory === buildAwardCategoryFromCategoryCode(preferredCurrentCategoryCode)
    ) ?? null;
  const preferredCurrentAeReach = preferredCurrentAeEntry
    ? evaluateAeReach(preferredCurrentAeEntry, userSeniorityNumber)
    : null;
  const preferredCurrentAeMovement =
    preferredCurrentAeEntry ? aeMovementByCategory.get(preferredCurrentAeEntry.awardCategory) ?? null : null;
  const mobileRelevantHoldEntries = useMemo(
    () => {
      try {
        return buildRelevantHoldEntries({
          entries: deltaSnapshot.categories,
          currentPilot,
          userSeniorityNumber,
          currentCategoryKey,
          relevantBases,
          priority: mobilePreferences.priority,
          goalCategoryKeys,
          categoryAssignmentsByKey,
        });
      } catch {
        return [];
      }
    },
    [
      currentPilot,
      userSeniorityNumber,
      currentCategoryKey,
      relevantBases,
      mobilePreferences.priority,
      goalCategoryKeys,
      categoryAssignmentsByKey,
    ]
  );
  const mobileMovementFeed = useMemo(
    () => {
      try {
        return buildMobileMovementFeed({
          aeEntries: deltaSnapshot.aeOpportunities,
          aeTrends: deltaSnapshot.aeTrends as readonly AeTrendEntry[],
          categoryTrends: deltaSnapshot.categoryTrends,
          userSeniorityNumber,
          relevantBases,
          priority: mobilePreferences.priority,
          goalCategoryKeys,
        });
      } catch {
        return [];
      }
    },
    [
      userSeniorityNumber,
      relevantBases,
      mobilePreferences.priority,
      goalCategoryKeys,
    ]
  );
  const mobileCareerMilestones = useMemo(
    () => {
      try {
        return buildCareerMilestones({
          currentPilot,
          categories: deltaSnapshot.categories,
          pilots: deltaSnapshot.pilotDirectory as readonly PilotRecord[],
          relevantBases,
          priority: mobilePreferences.priority,
          goalCategoryKeys,
        });
      } catch {
        return [];
      }
    },
    [currentPilot, relevantBases, mobilePreferences.priority, goalCategoryKeys]
  );
  const mobileFilteredCategoryEntries = useMemo(
    () => {
      try {
        return buildMobileCategoryCards({
          entries: deltaSnapshot.categories,
          currentPilot,
          userSeniorityNumber,
          currentCategoryKey,
          relevantBases,
          goalCategoryKeys,
          filter: mobileCategoryFilter,
          categoryAssignmentsByKey,
        });
      } catch {
        return [];
      }
    },
    [
      currentPilot,
      userSeniorityNumber,
      currentCategoryKey,
      relevantBases,
      goalCategoryKeys,
      mobileCategoryFilter,
      categoryAssignmentsByKey,
    ]
  );
  const trackedCategoryEntries = useMemo(
    () => {
      try {
        return goalCategoryKeys
          .map((goalKey) => deltaSnapshot.categories.find((entry) => entry.key === goalKey) ?? null)
          .filter(Boolean)
          .map((entry) =>
            buildMobileCategoryCardDatum(
              entry as CategoryEntry,
              currentPilot,
              userSeniorityNumber,
              currentCategoryKey,
              goalCategoryKeys,
              categoryAssignmentsByKey
            )
          );
      } catch {
        return [];
      }
    },
    [
      goalCategoryKeys,
      currentPilot,
      userSeniorityNumber,
      currentCategoryKey,
      categoryAssignmentsByKey,
    ]
  );
  const mobilePreferencesComplete = Boolean(currentPilot);
  const selectedCategoryEntry =
    selectedCategoryDetail
      ? deltaSnapshot.categories.find((entry) => entry.key === selectedCategoryDetail.categoryKey) ?? null
      : null;
  const selectedCategoryFit =
    selectedCategoryEntry ? evaluateCategoryHold(selectedCategoryEntry, userSeniorityNumber, currentCategoryKey) : null;
  const selectedCategoryTrend =
    selectedCategoryEntry ? categoryTrendMap.get(selectedCategoryEntry.key) ?? null : null;
  const selectedAeEntry =
    selectedAeDetailCategory
      ? deltaSnapshot.aeOpportunities.find(
          (entry) =>
            entry.awardCategory === selectedAeDetailCategory.awardCategory &&
            entry.seat === selectedAeDetailCategory.seat
        ) ?? null
      : null;
  const selectedAeFit = selectedAeEntry ? evaluateAeReach(selectedAeEntry, userSeniorityNumber) : null;
  const selectedAeTrend =
    selectedAeDetailCategory
      ? (deltaSnapshot.aeTrends as readonly AeTrendEntry[]).find(
          (entry) =>
            entry.awardCategory === selectedAeDetailCategory.awardCategory &&
            entry.seat === selectedAeDetailCategory.seat
        ) ?? null
      : null;

  const parsedTimecard = useMemo(() => parseDeltaTimecard(timecardRawInput), [timecardRawInput]);
  const parsedPremiumPayEquivalent = useMemo(() => {
    if (!parsedTimecard) {
      return 0;
    }
    return parsedTimecard.premiumHoursTotal * (Number(hourlyRate) || 0) * 2;
  }, [parsedTimecard, hourlyRate]);
  const parsedPremiumType = useMemo<(typeof premiumTypeOptions)[number]["key"]>(() => {
    if (!parsedTimecard || parsedTimecard.premiumHoursTotal <= 0) {
      return "none";
    }
    if (parseTimeValue(parsedTimecard.reserveAssignGqSlipPay) > 0) {
      return "inverse-assignment";
    }
    if (parseTimeValue(parsedTimecard.quickSlipPay) > 0) {
      return "quick-slip";
    }
    if (parseTimeValue(parsedTimecard.silverSlipPay) > 0) {
      return "silver-slip";
    }
    if (parseTimeValue(parsedTimecard.gsSlipPay) > 0) {
      return "green-slip";
    }
    return "none";
  }, [parsedTimecard]);
  const parsedTotalCreditHours = parsedTimecard ? parseTimeValue(parsedTimecard.totalCredit) : 0;
  const parsedVacationCreditHours = parsedTimecard ? parseTimeValue(parsedTimecard.vacationCreditUsed) : 0;
  const parsedAdditionalPayOnlyHours = parsedTimecard
    ? parseTimeValue(parsedTimecard.additionalPayOnlyTotal)
    : 0;
  const parsedApplicableBaseCreditHours = parsedTimecard
    ? parseTimeValue(parsedTimecard.creditApplicableToRegGs)
    : 0;
  const parsedDerivedBaseBeforeVacationHours =
    parsedApplicableBaseCreditHours > 0 && parsedVacationCreditHours > 0
      ? Math.max(0, parsedApplicableBaseCreditHours - parsedVacationCreditHours)
      : parsedTotalCreditHours;
  const parsedBasePayEquivalent = useMemo(() => {
    const baseCreditHours =
      parsedApplicableBaseCreditHours ||
      parsedTotalCreditHours + parsedVacationCreditHours;
    return baseCreditHours * (Number(hourlyRate) || 0);
  }, [parsedApplicableBaseCreditHours, parsedTotalCreditHours, parsedVacationCreditHours, hourlyRate]);
  const hasPostedBaseContext =
    (Number(actualBasePay) || 0) > 0 ||
    parsedTotalCreditHours > 0 ||
    (Number(actualPostedTotal) || 0) > 0;
  const effectiveActualPremiumPay =
    (Number(actualPremiumPay) || 0) > 0 ? Number(actualPremiumPay) || 0 : parsedPremiumPayEquivalent;
  const displayedDueCreditHours =
    parsedApplicableBaseCreditHours ||
    parsedTotalCreditHours + parsedVacationCreditHours ||
    Number(creditedHours) ||
    0;
  const displayedPremiumCreditHours = parsedTimecard?.premiumHoursTotal || Number(premiumHours) || 0;
  const displayedTotalCreditHours =
    displayedDueCreditHours + displayedPremiumCreditHours + parsedAdditionalPayOnlyHours;
  const effectiveActualBasePay =
    (Number(actualBasePay) || 0) > 0 ? Number(actualBasePay) || 0 : parsedBasePayEquivalent;
  const effectiveActualPostedTotal =
    (Number(actualPostedTotal) || 0) > 0
      ? Number(actualPostedTotal) || 0
      : hasPostedBaseContext
        ? effectiveActualBasePay +
          effectiveActualPremiumPay +
          (Number(actualPerDiem) || 0) +
          (Number(actualAdjustments) || 0)
        : 0;

  useEffect(() => {
    if (!parsedTimecard?.scheduleStatus) {
      return;
    }
    setReserveStatus(parsedTimecard.scheduleStatus === "reserve");
  }, [parsedTimecard?.scheduleStatus]);

  useEffect(() => {
    setTimecardAuditRequested(false);
    setCreditedHours("0");
    setActualBasePay("0");
    setActualPremiumPay("0");
    setActualPerDiem("0");
    setActualAdjustments("0");
    setActualPostedTotal("0");
    setPremiumHours("0");
    setPremiumType("none");
  }, [timecardRawInput]);

  const payAuditContext = useMemo(
    () =>
      buildPayAuditContext({
        base: currentPilot?.currentCategoryCode?.slice(0, 3) ?? "ATL",
        fleet: activePayScenario?.code.replace(/[AB]$/, "") ?? "320",
        seat: activePayScenario?.seat === "Captain" ? "CA" : "FO",
        longevityYear: currentPilot ? derivePayYear(currentPilot.pilotHireDate) : 1,
        reserveStatus,
        month: "2026-04",
      }),
    [currentPilot, activePayScenario, reserveStatus]
  );

  const payAuditResult = useMemo(
    () =>
      buildPayAuditResult(payAuditContext, {
        hourlyRate: Number(hourlyRate) || 0,
        creditedHours: Number(creditedHours) || 0,
        premiumHours: Number(premiumHours) || 0,
        premiumType,
        tafbHours: parseAuditHoursInput(perDiemHours),
        missedBreakPay: Number(missedBreakPay) || 0,
        actualBasePay: effectiveActualBasePay,
        actualPremiumPay: effectiveActualPremiumPay,
        actualPerDiem: Number(actualPerDiem) || 0,
        actualAdjustments: Number(actualAdjustments) || 0,
        actualPostedTotal: effectiveActualPostedTotal,
      }),
    [
      payAuditContext,
      hourlyRate,
      creditedHours,
      premiumHours,
      premiumType,
      perDiemHours,
      missedBreakPay,
      actualBasePay,
      effectiveActualBasePay,
      actualPremiumPay,
      effectiveActualPremiumPay,
      actualPerDiem,
      actualAdjustments,
      actualPostedTotal,
      effectiveActualPostedTotal,
    ]
  );

  const jumpToAeWhatIfPlanner = () => {
    setActiveTab("ae");
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, whatIfSectionY - 110),
        animated: true,
      });
    }, 80);
  };

  return (
    <AppErrorBoundary>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: flieger.background }]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.container,
          isCompactMobile && styles.containerCompact,
          { backgroundColor: flieger.background },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!(isCompactMobile && activeTab === "today" && displayedRotationDashboard) ? (
          <View
            style={[
              styles.hero,
              isCompactMobile && styles.heroCompact,
              {
                backgroundColor: flieger.surface,
                borderWidth: 2,
                borderColor: flieger.borderStrong,
                borderRadius: 16,
              },
            ]}
          >
            <View style={{ alignItems: "center", gap: isCompactMobile ? 8 : 12 }}>
              <FliegerMarker color={flieger.textPrimary} dotSize={7} triangleWidth={14} triangleHeight={12} />
              <Text
                style={[
                  styles.title,
                  isCompactMobile && styles.titleCompact,
                  {
                    color: flieger.textPrimary,
                    fontFamily: fliegerTypography.familyDisplay,
                    letterSpacing: fliegerTypography.letterSpacingWordmark,
                  },
                ]}
              >
                FLIGHTCREWTOOLS
              </Text>
            <Text
              style={[
                  styles.subtitle,
                  isCompactMobile && styles.subtitleCompact,
                  {
                    color: flieger.label,
                    textAlign: "center",
                    fontFamily: fliegerTypography.familyLabel,
                    letterSpacing: fliegerTypography.letterSpacingWide,
                  },
                ]}
            >
                DATA. DECISION. ACTION.
            </Text>
            </View>
          </View>
        ) : null}

        {activeTab === "today" && (
          displayedRotationDashboard ? (() => {
            const rotationDashboard = displayedRotationDashboard;
            const timelineItems = buildTodayTimelineItems(rotationDashboard);
            const mobileTimelineItems = timelineItems.slice(0, isCompactMobile ? 5 : 7);
            const timelineHasLayoverActions = mobileTimelineItems.some((item) => {
              if (item.type !== "layover") {
                return false;
              }
              const detail = getTimelineLayoverDetail(rotationDashboard, item.city);
              return Boolean(
                detail?.hotelPhone ||
                getLayoverDisplayTransportPhone(detail) ||
                detail?.transportType === "skyhop" ||
                detail?.hotelName,
              );
            });
            const firstTimelineLeg = rotationDashboard.legs[0];
            const firstTimelineDeadheadIdentity = firstTimelineLeg?.isDeadhead
              ? getTripBriefIdentityFromLeg(firstTimelineLeg)
              : null;
            const compactWhatMatters = [
              ...(firstTimelineLeg?.isDeadhead
                ? [{
                    label: "DH FIRST",
                    tone: "watch" as const,
                    detail: `${firstTimelineLeg.origin}-${firstTimelineLeg.destination} ${formatLegFlightDisplay(firstTimelineLeg)}${firstTimelineLeg.departureTime ? ` departs ${firstTimelineLeg.departureTime}.` : "."}${firstTimelineLeg.confirmationNumber ? ` PNR ${firstTimelineLeg.confirmationNumber}.` : " Confirmation not found. Add MiCrew DH card for check-in actions."}`,
                    actionCopyValue: firstTimelineLeg.confirmationNumber,
                    secondaryActionLabel: firstTimelineLeg.confirmationNumber ? "Check in" : undefined,
                    secondaryActionUrl: firstTimelineLeg.confirmationNumber ? DELTA_CHECK_IN_URL : undefined,
                    eventIdentity: firstTimelineDeadheadIdentity ?? undefined,
                  }]
                : []),
              ...rotationDashboard.whatMatters
                .filter((item) => item.label !== "FAR 117 watch")
                .map((item) => ({
                  ...item,
                  label:
                    item.label === "DEADHEAD" &&
                    firstTimelineDeadheadIdentity &&
                    isSameTripBriefIdentity(getTripBriefIdentityFromItem(item), firstTimelineDeadheadIdentity)
                      ? "DH FIRST"
                      : item.label,
                  eventIdentity: getTripBriefIdentityFromItem(item),
                }))
                .filter((item, index, items) => {
                  if (!item.eventIdentity) return true;
                  return items.findIndex((candidate) => isSameTripBriefIdentity(candidate.eventIdentity, item.eventIdentity)) === index;
                }),
              ...rotationDashboard.legs
                .filter((leg) => isReturnToGateLeg(leg))
                .map((leg) => ({
                  label: "RTG",
                  tone: "watch" as const,
                  detail: `Return-to-gate segment: ${leg.origin}-${leg.destination} on ${formatLegFlightDisplay(leg)} from ${leg.departureTime ?? "TBD"} to ${leg.arrivalTime ?? "TBD"}.`,
                  eventIdentity: getTripBriefIdentityFromLeg(leg, "RTG"),
                })),
            ];
            const tripBriefItems = (compactWhatMatters.length > 0
              ? compactWhatMatters
              : [{ label: "No major issues found", tone: "good" as const, detail: "No major issues found" }]
            )
              .filter((item, index, items) => {
                const eventIdentity = "eventIdentity" in item ? item.eventIdentity : undefined;
                if (!eventIdentity) return true;
                return items.findIndex((candidate) => isSameTripBriefIdentity(("eventIdentity" in candidate ? candidate.eventIdentity : undefined), eventIdentity)) === index;
              })
              .filter((item) => item.detail || item.actionCopyValue || item.secondaryActionUrl || item.label)
              .sort((left, right) => getTripBriefPriority(left) - getTripBriefPriority(right));
            return (
            <SectionCard
              title="Trip Board"
              description={
                isCompactMobile
                  ? "Compact trip-first board with your summary, timeline, and quick actions."
                  : "Compact trip-first board with your rotation summary, timeline, and quick actions."
              }
              hideHeader={isCompactMobile}
            >
              <View style={styles.sectionStack}>
                {isCompactMobile ? (
                  <View style={styles.tripBoardMobileAppBar}>
                    <View style={styles.tripBoardMobileAppBarBrand}>
                      <FliegerMarker color={flieger.textPrimary} dotSize={5} triangleWidth={10} triangleHeight={8} />
                      <Text style={styles.tripBoardMobileAppBarTitle}>FLIGHTCREWTOOLS</Text>
                    </View>
                    {dashboardSourceNote ? (
                      <Text style={styles.tripBoardMobileAppBarMeta}>{dashboardSourceNote}</Text>
                    ) : null}
                  </View>
                ) : null}
                {rotationDebugEnabled && rotationScreenshotParseResult?.debug ? (() => {
                  const liveChainInputSources = getLiveChainInputSources(
                    rotationScreenshotParseResult as RotationScreenshotParseResponse & {
                      debug: NonNullable<RotationScreenshotParseResponse["debug"]>;
                    },
                  );
                  return (
                    <View style={styles.resultPanel}>
                      <Text style={styles.inputLabel}>LIVE_CHAIN_INPUT_DEBUG</Text>
                      <Text style={styles.resultSupportMetaText}>
                        Selected builder candidate pool: {liveChainInputSources.selectedSourceName}
                      </Text>
                      {liveChainInputSources.sourceSummaries.map((source) => (
                        <View key={source.name} style={styles.resultPanelSubtle}>
                          <Text style={styles.resultSupportMetaText}>
                            {source.name}: count={source.count}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            {source.count < 25
                              ? source.cityPairs.join(" | ") || "none"
                              : source.cityPairs.slice(0, 5).join(" | ") || "none"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })() : null}
                <View
                  style={[
                    styles.resultPanel,
                    styles.tripBoardSummaryPanel,
                    isCompactMobile && styles.resultPanelCompact,
                    isCompactMobile && styles.tripBoardSummaryPanelCompact,
                  ]}
                >
                  {!isCompactMobile ? <Text style={styles.inputLabel}>Rotation snapshot</Text> : null}
                  {rotationDashboard.parsedRotation.isPartial ? (
                    <View style={styles.resultPanel}>
                      <Text style={[styles.statusBadge, styles.statusBadgeCaution]}>Partial rotation detected</Text>
                      <Text style={styles.resultBodyText}>
                        {rotationDashboard.parsedRotation.partialReason ??
                          "We found visible legs from your screenshot or pasted trip, but earlier or later parts of the trip may be missing."}
                      </Text>
                      <Text style={styles.resultSupportMetaText}>
                        Visible legs: {rotationDashboard.parsedRotation.visibleLegCount} • Source: {rotationDashboard.parsedRotation.sourceTypes}
                      </Text>
                      {rotationDashboard.parsedRotation.missingSections.map((item) => (
                        <Text key={item} style={styles.resultSupportMetaText}>• Missing: {item}</Text>
                      ))}
                      <View style={styles.quickActionGrid}>
                        <TouchableOpacity style={styles.quickActionButton} onPress={pickRotationEvidence}>
                          <Text style={styles.quickActionButtonText}>Add more screenshots</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickActionButton} onPress={() => setActiveTab("today")}>
                          <Text style={styles.quickActionButtonText}>Paste full rotation text</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                  {rotationDebugEnabled && rotationScreenshotParseResult ? (
                    <View style={styles.resultPanel}>
                      <Text style={styles.inputLabel}>Screenshot parser</Text>
                      <Text style={styles.resultSupportMetaText}>
                        Confidence:{" "}
                        {rotationScreenshotParseResult.ok ? rotationScreenshotParseResult.confidence : "low"} • Missing sections:{" "}
                        {rotationScreenshotParseResult.missingSections.length > 0
                          ? rotationScreenshotParseResult.missingSections.join(", ")
                          : "None"}
                      </Text>
                      <Text style={styles.resultSupportMetaText}>
                        Warnings:{" "}
                        {rotationScreenshotParseResult.warnings.length > 0
                          ? rotationScreenshotParseResult.warnings.join(" | ")
                          : "None"}
                      </Text>
                      {rotationScreenshotParseResult.ok ? (
                        <Text style={styles.resultSupportMetaText}>
                          Normalized text: {rotationScreenshotParseResult.normalizedText.slice(0, 1200) || "None"}
                        </Text>
                      ) : (
                        <Text style={styles.resultSupportMetaText}>
                          Parser error: {rotationScreenshotParseResult.error}
                        </Text>
                      )}
                      {rotationDashboard ? (
                        <>
                          <Text style={styles.resultSupportMetaText}>
                            Source format: {rotationDashboard.parsedRotation.sourceFormat} • Parser path:{" "}
                            {rotationDashboard.parsedRotation.parserPath}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Row format: {rotationDashboard.parsedRotation.rowFormat}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            MiCrew legs: {rotationDashboard.parsedRotation.micrewLegsParsed} • iCrew rows:{" "}
                            {rotationDashboard.parsedRotation.icrewRowsParsed}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Deadhead legs: {rotationDashboard.parsedRotation.legs.filter((leg) => leg.isDeadhead).length}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Rejected candidate rows: {rotationDashboard.parsedRotation.rejectedCandidateRows.length}
                          </Text>
                          {rotationDashboard.parsedRotation.parserWarnings.length > 0 ? (
                            <Text style={styles.resultSupportMetaText}>
                              Parser warnings: {rotationDashboard.parsedRotation.parserWarnings.join(" | ").slice(0, 1200)}
                            </Text>
                          ) : null}
                          <Text style={styles.resultSupportMetaText}>
                            Leg deadhead debug:{" "}
                            {rotationDashboard.parsedRotation.legs
                              .map(
                                (leg) =>
                                  `${leg.flightNumber ?? "TBD"}=${leg.isDeadhead ? "deadhead" : "operating"}(${leg.deadheadSource ?? "unknown"})`,
                              )
                              .join(" | ")
                              .slice(0, 1400)}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                  {isCompactMobile ? (
                    <View style={styles.tripBoardSummaryStrip}>
                      <View style={styles.tripBoardSummaryStripRow}>
                        <Text style={styles.tripBoardSummaryStripRotation}>ROT {rotationDashboard.snapshot.rotationNumber}</Text>
                        <Text style={styles.tripBoardSummaryStripDates}>{rotationDashboard.snapshot.tripDates}</Text>
                      </View>
                      <View style={styles.tripBoardSummaryStripChipRow}>
                        <View style={[styles.tripBoardSummaryInlineChip, styles.tripBoardSummaryInlineChipPrimary]}>
                          <Text style={styles.tripBoardSummaryInlineChipLabel}>Credit</Text>
                          <Text style={styles.tripBoardSummaryInlineChipValue}>
                            {rotationDashboard.parsedRotation.missingSections.includes("total credit")
                              ? "Needs full"
                              : rotationFormatMinutes(rotationDashboard.snapshot.totalCreditMinutes)}
                          </Text>
                        </View>
                        <View style={[styles.tripBoardSummaryInlineChip, styles.tripBoardSummaryInlineChipPrimary]}>
                          <Text style={styles.tripBoardSummaryInlineChipLabel}>Op block</Text>
                          <Text style={styles.tripBoardSummaryInlineChipValue}>
                            {rotationDashboard.parsedRotation.missingSections.includes("total scheduled block")
                              ? "Needs full"
                              : rotationFormatMinutes(rotationDashboard.snapshot.scheduledBlockMinutes)}
                          </Text>
                        </View>
                        {rotationDashboard.parsedRotation.deadheadBlock != null &&
                        rotationDashboard.parsedRotation.deadheadBlock > 0 ? (
                          <View style={[styles.tripBoardSummaryInlineChip, styles.tripBoardSummaryInlineChipPrimary]}>
                            <Text style={styles.tripBoardSummaryInlineChipLabel}>DH block</Text>
                            <Text style={styles.tripBoardSummaryInlineChipValue}>
                              {rotationFormatMinutes(rotationDashboard.parsedRotation.deadheadBlock)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.tripBoardSummaryStripChipRow}>
                        <View style={styles.tripBoardSummaryInlineChipMini}>
                          <Text style={styles.tripBoardSummaryInlineChipMiniLabel}>Op</Text>
                          <Text style={styles.tripBoardSummaryInlineChipMiniValue}>
                            {rotationDashboard.parsedRotation.legs.filter((leg) => !leg.isDeadhead).length}
                          </Text>
                        </View>
                        {((rotationDashboard.parsedRotation.deadheadAnnotations?.length ?? 0) > 0 ||
                          rotationDashboard.parsedRotation.legs.some((leg) => leg.isDeadhead)) ? (
                          <View style={styles.tripBoardSummaryInlineChipMini}>
                            <Text style={styles.tripBoardSummaryInlineChipMiniLabel}>DH</Text>
                            <Text style={styles.tripBoardSummaryInlineChipMiniValue}>
                              {(rotationDashboard.parsedRotation.deadheadAnnotations?.length ?? 0) ||
                                rotationDashboard.parsedRotation.legs.filter((leg) => leg.isDeadhead).length}
                            </Text>
                          </View>
                        ) : null}
                        <View style={[styles.tripBoardSummaryInlineChipMini, styles.tripBoardSummaryInlineChipMiniWide]}>
                          <Text style={styles.tripBoardSummaryInlineChipMiniLabel}>Layover</Text>
                          <Text style={styles.tripBoardSummaryInlineChipMiniValue}>
                            {rotationDashboard.snapshot.layoverCities.join(", ") || "TBD"}
                          </Text>
                        </View>
                        <View style={styles.tripBoardSummaryInlineChipMini}>
                          <Text style={styles.tripBoardSummaryInlineChipMiniLabel}>Final</Text>
                          <Text style={styles.tripBoardSummaryInlineChipMiniValue}>
                            {rotationDashboard.parsedRotation.finalArrivalAfterDh ?? rotationDashboard.snapshot.finalArrival}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={[styles.tripBoardSummaryHeader, isCompactMobile && styles.tripBoardSummaryHeaderCompact]}>
                        <View style={styles.tripBoardSummaryHeaderMain}>
                          <Text style={[styles.tripBoardSummaryRotation, isCompactMobile && styles.tripBoardSummaryRotationCompact]}>
                            ROT {rotationDashboard.snapshot.rotationNumber}
                          </Text>
                          <Text style={[styles.tripBoardSummaryDates, isCompactMobile && styles.tripBoardSummaryDatesCompact]}>
                            {rotationDashboard.snapshot.tripDates}
                          </Text>
                        </View>
                        {dashboardSourceNote ? (
                          <Text style={[styles.tripBoardSummarySource, isCompactMobile && styles.tripBoardSummarySourceCompact]}>
                            {dashboardSourceNote}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.tripBoardSummaryGrid, isCompactMobile && styles.tripBoardSummaryGridCompact]}>
                        <TripBoardSummaryCell
                          label="Credit"
                          compact={isCompactMobile}
                          value={
                            rotationDashboard.parsedRotation.missingSections.includes("total credit")
                              ? "Needs full rotation"
                              : rotationFormatMinutes(rotationDashboard.snapshot.totalCreditMinutes)
                          }
                        />
                        <TripBoardSummaryCell
                          label="Op block"
                          compact={isCompactMobile}
                          value={
                            rotationDashboard.parsedRotation.missingSections.includes("total scheduled block")
                              ? "Needs full rotation"
                              : rotationFormatMinutes(rotationDashboard.snapshot.scheduledBlockMinutes)
                          }
                        />
                        {rotationDashboard.parsedRotation.deadheadBlock != null &&
                        rotationDashboard.parsedRotation.deadheadBlock > 0 ? (
                          <TripBoardSummaryCell
                            label="DH block"
                            compact={isCompactMobile}
                            value={rotationFormatMinutes(rotationDashboard.parsedRotation.deadheadBlock)}
                          />
                        ) : null}
                        <TripBoardSummaryCell
                          label="Op legs"
                          compact={isCompactMobile}
                          mini={isCompactMobile}
                          value={String(rotationDashboard.parsedRotation.legs.filter((leg) => !leg.isDeadhead).length)}
                        />
                        {(rotationDashboard.parsedRotation.deadheadAnnotations?.length ?? 0) > 0 ||
                        rotationDashboard.parsedRotation.legs.some((leg) => leg.isDeadhead) ? (
                          <TripBoardSummaryCell
                            label="DH legs"
                            compact={isCompactMobile}
                            mini={isCompactMobile}
                            value={String(
                              (rotationDashboard.parsedRotation.deadheadAnnotations?.length ?? 0) ||
                                rotationDashboard.parsedRotation.legs.filter((leg) => leg.isDeadhead).length,
                            )}
                          />
                        ) : null}
                        <TripBoardSummaryCell
                          label="Layovers"
                          compact={isCompactMobile}
                          value={rotationDashboard.snapshot.layoverCities.join(", ") || "TBD"}
                          wide
                        />
                        <TripBoardSummaryCell
                          label="Trip final"
                          compact={isCompactMobile}
                          mini={isCompactMobile}
                          value={
                            rotationDashboard.parsedRotation.finalArrivalAfterDh ??
                            rotationDashboard.snapshot.finalArrival
                          }
                        />
                      </View>
                    </>
                  )}
                  {dashboardSourceNote ? (
                    !isCompactMobile ? <Text style={styles.resultSupportMetaText}>{dashboardSourceNote}</Text> : null
                  ) : null}
                  {rotationDashboard.note &&
                  !rotationDebugPreviewDashboard &&
                  !/^Loaded from /i.test(rotationDashboard.note) ? (
                    <Text style={styles.resultSupportMetaText}>{rotationDashboard.note}</Text>
                  ) : null}
                  {rotationDebugEnabled && (rotationScreenshots.length > 0 || rotationScreenshotParseResult) ? (
                    <TouchableOpacity style={styles.quickLinkButton} onPress={copyLiveChainDebugJson}>
                        <Text style={styles.quickLinkButtonText}>
                          {rotationCopiedDebugJson ? "Copied live chain debug JSON" : "Copy live chain debug JSON"}
                        </Text>
                      </TouchableOpacity>
                  ) : null}
                  {rotationDebugEnabled ? (
                    <View style={styles.sectionStack}>
                      <Text style={styles.resultSupportMetaText}>iCrew debug parser</Text>
                      <View style={styles.quickActionGrid}>
                        <TouchableOpacity style={styles.quickLinkButton} onPress={parseRotationICrewDebugText}>
                          <Text style={styles.quickLinkButtonText}>Parse pasted text as iCrew</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.quickLinkButton,
                            !hasICrewDebugParseAttempt ? styles.auditButtonDisabled : null,
                          ]}
                          onPress={copyICrewDebugJson}
                          disabled={!hasICrewDebugParseAttempt}
                        >
                          <Text style={styles.quickLinkButtonText}>
                            {rotationCopiedICrewDebugJson ? "Copied iCrew debug JSON" : "Copy iCrew debug JSON"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {rotationICrewDebugError ? (
                        <Text style={styles.inlineValidationText}>{rotationICrewDebugError}</Text>
                      ) : null}
                      {rotationICrewDebugDiagnostics && !rotationICrewDebugResult ? (
                        <Text style={styles.resultSupportMetaText}>
                          iCrew debug failure: raw lines {rotationICrewDebugDiagnostics.rawLineCount} • header candidates {rotationICrewDebugDiagnostics.headerCandidateLines.length} • totals candidates {rotationICrewDebugDiagnostics.totalsCandidateLines.length} • leg candidates {rotationICrewDebugDiagnostics.legCandidateLines.length} • failed stage {rotationICrewDebugDiagnostics.parserStageFailed ?? "unknown"}
                        </Text>
                      ) : null}
                      {rotationICrewDebugResult ? (
                        <Text style={styles.resultSupportMetaText}>
                          iCrew parsed: Rotation #{rotationICrewDebugResult.header.rotationNumber} · Dates {rotationICrewDebugResult.header.tripDates} · Operating legs {rotationICrewDebugResult.visibleOperatingLegs.length} · DH legs {rotationICrewDebugResult.deadheadAnnotations.length} · Scheduled block {rotationFormatMinutes(rotationICrewDebugResult.operatingScheduledBlockMinutes)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={[styles.resultPanel, isCompactMobile && styles.resultPanelCompact]}>
                  {!isCompactMobile ? <Text style={styles.inputLabel}>Trip timeline</Text> : null}
                  <View style={[styles.tripBoardTimelineStack, isCompactMobile && styles.tripBoardTimelineStackCompact]}>
                    {mobileTimelineItems.map((item, itemIndex) => {
                      const showDateLabel =
                        itemIndex === 0 || mobileTimelineItems[itemIndex - 1]?.dayLabel !== item.dayLabel;
                      const layoverDetail =
                        item.type === "layover"
                          ? getTimelineLayoverDetail(rotationDashboard, item.city)
                          : null;
                      const layoverTransportDisplay = getLayoverTransportDisplay(layoverDetail);
                      const layoverDisplayTransportPhone = getLayoverDisplayTransportPhone(layoverDetail);
                      const layoverActionableTransportPhone = getLayoverActionableTransportPhone(layoverDetail);
                      const layoverTransportPhoneLabel = getLayoverTransportPhoneLabel(layoverDetail);
                      const showSkyHopAction = layoverDetail?.transportType === "skyhop";
                      const showHotelAction = Boolean(layoverDetail?.hotelPhone);
                      const showTransportAction = Boolean(
                        layoverActionableTransportPhone && layoverDetail?.transportType !== "ccar",
                      );
                      const showOpenHotelAction = Boolean(layoverDetail?.hotelName);
                      const layoverRestLabel =
                        layoverDetail?.restMinutes != null
                          ? `Rest ${rotationFormatMinutes(layoverDetail.restMinutes)}`
                          : rotationDashboard.tonightLayoverCity === item.city &&
                              rotationDashboard.scheduledRestMinutes != null
                            ? `Rest ${rotationFormatMinutes(rotationDashboard.scheduledRestMinutes)}`
                            : null;
                      return (
                        <View key={item.key} style={[styles.tripBoardTimelineRow, isCompactMobile && styles.tripBoardTimelineRowCompact]}>
                          <View style={[styles.tripBoardTimelineSpineColumn, isCompactMobile && styles.tripBoardTimelineSpineColumnCompact]}>
                            {showDateLabel ? (
                              <Text style={[styles.tripBoardTimelineDateLabel, isCompactMobile && styles.tripBoardTimelineDateLabelCompact]}>
                                {item.dayLabel}
                              </Text>
                            ) : (
                              <View style={styles.tripBoardTimelineDateSpacer} />
                            )}
                            <View style={styles.tripBoardTimelineSpineTrack}>
                              <View
                                style={[
                                  styles.tripBoardTimelineNode,
                                  isCompactMobile && styles.tripBoardTimelineNodeCompact,
                                  item.type === "layover"
                                    ? styles.tripBoardTimelineNodeLayover
                                    : item.leg.isDeadhead
                                      ? styles.tripBoardTimelineNodeDh
                                      : item.leg.origin === item.leg.destination
                                        ? styles.tripBoardTimelineNodeRtg
                                        : styles.tripBoardTimelineNodeOperating,
                                ]}
                              />
                              {itemIndex < mobileTimelineItems.length - 1 ? (
                                <View style={[styles.tripBoardTimelineSpineLine, isCompactMobile && styles.tripBoardTimelineSpineLineCompact]} />
                              ) : null}
                            </View>
                          </View>
                          {item.type === "layover" ? (
                            <InstrumentPanel
                              variant="decision"
                              tone="green"
                              style={[styles.tripBoardLayoverCard, isCompactMobile && styles.tripBoardLayoverCardCompact]}
                            >
                              <View style={[styles.tripBoardTimelineHeader, isCompactMobile && styles.tripBoardTimelineHeaderCompact]}>
                                <View style={[styles.tripBoardTimelineBadgeRow, isCompactMobile && styles.tripBoardTimelineBadgeRowCompact]}>
                                  <Text style={[styles.statusBadge, styles.statusBadgeResolved, isCompactMobile && styles.statusBadgeCompact]}>LAYOVER</Text>
                                  <Text style={styles.tripBoardTimelineInlineCity}>{item.city}</Text>
                                </View>
                                <Text style={[styles.tripBoardTimelineTime, isCompactMobile && styles.tripBoardTimelineTimeCompact]}>
                                  {layoverRestLabel ?? "Rest TBD"}
                                </Text>
                              </View>
                              <Text style={[styles.tripBoardTimelineCityPair, isCompactMobile && styles.tripBoardTimelineCityPairCompact]}>
                                LAYOVER {item.city}
                              </Text>
                              {layoverDetail?.hotelName ? (
                                <View style={[styles.tripBoardTimelineMetaRow, isCompactMobile && styles.tripBoardTimelineMetaRowCompact]}>
                                  <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                    Hotel: {layoverDetail.hotelName}
                                  </Text>
                                  {layoverDetail.hotelPhone ? (
                                    <TouchableOpacity onPress={() => openRotationExternalUrl(`tel:${layoverDetail.hotelPhone}`)}>
                                      <Text
                                        style={[
                                          styles.tripBoardTimelineMeta,
                                          styles.tripBoardTimelinePhoneLink,
                                          isCompactMobile && styles.tripBoardTimelineMetaCompact,
                                        ]}
                                      >
                                        Phone: {layoverDetail.hotelPhone}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ) : null}
                              {layoverTransportDisplay ? (
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  Transport: {layoverTransportDisplay}
                                </Text>
                              ) : null}
                              {layoverDisplayTransportPhone ? (
                                <View style={[styles.tripBoardTimelineMetaRow, isCompactMobile && styles.tripBoardTimelineMetaRowCompact]}>
                                  <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                    {layoverTransportPhoneLabel}:
                                  </Text>
                                  <TouchableOpacity onPress={() => openRotationExternalUrl(`tel:${layoverDisplayTransportPhone}`)}>
                                    <Text
                                      style={[
                                        styles.tripBoardTimelineMeta,
                                        styles.tripBoardTimelinePhoneLink,
                                        isCompactMobile && styles.tripBoardTimelineMetaCompact,
                                      ]}
                                    >
                                      {layoverDisplayTransportPhone}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                              {showHotelAction || showTransportAction || showSkyHopAction || showOpenHotelAction ? (
                                <View style={styles.tripBoardTimelineActionRow}>
                                  {showHotelAction ? (
                                    <TouchableOpacity
                                      style={[styles.tripBoardTimelineActionButton, styles.tripBoardTimelineActionButtonSecondary]}
                                      onPress={() => openRotationExternalUrl(`tel:${layoverDetail?.hotelPhone}`)}
                                    >
                                      <Text style={styles.tripBoardTimelineActionButtonText}>Call hotel</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                  {showTransportAction ? (
                                    <TouchableOpacity
                                      style={[styles.tripBoardTimelineActionButton, styles.tripBoardTimelineActionButtonSecondary]}
                                      onPress={() => openRotationExternalUrl(`tel:${layoverActionableTransportPhone}`)}
                                    >
                                      <Text style={styles.tripBoardTimelineActionButtonText}>
                                        {layoverDetail?.transportType === "limo" ? "Call limo" : "Call transport"}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                  {showOpenHotelAction ? (
                                    <TouchableOpacity
                                      style={[styles.tripBoardTimelineActionButton, styles.tripBoardTimelineActionButtonSecondary]}
                                      onPress={() => openLayoverHotelMap(layoverDetail)}
                                    >
                                      <Text style={styles.tripBoardTimelineActionButtonText}>Open hotel</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                  {showSkyHopAction ? (
                                    <TouchableOpacity
                                      style={[styles.tripBoardTimelineActionButton, styles.tripBoardTimelineActionButtonSecondary]}
                                      onPress={() => openRotationExternalUrl(SKYHOP_URL)}
                                    >
                                      <Text style={styles.tripBoardTimelineActionButtonText}>Open SkyHop</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ) : null}
                              {layoverDetail?.pickup ? (
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  Pickup: {layoverDetail.pickup}
                                </Text>
                              ) : null}
                              {!layoverDetail?.hotelName &&
                              !layoverDetail?.transport &&
                              !layoverDetail?.transportProvider &&
                              !layoverDetail?.pickup &&
                              !layoverRestLabel ? (
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  Rest TBD
                                </Text>
                              ) : null}
                            </InstrumentPanel>
                          ) : (
                            <InstrumentPanel
                              variant={item.isHighlighted ? "elevated" : "decision"}
                              tone={
                                item.leg.isDeadhead
                                  ? "cyan"
                                  : isReturnToGateLeg(item.leg)
                                    ? "green"
                                    : "green"
                              }
                              style={[
                                styles.tripBoardTimelineCard,
                                isCompactMobile && styles.tripBoardTimelineCardCompact,
                                item.isHighlighted && styles.tripBoardTimelineCardHighlighted,
                                isReturnToGateLeg(item.leg) && styles.tripBoardTimelineCardRtg,
                              ]}
                            >
                              <View style={[styles.tripBoardTimelineHeader, isCompactMobile && styles.tripBoardTimelineHeaderCompact]}>
                                <View style={[styles.tripBoardTimelineBadgeRow, isCompactMobile && styles.tripBoardTimelineBadgeRowCompact]}>
                                  {item.isHighlighted ? (
                                    <Text style={[styles.statusBadge, styles.statusBadgeCaution, isCompactMobile && styles.statusBadgeCompact]}>
                                      NEXT EVENT
                                    </Text>
                                  ) : null}
                                  <Text
                                    style={[
                                      styles.statusBadge,
                                      isCompactMobile && styles.statusBadgeCompact,
                                      item.leg.isDeadhead
                                        ? styles.deadheadBadge
                                        : isReturnToGateLeg(item.leg)
                                          ? styles.statusBadgeRtg
                                          : styles.statusBadgeResolved,
                                    ]}
                                  >
                                    {item.leg.isDeadhead ? "DH" : isReturnToGateLeg(item.leg) ? "RTG" : "OP"}
                                  </Text>
                                </View>
                                <Text style={[styles.tripBoardTimelineTime, isCompactMobile && styles.tripBoardTimelineTimeCompact]}>
                                  {(item.leg.departureTime ?? "TBD")} - {(item.leg.arrivalTime ?? "TBD")}
                                </Text>
                              </View>
                              <Text style={[styles.tripBoardTimelineCityPair, isCompactMobile && styles.tripBoardTimelineCityPairCompact]}>
                                {item.leg.origin} {"->"} {item.leg.destination}
                              </Text>
                              <View style={[styles.tripBoardTimelineMetaRow, isCompactMobile && styles.tripBoardTimelineMetaRowCompact]}>
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  {formatLegFlightDisplay(item.leg)}
                                </Text>
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  {item.leg.isDeadhead ? "DH block" : "Block"} {rotationFormatMinutes(item.leg.scheduledBlockMinutes)}
                                </Text>
                              </View>
                              <View style={[styles.tripBoardTimelineMetaRow, isCompactMobile && styles.tripBoardTimelineMetaRowCompact]}>
                                {!item.leg.isDeadhead && item.leg.turnMinutes != null ? (
                                  <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                    Turn {rotationFormatMinutes(item.leg.turnMinutes)}
                                  </Text>
                                ) : null}
                                {!item.leg.isDeadhead && item.leg.aircraft ? (
                                  <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                    Ship/equip {item.leg.aircraft}
                                  </Text>
                                ) : item.leg.isDeadhead && item.leg.confirmationNumber ? (
                                  <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                    PNR {item.leg.confirmationNumber}
                                  </Text>
                                ) : null}
                              </View>
                              {!item.leg.isDeadhead && item.leg.gate && item.leg.gate !== "TBD" ? (
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  Gate {item.leg.gate}
                                </Text>
                              ) : null}
                              {item.leg.isDeadhead && !item.leg.confirmationNumber ? (
                                <View style={styles.tripBoardTimelineHintStack}>
                                  <Text style={[styles.tripBoardTimelineMeta, styles.tripBoardTimelineMetaMuted, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                    Confirmation not found
                                  </Text>
                                  <Text style={[styles.tripBoardTimelineMeta, styles.tripBoardTimelineMetaMuted, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                    Add MiCrew DH card to enable check-in actions
                                  </Text>
                                </View>
                              ) : null}
                              {item.leg.isDeadhead && item.leg.confirmationNumber ? (
                                <View style={styles.tripBoardTimelineActionRow}>
                                  <TouchableOpacity
                                    style={[
                                      styles.tripBoardTimelineActionButton,
                                      rotationCopiedConfirmation === item.leg.confirmationNumber &&
                                        styles.tripBoardTimelineActionButtonActive,
                                    ]}
                                    onPress={() => copyRotationConfirmationCode(item.leg.confirmationNumber)}
                                  >
                                    <Text style={styles.tripBoardTimelineActionButtonText}>
                                      {rotationCopiedConfirmation === item.leg.confirmationNumber ? "Copied" : "Copy code"}
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.tripBoardTimelineActionButton, styles.tripBoardTimelineActionButtonSecondary]}
                                    onPress={() => openRotationExternalUrl(DELTA_CHECK_IN_URL)}
                                  >
                                    <Text style={styles.tripBoardTimelineActionButtonText}>Check in</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                              {item.leg.origin === item.leg.destination ? (
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  Return-to-gate segment
                                </Text>
                              ) : !item.leg.isDeadhead && !isCompactMobile ? (
                                <Text style={styles.tripBoardTimelineMeta}>Counts toward logbook/export.</Text>
                              ) : null}
                              {item.leg.isDeadhead ? (
                                <Text style={[styles.tripBoardTimelineMeta, isCompactMobile && styles.tripBoardTimelineMetaCompact]}>
                                  Excluded from logbook/export
                                </Text>
                              ) : null}
                            </InstrumentPanel>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View
                  style={[
                    styles.resultPanel,
                    styles.tripBoardAlertsPanel,
                    isCompactMobile && styles.resultPanelCompact,
                    isCompactMobile && styles.tripBoardAlertsPanelCompact,
                  ]}
                >
                  <Text style={styles.inputLabel}>Trip Brief</Text>
                  <View style={styles.tripBriefList}>
                    {tripBriefItems.map((item, index) => (
                      <View key={`${item.label}-${index}`} style={styles.tripBriefRow}>
                        <View style={styles.tripBriefRowMain}>
                          <CompactAlertChip label={item.label} tone={item.tone} />
                          <Text style={styles.tripBriefRowDetail}>{item.detail}</Text>
                        </View>
                        {item.actionCopyValue || item.secondaryActionUrl ? (
                          <View style={styles.tripBoardTimelineActionRow}>
                            {item.actionCopyValue ? (
                              <TouchableOpacity
                                style={[
                                  styles.tripBoardTimelineActionButton,
                                  rotationCopiedConfirmation === item.actionCopyValue &&
                                    styles.tripBoardTimelineActionButtonActive,
                                ]}
                                onPress={() => copyRotationConfirmationCode(item.actionCopyValue)}
                              >
                                <Text style={styles.tripBoardTimelineActionButtonText}>
                                  {rotationCopiedConfirmation === item.actionCopyValue ? "Copied" : "Copy"}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                            {item.secondaryActionUrl ? (
                              <TouchableOpacity
                                style={[styles.tripBoardTimelineActionButton, styles.tripBoardTimelineActionButtonSecondary]}
                                onPress={() => openRotationExternalUrl(item.secondaryActionUrl)}
                              >
                                <Text style={styles.tripBoardTimelineActionButtonText}>
                                  {item.secondaryActionLabel ?? "Check in"}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>

                {!timelineHasLayoverActions ? (
                  <View style={[styles.resultPanel, isCompactMobile && styles.resultPanelCompact]}>
                    <Text style={styles.inputLabel}>Layover support</Text>
                    <View style={[styles.formRow, isCompactMobile && styles.formRowCompact]}>
                      <ResultLine label="First layover" value={rotationDashboard.tonightLayoverCity} />
                      <ResultLine label="Tomorrow report" value={rotationDashboard.tomorrowReportTime ?? "TBD"} />
                    </View>
                    <ResultLine
                      label="Scheduled rest"
                      value={rotationDashboard.scheduledRestMinutes != null ? rotationFormatMinutes(rotationDashboard.scheduledRestMinutes) : "Not found"}
                    />
                    <View style={[styles.quickActionGrid, isCompactMobile && styles.quickActionGridCompact]}>
                      {[
                        { label: quickContacts.van ? "Call van" : "Add van", key: "van" as const },
                        { label: quickContacts.hotel ? "Call hotel" : "Add hotel", key: "hotel" as const },
                        { label: quickContacts.crewScheduling ? "Crew Scheduling" : "Add Crew Scheduling", key: "crewScheduling" as const },
                        { label: quickContacts.dispatch ? "Dispatch" : "Add Dispatch", key: "dispatch" as const },
                      ].map((action) => (
                        <TouchableOpacity
                          key={action.label}
                          style={[styles.quickActionButton, isCompactMobile && styles.quickActionButtonCompact]}
                          onPress={() => handleQuickContactPress(action.key)}
                        >
                          <Text style={[styles.quickActionButtonText, isCompactMobile && styles.quickActionButtonTextCompact]}>
                            {action.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={[styles.resultPanel, isCompactMobile && styles.resultPanelCompact]}>
                  <Text style={styles.inputLabel}>Trip Watch</Text>
                  <Text style={styles.resultBodyText}>
                    Paste a reroute, delay, or reassignment to check pay, 117, and contract impact.
                  </Text>
                  <View style={[styles.quickActionGrid, isCompactMobile && styles.quickActionGridCompact]}>
                    {[
                      { label: "Analyze reroute", onPress: openRerouteCalculatorFromRotation },
                      { label: "Check pay impact", onPress: openPayImpactFromRotation },
                      { label: "Ask contract question", onPress: openContractCopilotFromRotation },
                      { label: "Check 117", onPress: openFar117FromRotation },
                    ].map((action) => (
                      <TouchableOpacity
                        key={action.label}
                        style={[styles.quickActionButton, isCompactMobile && styles.quickActionButtonCompact]}
                        onPress={action.onPress}
                      >
                        <Text style={[styles.quickActionButtonText, isCompactMobile && styles.quickActionButtonTextCompact]}>
                          {action.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[styles.quickActionGrid, isCompactMobile && styles.quickActionGridCompact]}>
                    {[
                      { label: quickContacts.crewScheduling ? "Crew Scheduling" : "Add Crew Scheduling", key: "crewScheduling" as const },
                      { label: quickContacts.dispatch ? "Dispatch" : "Add Dispatch", key: "dispatch" as const },
                    ].map((action) => (
                      <TouchableOpacity
                        key={action.label}
                        style={[styles.quickActionButton, isCompactMobile && styles.quickActionButtonCompact]}
                        onPress={() => handleQuickContactPress(action.key)}
                      >
                        <Text style={[styles.quickActionButtonText, isCompactMobile && styles.quickActionButtonTextCompact]}>
                          {action.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </SectionCard>
            );
          })() : (
            <SectionCard
              title="Rotation Companion"
              description="Parse MiCrew / iCrew details into your live rotation."
              hideHeader
            >
              <View style={styles.sectionStack}>
                <View style={styles.rotationIntakeAppBar}>
                  <View style={styles.rotationIntakeAppBarBrand}>
                    <FliegerMarker color={flieger.textPrimary} dotSize={isCompactMobile ? 5 : 6} triangleWidth={isCompactMobile ? 10 : 12} triangleHeight={isCompactMobile ? 8 : 10} />
                    <Text style={styles.rotationIntakeAppBarTitle}>FLIGHTCREWTOOLS</Text>
                  </View>
                  <View style={styles.rotationIntakeAppBarModePill}>
                    <Text style={styles.rotationIntakeAppBarModeText}>MiCrew / iCrew</Text>
                  </View>
                </View>

                <View style={[styles.resultPanel, styles.rotationIntakeIntroPanel, isCompactMobile && styles.resultPanelCompact]}>
                  <Text style={styles.rotationIntakeTitle}>Rotation Companion</Text>
                  <Text style={styles.rotationIntakeSubtitle}>Parse MiCrew / iCrew details into your live rotation.</Text>
                </View>

                <View style={[styles.resultPanel, styles.rotationIntakePanel, isCompactMobile && styles.resultPanelCompact]}>
                  <Text style={styles.inputLabel}>Paste rotation</Text>
                  <TextInput
                    multiline
                    value={rotationPasteInput}
                    onChangeText={(value) => {
                      setRotationPasteInput(value);
                      setRotationICrewDebugError("");
                      setRotationCopiedICrewDebugJson(false);
                      setRotationICrewDebugDiagnostics(null);
                    }}
                    placeholder="Paste MiCrew / iCrew rotation rows, block lines, layovers, report / release times, and credit."
                    placeholderTextColor={flieger.label}
                    style={styles.rotationIntakeTextarea}
                    autoCapitalize="characters"
                  />
                  <Text style={styles.resultSupportMetaText}>
                    Paste full MiCrew / iCrew text or attach screenshots.
                  </Text>

                  <View style={styles.rotationIntakeButtonStack}>
                    <TouchableOpacity
                      style={[styles.rotationIntakePrimaryButton, rotationAnalyzeBusy && styles.auditButtonDisabled]}
                      disabled={rotationAnalyzeBusy}
                      onPress={analyzeRotationCompanion}
                    >
                      <Text style={styles.rotationIntakePrimaryButtonText}>
                        {rotationAnalyzeBusy ? "Analyzing..." : "Analyze Rotation"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.rotationIntakeSecondaryButton} onPress={pickRotationEvidence}>
                      <Text style={styles.rotationIntakeSecondaryButtonText}>Attach MiCrew screenshots</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.rotationIntakeSecondaryButton} onPress={useSampleRotation}>
                      <Text style={styles.rotationIntakeSecondaryButtonText}>Use sample rotation</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.rotationIntakeGhostButton} onPress={clearRotationCompanion}>
                      <Text style={styles.rotationIntakeGhostButtonText}>Clear</Text>
                    </TouchableOpacity>
                  </View>

                  {rotationAnalyzeBusy && rotationScreenshots.length > 0 ? (
                    <Text style={styles.resultSupportMetaText}>Reading screenshots...</Text>
                  ) : null}

                  {rotationDebugEnabled ? (
                    <View style={styles.sectionStack}>
                      <Text style={styles.resultSupportMetaText}>iCrew debug parser</Text>
                      <Text style={styles.resultSupportMetaText}>
                        These buttons use the same Paste rotation textarea above. They bypass the legacy Analyze Rotation text path.
                      </Text>
                      <View style={styles.quickActionGrid}>
                        <TouchableOpacity style={styles.quickLinkButton} onPress={parseRotationICrewDebugText}>
                          <Text style={styles.quickLinkButtonText}>Parse pasted text as iCrew</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickLinkButton} onPress={copyICrewDebugJson}>
                          <Text style={styles.quickLinkButtonText}>
                            {rotationCopiedICrewDebugJson ? "Copied iCrew debug JSON" : "Copy iCrew debug JSON"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {rotationICrewDebugError ? (
                        <Text style={styles.inlineValidationText}>{rotationICrewDebugError}</Text>
                      ) : null}
                      {rotationICrewDebugDiagnostics && !rotationICrewDebugResult ? (
                        <Text style={styles.resultSupportMetaText}>
                          iCrew debug failure: raw lines {rotationICrewDebugDiagnostics.rawLineCount} • header candidates {rotationICrewDebugDiagnostics.headerCandidateLines.length} • totals candidates {rotationICrewDebugDiagnostics.totalsCandidateLines.length} • leg candidates {rotationICrewDebugDiagnostics.legCandidateLines.length} • failed stage {rotationICrewDebugDiagnostics.parserStageFailed ?? "unknown"}
                        </Text>
                      ) : null}
                      {rotationICrewDebugResult ? (
                        <Text style={styles.resultSupportMetaText}>
                          iCrew parsed: Rotation #{rotationICrewDebugResult.header.rotationNumber} • Dates {rotationICrewDebugResult.header.tripDates} • Operating legs {rotationICrewDebugResult.visibleOperatingLegs.length} • DH legs {rotationICrewDebugResult.deadheadAnnotations.length} • Scheduled block {rotationFormatMinutes(rotationICrewDebugResult.operatingScheduledBlockMinutes)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={[styles.resultPanel, styles.rotationInputOptionsPanel, isCompactMobile && styles.resultPanelCompact]}>
                  <Text style={styles.inputLabel}>Input options</Text>
                  <View style={styles.rotationInputOptionsRow}>
                    {["MiCrew", "iCrew", "Screenshots", "Text"].map((option) => (
                      <View key={option} style={styles.rotationInputOptionChip}>
                        <Text style={styles.rotationInputOptionChipText}>{option}</Text>
                      </View>
                    ))}
                  </View>
                </View>

              {rotationScreenshots.length > 0 ? (
                <View style={styles.resultPanel}>
                  <Text style={styles.inputLabel}>
                    Attached screenshots
                  </Text>
                  <Text style={styles.resultSupportMetaText}>
                    {rotationScreenshots.length} screenshot{rotationScreenshots.length === 1 ? "" : "s"} added
                  </Text>
                  <View style={styles.rotationScreenshotPreviewGrid}>
                    {rotationScreenshots.map((item, index) => (
                      <View key={`${item.name}-${index}`} style={styles.rotationScreenshotPreviewCard}>
                        <Image source={{ uri: item.previewUri }} style={styles.rotationScreenshotPreviewImage} />
                        <Text style={styles.resultSupportMetaText}>{item.name}</Text>
                        <TouchableOpacity style={styles.quickLinkButton} onPress={() => removeRotationScreenshot(index)}>
                          <Text style={styles.quickLinkButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.rotationIntakeGhostButton}
                    onPress={clearRotationScreenshots}
                  >
                    <Text style={styles.rotationIntakeGhostButtonText}>Clear screenshots</Text>
                  </TouchableOpacity>
                  <Text style={styles.resultSupportMetaText}>
                    Uploaded screenshots will flow through screenshot extraction before the trip board loads.
                  </Text>
                </View>
              ) : null}

              {rotationAnalyzeError ? (
                <View style={styles.resultPanel}>
                  <Text style={styles.warningBadge}>Warning</Text>
                  <Text style={styles.insightText}>{rotationAnalyzeError}</Text>
                  <TouchableOpacity style={styles.quickLinkButton} onPress={useSampleRotation}>
                    <Text style={styles.quickLinkButtonText}>Use sample rotation instead</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              </View>

              {rotationDebugEnabled && (rotationScreenshots.length > 0 || rotationScreenshotParseResult) ? (
                <View style={styles.resultPanel}>
                  <Text style={styles.inputLabel}>Screenshot parser</Text>
                  {!rotationScreenshotParseResult ? (
                    <Text style={styles.resultSupportMetaText}>No screenshot parser response yet.</Text>
                  ) : (
                    <View style={styles.sectionStack}>
                      <Text style={styles.resultSupportMetaText}>
                        UI screenshots attached: {rotationScreenshots.length}
                      </Text>
                      <Text style={styles.resultSupportMetaText}>
                        Confidence:{" "}
                        {rotationScreenshotParseResult.ok
                          ? rotationScreenshotParseResult.confidence
                          : "low"}
                      </Text>
                      <Text style={styles.resultSupportMetaText}>
                        Missing sections:{" "}
                        {rotationScreenshotParseResult.missingSections.length > 0
                          ? rotationScreenshotParseResult.missingSections.join(", ")
                          : "None"}
                      </Text>
                      <Text style={styles.resultSupportMetaText}>
                        Warnings:{" "}
                        {rotationScreenshotParseResult.warnings.length > 0
                          ? rotationScreenshotParseResult.warnings.join(" | ")
                          : "None"}
                      </Text>
                      {rotationScreenshotParseResult.ok ? (
                        <Text style={styles.resultSupportMetaText}>
                          Normalized text: {rotationScreenshotParseResult.normalizedText.slice(0, 1600) || "None"}
                        </Text>
                      ) : (
                        <Text style={styles.resultSupportMetaText}>
                          Parser error: {rotationScreenshotParseResult.error}
                        </Text>
                      )}
                      {rotationScreenshotParseResult.debug ? (
                        <>
                          <Text style={styles.resultSupportMetaText}>
                            Backend images: {rotationScreenshotParseResult.debug.changedImageCountReceived} • Vision called:{" "}
                            {rotationScreenshotParseResult.debug.visionModelCalled ? "yes" : "no"} • Model:{" "}
                            {rotationScreenshotParseResult.debug.modelName ?? "unknown"}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Rotations parsed: {rotationScreenshotParseResult.debug.rotationsParsed} • Legs parsed:{" "}
                            {rotationScreenshotParseResult.debug.legsParsed} • Fallback regex legs:{" "}
                            {rotationScreenshotParseResult.debug.fallbackRegexLegsParsed}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Screenshots: {rotationScreenshotParseResult.debug.screenshotsCount} • Combined text length:{" "}
                            {rotationScreenshotParseResult.debug.combinedTextLength} • Final flight legs:{" "}
                            {rotationScreenshotParseResult.debug.finalFlightSegments} • Duplicates removed:{" "}
                            {rotationScreenshotParseResult.debug.duplicateLegsRemoved}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Visible activity cards: {rotationScreenshotParseResult.debug.visibleActivityCards} • Raw flight candidates:{" "}
                            {rotationScreenshotParseResult.debug.rawFlightCandidates} • Final flight legs:{" "}
                            {rotationScreenshotParseResult.debug.finalFlightSegments}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Operating legs: {rotationScreenshotParseResult.debug.operatingSegments} • DH legs:{" "}
                            {rotationScreenshotParseResult.debug.deadheadSegments} • Return-to-gate legs:{" "}
                            {rotationScreenshotParseResult.debug.returnToGateSegments} • Layover cards:{" "}
                            {rotationScreenshotParseResult.debug.layoverCards}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Deadhead legs detected: {rotationScreenshotParseResult.debug.deadheadLegsDetected} • Confirmation codes:{" "}
                            {rotationScreenshotParseResult.debug.deadheadConfirmationCodes.length > 0
                              ? rotationScreenshotParseResult.debug.deadheadConfirmationCodes.join(", ")
                              : "None"}
                          </Text>
                          {rotationScreenshotParseResult.debug.deadheadDetectionNotes.length > 0 ? (
                            <Text style={styles.resultSupportMetaText}>
                              Deadhead detection notes: {rotationScreenshotParseResult.debug.deadheadDetectionNotes.join(" | ").slice(0, 1600)}
                            </Text>
                          ) : null}
                          <Text style={styles.resultSupportMetaText}>
                            Ordering method: {rotationScreenshotParseResult.debug.orderingMethod} • Sequence:{" "}
                            {rotationScreenshotParseResult.debug.inferredSequence.join(" -> ").slice(0, 1400)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Chain length: {rotationScreenshotParseResult.debug.chainLength} • Fragments:{" "}
                            {rotationScreenshotParseResult.debug.fragmentsDetected} • Strategy:{" "}
                            {rotationScreenshotParseResult.debug.orderingStrategy} • Unmatched legs:{" "}
                            {rotationScreenshotParseResult.debug.unmatchedLegs}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Final ordered chain: {rotationScreenshotParseResult.debug.finalOrderedChainCount} • User-facing legs:{" "}
                            {rotationScreenshotParseResult.debug.userFacingLegs} • Discarded fragments:{" "}
                            {rotationScreenshotParseResult.debug.discardedFragments}
                          </Text>
                          {rotationScreenshotParseResult.debug.discardedFragmentReasons.length > 0 ? (
                            <Text style={styles.resultSupportMetaText}>
                              Discarded fragment reasons: {rotationScreenshotParseResult.debug.discardedFragmentReasons.join(" | ").slice(0, 1600)}
                            </Text>
                          ) : null}
                          {rotationScreenshotParseResult.debug.stitchingWarnings.length > 0 ? (
                            <Text style={styles.resultSupportMetaText}>
                              Stitching warnings: {rotationScreenshotParseResult.debug.stitchingWarnings.join(" | ")}
                            </Text>
                          ) : null}
                          {(rotationScreenshotParseResult.debug.rawTextPreview ?? []).length > 0 ? (
                            <Text style={styles.resultSupportMetaText}>
                              Raw text preview: {rotationScreenshotParseResult.debug.rawTextPreview.join(" | ").slice(0, 1400)}
                            </Text>
                          ) : null}
                        </>
                      ) : null}
                    </View>
                  )}
                </View>
              ) : null}

              {rotationDebugEnabled && rotationScreenshotParseResult?.debug ? (
                <View style={styles.resultPanel}>
                  <Text style={styles.inputLabel}>Rotation Parse Trace</Text>
                  <View style={styles.sectionStack}>
                    {rotationParseTraceWarnings.length > 0 ? (
                      <Text style={styles.resultSupportMetaText}>
                        Validation warnings: {rotationParseTraceWarnings.join(" | ")}
                      </Text>
                    ) : (
                      <Text style={styles.resultSupportMetaText}>Validation warnings: None</Text>
                    )}

                    <Text style={styles.resultBodyText}>Screenshot extraction trace</Text>
                    {rotationScreenshotParseResult.debug.perScreenshotTrace.length > 0 ? (
                      rotationScreenshotParseResult.debug.perScreenshotTrace.map((trace) => {
                        const rawKey = `rotation-trace-raw-${trace.screenshotIndex}`;
                        const normalizedKey = `rotation-trace-normalized-${trace.screenshotIndex}`;
                        return (
                          <View key={`${trace.screenshotIndex}-${trace.screenshotName}`} style={styles.resultPanelSubtle}>
                            <Text style={styles.resultSupportMetaText}>
                              Screenshot #{trace.screenshotIndex + 1}: {trace.screenshotName}
                            </Text>
                            <Text style={styles.resultSupportMetaText}>
                              Source format: {trace.sourceFormat} • First leg: {trace.detectedFirstLeg ?? "None"} • Last leg:{" "}
                              {trace.detectedLastLeg ?? "None"}
                            </Text>
                            <Text style={styles.resultSupportMetaText}>
                              Dates: {formatTraceList(trace.detectedDates)} • Layovers: {formatTraceList(trace.detectedLayovers)}
                            </Text>
                            <TouchableOpacity style={styles.quickLinkButton} onPress={() => toggleRotationParseTrace(rawKey)}>
                              <Text style={styles.quickLinkButtonText}>
                                {rotationParseTraceOpen[rawKey] ? "Hide raw extracted text" : "Show raw extracted text"}
                              </Text>
                            </TouchableOpacity>
                            {rotationParseTraceOpen[rawKey] ? (
                              <Text style={styles.resultSupportMetaText}>{trace.rawExtractedText || "None"}</Text>
                            ) : null}
                            <TouchableOpacity style={styles.quickLinkButton} onPress={() => toggleRotationParseTrace(normalizedKey)}>
                              <Text style={styles.quickLinkButtonText}>
                                {rotationParseTraceOpen[normalizedKey] ? "Hide normalized text" : "Show normalized text"}
                              </Text>
                            </TouchableOpacity>
                            {rotationParseTraceOpen[normalizedKey] ? (
                              <Text style={styles.resultSupportMetaText}>{trace.normalizedText || "None"}</Text>
                            ) : null}
                          </View>
                        );
                      })
                    ) : (
                      <Text style={styles.resultSupportMetaText}>No per-screenshot trace was returned.</Text>
                    )}

                    <Text style={styles.resultBodyText}>Combined normalized text</Text>
                    {rotationDebugEnabled ? (
                      <>
                        <Text style={styles.resultBodyText}>Live chain debug JSON</Text>
                        <TouchableOpacity style={styles.quickLinkButton} onPress={copyLiveChainDebugJson}>
                          <Text style={styles.quickLinkButtonText}>
                            {rotationCopiedDebugJson ? "Copied live chain debug JSON" : "Copy live chain debug JSON"}
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    <TouchableOpacity
                      style={styles.quickLinkButton}
                      onPress={() =>
                        copyRotationNormalizedText(
                          rotationScreenshotParseResult.ok ? rotationScreenshotParseResult.normalizedText : "",
                        )
                      }
                    >
                      <Text style={styles.quickLinkButtonText}>Copy combined normalized text</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickLinkButton}
                      onPress={() => toggleRotationParseTrace("rotation-trace-combined")}
                    >
                      <Text style={styles.quickLinkButtonText}>
                        {rotationParseTraceOpen["rotation-trace-combined"] ? "Hide combined normalized text" : "Show combined normalized text"}
                      </Text>
                    </TouchableOpacity>
                    {rotationParseTraceOpen["rotation-trace-combined"] ? (
                      <Text style={styles.resultSupportMetaText}>
                        {rotationScreenshotParseResult.ok ? rotationScreenshotParseResult.normalizedText || "None" : "No normalized text available."}
                      </Text>
                    ) : null}

                    <Text style={styles.resultBodyText}>Leg candidates before dedupe/stitching</Text>
                    {rotationScreenshotParseResult.debug.legCandidates.length > 0 ? (
                      rotationScreenshotParseResult.debug.legCandidates.map((leg, index) => (
                        <View key={`candidate-${index}`} style={styles.resultPanelSubtle}>
                          <Text style={styles.resultSupportMetaText}>
                            Screenshot #{leg.sourceScreenshotIndex + 1} • {leg.flightNumber ?? "UNK"} • {leg.departureAirport ?? "?"}-{leg.arrivalAirport ?? "?"}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Out/In: {leg.scheduledOut ?? "?"} / {leg.scheduledIn ?? "?"} • Block: {leg.scheduledBlock ?? "?"} • Turn:{" "}
                            {leg.turn ?? "?"} • Date: {leg.date ?? "?"} • Deadhead: {leg.isDeadhead ? "yes" : "no"} • Segment:{" "}
                            {leg.segmentType ?? "operating"}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>Source line: {leg.rawSourceLine}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.resultSupportMetaText}>No leg candidates were captured.</Text>
                    )}

                    <Text style={styles.resultBodyText}>Dedupe / stitching trace</Text>
                    <Text style={styles.resultSupportMetaText}>
                      Duplicate legs removed: {rotationScreenshotParseResult.debug.duplicateSegmentsRemoved} • Chain length:{" "}
                      {rotationScreenshotParseResult.debug.chainLength} • Fragments: {rotationScreenshotParseResult.debug.fragmentsDetected} • Strategy:{" "}
                      {rotationScreenshotParseResult.debug.orderingStrategy} • Unmatched legs: {rotationScreenshotParseResult.debug.unmatchedLegs}
                    </Text>
                    <Text style={styles.resultSupportMetaText}>
                      Final ordered chain: {rotationScreenshotParseResult.debug.finalOrderedChainCount} • User-facing legs:{" "}
                      {rotationScreenshotParseResult.debug.userFacingLegs} • Discarded fragments:{" "}
                      {rotationScreenshotParseResult.debug.discardedFragments}
                    </Text>
                    {rotationScreenshotParseResult.debug.discardedFragmentReasons.length > 0 ? (
                      <Text style={styles.resultSupportMetaText}>
                        Discarded fragment reasons: {rotationScreenshotParseResult.debug.discardedFragmentReasons.join(" | ").slice(0, 1600)}
                      </Text>
                    ) : null}
                    <Text style={styles.resultSupportMetaText}>
                      Visible activity cards: {rotationScreenshotParseResult.debug.visibleActivityCards} • Raw flight candidates:{" "}
                      {rotationScreenshotParseResult.debug.rawFlightCandidates} • Final flight legs:{" "}
                      {rotationScreenshotParseResult.debug.finalFlightSegments} • Operating legs:{" "}
                      {rotationScreenshotParseResult.debug.operatingSegments} • DH legs:{" "}
                      {rotationScreenshotParseResult.debug.deadheadSegments} • Return-to-gate legs:{" "}
                      {rotationScreenshotParseResult.debug.returnToGateSegments} • Layover cards:{" "}
                      {rotationScreenshotParseResult.debug.layoverCards}
                    </Text>
                    {rotationScreenshotParseResult.debug.duplicateReasons.length > 0 ? (
                      <Text style={styles.resultSupportMetaText}>
                        Duplicate reasons: {rotationScreenshotParseResult.debug.duplicateReasons.join(" | ").slice(0, 1600)}
                      </Text>
                    ) : null}
                    <Text style={styles.resultSupportMetaText}>
                      MiCrew header found: {rotationScreenshotParseResult.debug.micrewHeaderFound ? "yes" : "no"} • Trip dates source:{" "}
                      {rotationScreenshotParseResult.debug.tripDatesSource} • Rotation # source:{" "}
                      {rotationScreenshotParseResult.debug.rotationNumberSource}
                    </Text>
                    <Text style={styles.resultSupportMetaText}>
                      Parsed header: Rotation #{rotationScreenshotParseResult.debug.parsedHeader?.rotationNumber ?? "Unknown"} • Base:{" "}
                      {rotationScreenshotParseResult.debug.parsedHeader?.base ?? "Unknown"} • Dates:{" "}
                      {rotationScreenshotParseResult.debug.parsedHeader?.startDate ?? "?"} - {rotationScreenshotParseResult.debug.parsedHeader?.endDate ?? "?"} • Credit:{" "}
                      {rotationScreenshotParseResult.debug.parsedHeader?.totalCredit ?? "Unknown"} • TAFB:{" "}
                      {rotationScreenshotParseResult.debug.parsedHeader?.tafb ?? "Unknown"} • Layovers:{" "}
                      {formatTraceList(rotationScreenshotParseResult.debug.parsedHeader?.layoverCities)}
                    </Text>
                    {rotationScreenshotParseResult.debug.orderedChain.length > 0 ? (
                      rotationScreenshotParseResult.debug.orderedChain.map((leg) => (
                        <View key={`chain-${leg.index}-${leg.flightNumber ?? "unk"}`} style={styles.resultPanelSubtle}>
                          <Text style={styles.resultSupportMetaText}>
                            {leg.index}. {leg.flightNumber ?? "UNK"} • {leg.departureAirport ?? "?"}-{leg.arrivalAirport ?? "?"}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Out/In: {leg.scheduledOut ?? "?"} / {leg.scheduledIn ?? "?"} • Block: {leg.scheduledBlock ?? "?"} • Turn:{" "}
                            {leg.turn ?? "?"} • Date: {leg.date ?? "?"} • Segment: {leg.segmentType ?? "operating"}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.resultSupportMetaText}>No ordered chain rows are available.</Text>
                    )}

                    <Text style={styles.resultBodyText}>Dashboard model trace</Text>
                    {rotationDashboard ? (
                      <>
                        <Text style={styles.resultSupportMetaText}>
                          Trip dates: {rotationDashboard.snapshot.tripDates} • Rotation number: {rotationDashboard.snapshot.rotationNumber}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Total credit: {rotationDashboard.snapshot.totalCreditMinutes} • Total scheduled block:{" "}
                          {rotationDashboard.snapshot.scheduledBlockMinutes} • Final arrival: {rotationDashboard.snapshot.finalArrival}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Operating block: {rotationDashboard.parsedRotation.totalScheduledBlock ?? 0} • DH block:{" "}
                          {rotationDashboard.parsedRotation.deadheadBlock ?? 0} • Excluded DH legs:{" "}
                          {rotationDashboard.parsedRotation.excludedDeadheadLegs}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          deadheadFeatureDisabledDueToRegression: true
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Total credit source: {rotationScreenshotParseResult.debug.parsedHeader?.totalCredit ? "header Credit-" : "fallback"} • Scheduled block source: explicit Blk- sum from operating legs • TAFB source: {rotationScreenshotParseResult.debug.parsedHeader?.tafb ? "header TAFB-" : "not found"}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Report/release source: {rotationScreenshotParseResult.debug.parsedHeader?.reportTime || rotationScreenshotParseResult.debug.parsedHeader?.releaseTime ? "header Rpt-/Rls-" : "fallback parser"} • Next flight reason: first ordered chain leg • Final arrival source: last ordered chain leg
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Final arrival assertion:{" "}
                          {rotationDashboard.snapshot.finalArrival ===
                          rotationScreenshotParseResult.debug.orderedChain.at(-1)?.arrivalAirport
                            ? "pass"
                            : "fail"}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Layovers: {formatTraceList(rotationDashboard.snapshot.layoverCities)}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Next flight: {rotationDashboard.nextLeg?.origin ?? "?"}-{rotationDashboard.nextLeg?.destination ?? "?"} • Out/In:{" "}
                          {rotationDashboard.nextLeg?.departureTime ?? "?"} / {rotationDashboard.nextLeg?.arrivalTime ?? "?"} • Block:{" "}
                          {rotationDashboard.nextLeg?.scheduledBlockMinutes ?? "?"} • Turn: {rotationDashboard.nextLeg?.turnMinutes ?? "?"}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Full rotation reason:{" "}
                          {rotationDashboard.parsedRotation.isPartial
                            ? "Still marked partial because required trip context is missing."
                            : "Continuous stitched leg chain plus MiCrew header/release context indicates a full rotation."}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Partial reason: {rotationDashboard.parsedRotation.partialReason ?? "None"}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Ordered chain first leg: {rotationScreenshotParseResult.debug.orderedChain[0]?.departureAirport ?? "?"}-{rotationScreenshotParseResult.debug.orderedChain[0]?.arrivalAirport ?? "?"} • Ordered chain last leg: {rotationScreenshotParseResult.debug.orderedChain.at(-1)?.departureAirport ?? "?"}-{rotationScreenshotParseResult.debug.orderedChain.at(-1)?.arrivalAirport ?? "?"}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Screenshot assertion: finalArrival={rotationDashboard.snapshot.finalArrival} • userFacingLegs={rotationDashboard.legs.length} • lastUserFacingLeg={rotationDashboard.legs.at(-1)?.origin ?? "?"}-{rotationDashboard.legs.at(-1)?.destination ?? "?"} • scheduledBlock={rotationDashboard.snapshot.scheduledBlockMinutes} • logbookLegCount={rotationDashboard.legs.length}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          VISIBLE_ROTATION_SOURCE_DEBUG = {"{"}
                          rawFinalOrderedChainCount: {rotationScreenshotParseResult.debug.finalOrderedChainCount},
                          {" "}sanitizedUserFacingLegsCount: {rotationDashboard.legs.length},
                          {" "}userFacingLegsCount: {rotationDashboard.legs.length},
                          {" "}canonicalChainSource: screenshot_display_model,
                          {" "}chainAnchorReason: {rotationDashboard.parsedRotation.chainAnchorReason ?? "unknown"},
                          {" "}anchoredFirstLeg: {rotationDashboard.parsedRotation.anchoredFirstLeg ?? (rotationDashboard.legs.at(0) ? `${rotationDashboard.legs.at(0)?.origin}-${rotationDashboard.legs.at(0)?.destination}` : "unknown")},
                          {" "}wasChainRotated: {rotationDashboard.parsedRotation.wasChainRotated ? "true" : "false"},
                          {" "}firstUserFacingLeg: {rotationDashboard.legs.at(0) ? `${rotationDashboard.legs.at(0)?.origin}-${rotationDashboard.legs.at(0)?.destination}` : "unknown"},
                          {" "}lastUserFacingLeg: {rotationDashboard.legs.at(-1) ? `${rotationDashboard.legs.at(-1)?.origin}-${rotationDashboard.legs.at(-1)?.destination}` : "unknown"},
                          {" "}terminalReturnLeg: {rotationDashboard.legs.at(-1) ? `${rotationDashboard.legs.at(-1)?.origin}-${rotationDashboard.legs.at(-1)?.destination}` : "unknown"},
                          {" "}terminalCutIndex: {rotationDashboard.legs.length - 1},
                          {" "}discardedAfterTerminal: {Math.max(0, rotationScreenshotParseResult.debug.finalOrderedChainCount - rotationDashboard.legs.length)},
                          {" "}partialBannerVisible: {rotationDashboard.parsedRotation.isPartial ? "true" : "false"},
                          {" "}partialVisibleLegsCount: {rotationDashboard.parsedRotation.visibleLegCount},
                          {" "}operatingLegsCount: {rotationDashboard.parsedRotation.legs.filter((leg) => !leg.isDeadhead).length},
                          {" "}dhLegsCount: {rotationDashboard.parsedRotation.legs.filter((leg) => leg.isDeadhead).length},
                          {" "}logbookExportLegsCount: {rotationDashboard.legs.filter((leg) => !leg.excludeFromLogbookExport).length},
                          {" "}scheduledBlock: {rotationDashboard.snapshot.scheduledBlockMinutes},
                          {" "}scheduledBlockSource: {rotationDashboard.snapshot.scheduledBlockMinutes > 0 ? "computedFromUserFacingLegs" : "fallback"},
                          {" "}headerScheduledBlock: none,
                          {" "}computedUserFacingScheduledBlock: {rotationDashboard.parsedRotation.legs.filter((leg) => !leg.isDeadhead).reduce((sum, leg) => sum + (leg.scheduledBlock ?? 0), 0)},
                          {" "}finalArrival: {rotationDashboard.snapshot.finalArrival},
                          {" "}nextFlightCityPair: {rotationDashboard.nextLeg ? `${rotationDashboard.nextLeg.origin}-${rotationDashboard.nextLeg.destination}` : "unknown"},
                          {" "}logbookLegCount: {rotationDashboard.legs.length},
                          {" "}lastLogbookLeg: {rotationDashboard.legs.at(-1) ? `${rotationDashboard.legs.at(-1)?.origin}-${rotationDashboard.legs.at(-1)?.destination}` : "unknown"}
                          {" }"}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          LIVE_CHAIN_BUILDER_PARITY_DEBUG = {"{"}
                          usedExportedBuilder: true,
                          {" "}runtimeRawCandidateCount: {rotationScreenshotParseResult.debug.legCandidates.length},
                          {" "}runtimeBuilderUserFacingCount: {rotationDashboard.legs.length},
                          {" "}runtimeUserFacingLegs: {rotationDashboard.legs.map((leg) => `${leg.origin}-${leg.destination}`).join(" | ") || "none"},
                          {" "}runtimeFirstLeg: {rotationDashboard.legs.at(0) ? `${rotationDashboard.legs.at(0)?.origin}-${rotationDashboard.legs.at(0)?.destination}` : "unknown"},
                          {" "}runtimeLastLeg: {rotationDashboard.legs.at(-1) ? `${rotationDashboard.legs.at(-1)?.origin}-${rotationDashboard.legs.at(-1)?.destination}` : "unknown"},
                          {" "}runtimeFinalArrival: {rotationDashboard.snapshot.finalArrival},
                          {" "}runtimeScheduledBlock: {rotationDashboard.snapshot.scheduledBlockMinutes},
                          {" "}runtimeScheduledBlockSource: {typeof rotationScreenshotParseResult.extracted?.totals?.totalScheduledBlockMinutes === "number" && rotationScreenshotParseResult.extracted.totals.totalScheduledBlockMinutes > 0 ? "header" : rotationDashboard.snapshot.scheduledBlockMinutes > 0 ? "computedFromUserFacingLegs" : "fallback"},
                          {" "}runtimeNextFlight: {rotationDashboard.nextLeg ? `${rotationDashboard.nextLeg.origin}-${rotationDashboard.nextLeg.destination}` : "unknown"},
                          {" "}runtimeLogbookLegCount: {rotationDashboard.legs.length}
                          {" }"}
                        </Text>
                        <Text style={styles.resultSupportMetaText}>
                          Dashboard validation warnings: {formatTraceList(rotationParseTraceWarnings)}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.resultSupportMetaText}>No dashboard model is loaded yet.</Text>
                    )}
                  </View>
                </View>
              ) : null}
            </SectionCard>
          )
        )}

        {activeTab === "far117" && (
          displayedRotationDashboard ? (() => {
            const rotationDashboard = displayedRotationDashboard;
            return (
            <SectionCard
              title="FAR 117"
              description="Planning-reference legality view for each duty day in the loaded rotation."
            >
              <View style={styles.sectionStack}>
                {rotationDashboard.parsedRotation.dutyPeriods.some((day) => day.status === "Needs full duty period details") ? (
                  <View style={styles.resultPanel}>
                    <Text style={[styles.statusBadge, styles.statusBadgeCaution]}>Needs full duty period details</Text>
                    <Text style={styles.resultBodyText}>
                      FAR 117 planning view is not available from these screenshots yet. We still need clearer duty period details with reliable report, release, and leg structure.
                    </Text>
                  </View>
                ) : rotationDashboard.dutyDays.map((day) => (
                  <View key={day.label} style={styles.resultPanel}>
                    <Text
                      style={[
                        styles.statusBadge,
                        day.status === "Good"
                          ? styles.statusBadgeResolved
                          : day.status === "Watch"
                            ? styles.statusBadgeCaution
                            : styles.statusBadgeWarning,
                      ]}
                    >
                      {day.status}
                    </Text>
                    <ResultLine label="Duty day" value={day.label} emphasis />
                    <FormRow>
                      <ResultLine label="Scheduled block" value={rotationFormatMinutes(day.scheduledBlockMinutes)} />
                      <ResultLine label="Scheduled FDP" value={rotationFormatMinutes(day.scheduledFdpMinutes)} />
                    </FormRow>
                    <FormRow>
                      <ResultLine label="FDP limit" value={rotationFormatMinutes(day.fdpLimitMinutes)} />
                      <ResultLine label="Margin" value={rotationFormatMinutes(day.marginMinutes)} />
                    </FormRow>
                  </View>
                ))}
                <Text style={styles.resultSupportMetaText}>
                  Planning reference only. Confirm official legality with company systems.
                </Text>
              </View>
            </SectionCard>
            );
          })() : (
            <SectionCard
              title="FAR 117"
              description="Load a rotation first so we can build duty-day cards and FDP watch items."
            >
              <TouchableOpacity style={styles.auditButton} onPress={() => setActiveTab("today")}>
                <Text style={styles.auditButtonText}>Load your rotation</Text>
              </TouchableOpacity>
            </SectionCard>
          )
        )}

        {activeTab === "logbook" && (
          displayedRotationDashboard ? (() => {
            const rotationDashboard = displayedRotationDashboard;
            return (
            <SectionCard
              title="Logbook"
              description="Review operating, DH, and RTG legs before logbook export."
            >
              <View style={styles.sectionStack}>
                    {rotationDashboard.legs.map((leg) => (
                <View key={leg.id} style={[styles.resultPanel, leg.isDeadhead ? styles.deadheadLegPanel : null]}>
                    <View style={styles.rotationLegHeaderRow}>
                      <Text style={styles.inputLabel}>{leg.dayLabel}</Text>
                      <Text
                        style={[
                          styles.statusBadge,
                          leg.isDeadhead
                            ? styles.deadheadBadge
                            : isReturnToGateLeg(leg)
                              ? styles.statusBadgeRtg
                              : styles.statusBadgeResolved,
                        ]}
                      >
                        {leg.isDeadhead ? "DH" : isReturnToGateLeg(leg) ? "RTG" : "Operating"}
                      </Text>
                    </View>
                    <Text style={styles.tripBoardTimelineCityPair}>
                      {leg.origin} {"→"} {leg.destination}
                    </Text>
                    <View style={styles.tripBoardTimelineMetaRow}>
                      <Text style={styles.tripBoardTimelineMeta}>{formatLegFlightDisplay(leg)}</Text>
                      <Text style={styles.tripBoardTimelineMeta}>
                        {(leg.departureTime ?? "TBD")}–{(leg.arrivalTime ?? "TBD")}
                      </Text>
                      <Text style={styles.tripBoardTimelineMeta}>
                        {leg.isDeadhead ? "DH block" : "Block"} {rotationFormatMinutes(leg.scheduledBlockMinutes)}
                      </Text>
                    </View>
                    {!leg.isDeadhead && (leg.turnMinutes != null || leg.aircraft || (leg.gate && leg.gate !== "TBD")) ? (
                      <View style={styles.tripBoardTimelineMetaRow}>
                        {leg.turnMinutes != null ? (
                          <Text style={styles.tripBoardTimelineMeta}>
                            Turn {rotationFormatMinutes(leg.turnMinutes)}
                          </Text>
                        ) : null}
                        {leg.aircraft ? (
                          <Text style={styles.tripBoardTimelineMeta}>
                            Ship/equip {formatLegEquipmentDisplay(leg)}
                          </Text>
                        ) : null}
                        {leg.gate && leg.gate !== "TBD" ? (
                          <Text style={styles.tripBoardTimelineMeta}>
                            Gate {formatLegGateDisplay(leg)}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                    {leg.isDeadhead && leg.confirmationNumber ? (
                      <Text style={styles.tripBoardTimelineMeta}>PNR {leg.confirmationNumber}</Text>
                    ) : null}
                    {isReturnToGateLeg(leg) ? (
                      <Text style={styles.tripBoardTimelineMeta}>Return-to-gate segment</Text>
                    ) : null}
                    {leg.isDeadhead && leg.confirmationNumber ? (
                      <View style={styles.sectionStack}>
                        <View style={styles.tripBoardTimelineActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.tripBoardTimelineActionButton,
                              rotationCopiedConfirmation === leg.confirmationNumber &&
                                styles.tripBoardTimelineActionButtonActive,
                            ]}
                            onPress={() => copyRotationConfirmationCode(leg.confirmationNumber)}
                          >
                            <Text style={styles.tripBoardTimelineActionButtonText}>
                              {rotationCopiedConfirmation === leg.confirmationNumber ? "Copied" : "Copy code"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.tripBoardTimelineActionButton, styles.tripBoardTimelineActionButtonSecondary]}
                            onPress={() => openRotationExternalUrl(DELTA_CHECK_IN_URL)}
                          >
                            <Text style={styles.tripBoardTimelineActionButtonText}>Check in</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                    {leg.isDeadhead && !leg.confirmationNumber ? (
                      <View style={styles.tripBoardTimelineHintStack}>
                        <Text style={[styles.tripBoardTimelineMeta, styles.tripBoardTimelineMetaMuted]}>
                          Confirmation not found
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.tripBoardTimelineMeta}>
                      {leg.excludeFromLogbookExport ? "Excluded from logbook export" : "Include in logbook export"}
                    </Text>
                    {leg.isDeadhead && !leg.confirmationNumber ? (
                      <Text style={[styles.tripBoardTimelineMeta, styles.tripBoardTimelineMetaMuted]}>
                        Add MiCrew DH card to enable check-in actions
                      </Text>
                    ) : null}
                    {rotationDebugEnabled ? (
                      <Text style={styles.resultSupportMetaText}>
                        isDeadhead: {leg.isDeadhead ? "true" : "false"} • source: {leg.deadheadSource ?? "unknown"} • confirmation: {leg.confirmationNumber ?? "none"}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </SectionCard>
            );
          })() : (
            <SectionCard
              title="Logbook"
              description="Load a rotation first so we can show the leg-by-leg breakdown."
            >
              <TouchableOpacity style={styles.auditButton} onPress={() => setActiveTab("today")}>
                <Text style={styles.auditButtonText}>Load your rotation</Text>
              </TouchableOpacity>
            </SectionCard>
          )
        )}

        {activeTab === "tools" && (
          <SectionCard
            title="Tools"
            description="The trip-first companion is the main experience now. Legacy Seniority, AE, Schedule, and Pay tools stay here as the free hook."
          >
            <View style={styles.payToolGrid}>
              {toolDestinationCards.map((tool) => (
                <TouchableOpacity
                  key={tool.key}
                  activeOpacity={0.9}
                  style={styles.payToolCard}
                  onPress={() => setActiveTab(tool.key)}
                >
                  <View style={styles.payToolHero}>
                    <Text style={styles.payToolGlyph}>{tool.title.slice(0, 2).toUpperCase()}</Text>
                    <Text style={styles.payToolBadge}>{tool.badge}</Text>
                  </View>
                  <View style={styles.payToolBody}>
                    <Text style={styles.payToolTitle}>{tool.title}</Text>
                    <Text style={styles.payToolSubtitle}>{tool.subtitle}</Text>
                    {tool.key === "schedule" ? (
                      <Text style={styles.resultSupportMetaText}>
                        Reuses {rotationCompanionToolRegistry.contractCopilot.ui}
                      </Text>
                    ) : tool.key === "pay" ? (
                      <Text style={styles.resultSupportMetaText}>
                        Reuses {rotationCompanionToolRegistry.rerouteCalculator.engine} and {rotationCompanionToolRegistry.timecardPayParsing.parser}
                      </Text>
                    ) : tool.key === "seniority" || tool.key === "home" ? (
                      <Text style={styles.resultSupportMetaText}>
                        Reuses {rotationCompanionToolRegistry.seniority.data}
                      </Text>
                    ) : tool.key === "ae" ? (
                      <Text style={styles.resultSupportMetaText}>
                        Reuses {rotationCompanionToolRegistry.ae.engine}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.payToolButton}>Open</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>
        )}

        {activeTab === "home" && (
          <MobileHomeDashboard
            currentPilot={currentPilot}
            employeeNumberInput={employeeNumberInput}
            onEmployeeNumberChange={setEmployeeNumberInput}
            preferences={mobilePreferences}
            onPreferencesChange={setMobilePreferences}
            preferencesEditing={mobilePreferencesEditing}
            onPreferencesEditingChange={setMobilePreferencesEditing}
            preferencesComplete={mobilePreferencesComplete}
            goalInput={mobileGoalInput}
            onGoalInputChange={setMobileGoalInput}
            currentCategoryEntry={preferredCurrentCategoryEntry}
            currentCategoryMovement={preferredCurrentAeMovement}
            currentCategoryReach={preferredCurrentAeReach}
            currentCategoryTrend={preferredCurrentAeTrend}
              systemPercent={systemPercent}
              systemTotalPilots={systemTotalPilots}
              currentCategoryPercent={currentCategoryPercent}
            currentCategorySummary={currentCategorySummary}
            projectedCategoryPercent={projectedCategoryPercent}
            projectedCategoryRank={projectedCategoryRank}
            projectedCategoryTotal={projectedCategoryTotal}
            relevantHolds={mobileRelevantHoldEntries}
            trackedCategories={trackedCategoryEntries}
            onOpenTrackedCategory={(entry) =>
              setSelectedCategoryDetail({
                categoryKey: entry.key,
                label: formatCategoryEntryCode(entry),
              })
            }
            growthRate={growthRate}
            onGrowthRateChange={(value) => {
              setGrowthRate(value);
              setForecastGrowthRate(value);
              setGrowthMenuOpen(false);
            }}
            growthMenuOpen={growthMenuOpen}
            onGrowthMenuToggle={() => setGrowthMenuOpen((current) => !current)}
            seniorityPercentSeries={seniorityPercentSeries}
            seniorityNumberSeries={seniorityNumberSeries}
            totalPilotCountSeries={totalPilotCountSeries}
          />
        )}

        {activeTab === "schedule" && (
          <SectionCard
            title="Schedule Analyzer"
            description="Keep the schedule tools nearby for trip quality, fatigue risk, and reroute awareness."
          >
            {rotationToolBanner ? (
              <View style={styles.resultPanel}>
                <Text style={styles.inputLabel}>{rotationToolBanner.title}</Text>
                <Text style={styles.resultBodyText}>{rotationToolBanner.detail}</Text>
              </View>
            ) : null}
            <FormRow>
              <LabeledInput label="Block Hours" value={blockHours} onChangeText={setBlockHours} />
              <LabeledInput label="Duty Hours" value={dutyHours} onChangeText={setDutyHours} />
            </FormRow>
            <FormRow>
              <LabeledInput label="Layover Hours" value={layoverHours} onChangeText={setLayoverHours} />
              <LabeledInput label="Legs" value={legs} onChangeText={setLegs} />
            </FormRow>
            <View style={styles.resultPanel}>
              <ResultLine label="Productivity" value={formatPercent(tripHealth.productivity)} />
              <ResultLine label="Fatigue Index" value={`${Math.round(tripHealth.fatigueIndex)}/100`} />
              <ResultLine label="Complexity" value={`${Math.round(tripHealth.complexity)}/100`} />
            </View>
            <Text style={styles.insightText}>{tripHealth.recommendation}</Text>

            <View style={styles.sectionStack}>
              <ContractCopilotPanel
                starterQuestion={contractCopilotStarterQuestion}
                contextHint={rotationToolBanner?.detail}
              />
            </View>
          </SectionCard>
        )}

        {activeTab === "pay" && (
          <SectionCard
            title="Pay Audit"
            description="Pilot-first pay tools: open the right calculator, paste the company data, and get a verdict with a contract breadcrumb."
          >
            {rotationToolBanner ? (
              <View style={styles.resultPanel}>
                <Text style={styles.inputLabel}>{rotationToolBanner.title}</Text>
                <Text style={styles.resultBodyText}>{rotationToolBanner.detail}</Text>
              </View>
            ) : null}
            <View style={styles.payToolGrid}>
              {payToolCards.map((tool) => (
                <TouchableOpacity
                  key={tool.key}
                  activeOpacity={0.9}
                  style={[
                    styles.payToolCard,
                    selectedPayTool === tool.key && styles.payToolCardActive,
                  ]}
                  onPress={() => setSelectedPayTool(tool.key)}
                >
                  <View style={styles.payToolHero}>
                    <Text style={styles.payToolGlyph}>{tool.glyph}</Text>
                    <Text style={styles.payToolBadge}>{tool.badge}</Text>
                  </View>
                  <View style={styles.payToolBody}>
                    <Text style={styles.payToolTitle}>{tool.title}</Text>
                    <Text style={styles.payToolSubtitle}>{tool.subtitle}</Text>
                  </View>
                  <Text style={styles.payToolButton}>
                    {selectedPayTool === tool.key ? "Open Now" : tool.cta}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedPayTool === "reroute-calculator" ? (
              <>
                <View style={styles.sectionStack}>
                  <View style={styles.payToolPlaceholder}>
                    <Text style={styles.payToolPlaceholderTitle}>Reroute Pay Calculator</Text>
                    <Text style={styles.payToolPlaceholderText}>
                      Upload MiCrew screenshots or paste trip text. Tell us what changed if you know.
                    </Text>
                  </View>

                  <View style={styles.resultPanel}>
                    <Text style={styles.inputLabel}>Pilot status</Text>
                    <View style={styles.baseSelector}>
                      {reroutePilotStatusOptions.map((option) => (
                        <TouchableOpacity
                          key={option.key}
                          style={[
                            styles.baseChip,
                            styles.compactBaseChip,
                            reroutePilotStatus === option.key && styles.baseChipActive,
                          ]}
                          onPress={() => {
                            setReroutePilotStatus(option.key);
                            setRerouteAnalyzeError("");
                          }}
                        >
                          <Text
                            style={[
                              styles.baseChipLabel,
                              styles.compactBaseChipLabel,
                              reroutePilotStatus === option.key && styles.baseChipLabelActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {!reroutePilotStatus && rerouteAnalyzeError === "Choose Lineholder or Reserve first." ? (
                      <Text style={styles.inlineValidationText}>Choose Lineholder or Reserve first.</Text>
                    ) : null}
                  </View>

                  <View style={styles.resultPanel}>
                    <Text style={styles.inputLabel}>Add MiCrew screenshots</Text>
                    <Text style={styles.resultBodyText}>
                      Upload the original trip if you have it, plus the changed/rerouted trip. For long rotations, upload multiple screenshots so we can see the header, all changed legs, and where you rejoined.
                    </Text>
                    <TouchableOpacity style={styles.auditButton} onPress={() => pickRerouteEvidence("original")}>
                      <Text style={styles.auditButtonText}>
                        {rerouteOriginalScreenshots.length > 0
                          ? "Replace original MiCrew screenshot(s)"
                          : "Upload original MiCrew screenshot(s)"}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.resultSupportMetaText}>
                      {rerouteOriginalScreenshots.length > 0
                        ? `Original attached: ${rerouteOriginalScreenshots.length} image${rerouteOriginalScreenshots.length === 1 ? "" : "s"}`
                        : "No original screenshots attached."}
                    </Text>
                    {rerouteOriginalScreenshots.map((item, index) => (
                      <View key={`original-shot-${item.name}-${index}`} style={styles.screenshotAttachmentRow}>
                        {item.previewUri ? <Image source={{ uri: item.previewUri }} style={styles.screenshotAttachmentThumb} /> : null}
                        <View style={styles.screenshotAttachmentMeta}>
                          <Text style={styles.resultBodyText}>{item.name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.screenshotRemoveButton}
                          onPress={() => removeRerouteScreenshot("original", index)}
                        >
                          <Text style={styles.screenshotRemoveButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={styles.auditButton} onPress={() => pickRerouteEvidence("rerouted")}>
                      <Text style={styles.auditButtonText}>
                        {rerouteChangedScreenshots.length > 0
                          ? "Replace changed/rerouted screenshot(s)"
                          : "Upload changed/rerouted screenshot(s)"}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.resultSupportMetaText}>
                      {rerouteChangedScreenshots.length > 0
                        ? `Changed/rerouted attached: ${rerouteChangedScreenshots.length} image${rerouteChangedScreenshots.length === 1 ? "" : "s"}`
                        : "No changed/rerouted screenshots attached."}
                    </Text>
                    {rerouteChangedScreenshots.map((item, index) => (
                      <View key={`changed-shot-${item.name}-${index}`} style={styles.screenshotAttachmentRow}>
                        {item.previewUri ? <Image source={{ uri: item.previewUri }} style={styles.screenshotAttachmentThumb} /> : null}
                        <View style={styles.screenshotAttachmentMeta}>
                          <Text style={styles.resultBodyText}>{item.name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.screenshotRemoveButton}
                          onPress={() => removeRerouteScreenshot("rerouted", index)}
                        >
                          <Text style={styles.screenshotRemoveButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  <TextAreaInput
                    label="Describe what changed"
                    value={rerouteDescription}
                    onChangeText={setRerouteDescription}
                    placeholder="Example: After DH SLC-BUR, Scheduling sent us back to SLC. Next day we DH SLC-IAH then fly IAH-SLC."
                    autoCapitalize="sentences"
                  />

                  <Text style={styles.resultSupportMetaText}>
                    Optional if screenshots or trip text are attached.
                  </Text>

                  <Text style={styles.resultSupportMetaText}>
                    Best results: include or upload the segment-level block times for the parts Scheduling changed or added. Avoid using only total day block unless the whole duty period was rerouted.
                  </Text>

                  <TextAreaInput
                    label="Paste MiCrew text"
                    value={rerouteChangedRotationText}
                    onChangeText={setRerouteChangedRotationText}
                    placeholder="Paste the MiCrew trip text, leg list, report/release, credit, or any copied rotation details."
                    autoCapitalize="characters"
                  />

                  <TouchableOpacity
                    style={styles.evidenceAccordion}
                    onPress={() => setRerouteEvidenceOpen((current) => !current)}
                  >
                    <Text style={styles.evidenceAccordionTitle}>Add evidence</Text>
                    <Text style={styles.evidenceAccordionChevron}>{rerouteEvidenceOpen ? "−" : "+"}</Text>
                  </TouchableOpacity>

                  {rerouteEvidenceOpen ? (
                    <View style={styles.resultPanel}>
                      <TextAreaInput
                        label="Original rotation details"
                        value={rerouteOriginalRotationText}
                        onChangeText={setRerouteOriginalRotationText}
                        placeholder="Optional. Paste original MiCrew text, original credit, report/release, or the original leg string."
                        autoCapitalize="sentences"
                      />
                      <TextAreaInput
                        label="Changed rotation details"
                        value={rerouteChangedRotationText}
                        onChangeText={setRerouteChangedRotationText}
                        placeholder="Optional. Paste changed MiCrew text if it differs from the main intake block."
                        autoCapitalize="sentences"
                      />
                    </View>
                  ) : null}

                  <View style={styles.rerouteButtonRow}>
                    <TouchableOpacity
                      style={[styles.auditButton, rerouteAnalyzeBusy && styles.auditButtonDisabled]}
                      disabled={rerouteAnalyzeBusy}
                      onPress={() => {
                        void analyzeReroute();
                      }}
                    >
                      <Text style={styles.auditButtonText}>
                        {rerouteAnalyzeBusy ? "Analyzing..." : "Analyze reroute"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryActionButton} onPress={clearRerouteAnalyzer}>
                      <Text style={styles.secondaryActionButtonText}>Clear</Text>
                    </TouchableOpacity>
                  </View>

                  {rerouteAnalyzeBusy &&
                  (rerouteOriginalScreenshots.length > 0 || rerouteChangedScreenshots.length > 0) ? (
                    <Text style={styles.resultSupportMetaText}>
                      Reading MiCrew screenshots... this can take a few seconds.
                    </Text>
                  ) : null}

                  {rerouteAnalyzeError ? (
                    <View style={styles.resultPanel}>
                      <Text style={styles.warningBadge}>Warning</Text>
                      <Text style={styles.insightText}>{rerouteAnalyzeError}</Text>
                    </View>
                  ) : null}

                  {rerouteRenderModel ? (
                    <View style={styles.sectionStack}>
                      <View style={styles.resultPanel}>
                        <Text
                          style={[
                            styles.statusBadge,
                            rerouteRenderModel.status === "resolved"
                              ? styles.statusBadgeResolved
                              : rerouteRenderModel.status === "warning"
                                ? styles.statusBadgeWarning
                                : styles.statusBadgeCaution,
                          ]}
                        >
                          {rerouteRenderModel.status === "resolved"
                            ? "Resolved"
                            : rerouteRenderModel.status === "warning"
                              ? "Warning"
                              : "Caution"}
                        </Text>
                        <ResultLine label="Likely issue" value={rerouteRenderModel.likelyIssue} emphasis />
                        <ResultLine label="Estimated additional pay" value={rerouteRenderModel.estimatedPayLabel} />
                        <Text style={styles.resultSummaryText}>{rerouteRenderModel.shortAnswer}</Text>
                        {rerouteRenderModel.renderError ? (
                          <Text style={styles.resultSupportMetaText}>
                            Analyzer returned a result, but the UI could not render one section. {rerouteRenderModel.renderError}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.resultPanel}>
                        <Text style={styles.inputLabel}>Pay items by rule</Text>
                        {rerouteRenderModel.payItems.length > 0 ? (
                          rerouteRenderModel.payItems.map((item) => (
                            <View key={`${String(item.rule)}-${String(item.label)}-${String(item.math)}`} style={styles.rerouteSupportCard}>
                              <ResultLine
                                label={`${String(item.rule ?? "Rule")} • ${String(item.label ?? "Pay item")}`}
                                value={typeof item.minutes === "number" ? rerouteFormatMinutes(item.minutes) : "Need more facts"}
                              />
                              <Text style={styles.resultBodyText}>{String(item.math ?? "Missing pay-item math.")}</Text>
                              <Text style={styles.resultSupportMetaText}>{String(item.sourceAnchor ?? "")}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.resultBodyText}>
                            No deterministic pay item is fully calculable yet from the current facts.
                          </Text>
                        )}
                      </View>

                      {(rerouteOriginalScreenshots.length > 0 ||
                        rerouteChangedScreenshots.length > 0 ||
                        rerouteRenderModel.screenshotSummary) ? (
                        <View style={styles.resultPanel}>
                          <Text style={styles.inputLabel}>Screenshot parsing</Text>
                          {rerouteRenderModel.screenshotSummary ? (
                            <Text style={styles.resultBodyText}>
                              {rerouteRenderModel.screenshotSummary.screenshotParsingActive ? "Active" : "Inactive"}
                            </Text>
                          ) : (
                            <Text style={styles.resultBodyText}>Parser summary missing from API response.</Text>
                          )}
                          <Text style={styles.resultSupportMetaText}>
                            original screenshots attached in UI:{" "}
                            {String(rerouteRenderModel.requestImageDiagnostics?.originalScreenshotsAttached ?? rerouteOriginalScreenshots.length)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            changed screenshots attached in UI:{" "}
                            {String(rerouteRenderModel.requestImageDiagnostics?.changedScreenshotsAttached ?? rerouteChangedScreenshots.length)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            first original dataUrl starts data:image/:{" "}
                            {String(
                              rerouteRenderModel.requestImageDiagnostics?.firstOriginalStartsWithDataImage ??
                                (rerouteOriginalScreenshots[0]?.dataUrl.startsWith("data:image/") ?? false),
                            )}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            first changed dataUrl starts data:image/:{" "}
                            {String(
                              rerouteRenderModel.requestImageDiagnostics?.firstChangedStartsWithDataImage ??
                                (rerouteChangedScreenshots[0]?.dataUrl.startsWith("data:image/") ?? false),
                            )}
                          </Text>
                          {rerouteRenderModel.requestImageDiagnostics?.originalCompressedBytes?.length ? (
                            <Text style={styles.resultSupportMetaText}>
                              original compressed bytes: {rerouteRenderModel.requestImageDiagnostics.originalCompressedBytes.join(", ")}
                            </Text>
                          ) : null}
                          {rerouteRenderModel.requestImageDiagnostics?.changedCompressedBytes?.length ? (
                            <Text style={styles.resultSupportMetaText}>
                              changed compressed bytes: {rerouteRenderModel.requestImageDiagnostics.changedCompressedBytes.join(", ")}
                            </Text>
                          ) : null}
                          {!rerouteRenderModel.screenshotSummary ? null : (
                            <>
                          <Text style={styles.resultSupportMetaText}>
                            screenshotParsingActive: {String(rerouteRenderModel.screenshotSummary.screenshotParsingActive)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            original image count received: {String(rerouteRenderModel.screenshotSummary.originalImagesReceived)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            changed image count received: {String(rerouteRenderModel.screenshotSummary.changedImagesReceived)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            first original image name: {rerouteRenderModel.screenshotSummary.firstOriginalImageName || "Unknown"}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            first changed image name: {rerouteRenderModel.screenshotSummary.firstChangedImageName || "Unknown"}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            first original starts data:image/: {String(rerouteRenderModel.screenshotSummary.firstOriginalStartsWithDataImage)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            first changed starts data:image/: {String(rerouteRenderModel.screenshotSummary.firstChangedStartsWithDataImage)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            vision model called: {rerouteRenderModel.screenshotSummary.visionModelCalled ? "yes" : "no"}
                          </Text>
                          {rerouteRenderModel.screenshotSummary.modelSelected ? (
                            <Text style={styles.resultSupportMetaText}>
                              model: {rerouteRenderModel.screenshotSummary.modelSelected}
                            </Text>
                          ) : null}
                          <Text style={styles.resultSupportMetaText}>
                            original screenshots read: {String(rerouteRenderModel.screenshotSummary.originalScreenshotsRead)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            changed screenshots read: {String(rerouteRenderModel.screenshotSummary.changedScreenshotsRead)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Parse confidence: {rerouteRenderModel.screenshotSummary.parseConfidence}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Rotations parsed: {String(rerouteRenderModel.screenshotSummary.rotationCount)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Legs detected: {String(rerouteRenderModel.screenshotSummary.legsDetected)}
                          </Text>
                          <Text style={styles.resultSupportMetaText}>
                            Fallback regex legs parsed: {String(rerouteRenderModel.screenshotSummary.fallbackRegexLegsParsed)}
                          </Text>
                          {rerouteRenderModel.screenshotSummary.extractionNotes.map((item) => (
                            <Text key={item} style={styles.resultSupportMetaText}>{item}</Text>
                          ))}
                          {rerouteRenderModel.screenshotSummary.missingParseItems.length > 0 ? (
                            <View style={styles.sectionStack}>
                              {rerouteRenderModel.screenshotSummary.missingParseItems.map((item) => (
                                <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                              ))}
                            </View>
                          ) : null}
                          {rerouteRenderModel.screenshotSummary.structuredJsonParseError ? (
                            <Text style={styles.resultBodyText}>
                              Structured JSON parse error: {rerouteRenderModel.screenshotSummary.structuredJsonParseError}
                            </Text>
                          ) : null}
                          {rerouteRenderModel.screenshotSummary.rawVisionResponsePreview.length > 0 ? (
                            <View style={styles.sectionStack}>
                              <Text style={styles.inputLabel}>Raw vision response preview</Text>
                              {rerouteRenderModel.screenshotSummary.rawVisionResponsePreview.map((item, index) => (
                                <Text key={`vision-${index}-${item.slice(0, 24)}`} style={styles.resultBodyText}>
                                  {item}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                          {rerouteRenderModel.screenshotSummary.rawTextPreview.length > 0 ? (
                            <View style={styles.sectionStack}>
                              <Text style={styles.inputLabel}>Raw text preview</Text>
                              {rerouteRenderModel.screenshotSummary.rawTextPreview.map((item, index) => (
                                <Text key={`${index}-${item.slice(0, 24)}`} style={styles.resultBodyText}>
                                  {item}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                            </>
                          )}
                        </View>
                      ) : null}

                      <TouchableOpacity
                        style={styles.evidenceAccordion}
                        onPress={() => setRerouteDetectedFactsOpen((current) => !current)}
                      >
                        <Text style={styles.evidenceAccordionTitle}>Review detected facts</Text>
                        <Text style={styles.evidenceAccordionChevron}>{rerouteDetectedFactsOpen ? "−" : "+"}</Text>
                      </TouchableOpacity>

                      {rerouteDetectedFactsOpen ? (
                        <View key={`detected-facts-${rerouteRenderModel.resultAnalysisId}`} style={styles.resultPanel}>
                          {__DEV__ ? (
                            <Text style={styles.resultSupportMetaText}>
                              analysis {String(rerouteRenderModel.currentAnalysisId)} / result {String(rerouteRenderModel.resultAnalysisId)} / facts {rerouteRenderModel.detectedFactsSource}
                            </Text>
                          ) : null}
                          {rerouteRenderModel.screenshotSummary ? (
                            <View style={styles.sectionStack}>
                              <Text style={styles.inputLabel}>Screenshot parser diagnostics</Text>
                              <Text style={styles.resultSupportMetaText}>
                                screenshotParsingActive: {String(rerouteRenderModel.screenshotSummary.screenshotParsingActive)}
                              </Text>
                              <Text style={styles.resultSupportMetaText}>
                                original screenshot count: {String(rerouteRenderModel.screenshotSummary.originalScreenshotsRead)}
                              </Text>
                              <Text style={styles.resultSupportMetaText}>
                                changed screenshot count: {String(rerouteRenderModel.screenshotSummary.changedScreenshotsRead)}
                              </Text>
                              <Text style={styles.resultSupportMetaText}>
                                parse confidence: {rerouteRenderModel.screenshotSummary.parseConfidence}
                              </Text>
                              <Text style={styles.resultSupportMetaText}>
                                rotations parsed: {String(rerouteRenderModel.screenshotSummary.rotationCount)}
                              </Text>
                              <Text style={styles.resultSupportMetaText}>
                                legs parsed: {String(rerouteRenderModel.screenshotSummary.legsDetected)}
                              </Text>
                              <Text style={styles.resultSupportMetaText}>
                                fallback regex legs parsed: {String(rerouteRenderModel.screenshotSummary.fallbackRegexLegsParsed)}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.formRow}>
                            <ResultLine
                              label="Pilot status"
                              value={rerouteRenderModel.currentDetectedFacts.pilotStatus || "Unknown"}
                            />
                            <ResultLine
                              label="Reroute timing"
                              value={rerouteDetectedTiming.replaceAll("_", " ") || "Unknown"}
                            />
                          </View>
                          <View style={styles.formRow}>
                            <ResultLine
                              label="Affected original portion"
                              value={rerouteRenderModel.currentDetectedFacts.affectedOriginalPortion || "Unknown"}
                            />
                            <ResultLine
                              label="Rerouted portion"
                              value={rerouteRenderModel.currentDetectedFacts.reroutedPortion || "Unknown"}
                            />
                          </View>
                          <View style={styles.formRow}>
                            <ResultLine
                              label="Original affected block/credit"
                              value={rerouteFormatMinutes(rerouteRenderModel.currentDetectedFacts.originalAffectedMinutes) || "Unknown"}
                            />
                            <ResultLine
                              label="Rerouted block/credit"
                              value={rerouteFormatMinutes(rerouteRenderModel.currentDetectedFacts.reroutedMinutes) || "Unknown"}
                            />
                          </View>
                          <View style={styles.formRow}>
                            <ResultLine
                              label="Rejoin point"
                              value={rerouteRenderModel.currentDetectedFacts.rejoinPoint || "Unknown"}
                            />
                            <ResultLine
                              label="Break in duty"
                              value={
                                rerouteRenderModel.currentDetectedFacts.breakInDuty == null
                                  ? "Unknown"
                                  : rerouteRenderModel.currentDetectedFacts.breakInDuty
                                    ? "Yes"
                                    : "No"
                              }
                            />
                          </View>
                          <View style={styles.formRow}>
                            <ResultLine
                              label="X-day / non-fly affected"
                              value={
                                rerouteRenderModel.currentDetectedFacts.touchedXDay == null
                                  ? "Unknown"
                                  : rerouteRenderModel.currentDetectedFacts.touchedXDay
                                    ? "Yes"
                                    : "No"
                              }
                            />
                            <ResultLine
                              label="Release more than 4h late"
                              value={
                                rerouteRenderModel.currentDetectedFacts.releaseMoreThanFourHoursLate == null
                                  ? "Unknown"
                                  : rerouteRenderModel.currentDetectedFacts.releaseMoreThanFourHoursLate
                                    ? "Yes"
                                    : "No"
                              }
                            />
                          </View>
                          <View style={styles.formRow}>
                            <ResultLine
                              label="Ocean / 25h threshold"
                              value={
                                rerouteRenderModel.currentDetectedFacts.oceanCrossing == null
                                  ? "Unknown"
                                  : rerouteRenderModel.currentDetectedFacts.oceanCrossing
                                    ? "Yes"
                                    : "No"
                              }
                            />
                          </View>
                          {rerouteRenderModel.screenshotSummary?.parsedLegs.length ? (
                            <View style={styles.sectionStack}>
                              <Text style={styles.inputLabel}>Parsed legs</Text>
                              {rerouteRenderModel.screenshotSummary.parsedLegs.map((leg, index) => {
                                const origin = typeof leg.origin === "string" ? leg.origin : "";
                                const destination = typeof leg.destination === "string" ? leg.destination : "";
                                const route =
                                  origin && destination
                                    ? `${origin}-${destination}`
                                    : typeof leg.flightNumber === "string"
                                      ? leg.flightNumber
                                      : "Unknown";
                                const legType =
                                  typeof leg.type === "string"
                                    ? leg.type === "deadhead"
                                      ? "DH"
                                      : leg.type === "flight"
                                        ? "Flight"
                                        : "Leg"
                                    : "Leg";
                                const dep = typeof leg.depTime === "string" ? leg.depTime : "";
                                const arr = typeof leg.arrTime === "string" ? leg.arrTime : "";
                                const block =
                                  typeof leg.blockMinutes === "number"
                                    ? rerouteFormatMinutes(leg.blockMinutes)
                                    : "Unknown";
                                const turn =
                                  typeof leg.turnMinutes === "number"
                                    ? rerouteFormatMinutes(leg.turnMinutes)
                                    : "Unknown";
                                const sourceType =
                                  typeof leg.sourceType === "string"
                                    ? leg.sourceType === "rerouted"
                                      ? "changed"
                                      : leg.sourceType
                                    : "unknown";
                                const flightNumber =
                                  typeof leg.flightNumber === "string" ? leg.flightNumber : "";
                                const imageIndex =
                                  typeof leg.sourceImageIndex === "number" ? leg.sourceImageIndex : undefined;
                                const classification =
                                  typeof leg.classification === "string" ? leg.classification : "";
                                const classificationReason =
                                  typeof leg.classificationReason === "string" ? leg.classificationReason : "";
                                return (
                                  <Text key={`${route}-${dep}-${arr}-${index}`} style={styles.resultBodyText}>
                                    • {sourceType} • {legType}
                                    {flightNumber ? ` ${flightNumber}` : ""} {route}
                                    {dep || arr ? ` ${dep || "?"}-${arr || "?"}` : ""} • Block {block}
                                    {imageIndex != null ? ` • image ${imageIndex + 1}` : ""} • Turn {turn}
                                    {classification ? ` • ${classification}` : ""}
                                    {classificationReason ? ` • ${classificationReason}` : ""}
                                  </Text>
                                );
                              })}
                            </View>
                          ) : rerouteRenderModel.detectedLegs.length > 0 ? (
                            <View style={styles.sectionStack}>
                              <Text style={styles.inputLabel}>Parsed legs</Text>
                              {rerouteRenderModel.detectedLegs.map((leg, index) => {
                                const origin = typeof leg.origin === "string" ? leg.origin : "";
                                const destination = typeof leg.destination === "string" ? leg.destination : "";
                                const route =
                                  origin && destination
                                    ? `${origin}-${destination}`
                                    : typeof leg.flightNumber === "string"
                                      ? leg.flightNumber
                                      : "Unknown";
                                const dep = typeof leg.departureTime === "string" ? leg.departureTime : "";
                                const arr = typeof leg.arrivalTime === "string" ? leg.arrivalTime : "";
                                const block =
                                  typeof leg.blockMinutes === "number"
                                    ? rerouteFormatMinutes(leg.blockMinutes)
                                    : "Unknown";
                                return (
                                  <Text key={`${route}-${dep}-${arr}-${index}`} style={styles.resultBodyText}>
                                    • {route}
                                    {dep || arr ? ` ${dep || "?"}-${arr || "?"}` : ""} • Block {block}
                                  </Text>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {rerouteRenderModel.whatControlsLines.length > 0 || rerouteRenderModel.supportCards.length > 0 ? (
                        <View style={styles.resultPanel}>
                          <Text style={styles.inputLabel}>What controls</Text>
                          {rerouteRenderModel.whatControlsLines.map((item) => (
                            <Text key={item} style={styles.controlsPrimaryText}>{item}</Text>
                          ))}
                        </View>
                      ) : null}

                      <View style={styles.resultPanel}>
                        <Text style={styles.inputLabel}>
                          {rerouteRenderModel.payItems.length > 0 && rerouteRenderModel.coreMissingFacts.length === 0 && rerouteRenderModel.additionalPremiumMissingFacts.length > 0
                            ? "Needed only to check additional late-release premium"
                            : "Missing facts"}
                        </Text>
                        {(rerouteRenderModel.payItems.length > 0 && rerouteRenderModel.coreMissingFacts.length === 0
                          ? rerouteRenderModel.additionalPremiumMissingFacts
                          : rerouteRenderModel.focusedQuestions
                        ).length > 0 ? (
                          (rerouteRenderModel.payItems.length > 0 && rerouteRenderModel.coreMissingFacts.length === 0
                            ? rerouteRenderModel.additionalPremiumMissingFacts
                            : rerouteRenderModel.focusedQuestions
                          ).map((item) => (
                            <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                          ))
                        ) : (
                          <Text style={styles.resultBodyText}>• No critical missing facts identified from the current input.</Text>
                        )}
                      </View>

                      <View style={styles.resultPanel}>
                        <Text style={styles.inputLabel}>Calculation steps</Text>
                        {rerouteRenderModel.calculationSteps.map((item) => (
                          <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                        ))}
                      </View>

                      {rerouteRenderModel.warnings.length > 0 ? (
                        <View style={styles.resultPanel}>
                          <Text style={styles.inputLabel}>Warnings</Text>
                          {rerouteRenderModel.warnings.map((item) => (
                            <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                          ))}
                        </View>
                      ) : null}

                      <View style={styles.resultPanel}>
                        <Text style={styles.inputLabel}>What this depends on</Text>
                        {rerouteRenderModel.whatThisDependsOn.map((item) => (
                          <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                        ))}
                      </View>

                      <View style={styles.resultPanel}>
                        <Text style={styles.inputLabel}>Likely paths</Text>
                        {rerouteRenderModel.likelyPaths.map((item) => (
                          <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                        ))}
                      </View>

                      <View style={styles.resultPanel}>
                        <Text style={styles.inputLabel}>What to check</Text>
                        {rerouteRenderModel.whatToCheck.map((item) => (
                          <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                        ))}
                      </View>

                      {rerouteRenderModel.sourceLimitations.length > 0 ? (
                        <View style={styles.resultPanel}>
                          <Text style={styles.inputLabel}>Source limitations</Text>
                          {rerouteRenderModel.sourceLimitations.map((item) => (
                            <Text key={item} style={styles.resultBodyText}>• {item}</Text>
                          ))}
                        </View>
                      ) : null}

                      <TouchableOpacity
                        style={styles.evidenceAccordion}
                        onPress={() => setRerouteSupportOpen((current) => !current)}
                      >
                        <Text style={styles.evidenceAccordionTitle}>Show contract support</Text>
                        <Text style={styles.evidenceAccordionChevron}>{rerouteSupportOpen ? "−" : "+"}</Text>
                      </TouchableOpacity>

                      {rerouteSupportOpen ? (
                        <View style={styles.resultPanel}>
                          <Text style={styles.inputLabel}>Contract support</Text>
                          {rerouteRenderModel.factsUsed.length > 0 ? (
                            <View style={styles.rerouteFactsUsedBlock}>
                              {rerouteRenderModel.factsUsed.map((item) => (
                                <Text key={item} style={styles.resultSupportMetaText}>• {item}</Text>
                              ))}
                            </View>
                          ) : null}
                          {rerouteRenderModel.supportCards.length > 0 ? (
                            rerouteRenderModel.supportCards.map((card) => (
                              <View key={`${String(card.sourceName)}-${String(card.section)}`} style={styles.rerouteSupportCard}>
                                <ResultLine label={`${String(card.sourceName ?? "Source")} • ${String(card.section ?? "Section")}`} value={typeof card.title === "string" ? card.title : "Support"} />
                                {typeof card.quoteSnippet === "string" && card.quoteSnippet ? (
                                  <Text style={styles.resultBodyText}>{card.quoteSnippet}</Text>
                                ) : null}
                                {typeof card.note === "string" && card.note ? <Text style={styles.resultSupportMetaText}>{card.note}</Text> : null}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.resultBodyText}>No support cards were attached from the current indexed sources.</Text>
                          )}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </>
            ) : selectedPayTool === "timecard-auditor" ? (
              <>
            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>1. Paste Delta Monthly Timecard</Text>
              <TextAreaInput
                label="Raw timecard text"
                value={timecardRawInput}
                onChangeText={setTimecardRawInput}
                placeholder="Paste the Delta Monthly Time Data text here. The app will parse premium lines, trigger values, payback days, and key audit clues."
              />
              <TouchableOpacity
                style={[
                  styles.auditButton,
                  !parsedTimecard && styles.auditButtonDisabled,
                ]}
                disabled={!parsedTimecard}
                onPress={() => {
                  if (!parsedTimecard) {
                    return;
                  }
                  const parsedAuditBaseHours =
                    parsedApplicableBaseCreditHours ||
                    parsedTotalCreditHours + parsedVacationCreditHours;
                  setCreditedHours(parsedAuditBaseHours.toFixed(2));
                  setPremiumHours(parsedTimecard.premiumHoursTotal.toFixed(2));
                  setPremiumType(parsedPremiumType);
                  setTimecardAuditRequested(true);
                }}
              >
                <Text style={styles.auditButtonText}>Audit Timecard</Text>
              </TouchableOpacity>
              {timecardAuditRequested && parsedTimecard ? (
                <View style={styles.auditSummaryHero}>
                  <View style={styles.auditSummaryHeader}>
                    <Text style={styles.auditSummaryTitle}>
                      {payAuditResult.findings.some((finding) => finding.severity === "high")
                        ? "Likely incorrect"
                        : payAuditResult.findings.length > 0
                          ? "Needs review"
                          : "Looks correct so far"}
                    </Text>
                    <Text style={styles.auditSummaryMeta}>
                      {payAuditResult.findings.length} potential discrepancy
                      {payAuditResult.findings.length === 1 ? "" : "ies"}
                    </Text>
                  </View>
                  <View style={styles.auditSummaryMetrics}>
                    <SnapshotPill label="Total Credit" value={`${displayedTotalCreditHours.toFixed(2)} hrs`} />
                  </View>
                  <Text style={styles.auditSummaryFormula}>
                    {`${formatHoursToClock(displayedDueCreditHours)} base`}
                    {parsedAdditionalPayOnlyHours > 0
                      ? ` + ${formatHoursToClock(parsedAdditionalPayOnlyHours)} addtl`
                      : ""}
                    {displayedPremiumCreditHours > 0
                      ? ` + ${formatHoursToClock(displayedPremiumCreditHours)} premium`
                      : ""}
                    {` = ${formatHoursToClock(displayedTotalCreditHours)} total`}
                  </Text>
                </View>
              ) : null}
              {timecardAuditRequested && parsedTimecard ? (
                <View style={styles.resultPanel}>
                  <Text style={styles.inputLabel}>2. What The Auditor Saw</Text>
                  <ResultLine label="Pilot / bid period" value={`${parsedTimecard.pilotName ?? "Unknown"} • ${parsedTimecard.bidPeriod ?? "Unknown period"}`} />
                  <ResultLine
                    label="Category / listed ALV"
                    value={`${parsedTimecard.categoryCode ?? "Unknown"} • ${parsedTimecard.alv ?? "Unknown ALV"}`}
                  />
                  {parsedApplicableBaseCreditHours > 0 ? (
                    <ResultLine
                      label="Base month credit"
                      value={parsedTimecard.creditApplicableToRegGs ?? "Unknown"}
                    />
                  ) : null}
                  <ResultLine
                    label="Total credit on card"
                    value={parsedTimecard.totalCredit ?? "Unknown"}
                  />
                  {parsedVacationCreditHours > 0 ? (
                    <ResultLine
                      label="Vacation used in month"
                      value={parsedTimecard.vacationCreditUsed ?? "0:00"}
                    />
                  ) : null}
                  {parsedAdditionalPayOnlyHours > 0 ? (
                    <ResultLine
                      label="Additional pay only from activity rows"
                      value={parsedTimecard.additionalPayOnlyTotal ?? "0:00"}
                    />
                  ) : null}
                  <ResultLine
                    label="Detected month type"
                    value={
                      parsedTimecard.scheduleStatus === "reserve"
                        ? "Reserve"
                        : parsedTimecard.scheduleStatus === "lineholder"
                          ? "Lineholder"
                          : "Unknown"
                    }
                  />
                  <ResultLine label="Pasted premium credit" value={`${parsedTimecard.premiumHoursTotal.toFixed(2)} hrs`} />
                  <ResultLine
                    label="Derived posted premium"
                    value={formatCurrency(parsedPremiumPayEquivalent)}
                  />
                  <ResultLine
                    label="Premium lines found"
                    value={`GS ${parsedTimecard.gsSlipPay ?? "0:00"} • QS ${parsedTimecard.quickSlipPay ?? "0:00"} • SS ${parsedTimecard.silverSlipPay ?? "0:00"} • RES G/Q ${parsedTimecard.reserveAssignGqSlipPay ?? "0:00"}`}
                  />
                  <ResultLine
                    label="Sick / payback clues"
                    value={`Sick entries ${parsedTimecard.sickEntries} • Sick bank deduction ${parsedTimecard.sickBankDeduction ?? "0:00"} • Payback days ${parsedTimecard.paybackDaysAvailable ?? 0}`}
                  />
                  <ResultLine
                    label="Contract clue"
                    value={
                      parsedTimecard.sickEntries > 0
                        ? "Section 14 E.2 sick bank deduction / Section 23 premium flying / MOU #25-05 quick-slip improvements"
                        : "Section 23 premium flying / MOU #25-05 quick-slip improvements"
                    }
                  />
                  <Text style={styles.insightText}>
                    This paste-in flow uses the Delta timecard as posted evidence. If the findings say
                    `Likely incorrect`, the rule line below is the reference a pilot can start with when
                    disputing the pay result.
                  </Text>
                </View>
              ) : null}
            </View>
            {timecardAuditRequested ? (
              <>
                <View style={styles.resultPanel}>
                  <Text style={styles.inputLabel}>3. What The Auditor Thinks Is Due</Text>
                  {parsedApplicableBaseCreditHours > 0 && parsedVacationCreditHours > 0 ? (
                    <ResultLine
                      label="Base Credit Before Vacation"
                      value={`${parsedDerivedBaseBeforeVacationHours.toFixed(2)} hrs`}
                    />
                  ) : null}
                  {parsedVacationCreditHours > 0 ? (
                    <ResultLine
                      label="Vacation Credit Added"
                      value={`${parsedVacationCreditHours.toFixed(2)} hrs`}
                    />
                  ) : null}
                  <ResultLine
                    label="Base Month Credit"
                    value={`${displayedDueCreditHours.toFixed(2)} hrs`}
                  />
                  {parsedAdditionalPayOnlyHours > 0 ? (
                    <ResultLine
                      label="Additional Pay Only Credit"
                      value={`${parsedAdditionalPayOnlyHours.toFixed(2)} hrs`}
                    />
                  ) : null}
                  <ResultLine
                    label="Premium Credit Due"
                    value={`${displayedPremiumCreditHours.toFixed(2)} hrs`}
                  />
                  <ResultLine
                    label="Total Credit Due"
                    value={`${displayedTotalCreditHours.toFixed(2)} hrs`}
                    emphasis
                  />
                </View>
                <View style={styles.sectionStack}>
                  <Text style={styles.inputLabel}>4. Discrepancies</Text>
                  {payAuditResult.findings.length > 0 ? (
                    payAuditResult.findings.map((finding) => (
                      <View key={finding.id} style={styles.resultPanel}>
                        <ResultLine
                          label={`${finding.severity.toUpperCase()} • ${finding.confidence} confidence`}
                          value={finding.title}
                          emphasis
                        />
                        <ResultLine
                          label="Expected vs actual"
                          value={`${formatCurrency(finding.expectedAmount ?? 0)} / ${formatCurrency(
                            finding.actualAmount ?? 0
                          )}`}
                        />
                        <ResultLine
                          label="Variance"
                          value={`${finding.variance != null && finding.variance >= 0 ? "+" : "-"}${formatCurrency(
                            Math.abs(finding.variance ?? 0)
                          )}`}
                        />
                        <ResultLine label="Contract / rule" value={finding.ruleRef} />
                        <Text style={styles.insightText}>{finding.explanation}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.resultPanel}>
                      <Text style={styles.insightText}>
                        No discrepancies are flagged by the current rule set. That does not guarantee the
                        month is clean yet, but the auditor does not see an obvious mismatch from the
                        pasted timecard and current assumptions.
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.sectionStack}>
                  <Text style={styles.inputLabel}>Refine Audit Inputs</Text>
                  <FormRow>
                    <LabeledInput label="Hourly Rate" value={hourlyRate} onChangeText={setHourlyRate} prefix="$" />
                    <LabeledInput label="Credited Hours" value={creditedHours} onChangeText={setCreditedHours} />
                  </FormRow>
                  <FormRow>
                    <LabeledInput label="Premium Hours" value={premiumHours} onChangeText={setPremiumHours} />
                  </FormRow>
                  <Text style={styles.inputLabel}>Premium Event</Text>
                  <View style={styles.baseSelector}>
                    {premiumTypeOptions.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[styles.baseChip, premiumType === option.key && styles.baseChipActive]}
                        onPress={() => {
                          setPremiumType(option.key);
                          if (option.key === "none") {
                            setPremiumHours("0");
                          } else if ((Number(premiumHours) || 0) === 0) {
                            setPremiumHours("5");
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.baseChipLabel,
                            premiumType === option.key && styles.baseChipLabelActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <FormRow>
                    <LabeledInput label="Missed Break Pay" value={missedBreakPay} onChangeText={setMissedBreakPay} prefix="$" />
                    <LabeledInput label="Actual Base Pay" value={actualBasePay} onChangeText={setActualBasePay} prefix="$" />
                  </FormRow>
                  <FormRow>
                    <LabeledInput label="Actual Premium Pay" value={actualPremiumPay} onChangeText={setActualPremiumPay} prefix="$" />
                    <LabeledInput label="Actual Per Diem" value={actualPerDiem} onChangeText={setActualPerDiem} prefix="$" />
                  </FormRow>
                  <FormRow>
                    <LabeledInput label="Actual Adjustments" value={actualAdjustments} onChangeText={setActualAdjustments} prefix="$" />
                    <LabeledInput label="Posted Total" value={actualPostedTotal} onChangeText={setActualPostedTotal} prefix="$" />
                  </FormRow>
                  <Text style={styles.inputLabel}>Status This Month</Text>
                  <View style={styles.baseSelector}>
                    <TouchableOpacity
                      style={[styles.baseChip, !reserveStatus && styles.baseChipActive]}
                      onPress={() => setReserveStatus(false)}
                    >
                      <Text style={[styles.baseChipLabel, !reserveStatus && styles.baseChipLabelActive]}>
                        Lineholder
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.baseChip, reserveStatus && styles.baseChipActive]}
                      onPress={() => setReserveStatus(true)}
                    >
                      <Text style={[styles.baseChipLabel, reserveStatus && styles.baseChipLabelActive]}>
                        Reserve
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.sectionStack}>
                  <Text style={styles.inputLabel}>Rules Ledger Assumptions</Text>
                  {payAuditResult.assumptions.map((assumption) => (
                    <View key={assumption} style={styles.resultPanel}>
                      <Text style={styles.insightText}>{assumption}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
              </>
            ) : (
              <View style={styles.payToolPlaceholder}>
                <Text style={styles.payToolPlaceholderTitle}>
                  {payToolCards.find((tool) => tool.key === selectedPayTool)?.title ?? "Pay Tool"}
                </Text>
                <Text style={styles.payToolPlaceholderText}>
                  This tool is queued behind the timecard auditor. It will reuse the same Delta-first
                  parser, rules ledger, and contract-reference explanation model that the auditor is
                  already using.
                </Text>
              </View>
            )}
          </SectionCard>
        )}

        {activeTab === "seniority" && (
          <SectionCard
            title="Seniority"
            description="Green means you can hold it. Neutral means it is close. Red means the category is still senior to you. Current marks your present category."
          >
            <FormRow>
              <LabeledInput
                label="Employee Number"
                value={employeeNumberInput}
                onChangeText={setEmployeeNumberInput}
              />
              <LabeledInput
                label="Search Base or Fleet"
                value={categorySearch}
                onChangeText={setCategorySearch}
                keyboardType="default"
              />
            </FormRow>

            <Text style={styles.inputLabel}>Base Filter</Text>
            <View style={styles.baseSelector}>
              {aeBaseFilters.map((base) => (
                <TouchableOpacity
                  key={base}
                  style={[styles.baseChip, selectedCategoryBaseFilter === base && styles.baseChipActive]}
                  onPress={() => setSelectedCategoryBaseFilter(base)}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      selectedCategoryBaseFilter === base && styles.baseChipLabelActive,
                    ]}
                  >
                    {base}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Seat Filter</Text>
            <View style={styles.baseSelector}>
              {seatFilters.map((seat) => (
                <TouchableOpacity
                  key={seat}
                  style={[styles.baseChip, categorySeatFilter === seat && styles.baseChipActive]}
                  onPress={() => setCategorySeatFilter(seat)}
                >
                  <Text style={[styles.baseChipLabel, categorySeatFilter === seat && styles.baseChipLabelActive]}>
                    {seat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.legendRow}>
              <LegendSwatch label="Can Hold" color="#D8EFD2" />
              <LegendSwatch label="Senior to You" color="#F8E1E5" />
              <LegendSwatch label="Current" color="#D8CDB8" border />
            </View>

            {currentPilot ? (
              <View style={styles.identityCard}>
                <Text style={styles.identityName}>{currentPilot.name}</Text>
                <Text style={styles.identityMeta}>
                  Current category {currentPilot.currentCategoryCode} • Seniority #{currentPilot.seniorityNumber}
                </Text>
              </View>
            ) : null}

            <View style={styles.sectionStack}>
              {groupedCategoryTables.map((group) => {
                const captainRows = group.rows.filter((entry) => entry.seat === "Captain");
                const firstOfficerRows = group.rows.filter((entry) => entry.seat === "First Officer");
                return (
                <View key={group.base} style={styles.tableCard}>
                  <Text style={styles.tableTitle}>{group.base}</Text>
                  <Text style={styles.tableMeta}>
                    Current pilots {group.summary.currentPilots} • Projected pilots {group.summary.projectedPilots} ({formatSignedCount(group.summary.projectedDelta)})
                  </Text>
                  {!isCompactMobile ? (
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                      <Text style={styles.tableHeaderCell}>SR</Text>
                      <Text style={styles.tableHeaderCell}>MID</Text>
                      <Text style={styles.tableHeaderCell}>JR</Text>
                      <Text style={styles.tableHeaderCell}>You</Text>
                    </View>
                  ) : null}
                  <Text style={styles.seatSectionLabel}>Captain</Text>
                  {captainRows.map((entry) => {
                    const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
                    const trend = categoryTrendMap.get(entry.key) ?? null;
                    const categoryAssignments = categoryAssignmentsByKey.get(entry.key) ?? [];
                    const userPosition = describeUserCategoryPosition(
                      entry,
                      fit,
                      userSeniorityNumber,
                      currentPilot,
                      categoryAssignments
                    );
                    return (
                      <TouchableOpacity
                        key={entry.key}
                        style={[
                          isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                          rowStyleForHold(fit.label),
                        ]}
                        onPress={() =>
                          setSelectedCategoryDetail({
                            categoryKey: entry.key,
                            label: formatCategoryEntryCode(entry),
                          })
                        }
                        activeOpacity={0.88}
                      >
                        {isCompactMobile ? (
                          <InstrumentCategoryCard
                            title={`${entry.fleet} ${entry.seat === "Captain" ? "CA" : "FO"}`}
                            status={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).status}
                            tone={toneForPilotStatus(fit.label === "Current category" ? "Can Hold" : fit.label)}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).badgeLabel}
                            statPairs={[
                              { label: "SR", value: `#${entry.mostSeniorNumber}` },
                              { label: "MID", value: entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-" },
                              { label: "JUNIOR", value: `#${entry.mostJuniorNumber}` },
                              { label: "YOU", value: `${userPosition.secondary ?? userPosition.primary}${formatSignedChange(trend?.lineMovement ?? null, "#") ? ` ${formatSignedChange(trend?.lineMovement ?? null, "#")}` : ""}` },
                            ]}
                            footer="Tap for details"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>
                                {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                              </Text>
                              <Text style={styles.tableSubtext}>{fit.label === "Can Hold" || fit.label === "Current category" ? "CAN HOLD • Tap for details" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for details" : `${fit.label.toUpperCase()} • Tap for details`}</Text>
                            </View>
                            <TableValueCell primary={`#${entry.mostSeniorNumber}`} />
                            <TableValueCell
                              primary={entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-"}
                            />
                            <TableValueCell
                              primary={`#${entry.mostJuniorNumber}`}
                              delta={formatSignedChange(trend?.lineMovement ?? null, "#")}
                              deltaTone={toneForDelta(trend?.lineMovement ?? null)}
                            />
                            <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {captainRows.length > 0 && firstOfficerRows.length > 0 ? (
                    <View style={styles.seatDivider}>
                      <Text style={styles.seatDividerText}>First Officer</Text>
                    </View>
                  ) : firstOfficerRows.length > 0 ? (
                    <Text style={styles.seatSectionLabel}>First Officer</Text>
                  ) : null}
                  {firstOfficerRows.map((entry) => {
                    const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
                    const trend = categoryTrendMap.get(entry.key) ?? null;
                    const categoryAssignments = categoryAssignmentsByKey.get(entry.key) ?? [];
                    const userPosition = describeUserCategoryPosition(
                      entry,
                      fit,
                      userSeniorityNumber,
                      currentPilot,
                      categoryAssignments
                    );
                    return (
                      <TouchableOpacity
                        key={entry.key}
                        style={[
                          isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                          rowStyleForHold(fit.label),
                        ]}
                        onPress={() =>
                          setSelectedCategoryDetail({
                            categoryKey: entry.key,
                            label: formatCategoryEntryCode(entry),
                          })
                        }
                        activeOpacity={0.88}
                      >
                        {isCompactMobile ? (
                          <InstrumentCategoryCard
                            title={`${entry.fleet} FO`}
                            status={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).status}
                            tone={toneForPilotStatus(fit.label === "Current category" ? "Can Hold" : fit.label)}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).badgeLabel}
                            statPairs={[
                              { label: "SR", value: `#${entry.mostSeniorNumber}` },
                              { label: "MID", value: entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-" },
                              { label: "JUNIOR", value: `#${entry.mostJuniorNumber}` },
                              { label: "YOU", value: `${userPosition.secondary ?? userPosition.primary}${formatSignedChange(trend?.lineMovement ?? null, "#") ? ` ${formatSignedChange(trend?.lineMovement ?? null, "#")}` : ""}` },
                            ]}
                            footer="Tap for details"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                              <Text style={styles.tableSubtext}>{fit.label === "Can Hold" || fit.label === "Current category" ? "CAN HOLD • Tap for details" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for details" : `${fit.label.toUpperCase()} • Tap for details`}</Text>
                            </View>
                            <TableValueCell primary={`#${entry.mostSeniorNumber}`} />
                            <TableValueCell
                              primary={entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-"}
                            />
                            <TableValueCell
                              primary={`#${entry.mostJuniorNumber}`}
                              delta={formatSignedChange(trend?.lineMovement ?? null, "#")}
                              deltaTone={toneForDelta(trend?.lineMovement ?? null)}
                            />
                            <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                );
              })}
            </View>

            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>Latest AE Award Ranges</Text>
              <Text style={styles.insightText}>
                High is the most senior award, Mid is the middle award, and Junior is the latest award line reached in the newest posting.
              </Text>
              <View style={styles.legendRow}>
                <LegendSwatch label="Junior to You" color="#D8EFD2" />
                <LegendSwatch label="Senior to You" color="#F8E1E5" />
                <LegendSwatch label="Close" color="#F4E9D2" />
              </View>
              {groupedSeniorityAeTables.map((group) => {
                const captainRows = group.rows.filter((entry) => entry.seat === "Captain");
                const firstOfficerRows = group.rows.filter((entry) => entry.seat === "First Officer");
                return (
                  <View key={`${group.base}-seniority-ae`} style={styles.tableCard}>
                    <Text style={styles.tableTitle}>{group.base}</Text>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                      <Text style={styles.tableHeaderCell}>High</Text>
                      <Text style={styles.tableHeaderCell}>Mid</Text>
                      <Text style={styles.tableHeaderCell}>Low</Text>
                      <Text style={styles.tableHeaderCell}>Awards</Text>
                      <Text style={styles.tableHeaderCell}>Bypass</Text>
                    </View>
                    <Text style={styles.seatSectionLabel}>Captain</Text>
                    {captainRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      return (
                        <View
                          key={`${entry.awardCategory}-seniority`}
                          style={[styles.tableRow, rowStyleForAeReach(fit.label)]}
                        >
                          <View style={styles.tableCategoryCell}>
                            <Text style={styles.tableCategoryText}>{entry.fleet} CA</Text>
                            <Text style={styles.tableSubtext}>{fit.label}</Text>
                          </View>
                          <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                          <TableValueCell primary={`${entry.awards}`} />
                          <TableValueCell primary={`${entry.bypassAwards}`} />
                        </View>
                      );
                    })}
                    {captainRows.length > 0 && firstOfficerRows.length > 0 ? (
                      <View style={styles.seatDivider}>
                        <Text style={styles.seatDividerText}>First Officer</Text>
                      </View>
                    ) : firstOfficerRows.length > 0 ? (
                      <Text style={styles.seatSectionLabel}>First Officer</Text>
                    ) : null}
                    {firstOfficerRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      return (
                        <View
                          key={`${entry.awardCategory}-seniority`}
                          style={[styles.tableRow, rowStyleForAeReach(fit.label)]}
                        >
                          <View style={styles.tableCategoryCell}>
                            <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                            <Text style={styles.tableSubtext}>{fit.label}</Text>
                          </View>
                          <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                          <TableValueCell primary={`${entry.awards}`} />
                          <TableValueCell primary={`${entry.bypassAwards}`} />
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>

            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>Carveouts</Text>
              {deltaSnapshot.carveoutBases.map((base: BaseEntry) => (
                <View key={`${base.base}-category-info`} style={styles.resultPanel}>
                  <ResultLine label={base.base} value={`${base.pilots} total pilots`} />
                  <Text style={styles.insightText}>{describeCarveout(base.base)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>Month Over Month Category Movement</Text>
              {visibleCategoryTrends.slice(0, 8).map((entry) => (
                <View key={`${entry.key}-trend`} style={styles.resultPanel}>
                  <ResultLine label={`${entry.base} ${entry.fleet} ${entry.seat}`} value={formatDelta(entry.lineMovement, "line")} />
                  <ResultLine label="Pilot count delta" value={formatSignedCount(entry.pilotCountDelta)} />
                  <ResultLine
                    label={`Current Junior ${entry.seat === "Captain" ? "CA" : "FO"}`}
                    value={`#${entry.latestJuniorNumber}`}
                  />
                </View>
              ))}
            </View>

          </SectionCard>
        )}

        {activeTab === "ae" && (
          <SectionCard
            title="AE"
            description="Spoiler: you probably didn't get 350A. Let's see what actually moved."
          >
            <FormRow>
              <LabeledInput
                label="Employee Number"
                value={employeeNumberInput}
                onChangeText={setEmployeeNumberInput}
              />
              <LabeledInput
                label="Search Fleet or Seat"
                value={aeSearch}
                onChangeText={setAeSearch}
                keyboardType="default"
              />
            </FormRow>

            <Text style={styles.inputLabel}>1. Seat</Text>
            <View style={styles.baseSelector}>
              {seatFilters.map((seat) => (
                <TouchableOpacity
                  key={seat}
                  style={[styles.baseChip, aeSeatFilter === seat && styles.baseChipActive]}
                  onPress={() => setAeSeatFilter(seat)}
                >
                  <Text style={[styles.baseChipLabel, aeSeatFilter === seat && styles.baseChipLabelActive]}>
                    {seat === "Captain" ? "CA" : seat === "First Officer" ? "FO" : "All"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>2. Fleet</Text>
            <View style={styles.baseSelector}>
              <TouchableOpacity
                style={[styles.baseChip, selectedAeFleetFilter === "All" && styles.baseChipActive]}
                onPress={() => setSelectedAeFleetFilter("All")}
              >
                <Text
                  style={[
                    styles.baseChipLabel,
                    selectedAeFleetFilter === "All" && styles.baseChipLabelActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {aeFleetOptions.map((fleet) => (
                <TouchableOpacity
                  key={`ae-fleet-${fleet}`}
                  style={[
                    styles.baseChip,
                    selectedAeFleetFilter === fleet && styles.baseChipActive,
                  ]}
                  onPress={() => setSelectedAeFleetFilter(fleet)}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      selectedAeFleetFilter === fleet && styles.baseChipLabelActive,
                    ]}
                  >
                    {fleet}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>3. Base</Text>
            <View style={styles.baseSelector}>
              <TouchableOpacity
                style={[styles.baseChip, selectedAeBaseFilter === "All" && styles.baseChipActive]}
                onPress={() => setSelectedAeBaseFilter("All")}
              >
                <Text
                  style={[
                    styles.baseChipLabel,
                    selectedAeBaseFilter === "All" && styles.baseChipLabelActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {aeBaseOptions.map((base) => (
                <TouchableOpacity
                  key={`ae-base-${base}`}
                  style={[
                    styles.baseChip,
                    selectedAeBaseFilter === base && styles.baseChipActive,
                  ]}
                  onPress={() => setSelectedAeBaseFilter(base)}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      selectedAeBaseFilter === base && styles.baseChipLabelActive,
                    ]}
                  >
                    {base}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.resultPanel}>
              <ResultLine label="Pilot" value={currentPilot?.name ?? "Not found"} />
              <ResultLine label="Junior to You" value={`${aeSummary.wentJunior}`} />
              <ResultLine label="Close" value={`${aeSummary.close}`} />
            </View>

            <View style={styles.legendRow}>
              <LegendSwatch label="Junior to You" color="#D8EFD2" />
              <LegendSwatch label="Senior to You" color="#F4D2D2" />
              <LegendSwatch label="Close" color="#EEE5D6" />
            </View>

            <View style={styles.resultPanel}>
              <Text style={styles.insightText}>
                AE shows the latest award movement, not whether you can hold the category overall.
                Navy means the latest AE award reached junior to your number, red means the
                award stayed senior to you, and neutral means the line was close or unclear.
                Tap any category row to see who came in, who left, and where those pilots moved
                from or to.
              </Text>
            </View>

            <TouchableOpacity style={styles.quickLinkButton} onPress={jumpToAeWhatIfPlanner}>
              <Text style={styles.quickLinkButtonText}>Jump To “When can I hold….”</Text>
            </TouchableOpacity>

            <View style={styles.sectionStack}>
              {groupedAeTables.map((group) => {
                const captainRows = group.rows.filter((entry) => entry.seat === "Captain");
                const firstOfficerRows = group.rows.filter((entry) => entry.seat === "First Officer");
                return (
                  <View key={`${group.base}-ae`} style={styles.tableCard}>
                    <Text style={styles.tableTitle}>{group.base}</Text>
                    {!isCompactMobile ? (
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                        <Text style={styles.tableHeaderCell}>High</Text>
                        <Text style={styles.tableHeaderCell}>Mid</Text>
                        <Text style={styles.tableHeaderCell}>Low</Text>
                        <Text style={styles.tableHeaderCell}>You</Text>
                      </View>
                    ) : null}
                    <Text style={styles.seatSectionLabel}>Captain</Text>
                    {captainRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      const categoryAssignments =
                        categoryAssignmentsByKey.get(buildCategoryKeyFromAeCategory(entry.awardCategory)) ?? [];
                      const userPosition = describeAeCategoryPosition(
                        entry,
                        userSeniorityNumber,
                        currentPilot,
                        categoryAssignments
                      );
                      return (
                        <TouchableOpacity
                          key={entry.awardCategory}
                          style={[
                            isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                            rowStyleForAeReach(fit.label),
                          ]}
                          onPress={() =>
                            setSelectedAeDetailCategory({
                              awardCategory: entry.awardCategory,
                              seat: entry.seat,
                            })
                          }
                        activeOpacity={0.88}
                      >
                        {isCompactMobile ? (
                          <InstrumentCategoryCard
                            title={`${entry.fleet} ${entry.seat === "Captain" ? "CA" : "FO"}`}
                            status={fit.label === "Junior to You" ? "CAN HOLD" : fit.label === "Senior to You" ? "NOT HOLDABLE" : fit.label.toUpperCase()}
                            tone={fit.label === "Junior to You" ? "green" : fit.label === "Senior to You" ? "red" : "amber"}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fit.label === "Junior to You" ? "IN CATEGORY" : fit.label === "Senior to You" ? "SENIOR TO YOU" : "STATUS"}
                            statPairs={[
                              { label: "HIGH", value: formatSeniorityValue(entry.mostSeniorAwardNumber) },
                              { label: "MID", value: formatSeniorityValue(entry.middleAwardNumber) },
                              { label: "JUNIOR", value: formatSeniorityValue(entry.mostJuniorAwardNumber) },
                              { label: "YOU", value: userPosition.secondary ?? userPosition.primary },
                            ]}
                            footer="Tap for awards"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>
                                {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                              </Text>
                                <Text style={styles.tableSubtext}>{fit.label === "Junior to You" ? "CAN HOLD • Tap for awards" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for awards" : `${fit.label.toUpperCase()} • Tap for awards`}</Text>
                            </View>
                              <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                              <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                              <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                              <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
                            </>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {captainRows.length > 0 && firstOfficerRows.length > 0 ? (
                      <View style={styles.seatDivider}>
                        <Text style={styles.seatDividerText}>First Officer</Text>
                      </View>
                    ) : firstOfficerRows.length > 0 ? (
                      <Text style={styles.seatSectionLabel}>First Officer</Text>
                    ) : null}
                    {firstOfficerRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      const categoryAssignments =
                        categoryAssignmentsByKey.get(buildCategoryKeyFromAeCategory(entry.awardCategory)) ?? [];
                      const userPosition = describeAeCategoryPosition(
                        entry,
                        userSeniorityNumber,
                        currentPilot,
                        categoryAssignments
                      );
                      return (
                        <TouchableOpacity
                          key={entry.awardCategory}
                          style={[
                            isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                            rowStyleForAeReach(fit.label),
                          ]}
                          onPress={() =>
                            setSelectedAeDetailCategory({
                              awardCategory: entry.awardCategory,
                              seat: entry.seat,
                            })
                          }
                        activeOpacity={0.88}
                      >
                        {isCompactMobile ? (
                          <InstrumentCategoryCard
                            title={`${entry.fleet} FO`}
                            status={fit.label === "Junior to You" ? "CAN HOLD" : fit.label === "Senior to You" ? "NOT HOLDABLE" : fit.label.toUpperCase()}
                            tone={fit.label === "Junior to You" ? "green" : fit.label === "Senior to You" ? "red" : "amber"}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fit.label === "Junior to You" ? "IN CATEGORY" : fit.label === "Senior to You" ? "SENIOR TO YOU" : "STATUS"}
                            statPairs={[
                              { label: "HIGH", value: formatSeniorityValue(entry.mostSeniorAwardNumber) },
                              { label: "MID", value: formatSeniorityValue(entry.middleAwardNumber) },
                              { label: "JUNIOR", value: formatSeniorityValue(entry.mostJuniorAwardNumber) },
                              { label: "YOU", value: userPosition.secondary ?? userPosition.primary },
                            ]}
                            footer="Tap for awards"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                                <Text style={styles.tableSubtext}>{fit.label === "Junior to You" ? "CAN HOLD • Tap for awards" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for awards" : `${fit.label.toUpperCase()} • Tap for awards`}</Text>
                            </View>
                              <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                              <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                              <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                              <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
                            </>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    <View style={styles.baseNetBar}>
                      {(() => {
                        const movement = aeMovementByBase.get(group.base) ?? null;
                        const residual = aeResidualByBase.get(group.base) ?? null;
                        const totalMovement = buildTotalMovement(movement, residual);
                        return (
                          <>
                            <Text style={styles.baseNetText}>
                              {group.base} Total Movement: In {totalMovement.totalIn} • Out {totalMovement.totalOut} • Net{" "}
                              {formatSignedCount(totalMovement.net)}
                            </Text>
                            <Text style={styles.baseNetSubtext}>
                              AE only: In {movement?.aeIn ?? 0} • Out {movement?.aeOut ?? 0} • Net{" "}
                              {formatSignedCount(movement?.net ?? 0)}
                            </Text>
                            <Text style={styles.baseNetSubtext}>
                              Other movement (retirements, leave, training, etc.):{" "}
                              {formatSignedCount(residual?.residual ?? 0)}
                            </Text>
                          </>
                        );
                      })()}
                    </View>
                  </View>
                );
              })}
            </View>

            <View
              style={styles.sectionStack}
              onLayout={(event) => setWhatIfSectionY(event.nativeEvent.layout.y)}
            >
              <Text style={styles.inputLabel}>When can I hold....</Text>
              <Text style={styles.inputLabel}>1. Seat</Text>
              <View style={styles.baseSelector}>
                {(["Captain", "First Officer"] as const).map((seat) => (
                  <TouchableOpacity
                    key={seat}
                    style={[styles.baseChip, whatIfSeat === seat && styles.baseChipActive]}
                    onPress={() => setWhatIfSeat(seat)}
                  >
                    <Text
                      style={[
                        styles.baseChipLabel,
                        whatIfSeat === seat && styles.baseChipLabelActive,
                      ]}
                    >
                      {seat === "Captain" ? "CA" : "FO"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>2. Fleet</Text>
              <View style={styles.baseSelector}>
                {whatIfFleetOptions.map((fleet) => (
                  <TouchableOpacity
                    key={`${whatIfSeat}-${fleet}`}
                    style={[
                      styles.baseChip,
                      selectedWhatIfFleet === fleet && styles.baseChipActive,
                    ]}
                    onPress={() => setSelectedWhatIfFleet(fleet)}
                  >
                    <Text
                      style={[
                        styles.baseChipLabel,
                        selectedWhatIfFleet === fleet && styles.baseChipLabelActive,
                      ]}
                    >
                      {fleet}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>3. Base</Text>
              <View style={styles.baseSelector}>
                {whatIfBaseOptions.map((base) => (
                  <TouchableOpacity
                    key={`${whatIfSeat}-${selectedWhatIfFleet}-${base}`}
                    style={[
                      styles.baseChip,
                      selectedWhatIfBase === base && styles.baseChipActive,
                    ]}
                    onPress={() => setSelectedWhatIfBase(base)}
                  >
                    <Text
                      style={[
                        styles.baseChipLabel,
                        selectedWhatIfBase === base && styles.baseChipLabelActive,
                      ]}
                    >
                      {base}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.baseSelector}>
                <TouchableOpacity
                  style={[styles.baseChip, holdPlannerView === "ae" && styles.baseChipActive]}
                  onPress={() => setHoldPlannerView("ae")}
                >
                  <Text style={[styles.baseChipLabel, holdPlannerView === "ae" && styles.baseChipLabelActive]}>
                    This Award
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.baseChip, holdPlannerView === "forecast" && styles.baseChipActive]}
                  onPress={() => setHoldPlannerView("forecast")}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      holdPlannerView === "forecast" && styles.baseChipLabelActive,
                    ]}
                  >
                    Forecast
                  </Text>
                </TouchableOpacity>
              </View>

              {activeWhatIfCategory && currentPilot ? (
                <>
                  <View style={styles.resultPanel}>
                    <ResultLine label="Target" value={formatCategoryEntryCode(activeWhatIfCategory)} />
                    <ResultLine
                      label={`Current list ${activeWhatIfCategory.seat === "Captain" ? "CA" : "FO"} line`}
                      value={`#${activeWhatIfCategory.mostJuniorNumber}`}
                    />
                    <ResultLine label="Your number today" value={`#${currentPilot.seniorityNumber}`} />
                    <Text style={styles.insightText}>
                      AE analysis answers this month. Forecast answers the broader holdability question.
                    </Text>
                  </View>

                  {holdPlannerView === "ae" ? (
                    <CurrentAeDesktopPanel analysis={currentAeAnalysis} />
                  ) : (
                    <ForecastDesktopPanel
                      forecast={holdForecast}
                      analysis={currentAeAnalysis}
                      forecastGrowthRate={forecastGrowthRate}
                      forecastGrowthMenuOpen={forecastGrowthMenuOpen}
                      setForecastGrowthRate={setForecastGrowthRate}
                      setForecastGrowthMenuOpen={setForecastGrowthMenuOpen}
                    />
                  )}
                </>
              ) : (
                <Text style={styles.insightText}>
                  Enter your employee number and pick a target category to compare this award against the broader hold forecast.
                </Text>
              )}
            </View>
          </SectionCard>
        )}
      </ScrollView>
      <View
        style={[
          styles.bottomTabBar,
          {
            backgroundColor: flieger.surface,
            borderTopWidth: 2,
            borderTopColor: flieger.borderStrong,
          },
        ]}
      >
        <View style={{ position: "absolute", top: -18, left: 0, right: 0, alignItems: "center" }}>
          <FliegerMarker color={flieger.textPrimary} dotSize={5} triangleWidth={10} triangleHeight={9} />
        </View>
        {tabs.map((tab) => (
          <BottomNavItem
            key={tab.key}
            icon={tab.icon}
            label={tab.label}
            active={activeBottomTabKey === tab.key}
            onPress={() => {
              if (!canOpenRotationSecondaryTabs && (tab.key === "far117" || tab.key === "logbook")) {
                setRotationAnalyzeError("Load a rotation first to open FAR 117 and Logbook.");
                return;
              }
              setActiveTab(tab.key);
            }}
          />
        ))}
      </View>
      <Modal
        visible={selectedCategoryDetail != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCategoryDetail(null)}
      >
        <View style={[styles.modalBackdrop, isCompactMobile && styles.modalBackdropCompact]}>
          <View style={[styles.modalCard, isCompactMobile && styles.modalCardCompact]}>
            <TouchableOpacity
              style={styles.modalFloatingCloseButton}
              onPress={() => setSelectedCategoryDetail(null)}
            >
              <Text style={styles.modalFloatingCloseText}>X</Text>
            </TouchableOpacity>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                isCompactMobile && styles.modalScrollContentCompact,
              ]}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalTitle}>
                    {selectedCategoryDetail?.label ?? "Category List"}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Current category list in seniority order. Colored to show who is senior to you,
                    junior to you, retiring soon, and where you would slot into the category.
                  </Text>
                </View>
              </View>
              <View style={[styles.resultPanel, isCompactMobile && styles.modalSummaryPanelCompact]}>
                {selectedCategoryFit ? (
                  <ResultLine label="Quick status" value={selectedCategoryFit.label === "Current category" ? "Can Hold" : selectedCategoryFit.label} />
                ) : null}
                <ResultLine
                  label="Current pilots"
                  value={`${selectedCategoryAssignments.length}`}
                />
                <ResultLine
                  label="Most senior"
                  value={formatSeniorityValue(selectedCategoryAssignments[0]?.seniorityNumber ?? null)}
                />
                <ResultLine
                  label="Most junior"
                  value={formatSeniorityValue(selectedCategoryAssignments.at(-1)?.seniorityNumber ?? null)}
                />
                {selectedCategoryTrend ? (
                  <ResultLine
                    label="Trend direction"
                    value={`${describeMovementDirection(selectedCategoryTrend.lineMovement)} • ${formatSignedChange(selectedCategoryTrend.lineMovement, "#") ?? "Flat"}`}
                  />
                ) : null}
                {selectedCategoryEntry ? (
                  <ResultLine
                    label="Career relevance"
                    value={goalCategoryKeys.includes(selectedCategoryEntry.key) ? "Goal category" : `${selectedCategoryEntry.base} ${selectedCategoryEntry.seat === "Captain" ? "Captain" : "FO"} bid option`}
                  />
                ) : null}
                {currentPilot ? (
                  <ResultLine
                    label="You"
                    value={
                      (() => {
                        const rank = selectedCategoryPreviewRows.findIndex(
                          (row) => row.employeeNumber === currentPilot.employeeNumber
                        );
                        if (rank < 0) {
                          return `#${currentPilot.seniorityNumber}`;
                        }
                        const total = selectedCategoryPreviewRows.length;
                        const percent = Math.round(((rank + 1) / Math.max(total, 1)) * 100);
                        return `${percent}%`;
                      })()
                    }
                  />
                ) : null}
              </View>
              <View style={styles.legendRow}>
                <LegendSwatch label="Senior to you" color="#F8E1E5" />
                <LegendSwatch label="You" color="#E4EEF8" />
                <LegendSwatch label="Retiring soon" color="#F6D6D6" />
                <LegendSwatch label="Junior to you" color="#D8EFD2" />
              </View>
              <View style={styles.modalTableHeader}>
                <Text style={[styles.tableHeaderCell, styles.modalNameCell]}>Pilot</Text>
                <Text style={styles.tableHeaderCell}>#</Text>
              </View>
              <View style={styles.listCompareWrap}>
                {selectedCategoryPreviewRows.map((pilot) => {
                  const rowState = getAeCompareRowState(pilot, currentPilot);
                  const synthetic = "synthetic" in pilot && Boolean(pilot.synthetic);
                  return (
                    <View
                      key={`category-preview-${pilot.employeeNumber}-${pilot.seniorityNumber}`}
                      style={[
                        styles.listCompareRow,
                        isCompactMobile && styles.listCompareRowCompact,
                        rowState.style,
                      ]}
                    >
                      <View style={styles.listCompareNameWrap}>
                        <Text style={styles.listCompareName}>
                          {synthetic ? currentPilot?.name ?? "You" : pilot.name}
                        </Text>
                        <Text style={styles.listCompareStatus}>
                          {synthetic ? "You would slot here" : rowState.label}
                        </Text>
                        <Text style={styles.listCompareContext}>
                          {synthetic ? "Projected position in this category" : "Current holder"}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.listCompareNumber,
                          isCompactMobile && styles.listCompareNumberCompact,
                        ]}
                      >
                        #{pilot.seniorityNumber}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={selectedAeDetailCategory != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAeDetailCategory(null)}
      >
        <View style={[styles.modalBackdrop, isCompactMobile && styles.modalBackdropCompact]}>
          <View style={[styles.modalCard, isCompactMobile && styles.modalCardCompact]}>
            <TouchableOpacity
              style={styles.modalFloatingCloseButton}
              onPress={() => setSelectedAeDetailCategory(null)}
            >
              <Text style={styles.modalFloatingCloseText}>X</Text>
            </TouchableOpacity>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                isCompactMobile && styles.modalScrollContentCompact,
              ]}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalTitle}>
                    {selectedAeDetailCategory?.awardCategory ?? "AE Awards"}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Latest posting awards in seniority order. Every pilot shown below was awarded this exact category.
                  </Text>
                </View>
              </View>
              <View style={styles.modalTableHeader}>
                <Text style={[styles.tableHeaderCell, styles.modalNameCell]}>Pilot</Text>
                <Text style={styles.tableHeaderCell}>#</Text>
              </View>
              {selectedAeDetailCategory ? (
                <View style={[styles.resultPanel, isCompactMobile && styles.modalSummaryPanelCompact]}>
                  {(() => {
                    const totalMovement = buildTotalMovement(activeAeMovement, activeAeResidual);
                    return (
                      <>
                        {selectedAeFit ? (
                          <ResultLine label="Quick status" value={selectedAeFit.label} />
                        ) : null}
                        <ResultLine
                          label="Awarded to"
                          value={selectedAeDetailCategory.awardCategory}
                        />
                        <ResultLine
                          label="Summary"
                          value={`${activeAeAwardRows.length} awards • High ${formatSeniorityValue(
                            activeAeAwardRows[0]?.seniorityNumber ?? null
                          )} • Low ${formatSeniorityValue(
                            activeAeAwardRows.at(-1)?.seniorityNumber ?? null
                          )}`}
                        />
                        <ResultLine
                          label="Awards"
                          value={`${activeAeAwardRows.length}`}
                        />
                        <ResultLine
                          label="Bypass awards"
                          value={`${activeAeAwardRows.filter((row) => row.bypassAward).length}`}
                        />
                        <ResultLine
                          label="Total movement"
                          value={`In ${totalMovement.totalIn} • Out ${totalMovement.totalOut} • Net ${formatSignedCount(
                            totalMovement.net
                          )}`}
                        />
                        <ResultLine
                          label="AE only"
                          value={`In ${activeAeMovement?.aeIn ?? 0} • Out ${activeAeMovement?.aeOut ?? 0} • Net ${formatSignedCount(
                            activeAeMovement?.net ?? 0
                          )}`}
                        />
                        <ResultLine
                          label="Other movement (retirements, leave, training, etc.)"
                          value={formatSignedCount(activeAeResidual?.residual ?? 0)}
                        />
                        {selectedAeTrend ? (
                          <ResultLine
                            label="Trend direction"
                            value={`${describeMovementDirection(selectedAeTrend.lineMovement)} • ${formatSignedChange(selectedAeTrend.lineMovement, "#") ?? "Flat"}`}
                          />
                        ) : null}
                        {selectedAeEntry ? (
                          <ResultLine
                            label="Career relevance"
                            value={goalCategoryKeys.includes(buildCategoryKeyFromAeCategory(selectedAeEntry.awardCategory)) ? "Goal category" : `${selectedAeEntry.base} ${selectedAeEntry.seat === "Captain" ? "Captain" : "FO"} opportunity`}
                          />
                        ) : null}
                      </>
                    );
                  })()}
                </View>
              ) : null}
              {selectedAeDetailCategory ? (
                <View style={styles.listCompareWrap}>
                  <View style={styles.legendRow}>
                    <LegendSwatch label="Senior to you" color="#F8E1E5" />
                    <LegendSwatch label="You" color="#E4EEF8" />
                    <LegendSwatch label="Retiring soon" color="#F6D6D6" />
                    <LegendSwatch label="Junior to you" color="#D8EFD2" />
                  </View>
                  <View style={styles.listCompareColumns}>
                    <View style={[styles.listCompareCard, isCompactMobile && styles.listCompareCardCompact]}>
                      <Text style={styles.listCompareTitle}>Coming To {selectedAeDetailCategory.awardCategory}</Text>
                      <Text style={styles.listCompareMeta}>
                        {activeAeAwardRows.length} pilots • JR{" "}
                        {formatSeniorityValue(activeAeAwardRows.at(-1)?.seniorityNumber ?? null)}
                      </Text>
                      {activeAeAwardRows.map((pilot) => {
                        const rowState = getAeCompareRowState(pilot, currentPilot);
                        return (
                          <View
                            key={`incoming-${pilot.employeeNumber}`}
                            style={[
                              styles.listCompareRow,
                              isCompactMobile && styles.listCompareRowCompact,
                              rowState.style,
                            ]}
                          >
                            <View style={styles.listCompareNameWrap}>
                              <Text style={styles.listCompareName}>{pilot.name}</Text>
                              <Text style={styles.listCompareStatus}>{rowState.label}</Text>
                              <Text style={styles.listCompareContext}>
                                From {pilot.previousCategory || "Unknown"}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.listCompareNumber,
                                isCompactMobile && styles.listCompareNumberCompact,
                              ]}
                            >
                              #{pilot.seniorityNumber}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={[styles.listCompareCard, isCompactMobile && styles.listCompareCardCompact]}>
                      <Text style={styles.listCompareTitle}>Leaving The {selectedAeDetailCategory.awardCategory}</Text>
                      <Text style={styles.listCompareMeta}>
                        {activeAeLeavingRows.length} pilots • JR{" "}
                        {formatSeniorityValue(activeAeLeavingRows.at(-1)?.seniorityNumber ?? null)}
                      </Text>
                      {activeAeLeavingRows.map((pilot) => {
                        const rowState = getAeCompareRowState(pilot, currentPilot);
                        return (
                          <View
                            key={`leaving-${pilot.employeeNumber}`}
                            style={[
                              styles.listCompareRow,
                              isCompactMobile && styles.listCompareRowCompact,
                              rowState.style,
                            ]}
                          >
                            <View style={styles.listCompareNameWrap}>
                              <Text style={styles.listCompareName}>{pilot.name}</Text>
                              <Text style={styles.listCompareStatus}>{rowState.label}</Text>
                              <Text style={styles.listCompareContext}>
                                To {pilot.awardCategory || "Unknown"}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.listCompareNumber,
                                isCompactMobile && styles.listCompareNumberCompact,
                              ]}
                            >
                              #{pilot.seniorityNumber}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}
              {activeAeAwardRows.length === 0 ? (
                <Text style={styles.insightText}>No awards were parsed for this category.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </AppErrorBoundary>
  );
}

function findPilotByEmployeeNumber(
  pilots: readonly PilotRecord[],
  input: string
) {
  const normalizedInput = normalizeDigits(input);
  if (!normalizedInput) {
    return null;
  }

  return (
    pilots.find((pilot) => normalizeDigits(pilot.employeeNumber) === normalizedInput) ??
    null
  );
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function buildPilotHistoryShardKey(employeeNumber: string) {
  return (employeeNumber.slice(0, 2) || "00").padEnd(2, "0");
}

function buildCategoryKeyFromAeCategory(awardCategory: string) {
  const [base = "", fleet = "", seatCode = ""] = awardCategory.split("-");
  const positionCode = seatCode === "CA" ? "A" : seatCode === "FO" ? "B" : seatCode;
  return `${base}-${fleet}-${positionCode}`;
}

function formatCategoryEntryCode(entry: Pick<CategoryEntry, "base" | "fleet" | "seat">) {
  return `${entry.base}-${entry.fleet}-${entry.seat === "Captain" ? "CA" : "FO"}`;
}

function formatFliegerCategoryTitle(entry: Pick<CategoryEntry, "fleet" | "seat">) {
  return `${entry.fleet} ${entry.seat === "Captain" ? "CA" : "FO"}`;
}

function buildTotalMovement(
  movement: AeMovementSummary | null,
  residual: AeResidualSummary | null
) {
  const aeIn = movement?.aeIn ?? 0;
  const aeOut = movement?.aeOut ?? 0;
  const extraIn = Math.max(0, residual?.residual ?? 0);
  const extraOut = Math.max(0, -(residual?.residual ?? 0));
  const totalIn = aeIn + extraIn;
  const totalOut = aeOut + extraOut;
  const net = totalIn - totalOut;

  return {
    totalIn,
    totalOut,
    net,
  };
}

function isRetiringSoon(scheduledRetireDate: string | null, monthsAhead = 12) {
  const retireDate = scheduledRetireDate ? parseDeltaDate(scheduledRetireDate) : null;
  if (!retireDate) {
    return false;
  }

  const now = new Date();
  const threshold = new Date(now.getFullYear(), now.getMonth() + monthsAhead, now.getDate());
  return retireDate >= now && retireDate <= threshold;
}

function getAeCompareRowState(
  pilot: Pick<LatestAeAwardRow, "employeeNumber" | "seniorityNumber" | "scheduledRetireDate"> |
    Pick<LatestCategoryAssignment, "employeeNumber" | "seniorityNumber" | "scheduledRetireDate">,
  currentPilot: PilotRecord | null
) {
  if (!currentPilot) {
    return {
      style: styles.listCompareRowJunior,
      label: "Junior to you",
    };
  }

  if (pilot.employeeNumber === currentPilot.employeeNumber) {
    return {
      style: styles.listCompareRowYou,
      label: "You",
    };
  }

  if (isRetiringSoon(pilot.scheduledRetireDate)) {
    return {
      style: styles.listCompareRowRetiring,
      label: `Retires ${pilot.scheduledRetireDate}`,
    };
  }

  if (pilot.seniorityNumber < currentPilot.seniorityNumber) {
    return {
      style: styles.listCompareRowSenior,
      label: "Senior to you",
    };
  }

  return {
    style: styles.listCompareRowJunior,
    label: "Junior to you",
  };
}

function parseDeltaDate(value: string) {
  const match = value.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, monthCode, year] = match;
  const monthMap: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };

  return new Date(Number(year), monthMap[monthCode], Number(day));
}

function buildCareerProjection(
  pilot: PilotRecord,
  pilots: readonly PilotRecord[],
  growthRate: number,
  chartStartMode: ChartStartMode
) {
  const startDate = resolveChartStartDate(pilot, chartStartMode);
  const retireDate = parseDeltaDate(pilot.scheduledRetireDate);
  if (!retireDate) {
    return [];
  }

  const checkpoints: Date[] = [startDate];
  for (let year = startDate.getFullYear() + 1; year <= retireDate.getFullYear(); year += 1) {
    checkpoints.push(new Date(year, 0, 1));
  }

  const currentTotalPilots = pilots.length;

  return checkpoints
    .filter((date) => date <= retireDate)
    .map((date) => {
      const yearsElapsed = Math.max(
        0,
        (date.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      const retirementsAhead = pilots.filter((entry) => {
        const retirement = parseDeltaDate(entry.scheduledRetireDate);
        return (
          retirement != null &&
          retirement <= date &&
          entry.seniorityNumber < pilot.seniorityNumber
        );
      }).length;
      const projectedRank = Math.max(1, pilot.seniorityNumber - retirementsAhead);
      const projectedTotal = Math.max(
        projectedRank,
        Math.round(currentTotalPilots * Math.pow(1 + growthRate, yearsElapsed))
      );
      const topPercent = Math.max(
        1,
        Math.round((projectedRank / projectedTotal) * 100)
      );
      const systemPercent = Number(((projectedRank / projectedTotal) * 100).toFixed(1));
      const progressPercent = Math.max(
        4,
        Math.min(100, Math.round(((projectedTotal - projectedRank) / projectedTotal) * 100))
      );

      return {
        label:
          date.getFullYear() === startDate.getFullYear()
            ? "Today"
            : `${date.getFullYear()}`,
        timeMs: date.getTime(),
        projectedRank,
        projectedTotal,
        retirementsAhead,
        topPercent,
        systemPercent,
        progressPercent,
      };
    });
}

function buildProjectedPilotCountSeries(
  startingCount: number,
  scheduledRetireDate: string | null,
  growthRate: number,
  chartStartMode: ChartStartMode
) {
  if (!scheduledRetireDate || startingCount === 0) {
    return [];
  }

  const retireDate = parseDeltaDate(scheduledRetireDate);
  if (!retireDate) {
    return [];
  }

  const startDate = resolveYearOnlyStartDate(chartStartMode);
  const currentYear = startDate.getFullYear();
  const points: ChartPoint[] = [];
  let yearOffset = 1;
  for (let year = currentYear + 1; year <= retireDate.getFullYear(); year += 1) {
    const projectedCount = Math.round(startingCount * Math.pow(1 + growthRate, yearOffset));
    points.push({
      label: `${year}`,
      value: projectedCount,
      valueLabel: `${projectedCount}`,
      tone: "future",
    });
    yearOffset += 1;
  }
  return points;
}

function dedupeChartPointsByLabel(points: ChartPoint[]) {
  const deduped = new Map<string, ChartPoint>();
  points.forEach((point) => {
    deduped.set(point.label.replace(/\s+/g, "").toUpperCase(), point);
  });
  return Array.from(deduped.values());
}

function parseAuditHoursInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.includes(":") ? parseTimeValue(trimmed) : Number(trimmed) || 0;
}

function formatHoursToClock(value: number) {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function buildPayEstimate(
  pilot: PilotRecord | null,
  payScenarioCode: string,
  monthlyHours: number
) {
  const scenario = resolvePayScenario(payScenarioCode);
  if (!scenario) {
    return null;
  }

  const { equipmentLabel, seat } = scenario;
  const payYear = pilot ? derivePayYear(pilot.pilotHireDate) : 1;
  const rates = payScales[seat][equipmentLabel];
  const payRate = rates?.[payYear - 1];

  if (!payRate) {
    return null;
  }

  const annualCreditHours = monthlyHours * 12;
  const basePay = payRate * annualCreditHours;
  const dcContribution = basePay * definedContributionRate;
  const profitSharing = basePay * profitSharingRate;
  const grossCompensation = basePay + dcContribution + profitSharing;
  const monthlyTakeHome = (basePay * annualTakeHomeRate) / 12;
  const profitSharingTakeHome = profitSharing * profitSharingTakeHomeRate;
  const annualTakeHome = monthlyTakeHome * 12 + profitSharingTakeHome;

  return {
    scenarioCode: scenario.code,
    scenarioLabel: scenario.shortLabel,
    seat,
    equipmentLabel,
    payYear,
    payRate,
    annualCreditHours,
    basePay,
    dcContribution,
    profitSharing,
    grossCompensation,
    annualTakeHome,
    monthlyTakeHome,
    profitSharingTakeHome,
  };
}

function derivePilotPayScenarioCode(pilot: PilotRecord) {
  const normalizedCategory = pilot.currentCategoryCode.toUpperCase();
  const matchingScenario = payScenarioOptions.find((option) =>
    normalizedCategory.endsWith(option.code)
  );
  return matchingScenario?.code ?? null;
}

function derivePayYear(hireDate: string) {
  const parsedHire = parseDeltaDate(hireDate);
  const payScaleDate = new Date(2026, 0, 1);
  if (!parsedHire) {
    return 1;
  }

  let years = payScaleDate.getFullYear() - parsedHire.getFullYear();
  const beforeAnniversary =
    payScaleDate.getMonth() < parsedHire.getMonth() ||
    (payScaleDate.getMonth() === parsedHire.getMonth() &&
      payScaleDate.getDate() < parsedHire.getDate());
  if (beforeAnniversary) {
    years -= 1;
  }

  return Math.max(1, Math.min(12, years + 1));
}

function resolveChartStartDate(pilot: PilotRecord, chartStartMode: ChartStartMode) {
  if (chartStartMode === "hire") {
    return parseDeltaDate(pilot.pilotHireDate) ?? new Date();
  }
  return new Date();
}

function resolvePilotChartStartDate(
  pilot: PilotRecord,
  pilotHistory: PilotHistoryRecord | null,
  chartStartMode: ChartStartMode
) {
  if (chartStartMode === "today") {
    const latestPoint = pilotHistory?.points.at(-1);
    return latestPoint ? dateFromMonthKey(latestPoint.monthKey) : new Date();
  }
  if (chartStartMode === "hire") {
    return parseDeltaDate(pilot.pilotHireDate) ?? new Date();
  }
  return new Date();
}

function resolveListChartStartDate(
  pilot: PilotRecord | null,
  pilotHistory: PilotHistoryRecord | null,
  chartStartMode: ChartStartMode,
  monthlyPilotCounts: readonly { monthKey: string }[]
) {
  if (chartStartMode === "today") {
    const latestSystemPoint = monthlyPilotCounts.at(-1);
    return latestSystemPoint ? dateFromMonthKey(latestSystemPoint.monthKey) : new Date();
  }
  if (chartStartMode === "hire" && pilot) {
    return parseDeltaDate(pilot.pilotHireDate) ?? new Date();
  }
  return new Date();
}

function resolveYearOnlyStartDate(chartStartMode: ChartStartMode) {
  if (chartStartMode === "today") {
    return new Date();
  }
  return new Date();
}

function buildReferencePercentAtTime(
  pilot: PilotRecord,
  pilots: readonly PilotRecord[],
  growthRate: number,
  chartStartMode: ChartStartMode,
  timeMs: number
) {
  const startDate = resolveChartStartDate(pilot, chartStartMode);
  const targetDate = new Date(timeMs);
  if (targetDate < startDate) {
    return null;
  }

  const currentTotalPilots = pilots.length;
  const yearsElapsed = Math.max(
    0,
    (targetDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  const retirementsAhead = pilots.filter((entry) => {
    const retirement = parseDeltaDate(entry.scheduledRetireDate);
    return (
      retirement != null &&
      retirement <= targetDate &&
      entry.seniorityNumber < pilot.seniorityNumber
    );
  }).length;
  const projectedRank = Math.max(1, pilot.seniorityNumber - retirementsAhead);
  const projectedTotal = Math.max(
    projectedRank,
    Math.round(currentTotalPilots * Math.pow(1 + growthRate, yearsElapsed))
  );

  return Number(((projectedRank / projectedTotal) * 100).toFixed(1));
}

function buildEstimatedPastPoint(
  pilot: PilotRecord | null,
  targetDate: Date,
  monthlyPilotCounts: readonly { monthKey: string; pilotCount: number }[]
) {
  if (!pilot) {
    return null;
  }

  const hireDate = parseDeltaDate(pilot.pilotHireDate);
  if (!hireDate) {
    return null;
  }

  const now = new Date();
  const clampedTargetDate = targetDate > now ? now : targetDate;
  const hireAnchorCount = resolveHireYearPilotCount(hireDate, monthlyPilotCounts);
  const startRank = hireAnchorCount;
  const endRank = pilot.seniorityNumber;
  const totalSpan = Math.max(1, now.getTime() - hireDate.getTime());
  const elapsed = Math.max(0, clampedTargetDate.getTime() - hireDate.getTime());
  const progress = Math.max(0, Math.min(1, elapsed / totalSpan));
  const estimatedRank = Math.round(startRank + (endRank - startRank) * progress);
  const pilotCountAtDate = resolvePilotCountAtDate(clampedTargetDate, monthlyPilotCounts);
  const effectivePilotCount = Math.max(estimatedRank, pilotCountAtDate ?? hireAnchorCount);

  return {
    seniorityNumber: estimatedRank,
    systemPercent: Number(((estimatedRank / effectivePilotCount) * 100).toFixed(1)),
  };
}

function findHistoryPointAtOrBefore(
  pilotHistory: PilotHistoryRecord | null,
  targetDate: Date
) {
  if (!pilotHistory) {
    return null;
  }

  let match: PilotHistoryPoint | null = null;
  for (const point of pilotHistory.points) {
    const pointDate = dateFromMonthKey(point.monthKey);
    if (!pointDate || pointDate > targetDate) {
      continue;
    }
    if (!match) {
      match = point;
      continue;
    }
    const matchDate = dateFromMonthKey(match.monthKey);
    if (matchDate && pointDate > matchDate) {
      match = point;
    }
  }

  return match;
}

function resolveHireYearPilotCount(
  hireDate: Date,
  monthlyPilotCounts: readonly { monthKey: string; pilotCount: number }[]
) {
  const hireYearMatches = monthlyPilotCounts
    .map((point) => ({
      ...point,
      pointDate: dateFromMonthKey(point.monthKey),
    }))
    .filter(
      (point) =>
        point.pointDate != null && point.pointDate.getFullYear() === hireDate.getFullYear()
    )
    .sort((left, right) => {
      const leftDiff = Math.abs(left.pointDate!.getTime() - hireDate.getTime());
      const rightDiff = Math.abs(right.pointDate!.getTime() - hireDate.getTime());
      return leftDiff - rightDiff;
    });

  if (hireYearMatches[0]) {
    return hireYearMatches[0].pilotCount;
  }

  const nearestAnyYear = monthlyPilotCounts
    .map((point) => ({
      ...point,
      pointDate: dateFromMonthKey(point.monthKey),
    }))
    .filter((point) => point.pointDate != null)
    .sort((left, right) => {
      const leftDiff = Math.abs(left.pointDate!.getTime() - hireDate.getTime());
      const rightDiff = Math.abs(right.pointDate!.getTime() - hireDate.getTime());
      return leftDiff - rightDiff;
    })[0];

  return nearestAnyYear?.pilotCount ?? 1;
}

function resolvePilotCountAtDate(
  targetDate: Date,
  monthlyPilotCounts: readonly { monthKey: string; pilotCount: number }[]
) {
  const nearest = monthlyPilotCounts
    .map((point) => ({
      ...point,
      pointDate: dateFromMonthKey(point.monthKey),
    }))
    .filter((point) => point.pointDate != null)
    .sort((left, right) => {
      const leftDiff = Math.abs(left.pointDate!.getTime() - targetDate.getTime());
      const rightDiff = Math.abs(right.pointDate!.getTime() - targetDate.getTime());
      return leftDiff - rightDiff;
    })[0];

  return nearest?.pilotCount ?? null;
}

function dateFromMonthKey(monthKey: string) {
  const normalized = monthKey.toUpperCase();
  let match = normalized.match(/(\d{2})([A-Z]{3})(\d{4})/);
  if (match) {
    const [, day, monthCode, year] = match;
    return new Date(Number(year), monthIndex(monthCode), Number(day));
  }
  match = normalized.match(/([A-Z]+)\s+(\d{4})/);
  if (match) {
    return new Date(Number(match[2]), monthIndex(match[1].slice(0, 3)), 1);
  }
  return null;
}

function monthIndex(monthCode: string) {
  const monthMap: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };
  return monthMap[monthCode] ?? 0;
}

function chartStartLabel(mode: ChartStartMode) {
  return chartStartModes.find((option) => option.value === mode)?.label ?? "Today";
}

function shortenMonthLabel(monthKey: string) {
  const parsedDate = dateFromMonthKey(monthKey);
  if (parsedDate) {
    return `${parsedDate.toLocaleString("en-US", { month: "short" })}${parsedDate.getFullYear()}`;
  }

  const compact = monthKey
    .replace(" Seniority List", "")
    .replace("Category_List_", "")
    .replace(".pdf", "")
    .trim();

  if (compact.length <= 8) {
    return compact;
  }

  const words = compact.split(" ");
  if (words.length >= 2) {
    return `${words[0].slice(0, 3)}${words[1]}`;
  }

  return compact.slice(0, 8);
}

function evaluateCategoryHold(
  entry: CategoryEntry,
  userSeniorityNumber: number,
  currentCategoryKey: string | null
) {
  if (!userSeniorityNumber) {
    return {
      label: "No pilot" as HoldLabel,
      note: "Enter an employee number to compare the pilot against this category.",
    };
  }

  if (currentCategoryKey === entry.key) {
    return {
      label: "Current category" as HoldLabel,
      note: "This is the pilot's current category.",
    };
  }

  const gap = userSeniorityNumber - entry.mostJuniorNumber;
  if (gap <= 0) {
    return {
      label: "Can Hold" as HoldLabel,
      note: `Pilot is senior enough to hold this category now.`,
    };
  }

  if (gap <= 300) {
    return {
      label: "Close" as HoldLabel,
      note: `Pilot is ${gap} numbers junior to the current line.`,
    };
  }

  return {
    label: "Senior to You" as HoldLabel,
    note: `Pilot is ${gap} numbers junior to the current line.`,
  };
}

function evaluateAeReach(entry: AeEntry, userSeniorityNumber: number) {
  if (entry.mostJuniorAwardNumber == null) {
    return {
      label: "No line yet" as AeReachLabel,
      note: "This AE category does not have a parsed junior-most award line yet.",
    };
  }

  if (!userSeniorityNumber) {
    return {
      label: "No pilot" as AeReachLabel,
      note: "Enter an employee number to compare against the latest AE award range.",
    };
  }

  const gap = userSeniorityNumber - entry.mostJuniorAwardNumber;
  if (gap <= 0) {
    return {
      label: "Junior to You" as AeReachLabel,
      note: "The latest AE award reached at least to this pilot's number.",
    };
  }

  if (gap <= 250) {
    return {
      label: "Close" as AeReachLabel,
      note: `Pilot is ${gap} numbers junior to the latest AE award line.`,
    };
  }

  return {
    label: "Senior to You" as AeReachLabel,
    note: `Pilot is ${gap} numbers junior to the latest AE award line.`,
  };
}

function buildHoldSummary(
  entries: readonly CategoryEntry[],
  userSeniorityNumber: number,
  currentCategoryKey: string | null
) {
  return entries.reduce(
    (acc, entry) => {
      const result = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
      if (result.label === "Can Hold") {
        acc.canHold += 1;
      }
      if (result.label === "Close") {
        acc.nearLine += 1;
      }
      if (result.label === "Current category") {
        acc.currentCategory += 1;
      }
      return acc;
    },
    { canHold: 0, nearLine: 0, currentCategory: 0 }
  );
}

function buildAeSummary(entries: readonly AeEntry[], userSeniorityNumber: number) {
  return entries.reduce(
    (acc, entry) => {
      const result = evaluateAeReach(entry, userSeniorityNumber);
      if (result.label === "Junior to You") {
        acc.wentJunior += 1;
      }
      if (result.label === "Close") {
        acc.close += 1;
      }
      return acc;
    },
    { wentJunior: 0, close: 0 }
  );
}

function buildAeProjection(
  pilot: PilotRecord | null,
  target: AeEntry | null,
  history: AeHistoryRecord | null,
  pilots: readonly PilotRecord[]
) {
  if (!pilot || !target || target.mostJuniorAwardNumber == null) {
    return null;
  }

  const pilotsAhead = pilots.filter(
    (entry) =>
      entry.seniorityNumber > target.mostJuniorAwardNumber! &&
      entry.seniorityNumber <= pilot.seniorityNumber
  ).length;
  const positionsNeeded = Math.max(0, pilotsAhead);
  const averageAwardsPerPosting =
    history && history.points.length > 0
      ? history.points.reduce((sum, point) => sum + point.awards, 0) / history.points.length
      : target.awards;
  const estimatedPostingsToReach =
    averageAwardsPerPosting > 0 ? Math.ceil(positionsNeeded / averageAwardsPerPosting) : null;

  return {
    pilotsAhead,
    positionsNeeded,
    averageAwardsPerPosting,
    estimatedPostingsToReach,
  };
}

function buildBaseCategorySummary(
  entries: readonly CategoryEntry[],
  trendMap: ReadonlyMap<string, {
    latestPilotCount: number;
    pilotCountDelta: number | null;
  }>
) {
  return entries.reduce(
    (acc, entry) => {
      const trend = trendMap.get(entry.key);
      acc.currentPilots += entry.pilotCount;
      acc.projectedDelta += trend?.pilotCountDelta ?? 0;
      acc.projectedPilots += entry.pilotCount + (trend?.pilotCountDelta ?? 0);
      return acc;
    },
    { currentPilots: 0, projectedPilots: 0, projectedDelta: 0 }
  );
}

function rowStyleForHold(label: HoldLabel) {
  if (label === "Current category") {
    return styles.tableRowCurrent;
  }
  if (label === "Can Hold") {
    return styles.tableRowHold;
  }
  if (label === "Senior to You") {
    return styles.tableRowNoHold;
  }
  return styles.tableRowNeutral;
}

function rowStyleForAeReach(label: string) {
  if (label === "Junior to You") {
    return styles.tableRowHold;
  }
  if (label === "Senior to You") {
    return styles.tableRowNoHold;
  }
  return styles.tableRowNeutral;
}

function formatSignedCount(value: number | null) {
  if (value == null) {
    return "New";
  }
  if (value === 0) {
    return "Flat";
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function formatSignedChange(value: number | null, prefix = "") {
  if (value == null) {
    return null;
  }
  if (value === 0) {
    return "0";
  }
  return value > 0 ? `+${prefix}${value}` : `-${prefix}${Math.abs(value)}`;
}

function formatSeniorityValue(value: number | null) {
  return value != null ? `#${value}` : "-";
}

function formatOneDecimal(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "-";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asObjectArray<T extends Record<string, unknown>>(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is T => Boolean(item) && typeof item === "object") : [];
}

function toneForDelta(value: number | null) {
  if (value == null || value === 0) {
    return "neutral" as const;
  }
  return value > 0 ? ("positive" as const) : ("negative" as const);
}

function describeUserCategoryPosition(
  entry: CategoryEntry,
  fit: { label: HoldLabel; note: string },
  userSeniorityNumber: number,
  currentPilot: PilotRecord | null,
  categoryAssignments: readonly LatestCategoryAssignment[]
) {
  if (!userSeniorityNumber) {
    return { primary: "-", secondary: null as string | null };
  }
  if (fit.label === "Current category") {
    if (currentPilot?.currentCategoryRank && currentPilot.currentCategoryTotal) {
      const percent = Math.round(
        (currentPilot.currentCategoryRank / currentPilot.currentCategoryTotal) * 100
      );
      return {
        primary: `${currentPilot.currentCategoryRank}/${currentPilot.currentCategoryTotal}`,
        secondary: `${percent}%`,
      };
    }
    return { primary: `#${userSeniorityNumber}`, secondary: null };
  }
  const gap = userSeniorityNumber - entry.mostJuniorNumber;
  if (gap <= 0) {
    if (categoryAssignments.length > 0) {
      const existingRank = currentPilot
        ? categoryAssignments.findIndex(
            (assignment) => assignment.employeeNumber === currentPilot.employeeNumber
          )
        : -1;

      const rank =
        existingRank >= 0
          ? existingRank + 1
          : categoryAssignments.filter(
              (assignment) => assignment.seniorityNumber < userSeniorityNumber
            ).length + 1;
      const total = existingRank >= 0 ? categoryAssignments.length : categoryAssignments.length + 1;
      const percent = total > 0 ? Math.round((rank / total) * 100) : null;

      return {
        primary: `${rank}/${total}`,
        secondary: percent != null ? `${percent}%` : null,
      };
    }

    const categorySpan = Math.max(1, entry.mostJuniorNumber - entry.mostSeniorNumber);
    const relativePosition = Math.max(
      0,
      Math.min(1, (userSeniorityNumber - entry.mostSeniorNumber) / categorySpan)
    );
    const estimatedRank = Math.max(
      1,
      Math.min(entry.pilotCount, Math.round(relativePosition * (entry.pilotCount - 1)) + 1)
    );
    const percent = entry.pilotCount > 0 ? Math.round((estimatedRank / entry.pilotCount) * 100) : null;
    return {
      primary: `${estimatedRank}/${entry.pilotCount}`,
      secondary: percent != null ? `${percent}%` : null,
    };
  }
  return { primary: `+${gap}`, secondary: null };
}

function describeAeCategoryPosition(
  entry: AeEntry,
  userSeniorityNumber: number,
  currentPilot: PilotRecord | null,
  categoryAssignments: readonly LatestCategoryAssignment[]
) {
  if (!userSeniorityNumber || entry.mostJuniorAwardNumber == null) {
    return { primary: "-", secondary: null as string | null };
  }

  const gap = userSeniorityNumber - entry.mostJuniorAwardNumber;
  if (gap > 0) {
    return { primary: `+${gap}`, secondary: null as string | null };
  }

  if (categoryAssignments.length > 0) {
    const existingRank = currentPilot
      ? categoryAssignments.findIndex(
          (assignment) => assignment.employeeNumber === currentPilot.employeeNumber
        )
      : -1;
    const rank =
      existingRank >= 0
        ? existingRank + 1
        : categoryAssignments.filter(
            (assignment) => assignment.seniorityNumber < userSeniorityNumber
          ).length + 1;
    const total = existingRank >= 0 ? categoryAssignments.length : categoryAssignments.length + 1;
    const percent = total > 0 ? Math.round((rank / total) * 100) : null;

    return {
      primary: `${rank}/${total}`,
      secondary: percent != null ? `${percent}%` : null,
    };
  }

  return { primary: "hold", secondary: null as string | null };
}

function formatDelta(value: number | null, noun: string) {
  if (value == null) {
    return "New";
  }
  if (value === 0) {
    return "No change";
  }
  return value > 0 ? `+${value} ${noun}` : `${value} ${noun}`;
}

function describeCarveout(base: string) {
  if (base === "NBC") {
    return "Not a true base. These pilots are not currently assigned a base, including leave status or new-hire training transitions.";
  }
  if (base === "INS") {
    return "Instructor carveout. Useful for visibility, but not treated as a normal operating base.";
  }
  if (base === "SUP") {
    return "Management carveout for chief and assistant chief pilot categories.";
  }
  return "Special carveout category.";
}

function SectionCard({
  title,
  description,
  children,
  hideHeader,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  hideHeader?: boolean;
}) {
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel style={styles.card}>
      {!hideHeader ? (
        <>
          <Text style={[styles.cardTitle, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
            {title}
          </Text>
          <Text
            style={[
              styles.cardDescription,
              { color: palette.textSecondary, fontFamily: fliegerTypography.familyBody },
            ]}
          >
            {description}
          </Text>
        </>
      ) : null}
      <View style={styles.cardBody}>{children}</View>
    </InstrumentPanel>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "gold" | "green";
}) {
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel
      variant="dataPlate"
      tone={tone === "gold" ? "red" : tone === "green" ? "green" : "neutral"}
      style={[styles.metricCard, tone === "gold" && styles.metricGold, tone === "green" && styles.metricGreen]}
    >
      <Text style={[styles.metricLabel, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.metricValue,
          {
            color: tone === "gold" ? palette.red : tone === "green" ? palette.green : palette.textPrimary,
            fontFamily: fliegerTypography.familyValue,
            fontVariant: ["tabular-nums"],
          },
        ]}
      >
        {value}
      </Text>
    </InstrumentPanel>
  );
}

function SnapshotPill({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel variant="dataPlate" style={styles.snapshotPill}>
      <Text style={[styles.snapshotLabel, { color: palette.textMuted, fontFamily: fliegerTypography.familyLabel }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.snapshotValue,
          { color: palette.textPrimary, fontFamily: fliegerTypography.familyValue, fontVariant: ["tabular-nums"] },
        ]}
      >
        {value}
      </Text>
      {detail ? <Text style={styles.snapshotDetail}>{detail}</Text> : null}
    </InstrumentPanel>
  );
}

function SummaryCard({
  title,
  mainValue,
  detailValue,
  subValue,
  progress,
}: {
  title: string;
  mainValue: string;
  detailValue: string;
  subValue: string;
  progress: number;
}) {
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel variant="elevated" style={styles.summaryCard}>
      <Text style={[styles.summaryTitle, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
        {title}
      </Text>
      <Text
        style={[
          styles.summaryMain,
          { color: palette.cream, fontFamily: fliegerTypography.familyValue, fontVariant: ["tabular-nums"] },
        ]}
      >
        {mainValue}
      </Text>
      <Text
        style={[styles.summaryDetail, { color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }]}
      >
        {detailValue}
      </Text>
      <Text style={[styles.summarySub, { color: palette.textMuted, fontFamily: fliegerTypography.familyBody }]}>
        {subValue}
      </Text>
      <View style={[styles.summaryTrack, { backgroundColor: palette.accentSoft }]}>
        <View
          style={[
            styles.summaryFill,
            { width: `${Math.max(6, Math.min(100, progress))}%`, backgroundColor: palette.red },
          ]}
        />
      </View>
    </InstrumentPanel>
  );
}

function LegendSwatch({
  label,
  color,
  border,
}: {
  label: string;
  color: string;
  border?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }, border && styles.legendBorder]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.formRow}>{children}</View>;
}

function LabeledInput({
  label,
  value,
  onChangeText,
  prefix,
  suffix,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  prefix?: string;
  suffix?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.inputGroup}>
      <InstrumentField
        label={label}
        value={value}
        onChangeText={onChangeText}
        prefix={prefix}
        suffix={suffix}
        keyboardType={keyboardType ?? "numeric"}
      />
    </View>
  );
}

function TextAreaInput({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.inputGroup}>
      <InstrumentField
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline
        minHeight={220}
        autoCapitalize={autoCapitalize ?? "characters"}
      />
    </View>
  );
}

function ChoiceChipRow<T extends string>({
  label,
  value,
  options,
  onChange,
  compact,
}: {
  label: string;
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (next: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={compact ? styles.compactChoiceGroup : styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.baseSelector, compact && styles.compactChipRow]}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.baseChip, compact && styles.compactBaseChip, value === option.key && styles.baseChipActive]}
            onPress={() => onChange(option.key)}
          >
            <Text
              style={[
                styles.baseChipLabel,
                compact && styles.compactBaseChipLabel,
                value === option.key && styles.baseChipLabelActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ResultLine({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.resultLine}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={[styles.resultValue, emphasis && styles.resultValueEmphasis]}>{value}</Text>
    </View>
  );
}

type TodayTimelineItem =
  | {
      key: string;
      type: "leg";
      leg: RotationDashboardData["legs"][number];
      isHighlighted: boolean;
      dayLabel: string;
    }
  | {
      key: string;
      type: "layover";
      city: string;
      isHighlighted: false;
      dayLabel: string;
    };

function buildTodayTimelineItems(dashboard: RotationDashboardData): TodayTimelineItem[] {
  const layoverSet = new Set(
    dashboard.snapshot.layoverCities.map((city) => city.trim().toUpperCase()).filter(Boolean),
  );
  const items: TodayTimelineItem[] = [];
  dashboard.legs.forEach((leg, index) => {
    items.push({
      key: `leg-${leg.id}`,
      type: "leg",
      leg,
      isHighlighted: index === 0,
      dayLabel: leg.dayLabel,
    });
    const arrivalCity = leg.destination.trim().toUpperCase();
    const isLastLeg = index === dashboard.legs.length - 1;
    if (!isLastLeg && layoverSet.has(arrivalCity)) {
      items.push({
        key: `layover-${leg.id}-${arrivalCity}`,
        type: "layover",
        city: arrivalCity,
        isHighlighted: false,
        dayLabel: leg.dayLabel,
      });
    }
  });
  return items;
}

function getTimelineLayoverDetail(dashboard: RotationDashboardData, city: string) {
  return (
    dashboard.layoverDetails?.find(
      (detail) => detail.city.trim().toUpperCase() === city.trim().toUpperCase(),
    ) ?? null
  );
}

function isPlaceholderPhoneValue(value?: string | null) {
  if (!value) {
    return false;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) {
    return false;
  }
  return /^(\d)\1+$/.test(digits);
}

function getLayoverTransportDisplay(detail: RotationLayoverDetail | null) {
  if (!detail) {
    return null;
  }
  if (detail.transportType === "skyhop") {
    return "SkyHop Global";
  }
  if (detail.transportType === "ccar") {
    return "Hotel / CCAR";
  }
  if (detail.transportType === "limo") {
    return detail.transportProvider ?? "Limo";
  }
  return detail.transportProvider ?? detail.transport ?? null;
}

function getLayoverTransportPhoneLabel(detail: RotationLayoverDetail | null) {
  if (!detail) {
    return null;
  }
  if (detail.transportType === "skyhop") {
    return "Van";
  }
  if (detail.transportType === "limo") {
    return "Limo";
  }
  if (detail.transportType === "ccar") {
    return "CCAR";
  }
  return "Transport";
}

function getLayoverActionableTransportPhone(detail: RotationLayoverDetail | null) {
  if (!detail) {
    return null;
  }
  const transportPhone = !isPlaceholderPhoneValue(detail.transportPhone) ? detail.transportPhone : null;
  if (detail.transportType === "ccar") {
    return transportPhone ?? detail.hotelPhone ?? null;
  }
  return transportPhone;
}

function getLayoverDisplayTransportPhone(detail: RotationLayoverDetail | null) {
  if (!detail) {
    return null;
  }
  const transportPhone = !isPlaceholderPhoneValue(detail.transportPhone) ? detail.transportPhone : null;
  if (detail.transportType === "ccar") {
    return transportPhone;
  }
  return transportPhone;
}

function isReturnToGateLeg(leg: RotationDashboardData["legs"][number]) {
  return !leg.isDeadhead && leg.origin === leg.destination;
}

type TripBriefIdentity = {
  category?: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTimeKey: string;
  departureDateKey: string | null;
};

function normalizeBriefTimeKey(value?: string | null) {
  if (!value) return "";
  const hhmmMatch = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmmMatch) {
    return `${hhmmMatch[1].padStart(2, "0")}${hhmmMatch[2]}`;
  }
  const compactMatch = value.match(/\b(\d{4})\b/);
  return compactMatch?.[1] ?? "";
}

function normalizeBriefDateKey(value?: string | null) {
  if (!value) return null;
  const dateMatch = value.toUpperCase().match(/\b(\d{2}[A-Z]{3})(?:\d{2,4})?\b/);
  return dateMatch?.[1] ?? null;
}

function normalizeTripBriefFlightIdentity(carrier?: string | null, flightNumber?: string | null) {
  const combined = `${carrier ?? ""}${flightNumber ?? ""}`.toUpperCase().trim();
  const prefixedMatch = combined.match(/^([A-Z0-9]{2,3})(\d{1,4})$/);
  if (prefixedMatch) {
    return {
      carrier: prefixedMatch[1],
      flightNumber: prefixedMatch[2],
    };
  }
  return {
    carrier: (carrier ?? "DL").toUpperCase(),
    flightNumber: (flightNumber ?? "").replace(/^[A-Z]+/i, ""),
  };
}

function getTripBriefIdentityFromLeg(
  leg: RotationDashboardData["legs"][number],
  category?: string,
): TripBriefIdentity {
  const normalizedFlight = normalizeTripBriefFlightIdentity(leg.carrier, leg.flightNumber);
  return {
    category,
    carrier: normalizedFlight.carrier,
    flightNumber: normalizedFlight.flightNumber,
    origin: leg.origin.toUpperCase(),
    destination: leg.destination.toUpperCase(),
    departureTimeKey: normalizeBriefTimeKey(leg.departureTime),
    departureDateKey: normalizeBriefDateKey(leg.sourceText),
  };
}

function getTripBriefIdentityFromItem(item: {
  label: string;
  detail?: string;
  actionCopyValue?: string;
}) {
  const detail = item.detail ?? "";
  const carrierFlightMatch = detail.match(/\b([A-Z0-9]{2,3})(\d{1,4})\b/);
  const cityPairMatch = detail.match(/\b([A-Z]{3}-[A-Z]{3})\b/);
  const departureMatch = detail.match(/(?:departs|from)\s+([0-9]{1,2}:\d{2}|[0-9]{4})(?:\s+([0-9]{2}[A-Z]{3}(?:\d{2,4})?))?/i);
  if (!carrierFlightMatch || !cityPairMatch) return null;
  const [origin, destination] = cityPairMatch[1].split("-");
  return {
    category: item.label.toUpperCase().startsWith("RTG") ? "RTG" : undefined,
    carrier: carrierFlightMatch[1].toUpperCase(),
    flightNumber: carrierFlightMatch[2],
    origin,
    destination,
    departureTimeKey: normalizeBriefTimeKey(departureMatch?.[1] ?? ""),
    departureDateKey: normalizeBriefDateKey(departureMatch?.[2] ?? detail),
  };
}

function isSameTripBriefIdentity(left?: TripBriefIdentity | null, right?: TripBriefIdentity | null) {
  if (!left || !right) return false;
  const sameCore =
    (left.category ?? "") === (right.category ?? "") &&
    left.carrier === right.carrier &&
    left.flightNumber === right.flightNumber &&
    left.origin === right.origin &&
    left.destination === right.destination &&
    left.departureTimeKey === right.departureTimeKey;
  if (!sameCore) return false;
  if (left.departureDateKey && right.departureDateKey) {
    return left.departureDateKey === right.departureDateKey;
  }
  return true;
}

function getTripBriefPriority(item: {
  label: string;
  detail?: string;
  actionCopyValue?: string;
}) {
  const label = item.label.toUpperCase();
  const detail = (item.detail ?? "").toUpperCase();
  if (label.includes("PARTIAL")) return 1;
  if ((label.includes("DEADHEAD") || label === "DH FIRST") && item.actionCopyValue) return 2;
  if (label.includes("DEADHEAD") || label === "DH FIRST") return 3;
  if (label === "RTG") return 4;
  if (label.includes("TIGHT")) return 5;
  if (label.includes("REST") || label.includes("PRESSURE") || detail.includes("LAYOVER")) return 6;
  if (label.includes("NO MAJOR ISSUES")) return 7;
  return 6;
}

function CompactAlertChip({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "watch" | "risk";
}) {
  return (
    <View
      style={[
        styles.compactAlertChip,
        tone === "good"
          ? styles.compactAlertChipGood
          : tone === "watch"
            ? styles.compactAlertChipWatch
            : styles.compactAlertChipRisk,
      ]}
    >
      <Text style={styles.compactAlertChipText}>{label}</Text>
    </View>
  );
}

function TripBoardSummaryCell({
  label,
  value,
  detail,
  wide,
  compact,
  mini,
}: {
  label: string;
  value: string;
  detail?: string | null;
  wide?: boolean;
  compact?: boolean;
  mini?: boolean;
}) {
  return (
    <InstrumentPanel
      variant="dataPlate"
      style={[
        styles.tripBoardSummaryCell,
        compact ? styles.tripBoardSummaryCellCompact : null,
        mini ? styles.tripBoardSummaryCellMini : null,
        wide ? styles.tripBoardSummaryCellWide : null,
      ]}
    >
      <Text style={[styles.tripBoardSummaryCellLabel, compact ? styles.tripBoardSummaryCellLabelCompact : null]}>
        {label}
      </Text>
      <Text
        style={[
          styles.tripBoardSummaryCellValue,
          compact ? styles.tripBoardSummaryCellValueCompact : null,
          mini ? styles.tripBoardSummaryCellValueMini : null,
        ]}
      >
        {value}
      </Text>
      {detail ? (
        <Text style={[styles.tripBoardSummaryCellDetail, compact ? styles.tripBoardSummaryCellDetailCompact : null]}>
          {detail}
        </Text>
      ) : null}
    </InstrumentPanel>
  );
}

function TableValueCell({
  primary,
  delta,
  deltaTone = "neutral",
}: {
  primary: string;
  delta?: string | null;
  deltaTone?: "positive" | "negative" | "neutral";
}) {
  return (
    <View style={styles.tableValueCell}>
      <Text style={styles.tableCell}>{primary}</Text>
      {delta ? (
        <Text
          style={[
            styles.tableDelta,
            deltaTone === "positive" && styles.tableDeltaPositive,
            deltaTone === "negative" && styles.tableDeltaNegative,
          ]}
        >
          {delta}
        </Text>
      ) : null}
    </View>
  );
}

function MobileMetric({
  label,
  value,
  detail,
  detailTone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string | null;
  detailTone?: "positive" | "negative" | "neutral";
}) {
  return (
    <View style={styles.mobileMetricCard}>
      <Text style={styles.mobileMetricLabel}>{label}</Text>
      <Text style={styles.mobileMetricValue}>{value}</Text>
      {detail ? (
        <Text
          style={[
            styles.mobileMetricDetail,
            detailTone === "positive" && styles.tableDeltaPositive,
            detailTone === "negative" && styles.tableDeltaNegative,
          ]}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function fliegerStatusCopy(label: string) {
  if (label === "Can Hold" || label === "Junior to You") {
    return {
      status: "CAN HOLD",
      badgeLabel: "IN CATEGORY",
    };
  }
  if (label === "Senior to You") {
    return {
      status: "NOT HOLDABLE",
      badgeLabel: "SENIOR TO YOU",
    };
  }
  return {
    status: label.toUpperCase(),
    badgeLabel: "STATUS",
  };
}

function fliegerTonePalette(tone: "green" | "amber" | "red" | "neutral") {
  const palette = getFliegerPalette();
  if (tone === "green") {
    return {
      borderColor: palette.greenBorder,
      statusColor: palette.green,
      badgeBackground: palette.surfaceRaised,
      badgeBorder: palette.greenBorder,
    };
  }
  if (tone === "red") {
    return {
      borderColor: palette.redBorder,
      statusColor: palette.red,
      badgeBackground: palette.surfaceRaised,
      badgeBorder: palette.redBorder,
    };
  }
  return {
    borderColor: palette.borderStrong,
    statusColor: tone === "amber" ? palette.label : palette.textSecondary,
    badgeBackground: palette.surfaceRaised,
    badgeBorder: palette.borderStrong,
  };
}

function InstrumentCategoryCard({
  title,
  status,
  tone,
  badgePrimary,
  badgeLabel,
  statPairs,
  footer,
  onPress,
}: {
  title: string;
  status: string;
  tone: "green" | "amber" | "red" | "neutral";
  badgePrimary: string;
  badgeLabel: string;
  statPairs: Array<{ label: string; value: string }>;
  footer?: string;
  onPress?: () => void;
}) {
  const palette = getFliegerPalette();
  const tonePalette = fliegerTonePalette(tone);
  return (
    <DecisionRow
      title={title}
      status={status}
      variant={tone === "green" ? "canHold" : tone === "red" ? "notHoldable" : tone === "amber" ? "close" : "current"}
      badgePrimary={badgePrimary}
      badgeLabel={badgeLabel}
      statPairs={statPairs}
      footer={footer}
      onPress={onPress}
    />
  );
}

function MiniBarChart({
  title,
  subtitle,
  points,
  showTrack = true,
}: {
  title: string;
  subtitle: string;
  points: ChartPoint[];
  showTrack?: boolean;
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 520;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const hasReferenceLines = points.some(
    (point) => point.referenceOnePercent != null || point.referenceTwoPercent != null
  );

  return (
    <View style={[styles.chartCard, isCompact && styles.chartCardCompact]}>
      <Text style={styles.chartTitle}>{title}</Text>
      <Text style={styles.chartSubtitle}>{subtitle}</Text>
      {hasReferenceLines ? (
        <View style={[styles.chartLegendRow, isCompact && styles.chartLegendRowCompact]}>
          <LegendSwatch label="Actual / current" color="#6E79F6" />
          <LegendSwatch label="1% plan" color="#B44A3B" />
          <LegendSwatch label="2% plan" color="#5D9C3F" />
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.chartRow, isCompact && styles.chartRowCompact]}>
          {points.map((point) => (
            <View
              key={`${title}-${point.label}-${point.valueLabel}`}
              style={[styles.chartColumn, isCompact && styles.chartColumnCompact]}
            >
              <Text
                style={[
                  styles.chartValue,
                  isCompact && styles.chartValueCompact,
                  point.tone === "future" && styles.chartValueFuture,
                ]}
              >
                {point.valueLabel}
              </Text>
              <View
                style={[
                  styles.chartBarWrap,
                  isCompact && styles.chartBarWrapCompact,
                ]}
              >
                {point.referenceOnePercent != null ? (
                  <View
                    style={[
                      styles.chartReferenceMark,
                      styles.chartReferenceOne,
                      {
                        bottom: `${Math.max(
                          0,
                          Math.min(100, Math.round((point.referenceOnePercent / maxValue) * 100))
                        )}%`,
                      },
                    ]}
                  />
                ) : null}
                {point.referenceTwoPercent != null ? (
                  <View
                    style={[
                      styles.chartReferenceMark,
                      styles.chartReferenceTwo,
                      {
                        bottom: `${Math.max(
                          0,
                          Math.min(100, Math.round((point.referenceTwoPercent / maxValue) * 100))
                        )}%`,
                      },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.chartBar,
                    isCompact && styles.chartBarCompact,
                    point.tone === "future" && styles.chartBarFuture,
                    { height: `${Math.max(8, Math.round((point.value / maxValue) * 100))}%` },
                  ]}
                />
              </View>
              <Text style={[styles.chartLabel, isCompact && styles.chartLabelCompact]}>
                {point.label}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function MobileHomeDashboard({
  currentPilot,
  employeeNumberInput,
  onEmployeeNumberChange,
  preferences,
  onPreferencesChange,
  preferencesEditing,
  onPreferencesEditingChange,
  preferencesComplete,
  goalInput,
  onGoalInputChange,
  currentCategoryEntry,
  currentCategoryMovement,
  currentCategoryReach,
  currentCategoryTrend,
  systemPercent,
  systemTotalPilots,
  currentCategoryPercent,
  currentCategorySummary,
  onOpenCurrentCategory,
  projectedCategoryPercent,
  projectedCategoryRank,
  projectedCategoryTotal,
  trackedCategories,
  onOpenTrackedCategory,
  growthRate,
  onGrowthRateChange,
  growthMenuOpen,
  onGrowthMenuToggle,
  seniorityPercentSeries,
  seniorityNumberSeries,
  totalPilotCountSeries,
}: {
  currentPilot: PilotRecord | null;
  employeeNumberInput: string;
  onEmployeeNumberChange: (value: string) => void;
  preferences: PilotPreferences;
  onPreferencesChange: React.Dispatch<React.SetStateAction<PilotPreferences>>;
  preferencesEditing: boolean;
  onPreferencesEditingChange: (value: boolean) => void;
  preferencesComplete: boolean;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  currentCategoryEntry: CategoryEntry | null;
  currentCategoryMovement: AeMovementSummary | null;
  currentCategoryReach: ReturnType<typeof evaluateAeReach> | null;
  currentCategoryTrend: AeTrendEntry | null;
  systemPercent: number | null;
  systemTotalPilots: number;
  currentCategoryPercent: number | null;
  currentCategorySummary: CategoryEntry | null;
  onOpenCurrentCategory: (entry: CategoryEntry) => void;
  projectedCategoryPercent: number | null;
  projectedCategoryRank: number | null;
  projectedCategoryTotal: number | null;
  trackedCategories: ReturnType<typeof buildMobileCategoryCardDatum>[];
  onOpenTrackedCategory: (entry: CategoryEntry) => void;
  growthRate: number;
  onGrowthRateChange: (value: number) => void;
  growthMenuOpen: boolean;
  onGrowthMenuToggle: () => void;
  seniorityPercentSeries: ChartPoint[];
  seniorityNumberSeries: ChartPoint[];
  totalPilotCountSeries: ChartPoint[];
}) {
  const addGoal = () => {
    const normalized = normalizeCategoryPreference(goalInput);
    if (!normalized) {
      return;
    }
    onPreferencesChange((current) => ({
      ...current,
      goalCategories: Array.from(new Set([...current.goalCategories, normalized])),
    }));
    onGoalInputChange("");
  };
  const welcomeRole =
    currentCategorySummary?.seat === "Captain" ||
    currentPilot?.currentCategoryCode?.toUpperCase().endsWith("CA")
      ? "Captain"
      : currentCategorySummary?.seat === "First Officer" ||
          currentPilot?.currentCategoryCode?.toUpperCase().endsWith("FO")
        ? "FO"
        : "Pilot";

  return (
    <SectionCard
      title="Pilot Dashboard"
      description="Where you stand, what moved, and why your vacation is in February."
    >
      <View style={styles.identityCard}>
        <Text style={styles.identityName}>
          {currentPilot?.name ? `Welcome back ${welcomeRole} ${currentPilot.name}` : "Welcome back"}
        </Text>
        <Text style={styles.identityMeta}>
          {currentPilot
            ? `${currentPilot.currentCategoryCode} • Seniority #${currentPilot.seniorityNumber}`
            : "Add your employee number so CrewTools can personalize the mobile dashboard."}
        </Text>
        <FormRow>
          <LabeledInput
            label="Employee Number"
            value={employeeNumberInput}
            onChangeText={onEmployeeNumberChange}
          />
        </FormRow>
      </View>

      <View style={styles.mobileSummaryMetricRow}>
        <MobileKeyMetricCard
          label="System Seniority"
          value={systemPercent != null ? `${systemPercent}%` : "--"}
          detail={currentPilot ? "System list position" : "Enter employee number"}
          subdetail={
            currentPilot ? `#${currentPilot.seniorityNumber} of ${systemTotalPilots}` : ""
          }
        />
        <MobileKeyMetricCard
          label="Current Category"
          value={currentCategoryPercent != null ? `${currentCategoryPercent}%` : "--"}
          detail={currentPilot?.currentCategoryCode ?? "Category position loads after lookup"}
          subdetail={
            currentCategorySummary && currentPilot?.currentCategoryRank && currentPilot?.currentCategoryTotal
              ? `${currentPilot.currentCategoryRank}/${currentPilot.currentCategoryTotal} in ${currentCategorySummary.base}`
              : ""
          }
        />
        <MobileKeyMetricCard
          label="Projected Seniority"
          value={projectedCategoryPercent != null ? `${projectedCategoryPercent}%` : "--"}
          detail="Once all AE conversions are processed"
          subdetail={
            currentCategorySummary && projectedCategoryRank && projectedCategoryTotal
              ? `${projectedCategoryRank}/${projectedCategoryTotal} in ${currentCategorySummary.base}`
              : ""
          }
        />
      </View>

      <MobilePreferencesPanel
        currentPilot={currentPilot}
        currentCategoryEntry={currentCategoryEntry}
        preferencesEditing={preferencesEditing}
        preferencesComplete={preferencesComplete}
        onPreferencesEditingChange={onPreferencesEditingChange}
        goalInput={goalInput}
        onGoalInputChange={onGoalInputChange}
        onAddGoal={addGoal}
        onPreferencesChange={onPreferencesChange}
        watchedCategories={trackedCategories.map((item) => item.entry.key)}
        trackedCategoryItems={trackedCategories}
        onOpenCurrentCategory={onOpenCurrentCategory}
        onOpenTrackedCategory={onOpenTrackedCategory}
      />

      <MobileDashboardCard eyebrow="Seniority Progression" title="How your seniority grows over time">
        <Text style={styles.mobileDashboardBodyText}>
          Keep one shared annual growth assumption for your percent, number, and total-list charts.
        </Text>
        <View style={styles.dropdownWrap}>
          <Text style={styles.inputLabel}>Annual growth</Text>
          <TouchableOpacity style={styles.dropdownButton} onPress={onGrowthMenuToggle}>
            <Text style={styles.dropdownButtonText}>{Math.round(growthRate * 100)}% annual growth</Text>
          </TouchableOpacity>
          {growthMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {forecastGrowthRates.map((option) => (
                <TouchableOpacity
                  key={`home-growth-${option.value}`}
                  style={styles.dropdownItem}
                  onPress={() => onGrowthRateChange(option.value)}
                >
                  <Text style={styles.dropdownItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.mobileChartStack}>
          <MiniBarChart
            title="System Seniority Percent"
            subtitle={`Projected system seniority percent with ${Math.round(growthRate * 100)}% annual growth.`}
            points={seniorityPercentSeries.map((point) => ({
              ...point,
              referenceOnePercent: null,
              referenceTwoPercent: null,
            }))}
          />
          <MiniBarChart
            title="Pilot Seniority Number"
            subtitle="Projected seniority number over time at the same growth rate."
            points={seniorityNumberSeries}
          />
          <MiniBarChart
            title="Total Pilot List"
            subtitle="Past list size in navy, projected list size in red."
            points={totalPilotCountSeries}
          />
        </View>
      </MobileDashboardCard>
    </SectionCard>
  );
}

function MobilePreferencesEditor({
  currentPilot,
  onPreferencesChange,
  onDone,
  goalInput,
  onGoalInputChange,
  onAddGoal,
  watchedCategories,
}: {
  currentPilot: PilotRecord | null;
  onPreferencesChange: React.Dispatch<React.SetStateAction<PilotPreferences>>;
  onDone: () => void;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  onAddGoal: () => void;
  watchedCategories: string[];
}) {
  return (
    <View style={styles.mobilePreferencesEditor}>
      <ResultLine
        label="Current category"
        value={
          currentPilot?.currentCategoryCode ??
          "Enter employee number first"
        }
      />
      <View style={styles.mobileFormGroup}>
        <Text style={styles.inputLabel}>Categories I'm Watching</Text>
        <Text style={styles.mobileSectionText}>
          Add the seats you want pinned on Home. You can remove saved seats from the list above.
        </Text>
        <View style={styles.mobileGoalRow}>
          <View style={styles.mobileGoalInputWrap}>
            <InstrumentField
              value={goalInput}
              onChangeText={onGoalInputChange}
              placeholder="ATL-320-CA or SLC220A"
              autoCapitalize="characters"
            />
          </View>
          <InstrumentButton label="Add" variant="active" onPress={onAddGoal} style={styles.mobileAddGoalButton} />
        </View>
        {watchedCategories.length > 0 ? (
          <View style={styles.baseSelector}>
            {watchedCategories.map((goal) => (
              <InstrumentChip
                key={`goal-${goal}`}
                style={[styles.baseChip, styles.goalChip]}
                variant="active"
                label={displayCategoryPreference(goal)}
                onPress={() =>
                  onPreferencesChange((current) => ({
                    ...current,
                    goalCategories: current.goalCategories.filter((entry) => entry !== goal),
                  }))
                }
              />
            ))}
          </View>
        ) : (
          <Text style={styles.mobileDecisionFooter}>
            No watch categories yet. Add the seats you want this dashboard to track.
          </Text>
        )}
      </View>
      <InstrumentButton label="Save" variant="active" onPress={onDone} style={styles.mobileSavePrefsButton} />
    </View>
  );
}

function MobilePreferencesPanel({
  currentPilot,
  currentCategoryEntry,
  preferencesEditing,
  preferencesComplete,
  onPreferencesEditingChange,
  goalInput,
  onGoalInputChange,
  onAddGoal,
  onPreferencesChange,
  watchedCategories,
  trackedCategoryItems,
  onOpenCurrentCategory,
  onOpenTrackedCategory,
}: {
  currentPilot: PilotRecord | null;
  currentCategoryEntry: CategoryEntry | null;
  preferencesEditing: boolean;
  preferencesComplete: boolean;
  onPreferencesEditingChange: (value: boolean) => void;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  onAddGoal: () => void;
  onPreferencesChange: React.Dispatch<React.SetStateAction<PilotPreferences>>;
  watchedCategories: string[];
  trackedCategoryItems: ReturnType<typeof buildMobileCategoryCardDatum>[];
  onOpenCurrentCategory: (entry: CategoryEntry) => void;
  onOpenTrackedCategory: (entry: CategoryEntry) => void;
}) {
  const palette = getFliegerPalette();
  const watchedRows = [
    ...(currentCategoryEntry
      ? [
          {
            key: `current-${currentCategoryEntry.key}`,
            title: formatCategoryEntryCode(currentCategoryEntry),
            subtitle: "CAN HOLD • Tap for details",
            badge: "Current",
            tone: "green" as const,
            deletable: false,
            onPress: () => onOpenTrackedCategory(currentCategoryEntry),
            onDelete: null,
          },
        ]
      : []),
    ...trackedCategoryItems
      .filter((item) => item.entry.key !== currentCategoryEntry?.key)
      .map((item) => ({
        key: `watch-${item.entry.key}`,
        title: formatCategoryEntryCode(item.entry),
        subtitle:
          item.statusLabel === "Can Hold"
            ? "CAN HOLD • Tap for details"
            : item.statusLabel === "Senior to You"
              ? "NOT HOLDABLE • Tap for details"
              : `${item.statusLabel.toUpperCase()} • Tap for details`,
        badge: item.statusLabel === "Can Hold" ? "IN CATEGORY" : item.statusLabel === "Senior to You" ? "SENIOR TO YOU" : item.statusLabel.toUpperCase(),
        tone: item.tone,
        deletable: true,
        onPress: () => onOpenTrackedCategory(item.entry),
        onDelete: () =>
          onPreferencesChange((current) => ({
            ...current,
            goalCategories: current.goalCategories.filter((entry) => entry !== item.entry.key),
          })),
      })),
  ];

  return (
    <View style={styles.mobilePreferencesCard}>
      <View style={styles.mobilePrefsSummaryHeader}>
        <View style={styles.mobileListCopy}>
          <Text style={styles.mobileSectionTitle}>Categories I'm Watching</Text>
          <Text style={styles.mobileSectionText}>
            {preferencesComplete
              ? "Add the seats you want pinned on Home, and remove them when you no longer need them."
              : "Load your pilot first, then add the categories you want pinned on Home."}
          </Text>
        </View>
        <InstrumentButton
          label={preferencesEditing ? "Close" : "Edit"}
          variant={preferencesEditing ? "danger" : "active"}
          compact
          onPress={() => onPreferencesEditingChange(!preferencesEditing)}
          style={styles.mobileEditPrefsButton}
        />
      </View>
      {watchedRows.length > 0 ? (
        <View style={styles.mobileTrackedCategoryList}>
          {watchedRows.map((row) => (
            <View key={row.key} style={styles.mobileTrackedCategoryRow}>
              <TouchableOpacity
                style={[
                  styles.mobileTrackedCategoryMain,
                  statusBackgroundStyle(row.tone),
                ]}
                activeOpacity={0.85}
                onPress={row.onPress}
              >
                <View pointerEvents="none" style={styles.mobileTrackedCategoryTopEdge} />
                <View pointerEvents="none" style={styles.mobileTrackedCategoryBottomEdge} />
                <View
                  pointerEvents="none"
                  style={styles.mobileTrackedCategoryInnerEdge}
                />
                <View style={styles.mobileTrackedCategoryCopy}>
                  <Text style={[styles.mobileTrackedCategoryTitle, { color: palette.textPrimary }]}>{row.title}</Text>
                  <Text style={[styles.mobileTrackedCategorySubtitle, { color: palette.textMuted }]}>{row.subtitle}</Text>
                </View>
                <MobileStatusBadge label={row.badge} tone={row.tone} />
              </TouchableOpacity>
              {row.deletable && row.onDelete ? (
                <InstrumentButton
                  label="Delete"
                  variant="danger"
                  compact
                  onPress={row.onDelete}
                  style={styles.mobileTrackedDeleteButton}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.mobileDecisionFooter}>
          Your current category will always live here. Tap Edit to add more seats to follow.
        </Text>
      )}
      {preferencesEditing ? (
        <MobilePreferencesEditor
          currentPilot={currentPilot}
          onPreferencesChange={onPreferencesChange}
          onDone={() => onPreferencesEditingChange(false)}
          goalInput={goalInput}
          onGoalInputChange={onGoalInputChange}
          onAddGoal={onAddGoal}
          watchedCategories={watchedCategories}
        />
      ) : null}
    </View>
  );
}

function MobileKeyMetricCard({
  label,
  value,
  detail,
  subdetail,
}: {
  label: string;
  value: string;
  detail: string;
  subdetail?: string;
}) {
  return (
    <View style={styles.mobileKeyMetricCard}>
      <Text style={styles.mobileKeyMetricLabel}>{label}</Text>
      <Text style={styles.mobileKeyMetricValue}>{value}</Text>
      <Text style={styles.mobileKeyMetricDetail}>{detail}</Text>
      {subdetail ? <Text style={styles.mobileKeyMetricSubdetail}>{subdetail}</Text> : null}
    </View>
  );
}

function MobileCategoriesView({
  currentPilot,
  entries,
  filter,
  onFilterChange,
  relevantBases,
  onOpenCategory,
}: {
  currentPilot: PilotRecord | null;
  entries: ReturnType<typeof buildMobileCategoryCards>;
  filter: MobileCategoryFilterKey;
  onFilterChange: (value: MobileCategoryFilterKey) => void;
  relevantBases: string[];
  onOpenCategory: (entry: CategoryEntry) => void;
}) {
  return (
    <SectionCard
      title="Categories"
      description="Tap a category to see the full list. Mobile stays focused on quick bid decisions instead of table scanning."
    >
      <View style={styles.identityCard}>
        <Text style={styles.identityName}>{currentPilot?.name ?? "Pilot categories"}</Text>
        <Text style={styles.identityMeta}>
          {relevantBases.length > 0
            ? `My bases: ${relevantBases.join(", ")}`
            : "Set your base preferences on Home to prioritize the right categories."}
        </Text>
      </View>
      <View style={styles.baseSelector}>
        {mobileCategoryFilters.map((chip) => (
          <InstrumentChip
            key={chip.key}
            style={[styles.baseChip, filter === chip.key && styles.baseChipActive]}
            variant={filter === chip.key ? "active" : "neutral"}
            label={chip.label}
            onPress={() => onFilterChange(chip.key)}
          />
        ))}
      </View>
      <View style={styles.mobileCardStack}>
        {entries.map((item) => (
          <InstrumentCategoryCard
            key={`mobile-category-${item.entry.key}`}
            title={formatFliegerCategoryTitle(item.entry)}
            status={
              item.statusLabel === "Can Hold"
                ? "CAN HOLD"
                : item.statusLabel === "Senior to You"
                  ? "NOT HOLDABLE"
                  : item.statusLabel.toUpperCase()
            }
            tone={item.tone}
            badgePrimary={item.badgePrimary}
            badgeLabel={item.badgeLabel}
            statPairs={[
              { label: "SR", value: `#${item.entry.mostSeniorNumber}` },
              {
                label: "MID",
                value: item.entry.middleSeniorityNumber != null ? `#${item.entry.middleSeniorityNumber}` : "-",
              },
              {
                label: "JUNIOR",
                value: `#${item.entry.mostJuniorNumber}${item.userPosition.primary.startsWith("+") ? ` ${item.userPosition.primary}` : ""}`,
              },
              { label: "YOU", value: item.userPosition.secondary ?? item.userPosition.primary },
            ]}
            footer="Tap for details"
            onPress={() => onOpenCategory(item.entry)}
          />
        ))}
      </View>
    </SectionCard>
  );
}

function MobileMovementView({
  currentPilot,
  currentCategoryCode,
  currentCategoryMovement,
  currentCategoryReach,
  currentCategoryTrend,
  feedItems,
  onOpenAe,
}: {
  currentPilot: PilotRecord | null;
  currentCategoryCode: string;
  currentCategoryMovement: AeMovementSummary | null;
  currentCategoryReach: ReturnType<typeof evaluateAeReach> | null;
  currentCategoryTrend: AeTrendEntry | null;
  feedItems: ReturnType<typeof buildMobileMovementFeed>;
  onOpenAe: (item: ReturnType<typeof buildMobileMovementFeed>[number]) => void;
}) {
  return (
    <SectionCard
      title="Movement"
      description="See what changed in the categories that matter to you this month, not a giant dump of every seat in the system."
    >
      <MobileDashboardCard eyebrow="Current Category Movement" title={currentCategoryCode || currentPilot?.currentCategoryCode || "Set your current category"}>
        <View style={styles.mobileDashboardHeaderRow}>
          <MobileStatusBadge
            label={currentCategoryReach?.label ?? "No line yet"}
            tone={toneForPilotStatus(currentCategoryReach?.label ?? "No line yet")}
          />
          <Text style={styles.mobileDashboardMeta}>
            {describeMovementDirection(currentCategoryTrend?.lineMovement ?? null)}
          </Text>
        </View>
        <Text style={styles.mobileDashboardBodyText}>
          {currentCategoryMovement
            ? `AE only: In ${currentCategoryMovement.aeIn} • Out ${currentCategoryMovement.aeOut} • Net ${formatSignedCount(currentCategoryMovement.net)}`
            : "No parsed AE movement for this category in the latest posting."}
        </Text>
      </MobileDashboardCard>
      <View style={styles.mobileCardStack}>
        {feedItems.map((item) => (
          <InstrumentCategoryCard
            key={`movement-${item.entry.awardCategory}`}
            title={item.entry.awardCategory}
            status={item.statusLabel === "Junior to You" ? "CAN HOLD" : item.statusLabel === "Senior to You" ? "NOT HOLDABLE" : item.statusLabel.toUpperCase()}
            tone={item.tone}
            badgePrimary={item.summaryText.includes("#") ? item.summaryText.split(" ").find((part) => part.startsWith("#")) ?? item.summaryText : item.statusLabel === "Senior to You" ? "AE" : "LIVE"}
            badgeLabel={item.statusLabel === "Senior to You" ? "SENIOR TO YOU" : item.statusLabel === "Junior to You" ? "IN CATEGORY" : "LATEST AE"}
            statPairs={[
              { label: "JUNIOR", value: formatSeniorityValue(item.entry.mostJuniorAwardNumber) },
              { label: "TREND", value: item.trendText.replace("Moved ", "") },
              { label: "AWARDS", value: `${item.entry.awards}` },
              { label: "BASE", value: item.entry.base },
            ]}
            footer="Tap for awards"
            onPress={() => onOpenAe(item)}
          />
        ))}
      </View>
    </SectionCard>
  );
}

function MobileCareerPlanningView({
  currentPilot,
  milestones,
  activeWhatIfCategory,
  whatIfSeat,
  setWhatIfSeat,
  whatIfFleetOptions,
  selectedWhatIfFleet,
  setSelectedWhatIfFleet,
  whatIfBaseOptions,
  selectedWhatIfBase,
  setSelectedWhatIfBase,
  holdPlannerView,
  setHoldPlannerView,
  currentAeAnalysis,
  holdForecast,
  forecastGrowthRate,
  setForecastGrowthRate,
  forecastGrowthMenuOpen,
  setForecastGrowthMenuOpen,
}: {
  currentPilot: PilotRecord | null;
  milestones: ReturnType<typeof buildCareerMilestones>;
  activeWhatIfCategory: CategoryEntry | null;
  whatIfSeat: Exclude<SeatFilter, "All">;
  setWhatIfSeat: (value: Exclude<SeatFilter, "All">) => void;
  whatIfFleetOptions: string[];
  selectedWhatIfFleet: string;
  setSelectedWhatIfFleet: (value: string) => void;
  whatIfBaseOptions: string[];
  selectedWhatIfBase: string;
  setSelectedWhatIfBase: (value: string) => void;
  holdPlannerView: HoldPlannerView;
  setHoldPlannerView: (value: HoldPlannerView) => void;
  currentAeAnalysis: CurrentAeAnalysisResult | null;
  holdForecast: HoldForecastResult | null;
  forecastGrowthRate: number;
  setForecastGrowthRate: (value: number) => void;
  forecastGrowthMenuOpen: boolean;
  setForecastGrowthMenuOpen: (value: boolean) => void;
}) {
  return (
    <SectionCard
      title="Career & Planning"
      description="Plan the next meaningful milestone first, then use the hold tool to drill into one specific seat."
    >
      <View style={styles.mobileCardStack}>
        {milestones.map((milestone) => (
          <View
            key={`milestone-${milestone.key}`}
            style={[styles.mobileDecisionCard, statusBackgroundStyle(milestone.tone)]}
          >
            <View style={styles.mobileDecisionHeader}>
              <View style={styles.mobileDecisionTitleWrap}>
                <Text style={styles.mobileDecisionTitle}>{milestone.label}</Text>
                <Text style={styles.mobileDecisionSubtitle}>{milestone.targetCode}</Text>
              </View>
              <MobileStatusBadge label={milestone.statusLabel} tone={milestone.tone} />
            </View>
            <Text style={styles.mobileDecisionFooter}>{milestone.timing}</Text>
          </View>
        ))}
      </View>
      <View style={styles.mobilePreferencesCard}>
        <Text style={styles.mobileSectionTitle}>Hold Planner</Text>
        <Text style={styles.mobileSectionText}>
          Use `This Award` for the monthly AE question. Use `Forecast` for the broader planning question.
        </Text>
        <Text style={styles.inputLabel}>Seat</Text>
        <View style={styles.baseSelector}>
          {(["Captain", "First Officer"] as const).map((seat) => (
            <TouchableOpacity
              key={`mobile-career-seat-${seat}`}
              style={[styles.baseChip, whatIfSeat === seat && styles.baseChipActive]}
              onPress={() => setWhatIfSeat(seat)}
            >
              <Text style={[styles.baseChipLabel, whatIfSeat === seat && styles.baseChipLabelActive]}>
                {seat === "Captain" ? "CA" : "FO"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.inputLabel}>Fleet</Text>
        <View style={styles.baseSelector}>
          {whatIfFleetOptions.map((fleet) => (
            <TouchableOpacity
              key={`mobile-career-fleet-${fleet}`}
              style={[styles.baseChip, selectedWhatIfFleet === fleet && styles.baseChipActive]}
              onPress={() => setSelectedWhatIfFleet(fleet)}
            >
              <Text style={[styles.baseChipLabel, selectedWhatIfFleet === fleet && styles.baseChipLabelActive]}>
                {fleet}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.inputLabel}>Base</Text>
        <View style={styles.baseSelector}>
          {whatIfBaseOptions.map((base) => (
            <TouchableOpacity
              key={`mobile-career-base-${base}`}
              style={[styles.baseChip, selectedWhatIfBase === base && styles.baseChipActive]}
              onPress={() => setSelectedWhatIfBase(base)}
            >
              <Text style={[styles.baseChipLabel, selectedWhatIfBase === base && styles.baseChipLabelActive]}>
                {base}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.baseSelector}>
          <TouchableOpacity
            style={[styles.baseChip, holdPlannerView === "ae" && styles.baseChipActive]}
            onPress={() => setHoldPlannerView("ae")}
          >
            <Text style={[styles.baseChipLabel, holdPlannerView === "ae" && styles.baseChipLabelActive]}>
              This Award
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.baseChip, holdPlannerView === "forecast" && styles.baseChipActive]}
            onPress={() => setHoldPlannerView("forecast")}
          >
            <Text
              style={[
                styles.baseChipLabel,
                holdPlannerView === "forecast" && styles.baseChipLabelActive,
              ]}
            >
              Forecast
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.plannerModeHint}>
          {holdPlannerView === "ae"
            ? "This Award answers: did this seat actually award this month, where was the line, and were you senior enough?"
            : "Forecast answers: can you generally hold it, how far away are you, and when does blended evidence suggest it opens up?"}
        </Text>
            {activeWhatIfCategory && currentPilot ? (
          <>
            <Text style={styles.mobileSectionText}>
              {formatCategoryEntryCode(activeWhatIfCategory)} • Current JR pilot #
              {activeWhatIfCategory.mostJuniorNumber}
            </Text>
            {holdPlannerView === "ae" ? (
              <CurrentAePlannerCard analysis={currentAeAnalysis} />
            ) : (
              <ForecastPlannerCard
                forecast={holdForecast}
                analysis={currentAeAnalysis}
                forecastGrowthRate={forecastGrowthRate}
                forecastGrowthMenuOpen={forecastGrowthMenuOpen}
                setForecastGrowthRate={setForecastGrowthRate}
                setForecastGrowthMenuOpen={setForecastGrowthMenuOpen}
              />
            )}
          </>
        ) : (
          <Text style={styles.mobileSectionText}>
            Enter your employee number and pick a target category to compare the current award versus the broader hold forecast.
          </Text>
        )}
      </View>
    </SectionCard>
  );
}

function CurrentAePlannerCard({
  analysis,
}: {
  analysis: CurrentAeAnalysisResult | null;
}) {
  if (!analysis) {
    return null;
  }

  return (
    <View style={[styles.mobileDecisionCard, styles.mobileNeutralCard]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.mobileDecisionTitle}>This Award</Text>
          <Text style={styles.mobileDecisionSubtitle}>
            Tactical monthly read. Latest AE visibility only, not general holdability.
          </Text>
        </View>
        <MobileStatusBadge label={analysis.status} tone={toneForCurrentAeStatus(analysis.status)} compact />
      </View>
      <View style={styles.mobileInfoRow}>
        <InfoChip label="Awarded" value={analysis.awardedInLatestAe ? "Yes" : "No"} />
        <InfoChip label="Latest AE JR pilot" value={analysis.awardLine != null ? `#${analysis.awardLine}` : "—"} />
        <InfoChip label="Recent AEs" value={`${analysis.recentSignalCount}`} />
      </View>
      {analysis.recentAwardsAverage != null ? (
        <Text style={styles.mobileDecisionFooter}>
          Recent AE average: {analysis.recentAwardsAverage.toFixed(1)} awards.
        </Text>
      ) : null}
      <Text style={styles.plannerSectionLabel}>What this award says</Text>
      <View style={styles.mobileEvidenceList}>
        {analysis.explanation.map((line) => (
          <Text key={`ae-analysis-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ForecastPlannerCard({
  forecast,
  analysis,
  forecastGrowthRate,
  forecastGrowthMenuOpen,
  setForecastGrowthRate,
  setForecastGrowthMenuOpen,
}: {
  forecast: HoldForecastResult | null;
  analysis: CurrentAeAnalysisResult | null;
  forecastGrowthRate: number;
  forecastGrowthMenuOpen: boolean;
  setForecastGrowthRate: (value: number) => void;
  setForecastGrowthMenuOpen: (value: boolean) => void;
}) {
  if (!forecast) {
    return null;
  }

  return (
    <View style={[styles.mobileDecisionCard, styles.mobileNeutralCard]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.mobileDecisionTitle}>Forecast</Text>
          <Text style={styles.mobileDecisionSubtitle}>
            Broader planning read using current list, AE history, movement, and list growth.
          </Text>
        </View>
        <MobileStatusBadge
          label={forecast.status}
          tone={toneForForecastStatus(forecast.status)}
          compact
        />
      </View>
      <View style={styles.dropdownWrap}>
        <Text style={styles.inputLabel}>Forecast growth</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setForecastGrowthMenuOpen(!forecastGrowthMenuOpen)}
        >
          <Text style={styles.dropdownButtonText}>
            {Math.round(forecastGrowthRate * 100)}% annual growth
          </Text>
        </TouchableOpacity>
        {forecastGrowthMenuOpen ? (
          <View style={styles.dropdownMenu}>
            {forecastGrowthRates.map((option) => (
              <TouchableOpacity
                key={`forecast-growth-${option.value}`}
                style={styles.dropdownItem}
                onPress={() => {
                  setForecastGrowthRate(option.value);
                  setForecastGrowthMenuOpen(false);
                }}
              >
                <Text style={styles.dropdownItemText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.mobileInfoRow}>
        <InfoChip label="Window" value={forecast.holdWindow} />
        <InfoChip label="Confidence" value={forecast.confidence} />
        <InfoChip label="Gap today" value={`${forecast.currentGap}`} />
      </View>
      <View style={styles.mobileInfoRow}>
        <InfoChip label="Current JR pilot" value={`#${forecast.currentListLine}`} />
        <InfoChip label="Forecast JR pilot" value={`#${forecast.blendedLine}`} />
        <InfoChip label="Est. date" value={forecast.estimatedDateLabel ?? "Longer-range"} />
      </View>
      {forecast.differsFromAe && analysis ? (
        <View style={styles.mobilePlannerCallout}>
          <Text style={styles.mobilePlannerCalloutTitle}>Why Forecast can differ from This Award</Text>
          <Text style={styles.mobilePlannerCalloutText}>
            Latest AE did not fully answer this seat. Forecast blends broader seniority, trend, and progression data.
          </Text>
        </View>
      ) : null}
      <Text style={styles.plannerSectionLabel}>Blended evidence</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.evidenceSummary.map((line) => (
          <Text key={`forecast-evidence-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
      <Text style={styles.plannerSectionLabel}>Why the forecast says this</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.explanation.map((line) => (
          <Text key={`forecast-explanation-${line}`} style={styles.mobileEvidenceTextMuted}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function CurrentAeDesktopPanel({
  analysis,
}: {
  analysis: CurrentAeAnalysisResult | null;
}) {
  if (!analysis) {
    return null;
  }

  return (
    <View style={[styles.resultPanel, styles.desktopPlannerPanel]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.projectionTitle}>This Award</Text>
          <Text style={styles.projectionMeta}>
            Tactical monthly read. This answers what happened in the latest AE, not general holdability.
          </Text>
        </View>
        <MobileStatusBadge label={analysis.status} tone={toneForCurrentAeStatus(analysis.status)} compact />
      </View>
      <FormRow>
        <ResultLine label="Awarded in latest AE" value={analysis.awardedInLatestAe ? "Yes" : "No"} />
        <ResultLine label="Latest AE JR pilot" value={analysis.awardLine != null ? `#${analysis.awardLine}` : "—"} />
        <ResultLine label="Recent AEs" value={`${analysis.recentSignalCount}`} />
      </FormRow>
      <Text style={styles.plannerSectionLabel}>What this award says</Text>
      <View style={styles.mobileEvidenceList}>
        {analysis.explanation.map((line) => (
          <Text key={`desktop-ae-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ForecastDesktopPanel({
  forecast,
  analysis,
  forecastGrowthRate,
  forecastGrowthMenuOpen,
  setForecastGrowthRate,
  setForecastGrowthMenuOpen,
}: {
  forecast: HoldForecastResult | null;
  analysis: CurrentAeAnalysisResult | null;
  forecastGrowthRate: number;
  forecastGrowthMenuOpen: boolean;
  setForecastGrowthRate: (value: number) => void;
  setForecastGrowthMenuOpen: (value: boolean) => void;
}) {
  if (!forecast) {
    return null;
  }

  return (
    <View style={[styles.resultPanel, styles.desktopPlannerPanel]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.projectionTitle}>Forecast</Text>
          <Text style={styles.projectionMeta}>
            Broader planning read based on current list, AE history, category movement, and projected seniority progression.
          </Text>
        </View>
        <MobileStatusBadge label={forecast.status} tone={toneForForecastStatus(forecast.status)} compact />
      </View>
      <View style={[styles.forecastControlRow, styles.desktopForecastControlRow]}>
        <View style={styles.forecastGrowthWrap}>
          <Text style={styles.inputLabel}>Forecast growth</Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setForecastGrowthMenuOpen(!forecastGrowthMenuOpen)}
          >
            <Text style={styles.dropdownButtonText}>{Math.round(forecastGrowthRate * 100)}% annual growth</Text>
          </TouchableOpacity>
          {forecastGrowthMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {forecastGrowthRates.map((option) => (
                <TouchableOpacity
                  key={`desktop-forecast-growth-${option.value}`}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setForecastGrowthRate(option.value);
                    setForecastGrowthMenuOpen(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      <FormRow>
        <ResultLine label="Hold window" value={forecast.holdWindow} emphasis />
        <ResultLine label="Confidence" value={forecast.confidence} />
        <ResultLine label="Gap today" value={`${forecast.currentGap}`} />
      </FormRow>
      <FormRow>
        <ResultLine label="Current JR pilot" value={`#${forecast.currentListLine}`} />
        <ResultLine label="Forecast JR pilot" value={`#${forecast.blendedLine}`} />
        <ResultLine label="Estimated date" value={forecast.estimatedDateLabel ?? "Longer-range"} />
      </FormRow>
      {forecast.differsFromAe && analysis ? (
        <View style={styles.mobilePlannerCallout}>
          <Text style={styles.mobilePlannerCalloutTitle}>Why Forecast can differ from This Award</Text>
          <Text style={styles.mobilePlannerCalloutText}>
            Latest AE did not fully answer this seat. Forecast blends broader seniority, trend, and progression data.
          </Text>
        </View>
      ) : null}
      <Text style={styles.plannerSectionLabel}>Blended evidence</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.evidenceSummary.map((line) => (
          <Text key={`desktop-forecast-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
      <Text style={styles.plannerSectionLabel}>Why the forecast says this</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.explanation.map((line) => (
          <Text key={`desktop-forecast-explain-${line}`} style={styles.mobileEvidenceTextMuted}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MobileDashboardCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel style={styles.mobileDashboardCard}>
      <Text style={[styles.mobileDashboardEyebrow, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
        {eyebrow}
      </Text>
      <Text style={[styles.mobileDashboardTitle, { color: palette.textPrimary, fontFamily: fliegerTypography.familyDisplay }]}>
        {title}
      </Text>
      {children}
    </InstrumentPanel>
  );
}

function MobileStatusBadge({
  label,
  tone,
  compact,
}: {
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
  compact?: boolean;
}) {
  const palette = getFliegerPalette();
  return (
    <View
      style={[
        styles.mobileStatusBadge,
        {
          backgroundColor:
            tone === "green"
              ? (appStyleIsDark ? "rgba(0,255,102,0.16)" : "rgba(0,255,102,0.20)")
              : tone === "amber"
                ? palette.badgeNeutral
                : tone === "red"
                  ? (appStyleIsDark ? "rgba(255,48,48,0.16)" : "rgba(255,48,48,0.18)")
                  : palette.badgeNeutral,
          borderColor:
            tone === "green"
              ? palette.greenBorder
              : tone === "amber"
                ? palette.borderStrong
                : tone === "red"
                  ? palette.redBorder
                  : palette.badgeNeutralBorder,
          borderWidth: 2,
          borderRadius: 14,
          shadowColor:
            tone === "green"
              ? palette.green
              : tone === "red"
                ? palette.red
                : palette.borderStrong,
          shadowOpacity: tone === "neutral" ? 0.12 : appStyleIsDark ? 0.2 : 0.14,
          shadowRadius: appStyleIsDark ? 4 : 3,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        },
        tone === "green" && styles.mobileStatusBadgeGreen,
        tone === "amber" && styles.mobileStatusBadgeAmber,
        tone === "red" && styles.mobileStatusBadgeRed,
        compact && styles.mobileStatusBadgeCompact,
      ]}
    >
      <Text
        style={[
          styles.mobileStatusBadgeText,
          {
            color:
              tone === "green"
                ? palette.green
                : tone === "red"
                  ? palette.red
                  : tone === "amber"
                    ? palette.label
                    : palette.textPrimary,
            fontFamily: fliegerTypography.familyLabel,
          },
        ]}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  const palette = getFliegerPalette();
  return (
    <View
      style={[
        styles.mobileInfoChip,
        {
          backgroundColor: palette.surfaceRaised,
          borderWidth: 2,
          borderColor: palette.border,
          borderRadius: 14,
        },
      ]}
    >
      <Text
        style={[styles.mobileInfoChipLabel, { color: palette.textMuted, fontFamily: fliegerTypography.familyLabel }]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.mobileInfoChipValue,
          { color: palette.textPrimary, fontFamily: fliegerTypography.familyValue, fontVariant: ["tabular-nums"] },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function mobileTabLabel(tab: TabKey) {
  if (tab === "seniority") {
    return "Categories";
  }
  if (tab === "ae") {
    return "Movement";
  }
  if (tab === "schedule") {
    return "Career";
  }
  return tabs.find((entry) => entry.key === tab)?.label ?? tab;
}

function displayCategoryPreference(goal: string) {
  const [base = "", fleet = "", seatCode = ""] = goal.split("-");
  if (!base || !fleet || !seatCode) {
    return goal;
  }
  return `${base}-${fleet}-${seatCode === "A" ? "CA" : seatCode === "B" ? "FO" : seatCode}`;
}

function buildCategoryKeyFromCategoryCode(categoryCode: string) {
  const normalized = categoryCode.trim().toUpperCase();
  if (normalized.length < 5) {
    return null;
  }
  const base = normalized.slice(0, 3);
  const seatCode = normalized.slice(-1);
  const fleet = normalized.slice(3, -1);
  if (!base || !fleet) {
    return null;
  }
  const positionCode = seatCode === "A" ? "A" : seatCode === "B" ? "B" : seatCode;
  return `${base}-${fleet}-${positionCode}`;
}

function buildAwardCategoryFromCategoryCode(categoryCode: string) {
  const categoryKey = buildCategoryKeyFromCategoryCode(categoryCode);
  if (!categoryKey) {
    return null;
  }
  const [base = "", fleet = "", seatCode = ""] = categoryKey.split("-");
  return `${base}-${fleet}-${seatCode === "A" ? "CA" : seatCode === "B" ? "FO" : seatCode}`;
}

function normalizeCategoryPreference(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("-CA") || trimmed.includes("-FO")) {
    return buildCategoryKeyFromAeCategory(trimmed);
  }
  if (trimmed.includes("-A") || trimmed.includes("-B")) {
    return trimmed;
  }
  return buildCategoryKeyFromCategoryCode(trimmed);
}

function toneForPilotStatus(label: string) {
  if (label === "Can Hold" || label === "Junior to You") {
    return "green" as const;
  }
  if (label === "Close") {
    return "amber" as const;
  }
  if (label === "Senior to You") {
    return "red" as const;
  }
  return "neutral" as const;
}

function toneForCurrentAeStatus(status: CurrentAeAnalysisResult["status"]) {
  if (status === "Can Hold This AE") {
    return "green" as const;
  }
  if (status === "Not Awarded This AE" || status === "No Recent AE Signal") {
    return "amber" as const;
  }
  return "red" as const;
}

function toneForForecastStatus(status: HoldForecastResult["status"]) {
  if (status === "Already Holding" || status === "Can Generally Hold") {
    return "green" as const;
  }
  if (status === "Likely Hold Soon") {
    return "amber" as const;
  }
  return "red" as const;
}

function statusBackgroundStyle(tone: "green" | "amber" | "red" | "neutral") {
  const palette = getFliegerPalette();
  const isDark = palette.textPrimary === "#F2E9DC";
  const rowSurface = isDark ? "#303840" : "#D2D8DE";
  if (tone === "green") {
    return {
      backgroundColor: rowSurface,
      borderColor: palette.green,
      borderWidth: 2.8,
      shadowColor: "rgba(0,255,102,0.25)",
      shadowOpacity: isDark ? 0.24 : 0.14,
      shadowRadius: isDark ? 6 : 4,
      shadowOffset: { width: 0, height: isDark ? 3 : 2 },
      elevation: 5,
    };
  }
  if (tone === "amber") {
    return {
      backgroundColor: rowSurface,
      borderColor: palette.borderStrong,
      borderWidth: 2.8,
      shadowColor: "rgba(17,24,32,0.08)",
      shadowOpacity: isDark ? 0.16 : 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: isDark ? 3 : 2 },
      elevation: 3,
    };
  }
  if (tone === "red") {
    return {
      backgroundColor: rowSurface,
      borderColor: palette.red,
      borderWidth: 2.8,
      shadowColor: "rgba(255,48,48,0.25)",
      shadowOpacity: isDark ? 0.24 : 0.14,
      shadowRadius: isDark ? 6 : 4,
      shadowOffset: { width: 0, height: isDark ? 3 : 2 },
      elevation: 5,
    };
  }
  return {
    backgroundColor: rowSurface,
    borderColor: palette.borderStrong,
    borderWidth: 2.8,
    shadowColor: "rgba(17,24,32,0.08)",
    shadowOpacity: isDark ? 0.16 : 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: isDark ? 3 : 2 },
    elevation: 3,
  };
}

function describeMovementDirection(value: number | null) {
  if (value == null || value === 0) {
    return "Flat latest line";
  }
  return value > 0 ? "Moved junior" : "Moved senior";
}

function buildRelevantHoldEntries({
  entries,
  currentPilot,
  userSeniorityNumber,
  currentCategoryKey,
  relevantBases,
  priority,
  goalCategoryKeys,
  categoryAssignmentsByKey,
}: {
  entries: readonly CategoryEntry[];
  currentPilot: PilotRecord | null;
  userSeniorityNumber: number;
  currentCategoryKey: string | null;
  relevantBases: string[];
  priority: PilotPriorityKey;
  goalCategoryKeys: readonly string[];
  categoryAssignmentsByKey: ReadonlyMap<string, LatestCategoryAssignment[]>;
}) {
  const preferredBaseSet = new Set(relevantBases);

  return entries
    .filter((entry) => {
      if (priority === "systemwide-opportunities") {
        return true;
      }
      if (!preferredBaseSet.size) {
        return true;
      }
      return preferredBaseSet.has(entry.base);
    })
    .map((entry) => buildMobileCategoryCardDatum(entry, currentPilot, userSeniorityNumber, currentCategoryKey, goalCategoryKeys, categoryAssignmentsByKey))
    .sort((left, right) => right.score - left.score);
}

function buildMobileCategoryCards({
  entries,
  currentPilot,
  userSeniorityNumber,
  currentCategoryKey,
  relevantBases,
  goalCategoryKeys,
  filter,
  categoryAssignmentsByKey,
}: {
  entries: readonly CategoryEntry[];
  currentPilot: PilotRecord | null;
  userSeniorityNumber: number;
  currentCategoryKey: string | null;
  relevantBases: string[];
  goalCategoryKeys: readonly string[];
  filter: MobileCategoryFilterKey;
  categoryAssignmentsByKey: ReadonlyMap<string, LatestCategoryAssignment[]>;
}) {
  const preferredBaseSet = new Set(relevantBases);

  return entries
    .map((entry) =>
      buildMobileCategoryCardDatum(
        entry,
        currentPilot,
        userSeniorityNumber,
        currentCategoryKey,
        goalCategoryKeys,
        categoryAssignmentsByKey
      )
    )
    .filter((item) => {
      if (filter === "all") return true;
      if (filter === "can-hold") return item.statusLabel === "Can Hold";
      if (filter === "close") return item.statusLabel === "Close";
      if (filter === "senior-to-you") return item.statusLabel === "Senior to You";
      if (filter === "captain") return item.entry.seat === "Captain";
      if (filter === "fo") return item.entry.seat === "First Officer";
      if (filter === "my-bases") return preferredBaseSet.size === 0 ? true : preferredBaseSet.has(item.entry.base);
      if (filter === "goals") return item.isGoal;
      return true;
    })
    .sort((left, right) => {
      if (filter === "all" || filter === "my-bases") {
        return right.score - left.score;
      }
      return right.score - left.score;
    });
}

function buildMobileCategoryCardDatum(
  entry: CategoryEntry,
  currentPilot: PilotRecord | null,
  userSeniorityNumber: number,
  currentCategoryKey: string | null,
  goalCategoryKeys: readonly string[],
  categoryAssignmentsByKey: ReadonlyMap<string, LatestCategoryAssignment[]>
) {
  const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
  const trend = deltaSnapshot.categoryTrends.find((item) => item.key === entry.key) ?? null;
  const assignments = categoryAssignmentsByKey.get(entry.key) ?? [];
  const userPosition = describeUserCategoryPosition(
    entry,
    fit,
    userSeniorityNumber,
    currentPilot,
    assignments
  );
  const isGoal = goalCategoryKeys.includes(entry.key);
  const statusLabel = fit.label === "Current category" ? "Can Hold" : fit.label;
  const tone = toneForPilotStatus(statusLabel);
  const holdDisplay =
    statusLabel === "Can Hold" ? userPosition.secondary ?? "Holdable" : statusLabel === "Close" ? "—" : "—";
  const gap = Math.max(0, userSeniorityNumber - entry.mostJuniorNumber);
  const supportingText =
    statusLabel === "Can Hold"
      ? `You'd likely sit ${userPosition.secondary ?? "inside the category"} here.`
      : statusLabel === "Close"
        ? `${gap} numbers from the current line.`
        : statusLabel === "Senior to You"
          ? "Not holdable today."
          : "Current category.";
  const relevanceText = isGoal
    ? "Goal category"
    : currentPilot && entry.base === currentPilot.currentCategoryCode?.slice(0, 3)
      ? "Current base priority"
      : "Useful bid option";
  const score =
    (statusLabel === "Can Hold" ? 90 : statusLabel === "Close" ? 70 : statusLabel === "Senior to You" ? 40 : 80) +
    (isGoal ? 25 : 0) +
    (entry.seat === "Captain" ? 4 : 0) -
    gap / 1000;

  const badgePrimary =
    statusLabel === "Can Hold"
      ? userPosition.secondary ?? "IN"
      : statusLabel === "Senior to You"
        ? userPosition.primary
        : statusLabel === "Close"
          ? userPosition.primary
          : userPosition.secondary ?? userPosition.primary;
  const badgeLabel =
    statusLabel === "Can Hold"
      ? "IN CATEGORY"
      : statusLabel === "Senior to You"
        ? "SENIOR TO YOU"
        : statusLabel === "Close"
          ? "FROM LINE"
          : "STATUS";

  return {
    entry,
    fit,
    userPosition,
    trend,
    isGoal,
    statusLabel,
    tone,
    holdDisplay,
    supportingText,
    relevanceText,
    trendText: describeMovementDirection(trend?.lineMovement ?? null),
    badgePrimary,
    badgeLabel,
    score,
  };
}

function buildMobileMovementFeed({
  aeEntries,
  aeTrends,
  categoryTrends,
  userSeniorityNumber,
  relevantBases,
  priority,
  goalCategoryKeys,
}: {
  aeEntries: readonly AeEntry[];
  aeTrends: readonly AeTrendEntry[];
  categoryTrends: readonly {
    key: string;
    base: string;
    fleet: string;
    seat: string;
    latestJuniorNumber: number;
    previousJuniorNumber: number | null;
    lineMovement: number | null;
    latestPilotCount: number;
    previousPilotCount: number | null;
    pilotCountDelta: number | null;
  }[];
  userSeniorityNumber: number;
  relevantBases: readonly string[];
  priority: PilotPriorityKey;
  goalCategoryKeys: readonly string[];
}) {
  const relevantBaseSet = new Set(relevantBases);
  return aeEntries
    .filter((entry) => {
      if (priority === "systemwide-opportunities") {
        return true;
      }
      if (!relevantBaseSet.size) {
        return true;
      }
      return relevantBaseSet.has(entry.base);
    })
    .map((entry) => {
      const reach = evaluateAeReach(entry, userSeniorityNumber);
      const trend = aeTrends.find((item) => item.awardCategory === entry.awardCategory) ?? null;
      const categoryTrend =
        categoryTrends.find((item) => item.key === buildCategoryKeyFromAeCategory(entry.awardCategory)) ?? null;
      const isGoal = goalCategoryKeys.includes(buildCategoryKeyFromAeCategory(entry.awardCategory));
      const statusLabel = reach.label === "No line yet" ? "Close" : reach.label;
      const tone = toneForPilotStatus(statusLabel);
      return {
        entry,
        statusLabel,
        tone,
        summaryText: `${describeMovementDirection(trend?.lineMovement ?? null)} • ${formatSignedCount(
          trend?.awardsDelta ?? null
        )} awards`,
        trendText: formatSignedChange(trend?.lineMovement ?? categoryTrend?.lineMovement ?? null, "#") ?? "Flat",
        relevanceText: isGoal ? "Goal category movement" : `${entry.base} ${entry.seat === "Captain" ? "Captain" : "FO"} movement`,
        score:
          (statusLabel === "Junior to You" ? 90 : statusLabel === "Close" ? 70 : 50) +
          (isGoal ? 25 : 0) +
          Math.abs(trend?.lineMovement ?? 0),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

function buildCareerMilestones({
  currentPilot,
  categories,
  pilots,
  relevantBases,
  priority,
  goalCategoryKeys,
}: {
  currentPilot: PilotRecord | null;
  categories: readonly CategoryEntry[];
  pilots: readonly PilotRecord[];
  relevantBases: readonly string[];
  priority: PilotPriorityKey;
  goalCategoryKeys: readonly string[];
}) {
  if (!currentPilot) {
    return [];
  }

  const relevantBaseSet = new Set(relevantBases);
  const candidatePool = categories.filter((entry) => {
    if (priority === "systemwide-opportunities") {
      return true;
    }
    if (!relevantBaseSet.size) {
      return true;
    }
    return relevantBaseSet.has(entry.base);
  });

  const pickBest = (label: string, entries: readonly CategoryEntry[]) => {
    const sorted = [...entries].sort((left, right) => {
      const leftGap = Math.max(0, currentPilot.seniorityNumber - left.mostJuniorNumber);
      const rightGap = Math.max(0, currentPilot.seniorityNumber - right.mostJuniorNumber);
      return leftGap - rightGap;
    });
    const target = sorted[0];
    if (!target) {
      return null;
    }
    const estimate = forecastHoldability({
      pilot: currentPilot,
      target,
      latestAe: null,
      aeHistory: null,
      categoryTrend: null,
      pilots,
      growthRate: 0.01,
    });
    const fit = evaluateCategoryHold(target, currentPilot.seniorityNumber, currentPilot.currentCategoryKey);
    const statusLabel = fit.label === "Current category" ? "Can Hold" : fit.label;
    return {
      key: `${label}-${target.key}`,
      label,
      targetCode: formatCategoryEntryCode(target),
      statusLabel,
      tone: toneForPilotStatus(statusLabel),
      timing: estimate?.estimatedDateLabel ? `Est. ${estimate.estimatedDateLabel}` : estimate?.holdWindow ?? "Longer-range",
      isGoal: goalCategoryKeys.includes(target.key),
    };
  };

  const widebodyFleets = new Set(["330", "350", "765", "7ER"]);
  const narrowbodyCaptain = pickBest(
    "Narrowbody Captain",
    candidatePool.filter((entry) => entry.seat === "Captain" && !widebodyFleets.has(entry.fleet))
  );
  const widebodyFo = pickBest(
    "Widebody FO",
    categories.filter((entry) => entry.seat === "First Officer" && widebodyFleets.has(entry.fleet))
  );
  const betterCaptainSeat = pickBest(
    "Better Captain Seat",
    categories
      .filter((entry) => entry.seat === "Captain")
      .sort((left, right) => payPriorityScore(right) - payPriorityScore(left))
  );

  return [narrowbodyCaptain, widebodyFo, betterCaptainSeat].filter(Boolean) as Array<{
    key: string;
    label: string;
    targetCode: string;
    statusLabel: string;
    tone: "green" | "amber" | "red" | "neutral";
    timing: string;
    isGoal: boolean;
  }>;
}

function buildCommuteBaseSuggestions(commuteOrigin: string, userSeniorityNumber: number) {
  const normalized = commuteOrigin.trim().toUpperCase();
  const nearbyBaseMap: Record<string, string[]> = {
    SNA: ["LAX", "SEA", "SLC"],
    ONT: ["LAX", "SLC", "SEA"],
    SAN: ["LAX", "SLC", "SEA"],
    PHX: ["SLC", "LAX", "SEA"],
    LAS: ["LAX", "SLC", "SEA"],
    DEN: ["SLC", "SEA", "MSP"],
    BOI: ["SLC", "SEA", "MSP"],
    PDX: ["SEA", "SLC", "LAX"],
    OAK: ["LAX", "SEA", "SLC"],
    SFO: ["LAX", "SEA", "SLC"],
    JFK: ["NYC", "BOS", "ATL"],
    LGA: ["NYC", "BOS", "ATL"],
    EWR: ["NYC", "BOS", "ATL"],
    MCO: ["ATL", "NYC", "DTW"],
    TPA: ["ATL", "NYC", "DTW"],
    AUS: ["ATL", "LAX", "MSP"],
  };

  const nearbyBases = nearbyBaseMap[normalized] ?? (bases.includes(normalized) ? [normalized] : bases);

  return nearbyBases
    .map((base) => {
      const baseEntries = deltaSnapshot.categories.filter((entry) => entry.base === base);
      const holdable = baseEntries.filter((entry) => userSeniorityNumber <= entry.mostJuniorNumber).length;
      const close = baseEntries.filter(
        (entry) => userSeniorityNumber > entry.mostJuniorNumber && userSeniorityNumber - entry.mostJuniorNumber <= 300
      ).length;
      return {
        base,
        score: holdable * 10 + close * 4,
        label: holdable > 0 ? `${holdable} holdable` : close > 0 ? `${close} close` : "longer-range",
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function payPriorityScore(entry: CategoryEntry) {
  const equipment = normalizePayEquipment(entry.fleet, entry.seat);
  if (!equipment) {
    return 0;
  }
  const seatKey = entry.seat === "Captain" ? "Captain" : "First Officer";
  const rates = payScales[seatKey][equipment];
  return rates?.[rates.length - 1] ?? 0;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: appStylePalette.background,
  },
  container: {
    padding: 20,
    paddingBottom: 198,
    gap: 18,
  },
  containerCompact: {
    padding: 12,
    paddingBottom: 140,
    gap: 12,
  },
  hero: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 16,
    padding: 22,
    gap: 12,
  },
  heroCompact: {
    padding: 14,
    gap: 8,
  },
  tripBoardMobileAppBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: -2,
  },
  tripBoardMobileAppBarBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripBoardMobileAppBarTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tripBoardMobileAppBarMeta: {
    fontSize: 10,
    lineHeight: 13,
    color: appStylePalette.textMuted,
    textAlign: "right",
    maxWidth: 120,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingWide,
    color: appStylePalette.accent,
    textAlign: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
    textAlign: "center",
    letterSpacing: fliegerTypography.letterSpacingWordmark,
    textTransform: "uppercase",
  },
  titleCompact: {
    fontSize: 27,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: appStylePalette.textMuted,
    letterSpacing: fliegerTypography.letterSpacingWide,
    textTransform: "uppercase",
  },
  subtitleCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  heroMetrics: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  metricCard: {
    minWidth: 98,
    flex: 1,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  metricGold: {
    borderColor: appStylePalette.redBorder,
  },
  metricGreen: {
    borderColor: appStylePalette.greenBorder,
  },
  metricLabel: {
    color: appStylePalette.label,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  metricValue: {
    color: appStylePalette.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bottomTabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: appStylePalette.surface,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.borderStrong,
  },
  tabButton: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: appStylePalette.surfaceRaised,
    alignItems: "center",
    gap: 8,
  },
  tabButtonActive: {
    backgroundColor: "rgba(102,217,242,0.10)",
  },
  tabIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: appStylePalette.surfaceRecessed,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconCircleActive: {
    backgroundColor: "rgba(102,217,242,0.14)",
  },
  tabIconText: {
    color: appStylePalette.textPrimary,
    fontWeight: "900",
    fontSize: 22,
    lineHeight: 24,
  },
  tabIconTextWide: {
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 0.4,
  },
  tabIconTextActive: {
    color: "#66D9F2",
  },
  tabLabel: {
    color: appStylePalette.textMuted,
    fontWeight: "700",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  tabLabelActive: {
    color: "#66D9F2",
  },
  sectionStack: {
    gap: 14,
  },
  card: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: appStylePalette.accent,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
  },
  cardBody: {
    gap: 14,
  },
  snapshotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: 220,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  summaryMain: {
    fontSize: 42,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  summaryDetail: {
    fontSize: 14,
    color: appStylePalette.textMuted,
    fontWeight: "600",
  },
  summarySub: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textMuted,
  },
  summaryTrack: {
    height: 18,
    borderRadius: 999,
    backgroundColor: appStylePalette.surfaceRecessed,
    overflow: "hidden",
  },
  summaryFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: appStylePalette.accent,
  },
  snapshotPill: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  snapshotLabel: {
    fontSize: 12,
    color: appStylePalette.textMuted,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  snapshotValue: {
    fontSize: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  snapshotDetail: {
    fontSize: 12,
    lineHeight: 16,
    color: appStylePalette.textMuted,
  },
  snapshotSummaryHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  snapshotSummaryRotation: {
    fontSize: 20,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    letterSpacing: 0.8,
  },
  snapshotSummaryDates: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.textMuted,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  snapshotPanelCompact: {
    padding: 14,
    gap: 10,
    alignSelf: "stretch",
  },
  tripBoardSummaryPanel: {
    padding: 12,
    gap: 10,
  },
  tripBoardSummaryPanelCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  tripBoardSummaryStrip: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: appStylePalette.borderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
  },
  tripBoardSummaryStripRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 6,
  },
  tripBoardSummaryStripRotation: {
    fontSize: 15,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    letterSpacing: 0.35,
  },
  tripBoardSummaryStripDates: {
    fontSize: 10,
    fontWeight: "800",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tripBoardSummaryStripLine: {
    fontSize: 11,
    lineHeight: 15,
    color: appStylePalette.textSecondary,
    fontWeight: "700",
  },
  tripBoardSummaryStripChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "stretch",
  },
  tripBoardSummaryInlineChip: {
    flexGrow: 1,
    flexBasis: 88,
    minWidth: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(105, 191, 255, 0.18)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  tripBoardSummaryInlineChipPrimary: {
    minHeight: 44,
  },
  tripBoardSummaryInlineChipLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: appStylePalette.accent,
  },
  tripBoardSummaryInlineChipValue: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  tripBoardSummaryInlineChipMini: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.025)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tripBoardSummaryInlineChipMiniWide: {
    flexShrink: 1,
  },
  tripBoardSummaryInlineChipMiniLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: appStylePalette.textMuted,
  },
  tripBoardSummaryInlineChipMiniValue: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  tripBoardSummaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  tripBoardSummaryHeaderCompact: {
    gap: 8,
  },
  tripBoardSummaryHeaderMain: {
    flex: 1,
    gap: 3,
  },
  tripBoardSummaryRotation: {
    fontSize: 23,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    letterSpacing: 0.6,
  },
  tripBoardSummaryRotationCompact: {
    fontSize: 19,
  },
  tripBoardSummaryDates: {
    fontSize: 12,
    fontWeight: "800",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  tripBoardSummaryDatesCompact: {
    fontSize: 11,
  },
  tripBoardSummarySource: {
    maxWidth: 142,
    textAlign: "right",
    fontSize: 11,
    lineHeight: 16,
    color: appStylePalette.textMuted,
    fontWeight: "700",
  },
  tripBoardSummarySourceCompact: {
    maxWidth: 112,
    fontSize: 10,
    lineHeight: 14,
  },
  tripBoardSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tripBoardSummaryGridCompact: {
    gap: 5,
  },
  tripBoardSummaryCell: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: appStylePalette.borderSubtle,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  tripBoardSummaryCellCompact: {
    minWidth: 88,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  tripBoardSummaryCellMini: {
    minWidth: 72,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tripBoardSummaryCellWide: {
    minWidth: 156,
  },
  tripBoardSummaryCellLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  tripBoardSummaryCellLabelCompact: {
    fontSize: 9,
    letterSpacing: 0.7,
  },
  tripBoardSummaryCellValue: {
    fontSize: 18,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  tripBoardSummaryCellValueCompact: {
    fontSize: 16,
  },
  tripBoardSummaryCellValueMini: {
    fontSize: 15,
  },
  tripBoardSummaryCellDetail: {
    fontSize: 11,
    lineHeight: 15,
    color: appStylePalette.textMuted,
    fontWeight: "700",
  },
  tripBoardSummaryCellDetailCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  formRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  formRowCompact: {
    gap: 8,
  },
  inputGroup: {
    flex: 1,
    minWidth: 140,
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    color: appStylePalette.accent,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: appStylePalette.surfaceRecessed,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputAffix: {
    color: appStylePalette.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: appStylePalette.textPrimary,
    paddingVertical: 12,
  },
  textAreaShell: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 220,
  },
  textAreaInput: {
    minHeight: 192,
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textPrimary,
  },
  resultPanel: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  resultPanelCompact: {
    padding: 10,
    gap: 8,
    borderRadius: 12,
  },
  resultPanelSubtle: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: appStylePalette.borderSubtle,
  },
  deadheadLegPanel: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderColor: appStylePalette.textMuted,
    opacity: 0.92,
  },
  rotationLegHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rotationHeroCard: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 18,
    padding: 18,
    gap: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  rotationHeroTextBlock: {
    gap: 8,
  },
  rotationHeroTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
  },
  rotationHeroBody: {
    fontSize: 15,
    lineHeight: 23,
    color: appStylePalette.textSecondary,
  },
  rotationHeroButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  rotationInlineUtilityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  rotationIntakeAppBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rotationIntakeAppBarBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rotationIntakeAppBarTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
    color: appStylePalette.textPrimary,
  },
  rotationIntakeAppBarModePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appStylePalette.borderSubtle,
    backgroundColor: appStylePalette.surfaceRaised,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rotationIntakeAppBarModeText: {
    fontSize: 12,
    fontWeight: "800",
    color: appStylePalette.accent,
  },
  rotationIntakeIntroPanel: {
    gap: 6,
    paddingTop: 14,
    paddingBottom: 14,
  },
  rotationIntakeTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  rotationIntakeSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textSecondary,
    fontWeight: "600",
  },
  rotationIntakePanel: {
    gap: 10,
  },
  rotationIntakeTextarea: {
    minHeight: 188,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    backgroundColor: appStylePalette.surfaceRecessed,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textPrimary,
    textAlignVertical: "top",
  },
  rotationIntakeButtonStack: {
    gap: 10,
  },
  rotationIntakePrimaryButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  rotationIntakePrimaryButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
  },
  rotationIntakeSecondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  rotationIntakeSecondaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  rotationIntakeGhostButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: appStylePalette.borderSubtle,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  rotationIntakeGhostButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: appStylePalette.textMuted,
  },
  rotationInputOptionsPanel: {
    gap: 8,
  },
  rotationInputOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rotationInputOptionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appStylePalette.borderSubtle,
    backgroundColor: appStylePalette.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rotationInputOptionChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: appStylePalette.textSecondary,
  },
  rotationPasteTextarea: {
    minHeight: 170,
  },
  rotationScreenshotPreviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  rotationScreenshotPreviewCard: {
    width: 132,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  rotationScreenshotPreviewImage: {
    width: "100%",
    height: 110,
    borderRadius: 8,
    backgroundColor: appStylePalette.surfaceRecessed,
  },
  quickLinkButton: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickLinkButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.accent,
  },
  quickActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickActionGridCompact: {
    gap: 8,
  },
  quickActionButton: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 138,
  },
  quickActionButtonCompact: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 112,
    borderRadius: 10,
  },
  quickActionButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  quickActionButtonTextCompact: {
    fontSize: 12,
  },
  whatIfScenarioPanel: {
    flex: 1,
    minWidth: 260,
  },
  paySummaryCard: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  payToolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 8,
  },
  payToolCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  payToolCardActive: {
    borderColor: "#007FA3",
  },
  payToolHero: {
    minHeight: 104,
    backgroundColor: appStylePalette.surfaceRaised,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "space-between",
  },
  payToolGlyph: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.accent,
  },
  payToolBadge: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRecessed,
    color: appStylePalette.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  payToolBody: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 8,
  },
  payToolTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  payToolSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
  },
  payToolButton: {
    marginHorizontal: 18,
    marginBottom: 18,
    backgroundColor: appStylePalette.surfaceRaised,
    color: appStylePalette.textPrimary,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    borderRadius: 12,
    overflow: "hidden",
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  payToolPlaceholder: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  payToolPlaceholderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  payToolPlaceholderText: {
    fontSize: 14,
    lineHeight: 22,
    color: appStylePalette.textMuted,
  },
  compactChoiceGroup: {
    gap: 8,
  },
  compactChipRow: {
    gap: 6,
  },
  compactBaseChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 0,
  },
  compactBaseChipLabel: {
    fontSize: 12,
  },
  inlineValidationText: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.redBorder,
  },
  evidenceAccordion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  evidenceAccordionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  evidenceAccordionChevron: {
    fontSize: 22,
    fontWeight: "700",
    color: appStylePalette.accent,
    lineHeight: 22,
  },
  rerouteButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  secondaryActionButton: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  secondaryActionButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  warningBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(166,25,46,0.12)",
    color: appStylePalette.redBorder,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    textTransform: "uppercase",
  },
  statusBadgeCompact: {
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeResolved: {
    backgroundColor: "rgba(52,168,83,0.14)",
    color: appStylePalette.greenBorder,
  },
  statusBadgeCaution: {
    backgroundColor: "rgba(0,127,163,0.14)",
    color: appStylePalette.accent,
  },
  statusBadgeWarning: {
    backgroundColor: "rgba(166,25,46,0.12)",
    color: appStylePalette.redBorder,
  },
  statusBadgeRtg: {
    backgroundColor: "rgba(216,154,43,0.14)",
    color: "#F2C76B",
  },
  deadheadBadge: {
    backgroundColor: "rgba(120,130,138,0.18)",
    color: appStylePalette.textMuted,
  },
  resultSummaryText: {
    fontSize: 15,
    lineHeight: 23,
    color: appStylePalette.textPrimary,
    fontWeight: "600",
  },
  resultBodyText: {
    fontSize: 14,
    lineHeight: 22,
    color: appStylePalette.textPrimary,
  },
  resultSupportMetaText: {
    fontSize: 13,
    lineHeight: 20,
    color: appStylePalette.textMuted,
  },
  controlsPrimaryText: {
    fontSize: 16,
    lineHeight: 23,
    color: appStylePalette.textPrimary,
    fontWeight: "800",
  },
  controlsSecondaryText: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textPrimary,
  },
  rerouteFactsUsedBlock: {
    gap: 6,
    paddingBottom: 6,
  },
  rerouteSupportCard: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  tripBoardTimelineStack: {
    gap: 8,
  },
  tripBoardTimelineStackCompact: {
    gap: 6,
  },
  tripBoardTimelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  tripBoardTimelineRowCompact: {
    gap: 8,
  },
  tripBoardTimelineSpineColumn: {
    width: 40,
    alignItems: "center",
    gap: 6,
  },
  tripBoardTimelineSpineColumnCompact: {
    width: 32,
    gap: 4,
  },
  tripBoardTimelineDateLabel: {
    minHeight: 16,
    fontSize: 10,
    fontWeight: "800",
    color: appStylePalette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tripBoardTimelineDateLabelCompact: {
    fontSize: 9,
    minHeight: 14,
  },
  tripBoardTimelineDateSpacer: {
    minHeight: 16,
  },
  tripBoardTimelineSpineTrack: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  tripBoardTimelineNode: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2.5,
    backgroundColor: appStylePalette.surface,
  },
  tripBoardTimelineNodeCompact: {
    width: 12,
    height: 12,
    borderWidth: 2,
  },
  tripBoardTimelineNodeDh: {
    borderColor: appStylePalette.accent,
    shadowColor: appStylePalette.accent,
    shadowOpacity: 0.22,
    shadowRadius: 6,
  },
  tripBoardTimelineNodeLayover: {
    borderColor: appStylePalette.greenBorder,
    shadowColor: appStylePalette.greenBorder,
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  tripBoardTimelineNodeOperating: {
    borderColor: appStylePalette.greenBorder,
  },
  tripBoardTimelineNodeRtg: {
    borderColor: "#D89A2B",
  },
  tripBoardTimelineSpineLine: {
    width: 2,
    flex: 1,
    minHeight: 118,
    borderRadius: 999,
    backgroundColor: "rgba(105, 191, 255, 0.18)",
  },
  tripBoardTimelineSpineLineCompact: {
    minHeight: 92,
  },
  tripBoardTimelineCard: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  tripBoardTimelineCardCompact: {
    padding: 9,
    gap: 6,
  },
  tripBoardTimelineCardHighlighted: {
    borderColor: appStylePalette.accent,
  },
  tripBoardTimelineCardRtg: {
    borderColor: "#D89A2B",
    backgroundColor: "rgba(216,154,43,0.08)",
  },
  tripBoardLayoverCard: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  tripBoardLayoverCardCompact: {
    padding: 9,
    gap: 6,
  },
  tripBoardTimelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  tripBoardTimelineHeaderCompact: {
    gap: 6,
  },
  tripBoardTimelineBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  tripBoardTimelineBadgeRowCompact: {
    gap: 4,
  },
  tripBoardTimelineCityPair: {
    fontSize: 19,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    letterSpacing: 0.2,
  },
  tripBoardTimelineCityPairCompact: {
    fontSize: 17,
  },
  tripBoardTimelineTime: {
    fontSize: 12,
    fontWeight: "800",
    color: appStylePalette.textMuted,
    fontVariant: ["tabular-nums"],
  },
  tripBoardTimelineTimeCompact: {
    fontSize: 11,
  },
  tripBoardTimelineInlineCity: {
    fontSize: 12,
    fontWeight: "900",
    color: appStylePalette.greenBorder,
    letterSpacing: 0.6,
  },
  tripBoardTimelineMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  tripBoardTimelineMetaRowCompact: {
    gap: 6,
  },
  tripBoardTimelineMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: appStylePalette.textMuted,
    fontWeight: "700",
  },
  tripBoardTimelinePhoneLink: {
    color: appStylePalette.accent,
  },
  tripBoardTimelineMetaCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  tripBoardTimelineMetaMuted: {
    color: appStylePalette.textMuted,
    opacity: 0.88,
  },
  tripBoardTimelineActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  tripBoardTimelineHintStack: {
    gap: 2,
    marginTop: 2,
  },
  tripBoardTimelineActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(105, 191, 255, 0.45)",
    backgroundColor: "rgba(105, 191, 255, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tripBoardTimelineActionButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  tripBoardTimelineActionButtonActive: {
    borderColor: appStylePalette.greenBorder,
    backgroundColor: "rgba(52,168,83,0.16)",
  },
  tripBoardTimelineActionButtonText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: appStylePalette.textPrimary,
    textTransform: "uppercase",
  },
  tripBoardAlertsPanel: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  tripBoardAlertsPanelCompact: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  tripBoardAlertInlineStrip: {
    marginTop: -2,
  },
  tripBriefList: {
    gap: 5,
  },
  tripBriefRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(105, 191, 255, 0.12)",
    backgroundColor: "rgba(255,255,255,0.025)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 5,
  },
  tripBriefRowMain: {
    gap: 4,
  },
  tripBriefRowDetail: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
  },
  compactAlertStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  compactAlertStripCompact: {
    gap: 6,
  },
  compactAlertChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
  },
  compactAlertChipGood: {
    backgroundColor: "rgba(52,168,83,0.12)",
    borderColor: appStylePalette.greenBorder,
  },
  compactAlertChipWatch: {
    backgroundColor: "rgba(0,127,163,0.12)",
    borderColor: appStylePalette.accent,
  },
  compactAlertChipRisk: {
    backgroundColor: "rgba(166,25,46,0.12)",
    borderColor: appStylePalette.redBorder,
  },
  compactAlertChipText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: appStylePalette.textPrimary,
  },
  auditButton: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  auditButtonDisabled: {
    backgroundColor: appStylePalette.surfaceRaised,
  },
  auditButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  auditSummaryHero: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 18,
    gap: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  auditSummaryHeader: {
    gap: 4,
  },
  auditSummaryTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
  },
  auditSummaryMeta: {
    fontSize: 13,
    color: "#344552",
    fontWeight: "700",
  },
  auditSummaryMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  auditSummaryFormula: {
    fontSize: 13,
    color: "#41505C",
    fontWeight: "700",
  },
  payControlsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-start",
  },
  resultLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: appStylePalette.textMuted,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
  },
  resultValueEmphasis: {
    color: appStylePalette.accent,
  },
  baseSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  baseChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#2B3239",
    borderWidth: 1.5,
    borderColor: "#46515C",
  },
  baseChipActive: {
    backgroundColor: "rgba(102,217,242,0.12)",
    borderColor: "#66D9F2",
  },
  baseChipLabel: {
    color: "#C3CBD2",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  baseChipLabelActive: {
    color: "#66D9F2",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendColor: {
    width: 18,
    height: 18,
    borderRadius: 6,
  },
  legendBorder: {
    borderWidth: 1,
    borderColor: "#B8C7D9",
  },
  legendText: {
    fontSize: 13,
    color: "#344552",
    fontWeight: "600",
  },
  identityCard: {
    backgroundColor: "#C6CDD4",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    gap: 6,
  },
  identityName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111820",
  },
  identityMeta: {
    fontSize: 14,
    color: "#344552",
  },
  tableCard: {
    backgroundColor: "#2B3239",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: "#46515C",
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f3ead7",
    letterSpacing: 1.1,
  },
  tableMeta: {
    fontSize: 12,
    color: "#C3CBD2",
    fontWeight: "600",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#46515C",
  },
  tableHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    color: "#C3CBD2",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 2.8,
    overflow: "visible",
    shadowOffset: { width: 0, height: appStyleIsDark ? 3 : 2 },
    shadowRadius: appStyleIsDark ? 6 : 4,
    shadowOpacity: appStyleIsDark ? 0.22 : 0.1,
    elevation: 5,
  },
  mobileCategoryCard: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 10,
  },
  mobileCategoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  instrumentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  instrumentCardTitleWrap: {
    flex: 1,
    gap: 4,
  },
  mobileCategoryTitleWrap: {
    flex: 1,
    gap: 4,
  },
  mobileCategoryBadge: {
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,155,194,0.10)",
  },
  mobileCategoryBadgeText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111820",
  },
  mobileMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  instrumentStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: appStylePalette.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: appStylePalette.surfaceRaised,
  },
  instrumentStatCell: {
    width: "50%",
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: appStylePalette.border,
  },
  instrumentStatCellLeft: {
    borderRightWidth: 1,
    borderRightColor: appStylePalette.border,
  },
  instrumentStatCellRight: {},
  mobileMetricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 120,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: appStylePalette.borderStrong,
  },
  mobileMetricLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: appStylePalette.accent,
  },
  mobileMetricValue: {
    fontSize: 24,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  mobileMetricDetail: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.textMuted,
  },
  mobileDashboardStack: {
    gap: 12,
  },
  desktopDashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  desktopDashboardColumn: {
    flex: 1,
    minWidth: 280,
  },
  mobileSummaryMetricRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  mobileKeyMetricCard: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 14,
    gap: 6,
  },
  mobileKeyMetricLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
    color: appStylePalette.accent,
  },
  mobileKeyMetricValue: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  mobileKeyMetricDetail: {
    fontSize: 12,
    lineHeight: 18,
    color: appStylePalette.textMuted,
    fontWeight: "600",
  },
  mobileKeyMetricSubdetail: {
    fontSize: 12,
    lineHeight: 18,
    color: appStylePalette.textPrimary,
    fontWeight: "800",
  },
  mobileDashboardCard: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 16,
    gap: 10,
  },
  mobileDashboardEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
    color: appStylePalette.accent,
  },
  mobileDashboardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  mobileDashboardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  mobileDashboardMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: appStylePalette.textMuted,
  },
  mobileDashboardBodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
  },
  mobilePreferencesCard: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 16,
    gap: 12,
  },
  mobilePreferencesEditor: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.border,
  },
  mobileSectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  mobileSectionText: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
  },
  mobilePrefsSummaryCard: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 16,
    gap: 12,
  },
  mobilePrefsCollapsedWrap: {
    marginTop: -2,
  },
  mobilePrefsCollapsedButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    backgroundColor: appStylePalette.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  mobilePrefsCollapsedButtonText: {
    color: appStylePalette.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  mobilePrefsSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  mobileEditPrefsButton: {
    backgroundColor: "rgba(102,217,242,0.12)",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#66D9F2",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mobileEditPrefsButtonText: {
    color: "#66D9F2",
    fontSize: 12,
    fontWeight: "800",
  },
  mobileFormGroup: {
    gap: 8,
  },
  mobileTrackedCategoryList: {
    gap: 10,
  },
  mobileTrackedCategoryRow: {
    gap: 8,
  },
  mobileTrackedCategoryMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 2.8,
    borderColor: appStylePalette.borderStrong,
    backgroundColor: appDecisionRowSurface,
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: "relative",
    overflow: "visible",
    shadowOffset: { width: 0, height: appStyleIsDark ? 3 : 2 },
    shadowRadius: appStyleIsDark ? 6 : 4,
    shadowOpacity: appStyleIsDark ? 0.22 : 0.1,
    elevation: 5,
  },
  mobileTrackedCategoryTopEdge: {
    position: "absolute",
    top: 1.5,
    left: 1.5,
    right: 1.5,
    height: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: appDecisionRowHighlight,
  },
  mobileTrackedCategoryBottomEdge: {
    position: "absolute",
    left: 1.5,
    right: 1.5,
    bottom: 1.5,
    height: 1,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: appDecisionRowShadowEdge,
  },
  mobileTrackedCategoryInnerEdge: {
    position: "absolute",
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.35)",
  },
  mobileTrackedCategoryCopy: {
    flex: 1,
    gap: 4,
  },
  mobileTrackedCategoryTitle: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  mobileTrackedCategorySubtitle: {
    fontSize: 14,
    lineHeight: 18,
    color: appStylePalette.textMuted,
  },
  mobileTrackedDeleteButton: {
    alignSelf: "flex-start",
    backgroundColor: "#201315",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#A92B2B",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mobileTrackedDeleteButtonText: {
    color: "#FF6C6C",
    fontSize: 12,
    fontWeight: "800",
  },
  textChipShell: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    backgroundColor: appStylePalette.surfaceRecessed,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  textChipInput: {
    fontSize: 16,
    color: appStylePalette.textPrimary,
    paddingVertical: 10,
  },
  mobileGoalRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  mobileGoalInputWrap: {
    flex: 1,
  },
  mobileAddGoalButton: {
    backgroundColor: appStylePalette.surfaceRaised,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  mobileAddGoalButtonText: {
    color: appStylePalette.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  mobileSavePrefsButton: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  mobileSavePrefsButtonText: {
    color: appStylePalette.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  mobileChartStack: {
    gap: 14,
  },
  goalChip: {
    backgroundColor: "rgba(102,217,242,0.12)",
    borderWidth: 1.5,
    borderColor: "#66D9F2",
  },
  goalChipRemovable: {
    paddingRight: 14,
  },
  goalChipLabel: {
    color: "#66D9F2",
  },
  mobileCardStack: {
    gap: 12,
  },
  mobileDecisionCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 14,
    gap: 10,
  },
  mobileGreenCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#00FF66",
  },
  mobileAmberCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#5F6B76",
  },
  mobileRedCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#FF3030",
  },
  mobileNeutralCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#5F6B76",
  },
  mobileDecisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  mobileDecisionTitleWrap: {
    flex: 1,
    gap: 4,
  },
  mobileDecisionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    letterSpacing: 1.1,
  },
  mobileDecisionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textMuted,
  },
  mobileDecisionFooter: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.textMuted,
  },
  plannerModeHint: {
    fontSize: 12,
    lineHeight: 18,
    color: appStylePalette.textMuted,
  },
  plannerSectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  mobileEvidenceList: {
    gap: 6,
  },
  mobileEvidenceText: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textPrimary,
  },
  mobileEvidenceTextMuted: {
    fontSize: 13,
    lineHeight: 19,
    color: appStylePalette.textMuted,
  },
  mobilePlannerCallout: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
    padding: 12,
    gap: 4,
  },
  mobilePlannerCalloutTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.accent,
  },
  mobilePlannerCalloutText: {
    fontSize: 13,
    lineHeight: 19,
    color: appStylePalette.textMuted,
  },
  mobileStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#E7EEF6",
  },
  mobileStatusBadgeCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mobileStatusBadgeGreen: {
    backgroundColor: "#2F6B36",
  },
  mobileStatusBadgeAmber: {
    backgroundColor: "#B88A28",
  },
  mobileStatusBadgeRed: {
    backgroundColor: "#A6192E",
  },
  mobileStatusBadgeText: {
    color: "#F8FBFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  mobileInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mobileInfoChip: {
    minWidth: 88,
    flexGrow: 1,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  mobileInfoChipLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
    color: appStylePalette.accent,
  },
  mobileInfoChipValue: {
    fontSize: 15,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  mobileListStack: {
    gap: 10,
  },
  mobileListRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  mobileListMainAction: {
    flex: 1,
  },
  mobileListActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  mobileListCopy: {
    flex: 1,
    gap: 4,
  },
  mobileListTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111820",
  },
  mobileListText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#41505C",
  },
  mobileDeleteMiniButton: {
    backgroundColor: "#F8E1E5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5B7C0",
  },
  mobileDeleteMiniButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#A6192E",
  },
  tableRowHold: {
    backgroundColor: appDecisionRowSurface,
    borderColor: "#00FF66",
  },
  tableRowNoHold: {
    backgroundColor: appDecisionRowSurface,
    borderColor: "#FF3030",
  },
  tableRowCurrent: {
    backgroundColor: appDecisionRowSurface,
    borderColor: "#00FF66",
  },
  tableRowNeutral: {
    backgroundColor: appDecisionRowSurface,
    borderColor: "#5F6B76",
  },
  seatSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: appStylePalette.textMuted,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(18, 24, 32, 0.42)",
    padding: 20,
    justifyContent: "center",
  },
  modalBackdropCompact: {
    padding: 10,
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "88%",
    backgroundColor: appStylePalette.surface,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 18,
    position: "relative",
  },
  modalCardCompact: {
    maxHeight: "94%",
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 56,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textMuted,
  },
  modalFloatingCloseButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: appStylePalette.surfaceRecessed,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: appStylePalette.borderStrong,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  modalFloatingCloseText: {
    fontSize: 16,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    lineHeight: 18,
  },
  modalTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: appStylePalette.borderStrong,
    paddingBottom: 8,
    gap: 10,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    gap: 14,
    paddingBottom: 12,
    paddingTop: 8,
  },
  modalScrollContentCompact: {
    gap: 12,
    paddingBottom: 20,
    paddingTop: 6,
  },
  modalSummaryPanelCompact: {
    padding: 14,
    gap: 10,
  },
  modalTableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: appStylePalette.borderStrong,
  },
  modalNameCell: {
    flex: 1.6,
  },
  modalPilotName: {
    fontSize: 14,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
  },
  listCompareWrap: {
    gap: 12,
    marginBottom: 14,
  },
  listCompareColumns: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  listCompareCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  listCompareCardCompact: {
    minWidth: 0,
    padding: 12,
    gap: 6,
  },
  listCompareTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  listCompareMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: appStylePalette.textMuted,
  },
  listCompareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: appStylePalette.borderStrong,
  },
  listCompareRowCompact: {
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  listCompareRowSenior: {
    backgroundColor: "rgba(255,43,43,0.10)",
  },
  listCompareRowYou: {
    backgroundColor: "rgba(0,155,194,0.12)",
  },
  listCompareRowRetiring: {
    backgroundColor: "#F6D6D6",
  },
  listCompareRowJunior: {
    backgroundColor: "rgba(0,255,0,0.10)",
  },
  listCompareNameWrap: {
    flex: 1,
    gap: 2,
  },
  listCompareName: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
  },
  listCompareStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: appStylePalette.textMuted,
  },
  listCompareContext: {
    fontSize: 11,
    fontWeight: "600",
    color: appStylePalette.textMuted,
  },
  listCompareNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
  },
  listCompareNumberCompact: {
    fontSize: 14,
    marginTop: 2,
  },
  baseNetBar: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.border,
  },
  baseNetText: {
    fontSize: 13,
    fontWeight: "800",
    color: appStylePalette.accent,
    textAlign: "center",
  },
  baseNetSubtext: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: appStylePalette.textMuted,
    textAlign: "center",
  },
  seatDivider: {
    marginVertical: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.borderStrong,
  },
  seatDividerText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: appStylePalette.textMuted,
  },
  tableCategoryCell: {
    flex: 1.7,
  },
  tableValueCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    minHeight: 48,
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: appStylePalette.border,
  },
  tableCell: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  tableDelta: {
    fontSize: 11,
    fontWeight: "700",
    color: appStylePalette.textMuted,
    fontVariant: ["tabular-nums"],
  },
  tableDeltaPositive: {
    color: "#8fa36a",
  },
  tableDeltaNegative: {
    color: "#d94a50",
  },
  tableCategoryText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  tableSubtext: {
    fontSize: 14,
    lineHeight: 16,
    color: appStylePalette.textMuted,
  },
  insightText: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textPrimary,
  },
  projectionCard: {
    backgroundColor: "#C6CDD4",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
  },
  projectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111820",
  },
  projectionMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: "#344552",
  },
  forecastControlRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  desktopForecastControlRow: {
    marginBottom: 8,
  },
  forecastGrowthWrap: {
    maxWidth: 220,
  },
  desktopPlannerPanel: {
    marginTop: 12,
    gap: 12,
  },
  aeTargetWrap: {
    maxWidth: 340,
  },
  projectionRow: {
    gap: 6,
  },
  projectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#344552",
  },
  projectionValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111820",
  },
  projectionTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#AEB7C0",
    overflow: "hidden",
  },
  projectionFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#A6192E",
  },
  projectionStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  projectionStat: {
    fontSize: 12,
    color: "#344552",
  },
  chartCard: {
    gap: 10,
  },
  chartCardCompact: {
    backgroundColor: "#C6CDD4",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    padding: 14,
  },
  chartLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  chartLegendRowCompact: {
    gap: 10,
  },
  dropdownWrap: {
    flex: 1,
    minWidth: 220,
    gap: 8,
  },
  payScenarioWrap: {
    flex: 1.2,
    minWidth: 220,
  },
  sliderWrap: {
    flex: 0.8,
    minWidth: 220,
    maxWidth: 420,
  },
  dropdownButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#D8DDE2",
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111820",
  },
  dropdownMenu: {
    backgroundColor: "#D8DDE2",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    overflow: "hidden",
  },
  dropdownMenuTall: {
    maxHeight: 240,
    backgroundColor: "#D8DDE2",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#5F6B76",
  },
  dropdownItemText: {
    fontSize: 15,
    color: "#111820",
    fontWeight: "600",
  },
  sliderCard: {
    backgroundColor: "#D8DDE2",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  sliderTrackShell: {
    paddingHorizontal: 2,
    marginTop: -6,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  sliderMetaGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sliderValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111820",
  },
  sliderMeta: {
    fontSize: 13,
    color: "#41505C",
    fontWeight: "600",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111820",
  },
  chartSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#41505C",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingBottom: 4,
    minHeight: 210,
  },
  chartRowCompact: {
    gap: 12,
    minHeight: 194,
    paddingBottom: 2,
  },
  chartColumn: {
    width: 34,
    alignItems: "center",
    gap: 6,
  },
  chartColumnCompact: {
    width: 40,
    gap: 8,
  },
  chartValue: {
    fontSize: 12,
    color: "#111820",
    fontWeight: "700",
    textAlign: "center",
  },
  chartValueCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  chartValueFuture: {
    color: "#A6192E",
  },
  chartBarWrap: {
    width: 24,
    height: 130,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#AEB7C0",
    borderRadius: 8,
    paddingBottom: 2,
    position: "relative",
    overflow: "hidden",
  },
  chartBarWrapCompact: {
    width: 28,
    height: 118,
    borderRadius: 10,
  },
  chartBar: {
    width: 16,
    backgroundColor: "#111820",
    borderRadius: 6,
  },
  chartBarCompact: {
    width: 18,
    borderRadius: 7,
  },
  chartBarFuture: {
    backgroundColor: "#FF2B2B",
  },
  chartReferenceMark: {
    position: "absolute",
    width: "100%",
    height: 2,
    left: 0,
    opacity: 0.95,
  },
  chartReferenceOne: {
    backgroundColor: "#007FA3",
  },
  chartReferenceTwo: {
    backgroundColor: "#68737D",
  },
  chartLabel: {
    fontSize: 12,
    color: "#41505C",
    textAlign: "center",
  },
  chartLabelCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  seniorityCard: {
    backgroundColor: "#C6CDD4",
    borderRadius: 20,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#5F6B76",
  },
  seniorityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  seniorityTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111820",
  },
  seniorityRole: {
    fontSize: 14,
    fontWeight: "700",
    color: "#344552",
  },
  seniorityMeta: {
    fontSize: 13,
    color: "#41505C",
  },
  screenshotAttachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#5F6B76",
  },
  screenshotAttachmentThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: "#AEB7C0",
  },
  screenshotAttachmentMeta: {
    flex: 1,
    minWidth: 0,
  },
  screenshotRemoveButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#5F6B76",
    backgroundColor: "#D8DDE2",
  },
  screenshotRemoveButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111820",
  },
});
