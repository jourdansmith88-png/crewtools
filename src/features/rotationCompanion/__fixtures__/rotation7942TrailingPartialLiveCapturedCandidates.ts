import type { RotationChainCandidate, RotationChainLeg } from "../rotationChainBuilder";

export const rotation7942TrailingPartialLiveCapturedContext = {
  base: "SLC",
  layoverCities: ["LGA"],
  startDate: undefined,
  endDate: undefined,
} as const;

export const rotation7942TrailingPartialLiveCapturedHeader = {
  rotationNumber: "7942",
  tripDates: "TBD",
  totalCreditMinutes: 0,
  totalScheduledBlockMinutes: 0,
} as const;

export const rotation7942TrailingPartialLiveCapturedExpectedUserFacingRoutes = [
  "DEN-LGA",
  "LGA-DFW",
  "DFW-SLC",
] as const;

export const rotation7942TrailingPartialLiveCapturedBuilderInputCandidates: RotationChainCandidate[] = [
  {
    sourceScreenshotIndex: 0,
    date: "20APR",
    flightNumber: "DL2502",
    carrier: "DL",
    departureAirport: "DEN",
    arrivalAirport: "LGA",
    scheduledOut: "2335 20APR",
    scheduledIn: "0513 21APR",
    scheduledBlock: "3:38",
    turn: "2:17",
    rawSourceLine: "DL2502 DEN-LGA 2335 20APR 0513 21APR Blk 3:38",
    sourceText: "DL2502 : DEN-LGA Dep- 2335 20APR Arr- 0513 21APR Blk- 3:38",
  },
  {
    sourceScreenshotIndex: 0,
    date: "20APR",
    flightNumber: "DL2502",
    carrier: "DL",
    departureAirport: "DEN",
    arrivalAirport: "LGA",
    scheduledOut: "2335",
    scheduledIn: null,
    scheduledBlock: null,
    turn: null,
    rawSourceLine: "DL2502 DEN-LGA 2335 partial",
    sourceText: "DL2502 : DEN-LGA Dep- 2335",
  },
  {
    sourceScreenshotIndex: 1,
    date: "21APR",
    flightNumber: "DL1532",
    carrier: "DL",
    departureAirport: "LGA",
    arrivalAirport: "DFW",
    scheduledOut: "0730 21APR",
    scheduledIn: "1119 21APR",
    scheduledBlock: "3:34",
    turn: null,
    rawSourceLine: "DL1532 LGA-DFW 0730 21APR 1119 21APR Blk 3:34",
    sourceText: "DL1532 : LGA-DFW Dep- 0730 21APR Arr- 1119 21APR Blk- 3:34",
  },
  {
    sourceScreenshotIndex: 1,
    date: null,
    flightNumber: "DL1532",
    carrier: "DL",
    departureAirport: "LGA",
    arrivalAirport: "DFW",
    scheduledOut: "0730",
    scheduledIn: null,
    scheduledBlock: null,
    turn: null,
    rawSourceLine: "DL1532 LGA-DFW 0730 partial",
    sourceText: "DL1532 : LGA-DFW Dep- 0730",
  },
  {
    sourceScreenshotIndex: 2,
    date: "21APR",
    flightNumber: "DL891",
    carrier: "DL",
    departureAirport: "DFW",
    arrivalAirport: "SLC",
    scheduledOut: "1133 21APR",
    scheduledIn: "1323 21APR",
    scheduledBlock: "2:52",
    turn: null,
    rawSourceLine: "DL891 DFW-SLC 1133 21APR 1323 21APR Blk 2:52",
    sourceText: "DL891 : DFW-SLC Dep- 1133 21APR Arr- 1323 21APR Blk- 2:52",
  },
  {
    sourceScreenshotIndex: 2,
    date: null,
    flightNumber: "DL891",
    carrier: "DL",
    departureAirport: "DFW",
    arrivalAirport: "SLC",
    scheduledOut: "1133",
    scheduledIn: null,
    scheduledBlock: null,
    turn: null,
    rawSourceLine: "DL891 DFW-SLC 1133 partial",
    sourceText: "DL891 : DFW-SLC Dep- 1133",
  },
];

export const rotation7942TrailingPartialLiveCapturedSelectedSeedChain: RotationChainLeg[] = [
  {
    index: 1,
    ...rotation7942TrailingPartialLiveCapturedBuilderInputCandidates[0],
  },
  {
    index: 2,
    ...rotation7942TrailingPartialLiveCapturedBuilderInputCandidates[2],
  },
  {
    index: 3,
    ...rotation7942TrailingPartialLiveCapturedBuilderInputCandidates[4],
  },
];
