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
  background: "#242A30",
  surface: "#2B3239",
  surfaceRaised: "#343C44",
  inputBackground: "#303840",
  border: "#46515C",
  borderStrong: "#5B6670",
  textPrimary: "#F2E9DC",
  textSecondary: "#D7DEE4",
  textMuted: "#C3CBD2",
  label: "#66D9F2",
  green: "#00FF66",
  greenBorder: "#3A8E41",
  red: "#FF3030",
  redBorder: "#A92B2B",
  cream: "#F2E9DC",
  badgeNeutral: "#20262C",
  badgeNeutralBorder: "#5B6670",
  accent: "#66D9F2",
  accentSoft: "rgba(102, 217, 242, 0.14)",
  glowSoft: "rgba(102, 217, 242, 0.10)",
};

export const fliegerLightPalette: FliegerPalette = {
  background: "#B8C0C8",
  surface: "#C6CDD4",
  surfaceRaised: "#D2D8DE",
  inputBackground: "#D8DDE2",
  border: "#7E8993",
  borderStrong: "#5F6B76",
  textPrimary: "#111820",
  textSecondary: "#243744",
  textMuted: "#344552",
  label: "#007FA3",
  green: "#00FF66",
  greenBorder: "#3A8E41",
  red: "#FF3030",
  redBorder: "#A92B2B",
  cream: "#F2E9DC",
  badgeNeutral: "#AEB7C0",
  badgeNeutralBorder: "#5F6B76",
  accent: "#007FA3",
  accentSoft: "rgba(0, 127, 163, 0.12)",
  glowSoft: "rgba(0, 127, 163, 0.10)",
};

export const fliegerTypography = {
  familyDisplay:
    'Rajdhani, Bahnschrift, "IBM Plex Sans Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
  familyLabel:
    'Rajdhani, Bahnschrift, "IBM Plex Sans Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
  familyValue:
    'Rajdhani, Bahnschrift, "IBM Plex Sans Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
  familyBody: '"IBM Plex Sans", Inter, "Segoe UI", system-ui, sans-serif',
  family:
    'Rajdhani, Bahnschrift, "IBM Plex Sans Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
  letterSpacingWordmark: 3.4,
  letterSpacingWide: 2.6,
  letterSpacingLabel: 1.8,
  letterSpacingTight: 1.1,
};

export function getFliegerPalette(preferredScheme?: "light" | "dark" | null): FliegerPalette {
  const scheme = preferredScheme ?? Appearance.getColorScheme();
  return scheme === "dark" ? fliegerDarkPalette : fliegerLightPalette;
}
