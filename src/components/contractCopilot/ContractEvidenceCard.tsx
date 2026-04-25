import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard } from "../../types/contractCopilot";

type ContractEvidenceCardProps = {
  answer: ContractAnswerCard;
};

export function ContractEvidenceCard({ answer }: ContractEvidenceCardProps) {
  const visibleReferences = answer.references.filter(
    (reference) =>
      reference.ruleType !== "inference" &&
      typeof reference.quoteSnippet === "string" &&
      reference.quoteSnippet.trim().length > 0
  );

  if (visibleReferences.length === 0) {
    return null;
  }

  const sourceBadgeLabel = (
    sourceId: "pwa" | "compensation_manual" | "scheduler_manual",
    ruleType: string,
    displaySourceLabel?: string
  ) => {
    if (displaySourceLabel) {
      return displaySourceLabel;
    }
    if (ruleType === "inference") {
      return "Inference";
    }
    if (sourceId === "pwa") {
      return "PWA";
    }
    if (sourceId === "compensation_manual") {
      return "Compensation Manual";
    }
    return "Scheduler Manual";
  };

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
        Contract support
      </Text>
      {visibleReferences.map((reference) => (
          <View
            key={`${reference.label}-${reference.section}-${reference.quoteSnippet ?? "no-quote"}`}
            style={{
              gap: 6,
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              padding: 12,
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <Text
                style={{
                  backgroundColor:
                    reference.ruleType === "contract"
                      ? "#DDE8F7"
                      : reference.ruleType === "scheduler_practice"
                        ? "#F4E9D2"
                        : "#F8E1E5",
                  color: "#0C2340",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  overflow: "hidden",
                  fontSize: 11,
                  fontWeight: "800",
                }}
              >
                {sourceBadgeLabel(reference.sourceId, reference.ruleType, reference.displaySourceLabel)}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#0C2340", flexShrink: 1 }}>
                {reference.section}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: "#6B7C93" }}>
              {reference.label}
            </Text>
            {reference.quoteSnippet ? (
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  color: "#0C2340",
                  fontStyle: "italic",
                  backgroundColor: "#F7FAFC",
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                "{reference.quoteSnippet}"
              </Text>
            ) : null}
            <Text style={{ fontSize: 12, color: "#6B7C93" }}>
              {reference.ruleType === "contract"
                ? "Contract-backed"
                : reference.ruleType === "scheduler_practice"
                  ? "Operational guidance"
                  : "Inference support"}
            </Text>
          </View>
        ))}
    </View>
  );
}
