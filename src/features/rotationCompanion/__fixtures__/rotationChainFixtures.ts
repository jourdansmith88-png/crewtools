import {
  rotation0983AllCandidates,
  rotation0983Context,
  rotation0983ExpectedUserFacingRoutes,
  rotation0983Header,
  rotation0983RawFinalOrderedChain,
} from "./rotation0983ScreenshotCandidates.ts";
import {
  rotation0983LiveCapturedBuilderInputCandidates,
  rotation0983LiveCapturedContext,
  rotation0983LiveCapturedExpectedUserFacingRoutes,
  rotation0983LiveCapturedHeader,
  rotation0983LiveCapturedSelectedSeedChain,
} from "./rotation0983LiveCapturedCandidates.ts";
import {
  rotation0118LiveCapturedBuilderInputCandidates,
  rotation0118LiveCapturedContext,
  rotation0118LiveCapturedExpectedUserFacingRoutes,
  rotation0118LiveCapturedHeader,
  rotation0118LiveCapturedSelectedSeedChain,
} from "./rotation0118LiveCapturedCandidates.ts";
import {
  rotation7942LiveCapturedBuilderInputCandidates,
  rotation7942LiveCapturedContext,
  rotation7942LiveCapturedExpectedUserFacingRoutes,
  rotation7942LiveCapturedHeader,
  rotation7942LiveCapturedSelectedSeedChain,
} from "./rotation7942LiveCapturedCandidates.ts";
import {
  rotation7942PartialLiveCapturedBuilderInputCandidates,
  rotation7942PartialLiveCapturedContext,
  rotation7942PartialLiveCapturedExpectedUserFacingRoutes,
  rotation7942PartialLiveCapturedHeader,
  rotation7942PartialLiveCapturedSelectedSeedChain,
} from "./rotation7942PartialLiveCapturedCandidates.ts";
import {
  rotation7942TrailingPartialLiveCapturedBuilderInputCandidates,
  rotation7942TrailingPartialLiveCapturedContext,
  rotation7942TrailingPartialLiveCapturedExpectedUserFacingRoutes,
  rotation7942TrailingPartialLiveCapturedHeader,
  rotation7942TrailingPartialLiveCapturedSelectedSeedChain,
} from "./rotation7942TrailingPartialLiveCapturedCandidates.ts";

export type RotationChainFixture = {
  name: string;
  rotationNumber: string;
  tripDates: string;
  builderInputCandidates: typeof rotation0983AllCandidates;
  selectedSeedChain: typeof rotation0983RawFinalOrderedChain;
  expectedUserFacingCityPairs: readonly string[];
  expectedFinalArrival: string;
  expectedFirstLeg: string;
  expectedLastLeg: string;
  expectedScheduledBlockMinutes: number;
  expectedScheduledBlockSource?: "header" | "computedFromUserFacingLegs" | "fallback";
  expectedPartialStatus?: boolean;
  expectedPartialReasonIncludes?: string;
  headerScheduledBlockMinutes: number;
  context: typeof rotation0983Context;
  expectedDiscardedAfterTerminal?: number;
  expectedExcludedCityPairs?: readonly string[];
  expectedEvidenceCandidates?: ReadonlyArray<{
    cityPair: string;
    sourceTextIncludes?: string;
    mustExistInSelectedSeedChain?: boolean;
  }>;
  expectedDeadheadAnnotations?: ReadonlyArray<{
    cityPair: string;
    carrier?: string;
    flightNumber?: string;
    confirmationCode?: string;
  }>;
};

