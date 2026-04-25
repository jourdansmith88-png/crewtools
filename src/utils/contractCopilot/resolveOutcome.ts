import type {
  ContractRule,
  ParsedScenarioFacts,
  ResolvedContractOutcome,
  RetrievedRuleSet,
} from "../../types/contractCopilot.ts";

function topRuleFrom(result: RetrievedRuleSet): ContractRule | null {
  return (result.matchedRules.length > 0 ? result.matchedRules : result.supportingRules)[0] ?? null;
}

function defaultWhatCouldChange(facts: ParsedScenarioFacts) {
  const items: string[] = [];
  if (!facts.status) {
    items.push("Whether you were reserve or lineholder that month.");
  }
  if (!facts.eventTiming) {
    items.push("When the event happened relative to report, assignment, or release.");
  }
  if (!facts.pickupType && !facts.assignmentType) {
    items.push("The exact pickup or assignment type.");
  }
  if (!facts.leaveType && facts.sickUsed) {
    items.push("Whether this was sick only or another leave interaction.");
  }
  return items;
}

function genericBreakdownFor(facts: ParsedScenarioFacts) {
  const parts: string[] = [];
  if (facts.status) {
    parts.push(`This is currently being evaluated as a ${facts.status} scenario.`);
  }
  if (facts.eventTiming) {
    parts.push(`Timing matters here: ${facts.eventTiming.replaceAll("_", " ")}.`);
  }
  if (facts.pickupType) {
    parts.push(`Pickup type in play: ${facts.pickupType.replaceAll("_", " ")}.`);
  }
  return parts;
}

