import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard } from "../../types/contractCopilot";
import { getFliegerPalette } from "../../theme/flieger";

type ContractEvidenceCardProps = {
  answer: ContractAnswerCard;
};

export function ContractEvidenceCard({ answer }: ContractEvidenceCardProps) {
  const palette = getFliegerPalette();
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
        backgroundColor: palette.surfaceRaised,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: palette.border,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: palette.textPrimary }}>
        Contract support
      </Text>
      {visibleReferences.map((reference) => (
          <View
            key={`${reference.label}-${reference.section}-${reference.quoteSnippet ?? "no-quote"}`}
            style={{
              gap: 6,
              backgroundColor: palette.surfaceRecessed,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: palette.border,
              padding: 12,
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <Text
                style={{
                  backgroundColor:
                    reference.ruleType === "contract"
                      ? palette.accentSoft
                      : reference.ruleType === "scheduler_practice"
                        ? palette.surfaceRaised
                        : palette.surface,
                  color: palette.textPrimary,
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
              <Text style={{ fontSize: 13, fontWeight: "800", color: palette.textPrimary, flexShrink: 1 }}>
                {reference.section}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: palette.textMuted }}>
              {reference.label}
            </Text>
            {reference.quoteSnippet ? (
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  color: palette.textPrimary,
                  fontStyle: "italic",
                  backgroundColor: palette.surface,
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                "{reference.quoteSnippet}"
              </Text>
            ) : null}
            <Text style={{ fontSize: 12, color: palette.textMuted }}>
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
