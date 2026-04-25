import type { ParsedScenarioFacts } from "../../../types/contractCopilot.ts";

export type InteractionRuleSource = "pwa" | "compensation_manual" | "scheduler_manual";

export type ContractInteractionRule = {
  id: string;
  title: string;
  primaryFamily: string;
  interactingFamilies: string[];
  interactionType: string;
  appliesWhen: {
    questionSignals: string[];
    factSignals?: string[];
    requiredFacts?: Array<keyof ParsedScenarioFacts>;
    optionalFacts?: Array<keyof ParsedScenarioFacts>;
  };
  governingSources: Array<{
    source: InteractionRuleSource;
    section: string;
    title?: string;
  }>;
  reasoningSteps: string[];
  preventsDriftFrom: string[];
  retrievalBoostTerms: string[];
  ruleSummary: string;
};

export type MatchedInteractionRule = {
  id: string;
  title: string;
  primaryFamily: string;
  interactingFamilies: string[];
  interactionType: string;
  appliesWhen: ContractInteractionRule["appliesWhen"];
  governingSources: ContractInteractionRule["governingSources"];
  reasoningSteps: string[];
  preventsDriftFrom: string[];
  retrievalBoostTerms: string[];
  ruleSummary: string;
  matchedSignals: string[];
};

const sourcePriority: Record<InteractionRuleSource, number> = {
  pwa: 3,
  compensation_manual: 2,
  scheduler_manual: 1,
};

export const contractCopilotInteractionRules: ContractInteractionRule[] = [
  {
    id: "sick_greenslip_sequence_and_overlap",
    title: "Sick plus Greenslip sequence and overlap",
    primaryFamily: "sick_leave",
    interactingFamilies: ["greenslip", "pay", "credit", "bank"],
    interactionType: "overlap_vs_after_sick",
    appliesWhen: {
      questionSignals: ["sick", "greenslip"],
      factSignals: ["greenslip"],
      optionalFacts: ["sickUsed", "pickupType", "premiumType", "interactionRelationship", "sameDayInteraction"],
    },
    governingSources: [
      { source: "pwa", section: "Section 14 E", title: "Sick leave rejoin / add rotation rule" },
      { source: "pwa", section: "Section 14 E and Example Three", title: "Sick plus GS worked example" },
      { source: "pwa", section: "Section 23 Q Example one/two/three", title: "GS / GSWC sick-leave examples" },
    ],
    reasoningSteps: [
      "Start with sequence: determine whether the Greenslip overlapped the sick day or started after sick leave ended.",
      "Keep the dimensions separate if the contract does: overlap-day pay treatment, overlap-day credit treatment, sick-bank replenishment, and later GS day treatment.",
      "If a worked example matches the family, use it heavily alongside the governing section instead of answering from one isolated sentence.",
      "Do not assume the overlap day and the later GS days are treated identically if the example distinguishes them.",
    ],
    preventsDriftFrom: [
      "flattening pay and credit into one label",
      "treating replenishment as the same thing as pay",
      "answering from generic sick/pickup sequence language without the GS example",
      "treating later GS days the same as the overlap day without support",
    ],
    retrievalBoostTerms: [
      "section 14 e",
      "example three",
      "green slip",
      "gs or gswc",
      "replenish the pilot's available sick leave hours",
      "single pay no credit",
      "lesser of the alv or 75 hours",
      "scheduled to operate after the pilot is well",
    ],
    ruleSummary:
      "Sick plus Greenslip questions should first resolve overlap versus after-sick sequence, then preserve separate treatment for pay, credit, sick-bank replenishment, and any later GS days if the contract example distinguishes them.",
  },
  {
    id: "greenslip_overlapping_reserve_day",
    title: "Greenslip overlapping reserve day or long call",
    primaryFamily: "greenslip",
    interactingFamilies: ["reserve"],
    interactionType: "overlap",
    appliesWhen: {
      questionSignals: ["green slip", "greenslip", "gs", "reserve"],
      factSignals: ["greenslip", "reserve"],
      optionalFacts: ["status", "pickupType", "premiumType", "sameDayInteraction"],
    },
    governingSources: [
      { source: "pwa", section: "Section 23 Q", title: "Greenslip governing language" },
      { source: "pwa", section: "Section 4 F.7.d", title: "Greenslip with conflict" },
      { source: "pwa", section: "Section 23 reserve GS long call language", title: "Long call 18-hour rule" },
      { source: "scheduler_manual", section: "Reserve / premium handling guidance", title: "Operational context" },
    ],
    reasoningSteps: [
      "Start from Greenslip as the governing premium type if the pilot explicitly says Greenslip or GS.",
      "Separate clean non-conflict days from reserve-conflict or overlap days instead of treating the whole event as one bucket.",
      "If the overlap is with long call reserve, check first for the explicit 18-hour long-call GS rule before generic overlap reasoning.",
      "Check whether the contract has a specific conflict or reserve-overlap carveout before falling back to generic reserve reasoning.",
    ],
    preventsDriftFrom: [
      "generic reserve override logic",
      "inverse assignment drift",
      "whole-trip overlap reasoning when the contract treats days differently",
      "missing the long-call 18-hour carveout when it is explicit",
    ],
    retrievalBoostTerms: [
      "greenslip on reserve",
      "green slips with conflict",
      "reserve overlap greenslip",
      "x-day greenslip",
      "long call reserve pilot",
      "within 18 hours of first attempted contact",
      "single pay no credit first duty period",
    ],
    ruleSummary:
      "A Greenslip that touches reserve time should stay on the Greenslip path first, then split clean days from conflict days, and apply any explicit long-call or reserve-overlap carveout before generic inference.",
  },
  {
    id: "apd_eligibility_on_reserve",
    title: "APD eligibility on reserve",
    primaryFamily: "apd_pd",
    interactingFamilies: ["reserve"],
    interactionType: "eligibility_threshold",
    appliesWhen: {
      questionSignals: ["apd", "authorized personal drop", "reserve"],
      factSignals: ["reserve"],
      optionalFacts: ["status"],
    },
    governingSources: [
      { source: "pwa", section: "Section 23 I.10", title: "APD request on reserve" },
      { source: "scheduler_manual", section: "PD / APD reserve processing guidance", title: "Operational guidance" },
    ],
    reasoningSteps: [
      "Treat this as an APD eligibility question first, not a generic reserve-coverage question.",
      "Lead with the specific APD threshold and exception language in Section 23 I.10.",
      "Only use broader reserve-availability concepts after checking whether the governing APD language already answers the question.",
    ],
    preventsDriftFrom: [
      "generic reserve coverage reasoning",
      "Greenslip or premium pickup drift",
      "treating full required minimum as the same test as the APD threshold",
    ],
    retrievalBoostTerms: [
      "authorized personal drop",
      "section 23 i.10",
      "25% of reserves required",
      "reserve availability apd",
    ],
    ruleSummary:
      "APD on reserve should be answered from the APD-specific eligibility language first, especially the threshold and any listed exceptions, before generic reserve reasoning.",
  },
  {
    id: "reroute_timing_and_pay_impact",
    title: "Reroute timing and pay impact",
    primaryFamily: "reroute",
    interactingFamilies: ["timing", "pay"],
    interactionType: "timing_reclassification",
    appliesWhen: {
      questionSignals: ["reroute", "rerouted", "reassignment", "after report", "pay", "credit"],
      factSignals: ["reroute", "reassignment"],
      optionalFacts: ["eventTiming", "rerouteOccurred", "reassignmentOccurred"],
    },
    governingSources: [
      { source: "pwa", section: "Section 23 K", title: "Reroute / reassignment" },
      { source: "compensation_manual", section: "Reroute pay application", title: "How pay is applied" },
      { source: "scheduler_manual", section: "Reroute handling procedures", title: "Operational guidance" },
    ],
    reasoningSteps: [
      "Classify whether the event is reroute or reassignment before describing pay effects.",
      "Use timing, especially before report versus after report, as part of the governing analysis rather than as a side note.",
      "Compare the original duty sequence with the changed sequence before describing pay or credit impact.",
    ],
    preventsDriftFrom: [
      "generic pay-protection answers before classification",
      "ignoring timing distinctions",
      "definition drift between reroute and reassignment",
    ],
    retrievalBoostTerms: [
      "reroute after report",
      "reroute pay",
      "changed trip value",
      "original trip changed trip",
      "reassignment definition",
    ],
    ruleSummary:
      "Reroute pay questions should be timing-led and classification-led: determine reroute versus reassignment, then compare the original and changed sequence under the governing section.",
  },
];

