import {
  buildSupportCards,
  retrieveContractSupport,
  selectGoverningSections,
  verifyToolAnswer,
} from "../../contractBrain/index.ts";
import type { ContractAnswerCard } from "../../../types/contractCopilot.ts";
import { buildRerouteEvent } from "./buildRerouteEvent.ts";
import { calculateReroutePay } from "./calculateReroutePay.ts";
import {
  collectFactsUsed,
  detectBidPeriodTouch,
  detectDeadheadMention,
  detectLikelyContinuation,
  detectLikelyReroute,
  detectPossiblePayProtection,
} from "./reroutePayHeuristics.ts";
import { formatMinutes, parseTime } from "./parseTime.ts";
import { parseMiCrewRotation } from "./parseMiCrewRotation.ts";
import { parseMiCrewScreenshots } from "./parseMiCrewScreenshots.ts";
import { buildRerouteAnalyzerSummary } from "./prompt.ts";
import { reroutePayRules } from "./reroutePayRules.ts";
import type {
  ParsedMiCrewRotation,
  RerouteAnalysisInput,
  RerouteAnalysisOutput,
  RerouteEvent,
  RerouteSupportCard,
} from "./types.ts";

type AnalyzeReroutePayArgs = {
  input: RerouteAnalysisInput;
  contractIndex: {
    pwaChunks: any[];
    compensationChunks: any[];
    schedulerChunks: any[];
    hasPwaIndex: boolean;
    hasCompensationIndex: boolean;
    hasSchedulerIndex: boolean;
  };
};

type ScreenshotParseResult = Awaited<ReturnType<typeof parseMiCrewScreenshots>>;

type BaseAnalysisState = {
  input: RerouteAnalysisInput;
  likelyReroute: boolean | "unknown";
  likelyContinuation: boolean | "unknown";
  possiblePayProtection: boolean | "unknown";
  originalRotation?: ParsedMiCrewRotation;
  changedRotation?: ParsedMiCrewRotation;
  rerouteEvent: RerouteAnalysisOutput["rerouteEvent"];
  ruleEvent: RerouteEvent;
  deterministic: ReturnType<typeof calculateReroutePay>;
  factsUsed: string[];
  touchedXDay: boolean;
  deadheadInvolved: boolean;
  crossedBidPeriods: boolean;
  desiredAnchors: string[];
  screenshotParseResult: ScreenshotParseResult;
};

function mapScreenshotRotationToParsedRotation(
  rotation: NonNullable<ScreenshotParseResult["rotations"]>[number] | undefined,
): ParsedMiCrewRotation | undefined {
  if (!rotation) {
    return undefined;
  }
  return {
    rotationNumber: rotation.rotationNumber,
    date: rotation.dateRange,
    base: rotation.base,
    creditMinutes: rotation.creditMinutes,
    tafbMinutes: rotation.tafbMinutes,
    reportTime: rotation.reportTime,
    releaseTime: rotation.releaseTime,
    layovers: rotation.layovers ?? [],
    legs: (rotation.legs ?? []).map((leg) => ({
      flightNumber: leg.flightNumber,
      origin: leg.origin,
      destination: leg.destination,
      departureTime: leg.depTime,
      arrivalTime: leg.arrTime,
      blockMinutes: leg.blockMinutes,
      turnMinutes: leg.turnMinutes,
      isDeadhead: leg.type === "deadhead" ? true : undefined,
    })),
    parseConfidence: rotation.parseConfidence ?? "low",
    missingParseItems: rotation.missingParseItems ?? [],
  };
}

function detectWholeDutyPeriodHint(text: string) {
  return /\b(entire|whole|all of)\s+(day|duty period|rotation|trip)\s+(was )?rerouted/i.test(text);
}

function inferLateReleaseReason(text: string) {
  if (/weather|airport closure/i.test(text)) {
    return "weather_or_airport_closure" as const;
  }
  if (/company|scheduling|crew tracking|company controlled/i.test(text)) {
    return "company_controlled" as const;
  }
  return "unknown" as const;
}

