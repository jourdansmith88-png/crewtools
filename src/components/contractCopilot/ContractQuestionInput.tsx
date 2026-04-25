import React from "react";
import { Text, View } from "react-native";
import { InstrumentField } from "../InstrumentField";
import { InstrumentButton } from "../InstrumentButton";
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
          color: palette.label,
          textTransform: "uppercase",
          letterSpacing: fliegerTypography.letterSpacingLabel,
          fontFamily: fliegerTypography.familyLabel,
        }}
      >
        Ask a contract question in plain English
      </Text>
      <InstrumentField
        value={value}
        onChangeText={onChangeText}
        placeholder="If I'm reserve and get inverse assigned, what should happen?"
        multiline
        minHeight={112}
        autoCapitalize="sentences"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <InstrumentButton label={primaryActionLabel} variant="active" onPress={onSubmit} />
        {showContinueThreadAction && onContinueThread ? (
          <InstrumentButton label="Reply in this thread" variant="neutral" onPress={onContinueThread} />
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
