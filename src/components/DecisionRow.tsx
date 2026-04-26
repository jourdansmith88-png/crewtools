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
  const isDark = palette.textPrimary === "#F2E9DC";
  const rowSurface = isDark ? "#303840" : "#D2D8DE";

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
  const signalGlowOpacity =
    variant === "close" ? (isDark ? 0.14 : 0.08) : isDark ? 0.28 : 0.18;
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
        backgroundColor: rowSurface,
        borderColor: signalBorderColor,
        borderWidth: 2.8,
        shadowColor: signalGlow,
        shadowOpacity: signalGlowOpacity,
        shadowRadius: isDark ? 6 : 4,
        shadowOffset: { width: 0, height: isDark ? 3 : 2 },
        elevation: variant === "close" ? 2 : 5,
        position: "relative",
        overflow: "visible",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 1.5,
          left: 1.5,
          right: 1.5,
          height: 1,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 1.5,
          right: 1.5,
          bottom: 1.5,
          height: 1,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.08)",
        }}
      />
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
            backgroundColor:
              tone === "green"
                ? (isDark ? "rgba(0,255,102,0.12)" : "rgba(0,255,102,0.18)")
                : tone === "red"
                  ? (isDark ? "rgba(255,48,48,0.12)" : "rgba(255,48,48,0.16)")
                  : palette.surfaceRaised,
            borderColor: signalBorderColor,
            borderWidth: 2.2,
            shadowColor: badgeShadowColor,
            shadowOpacity: tone === "neutral" ? 0.12 : isDark ? 0.24 : 0.16,
            shadowRadius: isDark ? 4 : 3,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <View style={{ alignItems: "center", justifyContent: "center", gap: 2 }}>
            <Text
              style={{
                color: palette.textPrimary,
                fontSize: 19,
                lineHeight: 20,
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
          backgroundColor: palette.surface,
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
            fontSize: 14,
            lineHeight: 19,
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
