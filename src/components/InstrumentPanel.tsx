import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { getFliegerPalette } from "../theme/flieger";

type InstrumentPanelVariant = "default" | "elevated" | "dataPlate" | "decision" | "callout";
type InstrumentPanelTone = "neutral" | "cyan" | "green" | "red";

type InstrumentPanelProps = {
  children: React.ReactNode;
  variant?: InstrumentPanelVariant;
  tone?: InstrumentPanelTone;
  style?: StyleProp<ViewStyle>;
};

export function InstrumentPanel({
  children,
  variant = "default",
  tone = "neutral",
  style,
}: InstrumentPanelProps) {
  const palette = getFliegerPalette();

  const backgroundColor =
    variant === "elevated"
      ? palette.surfaceRaised
      : variant === "dataPlate"
        ? palette.surfaceRaised
        : variant === "decision"
          ? palette.surfaceRecessed
        : variant === "callout"
          ? palette.surfaceRaised
          : palette.surface;

  const borderColor =
    tone === "green"
      ? palette.greenBorder
      : tone === "red"
        ? palette.redBorder
        : tone === "cyan"
          ? palette.accent
          : palette.borderStrong;

  return (
    <View
      style={[
        {
          backgroundColor,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor,
          padding: variant === "dataPlate" ? 14 : 16,
          shadowColor: "transparent",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
