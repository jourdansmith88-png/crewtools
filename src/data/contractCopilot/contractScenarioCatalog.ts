import type { ScenarioCatalogEntry } from "../../types/contractCopilot.ts";

export const contractScenarioCatalog: ScenarioCatalogEntry[] = [
  {
    id: "status_basics",
    label: "Reserve vs lineholder basics",
    description: "Figure out which contract path applies before answering assignment or guarantee questions.",
    exampleQuestions: [
      "I'm reserve. Does that change the answer?",
      "Do lineholder rules apply here or reserve rules?",
    ],
    requiredFacts: ["status"],
    preferredRuleOrder: ["contract", "scheduler_practice", "inference"],
  },
  {
    id: "reroute_reassignment",
    label: "Reroute / reassignment basics",
    description: "Compare original trip facts and changed trip facts to understand the rule path.",
    exampleQuestions: [
      "If my trip reroutes, what should happen?",
      "Was I reassigned or rerouted under the contract?",
    ],
    requiredFacts: ["status", "rerouteOccurred", "eventTiming"],
    preferredRuleOrder: ["contract", "scheduler_practice", "inference"],
  },
  {
    id: "sick_leave_interaction",
    label: "Sick / leave interaction basics",
    description: "Handle the sequence between sick, leave, drops, and pickups without overgeneralizing.",
    exampleQuestions: [
      "I called in sick and later picked up a trip. What matters?",
      "Does leave type change the answer?",
    ],
    requiredFacts: ["status", "leaveType"],
    preferredRuleOrder: ["contract", "scheduler_practice", "inference"],
  },
  {
    id: "premium_pickup",
    label: "Premium / pickup basics",
    description: "Separate premium and pickup questions by status and pickup type before answering.",
    exampleQuestions: [
      "Is this Green Slip or something else?",
      "I'm reserve and got inverse assigned. Which rule path applies?",
    ],
    requiredFacts: ["status", "pickupType"],
    preferredRuleOrder: ["contract", "scheduler_practice", "inference"],
  },
  {
    id: "dispute_citation_helper",
    label: "Dispute / citation helper",
    description: "Help the pilot cite the right governing language and label manual guidance correctly.",
    exampleQuestions: [
      "What should I cite when I challenge this?",
      "Which contract section supports my argument?",
    ],
    requiredFacts: ["questionIntent"],
    preferredRuleOrder: ["contract", "scheduler_practice", "inference"],
  },
];
