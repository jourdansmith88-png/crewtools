import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { ClarifyingQuestion, ContractQuickReply } from "../../types/contractCopilot";

type ClarifyingQuestionsCardProps = {
  questions: ClarifyingQuestion[];
  onChoose: (reply: ContractQuickReply) => void;
};

export function ClarifyingQuestionsCard({
  questions,
  onChoose,
}: ClarifyingQuestionsCardProps) {
  return (
    <View
      style={{
        gap: 14,
        backgroundColor: "#F7FAFC",
        borderWidth: 1,
        borderColor: "#D4DEE9",
        borderRadius: 18,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "800", color: "#0C2340" }}>
        Clarifying question
      </Text>
      {questions.map((question) => (
        <View key={question.id} style={{ gap: 10 }}>
          <Text style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
            {question.prompt}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(question.quickReplies ?? []).map((reply) => (
              <TouchableOpacity
                key={`${question.id}-${reply.id}`}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#CFD9E5",
                  backgroundColor: "#FFFFFF",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
                onPress={() => onChoose(reply)}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#0C2340" }}>
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
