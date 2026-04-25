import React from "react";
import { Text, View } from "react-native";

type ContractBulletSectionCardProps = {
  title: string;
  items?: string[];
};

export function ContractBulletSectionCard({ title, items }: ContractBulletSectionCardProps) {
  if (!items || items.length === 0) {
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
      <Text style={{ fontSize: 16, fontWeight: "800", color: "#0C2340" }}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
          • {item}
        </Text>
      ))}
    </View>
  );
}
