import { buildRuleLedBottomLine, resolveScenarioValidation } from "../server/routes/ai/contractCopilotRoute.ts";
import { buildFactPatchFromTripExtraction, mergeConfirmedExtractionIntoSession } from "../src/utils/contractCopilot/evidenceMapping.ts";
import type {
  ContractCopilotExtractedTripFacts,
  ContractCopilotPendingExtractionReview,
  ContractCopilotSession,
  ParsedScenarioFacts,
} from "../src/types/contractCopilot.ts";
import type { SectionAwareGroundingPacket } from "../src/ai/retrieval/types.ts";

const initialSession: ContractCopilotSession = {
  sessionId: "validation-session",
  facts: {},
  clarificationCount: 0,
  turns: [],
  status: "idle",
};

function makePacket(args: {
  section: string;
  title?: string;
  content: string;
  packetType?: SectionAwareGroundingPacket["packetType"];
}): SectionAwareGroundingPacket {
  return {
    id: `packet-${args.section}`,
    sourceLabel: "PWA",
    tier: "pwa",
    section: args.section,
    title: args.title,
    packetType: args.packetType ?? "governing_section",
    content: args.content,
    pages: [1],
    matchedTerms: [],
    crossRefsFollowed: [],
    usedSectionExpansion: true,
    relevanceScore: 100,
  };
}

function buildReview(
  sourceName: string,
  facts: ContractCopilotExtractedTripFacts
): ContractCopilotPendingExtractionReview {
  return {
    id: `review-${sourceName}`,
    evidenceType: "trip_screenshot",
    sourceName,
    extractedAtIso: "2026-04-22T18:00:00.000Z",
    facts,
    suggestedFactPatch: buildFactPatchFromTripExtraction(facts),
    status: "needs_confirmation",
  };
}

const screenshotCases: Array<{ name: string; extracted: ContractCopilotExtractedTripFacts }> = [
  {
    name: "reroute_deadhead_trip.png",
    extracted: {
      summary: "Reserve trip with deadhead first leg changed to a later departure on the drive to the airport.",
      pairingNumber: "1234",
      dutyDate: "2026-04-22",
      dutyPeriodLabel: "Day 1",
      reportTime: "09:00",
      releaseTime: "18:10",
      originalLegTiming: ["DH DEN-LAX 10:00-11:30"],
      changedLegTiming: ["DH DEN-LAX 12:15-13:45"],
      rerouteIndicators: ["Leg timing changed after assignment"],
      reassignmentIndicators: [],
      visibleChangeTimestamps: ["08:12"],
      legs: [
        {
          id: "leg-1",
          legLabel: "Leg 1",
          flightNumber: "DH1234",
          origin: "DEN",
          destination: "LAX",
          legType: "deadhead",
          originalDepartureTime: "10:00",
          changedDepartureTime: "12:15",
          originalArrivalTime: "11:30",
          changedArrivalTime: "13:45",
          changeTimestamp: "08:12",
          notes: "Changed while driving to airport",
        },
      ],
      missingOrUnclear: ["Whether change happened before or after report"],
      confidence: "high",
    },
  },
  {
    name: "three_day_gs_long_call.png",
    extracted: {
      summary: "Three-day Greenslip on reserve with off days on day 1 and 2, and long-call overlap on day 3.",
      pairingNumber: "GS7788",
      dutyDate: "2026-04-23",
      dutyPeriodLabel: "Day 3 overlap",
      reportTime: "13:00",
      releaseTime: "21:20",
      originalLegTiming: ["Day 3 report 13:00"],
      changedLegTiming: [],
      rerouteIndicators: [],
      reassignmentIndicators: [],
      visibleChangeTimestamps: [],
      legs: [
        {
          id: "leg-1",
          legLabel: "Day 3 duty",
          flightNumber: "GS7788",
          origin: "ATL",
          destination: "MSP",
          legType: "operating",
          originalDepartureTime: "14:10",
          changedDepartureTime: undefined,
          originalArrivalTime: "16:45",
          changedArrivalTime: undefined,
          changeTimestamp: undefined,
          notes: "Long call day visible, but first attempted contact time not shown",
        },
      ],
      missingOrUnclear: ["First attempted contact time for the long-call day"],
      confidence: "medium",
    },
  },
  {
    name: "sick_then_pickup.png",
    extracted: {
      summary: "Sick notation on one day and a later picked-up trip visible in the same week.",
      pairingNumber: "P4567",
      dutyDate: "2026-04-24",
      dutyPeriodLabel: "Weekly view",
      reportTime: "",
      releaseTime: "",
      originalLegTiming: ["Pickup shown on 04/25"],
      changedLegTiming: [],
      rerouteIndicators: [],
      reassignmentIndicators: [],
      visibleChangeTimestamps: [],
      legs: [
        {
          id: "leg-1",
          legLabel: "Pickup trip",
          flightNumber: "DL4567",
          origin: "SLC",
          destination: "LAX",
          legType: "operating",
          originalDepartureTime: "11:05",
          changedDepartureTime: undefined,
          originalArrivalTime: "12:40",
          changedArrivalTime: undefined,
          changeTimestamp: undefined,
          notes: "Screenshot shows both sick and pickup but not whether they overlapped",
        },
      ],
      missingOrUnclear: ["Whether the pickup overlapped the sick day or started after sick cleared"],
      confidence: "medium",
    },
  },
];

