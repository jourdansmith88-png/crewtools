import React, { useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ContractQuestionInput } from "./ContractQuestionInput";
import { ContractCopilotThreadView } from "./ContractCopilotThreadView";
import { runContractCopilot } from "../../utils/contractCopilot/contractCopilotEngine";
import type {
  ContractCopilotApiSuccessResponse,
  ContractCopilotFeedbackSuccessResponse,
  ContractCopilotScreenshotExtractionSuccessResponse,
} from "../../ai/workflows/contractCopilot";
import type {
  ContractCopilotThread,
  ContractCopilotThreadViewState,
  ContractCopilotTurn,
  ContractQuickReply,
  ContractCopilotAttachedEvidence,
  ParsedScenarioFacts,
  ContractAnswerCard,
} from "../../types/contractCopilot";
import type { ContractCopilotFeedbackChoice } from "../../ai/workflows/contractCopilot/api";
import {
  attachExtractedEvidenceToSession,
  buildFactPatchFromTripExtraction,
  mergeManualFactsIntoSession,
  removeAttachedEvidenceFromSession,
} from "../../utils/contractCopilot/evidenceMapping";
import { fliegerTypography, getFliegerPalette } from "../../theme/flieger";

function createEmptyThread(rootQuestion = ""): ContractCopilotThread {
  const timestampIso = new Date().toISOString();
  return {
    threadId: `contract-thread-${timestampIso}`,
    sessionId: `local-contract-copilot-session-${timestampIso}`,
    rootQuestion: rootQuestion.trim() || undefined,
    createdAtIso: timestampIso,
    updatedAtIso: timestampIso,
    currentScenario: undefined,
    facts: {},
    manualFacts: {},
    pendingExtraction: undefined,
    confirmedEvidence: [],
    screenshotLifecycle: {
      stage: "idle",
      updatedAtIso: timestampIso,
    },
    unresolvedQuestion: rootQuestion.trim() || undefined,
    lastAskedClarifyingField: undefined,
    lastClarifyingQuestionId: undefined,
    turns: [],
    status: "idle",
    clarificationCount: 0,
    resolvedAtIso: undefined,
  };
}

const initialThread = createEmptyThread();

const initialViewState: ContractCopilotThreadViewState = {
  activeThreadId: initialThread.threadId,
  supportOpenTurnIds: [],
  evidenceOpenTurnIds: [],
};

function buildTurns(
  activeThread: ContractCopilotThread,
  userMessage: string,
  answer: ReturnType<typeof runContractCopilot>["answer"],
  debugSnapshot: Record<string, unknown> | null = null,
  source: ContractCopilotTurn["source"] = "free_text",
  factPatch?: Partial<ParsedScenarioFacts>,
): ContractCopilotTurn[] {
  const timestampIso = new Date().toISOString();
  return [
    ...activeThread.turns,
    {
      id: `pilot-${timestampIso}-${activeThread.turns.length}`,
      role: "pilot",
      message: userMessage,
      timestampIso,
      source,
      factPatch,
    },
    {
      id: `copilot-${timestampIso}-${activeThread.turns.length}`,
      role: "copilot",
      message: answer.shortAnswer,
      timestampIso,
      answerCard: answer,
      debugSnapshot: debugSnapshot ?? undefined,
      clarifyingQuestion: answer.clarifyingQuestions?.[0]?.prompt,
      clarifyingField: answer.clarifyingQuestions?.[0]?.factField,
      quickReplies: answer.clarifyingQuestions?.[0]?.quickReplies,
      confirmedEvidenceSnapshot: activeThread.confirmedEvidence,
      source: "system",
    },
  ];
}

function isResolvedThread(thread: ContractCopilotThread) {
  const latestCopilotTurn = [...thread.turns].reverse().find((turn) => turn.role === "copilot");
  return (
    thread.status === "answered" &&
    latestCopilotTurn?.answerCard?.answerCompleteness === "resolved" &&
    !latestCopilotTurn?.clarifyingQuestion
  );
}

