import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { fliegerTypography, getFliegerPalette } from "../theme/flieger";

type BottomNavItemProps = {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

export function BottomNavItem({ icon, label, active, onPress }: BottomNavItemProps) {
  const palette = getFliegerPalette();

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        flex: 1,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: palette.surfaceRaised,
        borderWidth: 2,
        borderColor: active ? palette.accent : palette.border,
        alignItems: "center",
        gap: 8,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
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
            fontSize: icon.length > 1 ? 16 : 22,
            lineHeight: icon.length > 1 ? 18 : 24,
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
          fontSize: 12,
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