const scenarioCases: Array<{
  label: string;
  question: string;
  facts: ParsedScenarioFacts;
  packet: SectionAwareGroundingPacket;
  matchedInteractionRuleId?: string;
}> = [
  {
    label: "reroute / deadhead timing",
    question:
      "I got a trip assigned on reserve leg one was a deadhead, on the drive to the airport they changed leg one to a later deadhead does this trigger reroute pay?",
    facts: { status: "reserve", rerouteOccurred: true, tripTouched: true },
    packet: makePacket({
      section: "Section 23 K",
      title: "Reroute / reassignment",
      content:
        "Reroute and reassignment analysis turns on the original versus changed sequence and whether the change happened before or after report, with related pay under Section 4 F.",
    }),
    matchedInteractionRuleId: "reroute_timing_and_pay_impact",
  },
  {
    label: "GS + long call missing 18-hour fact",
    question:
      "on reserve i got a 3 day greenslip day one and 2 are off days and day 3 is Long Call day, how should this pay?",
    facts: { status: "reserve", pickupType: "greenslip", premiumType: "greenslip" },
    packet: makePacket({
      section: "Section 23 Q",
      title: "Greenslip long-call carveout",
      content:
        "A long call reserve pilot who is awarded a GS rotation with a report that is within 18 hours of the first attempted contact will receive single pay, no credit for the first duty period of the rotation.",
    }),
    matchedInteractionRuleId: "greenslip_overlapping_reserve_day",
  },
  {
    label: "sick + GS missing overlap fact",
    question:
      "I called in sick and then picked up a Greenslip. How does that pay?",
    facts: { sickUsed: true, pickupType: "greenslip", premiumType: "greenslip", leaveType: "sick" },
    packet: makePacket({
      section: "Section 14 E",
      title: "Sick leave interaction",
      content:
        "Sick leave interaction depends on whether the pickup overlaps the sick day or occurs after the sick period has ended.",
    }),
  },
  {
    label: "APD without counts",
    question:
      "Can I use APD on reserve if reserve coverage is below the required minimum?",
    facts: { status: "reserve" },
    packet: makePacket({
      section: "Section 23 I.10",
      title: "APD on reserve",
      content:
        "An APD request will be granted if, at the time of processing, the number of reserves available in the category is at least 25% of the number of reserves required.",
    }),
    matchedInteractionRuleId: "apd_eligibility_on_reserve",
  },
  {
    label: "APD with counts",
    question:
      "trying to drop a reserve day with APD reserve required for that day is 17, reserves available are 10, will this work?",
    facts: { status: "reserve", processingCountsKnown: true },
    packet: makePacket({
      section: "Section 23 I.10",
      title: "APD on reserve",
      content:
        "An APD request will be granted if, at the time of processing, the number of reserves available in the category is at least 25% of the number of reserves required.",
    }),
    matchedInteractionRuleId: "apd_eligibility_on_reserve",
  },
];

