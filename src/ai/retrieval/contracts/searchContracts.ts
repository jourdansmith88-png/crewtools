import type { CopilotScenarioFamily, ParsedScenarioFacts } from "../../../types/contractCopilot.ts";
import type { ContractDocumentChunk, ContractSearchMatch } from "./documentTypes.ts";
import { getActiveKnownInteractionRules, scoreSearchableAgainstKnownInteractionRules } from "./knownInteractionRules.ts";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
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
  "that",
  "the",
  "three",
  "this",
  "to",
  "was",
  "what",
  "will",
  "with",
  "one",
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

function inferScenarioHints(question: string, facts: ParsedScenarioFacts, deterministicScenario?: string) {
  const hints = new Set<CopilotScenarioFamily>();
  const questionLower = question.toLowerCase();
  const pureAlvGuaranteeIntent = isPureAlvGuaranteeIntent(questionLower, facts);

  if (
    questionLower.includes("green slip") ||
    questionLower.includes("greenslip") ||
    /\bgs\b/.test(questionLower) ||
    questionLower.includes("quick slip") ||
    questionLower.includes("premium") ||
    questionLower.includes("pay")
  ) {
    hints.add("premium_pickup");
  }
  if (questionLower.includes("reroute") || questionLower.includes("reassign")) {
    hints.add("reroute_reassignment");
  }
  if (questionLower.includes("sick") || questionLower.includes("leave") || questionLower.includes("vacation")) {
    hints.add("sick_leave_interaction");
  }
  if (questionLower.includes("reserve") || questionLower.includes("lineholder") || questionLower.includes("x-day")) {
    hints.add("status_basics");
  }
  if (pureAlvGuaranteeIntent) {
    hints.add("status_basics");
  }

  if (facts.pickupType || facts.premiumType) {
    hints.add("premium_pickup");
  }
  if (facts.rerouteOccurred || facts.reassignmentOccurred) {
    hints.add("reroute_reassignment");
  }
  if (facts.sickUsed || facts.leaveType) {
    hints.add("sick_leave_interaction");
  }
  if (facts.status) {
    hints.add("status_basics");
  }

  switch ((deterministicScenario ?? "").trim().toLowerCase()) {
    case "how this pays":
      hints.add("premium_pickup");
      break;
    case "reroute / reassignment":
      hints.add("reroute_reassignment");
      break;
    case "sick / leave interaction":
      hints.add("sick_leave_interaction");
      break;
    case "reserve vs lineholder":
      hints.add("status_basics");
      break;
    default:
      break;
  }

  return hints;
}

function factTerms(facts: ParsedScenarioFacts) {
  const terms = new Set<string>();
  if (facts.status) terms.add(facts.status);
  if (facts.pickupType) terms.add(facts.pickupType.toLowerCase());
  if (facts.premiumType) terms.add(facts.premiumType.toLowerCase());
  if (facts.assignmentType) terms.add(facts.assignmentType.toLowerCase());
  if (facts.leaveType) terms.add(facts.leaveType.toLowerCase());
  if (facts.sameDayInteraction) terms.add("overlap");
  if (facts.sickUsed) terms.add("sick");
  return Array.from(terms);
}

function scenarioAppliesToChunk(chunk: ContractDocumentChunk, hints: Set<CopilotScenarioFamily>) {
  if (hints.size === 0) {
    return false;
  }
  if (hints.has("premium_pickup") && chunk.tags.some((tag) => ["greenslip", "premium", "reserve", "x-day", "section 23"].includes(tag))) {
    return true;
  }
  if (hints.has("reroute_reassignment") && chunk.tags.some((tag) => ["reroute", "reassignment"].includes(tag))) {
    return true;
  }
  if (hints.has("sick_leave_interaction") && chunk.tags.some((tag) => ["sick", "leave", "vacation"].includes(tag))) {
    return true;
  }
  if (hints.has("status_basics") && chunk.tags.some((tag) => ["reserve", "lineholder", "x-day", "definition"].includes(tag))) {
    return true;
  }
  return false;
}

