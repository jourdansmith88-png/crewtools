import type { SelectGoverningSectionsInput, SelectGoverningSectionsOutput } from "./types.ts";

export function selectGoverningSections(input: SelectGoverningSectionsInput): SelectGoverningSectionsOutput {
  const route = input.candidateSupport?.governingSectionRoute as
    | {
        highConfidence?: Array<{ source: string; section: string }>;
        fallbackCandidates?: Array<{ source: string; section: string }>;
      }
    | undefined;
  const governingSections = Array.from(
    new Set(
      [
        ...(route?.highConfidence ?? []).map((item) => `${item.source}:${item.section}`),
        ...(route?.fallbackCandidates ?? []).slice(0, 2).map((item) => `${item.source}:${item.section}`),
      ].filter((item) => item.length > 0),
    ),
  );
  const controllingSource = governingSections[0]?.split(":")[0];
  const missingSourceWarnings =
    governingSections.length > 0
      ? []
      : [`I do not have a clean controlling source attached for this ${input.toolType} question yet.`];

  return {
    governingSections,
    controllingSource,
    missingSourceWarnings,
    governingSectionRoute: input.candidateSupport?.governingSectionRoute,
  };
}
