import { contractRuleIndex } from "../../../data/contractCopilot/contractRuleIndex.ts";
import type { CopilotScenarioFamily, ParsedScenarioFacts, RuleType } from "../../../types/contractCopilot.ts";
import { getActiveKnownInteractionRules, scoreSearchableAgainstKnownInteractionRules } from "../../retrieval/contracts/knownInteractionRules.ts";

export type RetrievedContractSnippet = {
  id: string;
  ruleId: string;
  scenario: CopilotScenarioFamily;
  title: string;
  summary: string;
  sourceId: "pwa" | "scheduler_manual";
  section: string;
  quoteSnippet?: string;
  note: string;
  ruleType: RuleType;
  score: number;
  matchedTerms: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "day",
  "days",
  "do",
  "for",
  "get",
  "got",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "may",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "was",
  "what",
  "will",
  "with",
]);

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function hasInteractionSignals(questionLower: string, facts: ParsedScenarioFacts) {
  return (
    questionLower.includes("sick") ||
    questionLower.includes("pickup") ||
    questionLower.includes("greenslip") ||
    questionLower.includes("green slip") ||
    /\bgs\b/.test(questionLower) ||
    questionLower.includes("overlap") ||
    questionLower.includes("called in sick") ||
    questionLower.includes("long call") ||
    questionLower.includes("reroute") ||
    questionLower.includes("reassign") ||
    /\bapd\b/.test(questionLower) ||
    questionLower.includes("authorized personal drop") ||
    facts.sickUsed === true ||
    Boolean(facts.pickupType) ||
    Boolean(facts.premiumType) ||
    facts.sameDayInteraction === true ||
    Boolean(facts.leaveType) ||
    facts.rerouteOccurred === true ||
    facts.reassignmentOccurred === true
  );
}

function isPureAlvGuaranteeIntent(questionLower: string, facts: ParsedScenarioFacts) {
  const mentionsGuarantee =
    questionLower.includes("minimum daily guarantee") ||
    questionLower.includes("daily guarantee") ||
    questionLower.includes("minimum guarantee") ||
    questionLower.includes("reserve guarantee") ||
    questionLower.includes("line guarantee") ||
    /\badg\b/.test(questionLower);
  const mentionsAlv =
    /\balv\b/.test(questionLower) || questionLower.includes("average line value");

  return (mentionsGuarantee || mentionsAlv) && !hasInteractionSignals(questionLower, facts);
}

function inferScenarioHints(questionLower: string, facts: ParsedScenarioFacts, deterministicScenario?: string) {
  const hints = new Set<CopilotScenarioFamily>();
  const pureAlvGuaranteeIntent = isPureAlvGuaranteeIntent(questionLower, facts);

  if (
    questionLower.includes("green slip") ||
    questionLower.includes("greenslip") ||
    /\bgs\b/.test(questionLower) ||
    questionLower.includes("inverse assignment") ||
    questionLower.includes("quick slip") ||
    questionLower.includes("premium") ||
    questionLower.includes("pickup") ||
    questionLower.includes("pay")
  ) {
    hints.add("premium_pickup");
  }
  if (questionLower.includes("reroute") || questionLower.includes("reassign")) {
    hints.add("reroute_reassignment");
  }
  if (
    questionLower.includes("sick") ||
    questionLower.includes("vacation") ||
    questionLower.includes("leave") ||
    questionLower.includes("well")
  ) {
    hints.add("sick_leave_interaction");
  }
  if (
    questionLower.includes("reserve") ||
    questionLower.includes("lineholder") ||
    questionLower.includes("days off") ||
    questionLower.includes("x-day")
  ) {
    hints.add("status_basics");
  }
  if (pureAlvGuaranteeIntent) {
    hints.add("status_basics");
  }

  if (facts.pickupType || facts.premiumType) {
    hints.add("premium_pickup");
  }
  if (facts.rerouteOccurred || facts.reassignmentOccurred || facts.assignmentType?.includes("reroute")) {
    hints.add("reroute_reassignment");
  }
  if (facts.sickUsed || facts.leaveType) {
    hints.add("sick_leave_interaction");
  }
  if (facts.status) {
    hints.add("status_basics");
  }

  switch ((deterministicScenario ?? "").trim().toLowerCase()) {
    case "reserve vs lineholder":
      hints.add("status_basics");
      break;
    case "reroute / reassignment":
      hints.add("reroute_reassignment");
      break;
    case "sick / leave interaction":
      hints.add("sick_leave_interaction");
      break;
    case "how this pays":
      hints.add("premium_pickup");
      break;
    case "dispute / citation helper":
      hints.add("dispute_citation_helper");
      break;
    default:
      break;
  }

  return hints;
}

