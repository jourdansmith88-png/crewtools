import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { ContractCopilotThread, ContractQuickReply, ContractCopilotTurn } from "../../types/contractCopilot";
import { fliegerTypography, getFliegerPalette } from "../../theme/flieger";
import { CollapsibleSupportPanel } from "./CollapsibleSupportPanel";
import { CollapsibleEvidencePanel } from "./CollapsibleEvidencePanel";
import { ContractAnswerFeedbackCard } from "./ContractAnswerFeedbackCard";
import type { ContractCopilotFeedbackChoice } from "../../ai/workflows/contractCopilot/api";

type ContractCopilotThreadViewProps = {
  thread: ContractCopilotThread;
  supportOpenTurnIds: string[];
  evidenceOpenTurnIds: string[];
  onToggleSupport: (turnId: string) => void;
  onToggleEvidence: (turnId: string) => void;
  onChooseQuickReply: (reply: ContractQuickReply) => void;
  onAskAnotherQuestion?: () => void;
  onSubmitFeedback?: (payload: {
    question: string;
    turn: ContractCopilotTurn;
    userFeedback: ContractCopilotFeedbackChoice;
    correctedAnswer?: string;
    expectedSource?: string;
  }) => Promise<void> | void;
  feedbackSubmittingTurnId?: string | null;
  feedbackStatusByTurnId?: Record<string, string | null>;
};

