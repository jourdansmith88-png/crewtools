import type { RerouteAnalysisInput } from "./types.ts";

function normalize(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildRerouteAnalysisHaystack(input: RerouteAnalysisInput) {
  return normalize(
    [
      input.description,
      input.originalRotationText ?? "",
      input.changedRotationText ?? "",
      input.uploadedEvidenceSummary.originalScreenshotName ?? "",
      input.uploadedEvidenceSummary.changedScreenshotName ?? "",
      ...(input.uploadedEvidenceSummary.screenshotNames ?? []),
    ].join(" "),
  );
}

export function detectLikelyReroute(input: RerouteAnalysisInput) {
  const haystack = buildRerouteAnalysisHaystack(input);
  if (/\breroute\b/.test(haystack) || /\brerouted\b/.test(haystack) || /\breassign/.test(haystack)) {
    return true;
  }
  if (/\bchanged legs\b/.test(haystack) || /\badded segment\b/.test(haystack) || /\bremoved segment\b/.test(haystack)) {
    return true;
  }
  return "unknown" as const;
}

export function detectBreakInDuty(input: RerouteAnalysisInput) {
  return /\bbreak in duty\b|\bmid-trip break\b|\breleased then returned\b/i.test(buildRerouteAnalysisHaystack(input));
}

export function detectReleaseMoreThanFourHoursLate(input: RerouteAnalysisInput) {
  return /\bmore than 4 ?h(?:ours?)? late\b|\b4\+ hours late\b|\b4 hours late\b/i.test(
    buildRerouteAnalysisHaystack(input),
  );
}

export function detectOceanCrossing(input: RerouteAnalysisInput) {
  return /\bocean\b|\boverwater\b|\b25h\b|\b25 hour\b|\b25-hour\b/i.test(buildRerouteAnalysisHaystack(input));
}

export function detectLikelyContinuation(input: RerouteAnalysisInput) {
  const haystack = buildRerouteAnalysisHaystack(input);
  if (
    /\bsame destination\b/.test(haystack) &&
    (/\bdifferent flight number\b/.test(haystack) || /\bnew flight number\b/.test(haystack))
  ) {
    return true;
  }
  return "unknown" as const;
}

export function detectPossiblePayProtection(input: RerouteAnalysisInput) {
  const haystack = buildRerouteAnalysisHaystack(input);
  if (
    input.finalCreditDecreased === "yes" ||
    /\bpay protected\b/.test(haystack) ||
    /\boriginal pairing\b/.test(haystack) ||
    /\boriginal credit\b/.test(haystack) ||
    /\bless credit\b/.test(haystack) ||
    /\bworth less credit\b/.test(haystack)
  ) {
    return true;
  }
  if (input.finalCreditDecreased === "no") {
    return false;
  }
  return "unknown" as const;
}

export function collectMissingFacts(input: RerouteAnalysisInput) {
  const missing: string[] = [];

  if (!input.description.trim()) {
    missing.push("Description");
  }
  if (
    !input.originalRotationText?.trim() &&
    !input.uploadedEvidenceSummary.originalScreenshotName &&
    !(input.uploadedEvidenceSummary.screenshotNames?.length)
  ) {
    missing.push("Original rotation evidence or text");
  }
  if (
    !input.changedRotationText?.trim() &&
    !input.uploadedEvidenceSummary.changedScreenshotName &&
    !(input.uploadedEvidenceSummary.screenshotNames?.length)
  ) {
    missing.push("Changed rotation evidence or text");
  }
  if (input.rerouteTiming === "unknown") {
    missing.push("Whether the reroute happened before report, after report, or after first airborne");
  }
  if (input.finalCreditDecreased === "unknown") {
    missing.push("Whether final credit actually decreased");
  }

  return missing;
}

export function collectFactsUsed(input: RerouteAnalysisInput) {
  const facts: string[] = [];
  if (input.pilotStatus !== "unknown") {
    facts.push(`Pilot status: ${input.pilotStatus}`);
  }
  if (input.rerouteTiming !== "unknown") {
    facts.push(`Reroute timing: ${input.rerouteTiming.replace(/_/g, " ")}`);
  }
  if (input.finalCreditDecreased !== "unknown") {
    facts.push(`Final credit decreased: ${input.finalCreditDecreased}`);
  }
  if (input.touchedXDay !== "unknown") {
    facts.push(`Touched X-day / non-fly day: ${input.touchedXDay}`);
  }
  if (input.deadheadInvolved !== "unknown") {
    facts.push(`Deadhead involved: ${input.deadheadInvolved}`);
  }
  if (input.bidPeriodCrossover !== "unknown") {
    facts.push(`Crossed bid periods: ${input.bidPeriodCrossover}`);
  }
  if (input.originalRotationText?.trim()) {
    facts.push("Original rotation text provided");
  }
  if (input.changedRotationText?.trim()) {
    facts.push("Changed rotation text provided");
  }
  if (input.uploadedEvidenceSummary.originalScreenshotName) {
    facts.push(`Original screenshot attached: ${input.uploadedEvidenceSummary.originalScreenshotName}`);
  }
  if (input.uploadedEvidenceSummary.changedScreenshotName) {
    facts.push(`Changed screenshot attached: ${input.uploadedEvidenceSummary.changedScreenshotName}`);
  }
  if (input.uploadedEvidenceSummary.screenshotNames?.length) {
    facts.push(`Screenshots attached: ${input.uploadedEvidenceSummary.screenshotNames.join(", ")}`);
  }
  return facts;
}

export function detectDeadheadMention(input: RerouteAnalysisInput) {
  if (input.deadheadInvolved !== "unknown") {
    return input.deadheadInvolved === "yes";
  }
  return /\bdeadhead\b|\bdh\b/i.test(buildRerouteAnalysisHaystack(input));
}

export function detectXDayTouch(input: RerouteAnalysisInput) {
  if (input.touchedXDay !== "unknown") {
    return input.touchedXDay === "yes";
  }
  return /\bx-day\b|\bx day\b|\bpb\b|\bnon-fly day\b/i.test(buildRerouteAnalysisHaystack(input));
}

export function detectBidPeriodTouch(input: RerouteAnalysisInput) {
  if (input.bidPeriodCrossover !== "unknown") {
    return input.bidPeriodCrossover === "yes";
  }
  return /\bbid period\b|\bcrossover\b|\bnext month\b/i.test(buildRerouteAnalysisHaystack(input));
}