function questionIncludesAll(questionLower: string, signals: string[]) {
  return signals.every((signal) => {
    if (signal === "gs") {
      return /\bgs\b/.test(questionLower);
    }
    return questionLower.includes(signal.toLowerCase());
  });
}

function questionIncludesAny(questionLower: string, signals: string[]) {
  return signals.some((signal) => {
    if (signal === "gs") {
      return /\bgs\b/.test(questionLower);
    }
    return questionLower.includes(signal.toLowerCase());
  });
}

function factsMatchRule(facts: ParsedScenarioFacts, rule: ContractInteractionRule) {
  const factSignals = rule.appliesWhen.factSignals ?? [];
  if (factSignals.length === 0) {
    return false;
  }

  return factSignals.some((signal) => {
    switch (signal) {
      case "greenslip":
        return facts.pickupType === "greenslip" || facts.premiumType === "greenslip";
      case "reserve":
        return facts.status === "reserve";
      case "overlap":
        return facts.sameDayInteraction === true;
      case "reroute":
        return facts.rerouteOccurred === true;
      case "reassignment":
        return facts.reassignmentOccurred === true;
      default:
        return false;
    }
  });
}

export function retrieveInteractionRules(args: {
  question: string;
  facts?: ParsedScenarioFacts;
}) {
  const questionLower = args.question.toLowerCase();
  const facts = args.facts ?? {};

  const matches = contractCopilotInteractionRules
    .flatMap<MatchedInteractionRule>((rule) => {
      const matchedSignals = new Set<string>();
      const matchedQuestionSignals = rule.appliesWhen.questionSignals.filter((signal) =>
        signal === "gs" ? /\bgs\b/.test(questionLower) : questionLower.includes(signal.toLowerCase())
      );

      if (factsMatchRule(facts, rule)) {
        matchedSignals.add("fact_match");
      }

      if (rule.id === "greenslip_overlapping_reserve_day") {
        if (
          questionIncludesAny(questionLower, ["green slip", "greenslip", "gs"]) &&
          questionLower.includes("reserve") &&
          (
            questionLower.includes("overlap") ||
            questionLower.includes("conflict") ||
            questionLower.includes("x-day") ||
            questionLower.includes("long call")
          )
        ) {
          matchedSignals.add("greenslip_reserve_overlap_pattern");
        }
      }

      if (rule.id === "apd_eligibility_on_reserve") {
        if (
          questionIncludesAny(questionLower, ["apd", "authorized personal drop"]) &&
          questionLower.includes("reserve")
        ) {
          matchedSignals.add("apd_reserve_pattern");
        }
      }

      if (rule.id === "sick_greenslip_sequence_and_overlap") {
        if (
          questionLower.includes("sick") &&
          questionIncludesAny(questionLower, ["green slip", "greenslip", "gs"]) &&
          (
            questionLower.includes("overlap") ||
            questionLower.includes("after sick") ||
            questionLower.includes("after the sick") ||
            questionLower.includes("called in sick") ||
            questionLower.includes("picked up")
          )
        ) {
          matchedSignals.add("sick_greenslip_pattern");
        }
      }

      if (rule.id === "reroute_timing_and_pay_impact") {
        if (
          questionLower.includes("reroute") &&
          (questionLower.includes("after report") ||
            questionLower.includes("deadhead") ||
            questionLower.includes("before report") ||
            questionLower.includes("pay") ||
            questionLower.includes("credit"))
        ) {
          matchedSignals.add("reroute_timing_pattern");
        }
      }

      if (rule.id !== "greenslip_overlapping_reserve_day" && matchedQuestionSignals.length >= 2) {
        for (const signal of matchedQuestionSignals) {
          matchedSignals.add(signal);
        }
      }

      if (matchedSignals.size === 0) {
        return [];
      }

      return [
        {
          id: rule.id,
          title: rule.title,
          primaryFamily: rule.primaryFamily,
          interactingFamilies: rule.interactingFamilies,
          interactionType: rule.interactionType,
          appliesWhen: rule.appliesWhen,
          governingSources: rule.governingSources,
          reasoningSteps: rule.reasoningSteps,
          preventsDriftFrom: rule.preventsDriftFrom,
          retrievalBoostTerms: rule.retrievalBoostTerms,
          ruleSummary: rule.ruleSummary,
          matchedSignals: Array.from(matchedSignals),
        },
      ];
    })
    .sort((left, right) => {
      const leftScore = Math.max(...left.governingSources.map((source) => sourcePriority[source.source]));
      const rightScore = Math.max(...right.governingSources.map((source) => sourcePriority[source.source]));
      return rightScore - leftScore;
    });

  return matches;
}

