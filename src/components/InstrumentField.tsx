import React from "react";
import { Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { fliegerTypography, getFliegerPalette } from "../theme/flieger";

type InstrumentFieldProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  minHeight?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
};

export function InstrumentField({
  label,
  value,
  onChangeText,
  placeholder,
  prefix,
  suffix,
  multiline = false,
  keyboardType,
  minHeight,
  autoCapitalize = "none",
}: InstrumentFieldProps) {
  const palette = getFliegerPalette();

  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text
          style={{
            fontSize: 12,
            color: palette.label,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: fliegerTypography.letterSpacingLabel,
            fontFamily: fliegerTypography.familyLabel,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          backgroundColor: palette.inputBackground,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: palette.borderStrong,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          minHeight: minHeight ?? (multiline ? 120 : 52),
        }}
      >
        {prefix ? (
          <Text style={{ color: palette.textMuted, fontSize: 16, fontWeight: "700", marginTop: multiline ? 2 : 0 }}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          autoCapitalize={autoCapitalize}
          style={{
            flex: 1,
            minHeight: multiline ? (minHeight ?? 120) - 24 : undefined,
            fontSize: multiline ? 14 : 18,
            lineHeight: multiline ? 22 : undefined,
            color: palette.textPrimary,
            paddingVertical: multiline ? 0 : 12,
            fontFamily: multiline ? fliegerTypography.familyBody : fliegerTypography.familyValue,
            fontVariant: multiline ? undefined : ["tabular-nums"],
          }}
        />
        {suffix ? (
          <Text style={{ color: palette.textMuted, fontSize: 16, fontWeight: "700", marginTop: multiline ? 2 : 0 }}>
            {suffix}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