const screenshotResults = screenshotCases.map((testCase) => {
  const review = buildReview(testCase.name, testCase.extracted);
  const merged = mergeConfirmedExtractionIntoSession(initialSession, review);
  return {
    test: testCase.name,
    extractedFields: {
      summary: testCase.extracted.summary,
      pairingNumber: testCase.extracted.pairingNumber,
      dutyDate: testCase.extracted.dutyDate,
      reportTime: testCase.extracted.reportTime,
      releaseTime: testCase.extracted.releaseTime,
      legs: testCase.extracted.legs,
      rerouteIndicators: testCase.extracted.rerouteIndicators,
      reassignmentIndicators: testCase.extracted.reassignmentIndicators,
      visibleChangeTimestamps: testCase.extracted.visibleChangeTimestamps,
    },
    missingOrUnclear: testCase.extracted.missingOrUnclear,
    confidence: testCase.extracted.confidence,
    mergedIntoSessionFacts: merged.facts,
    staysOnlyInConfirmedEvidence: {
      pairingNumber: merged.confirmedEvidence?.[0]?.facts.pairingNumber,
      reportTime: merged.confirmedEvidence?.[0]?.facts.reportTime,
      releaseTime: merged.confirmedEvidence?.[0]?.facts.releaseTime,
      legs: merged.confirmedEvidence?.[0]?.facts.legs,
      originalLegTiming: merged.confirmedEvidence?.[0]?.facts.originalLegTiming,
      changedLegTiming: merged.confirmedEvidence?.[0]?.facts.changedLegTiming,
      missingOrUnclear: merged.confirmedEvidence?.[0]?.facts.missingOrUnclear,
    },
  };
});

const scenarioResults = scenarioCases.map((testCase) => {
  const result = resolveScenarioValidation({
    question: testCase.question,
    facts: testCase.facts,
    governingPacket: testCase.packet,
    matchedInteractionRule: testCase.matchedInteractionRuleId
      ? ({ id: testCase.matchedInteractionRuleId } as { id: string })
      : undefined,
  });

  return {
    test: testCase.label,
    missingGatingFacts: result.missingGatingFacts,
    answerIsConditional: result.answerIsConditional,
    gatingQuestion: result.gatingQuestion?.prompt ?? null,
    finalVisibleBottomLine:
      result.conditionalBottomLine ??
      buildRuleLedBottomLine({
        question: testCase.question,
        facts: testCase.facts,
        governingPacket: testCase.packet,
        preferredShortAnswer: "Rule-led answer available.",
        deterministicShortAnswer: "Rule-led answer available.",
      }),
  };
});

const uxSanityCheck = {
  screenshotReviewCompactAndUsable: true,
  confirmEditRetryRejectObvious: true,
  clarifyingQuestionSeparateFromBottomLine: true,
  stillFeelsLikeOneCopilot: true,
  weakSpots: [
    "The review card is usable, but dense for screenshots with many legs because every leg is currently editable inline.",
    "There is no thumbnail preview rendered yet, even though imagePreviewDataUrl is stored.",
    "Screenshot extraction itself still requires a live model call, so offline validation can only prove the confirmation/merge layer, not OCR quality.",
  ],
};

console.log(
  JSON.stringify(
    {
      screenshotResults,
      scenarioResults,
      uxSanityCheck,
    },
    null,
    2
  )
);
