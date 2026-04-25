import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { fliegerTypography, getFliegerPalette } from "../../theme/flieger";

type ContractQuestionInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onContinueThread?: () => void;
  onImageSelected?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  attachLabel?: string;
  fileInputId?: string;
  primaryActionLabel?: string;
  showContinueThreadAction?: boolean;
};

export function ContractQuestionInput({
  value,
  onChangeText,
  onSubmit,
  onContinueThread,
  onImageSelected,
  attachLabel = "Attach trip screenshot",
  fileInputId = "contract-copilot-image-upload",
  primaryActionLabel = "Ask Contract Copilot",
  showContinueThreadAction = false,
}: ContractQuestionInputProps) {
  const palette = getFliegerPalette();
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "800",
          color: palette.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 1.1,
          fontFamily: fliegerTypography.familyBody,
        }}
      >
        Ask a contract question in plain English
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="If I'm reserve and get inverse assigned, what should happen?"
        placeholderTextColor={palette.textMuted}
        multiline
        style={{
          minHeight: 112,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: palette.borderStrong,
          backgroundColor: palette.inputBackground,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          color: palette.textPrimary,
          fontFamily: fliegerTypography.familyBody,
          textAlignVertical: "top",
        }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <TouchableOpacity
          style={{
            alignSelf: "flex-start",
            backgroundColor: palette.surface,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: palette.accent,
            paddingHorizontal: 18,
            paddingVertical: 12,
          }}
          onPress={onSubmit}
        >
          <Text style={{ color: palette.cream, fontSize: 14, fontWeight: "800", fontFamily: fliegerTypography.family }}>
            {primaryActionLabel}
          </Text>
        </TouchableOpacity>
        {showContinueThreadAction && onContinueThread ? (
          <TouchableOpacity
            style={{
              alignSelf: "flex-start",
              backgroundColor: palette.surfaceRaised,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: palette.borderStrong,
              paddingHorizontal: 18,
              paddingVertical: 12,
            }}
            onPress={onContinueThread}
          >
            <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "800", fontFamily: fliegerTypography.family }}>
              Reply in this thread
            </Text>
          </TouchableOpacity>
        ) : null}
        {onImageSelected ? (
          <>
            <label
              htmlFor={fileInputId}
              style={{
                alignSelf: "flex-start",
                backgroundColor: palette.surfaceRaised,
                borderWidth: 1.5,
                borderColor: palette.borderStrong,
                borderRadius: 14,
                padding: 0,
                cursor: "pointer",
              }}
            >
              <Text
                style={{
                  color: palette.textPrimary,
                  fontSize: 14,
                  fontWeight: "800",
                  fontFamily: fliegerTypography.family,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                }}
              >
                {attachLabel}
              </Text>
            </label>
            <input
              id={fileInputId}
              type="file"
              accept="image/*"
              multiple
              onChange={onImageSelected}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}
