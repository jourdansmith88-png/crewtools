import type { ParseMiCrewScreenshotsOutput, UploadedEvidenceSummary } from "./types.ts";

export function parseMiCrewScreenshots(uploadedEvidenceSummary: UploadedEvidenceSummary): ParseMiCrewScreenshotsOutput {
  const originalScreenshotNames = uploadedEvidenceSummary.originalScreenshotNames ?? [];
  const changedScreenshotNames = uploadedEvidenceSummary.changedScreenshotNames ?? [];
  const anyScreenshots =
    originalScreenshotNames.length > 0 ||
    changedScreenshotNames.length > 0 ||
    (uploadedEvidenceSummary.screenshotNames?.length ?? 0) > 0;

  return {
    screenshotParsingActive: false,
    uploadedEvidenceSummary,
    missingFacts: anyScreenshots
      ? ["Screenshot parsing is not active yet. Paste the segment details or describe the changed segments."]
      : [],
    rotations: anyScreenshots
      ? [
          {
            sourceType: "original",
            layovers: [],
            legs: [],
          },
          {
            sourceType: "rerouted",
            layovers: [],
            legs: [],
          },
        ].filter((rotation) =>
          rotation.sourceType === "original" ? originalScreenshotNames.length > 0 : changedScreenshotNames.length > 0,
        )
      : [],
    parseConfidence: "low",
    missingParseItems: anyScreenshots ? ["OCR / screenshot parsing not active yet"] : [],
  };
}
