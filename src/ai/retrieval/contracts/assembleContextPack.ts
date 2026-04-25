import type {
  AIGroundingSnippet,
  GroundingContextPack,
  SectionAwareGroundingPacket,
  WorkflowGroundingPolicy,
} from "../types.ts";
import { buildGroundingContextPack } from "../retrievalPlanner.ts";
import type { ContractDocumentSource, ContractSearchMatch } from "./documentTypes.ts";

function sourceLabelFromDocumentSource(source: ContractDocumentSource) {
  if (source === "pwa") {
    return "PWA" as const;
  }
  if (source === "compensation_manual") {
    return "Compensation Manual" as const;
  }
  return "Scheduler Manual" as const;
}

function tierFromDocumentSource(source: ContractDocumentSource) {
  if (source === "pwa") {
    return "pwa" as const;
  }
  if (source === "compensation_manual") {
    return "compensation_manual" as const;
  }
  return "scheduler_manual" as const;
}

export function assembleContractGroundingContext(args: {
  question: string;
  primaryMatches: ContractSearchMatch[];
  expandedMatches: ContractSearchMatch[];
  linkedMatches: ContractSearchMatch[];
  sectionPackets?: SectionAwareGroundingPacket[];
  supplementalSnippets?: AIGroundingSnippet[];
  deterministicSnippets: AIGroundingSnippet[];
  policy?: WorkflowGroundingPolicy;
}) {
  const sectionPacketSnippets: AIGroundingSnippet[] = (args.sectionPackets ?? []).map((packet) => ({
    id: `packet:${packet.id}`,
    sourceLabel: packet.sourceLabel,
    tier: packet.tier,
    section: packet.section,
    snippet: packet.content,
    note: packet.note ?? packet.title,
    relevanceScore: packet.relevanceScore + 40,
    matchedTerms: packet.matchedTerms,
    metadata: {
      packetType: packet.packetType,
      usedSectionExpansion: packet.usedSectionExpansion,
      pages: packet.pages.join(","),
      crossRefsFollowed: packet.crossRefsFollowed.join(","),
    },
  }));

  const allInternalSnippets: AIGroundingSnippet[] = [
    ...sectionPacketSnippets,
    ...args.primaryMatches.map((match) => ({
      id: `primary:${match.chunk.id}`,
      sourceLabel: sourceLabelFromDocumentSource(match.chunk.source),
      tier: tierFromDocumentSource(match.chunk.source),
      section: match.chunk.section,
      snippet: match.chunk.text,
      note: match.chunk.title ?? match.reasons.join(", "),
      relevanceScore: match.score,
      matchedTerms: match.matchedTerms,
      metadata: {
        pass: "primary",
        page: match.chunk.page,
      },
    })),
    ...args.expandedMatches.map((match) => ({
      id: `expanded:${match.chunk.id}`,
      sourceLabel: sourceLabelFromDocumentSource(match.chunk.source),
      tier: tierFromDocumentSource(match.chunk.source),
      section: match.chunk.section,
      snippet: match.chunk.text,
      note: match.chunk.title ?? match.reasons.join(", "),
      relevanceScore: match.score,
      matchedTerms: match.matchedTerms,
      metadata: {
        pass: "expanded",
        page: match.chunk.page,
      },
    })),
    ...args.linkedMatches.map((match) => ({
      id: `linked:${match.chunk.id}`,
      sourceLabel: sourceLabelFromDocumentSource(match.chunk.source),
      tier: tierFromDocumentSource(match.chunk.source),
      section: match.chunk.section,
      snippet: match.chunk.text,
      note: match.chunk.title ?? match.reasons.join(", "),
      relevanceScore: match.score,
      matchedTerms: match.matchedTerms,
      metadata: {
        pass: "linked",
        page: match.chunk.page,
      },
    })),
    ...(args.supplementalSnippets ?? []),
    ...args.deterministicSnippets,
  ];

  const deduped = new Map<string, AIGroundingSnippet>();
  for (const snippet of allInternalSnippets) {
    const key = `${snippet.tier}:${snippet.section}:${snippet.snippet}`;
    if (!deduped.has(key)) {
      deduped.set(key, snippet);
    }
  }

  return buildGroundingContextPack({
    question: args.question,
    internalSnippets: Array.from(deduped.values()),
    sectionPackets: args.sectionPackets ?? [],
    externalSnippets: [],
    policy: args.policy,
  });
}
