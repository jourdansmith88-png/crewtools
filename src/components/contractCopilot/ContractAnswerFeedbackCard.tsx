import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { fliegerTypography, getFliegerPalette } from "../../theme/flieger";
import type { ContractAnswerCard, ContractCopilotTurn } from "../../types/contractCopilot";
import type { ContractCopilotFeedbackChoice } from "../../ai/workflows/contractCopilot/api";

type ContractAnswerFeedbackCardProps = {
  question: string;
  turn: ContractCopilotTurn;
  isSubmitting?: boolean;
  submitMessage?: string | null;
  onSubmit: (payload: {
    question: string;
    answer: ContractAnswerCard;
    userFeedback: ContractCopilotFeedbackChoice;
    correctedAnswer?: string;
    expectedSource?: string;
    debugPayload?: Record<string, unknown>;
  }) => Promise<void> | void;
};

const FEEDBACK_OPTIONS: Array<{ value: ContractCopilotFeedbackChoice; label: string }> = [
  { value: "looks_right", label: "Looks right" },
  { value: "answer_wrong", label: "Answer wrong" },
  { value: "support_wrong", label: "Support wrong" },
  { value: "missing_source", label: "Missing source" },
  { value: "needs_better_explanation", label: "Needs better explanation" },
];

export function ContractAnswerFeedbackCard({
  question,
  turn,
  isSubmitting = false,
  submitMessage,
  onSubmit,
}: ContractAnswerFeedbackCardProps) {
  const palette = getFliegerPalette();
  const [selectedFeedback, setSelectedFeedback] = useState<ContractCopilotFeedbackChoice | null>(null);
  const [correctedAnswer, setCorrectedAnswer] = useState("");
  const [expectedSource, setExpectedSource] = useState("");

  if (!turn.answerCard) {
    return null;
  }

  const handleSubmit = async () => {
    if (!selectedFeedback) {
      return;
    }
    await onSubmit({
      question,
      answer: turn.answerCard,
      userFeedback: selectedFeedback,
      correctedAnswer: correctedAnswer.trim() || undefined,
      expectedSource: expectedSource.trim() || undefined,
      debugPayload: turn.debugSnapshot,
    });
    if (selectedFeedback !== "looks_right") {
      setCorrectedAnswer("");
      setExpectedSource("");
    }
  };

  return (
    <View
      style={{
        gap: 10,
        backgroundColor: palette.surface,
        borderWidth: 2,
        borderColor: palette.borderStrong,
        borderRadius: 14,
        padding: 12,
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
        Beta feedback
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FEEDBACK_OPTIONS.map((option) => {
          const selected = selectedFeedback === option.value;
          return (
            <TouchableOpacity
              key={`${turn.id}-${option.value}`}
              style={{
                borderRadius: 999,
                borderWidth: 2,
                borderColor: selected ? palette.redBorder : palette.borderStrong,
                backgroundColor: selected ? palette.red : palette.surfaceRaised,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
              onPress={() => setSelectedFeedback(option.value)}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "800",
                  color: palette.textPrimary,
                  fontFamily: fliegerTypography.familyBody,
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedFeedback && selectedFeedback !== "looks_right" ? (
        <>
          <TextInput
            value={correctedAnswer}
            onChangeText={setCorrectedAnswer}
            placeholder="Optional corrected answer or what should have been said"
            placeholderTextColor={palette.textMuted}
            multiline
            style={{
              minHeight: 76,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: palette.borderStrong,
              backgroundColor: palette.surfaceRaised,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: palette.textPrimary,
              fontFamily: fliegerTypography.familyBody,
              textAlignVertical: "top",
            }}
          />
          <TextInput
            value={expectedSource}
            onChangeText={setExpectedSource}
            placeholder="Optional expected source or section"
            placeholderTextColor={palette.textMuted}
            multiline
            style={{
              minHeight: 56,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: palette.borderStrong,
              backgroundColor: palette.surfaceRaised,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: palette.textPrimary,
              fontFamily: fliegerTypography.familyBody,
              textAlignVertical: "top",
            }}
          />
        </>
      ) : null}
      <TouchableOpacity
        style={{
          alignSelf: "flex-start",
          borderRadius: 999,
          borderWidth: 2,
          borderColor: palette.borderStrong,
          backgroundColor: palette.surfaceRaised,
          paddingHorizontal: 14,
          paddingVertical: 10,
          opacity: selectedFeedback ? 1 : 0.5,
        }}
        disabled={!selectedFeedback || isSubmitting}
        onPress={handleSubmit}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: palette.textPrimary,
            fontFamily: fliegerTypography.family,
          }}
        >
          {isSubmitting ? "Saving feedback..." : "Save feedback draft"}
        </Text>
      </TouchableOpacity>
      {submitMessage ? (
        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            color: palette.textSecondary,
            fontFamily: fliegerTypography.familyBody,
          }}
        >
          {submitMessage}
        </Text>
      ) : null}
    </View>
  );
}
