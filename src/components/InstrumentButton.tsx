import React from "react";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { fliegerTypography, getFliegerPalette } from "../theme/flieger";

type InstrumentButtonVariant = "neutral" | "active" | "success" | "danger";

type InstrumentButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: InstrumentButtonVariant;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function InstrumentButton({
  label,
  onPress,
  variant = "neutral",
  compact = false,
  style,
}: InstrumentButtonProps) {
  const palette = getFliegerPalette();

  const borderColor =
    variant === "active"
      ? palette.accent
      : variant === "success"
        ? palette.greenBorder
        : variant === "danger"
          ? palette.redBorder
          : palette.borderStrong;

  const backgroundColor =
    variant === "active"
      ? palette.accentSoft
      : variant === "success" || variant === "danger"
        ? palette.surfaceRaised
        : palette.surfaceRaised;

  const color =
    variant === "active"
      ? palette.accent
      : variant === "success"
        ? palette.green
        : variant === "danger"
          ? palette.red
          : palette.textPrimary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        {
          alignSelf: "flex-start",
          backgroundColor,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: compact ? 12 : 16,
          paddingVertical: compact ? 8 : 11,
        },
        style,
      ]}
    >
      <Text
        style={{
          color,
          fontSize: compact ? 12 : 13,
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: fliegerTypography.letterSpacingLabel,
          fontFamily: fliegerTypography.familyLabel,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function InstrumentChip(props: InstrumentButtonProps) {
  return <InstrumentButton compact variant={props.variant ?? "neutral"} {...props} />;
}
