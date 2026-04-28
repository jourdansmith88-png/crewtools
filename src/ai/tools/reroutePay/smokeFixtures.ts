import type { RerouteAnalysisInput } from "./types.ts";

export const reroutePaySmokeFixtures: Array<{
  id: string;
  input: RerouteAnalysisInput;
  expected: string[];
}> = [
  {
    id: "reroute-pay-smoke-001",
    input: {
      description:
        "Lineholder. After report. Day 2 I was rerouted from BOS-SAT-BOS to BOS-DFW-BOS before the first break in duty. Original affected block was 5:20. Rerouted block was 4:40.",
      pilotStatus: "lineholder",
      rerouteTiming: "after_report",
      finalCreditDecreased: "yes",
      touchedXDay: "no",
      deadheadInvolved: "no",
      bidPeriodCrossover: "no",
      parsedFactOverrides: {
        originalAffectedMinutes: 320,
        reroutedMinutes: 280,
        breakInDuty: false,
      },
      uploadedEvidenceSummary: {
        screenshotParsingActive: false,
        screenshotNames: [],
        notes: [],
      },
    },
    expected: ["23 L.4", "2:20", "pay / no credit"],
  },
  {
    id: "reroute-pay-smoke-002",
    input: {
      description: "Lineholder rerouted segment after first break in duty. Rerouted block 2:10.",
      pilotStatus: "lineholder",
      rerouteTiming: "after_report",
      finalCreditDecreased: "unknown",
      touchedXDay: "no",
      deadheadInvolved: "no",
      bidPeriodCrossover: "no",
      parsedFactOverrides: {
        reroutedMinutes: 130,
        breakInDuty: true,
      },
      uploadedEvidenceSummary: {
        screenshotParsingActive: false,
        screenshotNames: [],
        notes: [],
      },
    },
    expected: ["23 L.4", "100% pay / no credit"],
  },
  {
    id: "reroute-pay-smoke-003",
    input: {
      description: "Lineholder release more than 4 hours late due to company controlled reroute.",
      pilotStatus: "lineholder",
      rerouteTiming: "after_report",
      finalCreditDecreased: "unknown",
      touchedXDay: "no",
      deadheadInvolved: "no",
      bidPeriodCrossover: "no",
      parsedFactOverrides: {
        reroutedMinutes: 180,
      },
      originalRotationText: "Release 14:00",
      changedRotationText: "Release 18:30",
      uploadedEvidenceSummary: {
        screenshotParsingActive: false,
        screenshotNames: [],
        notes: [],
      },
    },
    expected: ["23 L.8", "late-release premium"],
  },
  {
    id: "reroute-pay-smoke-004",
    input: {
      description: "Reserve released more than 4 hours late into X-day after reroute.",
      pilotStatus: "reserve",
      rerouteTiming: "after_report",
      finalCreditDecreased: "unknown",
      touchedXDay: "yes",
      deadheadInvolved: "no",
      bidPeriodCrossover: "no",
      parsedFactOverrides: {
        reroutedMinutes: 240,
      },
      originalRotationText: "Release 10:00",
      changedRotationText: "Release 15:30",
      uploadedEvidenceSummary: {
        screenshotParsingActive: false,
        screenshotNames: [],
        notes: [],
      },
    },
    expected: ["23 L.9", "X-day / line day-off premium"],
  },
  {
    id: "reroute-pay-smoke-005",
    input: {
      description: "Reroute happened after report but I do not have the original release time.",
      pilotStatus: "lineholder",
      rerouteTiming: "after_report",
      finalCreditDecreased: "unknown",
      touchedXDay: "no",
      deadheadInvolved: "unknown",
      bidPeriodCrossover: "unknown",
      uploadedEvidenceSummary: {
        screenshotParsingActive: false,
        screenshotNames: [],
        notes: [],
      },
    },
    expected: ["missing original release time", "need more facts"],
  },
];
