import type { RerouteAnalysisInput } from "./types.ts";

export function buildRerouteAnalyzerSummary(input: RerouteAnalysisInput) {
  return [
    `Reroute details: ${input.description}`,
    input.originalRotationText ? `Original rotation details: ${input.originalRotationText}` : null,
    input.changedRotationText ? `Changed rotation details: ${input.changedRotationText}` : null,
    `Pilot status: ${input.pilotStatus}`,
    `Reroute timing: ${input.parsedFactOverrides?.timing ?? input.rerouteTiming}`,
    `Touched X-day or non-fly day: ${input.touchedXDay}`,
    `Deadhead involved: ${input.deadheadInvolved}`,
    `Crossed bid periods: ${input.bidPeriodCrossover}`,
    input.uploadedEvidenceSummary.screenshotNames?.length
      ? `Screenshots attached: ${input.uploadedEvidenceSummary.screenshotNames.join(", ")}`
      : null,
    input.uploadedEvidenceSummary.originalScreenshotName
      ? `Original screenshot attached: ${input.uploadedEvidenceSummary.originalScreenshotName}`
      : null,
    input.uploadedEvidenceSummary.changedScreenshotName
      ? `Changed screenshot attached: ${input.uploadedEvidenceSummary.changedScreenshotName}`
      : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");
}
