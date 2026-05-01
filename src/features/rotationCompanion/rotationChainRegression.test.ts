import {
  buildScreenshotUserFacingChain,
  computeSnapshotFromUserFacingChain,
  diagnoseScreenshotRotationPartialStatus,
} from "./rotationChainBuilder.ts";
import {
  rotationChainFixtures,
  type RotationChainFixture,
} from "./__fixtures__/rotationChainFixtures.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runFixture(args: RotationChainFixture) {
  const chain = buildScreenshotUserFacingChain({
    rawFinalOrderedChain: args.selectedSeedChain,
    legCandidates: args.builderInputCandidates,
    context: args.context,
  });

  const snapshot = computeSnapshotFromUserFacingChain({
    userFacingLegs: chain.userFacingLegs,
    headerScheduledBlockMinutes: args.headerScheduledBlockMinutes,
    fallbackScheduledBlockMinutes: 0,
    finalArrivalFallback: "TBD",
  });
  const partialDiagnosis = diagnoseScreenshotRotationPartialStatus({
    userFacingLegs: chain.userFacingLegs,
    context: args.context,
  });

  const visibleRoutes = chain.userFacingLegs.map(
    (leg) => `${leg.departureAirport ?? "?"}-${leg.arrivalAirport ?? "?"}`,
  );
  const dedupedVisibleRoutes = Array.from(new Set(visibleRoutes));

  assert(
    chain.userFacingLegs.length === args.expectedUserFacingCityPairs.length,
    `[${args.name}] Expected ${args.expectedUserFacingCityPairs.length} user-facing legs, got ${chain.userFacingLegs.length}`,
  );
  assert(
    visibleRoutes[0] === args.expectedFirstLeg,
    `[${args.name}] Expected first leg ${args.expectedFirstLeg}, got ${visibleRoutes[0]}`,
  );
  assert(
    visibleRoutes.at(-1) === args.expectedLastLeg,
    `[${args.name}] Expected last leg ${args.expectedLastLeg}, got ${visibleRoutes.at(-1)}`,
  );
  assert(
    snapshot.finalArrival === args.expectedFinalArrival,
    `[${args.name}] Expected final arrival ${args.expectedFinalArrival}, got ${snapshot.finalArrival}`,
  );
  assert(
    JSON.stringify(visibleRoutes) === JSON.stringify(args.expectedUserFacingCityPairs),
    `[${args.name}] Expected exact visible chain ${args.expectedUserFacingCityPairs.join(" -> ")}, got ${visibleRoutes.join(" -> ")}`,
  );
  assert(
    !visibleRoutes.slice(args.expectedUserFacingCityPairs.length).length,
    `[${args.name}] Expected no visible legs after ${args.expectedLastLeg}`,
  );
  assert(
    dedupedVisibleRoutes.length === visibleRoutes.length,
    `[${args.name}] Expected no duplicate visible legs, got ${visibleRoutes.join(" -> ")}`,
  );
  for (const excludedCityPair of args.expectedExcludedCityPairs ?? []) {
    assert(
      !visibleRoutes.includes(excludedCityPair),
      `[${args.name}] Expected ${excludedCityPair} to stay out of visible output, got ${visibleRoutes.join(" -> ")}`,
    );
  }
  for (const evidenceCandidate of args.expectedEvidenceCandidates ?? []) {
    const matchingCandidate = args.builderInputCandidates.find(
      (candidate) =>
        `${candidate.departureAirport ?? "?"}-${candidate.arrivalAirport ?? "?"}` === evidenceCandidate.cityPair,
    );
    assert(
      matchingCandidate,
      `[${args.name}] Expected evidence candidate ${evidenceCandidate.cityPair} in builder input`,
    );
    if (evidenceCandidate.sourceTextIncludes) {
      assert(
        (matchingCandidate?.sourceText ?? "").includes(evidenceCandidate.sourceTextIncludes),
        `[${args.name}] Expected ${evidenceCandidate.cityPair} sourceText to include ${evidenceCandidate.sourceTextIncludes}`,
      );
    }
    if (evidenceCandidate.mustExistInSelectedSeedChain) {
      const seedMatch = args.selectedSeedChain.find(
        (candidate) =>
          `${candidate.departureAirport ?? "?"}-${candidate.arrivalAirport ?? "?"}` === evidenceCandidate.cityPair,
      );
      assert(
        seedMatch,
        `[${args.name}] Expected ${evidenceCandidate.cityPair} to remain present in selected seed chain as future-DH evidence`,
      );
    }
  }
  if (args.expectedScheduledBlockSource) {
    assert(
      snapshot.scheduledBlockSource === args.expectedScheduledBlockSource,
      `[${args.name}] Expected scheduledBlockSource ${args.expectedScheduledBlockSource}, got ${snapshot.scheduledBlockSource}`,
    );
  }
  assert(
    snapshot.scheduledBlockMinutes === args.expectedScheduledBlockMinutes,
    `[${args.name}] Expected scheduled block ${args.expectedScheduledBlockMinutes}, got ${snapshot.scheduledBlockMinutes}`,
  );
  assert(
    snapshot.nextFlightCityPair === args.expectedFirstLeg,
    `[${args.name}] Expected next flight ${args.expectedFirstLeg}, got ${snapshot.nextFlightCityPair}`,
  );
  assert(
    chain.discardedAfterTerminal >= 0,
    `[${args.name}] Expected discardedAfterTerminal to be defined`,
  );
  if (typeof args.expectedDiscardedAfterTerminal === "number") {
    assert(
      chain.discardedAfterTerminal === args.expectedDiscardedAfterTerminal,
      `[${args.name}] Expected discardedAfterTerminal ${args.expectedDiscardedAfterTerminal}, got ${chain.discardedAfterTerminal}`,
    );
  }
  if (typeof args.expectedPartialStatus === "boolean") {
    assert(
      partialDiagnosis.isPartial === args.expectedPartialStatus,
      `[${args.name}] Expected partial status ${args.expectedPartialStatus}, got ${partialDiagnosis.isPartial}`,
    );
  }
  if (args.expectedPartialStatus) {
    assert(
      partialDiagnosis.partialReason,
      `[${args.name}] Expected a partial reason when partial status is true`,
    );
  }
  if (args.expectedPartialReasonIncludes) {
    assert(
      (partialDiagnosis.partialReason ?? "").includes(args.expectedPartialReasonIncludes),
      `[${args.name}] Expected partial reason to include ${args.expectedPartialReasonIncludes}, got ${partialDiagnosis.partialReason ?? "null"}`,
    );
  }

  console.log(`${args.name} passed`);
  console.log(`${args.name} userFacingLegs:`, visibleRoutes.join(" | "));
  console.log(
    `${args.name} snapshot:`,
    JSON.stringify(
      {
        userFacingLegsCount: chain.userFacingLegs.length,
        firstLeg: visibleRoutes[0],
        lastLeg: visibleRoutes.at(-1),
        finalArrival: snapshot.finalArrival,
        partialStatus: partialDiagnosis.isPartial,
        partialReason: partialDiagnosis.partialReason,
        scheduledBlockMinutes: snapshot.scheduledBlockMinutes,
        scheduledBlockSource: snapshot.scheduledBlockSource,
        nextFlightCityPair: snapshot.nextFlightCityPair,
      },
      null,
      2,
    ),
  );
}

for (const fixture of rotationChainFixtures) {
  runFixture(fixture);
}
