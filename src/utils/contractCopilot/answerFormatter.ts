import type {
  ContractAnswerCard,
  ContractRule,
  ResolvedContractOutcome,
  RetrievedRuleSet,
  RuleType,
  SupportLevel,
} from "../../types/contractCopilot.ts";

function deriveSupportLevel(rules: ContractRule[]): SupportLevel {
  const ruleTypes = new Set(rules.map((rule) => rule.ruleType));
  if (ruleTypes.has("contract") && ruleTypes.size === 1) {
    return "contract_backed";
  }
  if (ruleTypes.has("scheduler_practice") && ruleTypes.size === 1) {
    return "manual_backed";
  }
  if (ruleTypes.has("contract") && ruleTypes.has("scheduler_practice")) {
    return "mixed";
  }
  return "inference_heavy";
}

function makeReferenceLabel(rule: ContractRule) {
  return `${rule.title} (${rule.ruleType.replace("_", " ")})`;
}

function formatScenarioLabel(scenario: RetrievedRuleSet["scenario"]) {
  switch (scenario) {
    case "status_basics":
      return "Reserve vs lineholder";
    case "reroute_reassignment":
      return "Reroute / reassignment";
    case "sick_leave_interaction":
      return "Sick / leave interaction";
    case "premium_pickup":
      return "How this pays";
    case "dispute_citation_helper":
      return "Dispute / citation helper";
    default:
      return "Unclassified question";
  }
}

function supportCaveat(ruleType: RuleType) {
  if (ruleType === "contract") {
    return null;
  }
  if (ruleType === "scheduler_practice") {
    return "Scheduler manual guidance is operational support, not the same thing as governing PWA language.";
  }
  return "This answer relies partly on inference because direct governing language is incomplete for the facts provided.";
}

export function formatContractAnswer(
  result: RetrievedRuleSet,
  resolvedOutcome: ResolvedContractOutcome
): ContractAnswerCard {
  const activeRules = result.matchedRules.length > 0 ? result.matchedRules : result.supportingRules;
  const topRule = activeRules[0] ?? null;

  if (!result.scenario) {
    return {
      status: resolvedOutcome.status,
      scenarioLabel: formatScenarioLabel(null),
      shortAnswer: resolvedOutcome.shortAnswer,
      plainEnglishExplanation: resolvedOutcome.plainEnglishExplanation,
      confidence: "low",
      supportLevel: "inference_heavy",
      assumptions: resolvedOutcome.assumptions,
      evidenceSummary: ["No scenario family matched with high confidence."],
      references: [],
      followUpSuggestion:
        resolvedOutcome.followUpSuggestion ??
        "Restate the question with the specific event, status, and timing.",
      whatCouldChangeThisAnswer: resolvedOutcome.whatCouldChangeThisAnswer,
      breakItDown: resolvedOutcome.breakItDown,
    };
  }

  if (result.missingFacts.length > 0) {
    return {
      status: resolvedOutcome.status,
      scenarioLabel: formatScenarioLabel(result.scenario),
      shortAnswer: resolvedOutcome.shortAnswer,
      plainEnglishExplanation: resolvedOutcome.plainEnglishExplanation,
      confidence: "medium",
      supportLevel: deriveSupportLevel(activeRules),
      assumptions: resolvedOutcome.assumptions,
      missingFacts: result.missingFacts,
      evidenceSummary: activeRules.map((rule) => rule.summary),
      references: activeRules.flatMap((rule) =>
        rule.references.map((reference) => ({
          label: makeReferenceLabel(rule),
          sourceId: reference.sourceId,
          section: reference.section,
          pageHint: reference.pageHint,
          quoteSnippet: reference.quoteSnippet,
          ruleType: rule.ruleType,
          }))
      ),
      followUpSuggestion:
        resolvedOutcome.followUpSuggestion ??
        "Answer the clarifying question so the tool can choose the right rule path.",
      whatCouldChangeThisAnswer: resolvedOutcome.whatCouldChangeThisAnswer,
      breakItDown: resolvedOutcome.breakItDown,
    };
  }

  if (!topRule) {
    return {
      status: resolvedOutcome.status,
      scenarioLabel: formatScenarioLabel(result.scenario),
      shortAnswer: resolvedOutcome.shortAnswer,
      plainEnglishExplanation: resolvedOutcome.plainEnglishExplanation,
      confidence: "low",
      supportLevel: "inference_heavy",
      assumptions: resolvedOutcome.assumptions,
      evidenceSummary: ["No matching rule seed was found."],
      references: [],
      followUpSuggestion:
        resolvedOutcome.followUpSuggestion ??
        "Surface the closest contract section and expand the rule set for this fact pattern.",
      whatCouldChangeThisAnswer: resolvedOutcome.whatCouldChangeThisAnswer,
      breakItDown: resolvedOutcome.breakItDown,
    };
  }

  const caveats = Array.from(
    new Set(activeRules.map((rule) => supportCaveat(rule.ruleType)).filter(Boolean) as string[])
  );

  return {
    status: resolvedOutcome.status,
    scenarioLabel: formatScenarioLabel(result.scenario),
    shortAnswer: resolvedOutcome.shortAnswer,
    plainEnglishExplanation: resolvedOutcome.plainEnglishExplanation,
    confidence: topRule.confidenceBase,
    supportLevel: deriveSupportLevel(activeRules),
    assumptions: resolvedOutcome.assumptions,
    evidenceSummary: activeRules.map((rule) => rule.summary),
    references: activeRules.flatMap((rule) =>
      rule.references.map((reference) => ({
        label: makeReferenceLabel(rule),
        sourceId: reference.sourceId,
        section: reference.section,
        pageHint: reference.pageHint,
        quoteSnippet: reference.quoteSnippet,
        ruleType: rule.ruleType,
      }))
    ),
    followUpSuggestion:
      resolvedOutcome.followUpSuggestion ??
      topRule.outcomes[0]?.nextActionHint ??
      "If you plan to challenge the outcome, lead with the governing PWA reference first.",
    whatCouldChangeThisAnswer: resolvedOutcome.whatCouldChangeThisAnswer,
    breakItDown: resolvedOutcome.breakItDown,
    caveats: caveats.length > 0 ? caveats : undefined,
  };
}