export const rotationChainFixtures: RotationChainFixture[] = [
  {
    name: "rotation0983 ideal fixture",
    rotationNumber: rotation0983Header.rotationNumber,
    tripDates: rotation0983Header.tripDates,
    builderInputCandidates: rotation0983AllCandidates,
    selectedSeedChain: rotation0983RawFinalOrderedChain,
    expectedUserFacingCityPairs: rotation0983ExpectedUserFacingRoutes,
    expectedFinalArrival: "SLC",
    expectedFirstLeg: "SLC-DTW",
    expectedLastLeg: "SAT-SLC",
    expectedScheduledBlockMinutes: rotation0983Header.totalScheduledBlockMinutes,
    expectedScheduledBlockSource: "header",
    expectedPartialStatus: false,
    headerScheduledBlockMinutes: rotation0983Header.totalScheduledBlockMinutes,
    context: rotation0983Context,
  },
  {
    name: "rotation0983 live-captured fixture",
    rotationNumber: rotation0983LiveCapturedHeader.rotationNumber,
    tripDates: rotation0983LiveCapturedHeader.tripDates,
    builderInputCandidates: rotation0983LiveCapturedBuilderInputCandidates,
    selectedSeedChain: rotation0983LiveCapturedSelectedSeedChain,
    expectedUserFacingCityPairs: rotation0983LiveCapturedExpectedUserFacingRoutes,
    expectedFinalArrival: "SLC",
    expectedFirstLeg: "SLC-DTW",
    expectedLastLeg: "SAT-SLC",
    expectedScheduledBlockMinutes: rotation0983LiveCapturedHeader.totalScheduledBlockMinutes,
    expectedScheduledBlockSource: "header",
    expectedPartialStatus: false,
    headerScheduledBlockMinutes: rotation0983LiveCapturedHeader.totalScheduledBlockMinutes,
    context: rotation0983LiveCapturedContext,
  },
  {
    name: "rotation0118 live-captured fixture",
    rotationNumber: rotation0118LiveCapturedHeader.rotationNumber,
    tripDates: rotation0118LiveCapturedHeader.tripDates,
    builderInputCandidates: rotation0118LiveCapturedBuilderInputCandidates,
    selectedSeedChain: rotation0118LiveCapturedSelectedSeedChain,
    expectedUserFacingCityPairs: rotation0118LiveCapturedExpectedUserFacingRoutes,
    expectedFinalArrival: "SNA",
    expectedFirstLeg: "SLC-DFW",
    expectedLastLeg: "SEA-SNA",
    expectedScheduledBlockMinutes: 589,
    expectedScheduledBlockSource: "computedFromUserFacingLegs",
    expectedPartialStatus: true,
    expectedPartialReasonIncludes: "does not return to base",
    headerScheduledBlockMinutes: rotation0118LiveCapturedHeader.totalScheduledBlockMinutes,
    context: rotation0118LiveCapturedContext,
    expectedExcludedCityPairs: ["BUR-SLC"],
    expectedEvidenceCandidates: [
      {
        cityPair: "BUR-SLC",
        sourceTextIncludes: "Confirmation #JLLX3I",
        mustExistInSelectedSeedChain: true,
      },
    ],
    expectedDeadheadAnnotations: [
      {
        cityPair: "BUR-SLC",
        carrier: "DL",
        flightNumber: "828",
        confirmationCode: "JLLX3I",
      },
    ],
  },
  {
    name: "rotation7942 live-captured fixture",
    rotationNumber: rotation7942LiveCapturedHeader.rotationNumber,
    tripDates: rotation7942LiveCapturedHeader.tripDates,
    builderInputCandidates: rotation7942LiveCapturedBuilderInputCandidates,
    selectedSeedChain: rotation7942LiveCapturedSelectedSeedChain,
    expectedUserFacingCityPairs: rotation7942LiveCapturedExpectedUserFacingRoutes,
    expectedFinalArrival: "SLC",
    expectedFirstLeg: "SLC-SMF",
    expectedLastLeg: "DFW-SLC",
    expectedScheduledBlockMinutes: 876,
    expectedScheduledBlockSource: "computedFromUserFacingLegs",
    expectedPartialStatus: false,
    headerScheduledBlockMinutes: rotation7942LiveCapturedHeader.totalScheduledBlockMinutes,
    context: rotation7942LiveCapturedContext,
  },
  {
    name: "rotation7942 partial live-captured fixture",
    rotationNumber: rotation7942PartialLiveCapturedHeader.rotationNumber,
    tripDates: rotation7942PartialLiveCapturedHeader.tripDates,
    builderInputCandidates: rotation7942PartialLiveCapturedBuilderInputCandidates,
    selectedSeedChain: rotation7942PartialLiveCapturedSelectedSeedChain,
    expectedUserFacingCityPairs: rotation7942PartialLiveCapturedExpectedUserFacingRoutes,
    expectedFinalArrival: "DFW",
    expectedFirstLeg: "SLC-SMF",
    expectedLastLeg: "LGA-DFW",
    expectedScheduledBlockMinutes: 719,
    expectedScheduledBlockSource: "computedFromUserFacingLegs",
    expectedPartialStatus: true,
    expectedPartialReasonIncludes: "does not return to base",
    headerScheduledBlockMinutes: rotation7942PartialLiveCapturedHeader.totalScheduledBlockMinutes,
    context: rotation7942PartialLiveCapturedContext,
    expectedDiscardedAfterTerminal: 0,
  },
  {
    name: "rotation7942 trailing partial live-captured fixture",
    rotationNumber: rotation7942TrailingPartialLiveCapturedHeader.rotationNumber,
    tripDates: rotation7942TrailingPartialLiveCapturedHeader.tripDates,
    builderInputCandidates: rotation7942TrailingPartialLiveCapturedBuilderInputCandidates,
    selectedSeedChain: rotation7942TrailingPartialLiveCapturedSelectedSeedChain,
    expectedUserFacingCityPairs: rotation7942TrailingPartialLiveCapturedExpectedUserFacingRoutes,
    expectedFinalArrival: "SLC",
    expectedFirstLeg: "DEN-LGA",
    expectedLastLeg: "DFW-SLC",
    expectedScheduledBlockMinutes: 604,
    expectedScheduledBlockSource: "computedFromUserFacingLegs",
    expectedPartialStatus: true,
    expectedPartialReasonIncludes: "starts mid-rotation",
    headerScheduledBlockMinutes: rotation7942TrailingPartialLiveCapturedHeader.totalScheduledBlockMinutes,
    context: rotation7942TrailingPartialLiveCapturedContext,
    expectedDiscardedAfterTerminal: 0,
  },
];
