import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { ClarifyingQuestion, ContractQuickReply } from "../../types/contractCopilot";
import { getFliegerPalette } from "../../theme/flieger";

type ClarifyingQuestionsCardProps = {
  questions: ClarifyingQuestion[];
  onChoose: (reply: ContractQuickReply) => void;
};

export function ClarifyingQuestionsCard({
  questions,
  onChoose,
}: ClarifyingQuestionsCardProps) {
  const palette = getFliegerPalette();

  return (
    <View
      style={{
        gap: 14,
        backgroundColor: palette.surfaceRaised,
        borderWidth: 1.5,
        borderColor: palette.border,
        borderRadius: 18,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "800", color: palette.textPrimary }}>
        Clarifying question
      </Text>
      {questions.map((question) => (
        <View key={question.id} style={{ gap: 10 }}>
          <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textMuted }}>
            {question.prompt}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(question.quickReplies ?? []).map((reply) => (
              <TouchableOpacity
                key={`${question.id}-${reply.id}`}
                style={{
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceRecessed,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
                onPress={() => onChoose(reply)}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: palette.textPrimary }}>
                  {reply.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
