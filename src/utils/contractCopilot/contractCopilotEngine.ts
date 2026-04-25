import { buildClarifyingQuestions } from "./clarificationEngine.ts";
import { formatContractAnswer } from "./answerFormatter.ts";
import { parseContractScenario } from "./scenarioParser.ts";
import { retrieveContractRules } from "./ruleRetriever.ts";
import { resolveOutcome } from "./resolveOutcome.ts";
import type {
  ContractAnswerCard,
  ContractCopilotSession,
  ParsedScenarioFacts,
} from "../../types/contractCopilot.ts";

export function mergeSessionFacts(
  session: ContractCopilotSession,
  incomingFacts: ParsedScenarioFacts
): ParsedScenarioFacts {
  return {
    ...session.facts,
    ...Object.fromEntries(
      Object.entries(incomingFacts).filter(([, value]) => value != null)
    ),
  };
}

export function runContractCopilot(
  question: string,
  session: ContractCopilotSession
): {
  answer: ContractAnswerCard;
  nextSession: ContractCopilotSession;
  detectedScenario: ReturnType<typeof parseContractScenario>["scenario"];
} {
  const parsed = parseContractScenario(question);
  const effectiveScenario = session.currentScenario ?? parsed.scenario;
  const mergedFacts = mergeSessionFacts(session, parsed.extractedFacts);
  const retrieval = retrieveContractRules(effectiveScenario, mergedFacts, parsed.missingFacts);
  const resolvedOutcome = resolveOutcome(retrieval, mergedFacts);
  const answer = formatContractAnswer(retrieval, resolvedOutcome);
  const canClarifyMore = session.clarificationCount < 2;
  if (answer.status === "needs_clarification" && !canClarifyMore) {
    answer.status = "answered";
    answer.clarifyingQuestions = undefined;
  }
  answer.answerCompleteness = answer.status === "needs_clarification" ? "provisional" : "resolved";

  if (answer.status === "needs_clarification") {
    answer.clarifyingQuestions = buildClarifyingQuestions(effectiveScenario, retrieval.missingFacts);
  }

  if (Object.keys(session.facts).length > 0) {
    answer.assumptions = [
      ...answer.assumptions,
      "The tool reused facts from this session where your new question did not override them.",
    ];
  }

  const nextSession: ContractCopilotSession = {
    ...session,
    currentScenario: effectiveScenario ?? session.currentScenario,
    facts: mergedFacts,
    unresolvedQuestion: answer.status === "needs_clarification" ? question : undefined,
    lastAskedClarifyingField: answer.clarifyingQuestions?.[0]?.factField,
    lastClarifyingQuestionId: answer.clarifyingQuestions?.[0]?.id,
    status: answer.status === "needs_clarification" ? "awaiting_reply" : "answered",
    clarificationCount: answer.status === "needs_clarification" ? session.clarificationCount + 1 : 0,
  };

  return { answer, nextSession, detectedScenario: effectiveScenario };
}
