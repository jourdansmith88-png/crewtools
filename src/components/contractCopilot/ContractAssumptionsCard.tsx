import React from "react";
import { Text, View } from "react-native";

type ContractAssumptionsCardProps = {
  assumptions: string[];
};

export function ContractAssumptionsCard({
  assumptions,
}: ContractAssumptionsCardProps) {
  if (assumptions.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        gap: 8,
        backgroundColor: "#F7FAFC",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#D4DEE9",
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: "#0C2340" }}>
        Assumptions
      </Text>
      {assumptions.map((assumption) => (
        <Text key={assumption} style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
          • {assumption}
        </Text>
      ))}
    </View>
  );
}