export function scoreSearchableAgainstInteractionRules(searchable: string, matches: MatchedInteractionRule[]) {
  const lower = searchable.toLowerCase();
  const matchedSignals: string[] = [];
  let score = 0;

  for (const match of matches) {
    let matchedBoost = false;

    for (const term of match.retrievalBoostTerms) {
      if (!lower.includes(term.toLowerCase())) {
        continue;
      }
      matchedBoost = true;
      score += term.length > 18 ? 18 : 10;
      matchedSignals.push(`interaction_rule_boost:${match.id}:${term}`);
    }

    for (const drift of match.preventsDriftFrom) {
      if (!lower.includes(drift.toLowerCase())) {
        continue;
      }
      if (matchedBoost) {
        continue;
      }
      score -= 10;
      matchedSignals.push(`interaction_rule_penalty:${match.id}:${drift}`);
    }
  }

  return { score, matchedSignals };
}

export function determineSourcePriorityForQuestion(question: string) {
  const lower = question.toLowerCase();
  const isPayQuestion =
    lower.includes("pay") ||
    lower.includes("paid") ||
    lower.includes("credit") ||
    lower.includes("compensation") ||
    lower.includes("how will it pay");

  return isPayQuestion
    ? [
        { sourceLabel: "PWA" as const, tier: "pwa" as const },
        { sourceLabel: "Compensation Manual" as const, tier: "compensation_manual" as const },
        { sourceLabel: "Scheduler Manual" as const, tier: "scheduler_manual" as const },
        { sourceLabel: "CrewTools Logic" as const, tier: "crewtools_logic" as const },
      ]
    : [
        { sourceLabel: "PWA" as const, tier: "pwa" as const },
        { sourceLabel: "Compensation Manual" as const, tier: "compensation_manual" as const },
        { sourceLabel: "Scheduler Manual" as const, tier: "scheduler_manual" as const },
        { sourceLabel: "CrewTools Logic" as const, tier: "crewtools_logic" as const },
      ];
}
