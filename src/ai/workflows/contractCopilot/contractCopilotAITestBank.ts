export type ContractCopilotScenarioFamily =
  | "greenslip_premium_pickup"
  | "reserve_assignment_long_call_short_call"
  | "reroute_reassignment"
  | "sick_leave_pickup_interaction"
  | "apd_pd_reserve_day_rules"
  | "pay_protection_overlap_logic"
  | "direct_pay_lookup";

export type ContractCopilotFailurePattern =
  | "wrong_governing_section"
  | "inference_overrode_contract"
  | "reserve_vs_lineholder_drift"
  | "timing_drift"
  | "definition_drift"
  | "exception_missed"
  | "overlap_logic_drift"
  | "premium_type_drift"
  | "coverage_threshold_drift"
  | "manual_overrode_contract"
  | "question_scope_drift"
  | "status_scope_drift"
  | "greenslip_only_reasoning"
  | "reserve_override_inference"
  | "missed_18_hour_rule"
  | "unnecessary_clarification";

export type ContractCopilotAITestCase = {
  id: string;
  question: string;
  scenarioFamily: ContractCopilotScenarioFamily;
  expectedScenario: string;
  governingSections: string[];
  failurePatterns: ContractCopilotFailurePattern[];
  expectedAnswerNotes: string[];
  requiredConcepts?: string[];
  contractPriority?: string;
  evaluationFocus: Array<"directness" | "usefulness" | "contract_grounding" | "clarity">;
};

export type ContractCopilotScenarioFamilyBucket = {
  family: ContractCopilotScenarioFamily;
  label: string;
  usagePriority: "critical" | "high" | "medium";
  riskNotes: string[];
  testCaseIds: string[];
  dominantFailurePatterns: ContractCopilotFailurePattern[];
};

export type ContractCopilotDocumentLookupSmokeCase = {
  id: string;
  question: string;
  expectedLane: "document_section_explanation";
  expectedSection: string;
};

