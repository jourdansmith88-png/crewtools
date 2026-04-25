import { contractScenarioCatalog } from "../../data/contractCopilot/contractScenarioCatalog.ts";
import type {
  CopilotScenarioFamily,
  ParsedScenarioFacts,
  ParsedScenarioResult,
} from "../../types/contractCopilot.ts";

function inferScenario(normalizedQuestion: string): CopilotScenarioFamily | null {
  const mentionsGuarantee =
    normalizedQuestion.includes("minimum daily guarantee") ||
    normalizedQuestion.includes("daily guarantee") ||
    normalizedQuestion.includes("minimum guarantee") ||
    normalizedQuestion.includes("reserve guarantee");
  const mentionsApd =
    /\bapd\b/.test(normalizedQuestion) ||
    normalizedQuestion.includes("authorized personal drop") ||
    /\bpd\b/.test(normalizedQuestion);
  const mentionsGreenslip =
    normalizedQuestion.includes("green slip") ||
    normalizedQuestion.includes("greenslip") ||
    /\bg\/s\b/.test(normalizedQuestion) ||
    /\bgs\b/.test(normalizedQuestion);
  const mentionsQuickSlip =
    normalizedQuestion.includes("quick slip") ||
    normalizedQuestion.includes("quickslip") ||
    normalizedQuestion.includes("q-slip");
  const mentionsInverseAssignment =
    normalizedQuestion.includes("inverse assign") ||
    normalizedQuestion.includes("inverse-assigned") ||
    normalizedQuestion.includes("inverse assignment");

  if (mentionsApd || mentionsGuarantee) {
    return "status_basics";
  }
  if (normalizedQuestion.includes("reroute") || normalizedQuestion.includes("reassign")) {
    return "reroute_reassignment";
  }
  if (
    normalizedQuestion.includes("sick") ||
    normalizedQuestion.includes("leave") ||
    normalizedQuestion.includes("vacation")
  ) {
    return "sick_leave_interaction";
  }
  if (
    mentionsGreenslip ||
    mentionsQuickSlip ||
    mentionsInverseAssignment ||
    normalizedQuestion.includes("pickup") ||
    normalizedQuestion.includes("premium")
  ) {
    return "premium_pickup";
  }
  if (
    normalizedQuestion.includes("cite") ||
    normalizedQuestion.includes("citation") ||
    normalizedQuestion.includes("dispute") ||
    normalizedQuestion.includes("challenge")
  ) {
    return "dispute_citation_helper";
  }
  if (
    normalizedQuestion.includes("reserve") ||
    normalizedQuestion.includes("lineholder") ||
    normalizedQuestion.includes("line holder")
  ) {
    return "status_basics";
  }
  return null;
}

function extractFacts(normalizedQuestion: string): ParsedScenarioFacts {
  const mentionsGuarantee =
    normalizedQuestion.includes("minimum daily guarantee") ||
    normalizedQuestion.includes("daily guarantee") ||
    normalizedQuestion.includes("minimum guarantee") ||
    normalizedQuestion.includes("reserve guarantee");
  const mentionsApd =
    /\bapd\b/.test(normalizedQuestion) ||
    normalizedQuestion.includes("authorized personal drop") ||
    /\bpd\b/.test(normalizedQuestion);
  const mentionsLongCall = normalizedQuestion.includes("long call");
  const mentionsGreenslip =
    normalizedQuestion.includes("green slip") ||
    normalizedQuestion.includes("greenslip") ||
    /\bg\/s\b/.test(normalizedQuestion) ||
    /\bgs\b/.test(normalizedQuestion);
  const mentionsQuickSlip =
    normalizedQuestion.includes("quick slip") ||
    normalizedQuestion.includes("quickslip") ||
    normalizedQuestion.includes("q-slip");
  const mentionsInverseAssignment =
    normalizedQuestion.includes("inverse assign") ||
    normalizedQuestion.includes("inverse-assigned") ||
    normalizedQuestion.includes("inverse assignment");
  const mentionsOverlap =
    normalizedQuestion.includes("same day") ||
    normalizedQuestion.includes("overlap") ||
    normalizedQuestion.includes("overlaps") ||
    normalizedQuestion.includes("overlapping") ||
    mentionsLongCall;
  const explicitPremiumType = mentionsGreenslip
    ? "greenslip"
    : mentionsQuickSlip
      ? "quick_slip"
      : mentionsInverseAssignment
        ? "inverse_assignment"
        : normalizedQuestion.includes("premium") || normalizedQuestion.includes("pickup")
          ? "other_premium_pickup"
          : undefined;

  return {
    status: normalizedQuestion.includes("reserve")
      ? "reserve"
      : normalizedQuestion.includes("lineholder") || normalizedQuestion.includes("line holder")
        ? "lineholder"
        : undefined,
    assignmentType: !mentionsGreenslip && mentionsInverseAssignment
      ? "inverse_assignment"
      : normalizedQuestion.includes("reassign")
        ? "reassignment"
        : mentionsLongCall
          ? "long_call"
          : undefined,
    pickupType: explicitPremiumType,
    premiumType: explicitPremiumType,
    eventTiming:
      normalizedQuestion.includes("same day")
        ? "same_day"
        : mentionsOverlap
          ? "overlap"
          : undefined,
    rerouteOccurred: normalizedQuestion.includes("reroute") ? true : undefined,
    reassignmentOccurred: normalizedQuestion.includes("reassign") ? true : undefined,
    tripTouched:
      normalizedQuestion.includes("trip") || normalizedQuestion.includes("rotation")
        ? true
        : undefined,
    leaveType: normalizedQuestion.includes("vacation")
      ? "vacation"
      : normalizedQuestion.includes("sick")
        ? "sick"
        : normalizedQuestion.includes("leave")
          ? "leave"
          : undefined,
    sickUsed: normalizedQuestion.includes("sick") ? true : undefined,
    sameDayInteraction: mentionsOverlap ? true : undefined,
    questionIntent: normalizedQuestion.includes("cite") || normalizedQuestion.includes("citation")
      ? "citation_help"
      : normalizedQuestion.includes("dispute") || normalizedQuestion.includes("challenge")
        ? "dispute_help"
        : mentionsApd || mentionsGuarantee || normalizedQuestion.includes("minimum")
          ? "can_i"
        : normalizedQuestion.includes("can i")
          ? "can_i"
          : "what_happens",
  };
}

export function parseContractScenario(question: string): ParsedScenarioResult {
  const normalizedQuestion = question.trim().toLowerCase();
  const scenario = inferScenario(normalizedQuestion);
  const extractedFacts = extractFacts(normalizedQuestion);
  const scenarioDefinition = contractScenarioCatalog.find((entry) => entry.id === scenario) ?? null;
  const missingFacts =
    scenarioDefinition?.requiredFacts.filter((fact) => extractedFacts[fact] == null) ?? [];

  return {
    scenario,
    normalizedQuestion,
    extractedFacts,
    missingFacts,
    confidence: scenario ? (missingFacts.length === 0 ? "high" : "medium") : "low",
  };
}