function collectFactTerms(facts: ParsedScenarioFacts) {
  const terms = new Set<string>();

  if (facts.status) {
    terms.add(facts.status);
  }
  if (facts.assignmentType) {
    terms.add(facts.assignmentType.toLowerCase());
  }
  if (facts.pickupType) {
    terms.add(facts.pickupType.toLowerCase());
  }
  if (facts.premiumType) {
    terms.add(facts.premiumType.toLowerCase());
  }
  if (facts.leaveType) {
    terms.add(facts.leaveType.toLowerCase());
  }
  if (facts.sickUsed) {
    terms.add("sick");
  }
  if (facts.sameDayInteraction) {
    terms.add("overlap");
    terms.add("conflict");
  }
  if (facts.rerouteOccurred) {
    terms.add("reroute");
  }
  if (facts.reassignmentOccurred) {
    terms.add("reassignment");
  }

  return Array.from(terms);
}

function scoreSnippet(args: {
  snippetText: string;
  title: string;
  summary: string;
  section: string;
  scenario: CopilotScenarioFamily;
  appliesTo: Array<"lineholder" | "reserve" | "both">;
  tokens: string[];
  questionLower: string;
  scenarioHints: Set<CopilotScenarioFamily>;
  factTerms: string[];
  facts: ParsedScenarioFacts;
  status?: "reserve" | "lineholder";
}) {
  const searchable = `${args.title} ${args.summary} ${args.section} ${args.snippetText}`.toLowerCase();
  const matchedTerms = new Set<string>();
  let score = 0;
  const explicitLongCallQuestion = args.questionLower.includes("long call");
  const explicitGuaranteeQuestion =
    args.questionLower.includes("minimum daily guarantee") ||
    args.questionLower.includes("daily guarantee") ||
    args.questionLower.includes("minimum guarantee") ||
    args.questionLower.includes("reserve guarantee") ||
    args.questionLower.includes("line guarantee") ||
    /\badg\b/.test(args.questionLower);
  const explicitAlvQuestion =
    /\balv\b/.test(args.questionLower) || args.questionLower.includes("average line value");
  const pureAlvGuaranteeIntent = isPureAlvGuaranteeIntent(args.questionLower, args.facts);
  const explicitSickGreenslipQuestion =
    (args.questionLower.includes("sick") || args.questionLower.includes("called in sick")) &&
    (args.questionLower.includes("green slip") || args.questionLower.includes("greenslip") || /\bgs\b/.test(args.questionLower));
  const explicitGreenslipQuestion =
    args.questionLower.includes("green slip") || args.questionLower.includes("greenslip") || /\bgs\b/.test(args.questionLower);
  const explicitGreenslipLongCallQuestion =
    explicitGreenslipQuestion &&
    explicitLongCallQuestion &&
    (args.questionLower.includes("overlap") || args.questionLower.includes("within 18") || args.questionLower.includes("18 hour"));

  if (args.scenarioHints.has(args.scenario)) {
    score += 10;
  }
  if (args.status && (args.appliesTo.includes(args.status) || args.appliesTo.includes("both"))) {
    score += 3;
  }

  for (const token of args.tokens) {
    if (searchable.includes(token)) {
      matchedTerms.add(token);
      score += args.snippetText.toLowerCase().includes(token) ? 4 : 2;
    }
  }

  for (const factTerm of args.factTerms) {
    if (factTerm && searchable.includes(factTerm)) {
      matchedTerms.add(factTerm);
      score += 4;
    }
  }

  if (
    explicitGreenslipQuestion &&
    searchable.includes("green slip")
  ) {
    score += 10;
    matchedTerms.add("greenslip");
  }

  if (explicitGreenslipQuestion && searchable.includes("inverse assignment")) {
    score -= 8;
  }

  if (args.questionLower.includes("inverse assignment") && searchable.includes("green slip")) {
    score -= 8;
  }

  if (args.questionLower.includes("reserve") && searchable.includes("reserve")) {
    score += 4;
    matchedTerms.add("reserve");
  }

  if (
    explicitGuaranteeQuestion &&
    (searchable.includes("minimum daily guarantee") ||
      searchable.includes("daily guarantee") ||
      searchable.includes("line guarantee") ||
      searchable.includes("reserve guarantee"))
  ) {
    score += 16;
    matchedTerms.add("minimum guarantee");
  }
  if (
    explicitGuaranteeQuestion &&
    (searchable.includes("green slip") ||
      searchable.includes("greenslip") ||
      searchable.includes("authorized personal drop") ||
      searchable.includes("apd"))
  ) {
    score -= 12;
  }
  if (
    pureAlvGuaranteeIntent &&
    (searchable.includes("average line value") ||
      /\balv\b/.test(searchable) ||
      searchable.includes("adg") ||
      searchable.includes("regular line guarantee") ||
      searchable.includes("reserve guarantee") ||
      searchable.includes("minimum pay and credit guarantees") ||
      searchable.includes("section 4 b") ||
      searchable.includes("section 4 c") ||
      searchable.includes("section 22"))
  ) {
    score += 18;
    matchedTerms.add(explicitAlvQuestion ? "alv" : "guarantee");
  }
  if (
    pureAlvGuaranteeIntent &&
    args.questionLower.includes("reserve") &&
    (searchable.includes("reserve guarantee") ||
      searchable.includes("alv minus two hours") ||
      searchable.includes("reserve pilot"))
  ) {
    score += 12;
    matchedTerms.add("reserve guarantee");
  }
  if (
    pureAlvGuaranteeIntent &&
    args.questionLower.includes("lineholder") &&
    (searchable.includes("line guarantee") ||
      searchable.includes("regular line guarantee") ||
      searchable.includes("regular line value"))
  ) {
    score += 12;
    matchedTerms.add("line guarantee");
  }
  if (
    pureAlvGuaranteeIntent &&
    (searchable.includes("section 14 e") ||
      searchable.includes("example three") ||
      searchable.includes("replenish") ||
      searchable.includes("sick leave") ||
      searchable.includes("called in sick") ||
      searchable.includes("pickup") ||
      (searchable.includes("single pay") && searchable.includes("no credit")))
  ) {
    score -= 34;
  }
  if (
    pureAlvGuaranteeIntent &&
    !(
      searchable.includes("average line value") ||
      /\balv\b/.test(searchable) ||
      searchable.includes("adg") ||
      searchable.includes("regular line guarantee") ||
      searchable.includes("line guarantee") ||
      searchable.includes("reserve guarantee") ||
      searchable.includes("minimum pay and credit guarantees") ||
      searchable.includes("section 4 b") ||
      searchable.includes("section 4 c") ||
      searchable.includes("section 22")
    )
  ) {
    score -= 18;
  }

  if (
    explicitGreenslipLongCallQuestion &&
    (searchable.includes("long call reserve pilot") ||
      (searchable.includes("long call") && searchable.includes("green slip")) ||
      (searchable.includes("long call") && searchable.includes("gs")))
  ) {
    score += 24;
    matchedTerms.add("long call");
  }
  if (
    explicitGreenslipLongCallQuestion &&
    (searchable.includes("within 18 hours of first attempted contact") ||
      searchable.includes("within 18 hours of initial attempt to contact") ||
      searchable.includes("18 hours of first attempted contact"))
  ) {
    score += 28;
    matchedTerms.add("18-hour rule");
  }
  if (
    explicitGreenslipLongCallQuestion &&
    searchable.includes("single pay") &&
    searchable.includes("no credit") &&
    searchable.includes("first duty period")
  ) {
    score += 28;
    matchedTerms.add("single pay no credit");
  }
  if (
    explicitSickGreenslipQuestion &&
    (searchable.includes("section 14 e") ||
      searchable.includes("section 14") ||
      searchable.includes("section 23 q"))
  ) {
    score += 16;
    matchedTerms.add("sick + gs");
  }
  if (
    explicitSickGreenslipQuestion &&
    (searchable.includes("example three") || searchable.includes("example four"))
  ) {
    score += 24;
    matchedTerms.add("worked example");
  }
  if (
    explicitSickGreenslipQuestion &&
    searchable.includes("replenish") &&
    searchable.includes("sick leave")
  ) {
    score += 24;
    matchedTerms.add("replenishment");
  }
  if (
    explicitSickGreenslipQuestion &&
    searchable.includes("single pay") &&
    searchable.includes("no credit")
  ) {
    score += 24;
    matchedTerms.add("single pay no credit");
  }
  if (
    explicitSickGreenslipQuestion &&
    searchable.includes("lesser of the alv") &&
    searchable.includes("75 hours")
  ) {
    score += 16;
    matchedTerms.add("alv or 75");
  }
  if (
    explicitSickGreenslipQuestion &&
    searchable.includes("scheduled to operate after the pilot is well")
  ) {
    score += 14;
    matchedTerms.add("after well");
  }

  if (/\bapd\b/.test(args.questionLower) || args.questionLower.includes("authorized personal drop")) {
    if (searchable.includes("authorized personal drop") || /\bapd\b/.test(searchable)) {
      score += 16;
      matchedTerms.add("apd");
    }
    if (searchable.includes("section 23 i")) {
      score += 14;
      matchedTerms.add("section 23 i");
    }
    if (
      (args.questionLower.includes("reserve coverage") ||
        args.questionLower.includes("required minimum") ||
        args.questionLower.includes("required coverage")) &&
      (searchable.includes("25% of the number of reserves required") ||
        searchable.includes("25% of the number of reserves") ||
        searchable.includes("25 of the number of reserves required") ||
        searchable.includes("reserves available in the category is at least 25"))
    ) {
      score += 22;
      matchedTerms.add("25% threshold");
    }
    if (searchable.includes("reserve")) {
      score += 4;
      matchedTerms.add("reserve");
    }
    if (
      (searchable.includes("greenslip") ||
        searchable.includes("green slip") ||
        searchable.includes("inverse assignment") ||
        searchable.includes("overlap")) &&
      !(searchable.includes("authorized personal drop") || /\bapd\b/.test(searchable))
    ) {
      score -= 14;
    }
  }

  if (
    (args.questionLower.includes("overlap") || args.questionLower.includes("conflict")) &&
    (searchable.includes("conflict") || searchable.includes("x-day") || searchable.includes("overlap"))
  ) {
    score += 5;
    matchedTerms.add("overlap");
  }

  if (args.questionLower.includes("reroute") && searchable.includes("reroute")) {
    score += 8;
    matchedTerms.add("reroute");
  }

  if (args.questionLower.includes("sick") && searchable.includes("sick")) {
    score += 8;
    matchedTerms.add("sick");
  }
  if (
    pureAlvGuaranteeIntent &&
    (searchable.includes("greenslip") ||
      searchable.includes("green slip") ||
      searchable.includes("inverse assignment") ||
      searchable.includes("overlap") ||
      searchable.includes("vacation"))
  ) {
    score -= 18;
  }
  if (
    explicitSickGreenslipQuestion &&
    searchable.includes("reserve guarantee") &&
    !(searchable.includes("sick") || searchable.includes("green slip") || searchable.includes("greenslip"))
  ) {
    score -= 12;
  }

  if (args.questionLower.includes("days off") && (searchable.includes("x-day") || searchable.includes("days-off"))) {
    score += 7;
    matchedTerms.add("days off");
  }

  if (
    explicitGreenslipLongCallQuestion &&
    searchable.includes("overlap") &&
    !(searchable.includes("long call") || searchable.includes("18 hours") || searchable.includes("first attempted contact"))
  ) {
    score -= 8;
  }

  return {
    score,
    matchedTerms: Array.from(matchedTerms),
  };
}

