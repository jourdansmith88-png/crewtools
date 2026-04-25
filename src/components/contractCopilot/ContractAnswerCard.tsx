import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard as ContractAnswerCardModel } from "../../types/contractCopilot";
import { fliegerTypography, getFliegerPalette } from "../../theme/flieger";

type ContractAnswerCardProps = {
  answer: ContractAnswerCardModel;
};

export function ContractAnswerCard({ answer }: ContractAnswerCardProps) {
  const palette = getFliegerPalette();
  const isAIUnverified = answer.caveats?.includes("AI (unverified)") ?? false;
  const isCaution =
    (answer.caveats?.some((item) => item.includes("Truth guard downgraded")) ?? false) ||
    answer.supportLevel === "inference_heavy" ||
    answer.supportLevel === "mixed";
  const trustLabel = isCaution ? "Caution" : "Normal";
  const trustBackground = palette.surfaceRaised;
  const trustColor = isCaution ? palette.label : palette.green;

  return (
    <View
      style={{
        gap: 10,
        backgroundColor: palette.surface,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: palette.borderStrong,
        padding: 18,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          color: palette.label,
          textTransform: "uppercase",
          fontFamily: fliegerTypography.familyBody,
          letterSpacing: 1,
        }}
      >
        Bottom line
      </Text>
      {isAIUnverified ? (
        <Text
          style={{
            alignSelf: "flex-start",
            backgroundColor: palette.surfaceRaised,
            color: palette.label,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 14,
            overflow: "hidden",
            fontSize: 11,
            fontWeight: "800",
            borderWidth: 1.5,
            borderColor: palette.borderStrong,
            fontFamily: fliegerTypography.family,
          }}
        >
          AI (unverified)
        </Text>
      ) : null}
      {answer.answerCompleteness ? (
        <Text
          style={{
            alignSelf: "flex-start",
            backgroundColor: palette.surfaceRaised,
            color: answer.answerCompleteness === "resolved" ? palette.green : palette.label,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 14,
            overflow: "hidden",
            fontSize: 11,
            fontWeight: "800",
            borderWidth: 1.5,
            borderColor: answer.answerCompleteness === "resolved" ? palette.greenBorder : palette.borderStrong,
            fontFamily: fliegerTypography.family,
          }}
        >
          {answer.answerCompleteness === "resolved" ? "Resolved" : "Provisional"}
        </Text>
      ) : null}
      <Text
        style={{
          alignSelf: "flex-start",
          backgroundColor: trustBackground,
          color: trustColor,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 14,
          overflow: "hidden",
          fontSize: 11,
          fontWeight: "800",
          textTransform: "uppercase",
          borderWidth: 1.5,
          borderColor: isCaution ? palette.borderStrong : palette.greenBorder,
          fontFamily: fliegerTypography.family,
        }}
      >
        {trustLabel}
      </Text>
      <Text
        style={{
          fontSize: 23,
          lineHeight: 31,
          fontWeight: "900",
          color: palette.textPrimary,
          fontFamily: fliegerTypography.family,
        }}
      >
        {answer.shortAnswer}
      </Text>
    </View>
  );
}
