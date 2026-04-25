import { contractScenarioCatalog } from "../../data/contractCopilot/contractScenarioCatalog.ts";
import { contractRuleIndex } from "../../data/contractCopilot/contractRuleIndex.ts";
import type {
  ContractRule,
  ParsedScenarioFacts,
  RetrievedRuleSet,
  RuleType,
} from "../../types/contractCopilot.ts";

function conditionMatches(rule: ContractRule, facts: ParsedScenarioFacts) {
  return rule.conditions.every((condition) => {
    const factValue = facts[condition.field];

    if (condition.operator === "exists") {
      return condition.value === true ? factValue != null : factValue == null;
    }
    if (condition.operator === "equals") {
      return factValue === condition.value;
    }
    if (condition.operator === "not_equals") {
      return factValue !== condition.value;
    }
    if (condition.operator === "in") {
      return Array.isArray(condition.value) ? condition.value.includes(String(factValue)) : false;
    }
    return false;
  });
}

function sortByPreferredOrder(rules: ContractRule[], preferredRuleOrder: RuleType[]) {
  const weight = new Map(preferredRuleOrder.map((ruleType, index) => [ruleType, index]));
  return [...rules].sort((a, b) => {
    const ruleTypeDelta = (weight.get(a.ruleType) ?? 99) - (weight.get(b.ruleType) ?? 99);
    if (ruleTypeDelta !== 0) {
      return ruleTypeDelta;
    }
    return b.priority - a.priority;
  });
}

export function retrieveContractRules(
  scenario: RetrievedRuleSet["scenario"],
  facts: ParsedScenarioFacts,
  missingFacts: Array<keyof ParsedScenarioFacts>
): RetrievedRuleSet {
  if (!scenario) {
    return {
      scenario,
      matchedRules: [],
      supportingRules: [],
      missingFacts,
    };
  }

  const scenarioDefinition = contractScenarioCatalog.find((entry) => entry.id === scenario);
  const scenarioRules = contractRuleIndex.filter((rule) => rule.scenario === scenario);
  const matchedRules = scenarioRules.filter((rule) => conditionMatches(rule, facts));
  const supportingRules = scenarioRules.filter((rule) => !matchedRules.includes(rule));

  return {
    scenario,
    matchedRules: sortByPreferredOrder(
      matchedRules,
      scenarioDefinition?.preferredRuleOrder ?? ["contract", "scheduler_practice", "inference"]
    ),
    supportingRules: sortByPreferredOrder(
      supportingRules,
      scenarioDefinition?.preferredRuleOrder ?? ["contract", "scheduler_practice", "inference"]
    ),
    missingFacts,
  };
}
