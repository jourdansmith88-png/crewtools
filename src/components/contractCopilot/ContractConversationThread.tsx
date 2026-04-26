import React from "react";
import { Text, View } from "react-native";
import type { ContractCopilotTurn } from "../../types/contractCopilot";
import { getFliegerPalette } from "../../theme/flieger";

type ContractConversationThreadProps = {
  turns: ContractCopilotTurn[];
};

export function ContractConversationThread({ turns }: ContractConversationThreadProps) {
  const palette = getFliegerPalette();

  if (turns.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: 10 }}>
      {turns.map((turn) =>
        turn.role === "pilot" ? (
          <View
            key={turn.id}
            style={{
              alignSelf: "flex-end",
              maxWidth: "88%",
              backgroundColor: palette.surfaceRaised,
              borderWidth: 1.5,
              borderColor: palette.accent,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textPrimary, fontWeight: "700" }}>
              {turn.message}
            </Text>
          </View>
        ) : (
          <View
            key={turn.id}
            style={{
              alignSelf: "flex-start",
              maxWidth: "92%",
              backgroundColor: palette.surfaceRaised,
              borderWidth: 1.5,
              borderColor: palette.border,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: palette.label, textTransform: "uppercase" }}>
              Copilot
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: palette.textPrimary }}>{turn.message}</Text>
            {turn.source === "quick_reply" && turn.factPatch ? (
              <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textMuted }}>
                Updated facts: {Object.keys(turn.factPatch).join(", ")}
              </Text>
            ) : null}
          </View>
        )
      )}
    </View>
  );
}
