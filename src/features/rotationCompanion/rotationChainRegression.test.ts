import {
  buildScreenshotUserFacingChain,
  computeSnapshotFromUserFacingChain,
  diagnoseScreenshotRotationPartialStatus,
  extractDeadheadAnnotationsFromScreenshotEvidence,
  normalizeCarrierFlight,
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

function buildFixtureCandidateKey(candidate: {
  date?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  carrier?: string | null;
  flightNumber?: string | null;
  scheduledOut?: string | null;
}) {
  const normalizedFlight = normalizeCarrierFlight(candidate.carrier, candidate.flightNumber);
  const normalizedClock = candidate.scheduledOut?.match(/\b(\d{3,4})\b/)?.[1] ?? candidate.scheduledOut ?? "";
  const normalizedDate =
    candidate.date?.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]?.toUpperCase() ??
    candidate.scheduledOut?.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]?.toUpperCase() ??
    "";
  return [
    normalizedDate,
    (candidate.departureAirport ?? "").toUpperCase(),
    (candidate.arrivalAirport ?? "").toUpperCase(),
    normalizedFlight.carrier,
    normalizedFlight.flightNumber,
    normalizedClock,
  ].join("|");
}

function runFixture(args: RotationChainFixture) {
  const buildModel = () => {
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
      allTripSegments: chain.allTripSegments,
      context: args.context,
    });
    const selectedSeedKeys = new Set(args.selectedSeedChain.map((candidate) => buildFixtureCandidateKey(candidate)));
    const visibleKeys = new Set(chain.userFacingLegs.map((candidate) => buildFixtureCandidateKey(candidate)));
    const discardedFragments = args.selectedSeedChain.filter(
      (candidate) => !visibleKeys.has(buildFixtureCandidateKey(candidate)),
    );
    const unmatchedCandidates = args.builderInputCandidates.filter(
      (candidate) => !selectedSeedKeys.has(buildFixtureCandidateKey(candidate)),
    );
    const deadheadAnnotations = extractDeadheadAnnotationsFromScreenshotEvidence({
      userFacingLegs: chain.userFacingLegs,
      discardedFragments,
      unmatchedCandidates,
      builderInputCandidates: args.builderInputCandidates,
      rotationBase: args.context.base,
    });
    return {
      chain,
      snapshot,
      partialDiagnosis,
      discardedFragments,
      unmatchedCandidates,
      deadheadAnnotations,
    };
  };

  const firstRun = buildModel();
  const secondRun = buildModel();
  assert(
    JSON.stringify({
      allTripSegments: firstRun.chain.allTripSegments,
      visibleOperatingLegs: firstRun.chain.userFacingLegs,
      deadheadAnnotations: firstRun.deadheadAnnotations,
      scheduledBlock: firstRun.snapshot.scheduledBlockMinutes,
      scheduledBlockSource: firstRun.snapshot.scheduledBlockSource,
      partialStatus: firstRun.partialDiagnosis.isPartial,
      partialReason: firstRun.partialDiagnosis.partialReason,
    }) ===
      JSON.stringify({
        allTripSegments: secondRun.chain.allTripSegments,
        visibleOperatingLegs: secondRun.chain.userFacingLegs,
        deadheadAnnotations: secondRun.deadheadAnnotations,
        scheduledBlock: secondRun.snapshot.scheduledBlockMinutes,
        scheduledBlockSource: secondRun.snapshot.scheduledBlockSource,
        partialStatus: secondRun.partialDiagnosis.isPartial,
        partialReason: secondRun.partialDiagnosis.partialReason,
      }),
    `[${args.name}] Expected deterministic repeated output for identical fixture input`,
  );

  const {
    chain,
    snapshot,
    partialDiagnosis,
    discardedFragments,
    unmatchedCandidates,
    deadheadAnnotations,
  } = firstRun;

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
  if (args.expectedFinalArrivalAfterDeadhead) {
    const finalArrivalAfterDeadhead = deadheadAnnotations.at(-1)?.destination ?? snapshot.finalArrival;
    assert(
      finalArrivalAfterDeadhead === args.expectedFinalArrivalAfterDeadhead,
      `[${args.name}] Expected final arrival after DH ${args.expectedFinalArrivalAfterDeadhead}, got ${finalArrivalAfterDeadhead}`,
    );
  }
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
  if (args.expectedDeadheadAnnotations) {
    assert(
      deadheadAnnotations.length === args.expectedDeadheadAnnotations.length,
      `[${args.name}] Expected ${args.expectedDeadheadAnnotations.length} deadhead annotations, got ${deadheadAnnotations.length}`,
    );
    for (const expectedAnnotation of args.expectedDeadheadAnnotations) {
      const matchingAnnotation = deadheadAnnotations.find(
        (annotation) => annotation.cityPair === expectedAnnotation.cityPair,
      );
      assert(
        matchingAnnotation,
        `[${args.name}] Expected deadhead annotation ${expectedAnnotation.cityPair}`,
      );
      if (expectedAnnotation.carrier) {
        assert(
          matchingAnnotation?.carrier === expectedAnnotation.carrier,
          `[${args.name}] Expected ${expectedAnnotation.cityPair} carrier ${expectedAnnotation.carrier}, got ${matchingAnnotation?.carrier}`,
        );
      }
      if (expectedAnnotation.flightNumber) {
        assert(
          String(matchingAnnotation?.flightNumber ?? "") === expectedAnnotation.flightNumber,
          `[${args.name}] Expected ${expectedAnnotation.cityPair} flight ${expectedAnnotation.flightNumber}, got ${matchingAnnotation?.flightNumber}`,
        );
      }
      if (expectedAnnotation.confirmationCode) {
        assert(
          matchingAnnotation?.confirmationCode === expectedAnnotation.confirmationCode,
          `[${args.name}] Expected ${expectedAnnotation.cityPair} confirmation ${expectedAnnotation.confirmationCode}, got ${matchingAnnotation?.confirmationCode}`,
        );
      }
      if (expectedAnnotation.scheduledOut) {
        assert(
          matchingAnnotation?.scheduledOut === expectedAnnotation.scheduledOut,
          `[${args.name}] Expected ${expectedAnnotation.cityPair} scheduledOut ${expectedAnnotation.scheduledOut}, got ${matchingAnnotation?.scheduledOut}`,
        );
      }
      if (expectedAnnotation.marker) {
        assert(
          matchingAnnotation?.marker === expectedAnnotation.marker,
          `[${args.name}] Expected ${expectedAnnotation.cityPair} marker ${expectedAnnotation.marker}, got ${matchingAnnotation?.marker}`,
        );
      }
    }
  }
  if (args.expectedCanonicalCandidateSource) {
    assert(
      chain.canonicalCandidateSource === args.expectedCanonicalCandidateSource,
      `[${args.name}] Expected canonicalCandidateSource ${args.expectedCanonicalCandidateSource}, got ${chain.canonicalCandidateSource}`,
    );
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
        deadheadAnnotations,
      },
      null,
      2,
    ),
  );

  return {
    name: args.name,
    comparisonGroup: args.comparisonGroup,
    allTripSegments: chain.allTripSegments.map((leg) => `${leg.departureAirport ?? "?"}-${leg.arrivalAirport ?? "?"}`),
    visibleOperatingLegs: visibleRoutes,
    deadheadAnnotations: deadheadAnnotations.map((annotation) => ({
      cityPair: annotation.cityPair,
      carrier: annotation.carrier ?? null,
      flightNumber: annotation.flightNumber ?? null,
      confirmationCode: annotation.confirmationCode ?? null,
      marker: annotation.marker ?? null,
    })),
    scheduledBlockMinutes: snapshot.scheduledBlockMinutes,
    scheduledBlockSource: snapshot.scheduledBlockSource,
    finalArrival: snapshot.finalArrival,
    finalArrivalAfterDeadhead: args.expectedFinalArrivalAfterDeadhead
      ? deadheadAnnotations.at(-1)?.destination ?? snapshot.finalArrival
      : snapshot.finalArrival,
  };
}

