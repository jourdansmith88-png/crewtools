import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard } from "../../types/contractCopilot";

type ContractDetailsCardProps = {
  answer: ContractAnswerCard;
};

export function ContractDetailsCard({ answer }: ContractDetailsCardProps) {
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
        backgroundColor: "#F7FAFC",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#D4DEE9",
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: "#0C2340" }}>
        Details
      </Text>
      {answer.breakItDown && answer.breakItDown.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#0C2340" }}>
            How to think about it
          </Text>
          {answer.breakItDown.map((item) => (
            <Text key={item} style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}
      {answer.assumptions.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#0C2340" }}>
            Assumptions
          </Text>
          {answer.assumptions.map((assumption) => (
            <Text key={assumption} style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
              • {assumption}
            </Text>
          ))}
        </View>
      ) : null}
      {answer.followUpSuggestion ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#0C2340" }}>
            Follow-up
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
            {answer.followUpSuggestion}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