function formatFactPatchForDebug(factPatch: Partial<ParsedScenarioFacts>) {
  return Object.entries(factPatch)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`);
}

function formatAttachmentStatus(status: ContractCopilotAttachedEvidence["status"]) {
  switch (status) {
    case "attached":
      return "attached";
    case "extracting":
      return "extracting";
    case "added":
      return "added to this question";
    case "failed":
      return "failed";
    default:
      return status;
  }
}

export function ContractCopilotPanel() {
  const palette = getFliegerPalette();
  const [question, setQuestion] = useState("");
  const [activeThread, setActiveThread] = useState<ContractCopilotThread>(initialThread);
  const [viewState, setViewState] = useState<ContractCopilotThreadViewState>(initialViewState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtractingImage, setIsExtractingImage] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedbackSubmittingTurnId, setFeedbackSubmittingTurnId] = useState<string | null>(null);
  const [feedbackStatusByTurnId, setFeedbackStatusByTurnId] = useState<Record<string, string | null>>({});
  const latestSubmitRequestIdRef = useRef(0);

  const examples = useMemo(
    () => [
      "I got a three day green slip that overlaps one reserve day how will it pay",
      "If my trip reroutes, what contract path applies?",
      "I called in sick and later picked up a trip. What matters?",
    ],
    [],
  );

  const threadResolved = isResolvedThread(activeThread);
  const latestCopilotTurn = useMemo(
    () => [...activeThread.turns].reverse().find((turn) => turn.role === "copilot"),
    [activeThread.turns],
  );
  const latestTurnDebugSnapshot = (latestCopilotTurn?.debugSnapshot ?? null) as
    | ContractCopilotApiSuccessResponse["debug"]
    | null;
  const visibleDebugInfo = latestTurnDebugSnapshot
    ? {
        ...latestTurnDebugSnapshot,
        pipelineLeakDetected: latestTurnDebugSnapshot.orchestratorOwnsScenarioPipeline === true ? false : true,
      }
    : null;
  const mergedEvidenceFacts = useMemo(
    () =>
      (activeThread.confirmedEvidence ?? []).reduce<Partial<ParsedScenarioFacts>>(
        (accumulator, evidence) => ({
          ...accumulator,
          ...(evidence.factPatchApplied ?? {}),
        }),
        {},
      ),
    [activeThread.confirmedEvidence],
  );
  const currentAnswerUsedConfirmedEvidence =
    (latestCopilotTurn?.confirmedEvidenceSnapshot?.filter((item) => item.status === "added").length ?? 0) > 0;
  const hasExtractingAttachments = (activeThread.confirmedEvidence ?? []).some(
    (item) => item.status === "extracting" || item.status === "attached"
  );
  const canContinueThreadWithTypedReply =
    activeThread.status === "awaiting_reply" &&
    question.trim().length > 0;

  const resetCollapsedPanels = () => {
    setViewState((currentState) => ({
      ...currentState,
      supportOpenTurnIds: [],
      evidenceOpenTurnIds: [],
    }));
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Could not read image file."));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Could not read image file."));
      reader.readAsDataURL(file);
    });

  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }
    setIsExtractingImage(true);
    setSubmitError(null);
    for (const selectedFile of selectedFiles) {
      const attachmentId = `attachment-${selectedFile.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setActiveThread((currentThread) => ({
        ...currentThread,
        confirmedEvidence: [
          ...(currentThread.confirmedEvidence ?? []),
          {
            id: attachmentId,
            evidenceType: "trip_screenshot",
            sourceName: selectedFile.name,
            createdAtIso: new Date().toISOString(),
            status: "extracting",
          },
        ],
        screenshotLifecycle: {
          stage: "extracting",
          sourceName: selectedFile.name,
          message: "Screenshot selected. Extracting facts from screenshot.",
          updatedAtIso: new Date().toISOString(),
        },
        updatedAtIso: new Date().toISOString(),
      }));

      try {
        const imageDataUrl = await readFileAsDataUrl(selectedFile);
        const response = await fetch("/api/ai/contract-copilot/extract-trip-screenshot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageDataUrl,
            imageName: selectedFile.name,
            evidenceType: "trip_screenshot",
            questionHint: question.trim() || activeThread.unresolvedQuestion,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(payload?.error?.message ?? `Screenshot extraction failed with status ${response.status}`);
        }

        const payload = (await response.json()) as ContractCopilotScreenshotExtractionSuccessResponse;
        if (!payload.ok) {
          throw new Error("Screenshot extraction returned an invalid response.");
        }

        setActiveThread((currentThread) => {
          const baseThread = {
            ...currentThread,
            confirmedEvidence: (currentThread.confirmedEvidence ?? []).filter((item) => item.id !== attachmentId),
          };
          const nextThread = attachExtractedEvidenceToSession(baseThread, {
            id: attachmentId,
            evidenceType: "trip_screenshot",
            sourceName: payload.review.sourceName,
            createdAtIso: payload.review.extractedAtIso,
            imagePreviewDataUrl: payload.review.imagePreviewDataUrl,
            status: "added",
            facts: payload.review.facts,
            factPatchApplied: payload.review.suggestedFactPatch,
          }) as ContractCopilotThread;
          return {
            ...nextThread,
            screenshotLifecycle: {
              stage: "added",
              sourceName: payload.review.sourceName,
              message: "Screenshot added to this question.",
              updatedAtIso: new Date().toISOString(),
            },
            updatedAtIso: new Date().toISOString(),
          };
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Trip screenshot extraction failed. You can retry with a clearer screenshot.";
        setSubmitError(message);
        setActiveThread((currentThread) => ({
          ...currentThread,
          confirmedEvidence: (currentThread.confirmedEvidence ?? []).map((item) =>
            item.id === attachmentId
              ? {
                  ...item,
                  status: "failed",
                  errorMessage: message,
                }
              : item
          ),
          screenshotLifecycle: {
            stage: "failed",
            sourceName: selectedFile.name,
            message,
            updatedAtIso: new Date().toISOString(),
          },
          updatedAtIso: new Date().toISOString(),
        }));
      }
    }

    setIsExtractingImage(false);
    event.target.value = "";
  };

  const runLocalFallback = (
    requestThread: ContractCopilotThread,
    questionToAsk: string,
    userMessage: string,
    source: ContractCopilotTurn["source"] = "free_text",
    factPatch?: Partial<ParsedScenarioFacts>,
  ) => {
    const result = runContractCopilot(questionToAsk, requestThread);
    const nextThread: ContractCopilotThread = {
      ...requestThread,
      ...result.nextSession,
      threadId: requestThread.threadId,
      rootQuestion: requestThread.rootQuestion ?? questionToAsk.trim(),
      createdAtIso: requestThread.createdAtIso,
      updatedAtIso: new Date().toISOString(),
      resolvedAtIso:
        result.nextSession.status === "answered" &&
        result.answer.answerCompleteness === "resolved" &&
        !result.answer.clarifyingQuestions?.length
          ? new Date().toISOString()
          : undefined,
      turns: buildTurns(requestThread, userMessage, result.answer, null, source, factPatch),
      confirmedEvidence: requestThread.confirmedEvidence,
      manualFacts: requestThread.manualFacts,
      screenshotLifecycle: requestThread.screenshotLifecycle,
    };
    setActiveThread(nextThread);
    setViewState((currentState) => ({
      ...currentState,
      activeThreadId: nextThread.threadId,
      supportOpenTurnIds: [],
      evidenceOpenTurnIds: [],
    }));
  };

  const submitQuestion = async (
    threadOverride?: ContractCopilotThread,
    options?: {
      questionText?: string;
      userMessage?: string;
      factPatch?: Partial<ParsedScenarioFacts>;
      source?: "free_text" | "quick_reply" | "typed_reply" | "image_attachment";
    },
  ) => {
    const questionToAsk = options?.questionText ?? question.trim();
    const userMessage = options?.userMessage ?? questionToAsk;
    const source = options?.source ?? "free_text";
    const requestQuestion =
      source === "free_text" || !userMessage.trim() || userMessage.trim() === questionToAsk.trim()
        ? questionToAsk
        : `${questionToAsk}\n\nFollow-up: ${userMessage.trim()}`;
    if (!questionToAsk.trim()) {
      return;
    }

    if (hasExtractingAttachments && (source === "free_text" || source === "typed_reply")) {
      setSubmitError("Wait for attached screenshots to finish extracting so I can use them.");
      return;
    }

    const baseThread = threadOverride ?? activeThread;
    const requestId = latestSubmitRequestIdRef.current + 1;
    latestSubmitRequestIdRef.current = requestId;
    const requestThread =
      source === "free_text"
        ? createEmptyThread(questionToAsk)
        : {
            ...baseThread,
            rootQuestion: baseThread.rootQuestion ?? questionToAsk.trim(),
            unresolvedQuestion: questionToAsk.trim(),
            updatedAtIso: new Date().toISOString(),
          };

    setIsSubmitting(true);
    setSubmitError(null);
    resetCollapsedPanels();
    if (source === "free_text") {
      setActiveThread(requestThread);
      setViewState({
        activeThreadId: requestThread.threadId,
        supportOpenTurnIds: [],
        evidenceOpenTurnIds: [],
      });
    }

    try {
      const response = await fetch("/api/ai/contract-copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: requestQuestion,
          session: {
            currentScenario: requestThread.currentScenario,
            facts: requestThread.facts,
            clarificationCount: requestThread.clarificationCount,
            unresolvedQuestion: requestThread.unresolvedQuestion,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as ContractCopilotApiSuccessResponse;
      if (!payload.ok) {
        throw new Error("Contract Copilot returned an invalid response.");
      }

      const nextThread: ContractCopilotThread = {
        ...requestThread,
        ...payload.nextSession,
        threadId: requestThread.threadId,
        rootQuestion: requestThread.rootQuestion ?? questionToAsk.trim(),
        createdAtIso: requestThread.createdAtIso,
        updatedAtIso: new Date().toISOString(),
        resolvedAtIso:
          payload.nextSession.status === "answered" &&
          payload.answer.answerCompleteness === "resolved" &&
          !payload.answer.clarifyingQuestions?.length
            ? new Date().toISOString()
            : undefined,
        turns: buildTurns(requestThread, userMessage, payload.answer, payload.debug ?? null, source, options?.factPatch),
        confirmedEvidence: requestThread.confirmedEvidence,
        manualFacts: requestThread.manualFacts,
        screenshotLifecycle: requestThread.screenshotLifecycle,
      };

      if (requestId !== latestSubmitRequestIdRef.current) {
        return;
      }

      setActiveThread(nextThread);
      setViewState((currentState) => ({
        ...currentState,
        activeThreadId: nextThread.threadId,
        supportOpenTurnIds: [],
        evidenceOpenTurnIds: [],
      }));

      if (source === "free_text") {
        setQuestion("");
      }

      if (payload.mode === "ai_unverified") {
        setSubmitError(
          "Contract Copilot is showing partial AI output for debugging. The model answer was usable, but it did not fully pass schema validation.",
        );
      } else if (payload.mode === "fallback") {
        if (payload.meta.fallbackReason === "missing_api_key") {
          setSubmitError(
            "AI route is running in fallback mode because OPENAI_API_KEY is not configured on the web server.",
          );
        } else {
          setSubmitError(
            "AI route returned an unsafe or unusable model response, so CrewTools showed the safe local fallback instead.",
          );
        }
      }
    } catch (error) {
      if (requestId !== latestSubmitRequestIdRef.current) {
        return;
      }
      setSubmitError(
        "Live AI route unavailable. To test Contract Copilot locally, run `npm run build:web` and then `npm run serve:web` so localhost:3000 serves both the app and /api/ai/contract-copilot.",
      );
      runLocalFallback(requestThread, requestQuestion, userMessage, source, options?.factPatch);
    } finally {
      if (requestId === latestSubmitRequestIdRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const askAnotherQuestion = () => {
    latestSubmitRequestIdRef.current += 1;
    const nextThread = createEmptyThread();
    setActiveThread(nextThread);
    setViewState({
      activeThreadId: nextThread.threadId,
      supportOpenTurnIds: [],
      evidenceOpenTurnIds: [],
    });
    setQuestion("");
    setSubmitError(null);
  };

  const removeEvidenceAttachment = (evidenceId: string) => {
    setActiveThread((currentThread) => {
      const target = (currentThread.confirmedEvidence ?? []).find((item) => item.id === evidenceId);
      const nextThread = removeAttachedEvidenceFromSession(currentThread, evidenceId) as ContractCopilotThread;
      return {
        ...nextThread,
        updatedAtIso: new Date().toISOString(),
        screenshotLifecycle: {
          stage: nextThread.confirmedEvidence?.some((item) => item.status === "added") ? "added" : "idle",
          sourceName: target?.sourceName,
          message: target?.sourceName ? `${target.sourceName} removed from this question.` : undefined,
          updatedAtIso: new Date().toISOString(),
        },
      };
    });
  };

  const applyClarification = (reply: ContractQuickReply) => {
    const nextThread = {
      ...(mergeManualFactsIntoSession(activeThread, reply.factPatch ?? {}) as ContractCopilotThread),
      updatedAtIso: new Date().toISOString(),
    };
    setActiveThread(nextThread);
    void submitQuestion(nextThread, {
      questionText: nextThread.unresolvedQuestion ?? question.trim(),
      userMessage: reply.replyMessage ?? reply.label,
      factPatch: reply.factPatch,
      source: "quick_reply",
    });
  };

  const continueActiveThreadWithTypedReply = () => {
    if (!question.trim()) {
      return;
    }
    void submitQuestion(activeThread, {
      questionText: activeThread.unresolvedQuestion ?? activeThread.rootQuestion ?? question.trim(),
      userMessage: question.trim(),
      source: "typed_reply",
    });
    setQuestion("");
  };

  const toggleSupport = (turnId: string) => {
    setViewState((currentState) => ({
      ...currentState,
      supportOpenTurnIds: currentState.supportOpenTurnIds.includes(turnId)
        ? currentState.supportOpenTurnIds.filter((id) => id !== turnId)
        : [...currentState.supportOpenTurnIds, turnId],
    }));
  };

  const toggleEvidence = (turnId: string) => {
    setViewState((currentState) => ({
      ...currentState,
      evidenceOpenTurnIds: currentState.evidenceOpenTurnIds.includes(turnId)
        ? currentState.evidenceOpenTurnIds.filter((id) => id !== turnId)
        : [...currentState.evidenceOpenTurnIds, turnId],
    }));
  };

  const submitFeedback = async (args: {
    question: string;
    turn: ContractCopilotTurn;
    userFeedback: ContractCopilotFeedbackChoice;
    correctedAnswer?: string;
    expectedSource?: string;
  }) => {
    if (!args.turn.answerCard) {
      return;
    }
    setFeedbackSubmittingTurnId(args.turn.id);
    setFeedbackStatusByTurnId((current) => ({
      ...current,
      [args.turn.id]: null,
    }));
    try {
      const response = await fetch("/api/ai/contract-copilot/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: args.question,
          answer: args.turn.answerCard as ContractAnswerCard,
          supportCards: args.turn.answerCard.references,
          debugPayload: args.turn.debugSnapshot ?? null,
          userFeedback: args.userFeedback,
          correctedAnswer: args.correctedAnswer,
          expectedSource: args.expectedSource,
        }),
      });
      if (!response.ok) {
        throw new Error(`Feedback request failed with status ${response.status}`);
      }
      const payload = (await response.json()) as ContractCopilotFeedbackSuccessResponse;
      if (!payload.ok) {
        throw new Error("Feedback route returned an invalid response.");
      }
      setFeedbackStatusByTurnId((current) => ({
        ...current,
        [args.turn.id]: `Saved QA draft ${payload.draftId}.`,
      }));
    } catch (error) {
      setFeedbackStatusByTurnId((current) => ({
        ...current,
        [args.turn.id]:
          error instanceof Error ? error.message : "Could not save feedback draft.",
      }));
    } finally {
      setFeedbackSubmittingTurnId(null);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: "900", color: palette.textPrimary, fontFamily: fliegerTypography.family }}>
          CONTRACT COPILOT
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
          Ask a contract question and work through one scenario at a time.
        </Text>
      </View>

      <View
        style={{
          gap: 8,
          backgroundColor: palette.surface,
          borderWidth: 2,
          borderColor: palette.borderStrong,
          borderRadius: 16,
          padding: 14,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "800", color: palette.red, textTransform: "uppercase", letterSpacing: 1.1, fontFamily: fliegerTypography.familyBody }}>
          Beta
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
          This version is currently strongest on reserve vs lineholder basics, reroute/reassignment basics, sick/leave interaction basics, and premium/pickup basics.
        </Text>
      </View>

      {visibleDebugInfo ? (
        <View
          style={{
            gap: 6,
            backgroundColor: palette.surface,
            borderWidth: 2,
            borderColor: palette.borderStrong,
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textSecondary, textTransform: "uppercase", letterSpacing: 1.1, fontFamily: fliegerTypography.familyBody }}>
            Debug
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>Mode: {visibleDebugInfo.mode}</Text>
          {visibleDebugInfo.orchestratorOwnsScenarioPipeline !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Orchestrator owns scenario pipeline: {visibleDebugInfo.orchestratorOwnsScenarioPipeline ? "yes" : "no"}
            </Text>
          ) : null}
          {visibleDebugInfo.legacyCompatPipelineUsed !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Legacy compat pipeline used: {visibleDebugInfo.legacyCompatPipelineUsed ? "yes" : "no"}
            </Text>
          ) : null}
          {visibleDebugInfo.pipelineLeakDetected ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.red, fontFamily: fliegerTypography.familyBody }}>
              Pipeline leak detected: yes
            </Text>
          ) : null}
          {visibleDebugInfo.scenarioFamilySelected ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Scenario family selected: {visibleDebugInfo.scenarioFamilySelected}
            </Text>
          ) : null}
          {visibleDebugInfo.selectedScenarioFamilyFinal ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Selected scenario family final: {visibleDebugInfo.selectedScenarioFamilyFinal}
            </Text>
          ) : null}
          {visibleDebugInfo.answerScenarioFamily ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Answer scenario family: {visibleDebugInfo.answerScenarioFamily}
            </Text>
          ) : null}
          {visibleDebugInfo.supportScenarioFamily ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Support scenario family: {visibleDebugInfo.supportScenarioFamily}
            </Text>
          ) : null}
          {visibleDebugInfo.debugScenarioFamily ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Debug scenario family: {visibleDebugInfo.debugScenarioFamily}
            </Text>
          ) : null}
          {visibleDebugInfo.turnId ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Turn id: {visibleDebugInfo.turnId}
            </Text>
          ) : null}
          {visibleDebugInfo.questionHash ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Question hash: {visibleDebugInfo.questionHash}
            </Text>
          ) : null}
          {visibleDebugInfo.scenarioType ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Scenario type: {visibleDebugInfo.scenarioType}
            </Text>
          ) : null}
          {visibleDebugInfo.aiPathUsed !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              AI path used: {visibleDebugInfo.aiPathUsed ? "yes" : "no"}
            </Text>
          ) : null}
          {visibleDebugInfo.fallbackUsed !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Fallback used: {visibleDebugInfo.fallbackUsed ? "yes" : "no"}
            </Text>
          ) : null}
          {visibleDebugInfo.clarificationTriggered !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Clarification triggered: {visibleDebugInfo.clarificationTriggered ? "yes" : "no"}
            </Text>
          ) : null}
          {visibleDebugInfo.clarificationInsteadOfFallback !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Clarification instead of fallback: {visibleDebugInfo.clarificationInsteadOfFallback ? "yes" : "no"}
            </Text>
          ) : null}
          {visibleDebugInfo.reasonForFallback ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Fallback reason: {visibleDebugInfo.reasonForFallback}
            </Text>
          ) : null}
          {visibleDebugInfo.aiPathSkippedReason ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              AI path skipped reason: {visibleDebugInfo.aiPathSkippedReason}
            </Text>
          ) : null}
          {visibleDebugInfo.modelValidationFailureReason ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Model validation failure reason: {visibleDebugInfo.modelValidationFailureReason}
            </Text>
          ) : null}
          {visibleDebugInfo.finalResponseCoherenceFailed !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: visibleDebugInfo.finalResponseCoherenceFailed ? palette.red : palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Final response coherence failed: {visibleDebugInfo.finalResponseCoherenceFailed ? "yes" : "no"}
            </Text>
          ) : null}
          {visibleDebugInfo.finalResponseMismatchReason ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Final response mismatch reason: {visibleDebugInfo.finalResponseMismatchReason}
            </Text>
          ) : null}
          {visibleDebugInfo.supportFinalFilterRemoved !== undefined ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Final support filter removed: {visibleDebugInfo.supportFinalFilterRemoved}
            </Text>
          ) : null}
          {visibleDebugInfo.supportFinalFilterRemovedReasons && visibleDebugInfo.supportFinalFilterRemovedReasons.length > 0 ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Final support filter reasons: {visibleDebugInfo.supportFinalFilterRemovedReasons.join(" | ")}
            </Text>
          ) : null}
          {visibleDebugInfo.orchestratorStages ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Orchestrator stages: {JSON.stringify(visibleDebugInfo.orchestratorStages)}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            OPENAI_API_KEY present: {visibleDebugInfo.OPENAI_API_KEYPresent ? "yes" : "no"}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            Model client called: {visibleDebugInfo.modelClientCalled ? "yes" : "no"}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            Model client succeeded: {visibleDebugInfo.modelClientSucceeded ? "yes" : "no"}
          </Text>
          {visibleDebugInfo.modelClientError ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Model client error: {visibleDebugInfo.modelClientError}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            AI synthesis attempted: {visibleDebugInfo.aiSynthesisAttempted ? "yes" : "no"}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            AI synthesis used: {visibleDebugInfo.aiSynthesisUsed ? "yes" : "no"}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            AI synthesis rejected: {visibleDebugInfo.aiSynthesisRejected ? "yes" : "no"}
          </Text>
          {visibleDebugInfo.aiRejectionReason ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              AI rejection reason: {visibleDebugInfo.aiRejectionReason}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            Truth guard ran: {visibleDebugInfo.truthGuardRan ? "yes" : "no"}
          </Text>
          {visibleDebugInfo.strongClaimsDetected && visibleDebugInfo.strongClaimsDetected.length > 0 ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Strong claims detected: {visibleDebugInfo.strongClaimsDetected.join(" | ")}
            </Text>
          ) : null}
          {visibleDebugInfo.strongClaimsSupported && visibleDebugInfo.strongClaimsSupported.length > 0 ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Strong claims supported: {visibleDebugInfo.strongClaimsSupported.join(" | ")}
            </Text>
          ) : null}
          {visibleDebugInfo.strongClaimsDowngraded && visibleDebugInfo.strongClaimsDowngraded.length > 0 ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Strong claims downgraded: {visibleDebugInfo.strongClaimsDowngraded.join(" | ")}
            </Text>
          ) : null}
          {visibleDebugInfo.documentShortcutUsed ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Document shortcut used: yes
            </Text>
          ) : null}
          {visibleDebugInfo.clarificationReason ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Clarification reason: {visibleDebugInfo.clarificationReason}
            </Text>
          ) : null}
          {visibleDebugInfo.validationError ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Validation error: {visibleDebugInfo.validationError}
            </Text>
          ) : null}
          {visibleDebugInfo.governingSectionUsed ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Governing section used: {visibleDebugInfo.governingSectionUsed}
            </Text>
          ) : null}
          {visibleDebugInfo.missingGatingFacts && visibleDebugInfo.missingGatingFacts.length > 0 ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Missing gating facts: {visibleDebugInfo.missingGatingFacts.join(" | ")}
            </Text>
          ) : null}
          {visibleDebugInfo.gatingQuestionUsed ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Gating question used: {visibleDebugInfo.gatingQuestionUsed}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            Attached evidence count: {activeThread.confirmedEvidence?.length ?? 0}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            Evidence types:{" "}
            {(activeThread.confirmedEvidence?.map((item) => item.evidenceType).join(" | ") || "none")}
          </Text>
          {(activeThread.confirmedEvidence ?? []).map((item) => (
            <Text key={item.id} style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              {item.sourceName ?? item.id}: {formatAttachmentStatus(item.status)} • merged patch:{" "}
              {formatFactPatchForDebug(item.factPatchApplied ?? {}).join(", ") || "none"}
            </Text>
          ))}
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            Extracted facts merged into session.facts:{" "}
            {formatFactPatchForDebug(mergedEvidenceFacts).join(" | ") || "none"}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
            Current answer used confirmed evidence: {currentAnswerUsedConfirmedEvidence ? "yes" : "no"}
          </Text>
        </View>
      ) : null}

      <ContractCopilotThreadView
        thread={activeThread}
        supportOpenTurnIds={viewState.supportOpenTurnIds}
        evidenceOpenTurnIds={viewState.evidenceOpenTurnIds}
        onToggleSupport={toggleSupport}
        onToggleEvidence={toggleEvidence}
        onChooseQuickReply={applyClarification}
        onAskAnotherQuestion={askAnotherQuestion}
        onSubmitFeedback={submitFeedback}
        feedbackSubmittingTurnId={feedbackSubmittingTurnId}
        feedbackStatusByTurnId={feedbackStatusByTurnId}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {examples.map((example) => (
          <Text
            key={example}
            style={{
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: palette.surfaceRaised,
              color: palette.textPrimary,
              borderWidth: 2,
              borderColor: palette.borderStrong,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 13,
              fontWeight: "700",
              fontFamily: fliegerTypography.familyBody,
            }}
            onPress={() => setQuestion(example)}
          >
            {example}
          </Text>
        ))}
      </View>

      {isSubmitting ? (
        <Text style={{ fontSize: 13, color: palette.textSecondary, fontWeight: "700", fontFamily: fliegerTypography.familyBody }}>Asking Contract Copilot...</Text>
      ) : null}
      {activeThread.screenshotLifecycle?.stage !== "idle" ? (
        <View
          style={{
            gap: 4,
            backgroundColor: palette.surface,
            borderWidth: 2,
            borderColor: palette.borderStrong,
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textSecondary, textTransform: "uppercase", letterSpacing: 1.1, fontFamily: fliegerTypography.familyBody }}>
            Screenshot status
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textPrimary, fontWeight: "700", fontFamily: fliegerTypography.family }}>
            {activeThread.screenshotLifecycle?.message}
          </Text>
          {activeThread.screenshotLifecycle?.sourceName ? (
            <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
              Source: {activeThread.screenshotLifecycle.sourceName}
            </Text>
          ) : null}
        </View>
      ) : null}
      {isExtractingImage ? (
        <Text style={{ fontSize: 13, color: palette.textSecondary, fontWeight: "700", fontFamily: fliegerTypography.familyBody }}>
          Extracting trip facts from screenshot...
        </Text>
      ) : null}
      {submitError ? (
        <Text style={{ fontSize: 13, color: palette.red, fontWeight: "700", fontFamily: fliegerTypography.familyBody }}>{submitError}</Text>
      ) : null}

      {(activeThread.confirmedEvidence?.length ?? 0) > 0 ? (
        <View
          style={{
            gap: 8,
            backgroundColor: palette.surface,
            borderWidth: 2,
            borderColor: palette.borderStrong,
            borderRadius: 16,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textSecondary, textTransform: "uppercase", letterSpacing: 1.1, fontFamily: fliegerTypography.familyBody }}>
            Attached screenshots
          </Text>
          {(activeThread.confirmedEvidence ?? []).map((item) => (
            <View
              key={item.id}
              style={{
                gap: 6,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: palette.border,
                backgroundColor: palette.surfaceRaised,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: palette.textPrimary, fontFamily: fliegerTypography.family }}>
                {item.sourceName ?? "Screenshot"}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>
                {formatAttachmentStatus(item.status)}
              </Text>
              {item.errorMessage ? (
                <Text style={{ fontSize: 12, lineHeight: 18, color: palette.red, fontFamily: fliegerTypography.familyBody }}>{item.errorMessage}</Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <TouchableOpacity
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: palette.surface,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: palette.borderStrong,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                  onPress={() => removeEvidenceAttachment(item.id)}
                >
                  <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textPrimary, fontFamily: fliegerTypography.familyBody }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {canContinueThreadWithTypedReply ? (
        <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textMuted, fontFamily: fliegerTypography.familyBody }}>
          Asking will start a new thread. Use “Reply in this thread” to answer the current clarifying question.
        </Text>
      ) : null}

      <ContractQuestionInput
        value={question}
        onChangeText={setQuestion}
        onSubmit={() => void submitQuestion()}
        onContinueThread={continueActiveThreadWithTypedReply}
        onImageSelected={handleImageSelection}
        attachLabel={isExtractingImage ? "Extracting screenshots..." : "Attach screenshots"}
        primaryActionLabel={threadResolved ? "Ask a new question" : "Ask Contract Copilot"}
        showContinueThreadAction={canContinueThreadWithTypedReply}
      />
    </View>
  );
}
