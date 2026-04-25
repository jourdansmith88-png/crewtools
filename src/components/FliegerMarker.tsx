import React from "react";
import { View } from "react-native";
import { getFliegerPalette } from "../theme/flieger";

type FliegerMarkerProps = {
  color?: string;
  dotSize?: number;
  triangleWidth?: number;
  triangleHeight?: number;
};

export function FliegerMarker({
  color,
  dotSize = 6,
  triangleWidth = 12,
  triangleHeight = 10,
}: FliegerMarkerProps) {
  const palette = getFliegerPalette();
  const markerColor = color ?? palette.cream;

  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: dotSize + 8,
          marginBottom: -1,
        }}
      >
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: markerColor,
          }}
        />
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: markerColor,
          }}
        />
      </View>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: triangleWidth / 2,
          borderRightWidth: triangleWidth / 2,
          borderBottomWidth: triangleHeight,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: markerColor,
        }}
      />
    </View>
  );
}