function selectRelevantControls(args: {
  payItems: Array<{ rule?: string }>;
  supportCards: RerouteSupportCard[];
  warnings: string[];
}) {
  const controls: string[] = [];
  const hasRule = (rule: string) => args.payItems.some((item) => item.rule === rule);
  const hasCompReroute = args.supportCards.some(
    (card) => card.sourceName === "Compensation Manual" && /reroute pay/i.test(`${card.section} ${card.title ?? ""}`),
  );

  if (hasRule("23 L.4")) {
    controls.push("PWA Section 23 L.4");
    if (hasCompReroute) {
      controls.push("Compensation Manual — Reroute Pay");
    }
  }
  if (hasRule("23 L.8")) {
    controls.push("PWA Section 23 L.8");
  }
  if (hasRule("23 L.9")) {
    controls.push("PWA Section 23 L.9");
  }
  if (hasRule("23 L.10 / 23 L.11")) {
    controls.push("PWA Section 23 L.10 / L.11");
  }
  if (args.warnings.some((item) => /23 L\.2/i.test(item))) {
    controls.push("PWA Section 23 L.2");
  }
  if (controls.length === 0) {
    controls.push("PWA Section 23 L");
    if (hasCompReroute) {
      controls.push("Compensation Manual — Reroute Pay");
    }
  }
  return Array.from(new Set(controls));
}

function buildRuleEvent(args: {
  input: RerouteAnalysisInput;
  originalRotation?: ParsedMiCrewRotation;
  changedRotation?: ParsedMiCrewRotation;
  rerouteEvent: RerouteAnalysisOutput["rerouteEvent"];
}): RerouteEvent {
  const { input, originalRotation, changedRotation, rerouteEvent } = args;
  const firstBreakPosition =
    rerouteEvent.breakInDuty == null ? "unknown" : rerouteEvent.breakInDuty ? "after" : "before";
  const reroutedPortionRoute =
    typeof rerouteEvent.reroutedPortion === "string" ? rerouteEvent.reroutedPortion.trim() : "";

  const parsedChangedSegments = (changedRotation?.legs ?? [])
    .filter((leg) => {
      if (!reroutedPortionRoute) {
        return true;
      }
      const route = leg.origin && leg.destination ? `${leg.origin}-${leg.destination}` : "";
      return route === reroutedPortionRoute;
    })
    .map((leg) => ({
      date: changedRotation?.date,
      flightNumber: leg.flightNumber,
      origin: leg.origin,
      destination: leg.destination,
      blockMinutes: leg.blockMinutes,
      isDeadhead: leg.isDeadhead,
      isRerouted: true,
      relativeToFirstBreak: firstBreakPosition,
      timingBasis: leg.blockMinutes != null ? ("actual" as const) : ("unknown" as const),
    }));
  const parsedSegmentsHaveKnownBlock = parsedChangedSegments.some((segment) => segment.blockMinutes != null);
  const dutyPeriodSegments = rerouteEvent.dutyPeriods?.flatMap((period) => period.reroutedSegments ?? []) ?? [];

  const fallbackSegment =
    (!parsedSegmentsHaveKnownBlock || parsedChangedSegments.length === 0) &&
    dutyPeriodSegments.length === 0 &&
    rerouteEvent.reroutedMinutes != null
      ? [
          {
            date: changedRotation?.date ?? originalRotation?.date,
            flightNumber: parsedChangedSegments[0]?.flightNumber,
            origin: parsedChangedSegments[0]?.origin ?? rerouteEvent.reroutedFlying?.match(/\b([A-Z]{3})-/)?.[1],
            destination:
              parsedChangedSegments[0]?.destination ?? rerouteEvent.reroutedFlying?.match(/-([A-Z]{3})(?:\b|$)/)?.[1],
            blockMinutes: rerouteEvent.reroutedMinutes,
            isDeadhead: input.deadheadInvolved === "yes",
            isRerouted: true,
            relativeToFirstBreak: firstBreakPosition,
            timingBasis: "known_delay" as const,
          },
        ]
      : [];

  return {
    pilotStatus: input.pilotStatus === "reserve" ? "reserve" : "lineholder",
    rerouteTiming:
      rerouteEvent.timing === "after_first_airborne"
        ? "after_first_airborne"
        : rerouteEvent.timing === "after_report"
          ? "after_report"
          : rerouteEvent.timing === "before_report"
            ? "before_first_airborne"
            : "unknown",
    originalScheduledRelease: originalRotation?.releaseTime,
    reroutedScheduledRelease: changedRotation?.releaseTime,
    firstBreakInDutyAfterReroute: rerouteEvent.breakInDuty,
    reachedBase: Boolean(rerouteEvent.rejoinPoint),
    releasedAtBase:
      Boolean(changedRotation?.base) &&
      Boolean(changedRotation?.legs.at(-1)?.destination) &&
      changedRotation?.base === changedRotation?.legs.at(-1)?.destination,
    rejoinedOriginalRotation: Boolean(rerouteEvent.rejoinPoint),
    transOceanic: rerouteEvent.oceanCrossing,
    lateReleaseReason: inferLateReleaseReason(input.description),
    touchedXDayOrLineDayOff: rerouteEvent.touchedXDay,
    originalRotationValueMinutes: rerouteEvent.originalAffectedMinutes,
    reroutedRotationValueMinutes: rerouteEvent.reroutedMinutes,
    reroutedSegments:
      dutyPeriodSegments.length > 0 ? dutyPeriodSegments : parsedSegmentsHaveKnownBlock ? parsedChangedSegments : fallbackSegment,
    dutyPeriods: rerouteEvent.dutyPeriods?.map((period, index) => ({
      label: period.label || `Event ${index + 1}`,
      rerouteTiming: period.rerouteTiming,
      firstBreakInDutyAfterReroute: period.firstBreakInDutyAfterReroute,
      originalScheduledRelease: period.originalScheduledRelease,
      reroutedScheduledRelease: period.reroutedScheduledRelease,
      reachedBase: period.reachedBase,
      releasedAtBase: period.releasedAtBase,
      rejoinedOriginalRotation: period.rejoinedOriginalRotation,
      transOceanic: period.transOceanic,
      lateReleaseReason: period.lateReleaseReason,
      touchedXDayOrLineDayOff: period.touchedXDayOrLineDayOff,
      originalRotationValueMinutes: period.originalRotationValueMinutes,
      reroutedRotationValueMinutes: period.reroutedRotationValueMinutes,
      reroutedSegments:
        period.reroutedSegments.length > 0
          ? period.reroutedSegments
          : parsedSegmentsHaveKnownBlock
            ? parsedChangedSegments
            : fallbackSegment,
    })),
  };
}

