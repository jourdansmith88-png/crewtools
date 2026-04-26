import React from "react";
import { Text, View } from "react-native";
import { getFliegerPalette } from "../../theme/flieger";

type ContractBulletSectionCardProps = {
  title: string;
  items?: string[];
};

export function ContractBulletSectionCard({ title, items }: ContractBulletSectionCardProps) {
  const palette = getFliegerPalette();

  if (!items || items.length === 0) {
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
      <Text style={{ fontSize: 16, fontWeight: "800", color: palette.textPrimary }}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={{ fontSize: 14, lineHeight: 21, color: palette.textMuted }}>
          • {item}
        </Text>
      ))}
    </View>
  );
}