const comparisonGroups = new Map<string, ReturnType<typeof runFixture>[]>();
for (const fixture of rotationChainFixtures) {
  const result = runFixture(fixture);
  if (result.comparisonGroup) {
    const groupResults = comparisonGroups.get(result.comparisonGroup) ?? [];
    groupResults.push(result);
    comparisonGroups.set(result.comparisonGroup, groupResults);
  }
}

for (const [group, results] of comparisonGroups) {
  if (results.length < 2) {
    continue;
  }
  const [first, ...rest] = results;
  for (const result of rest) {
    assert(
      JSON.stringify({
        allTripSegments: result.allTripSegments,
        visibleOperatingLegs: result.visibleOperatingLegs,
        deadheadAnnotations: result.deadheadAnnotations,
        scheduledBlockMinutes: result.scheduledBlockMinutes,
        scheduledBlockSource: result.scheduledBlockSource,
        finalArrival: result.finalArrival,
        finalArrivalAfterDeadhead: result.finalArrivalAfterDeadhead,
      }) ===
        JSON.stringify({
          allTripSegments: first.allTripSegments,
          visibleOperatingLegs: first.visibleOperatingLegs,
          deadheadAnnotations: first.deadheadAnnotations,
          scheduledBlockMinutes: first.scheduledBlockMinutes,
          scheduledBlockSource: first.scheduledBlockSource,
          finalArrival: first.finalArrival,
          finalArrivalAfterDeadhead: first.finalArrivalAfterDeadhead,
        }),
      `[${group}] Expected paired fixtures to produce identical final display model`,
    );
  }
}
