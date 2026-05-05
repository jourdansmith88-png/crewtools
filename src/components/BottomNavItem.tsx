import React from "react";
import { Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { fliegerTypography, getFliegerPalette } from "../theme/flieger";

type BottomNavItemProps = {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

export function BottomNavItem({ icon, label, active, onPress }: BottomNavItemProps) {
  const palette = getFliegerPalette();
  const { width } = useWindowDimensions();
  const isCompactMobile = width < 520;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        flex: 1,
        paddingHorizontal: isCompactMobile ? 6 : 10,
        paddingVertical: isCompactMobile ? 6 : 10,
        borderRadius: isCompactMobile ? 12 : 14,
        backgroundColor: palette.surfaceRaised,
        borderWidth: 2,
        borderColor: active ? palette.accent : palette.border,
        alignItems: "center",
        gap: isCompactMobile ? 4 : 8,
      }}
    >
      <View
        style={{
          width: isCompactMobile ? 38 : 52,
          height: isCompactMobile ? 38 : 52,
          borderRadius: isCompactMobile ? 19 : 26,
          backgroundColor: active ? palette.accentSoft : palette.inputBackground,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: active ? palette.accent : palette.borderStrong,
        }}
      >
        <Text
          style={{
            color: active ? palette.accent : palette.textSecondary,
            fontWeight: "900",
            fontSize: icon.length > 1 ? (isCompactMobile ? 12 : 16) : isCompactMobile ? 16 : 22,
            lineHeight: icon.length > 1 ? (isCompactMobile ? 14 : 18) : isCompactMobile ? 18 : 24,
            letterSpacing: icon.length > 1 ? 0.4 : 0,
            fontFamily: fliegerTypography.familyValue,
            fontVariant: ["tabular-nums"],
          }}
        >
          {icon}
        </Text>
      </View>
      <Text
        style={{
          color: active ? palette.accent : palette.textSecondary,
          fontWeight: "700",
          fontSize: isCompactMobile ? 9 : 12,
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
