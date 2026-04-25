import React from "react";
import { Text, View } from "react-native";
import type { ContractCopilotTurn } from "../../types/contractCopilot";

type ContractConversationThreadProps = {
  turns: ContractCopilotTurn[];
};

export function ContractConversationThread({ turns }: ContractConversationThreadProps) {
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
              backgroundColor: "#E4EEF8",
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 14, lineHeight: 21, color: "#0C2340", fontWeight: "700" }}>
              {turn.message}
            </Text>
          </View>
        ) : (
          <View
            key={turn.id}
            style={{
              alignSelf: "flex-start",
              maxWidth: "92%",
              backgroundColor: "#F7FAFC",
              borderWidth: 1,
              borderColor: "#D4DEE9",
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#6B7C93", textTransform: "uppercase" }}>
              Copilot
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: "#0C2340" }}>{turn.message}</Text>
            {turn.source === "quick_reply" && turn.factPatch ? (
              <Text style={{ fontSize: 12, lineHeight: 18, color: "#6B7C93" }}>
                Updated facts: {Object.keys(turn.factPatch).join(", ")}
              </Text>
            ) : null}
          </View>
        )
      )}
    </View>
  );
}
