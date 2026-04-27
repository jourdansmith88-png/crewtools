import { verifyContractScenarioAnswer } from "../workflows/contractCopilot/answerVerifier.ts";
import type { VerifyToolAnswerInput, VerifyToolAnswerOutput } from "./types.ts";

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function verifyToolAnswer(input: VerifyToolAnswerInput): VerifyToolAnswerOutput {
  const pwaSectionsUsed = input.supportCards
    .filter((card) => card.sourceName === "PWA")
    .map((card) => card.section);
  const compensationChunksUsed = input.supportCards
    .filter((card) => card.sourceName === "Compensation Manual")
    .map((card) => card.section);
  const schedulerChunksUsed = input.supportCards
    .filter((card) => card.sourceName === "Scheduler Manual")
    .map((card) => card.section);
  const verifierResult = verifyContractScenarioAnswer({
    question: input.question,
    selectedLane: "contract_scenario_retrieval",
    answer: input.proposedAnswer,
    hasPwaIndex: pwaSectionsUsed.length > 0,
    hasCompensationIndex: compensationChunksUsed.length > 0,
    hasSchedulerIndex: schedulerChunksUsed.length > 0,
    sourcesUsed: dedupeStrings(input.supportCards.map((card) => card.sourceName)),
    pwaSectionsUsed,
    compensationChunksUsed,
    schedulerChunksUsed,
    missingSourceWarnings: [],
  });

  return {
    trustLevel: verifierResult.verifierPassed
      ? "resolved"
      : verifierResult.strongClaimsDowngraded.length > 0 || verifierResult.verifierFailureReasons.length > 0
        ? "warning"
        : "caution",
    truthGuardNotes: dedupeStrings([
      ...verifierResult.verifierWarnings,
      ...verifierResult.strongClaimsDowngraded.map((item) => `Downgraded unsupported claim: ${item}`),
    ]),
    unsupportedClaims: verifierResult.strongClaimsDetected.filter(
      (claim) => !verifierResult.strongClaimsSupported.includes(claim),
    ),
    missingFacts: [],
    finalSafetyNotes: dedupeStrings([
      ...verifierResult.verifierFailureReasons,
      ...(verifierResult.definitionOverrodeOperation
        ? ["Definition text did not fully support the operational application in the proposed answer."]
        : []),
    ]),
    verifierResult,
  };
}