export function resolveOutcome(
  result: RetrievedRuleSet,
  facts: ParsedScenarioFacts
): ResolvedContractOutcome {
  const topRule = topRuleFrom(result);

  if (!result.scenario) {
    return {
      status: "insufficient_support",
      shortAnswer: "I can’t safely resolve this yet.",
      plainEnglishExplanation:
        "The question did not map cleanly into one of the supported contract scenarios, so the tool should not guess.",
      assumptions: [],
      followUpSuggestion: "Restate what happened, your monthly status, and what changed.",
      whatCouldChangeThisAnswer: ["A more specific event description or scenario family."],
      breakItDown: [
        "The tool needs a clearer event type before it can say what should happen to pay or credit.",
      ],
    };
  }

  if (result.missingFacts.length > 0) {
    return {
      status: "needs_clarification",
      shortAnswer:
        "Here is the most likely path from the facts so far: the answer turns on one missing fact that can change which contract rule applies.",
      plainEnglishExplanation:
        "The tool recognizes the scenario, but one or more missing facts still change which contract path applies.",
      assumptions: [],
      followUpSuggestion: "Answer the clarifying question so the rule path can be resolved.",
      whatCouldChangeThisAnswer: result.missingFacts.map((fact) =>
        `Providing ${fact.replace(/[A-Z]/g, (character) => ` ${character.toLowerCase()}`)}.`
      ),
      breakItDown: ["The scenario is recognized, but one missing fact still changes what should happen."],
    };
  }

  if (!topRule) {
    return {
      status: "insufficient_support",
      shortAnswer:
        "The most likely answer depends on the governing contract section for this specific fact pattern, and the current encoded rule set is still too thin to state that confidently.",
      plainEnglishExplanation:
        "The scenario family is known, but the current rule set does not yet contain a strong enough match for the exact facts provided.",
      assumptions: [],
      followUpSuggestion:
        "Use the closest contract section as a starting point and expand this rule family next.",
      whatCouldChangeThisAnswer: defaultWhatCouldChange(facts),
      breakItDown: genericBreakdownFor(facts),
    };
  }

  const outcome = topRule.outcomes[0] ?? null;
  const genericWhatCouldChange =
    outcome?.whatCouldChange?.length ? outcome.whatCouldChange : defaultWhatCouldChange(facts);
  const genericBreakdown =
    outcome?.breakdown?.length ? outcome.breakdown : genericBreakdownFor(facts);

  switch (topRule.id) {
    case "status.reserve_vs_lineholder_split":
      return {
        status: "answered",
        shortAnswer:
          facts.status === "reserve"
            ? "This should be treated under reserve rules, so pay and credit should follow the reserve path rather than lineholder assumptions."
            : "This should be treated under lineholder rules, so pay and credit should follow the lineholder path rather than reserve assumptions.",
        plainEnglishExplanation:
          facts.status === "reserve"
            ? "Your monthly status points this question into reserve-specific assignment, guarantee, and premium language rather than lineholder assumptions."
            : "Your monthly status points this question into lineholder-specific assignment, guarantee, and premium language rather than reserve assumptions.",
        assumptions: [`Assuming you were ${facts.status} for the month in question.`],
        followUpSuggestion:
          outcome?.nextActionHint ??
          "If you challenge the outcome, start by identifying your monthly status in the contract path.",
        whatCouldChangeThisAnswer: [
          "If your monthly status was different than assumed.",
          "If the event was actually a different assignment or premium type.",
        ],
        breakItDown:
          facts.status === "reserve"
            ? [
                "Reserve-specific assignment and guarantee rules should control the outcome.",
                "Do not borrow lineholder pickup logic unless the facts clearly move the issue into that path.",
              ]
            : [
                "Lineholder-specific assignment and pickup rules should control the outcome.",
                "Do not borrow reserve assignment logic unless the pilot was actually reserve for the month.",
              ],
      };
    case "reroute.original_vs_changed_value_check":
      return {
        status: "answered",
        shortAnswer:
          "If this was a real reroute, what should happen to pay or credit depends on the original trip, the changed trip, and when the change happened.",
        plainEnglishExplanation:
          "This should not be answered by looking only at the final trip. The original trip value, the changed trip value, and the timing of the change all matter before you can say what should happen.",
        assumptions: ["Assuming this was an actual reroute and the trip was materially changed."],
        followUpSuggestion:
          "Gather the original trip, the changed trip, and when the change happened before challenging pay or protection.",
        whatCouldChangeThisAnswer: [
          "Whether this was truly a reroute or a reassignment.",
          "When the change happened.",
          "Whether the original and changed values differ materially.",
        ],
        breakItDown: [
          "Original trip value is one side of the answer.",
          "Changed trip value is the other side of the answer.",
          "The timing of the reroute can change which value controls.",
        ],
      };
    case "leave.sick_and_pickup_needs_sequence":
      return {
        status: "partial_answer",
        shortAnswer:
          "What happens to pay or credit here depends on whether the pickup overlaps the sick period or sits on separate days.",
        plainEnglishExplanation:
          "The answer changes depending on whether you called in sick first, picked up later, or the pickup overlapped the sick trip. That sequence determines which rule path applies.",
        assumptions: ["Assuming both a sick event and a pickup are part of this fact pattern."],
        followUpSuggestion:
          "Pin down the sequence of events before relying on one contract conclusion.",
        whatCouldChangeThisAnswer: [
          "Whether the pickup happened before or after the sick event.",
          "Whether the pickup overlapped the original sick trip.",
          "Whether the month was reserve or lineholder.",
        ],
        breakItDown: [
          "If the pickup is on separate days, the answer may be cleaner and more favorable to the pickup.",
          "If the pickup overlaps the sick trip, the interaction is more complicated and may reduce certainty.",
          "Monthly status can still change the final contract path.",
        ],
      };
    case "premium.greenslip_reserve_overlap_path":
      return {
        status: "partial_answer",
        shortAnswer:
          "Keep this on the Greenslip path. The non-overlap days should pay as Greenslip days, and the overlap day needs separate contract review before you assume extra premium there.",
        plainEnglishExplanation:
          "Because you explicitly described a Greenslip, this should not drift into inverse assignment logic. The overlap changes how the reserve day is evaluated, but it should not reclassify the whole three-day trip.",
        assumptions: [
          "Assuming this was a reserve month.",
          "Assuming only one reserve day overlaps and the other days do not.",
        ],
        followUpSuggestion:
          "Use Section 23 Greenslip language first, then check the overlapping reserve day separately against the reserve obligation.",
        whatCouldChangeThisAnswer: [
          "Whether more than one day overlaps reserve obligation.",
          "Whether the overlapping day was separately assigned or already protected.",
          "Whether the event was actually inverse assignment instead of Greenslip.",
        ],
        breakItDown: [
          "Day 1 and Day 3 should stay on the Greenslip pay path if they do not overlap reserve obligation.",
          "The overlapping reserve day is the part that needs a separate contract check before assuming duplicate premium or extra credit.",
          "Do not treat the whole trip like inverse assignment unless the facts actually show inverse assignment.",
        ],
      };
    case "premium.reserve_inverse_assignment_path":
      return {
        status: "answered",
        shortAnswer:
          "If this was a reserve inverse assignment, pay and credit should be analyzed under reserve assignment rules first, not ordinary lineholder premium pickup logic.",
        plainEnglishExplanation:
          "The operational result should be judged on the reserve-specific assignment path first. Treating it like ordinary lineholder premium flying would point you to the wrong rule family.",
        assumptions: ["Assuming this was a reserve month and the assignment was truly inverse assignment."],
        followUpSuggestion:
          "Use reserve assignment language first, then layer on any premium implications that still apply.",
        whatCouldChangeThisAnswer: [
          "Whether this was actually inverse assignment versus another pickup type.",
          "Whether the pilot was reserve for the month.",
        ],
        breakItDown: [
          "Start with reserve assignment treatment.",
          "Then check whether any premium or extra-credit layer still applies.",
        ],
      };
    case "dispute.citation_helper_contract_first":
      return {
        status: "answered",
        shortAnswer:
          "Lead with the PWA section first, then use scheduler-manual language only as supporting guidance.",
        plainEnglishExplanation:
          "If you are preparing a dispute, the governing contract language should anchor the explanation. Operational/manual guidance can support the story, but it should not replace the contract citation.",
        assumptions: [
          "Assuming the goal is to challenge or explain an outcome, not to estimate holdability or AE results.",
        ],
        followUpSuggestion:
          "Quote the PWA section first and then add scheduler-manual language only if it helps explain process or timing.",
        whatCouldChangeThisAnswer: [
          "Whether the manual contains a directly relevant operational procedure.",
          "Whether the dispute is really about pay, assignment, or leave interaction.",
        ],
        breakItDown: [
          "Lead with the contract citation.",
          "Use scheduler-manual language only to support process or timing explanation.",
        ],
      };
    default:
      return {
        status: "answered",
        shortAnswer: outcome?.outcomeStatement ?? outcome?.label ?? topRule.title,
        plainEnglishExplanation:
          outcome?.explanation ??
          "This is the strongest supported outcome statement for the current facts.",
        assumptions: [],
        followUpSuggestion: outcome?.nextActionHint,
        whatCouldChangeThisAnswer: genericWhatCouldChange,
        breakItDown: genericBreakdown,
      };
  }
}
