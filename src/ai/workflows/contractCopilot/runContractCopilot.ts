import type { ParsedScenarioFacts } from "../../../types/contractCopilot.ts";
import type { ContractCopilotIntentResolution } from "./intentRouter.ts";
import { executeScenarioPipelineLegacyCompat } from "./scenarioPipelineLegacyCompat.ts";

type ContractCopilotRouteCutoverArgs<TInput, TResponse> = {
  input: TInput;
  intentResult: ContractCopilotIntentResolution;
  legacyCompatArgs: unknown;
};

export type ContractCopilotScenarioIntentResult = {
  intent: ContractCopilotIntentResolution;
  scenarioFamilySelected: boolean;
  scenarioType?: string;
  isAmbiguous: boolean;
  missingRequiredFacts: string[];
};

export type ContractCopilotOrchestratorDebug = {
  scenarioType?: string;
  aiPathUsed: boolean;
  fallbackUsed: boolean;
  clarificationTriggered: boolean;
  reasonForFallback?: string;
  scenarioFamilySelected: boolean;
  missingRequiredFacts?: string[];
};

export async function runContractCopilot<TInput, TResponse>(
  args: ContractCopilotRouteCutoverArgs<TInput, TResponse>,
): Promise<TResponse>;
export async function runContractCopilot<
  TInput,
  TClarificationResponse,
  TAIResponse,
  TVerifiedAnswer,
  TSupport,
  TFallbackAnswer,
  TResponse,
