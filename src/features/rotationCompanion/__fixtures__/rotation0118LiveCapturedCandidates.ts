import type { RotationChainCandidate, RotationChainLeg } from "../rotationChainBuilder";

export const rotation0118LiveCapturedContext = {
  base: "SLC",
  layoverCities: ["DFW", "SNA"],
  startDate: "02MAY",
  endDate: "04MAY",
} as const;

export const rotation0118LiveCapturedHeader = {
  rotationNumber: "0118",
  tripDates: "02MAY - 04MAY",
  totalCreditMinutes: 15 * 60 + 45,
  totalScheduledBlockMinutes: 0,
} as const;

export const rotation0118LiveCapturedExpectedUserFacingRoutes = [
  "SLC-DFW",
  "DFW-SEA",
  "SEA-SNA",
] as const;

export const rotation0118LiveCapturedBuilderInputCandidates: RotationChainCandidate[] = [
  {
    sourceScreenshotIndex: 0,
    date: "02MAY",
    flightNumber: "DL2287",
    carrier: "DL",
    departureAirport: "SLC",
    arrivalAirport: "DFW",
    scheduledOut: "0915 02MAY",
    scheduledIn: "1240 02MAY",
    scheduledBlock: "2:25",
    turn: "18:10",
    rawSourceLine: "DL2287 SLC-DFW 0915 02MAY 1240 02MAY Blk 2:25",
    sourceText: "DL2287 : SLC-DFW Dep- 0915 02MAY Arr- 1240 02MAY Blk- 2:25",
  },
  {
    sourceScreenshotIndex: 1,
    date: "03MAY",
    flightNumber: "DL0745",
    carrier: "DL",
    departureAirport: "DFW",
    arrivalAirport: "SEA",
    scheduledOut: "0830 03MAY",
    scheduledIn: "1052 03MAY",
    scheduledBlock: "4:22",
    turn: "20:03",
    rawSourceLine: "DL0745 DFW-SEA 0830 03MAY 1052 03MAY Blk 4:22",
    sourceText: "DL0745 : DFW-SEA Dep- 0830 03MAY Arr- 1052 03MAY Blk- 4:22",
  },
  {
    sourceScreenshotIndex: 2,
    date: "04MAY",
    flightNumber: "DL3812",
    carrier: "DL",
    departureAirport: "SEA",
    arrivalAirport: "SNA",
    scheduledOut: "0718 04MAY",
    scheduledIn: null,
    scheduledBlock: null,
    turn: null,
    rawSourceLine: "DL3812 SEA-SNA 0718 04MAY partial",
    sourceText: "DL3812 : SEA-SNA Dep- 0718 04MAY",
  },
  {
    sourceScreenshotIndex: 3,
    date: "04MAY",
    flightNumber: "DL3812",
    carrier: "DL",
    departureAirport: "SEA",
    arrivalAirport: "SNA",
    scheduledOut: "0718",
    scheduledIn: "1020",
    scheduledBlock: "3:02",
    turn: null,
    rawSourceLine: "DL3812 SEA-SNA 0718 1020 Blk 3:02",
    sourceText: "DL3812 : SEA-SNA Dep- 0718 Arr- 1020 Blk- 3:02",
  },
  {
    sourceScreenshotIndex: 3,
    date: "04MAY",
    flightNumber: "828",
    carrier: "DL",
    departureAirport: "BUR",
    arrivalAirport: "SLC",
    scheduledOut: "1240 04MAY",
    scheduledIn: "1540 04MAY +1hr",
    scheduledBlock: null,
    turn: null,
    rawSourceLine: "D DL828 BUR-SLC 1240 04MAY 1540 04MAY +1hr Confirmation #JLLX3I",
    sourceText: "D DL828 : BUR-SLC Dep- 1240 04MAY Arr- 1540 04MAY +1hr Confirmation #JLLX3I",
  },
];

export const rotation0118LiveCapturedSelectedSeedChain: RotationChainLeg[] = [
  {
    index: 1,
    ...rotation0118LiveCapturedBuilderInputCandidates[0],
  },
  {
    index: 2,
    ...rotation0118LiveCapturedBuilderInputCandidates[1],
  },
  {
    index: 3,
    ...rotation0118LiveCapturedBuilderInputCandidates[2],
  },
  {
    index: 4,
    ...rotation0118LiveCapturedBuilderInputCandidates[3],
  },
  {
    index: 5,
    ...rotation0118LiveCapturedBuilderInputCandidates[4],
  },
];
