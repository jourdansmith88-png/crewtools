import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard } from "../../types/contractCopilot";

type ContractWhyAppliesCardProps = {
  answer: ContractAnswerCard;
};

export function ContractWhyAppliesCard({ answer }: ContractWhyAppliesCardProps) {
  if (!answer.plainEnglishExplanation) {
    return null;
  }

  return (
    <View
      style={{
        gap: 10,
        backgroundColor: "#F7FAFC",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#D4DEE9",
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: "#0C2340" }}>Why</Text>
      <Text style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
        {answer.plainEnglishExplanation}
      </Text>
    </View>
  );
}
