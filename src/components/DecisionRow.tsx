import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { fliegerTypography, getFliegerPalette } from "../theme/flieger";
import { InstrumentPanel } from "./InstrumentPanel";

type DecisionRowVariant = "canHold" | "notHoldable" | "close" | "current";

type DecisionRowProps = {
  title: string;
  status: string;
  variant: DecisionRowVariant;
  badgePrimary: string;
  badgeLabel: string;
  statPairs: Array<{ label: string; value: string }>;
  footer?: string;
  onPress?: () => void;
};

export function DecisionRow({
  title,
  status,
  variant,
  badgePrimary,
  badgeLabel,
  statPairs,
  footer,
  onPress,
}: DecisionRowProps) {
  const palette = getFliegerPalette();

  const tone = variant === "canHold" || variant === "current" ? "green" : variant === "notHoldable" ? "red" : "neutral";
  const statusColor =
    variant === "canHold" || variant === "current"
      ? palette.green
      : variant === "notHoldable"
        ? palette.red
        : palette.label;
  const signalBorderColor =
    variant === "canHold" || variant === "current"
      ? palette.green
      : variant === "notHoldable"
        ? palette.red
        : palette.borderStrong;
  const signalGlow =
    variant === "canHold" || variant === "current"
      ? "rgba(0,255,102,0.25)"
      : variant === "notHoldable"
        ? "rgba(255,48,48,0.25)"
        : "rgba(17,24,32,0.08)";
  const badgeShadowColor =
    variant === "canHold" || variant === "current"
      ? palette.green
      : variant === "notHoldable"
        ? palette.red
        : palette.borderStrong;

  const content = (
    <InstrumentPanel
      variant="decision"
      tone={tone}
      style={{
        gap: 12,
        backgroundColor: palette.surfaceRaised,
        borderColor: signalBorderColor,
        borderWidth: 2.8,
        shadowColor: signalGlow,
        shadowOpacity: variant === "close" ? 0.1 : 0.22,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
        elevation: variant === "close" ? 2 : 4,
        position: "relative",
        overflow: "visible",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          bottom: 2,
          left: 2,
          borderRadius: 11,
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.35)",
        }}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 30,
              lineHeight: 30,
              fontWeight: "900",
              color: palette.textPrimary,
              fontFamily: fliegerTypography.familyDisplay,
              fontVariant: ["tabular-nums"],
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 16,
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: fliegerTypography.letterSpacingLabel,
              color: statusColor,
              fontFamily: fliegerTypography.familyLabel,
            }}
          >
            {status}
          </Text>
        </View>
        <InstrumentPanel
          variant="dataPlate"
          tone={tone}
          style={{
            minWidth: 94,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: tone === "neutral" ? palette.badgeNeutral : palette.surfaceRaised,
            borderColor: signalBorderColor,
            borderWidth: 2.2,
            shadowColor: badgeShadowColor,
            shadowOpacity: 0.18,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 0 },
            elevation: 2,
          }}
        >
          <View style={{ alignItems: "center", justifyContent: "center", gap: 2 }}>
            <Text
              style={{
                color: palette.textPrimary,
                fontSize: 20,
                lineHeight: 21,
                fontWeight: "900",
                fontFamily: fliegerTypography.familyValue,
                fontVariant: ["tabular-nums"],
              }}
            >
              {badgePrimary}
            </Text>
            <Text
              style={{
                color: palette.textSecondary,
                fontSize: 12,
                lineHeight: 12,
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: fliegerTypography.letterSpacingLabel,
                textAlign: "center",
                fontFamily: fliegerTypography.familyBody,
              }}
            >
              {badgeLabel}
            </Text>
          </View>
        </InstrumentPanel>
      </View>
      <View style={{ height: 1, backgroundColor: palette.borderStrong, opacity: 0.8 }} />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          borderWidth: 1,
          borderColor: palette.borderStrong,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: palette.surfaceRaised,
        }}
      >
        {statPairs.map((pair, index) => (
          <View
            key={`${title}-${pair.label}-${index}`}
            style={{
              width: "50%",
              minHeight: 54,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 4,
              justifyContent: "center",
              borderBottomWidth: 1,
              borderBottomColor: palette.border,
              borderRightWidth: index % 2 === 0 ? 1 : 0,
              borderRightColor: palette.border,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                lineHeight: 12,
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: fliegerTypography.letterSpacingLabel,
                color: palette.label,
                fontFamily: fliegerTypography.familyLabel,
              }}
            >
              {pair.label}
            </Text>
            <Text
              style={{
                fontSize: 24,
                lineHeight: 25,
                fontWeight: "900",
                color: palette.textPrimary,
                fontFamily: fliegerTypography.familyValue,
                fontVariant: ["tabular-nums"],
              }}
            >
              {pair.value}
            </Text>
          </View>
        ))}
      </View>
      {footer ? (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: palette.textMuted,
            fontFamily: fliegerTypography.familyBody,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </InstrumentPanel>
  );

  return onPress ? (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}
