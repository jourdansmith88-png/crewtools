import React from "react";
import { Text, View } from "react-native";
import { getFliegerPalette } from "../../theme/flieger";

type ContractAssumptionsCardProps = {
  assumptions: string[];
};

export function ContractAssumptionsCard({
  assumptions,
}: ContractAssumptionsCardProps) {
  const palette = getFliegerPalette();

  if (assumptions.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        gap: 8,
        backgroundColor: palette.surfaceRaised,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: palette.border,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: palette.textPrimary }}>
        Assumptions
      </Text>
      {assumptions.map((assumption) => (
        <Text key={assumption} style={{ fontSize: 14, lineHeight: 21, color: palette.textMuted }}>
          • {assumption}
        </Text>
      ))}
    </View>
  );
}
