export * from "./types.ts";
export * from "./retrieveSupport.ts";
export * from "./selectGoverningSections.ts";
export * from "./buildSupportCards.ts";
export * from "./verifyToolAnswer.ts";

import type { ContractBrainSmokeFixture } from "./types.ts";

export const contractBrainSmokeFixtures: ContractBrainSmokeFixture[] = [
  {
    id: "contract-brain-smoke-001",
    toolType: "genericContractTool",
    question: "I was rerouted on a trip after report. Am I pay protected under Section 23 L if the reroute changed my credit?",
    expectedSection: "23 L",
  },
  {
    id: "contract-brain-smoke-002",
    toolType: "genericContractTool",
    question: "On the last day of vacation I got a short call placed in MiCrew. Does Section 23 S.9 require valid notification?",
    expectedSection: "23 S.9",
  },
  {
    id: "contract-brain-smoke-003",
    toolType: "genericContractTool",
    question: "Where are 23M7 affected pilots shown in iCrew?",
    expectedSection: "23 M.7",
  },
  {
    id: "contract-brain-smoke-004",
    toolType: "genericContractTool",
    question: "Does Green Slip under Section 23 Q create two 24-hour periods off for a one-day GS?",
    expectedSection: "23 Q",
  },
  {
    id: "contract-brain-smoke-005",
    toolType: "genericContractTool",
    question: "If I only get 9:45 rest on a DH-only day off short call, do I need Section 12 rest protection?",
    expectedSection: "12",
  },
];
