import { buildRuleLedBottomLine, resolveScenarioValidation } from "../server/routes/ai/contractCopilotRoute.ts";
import { buildFactPatchFromTripExtraction, mergeConfirmedExtractionIntoSession } from "../src/utils/contractCopilot/evidenceMapping.ts";
import type {
  ContractCopilotExtractedTripFacts,
  ContractCopilotPendingExtractionReview,
  ContractCopilotSession,
} from "../src/types/contractCopilot.ts";
import type { SectionAwareGroundingPacket } from "../src/ai/retrieval/types.ts";

const initialSession: ContractCopilotSession = {
  sessionId: "ui-validation-session",
  facts: {},
  clarificationCount: 0,
  turns: [],
  status: "idle",
};

function makePacket(args: {
  section: string;
  title?: string;
  content: string;
}): SectionAwareGroundingPacket {
  return {
    id: `packet-${args.section}`,
    sourceLabel: "PWA",
    tier: "pwa",
    section: args.section,
    title: args.title,
    packetType: "governing_section",
    content: args.content,
    pages: [1],
    matchedTerms: [],
    crossRefsFollowed: [],
    usedSectionExpansion: true,
    relevanceScore: 100,
  };
}

function makeReview(sourceName: string, facts: ContractCopilotExtractedTripFacts): ContractCopilotPendingExtractionReview {
  return {
    id: `review-${sourceName}`,
    evidenceType: "trip_screenshot",
    sourceName,
    extractedAtIso: new Date().toISOString(),
    facts,
    suggestedFactPatch: buildFactPatchFromTripExtraction(facts),
    status: "needs_confirmation",
  };
}

function validateScreenshotFlow(args: {
  label: string;
  question: string;
  extractedFacts: ContractCopilotExtractedTripFacts;
  governingPacket: SectionAwareGroundingPacket;
  matchedInteractionRuleId?: string;
}) {
  const review = makeReview(args.label, args.extractedFacts);
  const reviewAppears = review.status === "needs_confirmation";
  const mergedSession = mergeConfirmedExtractionIntoSession(initialSession, review);
  const validation = resolveScenarioValidation({
    question: args.question,
    facts: mergedSession.facts,
    governingPacket: args.governingPacket,
    matchedInteractionRule: args.matchedInteractionRuleId
      ? ({ id: args.matchedInteractionRuleId } as { id: string })
      : undefined,
  });
  const finalVisibleAnswer =
    validation.conditionalBottomLine ??
    buildRuleLedBottomLine({
      question: args.question,
      facts: mergedSession.facts,
      governingPacket: args.governingPacket,
      preferredShortAnswer: "Rule-led answer available.",
      deterministicShortAnswer: "Rule-led answer available.",
    });

  return {
    label: args.label,
    reviewAppears,
    confirmFactsWorks: mergedSession.confirmedEvidence?.length === 1,
    extractedFacts: {
      summary: review.facts.summary,
      pairingNumber: review.facts.pairingNumber,
      reportTime: review.facts.reportTime,
      releaseTime: review.facts.releaseTime,
      visibleChangeTimestamps: review.facts.visibleChangeTimestamps,
      rerouteIndicators: review.facts.rerouteIndicators,
      reassignmentIndicators: review.facts.reassignmentIndicators,
      legs: review.facts.legs,
      missingOrUnclear: review.facts.missingOrUnclear,
      confidence: review.facts.confidence,
    },
    derivedSessionFacts: mergedSession.facts,
    missingGatingFacts: validation.missingGatingFacts,
    gatingQuestion: validation.gatingQuestion?.prompt ?? null,
    answerIsConditional: validation.answerIsConditional,
    finalVisibleAnswer,
  };
}

const results = [
  validateScreenshotFlow({
    label: "Screenshot reroute with report + change timestamp",
    question:
      "I got a trip assigned on reserve leg one was a deadhead, on the drive to the airport they changed leg one to a later deadhead does this trigger reroute pay?",
    extractedFacts: {
      summary: "Reserve trip with deadhead first leg changed before report while driving to the airport.",
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
          notes: "Change time visible before report",
        },
      ],
      missingOrUnclear: [],
      confidence: "high",
    },
    governingPacket: makePacket({
      section: "Section 23 K",
      title: "Reroute / reassignment",
      content:
        "Reroute and reassignment analysis turns on the original versus changed sequence and whether the change happened before or after report, with related pay under Section 4 F.",
    }),
    matchedInteractionRuleId: "reroute_timing_and_pay_impact",
  }),
  validateScreenshotFlow({
    label: "Screenshot GS + long call with missing 18-hour fact",
    question:
      "on reserve i got a 3 day greenslip day one and 2 are off days and day 3 is Long Call day, how should this pay?",
    extractedFacts: {
      summary: "Three-day Greenslip on reserve with long-call overlap on day 3.",
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
          notes: "First attempted contact time not visible",
        },
      ],
      missingOrUnclear: ["First attempted contact time for the long-call day"],
      confidence: "medium",
    },
    governingPacket: makePacket({
      section: "Section 23 Q",
      title: "Long-call Greenslip carveout",
      content:
        "A long call reserve pilot who is awarded a GS rotation with a report that is within 18 hours of the first attempted contact will receive single pay, no credit for the first duty period of the rotation.",
    }),
    matchedInteractionRuleId: "greenslip_overlapping_reserve_day",
  }),
  validateScreenshotFlow({
    label: "Screenshot sick + pickup with missing overlap fact",
    question: "I called in sick and then picked up a Greenslip. How does that pay?",
    extractedFacts: {
      summary: "Sick notation and later pickup visible in the same week, but sequence relationship is unclear.",
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
          notes: "Overlap vs sequence not visible",
        },
      ],
      missingOrUnclear: ["Whether the pickup overlapped the sick day or started after sick cleared"],
      confidence: "medium",
    },
    governingPacket: makePacket({
      section: "Section 14 E",
      title: "Sick leave interaction",
      content:
        "Sick leave interaction depends on whether the pickup overlaps the sick day or occurs after the sick period has ended.",
    }),
  }),
];

console.log(JSON.stringify(results, null, 2));