export function ContractCopilotThreadView({
  thread,
  supportOpenTurnIds,
  evidenceOpenTurnIds,
  onToggleSupport,
  onToggleEvidence,
  onChooseQuickReply,
  onAskAnotherQuestion,
  onSubmitFeedback,
  feedbackSubmittingTurnId,
  feedbackStatusByTurnId,
}: ContractCopilotThreadViewProps) {
  const palette = getFliegerPalette();

  if (thread.turns.length === 0) {
    return null;
  }

  const latestCopilotTurn = [...thread.turns].reverse().find((turn) => turn.role === "copilot");
  const threadResolved =
    thread.status === "answered" &&
    latestCopilotTurn?.answerCard?.answerCompleteness === "resolved" &&
    !latestCopilotTurn?.clarifyingQuestion;

  return (
    <View style={{ gap: 10 }}>
      {thread.turns.map((turn) => {
        if (turn.role === "pilot") {
          return (
            <View
              key={turn.id}
              style={{
                alignSelf: "flex-end",
                maxWidth: "88%",
                backgroundColor: palette.surfaceRaised,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: palette.borderStrong,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 21,
                  color: palette.textPrimary,
                  fontWeight: "700",
                  fontFamily: fliegerTypography.familyBody,
                }}
              >
                {turn.message}
              </Text>
            </View>
          );
        }

        const answer = turn.answerCard;
        const supportVisible = supportOpenTurnIds.includes(turn.id);
        const evidenceVisible = evidenceOpenTurnIds.includes(turn.id);
        const hasVisibleSupport =
          answer?.references.some(
            (reference) =>
              reference.ruleType !== "inference" &&
              typeof reference.quoteSnippet === "string" &&
              reference.quoteSnippet.trim().length > 0,
          ) ?? false;
        const hasVisibleEvidence = (turn.confirmedEvidenceSnapshot?.length ?? 0) > 0;

        return (
          <View key={turn.id} style={{ alignSelf: "flex-start", maxWidth: "92%", gap: 8 }}>
            <View
              style={{
                backgroundColor: palette.surface,
                borderWidth: 2,
                borderColor: palette.borderStrong,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: palette.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                  fontFamily: fliegerTypography.familyBody,
                }}
              >
                Copilot
              </Text>
              {answer?.answerCompleteness ? (
                <Text
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: answer.answerCompleteness === "resolved" ? palette.green : palette.accentSoft,
                    color: palette.textPrimary,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 999,
                    overflow: "hidden",
                    fontSize: 10,
                    fontWeight: "800",
                    fontFamily: fliegerTypography.familyBody,
                  }}
                >
                  {answer.answerCompleteness === "resolved" ? "Resolved" : "Provisional"}
                </Text>
              ) : null}
              <Text
                style={{
                  fontSize: 16,
                  lineHeight: 23,
                  fontWeight: "800",
                  color: palette.textPrimary,
                  fontFamily: fliegerTypography.family,
                }}
              >
                {turn.message}
              </Text>
              {answer?.plainEnglishExplanation ? (
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 20,
                    color: palette.textSecondary,
                    fontFamily: fliegerTypography.familyBody,
                  }}
                >
                  {answer.plainEnglishExplanation}
                </Text>
              ) : null}
              {hasVisibleSupport || hasVisibleEvidence ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {hasVisibleSupport ? (
                    <TouchableOpacity onPress={() => onToggleSupport(turn.id)}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: palette.textSecondary,
                          fontFamily: fliegerTypography.familyBody,
                        }}
                      >
                        {supportVisible ? "Hide contract support" : "Show contract support"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {hasVisibleEvidence ? (
                    <TouchableOpacity onPress={() => onToggleEvidence(turn.id)}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: palette.textSecondary,
                          fontFamily: fliegerTypography.familyBody,
                        }}
                      >
                        {evidenceVisible ? "Hide extracted facts" : "Show extracted facts"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>

            {supportVisible && answer ? <CollapsibleSupportPanel answer={answer} /> : null}
            {evidenceVisible && turn.confirmedEvidenceSnapshot ? (
              <CollapsibleEvidencePanel evidence={turn.confirmedEvidenceSnapshot} />
            ) : null}
            {answer && onSubmitFeedback ? (
              <ContractAnswerFeedbackCard
                question={
                  thread.turns
                    .slice(0, thread.turns.indexOf(turn))
                    .reverse()
                    .find((candidate) => candidate.role === "pilot")?.message ??
                  thread.rootQuestion ??
                  ""
                }
                turn={turn}
                isSubmitting={feedbackSubmittingTurnId === turn.id}
                submitMessage={feedbackStatusByTurnId?.[turn.id] ?? null}
                onSubmit={async (payload) => {
                  await onSubmitFeedback({
                    question: payload.question,
                    turn,
                    userFeedback: payload.userFeedback,
                    correctedAnswer: payload.correctedAnswer,
                    expectedSource: payload.expectedSource,
                  });
                }}
              />
            ) : null}

            {turn.clarifyingQuestion ? (
              <View
                style={{
                  gap: 10,
                  backgroundColor: palette.surfaceRaised,
                  borderWidth: 2,
                  borderColor: palette.borderStrong,
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: palette.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 1.1,
                    fontFamily: fliegerTypography.familyBody,
                  }}
                >
                  One thing I need to be sure
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 21,
                    color: palette.textPrimary,
                    fontFamily: fliegerTypography.familyBody,
                  }}
                >
                  {turn.clarifyingQuestion}
                </Text>
                {turn.quickReplies && turn.quickReplies.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {turn.quickReplies.map((reply) => (
                      <TouchableOpacity
                        key={`${turn.id}-${reply.id}`}
                        style={{
                          borderRadius: 999,
                          borderWidth: 2,
                          borderColor: palette.borderStrong,
                          backgroundColor: palette.surface,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                        onPress={() => onChooseQuickReply(reply)}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: palette.textPrimary,
                            fontFamily: fliegerTypography.family,
                          }}
                        >
                          {reply.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {threadResolved ? (
        <View
          style={{
            gap: 10,
            alignSelf: "flex-start",
            maxWidth: "92%",
            backgroundColor: palette.surface,
            borderWidth: 2,
            borderColor: palette.greenBorder,
            borderRadius: 16,
            padding: 14,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "800",
              color: palette.green,
              textTransform: "uppercase",
              letterSpacing: 1.1,
              fontFamily: fliegerTypography.familyBody,
            }}
          >
            Resolved
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 21,
              color: palette.textSecondary,
              fontFamily: fliegerTypography.familyBody,
            }}
          >
            This question looks resolved. Ask another question when you want to start a fresh thread.
          </Text>
          {onAskAnotherQuestion ? (
            <TouchableOpacity
              style={{
                alignSelf: "flex-start",
                backgroundColor: palette.surfaceRaised,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: palette.greenBorder,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
              onPress={onAskAnotherQuestion}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: palette.textPrimary,
                  fontFamily: fliegerTypography.family,
                }}
              >
                Ask another question
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