>(args: {
  input: TInput;
  question: string;
  facts: ParsedScenarioFacts;
  resolveIntent: (input: TInput) => ContractCopilotScenarioIntentResult;
  generateClarificationQuestion: (scenarioType?: string) => Promise<TClarificationResponse> | TClarificationResponse;
  callModel: (input: TInput) => Promise<TAIResponse>;
  verifyContractScenarioAnswer: (args: {
    input: TInput;
    aiResponse: TAIResponse;
    scenarioType?: string;
  }) => Promise<TVerifiedAnswer | null> | TVerifiedAnswer | null;
  selectAndFilterSupport: (args: {
    input: TInput;
    scenarioType?: string;
    verifiedAnswer: TVerifiedAnswer | null;
    aiResponse: TAIResponse | null;
  }) => Promise<TSupport> | TSupport;
  generateSafeFallback: (args: {
    input: TInput;
    scenarioType?: string;
    aiError?: unknown;
    modelValidationFailureReason?: string;
  }) => Promise<TFallbackAnswer> | TFallbackAnswer;
  buildClarificationResponse: (args: {
    clarification: TClarificationResponse;
    debug: ContractCopilotOrchestratorDebug;
    intentResult: ContractCopilotScenarioIntentResult;
  }) => TResponse;
  buildAnswerResponse: (args: {
    verifiedAnswer: TVerifiedAnswer;
    support: TSupport;
    debug: ContractCopilotOrchestratorDebug;
    intentResult: ContractCopilotScenarioIntentResult;
  }) => TResponse;
  buildFallbackResponse: (args: {
    fallbackAnswer: TFallbackAnswer;
    support: TSupport;
    debug: ContractCopilotOrchestratorDebug;
    intentResult: ContractCopilotScenarioIntentResult;
  }) => TResponse;
}): Promise<TResponse>;
export async function runContractCopilot(args: unknown) {
  if (
    args &&
    typeof args === "object" &&
    "legacyCompatArgs" in args
  ) {
    return await executeScenarioPipelineLegacyCompat(
      (args as { legacyCompatArgs: unknown }).legacyCompatArgs,
    );
  }

  const typedArgs = args as {
    input: unknown;
    question: string;
    facts: ParsedScenarioFacts;
    resolveIntent: (input: unknown) => ContractCopilotScenarioIntentResult;
    generateClarificationQuestion: (scenarioType?: string) => Promise<unknown> | unknown;
    callModel: (input: unknown) => Promise<unknown>;
    verifyContractScenarioAnswer: (args: {
      input: unknown;
      aiResponse: unknown;
      scenarioType?: string;
    }) => Promise<unknown | null> | unknown | null;
    selectAndFilterSupport: (args: {
      input: unknown;
      scenarioType?: string;
      verifiedAnswer: unknown | null;
      aiResponse: unknown | null;
    }) => Promise<unknown> | unknown;
    generateSafeFallback: (args: {
      input: unknown;
      scenarioType?: string;
      aiError?: unknown;
      modelValidationFailureReason?: string;
    }) => Promise<unknown> | unknown;
    buildClarificationResponse: (args: {
      clarification: unknown;
      debug: ContractCopilotOrchestratorDebug;
      intentResult: ContractCopilotScenarioIntentResult;
    }) => unknown;
    buildAnswerResponse: (args: {
      verifiedAnswer: unknown;
      support: unknown;
      debug: ContractCopilotOrchestratorDebug;
      intentResult: ContractCopilotScenarioIntentResult;
    }) => unknown;
    buildFallbackResponse: (args: {
      fallbackAnswer: unknown;
      support: unknown;
      debug: ContractCopilotOrchestratorDebug;
      intentResult: ContractCopilotScenarioIntentResult;
    }) => unknown;
  };
  const intentResult = typedArgs.resolveIntent(typedArgs.input);
  const {
    scenarioFamilySelected,
    scenarioType,
    isAmbiguous,
    missingRequiredFacts,
  } = intentResult;

  if (isAmbiguous && missingRequiredFacts.length > 0) {
    const clarification = await typedArgs.generateClarificationQuestion(scenarioType);
    return typedArgs.buildClarificationResponse({
      clarification,
      intentResult,
      debug: {
        scenarioType,
        aiPathUsed: false,
        fallbackUsed: false,
        clarificationTriggered: true,
        scenarioFamilySelected,
        missingRequiredFacts,
      },
    });
  }

  let aiResponse: TAIResponse | null = null;
  let aiError: unknown;
  let aiAttempted = false;

  try {
    aiAttempted = true;
    aiResponse = await typedArgs.callModel(typedArgs.input);
  } catch (error) {
    aiError = error;
  }

  if (scenarioFamilySelected && !aiAttempted) {
    throw new Error("AI must be called for scenario");
  }

  let verifiedAnswer: TVerifiedAnswer | null = null;
  let modelValidationFailureReason: string | undefined;

  if (aiResponse) {
    try {
      verifiedAnswer = await typedArgs.verifyContractScenarioAnswer({
        input: typedArgs.input,
        aiResponse,
        scenarioType,
      });
    } catch (error) {
      modelValidationFailureReason = error instanceof Error ? error.message : "verification_failed";
    }
  }

  const support = await typedArgs.selectAndFilterSupport({
    input: typedArgs.input,
    scenarioType,
    verifiedAnswer,
    aiResponse,
  });

  if (verifiedAnswer) {
    return typedArgs.buildAnswerResponse({
      verifiedAnswer,
      support,
      intentResult,
      debug: {
        scenarioType,
        aiPathUsed: true,
        fallbackUsed: false,
        clarificationTriggered: false,
        scenarioFamilySelected,
        missingRequiredFacts,
      },
    });
  }

  const fallbackAnswer = await typedArgs.generateSafeFallback({
    input: typedArgs.input,
    scenarioType,
    aiError,
    modelValidationFailureReason,
  });

  return typedArgs.buildFallbackResponse({
    fallbackAnswer,
    support,
    intentResult,
    debug: {
      scenarioType,
      aiPathUsed: aiAttempted,
      fallbackUsed: true,
      clarificationTriggered: false,
      reasonForFallback: aiError
        ? (aiError instanceof Error ? aiError.message : "ai_error")
        : (modelValidationFailureReason ?? "verification_failed"),
      scenarioFamilySelected,
      missingRequiredFacts,
    },
  });
}