export const contractCopilotAITestBank: ContractCopilotAITestCase[] = [
  {
    id: "ai-cc-1",
    question: "I got a three day green slip that overlaps one reserve day how will it pay",
    scenarioFamily: "greenslip_premium_pickup",
    expectedScenario: "How this pays",
    governingSections: ["Section 23 Q", "Section 4 F.7.d", "Section 4 H.4", "Section 2 Definitions"],
    failurePatterns: [
      "wrong_governing_section",
      "inference_overrode_contract",
      "overlap_logic_drift",
      "premium_type_drift",
    ],
    expectedAnswerNotes: [
      "Must stay on Greenslip path.",
      "Should mention non-overlap days separately from the overlap day.",
      "Should not drift into inverse assignment.",
    ],
    evaluationFocus: ["directness", "usefulness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-2",
    question: "I'm reserve. If I get inverse assigned, what should happen?",
    scenarioFamily: "reserve_assignment_long_call_short_call",
    expectedScenario: "How this pays",
    governingSections: ["Section 23 N", "Section 23 O", "Reserve assignment provisions"],
    failurePatterns: [
      "wrong_governing_section",
      "reserve_vs_lineholder_drift",
      "premium_type_drift",
    ],
    expectedAnswerNotes: [
      "Should identify reserve assignment path first.",
      "Should not answer like lineholder premium pickup.",
    ],
    evaluationFocus: ["directness", "usefulness", "clarity"],
  },
  {
    id: "ai-cc-3",
    question: "I picked up GS on an X-day. Does that automatically become IA?",
    scenarioFamily: "greenslip_premium_pickup",
    expectedScenario: "How this pays",
    governingSections: ["Section 23 Q", "Section 2 Definitions", "Section 4 H.4"],
    failurePatterns: [
      "definition_drift",
      "premium_type_drift",
      "inference_overrode_contract",
    ],
    expectedAnswerNotes: [
      "Should say explicit GS should stay on Greenslip path unless facts actually show IA.",
    ],
    evaluationFocus: ["directness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-4",
    question: "If my trip reroutes after report, what should happen to pay or credit?",
    scenarioFamily: "reroute_reassignment",
    expectedScenario: "Reroute / reassignment",
    governingSections: ["Section 23 K", "Applicable reroute / reassignment sections"],
    failurePatterns: ["wrong_governing_section", "timing_drift", "inference_overrode_contract"],
    expectedAnswerNotes: [
      "Should say compare original trip and changed trip.",
      "Should mention timing can matter.",
    ],
    evaluationFocus: ["directness", "usefulness", "contract_grounding"],
  },
  {
    id: "ai-cc-5",
    question: "Was I rerouted or reassigned, and what fact changes the answer?",
    scenarioFamily: "reroute_reassignment",
    expectedScenario: "Reroute / reassignment",
    governingSections: ["Section 23 K", "Reroute vs reassignment definitions"],
    failurePatterns: ["timing_drift", "definition_drift", "question_scope_drift"],
    expectedAnswerNotes: [
      "Should identify the missing fact without overexplaining.",
    ],
    evaluationFocus: ["directness", "clarity"],
  },
  {
    id: "ai-cc-6",
    question: "Crew Scheduling changed my trip the same day. Is that reroute or reassignment?",
    scenarioFamily: "reroute_reassignment",
    expectedScenario: "Reroute / reassignment",
    governingSections: ["Section 23 K", "Same-day reroute / reassignment language"],
    failurePatterns: ["timing_drift", "definition_drift"],
    expectedAnswerNotes: [
      "Should say same-day timing matters.",
    ],
    evaluationFocus: ["usefulness", "clarity"],
  },
  {
    id: "ai-cc-7",
    question: "I called in sick and later picked up a trip. What matters?",
    scenarioFamily: "sick_leave_pickup_interaction",
    expectedScenario: "Sick / leave interaction",
    governingSections: ["Section 14", "Section 23 I", "Pickup interaction language"],
    failurePatterns: ["timing_drift", "inference_overrode_contract", "question_scope_drift"],
    expectedAnswerNotes: [
      "Should say sequence controls the answer.",
      "Should mention overlap versus non-overlap if needed.",
    ],
    evaluationFocus: ["directness", "usefulness", "contract_grounding"],
  },
  {
    id: "ai-cc-8",
    question: "I went well on day B and picked up flying after that. How should that work?",
    scenarioFamily: "sick_leave_pickup_interaction",
    expectedScenario: "Sick / leave interaction",
    governingSections: ["Section 14", "Recovery / pickup interaction sections"],
    failurePatterns: ["timing_drift", "exception_missed"],
    expectedAnswerNotes: [
      "Should mention replenishment path or sequence effect.",
    ],
    evaluationFocus: ["directness", "contract_grounding"],
  },
  {
    id: "ai-cc-9",
    question: "I picked up a trip that overlaps the days I originally called in sick for.",
    scenarioFamily: "pay_protection_overlap_logic",
    expectedScenario: "Sick / leave interaction",
    governingSections: ["Section 14", "Overlap / conflict treatment language"],
    failurePatterns: ["overlap_logic_drift", "timing_drift", "inference_overrode_contract"],
    expectedAnswerNotes: [
      "Should say overlap changes the answer and keep confidence honest.",
    ],
    evaluationFocus: ["usefulness", "clarity"],
  },
  {
    id: "ai-cc-sg-01",
    question:
      "I called in sick, then got awarded a GS that overlapped the first sick day and continued after I was well. How should pay and credit work?",
    scenarioFamily: "sick_leave_pickup_interaction",
    expectedScenario: "Sick / leave interaction",
    governingSections: ["Section 14 E", "Section 14 E and Example Three", "Section 23 Q Example one/two/three"],
    failurePatterns: ["wrong_governing_section", "overlap_logic_drift", "inference_overrode_contract"],
    expectedAnswerNotes: [
      "Should preserve separate treatment for overlap-day pay, overlap-day credit, sick-bank replenishment, and later GS days after the sick period ends.",
      "Should not flatten the whole event into a single sick-only or Greenslip-only label.",
    ],
    evaluationFocus: ["directness", "usefulness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-sg-02",
    question: "My GS fell fully inside the sick leave period. How should that pay and credit?",
    scenarioFamily: "sick_leave_pickup_interaction",
    expectedScenario: "Sick / leave interaction",
    governingSections: ["Section 14 E", "Section 14 E and Example Three"],
    failurePatterns: ["wrong_governing_section", "inference_overrode_contract", "overlap_logic_drift"],
    expectedAnswerNotes: [
      "Should treat this as a sick-plus-GS interaction, not a clean later GS case.",
      "Should keep pay, credit, and sick-bank replenishment separate if the governing example does.",
    ],
    evaluationFocus: ["usefulness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-sg-03",
    question: "I called in sick, then the GS started after sick leave ended. How should that work?",
    scenarioFamily: "sick_leave_pickup_interaction",
    expectedScenario: "Sick / leave interaction",
    governingSections: ["Section 14 E", "Section 23 Q Example one/two/three"],
    failurePatterns: ["wrong_governing_section", "timing_drift", "inference_overrode_contract"],
    expectedAnswerNotes: [
      "Should say later GS days after the sick period ends should be evaluated separately from any overlap-day treatment.",
      "Should not carry overlap-day no-credit treatment onto later clean GS days without support.",
    ],
    evaluationFocus: ["directness", "usefulness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-sg-04",
    question: "On the overlap day, can the GS pay one way while the credit and sick-bank treatment work differently?",
    scenarioFamily: "sick_leave_pickup_interaction",
    expectedScenario: "Sick / leave interaction",
    governingSections: ["Section 14 E", "Section 14 E and Example Three"],
    failurePatterns: ["definition_drift", "inference_overrode_contract", "overlap_logic_drift"],
    expectedAnswerNotes: [
      "Should explicitly preserve the distinction between overlap-day pay treatment, overlap-day credit treatment, and sick-bank replenishment.",
      "Should not flatten the overlap day into one simplistic label if the worked example distinguishes those dimensions.",
    ],
    evaluationFocus: ["usefulness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-10",
    question: "Does this answer change if I was reserve instead of lineholder?",
    scenarioFamily: "reserve_assignment_long_call_short_call",
    expectedScenario: "Reserve vs lineholder",
    governingSections: ["Reserve vs lineholder framework"],
    failurePatterns: ["reserve_vs_lineholder_drift", "status_scope_drift"],
    expectedAnswerNotes: [
      "Should say status changes the rule path.",
    ],
    evaluationFocus: ["directness", "clarity"],
  },
  {
    id: "ai-cc-11",
    question: "Can I use APD on reserve if reserve coverage is below the required minimum?",
    scenarioFamily: "apd_pd_reserve_day_rules",
    expectedScenario: "Reserve vs lineholder",
    governingSections: ["Section 23 I. 10. a.", "Section 23 V"],
    failurePatterns: [
      "wrong_governing_section",
      "inference_overrode_contract",
      "coverage_threshold_drift",
      "reserve_vs_lineholder_drift",
    ],
    expectedAnswerNotes: [
      "Should prioritize governing APD language under Section 23 I. 10. a. before generic reserve coverage concepts.",
      "Should explain that the APD threshold is whether reserves available are at least 25% of reserves required, not whether reserves are at or above the full required minimum.",
      "Should not deny APD simply because reserve coverage is below the required minimum.",
      "Should not drift into Greenslip, overlap, or unrelated trip coverage logic.",
    ],
    evaluationFocus: ["directness", "usefulness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-gs-04",
    question:
      "On reserve I picked up a 3-day Greenslip. Day 1 and 2 were off days. Day 3 overlaps with a long call. How will it pay?",
    scenarioFamily: "greenslip_premium_pickup",
    expectedScenario: "How this pays",
    governingSections: ["Section 23 - GS on reserve", "Section 23 Q", "Long call 18-hour rule"],
    failurePatterns: [
      "wrong_governing_section",
      "greenslip_only_reasoning",
      "reserve_override_inference",
      "missed_18_hour_rule",
      "unnecessary_clarification",
    ],
    requiredConcepts: [
      "greenslip_on_reserve",
      "long_call_overlap",
      "18_hour_rule",
      "single_pay_no_credit_first_duty_period",
    ],
    contractPriority: "Section 23 GS on reserve (18-hour rule)",
    expectedAnswerNotes: [
      "Bottom line should split Day 1-2 from Day 3.",
      "Day 1-2 should stay on normal Greenslip premium treatment because there is no reserve conflict.",
      "Day 3 should say the first duty period becomes single pay, no credit if the GS report is within 18 hours of first attempted contact.",
      "Concrete interaction rule available should be true, final answer used concrete interaction rule should be true, and answer still generic despite interaction rule should be false.",
      "Visible support should lead with the reserve long-call Greenslip carveout, not Section 2 Greenslip definitions.",
      "Should say this is an explicit GS-on-reserve rule, not a generic Greenslip or generic reserve override question.",
      "Should not default to further review when the governing interaction rule is found.",
    ],
    evaluationFocus: ["directness", "usefulness", "contract_grounding", "clarity"],
  },
  {
    id: "ai-cc-pay-01",
    question: "What is my hourly block pay rate if I'm a 5-year A220-300 Captain?",
    scenarioFamily: "direct_pay_lookup",
    expectedScenario: "Direct pay rate lookup",
    governingSections: ["Compensation Manual Section 3 B Pay Tables"],
    failurePatterns: ["wrong_governing_section", "question_scope_drift", "unnecessary_clarification"],
    expectedAnswerNotes: [
      "Direct lookup should trigger before normal contract retrieval.",
      "Should return exact A-220-300 Captain Year 5 hourly rate of $354.82/hour.",
      "Should not ask a clarifying question.",
    ],
    evaluationFocus: ["directness", "usefulness", "clarity"],
  },
  {
    id: "ai-cc-pay-02",
    question: "What is my pay rate at year 5 captain a220",
    scenarioFamily: "direct_pay_lookup",
    expectedScenario: "Direct pay rate lookup",
    governingSections: ["Compensation Manual Section 3 B Pay Tables"],
    failurePatterns: ["wrong_governing_section", "question_scope_drift", "unnecessary_clarification"],
    expectedAnswerNotes: [
      "Direct lookup should trigger before normal contract retrieval.",
      "Generic A220 should return both A-220-100 and A-220-300 Year 5 Captain rates.",
      "Should not drift into Section 2 Definitions or generic compensation-manual prose.",
    ],
    evaluationFocus: ["directness", "usefulness", "clarity"],
  },
  {
    id: "ai-cc-pay-03",
    question: "A220 captain year 5 pay",
    scenarioFamily: "direct_pay_lookup",
    expectedScenario: "Direct pay rate lookup",
    governingSections: ["Compensation Manual Section 3 B Pay Tables"],
    failurePatterns: ["wrong_governing_section", "question_scope_drift", "unnecessary_clarification"],
    expectedAnswerNotes: [
      "Should trigger direct pay lookup from structured compensation rows.",
      "Should return both A220 variant rates because plain A220 is ambiguous.",
    ],
    evaluationFocus: ["directness", "usefulness", "clarity"],
  },
  {
    id: "ai-cc-pay-04",
    question: "5 year A220 CA hourly",
    scenarioFamily: "direct_pay_lookup",
    expectedScenario: "Direct pay rate lookup",
    governingSections: ["Compensation Manual Section 3 B Pay Tables"],
    failurePatterns: ["wrong_governing_section", "question_scope_drift", "unnecessary_clarification"],
    expectedAnswerNotes: [
      "Should recognize CA as Captain.",
      "Should default to hourly block pay and return both A220 variant rates.",
    ],
    evaluationFocus: ["directness", "usefulness", "clarity"],
  },
  {
    id: "ai-cc-pay-05",
    question: "what do I make as year 5 A220 captain",
    scenarioFamily: "direct_pay_lookup",
    expectedScenario: "Direct pay rate lookup",
    governingSections: ["Compensation Manual Section 3 B Pay Tables"],
    failurePatterns: ["wrong_governing_section", "question_scope_drift", "unnecessary_clarification"],
    expectedAnswerNotes: [
      "Should treat this as a direct pay-rate lookup instead of generic compensation reasoning.",
      "Should return both A220 variant hourly rates without asking hourly vs monthly first.",
    ],
    evaluationFocus: ["directness", "usefulness", "clarity"],
  },
];

export const contractCopilotDocumentLookupSmokeCases: ContractCopilotDocumentLookupSmokeCase[] = [
  {
    id: "doc-23q-1",
    question: "What does Section 23 Q say?",
    expectedLane: "document_section_explanation",
    expectedSection: "Section 23 Q",
  },
  {
    id: "doc-23q-2",
    question: "Explain Section 23 Q",
    expectedLane: "document_section_explanation",
    expectedSection: "Section 23 Q",
  },
  {
    id: "doc-23q-3",
    question: "What is PWA 23 Q?",
    expectedLane: "document_section_explanation",
    expectedSection: "Section 23 Q",
  },
  {
    id: "doc-23q-4",
    question: "Section 23(Q)",
    expectedLane: "document_section_explanation",
    expectedSection: "Section 23 Q",
  },
];

export const contractCopilotScenarioFamilyBuckets: ContractCopilotScenarioFamilyBucket[] = [
  {
    family: "greenslip_premium_pickup",
    label: "Greenslip / premium pickup",
    usagePriority: "critical",
    riskNotes: [
      "High pilot usage and high drift risk into inverse assignment or unrelated premium types.",
      "Definitions and conflict rules are often spread across multiple sections.",
    ],
    testCaseIds: ["ai-cc-1", "ai-cc-3", "ai-cc-gs-04"],
    dominantFailurePatterns: [
      "wrong_governing_section",
      "premium_type_drift",
      "definition_drift",
      "overlap_logic_drift",
      "missed_18_hour_rule",
    ],
  },
  {
    family: "reserve_assignment_long_call_short_call",
    label: "Reserve assignment / long call / short call",
    usagePriority: "critical",
    riskNotes: [
      "Reserve questions often drift into lineholder logic.",
      "Status and call-type facts materially change the answer.",
    ],
    testCaseIds: ["ai-cc-2", "ai-cc-10"],
    dominantFailurePatterns: ["reserve_vs_lineholder_drift", "status_scope_drift", "wrong_governing_section"],
  },
  {
    family: "reroute_reassignment",
    label: "Reroute / reassignment",
    usagePriority: "high",
    riskNotes: [
      "Timing and definition drift are common.",
      "Operational changes get misclassified when the exact event sequence is missing.",
    ],
    testCaseIds: ["ai-cc-4", "ai-cc-5", "ai-cc-6"],
    dominantFailurePatterns: ["timing_drift", "definition_drift", "question_scope_drift"],
  },
  {
    family: "sick_leave_pickup_interaction",
    label: "Sick / leave / pickup interaction",
    usagePriority: "high",
    riskNotes: [
      "Sequence and overlap materially affect the answer.",
      "The system can sound generic if it does not separate timing scenarios clearly.",
    ],
    testCaseIds: ["ai-cc-7", "ai-cc-8", "ai-cc-sg-01", "ai-cc-sg-02", "ai-cc-sg-03", "ai-cc-sg-04"],
    dominantFailurePatterns: ["timing_drift", "exception_missed", "inference_overrode_contract", "overlap_logic_drift"],
  },
  {
    family: "apd_pd_reserve_day_rules",
    label: "APD / PD / reserve-day rules",
    usagePriority: "critical",
    riskNotes: [
      "Questions often drift toward generic reserve coverage rules instead of the governing APD / PD section.",
      "Holiday and threshold exceptions are easy to miss.",
    ],
    testCaseIds: ["ai-cc-11"],
    dominantFailurePatterns: [
      "wrong_governing_section",
      "coverage_threshold_drift",
      "exception_missed",
      "inference_overrode_contract",
    ],
  },
  {
    family: "pay_protection_overlap_logic",
    label: "Pay protection / overlap logic",
    usagePriority: "high",
    riskNotes: [
      "Overlap questions are easy to answer too generally.",
      "These scenarios often require the model to separate overlapping and non-overlapping segments explicitly.",
    ],
    testCaseIds: ["ai-cc-9"],
    dominantFailurePatterns: ["overlap_logic_drift", "timing_drift", "inference_overrode_contract"],
  },
  {
    family: "direct_pay_lookup",
    label: "Direct pay lookup",
    usagePriority: "critical",
    riskNotes: [
      "Pay-rate questions should bypass normal contract reasoning and use structured compensation rows first.",
      "Generic A220 questions must return both -100 and -300 rates instead of drifting into definitions or clarifiers.",
    ],
    testCaseIds: ["ai-cc-pay-01", "ai-cc-pay-02", "ai-cc-pay-03", "ai-cc-pay-04", "ai-cc-pay-05"],
    dominantFailurePatterns: ["wrong_governing_section", "question_scope_drift", "unnecessary_clarification"],
  },
];

export const contractCopilotHardeningPriorities = {
  scenarioFamilies: [
    "apd_pd_reserve_day_rules",
    "greenslip_premium_pickup",
    "reserve_assignment_long_call_short_call",
    "reroute_reassignment",
    "sick_leave_pickup_interaction",
    "pay_protection_overlap_logic",
    "direct_pay_lookup",
  ] satisfies ContractCopilotScenarioFamily[],
  failurePatterns: [
    "wrong_governing_section",
    "inference_overrode_contract",
    "reserve_vs_lineholder_drift",
    "timing_drift",
    "definition_drift",
    "exception_missed",
    "overlap_logic_drift",
    "premium_type_drift",
    "coverage_threshold_drift",
    "question_scope_drift",
    "status_scope_drift",
    "manual_overrode_contract",
  ] satisfies ContractCopilotFailurePattern[],
};
