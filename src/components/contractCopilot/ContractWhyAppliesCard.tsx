import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard } from "../../types/contractCopilot";
import { getFliegerPalette } from "../../theme/flieger";

type ContractWhyAppliesCardProps = {
  answer: ContractAnswerCard;
};

export function ContractWhyAppliesCard({ answer }: ContractWhyAppliesCardProps) {
  const palette = getFliegerPalette();

  if (!answer.plainEnglishExplanation) {
    return null;
  }

  return (
    <View
      style={{
        gap: 10,
        backgroundColor: palette.surfaceRaised,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: palette.border,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: palette.textPrimary }}>Why</Text>
      <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textMuted }}>
        {answer.plainEnglishExplanation}
      </Text>
    </View>
  );
}
