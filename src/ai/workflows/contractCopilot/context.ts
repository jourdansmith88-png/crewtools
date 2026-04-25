import { contractScenarioCatalog } from "../../../data/contractCopilot/contractScenarioCatalog.ts";
import type { ContractCopilotAIInput } from "./schema.ts";

export type ContractCopilotAIContext = {
  scenarioSummary: string;
  rememberedFactsSummary: string;
  multiSourcePacketSummary: string;
  sourcePrioritySummary: string;
  structuredDataSummary: string;
  governingSectionsSummary: string;
  exceptionNoteSummary: string;
  workedExampleSummary: string;
  interactionLinkedSummary: string;
  compensationSupportSummary: string;
  schedulerSupportSummary: string;
  internalGroundingSummary: string;
  externalGroundingSummary: string;
  knownInteractionSummary: string;
  groundingMetaSummary: string;
};

export function buildContractCopilotAIContext(
  input: ContractCopilotAIInput
): ContractCopilotAIContext {
  const groundingPack = input.groundingPack;
  const lowerQuestion = input.question.toLowerCase();
  const structuredDataSummary =
    /\bapd\b/.test(lowerQuestion) || lowerQuestion.includes("authorized personal drop")
      ? "Known threshold: APD reserve threshold is 25% of the number of reserves required at the time of processing."
      : lowerQuestion.includes("pay rate") || lowerQuestion.includes("hourly pay") || lowerQuestion.includes("what do i make")
        ? "Structured data may include indexed compensation pay rows when available."
        : "No structured calculator rows were explicitly attached.";
  const multiSourcePacketSummary = groundingPack
    ? [
        "controllingSource:",
        groundingPack.sectionPackets.governingSections.length > 0
          ? groundingPack.sectionPackets.governingSections
              .map((packet) => `- ${packet.sourceLabel}: ${packet.section}`)
              .join("\n")
          : "- No governing PWA packet attached.",
        "",
        "supportingSources:",
        groundingPack.sectionPackets.compensationSupport.length > 0 ||
        groundingPack.internal.compensationManual.length > 0
          ? [
              ...groundingPack.sectionPackets.compensationSupport.map(
                (packet) => `- Compensation Manual: ${packet.section}`
              ),
              ...groundingPack.internal.compensationManual.map(
                (item) => `- Compensation Manual snippet: ${item.section}`
              ),
            ]
              .slice(0, 4)
              .join("\n")
          : "- No Compensation Manual support attached.",
        groundingPack.sectionPackets.schedulerSupport.length > 0 ||
        groundingPack.internal.schedulerManual.length > 0
          ? [
              ...groundingPack.sectionPackets.schedulerSupport.map(
                (packet) => `- Scheduler Manual: ${packet.section}`
              ),
              ...groundingPack.internal.schedulerManual.map(
                (item) => `- Scheduler Manual snippet: ${item.section}`
              ),
            ]
              .slice(0, 4)
              .join("\n")
          : "- No Scheduler Manual support attached.",
        "",
        "structuredData:",
        `- ${structuredDataSummary}`,
      ].join("\n")
    : [
        "controllingSource:",
        "- No governing PWA packet attached.",
        "",
        "supportingSources:",
        "- No Compensation Manual support attached.",
        "- No Scheduler Manual support attached.",
        "",
        "structuredData:",
        `- ${structuredDataSummary}`,
      ].join("\n");
  const sourcePrioritySummary =
    "PWA governs contract interpretation. Compensation Manual explains pay and credit mechanics. Scheduler Manual explains processing and operational handling. Supporting manuals do not override the PWA unless the PWA itself points to them.";
  const internalGroundingSummary = groundingPack
    ? [
        ...groundingPack.internal.pwa.map(
          (item, index) =>
            `[PWA ${index + 1}] ${item.section} | ${item.snippet} | Note: ${item.note ?? "none"}`
        ),
        ...groundingPack.internal.compensationManual.map(
          (item, index) =>
            `[Compensation ${index + 1}] ${item.section} | ${item.snippet} | Note: ${item.note ?? "none"}`
        ),
        ...groundingPack.internal.schedulerManual.map(
          (item, index) =>
            `[Scheduler ${index + 1}] ${item.section} | ${item.snippet} | Note: ${item.note ?? "none"}`
        ),
        ...groundingPack.internal.crewtoolsLogic.map(
          (item, index) =>
            `[Logic ${index + 1}] ${item.section} | ${item.snippet} | Note: ${item.note ?? "none"}`
        ),
      ].join("\n")
    : input.retrievedSupport && input.retrievedSupport.length > 0
      ? input.retrievedSupport
          .map(
            (item, index) =>
              `[${index + 1}] ${item.sourceLabel} | ${item.section} | ${item.quoteSnippet ?? "No snippet"} | Note: ${item.note ?? item.title}`
          )
          .join("\n")
      : "No internal contract snippets were attached.";

  const externalGroundingSummary = groundingPack
    ? [
        ...groundingPack.external.webDiscussion.map(
          (item, index) =>
            `[Web ${index + 1}] ${item.section} | ${item.snippet} | Note: ${item.note ?? "none"}`
        ),
        ...groundingPack.external.forumUnofficial.map(
          (item, index) =>
            `[Forum ${index + 1}] ${item.section} | ${item.snippet} | Note: ${item.note ?? "none"}`
        ),
      ].join("\n") || "No external supplemental snippets were attached."
    : "No external supplemental snippets were attached.";

  const governingSectionsSummary = groundingPack
    ? groundingPack.sectionPackets.governingSections
        .map(
          (packet, index) =>
            `[Governing ${index + 1}] ${packet.sourceLabel} | ${packet.section} | Pages: ${packet.pages.join(", ")} | Expansion: ${packet.usedSectionExpansion ? "yes" : "no"} | Cross refs followed: ${packet.crossRefsFollowed.join("; ") || "none"} | ${packet.content}`
        )
        .join("\n") || "No governing section packet was assembled."
    : "No governing section packet was assembled.";

  const exceptionNoteSummary = groundingPack
    ? groundingPack.sectionPackets.exceptionsNotes
        .map(
          (packet, index) =>
            `[Exception ${index + 1}] ${packet.sourceLabel} | ${packet.section} | ${packet.content}`
        )
        .join("\n") || "No related exceptions or notes were attached."
    : "No related exceptions or notes were attached.";

  const workedExampleSummary = groundingPack
    ? groundingPack.sectionPackets.workedExamples
        .map(
          (packet, index) =>
            `[Worked example ${index + 1}] ${packet.sourceLabel} | ${packet.section} | ${packet.content}`
        )
        .join("\n") || "No worked example packet was attached."
    : "No worked example packet was attached.";

  const interactionLinkedSummary = groundingPack
    ? groundingPack.sectionPackets.interactionLinkedSections
        .map(
          (packet, index) =>
            `[Interaction linked ${index + 1}] ${packet.sourceLabel} | ${packet.section} | ${packet.content}`
        )
        .join("\n") || "No interaction-linked section packet was attached."
    : "No interaction-linked section packet was attached.";

  const compensationSupportSummary = groundingPack
    ? groundingPack.sectionPackets.compensationSupport
        .map(
          (packet, index) =>
            `[Compensation support ${index + 1}] ${packet.section} | ${packet.content}`
        )
        .join("\n") || "No compensation support packet was attached."
    : "No compensation support packet was attached.";

  const schedulerSupportSummary = groundingPack
    ? groundingPack.sectionPackets.schedulerSupport
        .map(
          (packet, index) =>
            `[Scheduler support ${index + 1}] ${packet.section} | ${packet.content}`
        )
        .join("\n") || "No scheduler support packet was attached."
    : "No scheduler support packet was attached.";

  return {
    scenarioSummary: contractScenarioCatalog
      .map((scenario) => `${scenario.label}: ${scenario.description}`)
      .join("\n"),
    rememberedFactsSummary: input.rememberedFacts
      ? JSON.stringify(input.rememberedFacts)
      : "No remembered facts yet.",
    multiSourcePacketSummary,
    sourcePrioritySummary,
    structuredDataSummary,
    governingSectionsSummary,
    exceptionNoteSummary,
    workedExampleSummary,
    interactionLinkedSummary,
    compensationSupportSummary,
    schedulerSupportSummary,
    internalGroundingSummary,
    externalGroundingSummary,
    knownInteractionSummary:
      input.knownInteractionRules && input.knownInteractionRules.length > 0
        ? input.knownInteractionRules
            .map(
              (rule, index) =>
                `[Interaction Rule ${index + 1}] ${rule.title} | Governing sources: ${rule.governingSources
                  .map((source) => `${source.source}:${source.section}`)
                  .join("; ")} | Applies when: ${rule.appliesWhen.questionSignals.join(", ")} | Reasoning steps: ${rule.reasoningSteps.join(" / ")} | Prevent drift from: ${rule.preventsDriftFrom.join(", ")} | Summary: ${rule.ruleSummary} | Matched signals: ${rule.matchedSignals.join(", ") || "none"}`
            )
            .join("\n")
        : "No interaction rule matched this question.",
    groundingMetaSummary: groundingPack
      ? [
          `External allowed: ${groundingPack.retrievalMeta.externalAllowed ? "yes" : "no"}`,
          `External used: ${groundingPack.retrievalMeta.externalUsed ? "yes" : "no"}`,
          `External reason: ${groundingPack.retrievalMeta.externalReason ?? "none"}`,
          `Total snippet count: ${groundingPack.retrievalMeta.totalSnippetCount}`,
          `Deterministic scenario: ${input.deterministicScenario ?? "unknown"}`,
          `Deterministic short answer: ${input.deterministicShortAnswer ?? "none"}`,
        ].join("\n")
      : [
          "External allowed: no",
          "External used: no",
          "External reason: none",
          `Total snippet count: ${input.retrievedSupport?.length ?? 0}`,
          `Deterministic scenario: ${input.deterministicScenario ?? "unknown"}`,
          `Deterministic short answer: ${input.deterministicShortAnswer ?? "none"}`,
        ].join("\n"),
  };
}