function toToolAnswerCard(output: Omit<RerouteAnalysisOutput, "debug">): ContractAnswerCard {
  const supportLevel =
    output.supportCards.some((card) => card.sourceName === "PWA")
      ? "contract_backed"
      : output.supportCards.length > 0
        ? "mixed"
        : "inference_heavy";
  return {
    status: output.status === "resolved" ? "answered" : "partial_answer",
    scenarioLabel: "Reroute Pay Calculator",
    answerCompleteness: output.status === "resolved" ? "resolved" : "provisional",
    shortAnswer: output.shortAnswer,
    plainEnglishExplanation: output.plainEnglishExplanation,
    confidence: output.status === "resolved" ? "high" : output.status === "warning" ? "low" : "medium",
    supportLevel,
    assumptions: output.sourceLimitations,
    scenarioBreakdown: output.calculationSteps,
    missingFacts: output.missingFacts,
    evidenceSummary: output.factsUsed,
    references: output.supportCards.map((card) => ({
      label: `${card.sourceName} ${card.section}`.trim(),
      sourceId:
        card.sourceName === "PWA"
          ? "pwa"
          : card.sourceName === "Compensation Manual"
            ? "compensation_manual"
            : "scheduler_manual",
      displaySourceLabel:
        card.sourceName === "PWA"
          ? "PWA"
          : card.sourceName === "Compensation Manual"
            ? "Compensation Manual"
            : "Scheduler Manual",
      section: card.section,
      quoteSnippet: card.quoteSnippet,
      ruleType: "contract",
    })),
    whatCouldChangeThisAnswer: output.whatThisDependsOn,
    breakItDown: output.whatToCheck,
    caveats: output.sourceLimitations,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
}

async function buildBaseAnalysisState(args: AnalyzeReroutePayArgs): Promise<BaseAnalysisState> {
  const { input, contractIndex } = args;
  const likelyReroute = detectLikelyReroute(input);
  const likelyContinuation = detectLikelyContinuation(input);
  const possiblePayProtection = detectPossiblePayProtection(input);

  const textOriginalRotation: ParsedMiCrewRotation | undefined = input.originalRotationText?.trim()
    ? parseMiCrewRotation({
        pastedText: input.originalRotationText,
        screenshotMetadata: [],
      })
    : undefined;

  const textChangedRotation: ParsedMiCrewRotation | undefined =
    input.changedRotationText?.trim() || input.description.trim()
      ? parseMiCrewRotation({
          pastedText: input.changedRotationText || input.description,
          screenshotMetadata: [],
        })
      : undefined;

  const screenshotBacked =
    (input.originalImages?.length ?? 0) > 0 || (input.changedImages?.length ?? 0) > 0;
  const screenshotParseResult = screenshotBacked
    ? await withTimeout(
        parseMiCrewScreenshots({
          originalImages: input.originalImages ?? [],
          changedImages: input.changedImages ?? [],
          uploadedEvidenceSummary: input.uploadedEvidenceSummary,
        }),
        35_000,
        "Screenshot parsing timed out",
      ).catch((error) => ({
        screenshotParsingActive: true,
        uploadedEvidenceSummary: input.uploadedEvidenceSummary,
        missingFacts: ["Screenshots were received, but image parsing took too long. Paste the changed segment block times or try fewer/clearer screenshots."],
        rotations: [],
        parseConfidence: "low" as const,
        missingParseItems: ["Screenshot parsing timed out"],
        extractionNotes: [error instanceof Error ? error.message : "Screenshot parsing timed out"],
        rawVisionResponsePreview: [],
        rawTextPreview: [],
        structuredJsonParseError: error instanceof Error ? error.message : "Screenshot parsing timed out",
        visionModelCalled: true,
        modelSelected: process.env.OPENAI_VISION_MODEL ?? "gpt-4.1",
      }))
    : await parseMiCrewScreenshots({
        originalImages: input.originalImages ?? [],
        changedImages: input.changedImages ?? [],
        uploadedEvidenceSummary: input.uploadedEvidenceSummary,
      });
  const screenshotOriginalRotation = mapScreenshotRotationToParsedRotation(
    screenshotParseResult.rotations?.find((rotation) => rotation.sourceType === "original"),
  );
  const screenshotChangedRotation = mapScreenshotRotationToParsedRotation(
    screenshotParseResult.rotations?.find((rotation) => rotation.sourceType === "rerouted"),
  );

  const originalRotation = screenshotOriginalRotation ?? textOriginalRotation;
  const changedRotation = screenshotChangedRotation ?? textChangedRotation;
  const parsedOriginalLegsCount = originalRotation?.legs.length ?? 0;
  const parsedChangedLegsCount = changedRotation?.legs.length ?? 0;
  console.log("[reroutePay] screenshot parse handoff", {
    parsedOriginalLegsCount,
    parsedChangedLegsCount,
    screenshotLegsPassedIntoBuilder: screenshotParseResult.screenshotParsingActive,
  });

  const rerouteEvent = buildRerouteEvent({
    originalRotation,
    changedRotation,
    description: input.description,
    pilotStatus: input.pilotStatus,
    input,
  });

  const ruleEvent = buildRuleEvent({ input, originalRotation, changedRotation, rerouteEvent });
  console.log("[reroutePay] reroute event built", {
    reroutedSegments: ruleEvent.reroutedSegments.length,
    dutyPeriods: ruleEvent.dutyPeriods?.length ?? 0,
    reroutedPortion: rerouteEvent.reroutedPortion,
    reroutedMinutes: rerouteEvent.reroutedMinutes,
    screenshotOriginalUsed: Boolean(screenshotOriginalRotation?.legs.length),
    screenshotChangedUsed: Boolean(screenshotChangedRotation?.legs.length),
  });
  const deterministic = calculateReroutePay(ruleEvent);
  const factsUsed = collectFactsUsed(input);
  const touchedXDay = Boolean(rerouteEvent.touchedXDay);
  const deadheadInvolved = detectDeadheadMention(input);
  const crossedBidPeriods = detectBidPeriodTouch(input);

  const desiredAnchors = [
    "23 L",
    "23 L.2",
    "23 L.4",
    "23 L.4.c",
    "23 L.8",
    "23 L.9",
    "23 L.10",
    "23 L.11",
    "23 L.12",
    "23 L.13",
    "Section 4 F",
    "reroute pay",
    "rotation guarantee",
  ];

  void contractIndex;

  return {
    input,
    likelyReroute,
    likelyContinuation,
    possiblePayProtection,
    originalRotation,
    changedRotation,
    rerouteEvent,
    ruleEvent,
    deterministic,
    factsUsed,
    touchedXDay,
    deadheadInvolved,
    crossedBidPeriods,
    desiredAnchors,
    screenshotParseResult,
  };
}

function buildPreliminaryOutput(state: BaseAnalysisState): Omit<RerouteAnalysisOutput, "debug"> {
  const {
    input,
    likelyReroute,
    likelyContinuation,
    possiblePayProtection,
    originalRotation,
    changedRotation,
    rerouteEvent,
    ruleEvent,
    deterministic,
    factsUsed,
    touchedXDay,
    deadheadInvolved,
    crossedBidPeriods,
    screenshotParseResult,
  } = state;

  let status: RerouteAnalysisOutput["status"] =
    deterministic.payItems.length > 0 && deterministic.missingFacts.length === 0 ? "resolved" : "caution";
  let likelyIssue = "Section 23 L reroute pay calculation";
  let shortAnswer =
    "I can calculate reroute pay if you provide the original affected flying and rerouted flying/block values.";
  let plainEnglishExplanation = shortAnswer;
  const originalScreenshotCount = input.uploadedEvidenceSummary.originalScreenshotCount ?? 0;
  const changedScreenshotCount = input.uploadedEvidenceSummary.changedScreenshotCount ?? 0;
  const hasOriginalText = Boolean(input.originalRotationText?.trim());
  const hasChangedText = Boolean(input.changedRotationText?.trim());
  const parsedScreenshotRotations = screenshotParseResult.rotations ?? [];
  const screenshotRotationCount = parsedScreenshotRotations.length;
  const screenshotLegCount =
    parsedScreenshotRotations.reduce((sum, rotation) => sum + (rotation.legs?.length ?? 0), 0) ?? 0;
  const originalScreenshotLegCount =
    parsedScreenshotRotations
      .filter((rotation) => rotation.sourceType === "original")
      .reduce((sum, rotation) => sum + (rotation.legs?.length ?? 0), 0) ?? 0;
  const changedScreenshotLegCount =
    parsedScreenshotRotations
      .filter((rotation) => rotation.sourceType === "rerouted")
      .reduce((sum, rotation) => sum + (rotation.legs?.length ?? 0), 0) ?? 0;
  const hasOnlyScreenshotEvidence =
    (originalScreenshotCount > 0 || changedScreenshotCount > 0) &&
    !hasOriginalText &&
    !hasChangedText &&
    !input.description.trim();

  const primaryPayItem = deterministic.payItems[0];
  const screenshotsWereUnreadable =
    screenshotParseResult.screenshotParsingActive &&
    screenshotLegCount === 0 &&
    (originalScreenshotCount > 0 || changedScreenshotCount > 0);
  if (primaryPayItem?.rule === "23 L.4") {
    likelyIssue = /before first break/i.test(primaryPayItem.label)
      ? "Rerouted-segment premium before first break in duty"
      : /after first break/i.test(primaryPayItem.label)
        ? "Rerouted-segment premium after first break in duty"
        : "Section 23 L.4 reroute pay calculation";
  }

  if (likelyContinuation === true) {
    likelyIssue = "Possible continuation versus reroute classification";
    shortAnswer =
      "A different flight number alone does not prove reroute pay. I need the original affected flying, rerouted flying, and rejoin point before trusting a reroute calculation.";
    plainEnglishExplanation =
      "This looks more like a continuation-versus-reroute issue, so I cannot trust Section 23 L math until the affected portion and rejoin point are clear.";
    status = "caution";
  } else if (deterministic.estimatedAdditionalPayMinutes != null) {
    shortAnswer = `Estimated additional reroute pay is ${formatMinutes(deterministic.estimatedAdditionalPayMinutes)} based on the Section 23 L items I can calculate from the current facts.`;
    plainEnglishExplanation =
      "I totaled only the reroute pay items that have enough structured facts to calculate. Any missing threshold, release, or break-in-duty facts can still change the final number.";
  } else if (deterministic.payItems.length > 0) {
    shortAnswer =
      "I identified likely Section 23 L pay items, but I still need one or more missing timing or value facts before I can total them.";
    plainEnglishExplanation =
      "The rule engine found reroute pay items, but at least one required value is still missing, so I am showing the likely rules without inventing the math.";
  } else if (screenshotsWereUnreadable) {
    shortAnswer =
      "I received the screenshots, but could not reliably read the leg/block data. Try a clearer screenshot or paste the changed segment block times.";
    plainEnglishExplanation = shortAnswer;
    status = "caution";
  }

  if (hasOnlyScreenshotEvidence && screenshotLegCount === 0) {
    status = "caution";
    if (originalScreenshotCount > 0 && changedScreenshotCount > 0) {
      shortAnswer =
        "Screenshots attached, but I could not reliably read enough of the MiCrew screenshots to calculate reroute pay. Paste or describe the changed segments and block times.";
      plainEnglishExplanation = shortAnswer;
    } else if (originalScreenshotCount > 0) {
      shortAnswer =
        "I have the original screenshot but still need the changed/rerouted trip or a description of what changed.";
      plainEnglishExplanation = shortAnswer;
    } else if (changedScreenshotCount > 0) {
      shortAnswer =
        "I have the changed/rerouted screenshot but still need the original trip or a description of what changed.";
      plainEnglishExplanation = shortAnswer;
    }
  }

  if (touchedXDay) {
    likelyIssue += " with possible X-day / line day-off premium";
  }

  const whatThisDependsOn = [
    "Whether the reroute happened before first airborne, after report, or after first airborne.",
    "Which rerouted segments were before versus after the first break in duty.",
    "The original affected rotation value and the rerouted value.",
  ];
  if (deadheadInvolved) {
    whatThisDependsOn.push("Whether any deadhead segment was rerouted and its block value.");
  }
  if (crossedBidPeriods) {
    whatThisDependsOn.push("Whether the reroute crossed bid periods and changed how the company processed the trip.");
  }

  const likelyPaths = [
    "23 L.4 can add rerouted-segment premium as pay / no credit.",
    "23 L.8 or 23 L.9 can add a late-release premium when the release threshold is exceeded.",
  ];
  if (ruleEvent.releasedAtBase) {
    likelyPaths.push("23 L.4.c / Section 4 F may preserve the original rotation guarantee after release at base.");
  }
  if (ruleEvent.rerouteTiming === "before_first_airborne") {
    likelyPaths.push("23 L.2 gate applies before first airborne and may require delayed-roundtrip exception facts.");
  }

  const whatToCheck = [
    "Original affected flying text or block/credit value.",
    "Rerouted flying text or block/credit value.",
    "Release times for the original and rerouted rotations.",
    "Timecard or pay summary if available.",
  ];

  const sourceLimitations: string[] = [];
  if (input.uploadedEvidenceSummary.notes.length > 0) {
    sourceLimitations.push(...input.uploadedEvidenceSummary.notes);
  }
  if (screenshotParseResult.missingFacts.length > 0) {
    sourceLimitations.push(...screenshotParseResult.missingFacts);
  }

  const warnings = [...deterministic.warnings];
  if (
    deterministic.payItems.length === 0 &&
    state.rerouteEvent.reroutedMinutes == null &&
    !detectWholeDutyPeriodHint(input.description)
  ) {
    warnings.push(
      "I need the changed or added segment block time before I can calculate 23 L.4. Do not rely on total day block unless the whole duty period was rerouted.",
    );
  }
  if (ruleEvent.rerouteTiming === "before_first_airborne") {
    warnings.push("Regular pilots generally may not be rerouted before first airborne unless a Section 23 L.2 exception applies.");
  }

  return {
    status,
    estimatedAdditionalPayMinutes: deterministic.estimatedAdditionalPayMinutes,
    payItems: deterministic.payItems,
    calculationSteps: deterministic.calculationSteps,
    plainEnglishExplanation,
    missingFacts: deterministic.missingFacts,
    warnings,
    whatControls: selectRelevantControls({
      payItems: deterministic.payItems,
      supportCards: [],
      warnings,
    }),
    supportCards: [],
    likelyIssue,
    shortAnswer,
    originalRotation,
    changedRotation,
    rerouteEvent,
    ruleEvent,
    calculation: deterministic.calculation,
    estimatedPayLabel:
      deterministic.estimatedAdditionalPayMinutes != null
        ? formatMinutes(deterministic.estimatedAdditionalPayMinutes)
        : "Need more facts",
    classification: {
      likelyReroute,
      likelyContinuation,
      possiblePayProtection,
      missingFacts: deterministic.missingFacts,
    },
    factsUsed,
    whatThisDependsOn,
    likelyPaths,
    whatToCheck,
    sourceLimitations,
    focusedQuestions: deterministic.missingFacts.slice(0, 3),
    screenshotParserSummary: {
      screenshotParsingActive: screenshotParseResult.screenshotParsingActive,
      originalScreenshotsRead: input.originalImages?.length ?? 0,
      changedScreenshotsRead: input.changedImages?.length ?? 0,
      originalImagesReceived: input.originalImages?.length ?? 0,
      changedImagesReceived: input.changedImages?.length ?? 0,
      visionModelCalled: screenshotParseResult.visionModelCalled ?? (input.originalImages?.length ?? 0) + (input.changedImages?.length ?? 0) > 0,
      modelSelected: screenshotParseResult.modelSelected ?? (process.env.OPENAI_VISION_MODEL ?? "gpt-4.1"),
      parseConfidence: screenshotParseResult.parseConfidence ?? "low",
      rotationCount: screenshotRotationCount,
      legsDetected: screenshotLegCount,
      missingParseItems: screenshotParseResult.missingParseItems ?? [],
      extractionNotes: [
        ...(screenshotParseResult.extractionNotes ?? []),
        `Original legs parsed: ${originalScreenshotLegCount}`,
        `Changed legs parsed: ${changedScreenshotLegCount}`,
      ],
      rawVisionResponsePreview: screenshotParseResult.rawVisionResponsePreview ?? [],
      rawTextPreview: screenshotParseResult.rawTextPreview ?? [],
      structuredJsonParseError: screenshotParseResult.structuredJsonParseError,
      fallbackRegexLegsParsed: screenshotParseResult.fallbackRegexLegsParsed ?? 0,
      parsedLegs:
        screenshotParseResult.rotations?.flatMap((rotation) =>
          rotation.legs.map((leg) => {
            const route =
              leg.origin && leg.destination ? `${leg.origin}-${leg.destination}` : undefined;
            const diagnostic = rerouteEvent.legSelectionDiagnostics?.find(
              (item) =>
                item.sourceType === rotation.sourceType &&
                item.route === route &&
                item.flightNumber === leg.flightNumber &&
                (item.sourceImageIndex ?? -1) === (leg.sourceImageIndex ?? -1),
            );
            return {
              sourceType: rotation.sourceType,
              type: leg.type ?? (leg.isDeadhead ? "deadhead" : "unknown"),
              flightNumber: leg.flightNumber,
              origin: leg.origin,
              destination: leg.destination,
              depTime: leg.depTime,
              arrTime: leg.arrTime,
              blockMinutes: leg.blockMinutes,
              turnMinutes: leg.turnMinutes,
              sourceImageIndex: leg.sourceImageIndex,
              classification: diagnostic?.classification,
              classificationReason: diagnostic?.reason,
            };
          }),
        ) ?? [],
    },
  };
}

async function enrichWithSupport(
  args: AnalyzeReroutePayArgs,
  state: BaseAnalysisState,
  preliminaryOutput: Omit<RerouteAnalysisOutput, "debug">,
): Promise<RerouteAnalysisOutput> {
  const { input, contractIndex } = args;
  const { likelyReroute, likelyContinuation, originalRotation, changedRotation, rerouteEvent, ruleEvent, deterministic, touchedXDay, desiredAnchors } =
    state;

  console.log("[reroutePay] Contract Brain retrieval started");
  const supportResult = retrieveContractSupport({
    question: buildRerouteAnalyzerSummary(input),
    toolType: "reroutePayCalculator",
    contractIndex,
    knownFacts: {
      status: input.pilotStatus === "lineholder" ? "lineholder" : "reserve",
      beforeReport: ruleEvent.rerouteTiming === "before_first_airborne" ? true : undefined,
      afterReport:
        ruleEvent.rerouteTiming === "after_report" || ruleEvent.rerouteTiming === "after_first_airborne"
          ? true
          : undefined,
      rerouteOccurred: likelyReroute === true,
      tripTouched: true,
    },
    desiredAnchors,
    sourcePreference: "balanced",
    deterministicScenario: "reroute / reassignment",
  });
  console.log("[reroutePay] Contract Brain retrieval complete");

  const governing = selectGoverningSections({
    question: input.description,
    toolType: "reroutePayCalculator",
    scenarioType: "reroute_pay_calculation",
    knownFacts: { rerouteOccurred: likelyReroute === true },
    candidateSupport: supportResult,
  });

  const supportCardsResult = buildSupportCards({
    governingSections: governing.governingSections,
    candidateSupport: supportResult.candidateSupport,
    answerText: input.description,
  });
  console.log("[reroutePay] support cards built");

  const sourceLimitations = [...preliminaryOutput.sourceLimitations];
  let status = preliminaryOutput.status;
  if (!supportCardsResult.visibleSupportCards.some((card) => /23 L|23 L\.|reroute/i.test(`${card.section} ${card.title ?? ""}`))) {
    sourceLimitations.push("Exact Section 23 L source support is not fully attached from the current indexed sources.");
    status = "caution";
  }

  const warnings = [...preliminaryOutput.warnings];
  if (governing.governingSections.length === 0) {
    warnings.push("I do not have a clean controlling section packet attached yet.");
  }

  const supportCards: RerouteSupportCard[] = supportCardsResult.visibleSupportCards.map((card) => ({
    sourceName: card.sourceName,
    section: card.section,
    title: card.title,
    quoteSnippet: card.quoteSnippet,
    note: card.note,
  }));

  const topLevelWhatControls = selectRelevantControls({
    payItems: deterministic.payItems,
    supportCards,
    warnings,
  });

  const supportOutput: Omit<RerouteAnalysisOutput, "debug"> = {
    ...preliminaryOutput,
    status,
    warnings,
    sourceLimitations,
    supportCards,
    whatControls: topLevelWhatControls,
  };

  const verification = verifyToolAnswer({
    toolType: "reroutePayCalculator",
    question: input.description,
    proposedAnswer: toToolAnswerCard(supportOutput),
    calculatedResult: {
      estimatedPayMinutes: deterministic.estimatedAdditionalPayMinutes,
      calculationType: deterministic.calculation.calculationType,
      payItems: deterministic.payItems,
    },
    supportCards: supportCardsResult.visibleSupportCards,
    knownFacts: {
      pilotStatus: input.pilotStatus,
      rerouteTiming: rerouteEvent.timing,
      touchedXDay,
      likelyContinuation,
      likelyReroute,
    },
  });

  return {
    ...supportOutput,
    status:
      verification.trustLevel === "resolved"
        ? supportOutput.status
        : verification.trustLevel === "warning"
          ? "warning"
          : "caution",
    debug: {
      trustLevel: verification.trustLevel,
      truthGuardNotes: verification.truthGuardNotes,
      unsupportedClaims: verification.unsupportedClaims,
      missingFacts: verification.missingFacts,
      sourceMatchReason: supportResult.matchReason,
      supportAnchors: supportResult.exactSectionAnchors,
      originalRotation,
      changedRotation,
      rerouteEvent,
      ruleEvent,
      payItems: deterministic.payItems,
      warnings,
      calculation: deterministic.calculation,
      parsedOriginalReleaseMinutes: parseTime(originalRotation?.releaseTime),
      parsedReroutedReleaseMinutes: parseTime(changedRotation?.releaseTime),
      screenshotParserSummary: supportOutput.screenshotParserSummary,
    },
  };
}

function buildSupportFailureResult(
  preliminaryOutput: Omit<RerouteAnalysisOutput, "debug">,
  state: BaseAnalysisState,
  reason: string,
): RerouteAnalysisOutput {
  const warnings = [...preliminaryOutput.warnings, reason];
  const sourceLimitations = [...preliminaryOutput.sourceLimitations, "Contract support cards are unavailable for this response."];
  return {
    ...preliminaryOutput,
    status: "caution",
    warnings,
    sourceLimitations,
    supportCards: [],
    debug: {
      supportRetrievalFailed: true,
      supportFailureReason: reason,
      originalRotation: state.originalRotation,
      changedRotation: state.changedRotation,
      rerouteEvent: state.rerouteEvent,
      ruleEvent: state.ruleEvent,
      payItems: state.deterministic.payItems,
      warnings,
      calculation: state.deterministic.calculation,
      parsedOriginalReleaseMinutes: parseTime(state.originalRotation?.releaseTime),
      parsedReroutedReleaseMinutes: parseTime(state.changedRotation?.releaseTime),
      screenshotParserSummary: preliminaryOutput.screenshotParserSummary,
    },
  };
}

export async function analyzeReroutePay(args: AnalyzeReroutePayArgs): Promise<RerouteAnalysisOutput> {
  console.log("[reroutePay] analyzeReroutePay started");
  const state = await buildBaseAnalysisState(args);
  console.log("[reroutePay] buildRerouteEvent complete");
  console.log("[reroutePay] calculateReroutePay complete");
  const preliminaryOutput = buildPreliminaryOutput(state);

  try {
    const result = await withTimeout(
      Promise.resolve().then(() => enrichWithSupport(args, state, preliminaryOutput)),
      8_000,
      "Contract support retrieval timed out.",
    );
    return result;
  } catch (error) {
    const reason =
      error instanceof Error
        ? /timed out/i.test(error.message)
          ? "Contract support retrieval timed out or failed."
          : `Contract support retrieval timed out or failed. ${error.message}`
        : "Contract support retrieval timed out or failed.";
    return buildSupportFailureResult(preliminaryOutput, state, reason);
  }
}
