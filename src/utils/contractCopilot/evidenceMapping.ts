import type {
  ContractCopilotAttachedEvidence,
  ContractCopilotExtractedTripFacts,
  ContractCopilotSession,
  ParsedScenarioFacts,
} from "../../types/contractCopilot";

function parseClockMinutes(value: string | undefined) {
  if (!value) {
    return null;
  }
  const match = value.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

export function buildFactPatchFromTripExtraction(
  extraction: ContractCopilotExtractedTripFacts
): Partial<ParsedScenarioFacts> {
  const hasDeadheadLeg = extraction.legs.some((leg) => leg.legType === "deadhead");
  const hasChangedLegTiming =
    (extraction.changedLegTiming?.length ?? 0) > 0 ||
    extraction.legs.some(
      (leg) =>
        Boolean(leg.changedDepartureTime && leg.changedDepartureTime !== leg.originalDepartureTime) ||
        Boolean(leg.changedArrivalTime && leg.changedArrivalTime !== leg.originalArrivalTime) ||
        Boolean(leg.changeTimestamp)
    );
  const rerouteVisible =
    hasChangedLegTiming || (extraction.rerouteIndicators?.length ?? 0) > 0;
  const reassignmentVisible = (extraction.reassignmentIndicators?.length ?? 0) > 0;
  const reportMinutes = parseClockMinutes(extraction.reportTime);
  const changeMinutes = parseClockMinutes(extraction.visibleChangeTimestamps?.[0]);
  const beforeReport =
    reportMinutes !== null && changeMinutes !== null ? changeMinutes < reportMinutes : undefined;
  const afterReport =
    reportMinutes !== null && changeMinutes !== null ? changeMinutes >= reportMinutes : undefined;

  return {
    tripTouched: extraction.legs.length > 0 || Boolean(extraction.pairingNumber),
    rerouteOccurred: rerouteVisible || undefined,
    reassignmentOccurred: reassignmentVisible || undefined,
    assignmentType: extraction.pairingNumber ? "assigned" : undefined,
    beforeReport,
    afterReport,
    eventTiming:
      extraction.visibleChangeTimestamps && extraction.visibleChangeTimestamps.length > 0
        ? "same_day"
        : undefined,
    questionIntent: rerouteVisible || hasDeadheadLeg ? "what_happens" : undefined,
  };
}

function combineFacts(
  manualFacts: ParsedScenarioFacts | undefined,
  evidence: ContractCopilotAttachedEvidence[] | undefined
) {
  return (evidence ?? [])
    .filter((item) => item.status === "added")
    .reduce<ParsedScenarioFacts>(
      (accumulator, item) => ({
        ...accumulator,
        ...(item.factPatchApplied ?? {}),
      }),
      { ...(manualFacts ?? {}) }
    );
}

export function attachExtractedEvidenceToSession(
  session: ContractCopilotSession,
  evidence: ContractCopilotAttachedEvidence
): ContractCopilotSession {
  const nextEvidence = [...(session.confirmedEvidence ?? []), evidence];
  return {
    ...session,
    confirmedEvidence: nextEvidence,
    facts: combineFacts(session.manualFacts, nextEvidence),
  };
}

export function removeAttachedEvidenceFromSession(
  session: ContractCopilotSession,
  evidenceId: string
): ContractCopilotSession {
  const nextEvidence = (session.confirmedEvidence ?? []).filter((item) => item.id !== evidenceId);
  return {
    ...session,
    confirmedEvidence: nextEvidence,
    facts: combineFacts(session.manualFacts, nextEvidence),
  };
}

export function mergeManualFactsIntoSession(
  session: ContractCopilotSession,
  factPatch: Partial<ParsedScenarioFacts>
): ContractCopilotSession {
  const nextManualFacts = {
    ...(session.manualFacts ?? {}),
    ...factPatch,
  };

  return {
    ...session,
    manualFacts: nextManualFacts,
    facts: combineFacts(nextManualFacts, session.confirmedEvidence),
  };
}
