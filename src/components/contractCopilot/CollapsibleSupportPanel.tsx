import React from "react";
import { Text, View } from "react-native";
import type { ContractAnswerCard } from "../../types/contractCopilot";
import { fliegerTypography, getFliegerPalette } from "../../theme/flieger";

type CollapsibleSupportPanelProps = {
  answer: ContractAnswerCard;
};

export function CollapsibleSupportPanel({ answer }: CollapsibleSupportPanelProps) {
  const palette = getFliegerPalette();
  const visibleReferences = answer.references.filter(
    (reference) =>
      reference.ruleType !== "inference" &&
      typeof reference.quoteSnippet === "string" &&
      reference.quoteSnippet.trim().length > 0,
  );

  if (visibleReferences.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        gap: 10,
        backgroundColor: palette.surface,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: palette.borderStrong,
        padding: 12,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textSecondary, textTransform: "uppercase", letterSpacing: 1.1, fontFamily: fliegerTypography.familyBody }}>Contract support</Text>
      {visibleReferences.map((reference) => (
        <View
          key={`${reference.section}-${reference.quoteSnippet ?? "no-quote"}-${reference.ruleType}`}
          style={{
            gap: 5,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: palette.border,
            backgroundColor: palette.surfaceRaised,
            padding: 10,
          }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Text
              style={{
                backgroundColor:
                  reference.sourceId === "pwa"
                    ? palette.badgeNeutral
                    : reference.sourceId === "compensation_manual"
                      ? palette.green
                      : palette.accentSoft,
                color: palette.textPrimary,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                overflow: "hidden",
                fontSize: 10,
                fontWeight: "800",
                fontFamily: fliegerTypography.familyBody,
              }}
            >
              {reference.displaySourceLabel ??
                (reference.sourceId === "pwa"
                  ? "PWA"
                  : reference.sourceId === "compensation_manual"
                    ? "Compensation Manual"
                    : "Scheduler Manual")}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textPrimary, flexShrink: 1, fontFamily: fliegerTypography.family }}>
              {reference.section}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: palette.textMuted, fontFamily: fliegerTypography.familyBody }}>{reference.label}</Text>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 18,
              color: palette.textPrimary,
              fontStyle: "italic",
              backgroundColor: palette.surface,
              borderRadius: 10,
              paddingHorizontal: 9,
              paddingVertical: 7,
              fontFamily: fliegerTypography.familyBody,
            }}
          >
            "{reference.quoteSnippet}"
          </Text>
        </View>
      ))}
    </View>
  );
}
