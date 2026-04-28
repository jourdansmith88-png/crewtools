export const reroutePayRules = {
  preFirstAirborneGate: {
    rule: "23 L.2",
    label: "Pre-first-airborne reroute gate",
    sourceAnchor: "PWA Section 23 L.2",
  },
  reroutedSegmentBeforeBreak: {
    rule: "23 L.4",
    label: "Rerouted segment premium before first break in duty",
    sourceAnchor: "PWA Section 23 L.4",
  },
  reroutedSegmentAfterBreak: {
    rule: "23 L.4",
    label: "Rerouted segment premium after first break in duty",
    sourceAnchor: "PWA Section 23 L.4",
  },
  releasedAtBaseGuarantee: {
    rule: "23 L.4.c / 4 F",
    label: "Release at base / original rotation guarantee",
    sourceAnchor: "PWA Section 23 L.4.c / Section 4 F",
  },
  lineholderLateRelease: {
    rule: "23 L.8",
    label: "Regular pilot late-release premium",
    sourceAnchor: "PWA Section 23 L.8",
  },
  reserveXDayLateRelease: {
    rule: "23 L.9",
    label: "Reserve late-release into X-day / line day-off premium",
    sourceAnchor: "PWA Section 23 L.9",
  },
  additionalDutyPeriod: {
    rule: "23 L.10 / 23 L.11",
    label: "Additional duty period after original rotation",
    sourceAnchor: "PWA Section 23 L.10 / 23 L.11",
  },
  legalityTiming: {
    rule: "23 L.12 / 23 L.13",
    label: "Legality and timing basis",
    sourceAnchor: "PWA Section 23 L.12 / 23 L.13",
  },
} as const;