export function searchContractDocuments(args: {
  question: string;
  chunks: ContractDocumentChunk[];
  rememberedFacts?: ParsedScenarioFacts;
  deterministicScenario?: string;
  maxMatches?: number;
}) {
  const questionLower = args.question.toLowerCase();
  const tokens = tokenize(args.question);
  const hints = inferScenarioHints(args.question, args.rememberedFacts ?? {}, args.deterministicScenario);
  const facts = factTerms(args.rememberedFacts ?? {});
  const explicitGreenslipQuestion =
    questionLower.includes("green slip") || questionLower.includes("greenslip") || /\bgs\b/.test(questionLower);
  const explicitApdQuestion =
    /\bapd\b/.test(questionLower) || questionLower.includes("authorized personal drop");
  const explicitGuaranteeQuestion =
    questionLower.includes("minimum daily guarantee") ||
    questionLower.includes("daily guarantee") ||
    questionLower.includes("minimum guarantee") ||
    questionLower.includes("reserve guarantee") ||
    questionLower.includes("line guarantee") ||
    /\badg\b/.test(questionLower);
  const explicitAlvQuestion =
    /\balv\b/.test(questionLower) || questionLower.includes("average line value");
  const pureAlvGuaranteeIntent = isPureAlvGuaranteeIntent(questionLower, args.rememberedFacts ?? {});
  const explicitReserveCoverageQuestion =
    questionLower.includes("reserve coverage") ||
    questionLower.includes("required minimum") ||
    questionLower.includes("required coverage");
  const explicitLongCallQuestion = questionLower.includes("long call");
  const explicitSickGreenslipQuestion =
    (questionLower.includes("sick") || questionLower.includes("called in sick")) &&
    (questionLower.includes("green slip") || questionLower.includes("greenslip") || /\bgs\b/.test(questionLower));
  const explicitGreenslipLongCallQuestion =
    explicitGreenslipQuestion &&
    explicitLongCallQuestion &&
    (questionLower.includes("overlap") || questionLower.includes("within 18") || questionLower.includes("18 hour"));
  const explicitReserveOverlapQuestion =
    questionLower.includes("reserve") &&
    (questionLower.includes("overlap") || questionLower.includes("conflict") || questionLower.includes("x-day"));
  const activeKnownInteractionRules = getActiveKnownInteractionRules({
    question: args.question,
    facts: args.rememberedFacts,
  });

  const matches: ContractSearchMatch[] = [];

  for (const chunk of args.chunks) {
    const searchable = `${chunk.section} ${chunk.title ?? ""} ${chunk.text} ${chunk.tags.join(" ")}`.toLowerCase();
    const reasons = new Set<string>();
    const matchedTerms = new Set<string>();
    let score = 0;

    for (const token of tokens) {
      if (searchable.includes(token)) {
        score += chunk.text.toLowerCase().includes(token) ? 4 : 2;
        matchedTerms.add(token);
      }
    }

    for (const fact of facts) {
      if (searchable.includes(fact)) {
        score += 5;
        matchedTerms.add(fact);
      }
    }

    if (scenarioAppliesToChunk(chunk, hints)) {
      score += 8;
      reasons.add("scenario_hint");
    }

    if (chunk.isDefinition) {
      score += questionLower.includes("what does") || questionLower.includes("mean") ? 6 : 2;
      reasons.add("definition");
    }

    if (chunk.isException) {
      score += questionLower.includes("except") || questionLower.includes("conflict") || questionLower.includes("overlap") ? 6 : 2;
      reasons.add("exception");
    }

    if (explicitGreenslipQuestion && (searchable.includes("green slip") || searchable.includes("greenslip") || searchable.includes("(gs)"))) {
      score += 12;
      reasons.add("greenslip");
    }
    if (explicitGreenslipQuestion && chunk.section.startsWith("23.")) {
      score += 8;
      reasons.add("section_23");
    }

    if (questionLower.includes("reserve") && searchable.includes("reserve")) {
      score += 5;
      reasons.add("reserve");
    }

    if (explicitReserveOverlapQuestion && searchable.includes("x-day")) {
      score += 10;
      reasons.add("x_day");
    }

    if (
      explicitGreenslipLongCallQuestion &&
      (searchable.includes("long call reserve pilot") ||
        (searchable.includes("long call") && searchable.includes("green slip")) ||
        (searchable.includes("long call") && searchable.includes("gs")))
    ) {
      score += 24;
      reasons.add("gs_long_call_interaction");
    }
    if (
      explicitGreenslipLongCallQuestion &&
      (searchable.includes("within 18 hours of first attempted contact") ||
        searchable.includes("within 18 hours of initial attempt to contact") ||
        searchable.includes("18 hours of first attempted contact"))
    ) {
      score += 28;
      reasons.add("gs_long_call_18_hour_rule");
    }
    if (
      explicitGreenslipLongCallQuestion &&
      searchable.includes("single pay") &&
      searchable.includes("no credit") &&
      searchable.includes("first duty period")
    ) {
      score += 28;
      reasons.add("gs_long_call_single_pay_no_credit");
    }
    if (
      explicitSickGreenslipQuestion &&
      (searchable.includes("section 14 e") ||
        searchable.includes("section 14") ||
        searchable.includes("section 23 q"))
    ) {
      score += 18;
      reasons.add("sick_gs_governing_sections");
    }
    if (
      explicitSickGreenslipQuestion &&
      (searchable.includes("example three") ||
        searchable.includes("worked example"))
    ) {
      score += 24;
      reasons.add("sick_gs_worked_example");
    }
    if (
      explicitSickGreenslipQuestion &&
      searchable.includes("replenish") &&
      searchable.includes("sick leave")
    ) {
      score += 24;
      reasons.add("sick_gs_replenishment");
    }
    if (
      explicitSickGreenslipQuestion &&
      searchable.includes("single pay") &&
      searchable.includes("no credit")
    ) {
      score += 24;
      reasons.add("sick_gs_pay_credit_split");
    }
    if (
      explicitSickGreenslipQuestion &&
      searchable.includes("lesser of the alv") &&
      searchable.includes("75 hours")
    ) {
      score += 16;
      reasons.add("sick_gs_alv_threshold");
    }
    if (
      explicitSickGreenslipQuestion &&
      searchable.includes("scheduled to operate after the pilot is well")
    ) {
      score += 14;
      reasons.add("sick_gs_after_well_language");
    }

    if ((questionLower.includes("overlap") || questionLower.includes("conflict")) && searchable.includes("conflict")) {
      score += 7;
      reasons.add("conflict");
    }

    if (questionLower.includes("section 23") && searchable.includes("section 23")) {
      score += 10;
      reasons.add("section_23");
    }

    if (questionLower.includes("pay") && (chunk.section.startsWith("23.") || searchable.includes("premium pay"))) {
      score += 6;
      reasons.add("pay_path");
    }
    if (
      explicitGuaranteeQuestion &&
      (searchable.includes("minimum daily guarantee") ||
        searchable.includes("daily guarantee") ||
        searchable.includes("line guarantee") ||
        searchable.includes("reserve guarantee"))
    ) {
      score += 18;
      reasons.add("guarantee_term");
    }
    if (
      explicitGuaranteeQuestion &&
      (chunk.section.startsWith("4.") || chunk.section.startsWith("23."))
    ) {
      score += 10;
      reasons.add("guarantee_governing_section");
    }
    if (
      pureAlvGuaranteeIntent &&
      (searchable.includes("average line value") ||
        /\balv\b/.test(searchable) ||
        searchable.includes("adg") ||
        searchable.includes("minimum pay and credit guarantees") ||
        searchable.includes("regular line guarantee") ||
        searchable.includes("reserve guarantee") ||
        chunk.section.startsWith("4.") ||
        chunk.section.startsWith("22."))
    ) {
      score += 20;
      reasons.add("alv_guarantee_core");
    }
    if (
      pureAlvGuaranteeIntent &&
      questionLower.includes("reserve") &&
      (searchable.includes("reserve guarantee") ||
        searchable.includes("reserve pilot") ||
        searchable.includes("alv minus two hours") ||
        chunk.section.startsWith("4."))
    ) {
      score += 12;
      reasons.add("reserve_guarantee_focus");
    }
    if (
      pureAlvGuaranteeIntent &&
      questionLower.includes("lineholder") &&
      (searchable.includes("regular line guarantee") ||
        searchable.includes("line guarantee") ||
        searchable.includes("regular line value") ||
        chunk.section.startsWith("4."))
    ) {
      score += 12;
      reasons.add("lineholder_guarantee_focus");
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
      score -= 36;
      reasons.add("penalize_sick_example_drift");
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
        chunk.section.startsWith("4.") ||
        chunk.section.startsWith("22.")
      )
    ) {
      score -= 20;
      reasons.add("penalize_non_alv_guarantee_chunk");
    }
    if (
      explicitGuaranteeQuestion &&
      (searchable.includes("green slip") ||
        searchable.includes("greenslip") ||
        searchable.includes("authorized personal drop") ||
        searchable.includes("apd"))
    ) {
      score -= 14;
    }

    if (explicitApdQuestion && (searchable.includes("authorized personal drop") || /\bapd\b/.test(searchable))) {
      score += 18;
      reasons.add("apd");
    }
    if (explicitApdQuestion && (searchable.includes("section 23 i") || chunk.section.startsWith("23."))) {
      score += 14;
      reasons.add("apd_governing_section");
    }
    if (
      explicitApdQuestion &&
      explicitReserveCoverageQuestion &&
      (searchable.includes("25% of the number of reserves required") ||
        searchable.includes("25% of the number of reserves") ||
        searchable.includes("25 of the number of reserves required") ||
        searchable.includes("reserves available in the category is at least 25"))
    ) {
      score += 24;
      reasons.add("apd_25_percent_threshold");
    }
    if (explicitApdQuestion && searchable.includes("reserve")) {
      score += 5;
      reasons.add("apd_reserve");
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
      reasons.add("penalize_non_guarantee_interaction");
    }
    if (
      explicitApdQuestion &&
      (searchable.includes("greenslip") ||
        searchable.includes("green slip") ||
        searchable.includes("overlap") ||
        searchable.includes("conflict")) &&
      !(searchable.includes("authorized personal drop") || /\bapd\b/.test(searchable))
    ) {
      score -= 14;
    }

    if (
      explicitGreenslipQuestion &&
      !(searchable.includes("green slip") || searchable.includes("greenslip") || searchable.includes("(gs)") || chunk.section.startsWith("23."))
    ) {
      score -= 12;
    }

    if (
      explicitGreenslipLongCallQuestion &&
      (searchable.includes("inverse assignment") ||
        searchable.includes("authorized personal drop") ||
        searchable.includes("apd")) &&
      !(searchable.includes("green slip") || searchable.includes("greenslip") || searchable.includes("long call"))
    ) {
      score -= 18;
      reasons.add("penalize_non_gs_long_call");
    }

    if (
      explicitGreenslipLongCallQuestion &&
      searchable.includes("overlap") &&
      !(searchable.includes("long call") || searchable.includes("18 hours") || searchable.includes("first attempted contact"))
    ) {
      score -= 8;
      reasons.add("penalize_generic_overlap");
    }
    if (
      explicitSickGreenslipQuestion &&
      searchable.includes("reserve guarantee") &&
      !(searchable.includes("sick") || searchable.includes("green slip") || searchable.includes("greenslip"))
    ) {
      score -= 12;
      reasons.add("penalize_unrelated_guarantee");
    }

    if (chunk.section.startsWith("24.") && !searchable.includes("green slip") && !searchable.includes("x-day")) {
      score -= 10;
    }

    const knownInteractionScore = scoreSearchableAgainstKnownInteractionRules(searchable, activeKnownInteractionRules);
    score += knownInteractionScore.score;
    for (const signal of knownInteractionScore.matchedSignals) {
      reasons.add(signal);
    }

    if (score > 0) {
      matches.push({
        chunk,
        score,
        reasons: Array.from(reasons),
        matchedTerms: Array.from(matchedTerms),
      });
    }
  }

  return matches.sort((left, right) => right.score - left.score).slice(0, args.maxMatches ?? 8);
}
