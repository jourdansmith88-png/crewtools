import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import type {
  ContractCopilotExtractedTripFacts,
  ContractCopilotPendingExtractionReview,
} from "../../types/contractCopilot";

type ExtractedFactsReviewCardProps = {
  review: ContractCopilotPendingExtractionReview;
  isBusy?: boolean;
  onChange: (nextFacts: ContractCopilotExtractedTripFacts) => void;
  onConfirm: () => void;
  onReject: () => void;
  onRetry: () => void;
};

function chipStyle(color: string) {
  return {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: color,
  } as const;
}

function updateLeg(
  facts: ContractCopilotExtractedTripFacts,
  legId: string,
  patch: Partial<ContractCopilotExtractedTripFacts["legs"][number]>
) {
  return {
    ...facts,
    legs: facts.legs.map((leg) => (leg.id === legId ? { ...leg, ...patch } : leg)),
  };
}

export function ExtractedFactsReviewCard({
  review,
  isBusy,
  onChange,
  onConfirm,
  onReject,
  onRetry,
}: ExtractedFactsReviewCardProps) {
  const facts = review.facts;

  return (
    <View
      style={{
        gap: 12,
        backgroundColor: "#F7FAFC",
        borderWidth: 1,
        borderColor: "#D4DEE9",
        borderRadius: 18,
        padding: 14,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: "#A6192E", textTransform: "uppercase" }}>
          Extracted facts review
        </Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#0C2340" }}>
          I found these facts from the screenshot
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: "#52606D" }}>
          Confirm or edit these before Contract Copilot uses them.
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#0C2340" }}>Summary</Text>
        <TextInput
          value={facts.summary}
          onChangeText={(summary) => onChange({ ...facts, summary })}
          multiline
          style={{
            minHeight: 72,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#D4DEE9",
            backgroundColor: "#FFFFFF",
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            color: "#102A43",
            textAlignVertical: "top",
          }}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {[
          ["Pairing / trip", facts.pairingNumber ?? "", (value: string) => onChange({ ...facts, pairingNumber: value })],
          ["Duty date", facts.dutyDate ?? "", (value: string) => onChange({ ...facts, dutyDate: value })],
          ["Report", facts.reportTime ?? "", (value: string) => onChange({ ...facts, reportTime: value })],
          ["Release", facts.releaseTime ?? "", (value: string) => onChange({ ...facts, releaseTime: value })],
        ].map(([label, value, onValueChange]) => (
          <View key={label as string} style={{ flexGrow: 1, minWidth: 180, gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#52606D" }}>{label as string}</Text>
            <TextInput
              value={value as string}
              onChangeText={onValueChange as (value: string) => void}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#D4DEE9",
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 10,
                paddingVertical: 10,
                fontSize: 14,
                color: "#102A43",
              }}
            />
          </View>
        ))}
      </View>

      {facts.legs.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#0C2340" }}>Visible legs</Text>
          {facts.legs.map((leg) => (
            <View
              key={leg.id}
              style={{
                gap: 8,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#D4DEE9",
                backgroundColor: "#FFFFFF",
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#0C2340" }}>
                {leg.legLabel || leg.flightNumber || leg.id}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {[
                  ["From", leg.origin ?? "", (value: string) => onChange(updateLeg(facts, leg.id, { origin: value }))],
                  ["To", leg.destination ?? "", (value: string) => onChange(updateLeg(facts, leg.id, { destination: value }))],
                  ["Type", leg.legType ?? "", (value: string) =>
                    onChange(
                      updateLeg(facts, leg.id, {
                        legType:
                          value === "operating" || value === "deadhead" || value === "unknown"
                            ? value
                            : "unknown",
                      })
                    )],
                  ["Orig dep", leg.originalDepartureTime ?? "", (value: string) =>
                    onChange(updateLeg(facts, leg.id, { originalDepartureTime: value }))],
                  ["Changed dep", leg.changedDepartureTime ?? "", (value: string) =>
                    onChange(updateLeg(facts, leg.id, { changedDepartureTime: value }))],
                ].map(([label, value, onValueChange]) => (
                  <View key={`${leg.id}-${label as string}`} style={{ minWidth: 120, flexGrow: 1, gap: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#52606D" }}>{label as string}</Text>
                    <TextInput
                      value={value as string}
                      onChangeText={onValueChange as (value: string) => void}
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#D4DEE9",
                        backgroundColor: "#F8FBFF",
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        fontSize: 13,
                        color: "#102A43",
                      }}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {facts.missingOrUnclear && facts.missingOrUnclear.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#0C2340" }}>Missing or unclear</Text>
          {facts.missingOrUnclear.map((item) => (
            <Text key={item} style={{ fontSize: 13, lineHeight: 19, color: "#52606D" }}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <TouchableOpacity style={chipStyle("#A6192E")} onPress={onConfirm} disabled={isBusy}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF" }}>
            Confirm and use facts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={chipStyle("#E4EEF8")} onPress={onRetry} disabled={isBusy}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#0C2340" }}>
            Retry extraction
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={chipStyle("#F1F5F9")} onPress={onReject} disabled={isBusy}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#52606D" }}>
            Reject
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
