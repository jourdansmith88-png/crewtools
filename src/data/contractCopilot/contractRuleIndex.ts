import type { ContractRule } from "../../types/contractCopilot.ts";

export const contractRuleIndex: ContractRule[] = [
  {
    id: "status.reserve_vs_lineholder_split",
    scenario: "status_basics",
    title: "Reserve and lineholder rules are not interchangeable",
    summary: "Monthly status changes which assignment, guarantee, and premium rules apply.",
    ruleType: "contract",
    appliesTo: ["both"],
    requiredFacts: ["status"],
    conditions: [{ field: "status", operator: "exists", value: true }],
    outcomes: [
      {
        outcomeId: "status_controls_rule_path",
        label: "Status controls the rule path",
        outcomeStatement:
          "Use the pilot's monthly status to choose the correct rule path before answering the rest of the question.",
        explanation:
          "Before answering the question, determine whether the pilot is reserve or lineholder for the month because many contract outcomes depend on status.",
        whatCouldChange: [
          "Whether the pilot was reserve or lineholder that month.",
          "Whether the question is really about assignment, premium, or leave.",
        ],
        breakdown: [
          "Reserve questions should stay on reserve assignment, guarantee, and premium paths.",
          "Lineholder questions should stay on lineholder assignment and pickup paths.",
        ],
      },
    ],
    priority: 100,
    confidenceBase: "high",
    references: [
      {
        sourceId: "pwa",
        section: "Section 2 Definitions",
        quoteSnippet:
          '"Regular line" means a line composed of training, vacation, leaves, rotations, and/or days-off.',
      },
      {
        sourceId: "pwa",
        section: "Section 2 Definitions",
        quoteSnippet:
          '"Reserve line" means a line composed of training, vacation, leaves, reserve on-call days, and X-days.',
      },
    ],
  },
  {
    id: "status.need_month_status",
    scenario: "status_basics",
    title: "Need monthly status before answering",
    summary: "If reserve or lineholder status is unknown, the tool should clarify before answering.",
    ruleType: "inference",
    appliesTo: ["both"],
    requiredFacts: [],
    conditions: [{ field: "status", operator: "exists", value: false }],
    outcomes: [
      {
        outcomeId: "ask_status",
        label: "Needs clarification",
        outcomeStatement:
          "I need to know whether you were reserve or lineholder that month before I can answer this safely.",
        explanation:
          "The answer depends on whether you were reserve or lineholder that month.",
        whatCouldChange: ["The monthly status for the pilot."],
      },
    ],
    priority: 95,
    confidenceBase: "high",
    references: [],
  },
  {
    id: "reroute.original_vs_changed_value_check",
    scenario: "reroute_reassignment",
    title: "Reroute questions require original and changed trip facts",
    summary: "Reroute analysis depends on comparing original schedule value and changed value.",
    ruleType: "contract",
    appliesTo: ["both"],
    requiredFacts: ["rerouteOccurred", "tripTouched"],
    conditions: [{ field: "rerouteOccurred", operator: "equals", value: true }],
    outcomes: [
      {
        outcomeId: "compare_original_changed",
        label: "Compare protected vs changed outcome",
        outcomeStatement:
          "A reroute answer should compare the original trip against the changed trip before deciding what should pay or be protected.",
        explanation:
          "A reroute answer needs the original trip and the changed trip facts before the contract outcome can be assessed.",
        whatCouldChange: [
          "Whether this was truly a reroute or a reassignment.",
          "The original trip value versus the changed trip value.",
          "When the change happened.",
        ],
        breakdown: [
          "The original awarded trip matters.",
          "The changed trip matters.",
          "Protection questions should compare both before deciding what happens to pay or credit.",
        ],
      },
    ],
    priority: 90,
    confidenceBase: "medium",
    references: [
      {
        sourceId: "pwa",
        section: "Section 4 F rotation guarantee",
        quoteSnippet: "the rerouted rotation flown under Section 23 L.",
      },
    ],
  },
  {
    id: "reroute.need_timing_detail",
    scenario: "reroute_reassignment",
    title: "Reroute timing can change the answer",
    summary: "Report timing and when the change occurred may affect the applicable rule path.",
    ruleType: "scheduler_practice",
    appliesTo: ["both"],
    requiredFacts: ["eventTiming"],
    conditions: [
      { field: "rerouteOccurred", operator: "equals", value: true },
      { field: "eventTiming", operator: "exists", value: false },
    ],
    outcomes: [
      {
        outcomeId: "ask_timing",
        label: "Need timing detail",
        outcomeStatement:
          "I need to know when the reroute or reassignment happened before I can tell you the likely contract path.",
        explanation:
          "When the reroute or reassignment happened may matter, so the tool should ask for timing before giving a firm answer.",
        whatCouldChange: [
          "Whether the change happened same day or later.",
          "Whether report or release timing changes the rule path.",
        ],
      },
    ],
    priority: 88,
    confidenceBase: "medium",
    references: [{ sourceId: "scheduler_manual", section: "Reroute handling procedures" }],
  },
  {
    id: "leave.sick_and_pickup_needs_sequence",
    scenario: "sick_leave_interaction",
    title: "Sick and pickup interactions require sequence facts",
    summary: "Whether flying was dropped sick, later picked up, or overlapped affects the answer.",
    ruleType: "contract",
    appliesTo: ["both"],
    requiredFacts: ["sickUsed", "pickupType", "sameDayInteraction"],
    conditions: [
      { field: "sickUsed", operator: "equals", value: true },
      { field: "pickupType", operator: "exists", value: true },
    ],
    outcomes: [
      {
        outcomeId: "need_sequence",
        label: "Need sequence of events",
        outcomeStatement:
          "The answer turns on the sequence between the sick event and the pickup.",
        explanation:
          "To answer correctly, determine whether the sick event happened before, after, or overlapping the pickup.",
        whatCouldChange: [
          "Whether the pickup happened before or after the sick event.",
          "Whether the events overlapped.",
          "Whether the pilot was reserve or lineholder.",
        ],
        breakdown: [
          "Non-overlapping days may follow one rule path.",
          "Overlapping days may follow another rule path.",
          "The month status can still change the final answer.",
        ],
      },
    ],
    priority: 92,
    confidenceBase: "medium",
    references: [
      {
        sourceId: "pwa",
        section: "Section 14 E and Example Three",
        quoteSnippet:
          "11 hours will be used to replenish the pilot's available sick leave hours.",
      },
      {
        sourceId: "pwa",
        section: "Section 14 E and Example Three",
        quoteSnippet:
          "Pilot receives single pay, no credit for the portion of the GS that exceeds the lesser of the ALV or 75 hours.",
      },
    ],
  },
  {
    id: "leave.sick_and_greenslip_overlap_dimensions",
    scenario: "sick_leave_interaction",
    subscenario: "sick_plus_greenslip_overlap",
    title: "Sick plus Greenslip can split pay, credit, and replenishment",
    summary:
      "When a Greenslip overlaps the sick period, the contract example may distinguish overlap-day pay treatment from credit and sick-bank replenishment.",
    ruleType: "contract",
    appliesTo: ["both"],
    requiredFacts: ["sickUsed", "pickupType", "interactionRelationship"],
    conditions: [
      { field: "sickUsed", operator: "equals", value: true },
      { field: "pickupType", operator: "equals", value: "greenslip" },
      { field: "interactionRelationship", operator: "equals", value: "overlap" },
    ],
    outcomes: [
      {
        outcomeId: "sick_gs_overlap_split_dimensions",
        label: "Overlap day may pay differently from how credit is handled",
        outcomeStatement:
          "For an overlap day, do not flatten pay, credit, and sick-bank replenishment into one label. The worked example can support replenishment of sick leave hours while also applying single pay, no credit to the GS portion above the lesser of ALV or 75 hours.",
        explanation:
          "A sick-plus-GS overlap can carry more than one contract effect at the same time, so the answer should preserve the separate treatment for pay, credit, and replenishment.",
        whatCouldChange: [
          "Whether the Greenslip actually overlapped a sick day or started after the pilot was well.",
          "Whether the whole GS sat inside the sick period or only the first day overlapped.",
          "Whether later GS days were outside the sick period.",
        ],
        breakdown: [
          "Use the sick-leave example to evaluate the overlap day.",
          "Keep sick-bank replenishment separate from pay and credit treatment.",
          "Do not assume later GS days after the sick period ended are handled the same way as the overlap day.",
        ],
      },
    ],
    priority: 97,
    confidenceBase: "high",
    references: [
      {
        sourceId: "pwa",
        section: "Section 14 E",
        quoteSnippet:
          "The value of such added rotation(s) will be used to replenish the pilot's sick leave credit allotment up to the value of sick leave paid for that portion of their sick leave that occurred after the date on which the pilot advised the Company they would be well.",
      },
      {
        sourceId: "pwa",
        section: "Section 14 E",
        quoteSnippet:
          "Additional pay above the single pay and credit of a rotation necessary to replenish the pilot's sick bank will be paid to the pilot.",
      },
      {
        sourceId: "pwa",
        section: "Section 14 E and Example Three",
        quoteSnippet:
          "11 hours will be used to replenish the pilot's available sick leave hours.",
      },
      {
        sourceId: "pwa",
        section: "Section 14 E and Example Three",
        quoteSnippet:
          "Pilot receives single pay, no credit for the portion of the GS that exceeds the lesser of the ALV or 75 hours.",
      },
    ],
    relatedRuleIds: ["leave.sick_and_pickup_needs_sequence"],
  },
  {
    id: "leave.sick_and_greenslip_after_well_days",
    scenario: "sick_leave_interaction",
    subscenario: "sick_plus_greenslip_after_well",
    title: "Later GS days after the sick period can be treated separately",
    summary:
      "Section 14 and Section 23 examples show that once the pilot is well, later GS/GSWC processing can be evaluated separately from the sick portion instead of flattening the whole event.",
    ruleType: "contract",
    appliesTo: ["both"],
    requiredFacts: ["sickUsed", "pickupType", "interactionRelationship"],
    conditions: [
      { field: "sickUsed", operator: "equals", value: true },
      { field: "pickupType", operator: "equals", value: "greenslip" },
      { field: "interactionRelationship", operator: "equals", value: "sequential" },
    ],
    outcomes: [
      {
        outcomeId: "later_gs_days_after_sick_can_stand_apart",
        label: "Later GS days after sick can stand apart from the overlap day",
        outcomeStatement:
          "If the GS starts after the sick period ends, do not treat it like an overlap day. The later GS day(s) should be analyzed as the added or awarded GS after the pilot is well, with replenishment applying only to the portion the contract says it replenishes.",
        explanation:
          "The contract examples distinguish between the sick portion and the later flying once the pilot has called in well.",
        whatCouldChange: [
          "Whether any part of the GS still overlapped the sick period.",
          "Whether the pilot had already advised the Company they would be well before the GS began.",
        ],
        breakdown: [
          "Resolve the overlap day first if one exists.",
          "Then treat later GS days after the sick period ends as their own GS portion.",
          "Do not carry the overlap-day no-credit treatment onto later clean GS days without support.",
        ],
      },
    ],
    priority: 94,
    confidenceBase: "medium",
    references: [
      {
        sourceId: "pwa",
        section: "Section 14 E",
        quoteSnippet:
          "A regular pilot who, during a period of sick leave, advises the Company of the date on which the pilot will be well, may add a rotation(s) ... that conflicts with their period of sick leave and is scheduled to operate after the pilot is well.",
      },
      {
        sourceId: "pwa",
        section: "Section 23 Q Example one/two/three",
        quoteSnippet:
          "Their request will be processed in seniority order utilizing the scheduled flight and flight duty period time from the rotation missed due to sick leave.",
      },
    ],
    relatedRuleIds: ["leave.sick_and_greenslip_overlap_dimensions"],
  },
  {
    id: "leave.leave_type_changes_answer",
    scenario: "sick_leave_interaction",
    title: "Leave type changes the contract path",
    summary: "Sick, vacation, training, and other leaves do not share one answer path.",
    ruleType: "contract",
    appliesTo: ["both"],
    requiredFacts: ["leaveType"],
    conditions: [{ field: "leaveType", operator: "exists", value: false }],
    outcomes: [
      {
        outcomeId: "ask_leave_type",
        label: "Need leave type",
        outcomeStatement:
          "I need the leave type before I can tell you which contract path applies.",
        explanation:
          "The answer depends on the specific leave type, not just the fact that the pilot was off the schedule.",
        whatCouldChange: [
          "Whether this was sick, vacation, training, or another leave category.",
        ],
      },
    ],
    priority: 89,
    confidenceBase: "high",
    references: [{ sourceId: "pwa", section: "Section 11 / 13 / 14 leave and sick sections" }],
  },
  {
    id: "premium.greenslip_reserve_overlap_path",
    scenario: "premium_pickup",
    title: "Reserve Greenslip overlap stays on the Greenslip path first",
    summary:
      "If a Greenslip overlaps a reserve day, treat it as a Greenslip question first and then evaluate the overlap day separately.",
    ruleType: "contract",
    appliesTo: ["reserve"],
    requiredFacts: ["status", "pickupType", "sameDayInteraction"],
    conditions: [
      { field: "status", operator: "equals", value: "reserve" },
      { field: "pickupType", operator: "equals", value: "greenslip" },
      { field: "sameDayInteraction", operator: "equals", value: true },
    ],
    outcomes: [
      {
        outcomeId: "greenslip_overlap_reserve_day",
        label: "Greenslip overlap handling",
        outcomeStatement:
          "Keep this on the Greenslip path. The non-overlap days should pay as Greenslip days, and the overlap day needs separate contract review before you assume extra premium there.",
        explanation:
          "If the pilot explicitly describes a Greenslip, the tool should stay on the Greenslip path. The overlapping reserve day is the fact that may change how one day is treated, but it should not automatically convert the whole situation into inverse assignment.",
        whatCouldChange: [
          "Whether the event was truly a Greenslip versus inverse assignment.",
          "Whether only one day overlaps or the whole trip overlaps reserve obligation.",
          "Whether the reserve day was already protected or separately assigned.",
        ],
        breakdown: [
          "Non-overlap Greenslip days should stay on the Greenslip path.",
          "The overlapping reserve day needs a separate check before deciding extra premium or duplicate credit.",
          "Do not reclassify the whole event as inverse assignment unless the facts actually show inverse assignment.",
        ],
      },
    ],
    priority: 98,
    confidenceBase: "medium",
    references: [
      {
        sourceId: "pwa",
        section: "Section 2 Definitions",
        quoteSnippet:
          '"Green slip" (GS) means a request by a pilot to be awarded same-day/next-day/second-day open time that may generate premium pay.',
      },
      {
        sourceId: "pwa",
        section: "Section 4 F.7.d",
        quoteSnippet: "green slips or green slips with conflict under Section 23 Q.",
      },
      {
        sourceId: "pwa",
        section: "Section 4 H.4",
        quoteSnippet: "reports for duty (e.g., GS, QS, IA) on an X-day.",
      },
    ],
  },
  {
    id: "premium.pickups_need_premium_type",
    scenario: "premium_pickup",
    title: "Pickup answers require the premium / pickup type",
    summary: "Green Slip, Quick Slip, inverse assignment, and other pickup situations must be separated.",
    ruleType: "contract",
    appliesTo: ["both"],
    requiredFacts: ["pickupType", "status"],
    conditions: [{ field: "pickupType", operator: "exists", value: false }],
    outcomes: [
      {
        outcomeId: "ask_pickup_type",
        label: "Need pickup type",
        outcomeStatement:
          "I need to know the exact pickup or premium type before I can answer this safely.",
        explanation:
          "The answer depends on what kind of pickup or assignment this actually was.",
        whatCouldChange: [
          "Whether this was Green Slip, Quick Slip, inverse assignment, or another pickup.",
          "Whether the pilot was reserve or lineholder.",
        ],
      },
    ],
    priority: 93,
    confidenceBase: "high",
    references: [
      {
        sourceId: "pwa",
        section: "Section 2 Definitions",
        quoteSnippet:
          '"Green slip" (GS) means a request by a pilot to be awarded same-day/next-day/second-day open time that may generate premium pay.',
      },
    ],
  },
  {
    id: "premium.reserve_inverse_assignment_path",
    scenario: "premium_pickup",
    title: "Reserve inverse assignment uses a reserve-specific path",
    summary: "Reserve assignment questions should not be answered with lineholder premium logic.",
    ruleType: "contract",
    appliesTo: ["reserve"],
    requiredFacts: ["status", "assignmentType"],
    conditions: [
      { field: "status", operator: "equals", value: "reserve" },
      { field: "assignmentType", operator: "equals", value: "inverse_assignment" },
    ],
    outcomes: [
      {
        outcomeId: "use_reserve_assignment_logic",
        label: "Reserve-specific assignment path",
        outcomeStatement:
          "If this was a reserve inverse assignment, use reserve assignment rules rather than lineholder premium pickup logic.",
        explanation:
          "This question should be answered using reserve assignment rules rather than lineholder pickup assumptions.",
        whatCouldChange: [
          "Whether this was truly inverse assignment.",
          "Whether the pilot was reserve that month.",
        ],
        breakdown: [
          "Treat the event as reserve assignment first.",
          "Then evaluate whether any premium or extra-credit outcome still applies on top of that path.",
        ],
      },
    ],
    priority: 94,
    confidenceBase: "high",
    references: [
      {
        sourceId: "pwa",
        section: "Section 4 F.7.a",
        quoteSnippet: "inverse assignment with or without conflict under Section 23 N. or O.",
      },
      {
        sourceId: "pwa",
        section: "Section 2 Definitions",
        quoteSnippet:
          '"Inverse assignment with conflict" (IAWC) means an IA that overlaps a scheduled rotation(s) remaining to be flown.',
      },
    ],
  },
  {
    id: "dispute.citation_helper_contract_first",
    scenario: "dispute_citation_helper",
    title: "Dispute helper should lead with governing contract support",
    summary: "If contract language exists, lead with that before scheduler-practice references.",
    ruleType: "inference",
    appliesTo: ["both"],
    requiredFacts: ["questionIntent"],
    conditions: [{ field: "questionIntent", operator: "equals", value: "dispute_help" }],
    outcomes: [
      {
        outcomeId: "lead_with_contract",
        label: "Lead with contract support",
        outcomeStatement:
          "Lead with the PWA section first, then use scheduler-manual language only as supporting guidance.",
        explanation:
          "When preparing a dispute or challenge, present the governing PWA reference first and operational/manual support second.",
        whatCouldChange: [
          "Whether the issue is really a dispute versus a general explanation request.",
          "Whether a scheduler-manual procedure also needs to be cited for context.",
        ],
      },
    ],
    priority: 97,
    confidenceBase: "high",
    references: [],
  },
  {
    id: "dispute.manual_is_not_contract",
    scenario: "dispute_citation_helper",
    title: "Scheduler manual guidance should be labeled separately",
    summary: "Operational guidance can support an answer but should not be presented as governing contract language.",
    ruleType: "scheduler_practice",
    appliesTo: ["both"],
    requiredFacts: ["questionIntent"],
    conditions: [
      { field: "questionIntent", operator: "in", value: ["citation_help", "dispute_help"] },
    ],
    outcomes: [
      {
        outcomeId: "label_manual_support",
        label: "Label operational guidance separately",
        outcomeStatement:
          "Do not present scheduler-manual language as if it were governing contract language.",
        explanation:
          "If the scheduler manual is used, make clear that it is operational guidance and not identical to PWA governing language.",
        whatCouldChange: [
          "Whether there is direct PWA language available for the same issue.",
          "Whether the manual only helps explain process or timing.",
        ],
      },
    ],
    priority: 96,
    confidenceBase: "high",
    references: [{ sourceId: "scheduler_manual", section: "General operational guidance" }],
  },
];
