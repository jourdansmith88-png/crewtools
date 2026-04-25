import { rankGroundingSnippets } from "./sourceRanking.ts";
import type {
  AIGroundingSnippet,
  ExternalSearchUseWhen,
  GroundingContextPack,
  SectionAwareGroundingPacket,
  WorkflowGroundingPolicy,
} from "./types.ts";

function inferExternalReason(args: {
  question: string;
  internalSnippets: AIGroundingSnippet[];
  policy?: WorkflowGroundingPolicy;
}): ExternalSearchUseWhen | undefined {
  const externalPolicy = args.policy?.externalSearch;
  if (!externalPolicy?.enabled) {
    return undefined;
  }

  const question = args.question.toLowerCase();
  const internalCount = args.internalSnippets.length;

  if (externalPolicy.useWhen.includes("internal_support_weak") && internalCount < 2) {
    return "internal_support_weak";
  }
  if (
    externalPolicy.useWhen.includes("terminology_clarification") &&
    (question.includes("what does") || question.includes("mean") || question.includes("definition"))
  ) {
    return "terminology_clarification";
  }
  if (
    externalPolicy.useWhen.includes("interpretation_question") &&
    (question.includes("how is this usually") ||
      question.includes("in practice") ||
      question.includes("how should this be interpreted"))
  ) {
    return "interpretation_question";
  }
  if (
    externalPolicy.useWhen.includes("edge_case_context") &&
    (question.includes("edge case") ||
      question.includes("overlap") ||
      question.includes("conflict") ||
      question.includes("combination"))
  ) {
    return "edge_case_context";
  }

  return undefined;
}

export function buildGroundingContextPack(args: {
  question: string;
  internalSnippets: AIGroundingSnippet[];
  sectionPackets?: SectionAwareGroundingPacket[];
  externalSnippets?: AIGroundingSnippet[];
  policy?: WorkflowGroundingPolicy;
}): GroundingContextPack {
  const rankedInternal = rankGroundingSnippets(args.internalSnippets);
  const rankedExternal = rankGroundingSnippets(args.externalSnippets ?? []);
  const externalReason = inferExternalReason({
    question: args.question,
    internalSnippets: rankedInternal,
    policy: args.policy,
  });
  const externalAllowed = Boolean(args.policy?.externalSearch?.enabled && externalReason);
  const externalMax = args.policy?.externalSearch?.maxSnippets ?? 0;
  const selectedExternal = externalAllowed ? rankedExternal.slice(0, externalMax) : [];

  const pwa = rankedInternal.filter((item) => item.tier === "pwa").slice(0, 6);
  const compensationManual = rankedInternal.filter((item) => item.tier === "compensation_manual").slice(0, 4);
  const schedulerManual = rankedInternal.filter((item) => item.tier === "scheduler_manual").slice(0, 4);
  const crewtoolsLogic = rankedInternal.filter((item) => item.tier === "crewtools_logic").slice(0, 3);
  const webDiscussion = selectedExternal.filter((item) => item.tier === "web_discussion").slice(0, externalMax);
  const forumUnofficial = selectedExternal
    .filter((item) => item.tier === "forum_unofficial")
    .slice(0, externalMax);

  return {
    internal: {
      pwa,
      compensationManual,
      schedulerManual,
      crewtoolsLogic,
    },
    sectionPackets: {
      governingSections: (args.sectionPackets ?? []).filter((item) => item.packetType === "governing_section"),
      exceptionsNotes: (args.sectionPackets ?? []).filter((item) => item.packetType === "exception_note"),
      workedExamples: (args.sectionPackets ?? []).filter((item) => item.packetType === "worked_example"),
      interactionLinkedSections: (args.sectionPackets ?? []).filter(
        (item) => item.packetType === "interaction_linked"
      ),
      compensationSupport: (args.sectionPackets ?? []).filter(
        (item) => item.packetType === "compensation_support"
      ),
      schedulerSupport: (args.sectionPackets ?? []).filter((item) => item.packetType === "scheduler_support"),
    },
    external: {
      webDiscussion,
      forumUnofficial,
    },
    retrievalMeta: {
      externalUsed: webDiscussion.length + forumUnofficial.length > 0,
      externalAllowed,
      externalReason,
      totalSnippetCount:
        pwa.length +
        compensationManual.length +
        schedulerManual.length +
        crewtoolsLogic.length +
        webDiscussion.length +
        forumUnofficial.length,
      governingSectionsSelected: (args.sectionPackets ?? [])
        .filter((item) => item.packetType === "governing_section")
        .map((item) => `${item.sourceLabel}:${item.section}`),
      crossReferencesFollowed: Array.from(
        new Set((args.sectionPackets ?? []).flatMap((item) => item.crossRefsFollowed))
      ),
      sectionExpansionUsed: (args.sectionPackets ?? []).some((item) => item.usedSectionExpansion),
      sectionLed: (args.sectionPackets ?? []).some((item) => item.packetType === "governing_section"),
    },
  };
}