export function retrieveContractCopilotSnippets(args: {
  question: string;
  rememberedFacts?: ParsedScenarioFacts;
  deterministicScenario?: string;
  maxSnippets?: number;
}) {
  const questionLower = args.question.toLowerCase();
  const tokens = tokenize(args.question);
  const facts = args.rememberedFacts ?? {};
  const pureAlvGuaranteeIntent = isPureAlvGuaranteeIntent(questionLower, facts);
  const explicitSickGreenslipQuestion =
    (questionLower.includes("sick") || questionLower.includes("called in sick")) &&
    (questionLower.includes("green slip") || questionLower.includes("greenslip") || /\bgs\b/.test(questionLower));
  const scenarioHints = inferScenarioHints(questionLower, facts, args.deterministicScenario);
  const factTerms = collectFactTerms(facts);
  const activeKnownInteractionRules = getActiveKnownInteractionRules({
    question: args.question,
    facts,
  });

  const scored: RetrievedContractSnippet[] = [];

  for (const rule of contractRuleIndex) {
    for (const [referenceIndex, reference] of rule.references.entries()) {
      const snippetText = reference.quoteSnippet?.trim() ?? "";
      const { score, matchedTerms } = scoreSnippet({
        snippetText,
        title: rule.title,
        summary: rule.summary,
        section: reference.section,
        scenario: rule.scenario,
        appliesTo: rule.appliesTo,
        tokens,
        questionLower,
        scenarioHints,
        factTerms,
        facts,
        status: facts.status,
      });

      if (pureAlvGuaranteeIntent && rule.scenario === "sick_leave_interaction") {
        continue;
      }
      if (
        pureAlvGuaranteeIntent &&
        !(
          reference.section.includes("Section 4") ||
          reference.section.includes("Section 22") ||
          snippetText.toLowerCase().includes("average line value") ||
          /\balv\b/.test(snippetText.toLowerCase()) ||
          snippetText.toLowerCase().includes("guarantee") ||
          rule.summary.toLowerCase().includes("guarantee")
        )
      ) {
        continue;
      }
      if (
        explicitSickGreenslipQuestion &&
        !(
          rule.scenario === "sick_leave_interaction" ||
          (reference.section.includes("Section 14") && /green slip|greenslip|gswc/i.test(snippetText)) ||
          (reference.section.includes("Section 23 Q") && /sick|well/i.test(snippetText))
        )
      ) {
        continue;
      }

      const knownInteractionScore = scoreSearchableAgainstKnownInteractionRules(
        `${rule.title} ${rule.summary} ${reference.section} ${snippetText}`,
        activeKnownInteractionRules
      );

      const totalScore = score + knownInteractionScore.score;

      if (totalScore <= 0) {
        continue;
      }

      scored.push({
        id: `${rule.id}:${reference.section}:${referenceIndex}`,
        ruleId: rule.id,
        scenario: rule.scenario,
        title: rule.title,
        summary: rule.summary,
        sourceId: reference.sourceId,
        section: reference.section,
        quoteSnippet: reference.quoteSnippet?.trim(),
        note: rule.title,
        ruleType: rule.ruleType,
        score: totalScore,
        matchedTerms: Array.from(new Set([...matchedTerms, ...knownInteractionScore.matchedSignals])),
      });
    }
  }

  const deduped = new Map<string, RetrievedContractSnippet>();
  for (const snippet of scored.sort((left, right) => right.score - left.score)) {
    const key = `${snippet.sourceId}:${snippet.section}:${snippet.quoteSnippet ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, snippet);
    }
  }

  return Array.from(deduped.values()).slice(0, args.maxSnippets ?? 6);
}
