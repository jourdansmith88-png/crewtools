import React from "react";
import { Text, View } from "react-native";
import type { ContractCopilotAttachedEvidence } from "../../types/contractCopilot";
import { fliegerTypography, getFliegerPalette } from "../../theme/flieger";

type CollapsibleEvidencePanelProps = {
  evidence: ContractCopilotAttachedEvidence[];
};

export function CollapsibleEvidencePanel({ evidence }: CollapsibleEvidencePanelProps) {
  const palette = getFliegerPalette();
  if (evidence.length === 0) {
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
      <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textSecondary, textTransform: "uppercase", letterSpacing: 1.1, fontFamily: fliegerTypography.familyBody }}>Extracted facts</Text>
      {evidence.filter((item) => item.status === "added" && item.facts).map((item) => (
        <View
          key={item.id}
          style={{
            gap: 6,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: palette.border,
            backgroundColor: palette.surfaceRaised,
            padding: 10,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: palette.textPrimary, fontFamily: fliegerTypography.family }}>{item.sourceName}</Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }}>{item.facts?.summary}</Text>
          <Text style={{ fontSize: 11, color: palette.textMuted, fontFamily: fliegerTypography.familyBody }}>
            Confidence: {item.facts?.confidence}
            {item.facts?.reportTime ? ` • Report ${item.facts.reportTime}` : ""}
            {item.facts?.releaseTime ? ` • Release ${item.facts.releaseTime}` : ""}
          </Text>
          {item.facts?.missingOrUnclear && item.facts.missingOrUnclear.length > 0 ? (
            <View style={{ gap: 2 }}>
              {item.facts.missingOrUnclear.slice(0, 3).map((missing) => (
                <Text key={missing} style={{ fontSize: 11, lineHeight: 16, color: palette.textMuted, fontFamily: fliegerTypography.familyBody }}>
                  • {missing}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
