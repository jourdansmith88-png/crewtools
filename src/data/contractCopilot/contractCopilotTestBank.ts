export type ContractCopilotTestCase = {
  id: string;
  family:
    | "greenslip_overlap"
    | "reserve_assignment"
    | "reroute_reassignment"
    | "sick_leave_interaction"
    | "status_difference";
  question: string;
  expectedScenario:
    | "premium_pickup"
    | "status_basics"
    | "reroute_reassignment"
    | "sick_leave_interaction";
  notes?: string;
};

export const contractCopilotTestBank: ContractCopilotTestCase[] = [
  {
    id: "gs-overlap-1",
    family: "greenslip_overlap",
    question: "I got a three day green slip that overlaps one reserve day how will it pay",
    expectedScenario: "premium_pickup",
    notes: "Should stay on Greenslip path and not drift into inverse assignment.",
  },
  {
    id: "gs-overlap-2",
    family: "greenslip_overlap",
    question: "I'm reserve and took a GS that touches one X-day, what happens to the overlap day?",
    expectedScenario: "premium_pickup",
  },
  {
    id: "gs-overlap-3",
    family: "greenslip_overlap",
    question: "GS overlap question: two Greenslip days are clear and one day overlaps reserve obligation.",
    expectedScenario: "premium_pickup",
  },
  {
    id: "gs-overlap-4",
    family: "greenslip_overlap",
    question: "I picked up G/S and only one day conflicts with reserve, does the whole trip become IA?",
    expectedScenario: "premium_pickup",
    notes: "Should clarify that explicit GS should not become IA automatically.",
  },
  {
    id: "reserve-assign-1",
    family: "reserve_assignment",
    question: "I'm reserve. If I get inverse assigned, what should happen?",
    expectedScenario: "premium_pickup",
  },
  {
    id: "reserve-assign-2",
    family: "reserve_assignment",
    question: "Reserve inverse assignment with conflict: what rule path controls?",
    expectedScenario: "premium_pickup",
  },
  {
    id: "reserve-assign-3",
    family: "reserve_assignment",
    question: "I was reserve that month. Does this pay like Greenslip or inverse assignment?",
    expectedScenario: "premium_pickup",
    notes: "Should trigger premium type clarification.",
  },
  {
    id: "reroute-1",
    family: "reroute_reassignment",
    question: "If my trip reroutes after report, what should happen to pay or credit?",
    expectedScenario: "reroute_reassignment",
  },
  {
    id: "reroute-2",
    family: "reroute_reassignment",
    question: "Was I rerouted or reassigned, and what fact changes the answer?",
    expectedScenario: "reroute_reassignment",
  },
  {
    id: "reroute-3",
    family: "reroute_reassignment",
    question: "My original trip changed and the new trip was shorter. What should control?",
    expectedScenario: "reroute_reassignment",
  },
  {
    id: "reroute-4",
    family: "reroute_reassignment",
    question: "Crew Scheduling changed my trip the same day. Is that a reroute or reassignment issue?",
    expectedScenario: "reroute_reassignment",
  },
  {
    id: "sick-1",
    family: "sick_leave_interaction",
    question: "I called in sick and later picked up a trip. What matters?",
    expectedScenario: "sick_leave_interaction",
  },
  {
    id: "sick-2",
    family: "sick_leave_interaction",
    question: "I went well mid-rotation and picked up flying after the sick period. How should that work?",
    expectedScenario: "sick_leave_interaction",
  },
  {
    id: "sick-3",
    family: "sick_leave_interaction",
    question: "I picked up a trip that overlaps the days I originally called in sick for.",
    expectedScenario: "sick_leave_interaction",
  },
  {
    id: "sick-4",
    family: "sick_leave_interaction",
    question: "Vacation versus sick leave: does that change the contract path for a pickup?",
    expectedScenario: "sick_leave_interaction",
  },
  {
    id: "status-1",
    family: "status_difference",
    question: "Does this answer change if I was reserve instead of lineholder?",
    expectedScenario: "status_basics",
  },
  {
    id: "status-2",
    family: "status_difference",
    question: "I need the reserve versus lineholder version of this rule.",
    expectedScenario: "status_basics",
  },
  {
    id: "status-3",
    family: "status_difference",
    question: "I was lineholder that month, not reserve. Does that change the rule path?",
    expectedScenario: "status_basics",
  },
];
