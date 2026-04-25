import { Appearance } from "react-native";

export type FliegerPalette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  inputBackground: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  label: string;
  green: string;
  greenBorder: string;
  red: string;
  redBorder: string;
  cream: string;
  badgeNeutral: string;
  badgeNeutralBorder: string;
  accent: string;
  accentSoft: string;
  glowSoft: string;
};

export const fliegerDarkPalette: FliegerPalette = {
  background: "#0B0D10",
  surface: "#15181C",
  surfaceRaised: "#1A1F24",
  inputBackground: "#0B0D10",
  border: "#2A2F36",
  borderStrong: "#3A414A",
  textPrimary: "#F2E9DC",
  textSecondary: "#C8CEC9",
  textMuted: "#A8B0B8",
  label: "#74D2E7",
  green: "#00FF00",
  greenBorder: "#3A8E41",
  red: "#FF2B2B",
  redBorder: "#A92B2B",
  cream: "#F2E9DC",
  badgeNeutral: "#101418",
  badgeNeutralBorder: "#3A414A",
  accent: "#74D2E7",
  accentSoft: "rgba(116, 210, 231, 0.14)",
  glowSoft: "rgba(116, 210, 231, 0.08)",
};

export const fliegerLightPalette: FliegerPalette = {
  background: "#D7DCE0",
  surface: "#C3CAD1",
  surfaceRaised: "#DDE2E6",
  inputBackground: "#DDE2E6",
  border: "#68737D",
  borderStrong: "#5D6872",
  textPrimary: "#111820",
  textSecondary: "#2C3944",
  textMuted: "#41505C",
  label: "#74D2E7",
  green: "#00A63A",
  greenBorder: "#3A8E41",
  red: "#C93838",
  redBorder: "#A92B2B",
  cream: "#F2E9DC",
  badgeNeutral: "#AEB7C0",
  badgeNeutralBorder: "#68737D",
  accent: "#74D2E7",
  accentSoft: "rgba(116, 210, 231, 0.12)",
  glowSoft: "rgba(47, 142, 166, 0.08)",
};

export const fliegerTypography = {
  family: "Barlow Condensed, Roboto Condensed, IBM Plex Sans Condensed, system-ui, sans-serif",
  familyBody: "Barlow Condensed, Roboto Condensed, IBM Plex Sans Condensed, system-ui, sans-serif",
  letterSpacingWide: 2.2,
  letterSpacingTight: 1.1,
};

export function getFliegerPalette(preferredScheme?: "light" | "dark" | null): FliegerPalette {
  const scheme = preferredScheme ?? Appearance.getColorScheme();
  return scheme === "dark" ? fliegerDarkPalette : fliegerLightPalette;
}
