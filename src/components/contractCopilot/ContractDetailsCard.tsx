import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard } from "../../types/contractCopilot";
import { getFliegerPalette } from "../../theme/flieger";

type ContractDetailsCardProps = {
  answer: ContractAnswerCard;
};

export function ContractDetailsCard({ answer }: ContractDetailsCardProps) {
  const palette = getFliegerPalette();
  const hasDetails =
    answer.assumptions.length > 0 ||
    (answer.breakItDown?.length ?? 0) > 0 ||
    Boolean(answer.followUpSuggestion);

  if (!hasDetails) {
    return null;
  }

  return (
    <View
      style={{
        gap: 12,
        backgroundColor: palette.surfaceRaised,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: palette.border,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: palette.textPrimary }}>
        Details
      </Text>
      {answer.breakItDown && answer.breakItDown.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: palette.textPrimary }}>
            How to think about it
          </Text>
          {answer.breakItDown.map((item) => (
            <Text key={item} style={{ fontSize: 14, lineHeight: 21, color: palette.textMuted }}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}
      {answer.assumptions.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: palette.textPrimary }}>
            Assumptions
          </Text>
          {answer.assumptions.map((assumption) => (
            <Text key={assumption} style={{ fontSize: 14, lineHeight: 21, color: palette.textMuted }}>
              • {assumption}
            </Text>
          ))}
        </View>
      ) : null}
      {answer.followUpSuggestion ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: palette.textPrimary }}>
            Follow-up
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textMuted }}>
            {answer.followUpSuggestion}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
