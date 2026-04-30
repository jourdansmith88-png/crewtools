import {
  buildScreenshotUserFacingChain,
  computeSnapshotFromUserFacingChain,
} from "./rotationChainBuilder.ts";
import {
  rotation0983AllCandidates,
  rotation0983Context,
  rotation0983ExpectedUserFacingRoutes,
  rotation0983Header,
  rotation0983RawFinalOrderedChain,
} from "./__fixtures__/rotation0983ScreenshotCandidates.ts";
import {
  rotation0983LiveCapturedBuilderInputCandidates,
  rotation0983LiveCapturedContext,
  rotation0983LiveCapturedExpectedUserFacingRoutes,
  rotation0983LiveCapturedHeader,
  rotation0983LiveCapturedSelectedSeedChain,
} from "./__fixtures__/rotation0983LiveCapturedCandidates.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runFixture(args: {
  name: string;
  rawFinalOrderedChain: typeof rotation0983RawFinalOrderedChain;
  legCandidates: typeof rotation0983AllCandidates;
  context: typeof rotation0983Context;
  expectedRoutes: readonly string[];
  headerScheduledBlockMinutes: number;
}) {
  const chain = buildScreenshotUserFacingChain({
    rawFinalOrderedChain: args.rawFinalOrderedChain,
    legCandidates: args.legCandidates,
    context: args.context,
  });

  const snapshot = computeSnapshotFromUserFacingChain({
    userFacingLegs: chain.userFacingLegs,
    headerScheduledBlockMinutes: args.headerScheduledBlockMinutes,
    fallbackScheduledBlockMinutes: 0,
    finalArrivalFallback: "TBD",
  });

  const visibleRoutes = chain.userFacingLegs.map(
    (leg) => `${leg.departureAirport ?? "?"}-${leg.arrivalAirport ?? "?"}`,
  );

  assert(chain.userFacingLegs.length === 9, `[${args.name}] Expected 9 user-facing legs, got ${chain.userFacingLegs.length}`);
  assert(visibleRoutes[0] === "SLC-DTW", `[${args.name}] Expected first leg SLC-DTW, got ${visibleRoutes[0]}`);
  assert(visibleRoutes.at(-1) === "SAT-SLC", `[${args.name}] Expected last leg SAT-SLC, got ${visibleRoutes.at(-1)}`);
  assert(snapshot.finalArrival === "SLC", `[${args.name}] Expected final arrival SLC, got ${snapshot.finalArrival}`);
  assert(
    JSON.stringify(visibleRoutes) === JSON.stringify(args.expectedRoutes),
    `[${args.name}] Expected exact visible chain ${args.expectedRoutes.join(" -> ")}, got ${visibleRoutes.join(" -> ")}`,
  );
  assert(
    !visibleRoutes.slice(args.expectedRoutes.length).length,
    `[${args.name}] Expected no visible legs after SAT-SLC`,
  );
  assert(
    snapshot.scheduledBlockSource === "header",
    `[${args.name}] Expected scheduledBlockSource header, got ${snapshot.scheduledBlockSource}`,
  );
  assert(
    snapshot.scheduledBlockMinutes === args.headerScheduledBlockMinutes,
    `[${args.name}] Expected header scheduled block ${args.headerScheduledBlockMinutes}, got ${snapshot.scheduledBlockMinutes}`,
  );
  assert(
    snapshot.nextFlightCityPair === "SLC-DTW",
    `[${args.name}] Expected next flight SLC-DTW, got ${snapshot.nextFlightCityPair}`,
  );
  assert(
    chain.discardedAfterTerminal >= 0,
    `[${args.name}] Expected discardedAfterTerminal to be defined`,
  );

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
        scheduledBlockMinutes: snapshot.scheduledBlockMinutes,
        scheduledBlockSource: snapshot.scheduledBlockSource,
        nextFlightCityPair: snapshot.nextFlightCityPair,
      },
      null,
      2,
    ),
  );
}

runFixture({
  name: "rotation0983 ideal fixture",
  rawFinalOrderedChain: rotation0983RawFinalOrderedChain,
  legCandidates: rotation0983AllCandidates,
  context: rotation0983Context,
  expectedRoutes: rotation0983ExpectedUserFacingRoutes,
  headerScheduledBlockMinutes: rotation0983Header.totalScheduledBlockMinutes,
});

runFixture({
  name: "rotation0983 live-captured fixture",
  rawFinalOrderedChain: rotation0983LiveCapturedSelectedSeedChain,
  legCandidates: rotation0983LiveCapturedBuilderInputCandidates,
  context: rotation0983LiveCapturedContext,
  expectedRoutes: rotation0983LiveCapturedExpectedUserFacingRoutes,
  headerScheduledBlockMinutes: rotation0983LiveCapturedHeader.totalScheduledBlockMinutes,
});
