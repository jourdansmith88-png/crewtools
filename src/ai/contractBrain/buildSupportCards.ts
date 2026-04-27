import type { BuildSupportCardsInput, BuildSupportCardsOutput } from "./types.ts";

function formatControllingSection(section: string) {
  if (/^pwa:/i.test(section)) {
    return `PWA ${section.replace(/^pwa:/i, "").trim()}`;
  }
  if (/^scheduler_manual:/i.test(section)) {
    return `Scheduler Manual ${section.replace(/^scheduler_manual:/i, "").trim()}`;
  }
  if (/^compensation_manual:/i.test(section)) {
    return `Compensation Manual ${section.replace(/^compensation_manual:/i, "").trim()}`;
  }
  return section;
}

export function buildSupportCards(input: BuildSupportCardsInput): BuildSupportCardsOutput {
  const visibleSupportCards = input.candidateSupport.slice(0, 4).map((candidate) => ({
    sourceName: candidate.sourceName,
    section: candidate.section,
    title: candidate.title,
    quoteSnippet: candidate.quoteSnippet,
    note: candidate.note,
  }));
  const exactQuotes = visibleSupportCards
    .map((card) => card.quoteSnippet?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);
  const sourceLimitationNotes: string[] = [];

  if (visibleSupportCards.length === 0) {
    sourceLimitationNotes.push("No visible support cards were available from the current indexed sources.");
  }
  if (exactQuotes.length === 0) {
    sourceLimitationNotes.push("No short exact quote was available from the currently selected support.");
  }

  return {
    visibleSupportCards,
    exactQuotes,
    whatControls: input.governingSections[0] ? formatControllingSection(input.governingSections[0]) : undefined,
    sourceLimitationNotes,
  };
}
