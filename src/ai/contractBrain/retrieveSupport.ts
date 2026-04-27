import {
  buildSectionAwarePackets,
  determineSourcePriorityForQuestion,
  expandContractMatches,
  filterChunksForGoverningRoute,
  hasUsableGoverningPackets,
  hasUsableRuleMatches,
  linkRelatedContractSections,
  resolveGoverningSections,
  searchContractDocuments,
} from "../retrieval/contracts/index.ts";
import { getActiveKnownInteractionRules } from "../retrieval/contracts/knownInteractionRules.ts";
import { retrieveContractCopilotSnippets } from "../workflows/contractCopilot/retrieval.ts";
import type {
  ContractBrainSupportCandidate,
  RetrieveContractSupportInput,
  RetrieveContractSupportOutput,
} from "./types.ts";

function sourceLabelForChunkSource(source: string) {
  if (source === "pwa") {
    return "PWA";
  }
  if (source === "compensation_manual") {
    return "Compensation Manual";
  }
  if (source === "scheduler_manual") {
    return "Scheduler Manual";
  }
  return source;
}

function summarizeQuoteSnippet(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 180) {
    return compact;
  }
  return `${compact.slice(0, 177).trimEnd()}...`;
}

function confidenceFromCounts(args: {
  primaryMatches: number;
  sectionPackets: number;
  seededRetrievedSupport: number;
}) {
  if (args.primaryMatches >= 2 || args.sectionPackets >= 2) {
    return "high" as const;
  }
  if (args.primaryMatches >= 1 || args.seededRetrievedSupport >= 1 || args.sectionPackets >= 1) {
    return "medium" as const;
  }
  return "low" as const;
}

function buildCandidateSupport(output: {
  primaryMatches: RetrieveContractSupportOutput["primaryMatches"];
  expandedMatches: RetrieveContractSupportOutput["expandedMatches"];
  linkedMatches: RetrieveContractSupportOutput["linkedMatches"];
  sectionPackets: RetrieveContractSupportOutput["sectionPackets"];
  seededRetrievedSupport: RetrieveContractSupportOutput["seededRetrievedSupport"];
}): ContractBrainSupportCandidate[] {
  const candidates: ContractBrainSupportCandidate[] = [];
  const seenIds = new Set<string>();

  const pushCandidate = (candidate: ContractBrainSupportCandidate) => {
    if (seenIds.has(candidate.id)) {
      return;
    }
    seenIds.add(candidate.id);
    candidates.push(candidate);
  };

  for (const match of output.primaryMatches) {
    pushCandidate({
      id: `match:${match.chunk.id}`,
      kind: "match",
      sourceName: sourceLabelForChunkSource(match.chunk.source),
      section: match.chunk.section,
      title: match.chunk.title,
      quoteSnippet: summarizeQuoteSnippet(match.chunk.text),
      confidence: match.score >= 7 ? "high" : match.score >= 4 ? "medium" : "low",
      matchReason: match.reasons[0] ?? "primary_match",
      matchedTerms: match.matchedTerms,
    });
  }

  for (const match of [...output.expandedMatches, ...output.linkedMatches]) {
    pushCandidate({
      id: `match:${match.chunk.id}`,
      kind: "match",
      sourceName: sourceLabelForChunkSource(match.chunk.source),
      section: match.chunk.section,
      title: match.chunk.title,
      quoteSnippet: summarizeQuoteSnippet(match.chunk.text),
      confidence: match.score >= 5 ? "medium" : "low",
      matchReason: match.reasons[0] ?? "linked_match",
      matchedTerms: match.matchedTerms,
    });
  }

  for (const packet of output.sectionPackets) {
    pushCandidate({
      id: `packet:${packet.id}`,
      kind: "packet",
      sourceName: packet.sourceLabel,
      section: packet.section,
      title: packet.title,
      quoteSnippet: summarizeQuoteSnippet(packet.content),
      note: packet.note,
      confidence: packet.relevanceScore >= 6 ? "high" : packet.relevanceScore >= 3 ? "medium" : "low",
      matchReason: packet.packetType,
      matchedTerms: packet.matchedTerms,
    });
  }

  for (const snippet of output.seededRetrievedSupport) {
    pushCandidate({
      id: `snippet:${snippet.id}`,
      kind: "snippet",
      sourceName:
        snippet.ruleType === "inference"
          ? "Inference"
          : snippet.sourceId === "pwa"
            ? "PWA"
            : "Scheduler Manual",
      section: snippet.section,
      title: snippet.title,
      quoteSnippet: snippet.quoteSnippet,
      note: snippet.note,
      confidence: snippet.score >= 8 ? "high" : snippet.score >= 4 ? "medium" : "low",
      matchReason: snippet.summary,
      matchedTerms: snippet.matchedTerms,
    });
  }

  return candidates;
}

export function retrieveContractSupport(input: RetrieveContractSupportInput): RetrieveContractSupportOutput {
  const searchableChunks = [
    ...input.contractIndex.pwaChunks,
    ...input.contractIndex.compensationChunks,
    ...input.contractIndex.schedulerChunks,
  ];
  const knownInteractionRules =
    input.matchedInteractionRules ??
    getActiveKnownInteractionRules({
      question: input.question,
      facts: input.knownFacts ?? {},
    });
  const governingSectionRoute = resolveGoverningSections({
    question: input.question,
    facts: input.knownFacts ?? {},
    scenario: (input.scenarioFamily as any) ?? null,
    matchedInteractionRules: knownInteractionRules,
  });
  const constrainedSearchChunks = filterChunksForGoverningRoute({
    chunks: searchableChunks,
    route: governingSectionRoute,
  });
  let searchMode: RetrieveContractSupportOutput["searchMode"] =
    constrainedSearchChunks.length > 0 ? "constrained" : "global";
  let routingFallbackOccurred = false;
  let primaryMatches = searchContractDocuments({
    question: input.question,
    chunks: constrainedSearchChunks.length > 0 ? constrainedSearchChunks : searchableChunks,
    rememberedFacts: input.knownFacts ?? {},
    deterministicScenario: input.deterministicScenario,
    maxMatches: input.maxMatches ?? 8,
  });
  const chunkMap = new Map(searchableChunks.map((chunk) => [chunk.id, chunk]));
  let expandedMatches = expandContractMatches({
    matches: primaryMatches,
    chunkMap,
    maxExpanded: 10,
  });
  let linkedMatches = linkRelatedContractSections({
    matches: [...primaryMatches, ...expandedMatches],
    allChunks: searchableChunks,
    maxLinked: 8,
  });
  const governingSectionCandidates = [
    ...governingSectionRoute.highConfidence,
    ...governingSectionRoute.fallbackCandidates,
  ];
  let sectionPackets = buildSectionAwarePackets({
    candidates: governingSectionCandidates,
    allChunks: searchableChunks,
    primaryMatches,
    expandedMatches,
    linkedMatches,
  });

  if (
    constrainedSearchChunks.length > 0 &&
    (!hasUsableRuleMatches(primaryMatches) || !hasUsableGoverningPackets(sectionPackets))
  ) {
    routingFallbackOccurred = true;
    searchMode = "constrained_then_global";
    primaryMatches = searchContractDocuments({
      question: input.question,
      chunks: searchableChunks,
      rememberedFacts: input.knownFacts ?? {},
      deterministicScenario: input.deterministicScenario,
      maxMatches: input.maxMatches ?? 8,
    });
    expandedMatches = expandContractMatches({
      matches: primaryMatches,
      chunkMap,
      maxExpanded: 10,
    });
    linkedMatches = linkRelatedContractSections({
      matches: [...primaryMatches, ...expandedMatches],
      allChunks: searchableChunks,
      maxLinked: 8,
    });
    sectionPackets = buildSectionAwarePackets({
      candidates: governingSectionCandidates,
      allChunks: searchableChunks,
      primaryMatches,
      expandedMatches,
      linkedMatches,
    });
  }

  const seededRetrievedSupport = retrieveContractCopilotSnippets({
    question: input.question,
    rememberedFacts: input.knownFacts ?? {},
    deterministicScenario: input.deterministicScenario,
    maxSnippets: 4,
  });
  const candidateSupport = buildCandidateSupport({
    primaryMatches,
    expandedMatches,
    linkedMatches,
    sectionPackets,
    seededRetrievedSupport,
  });
  const exactSectionAnchors = Array.from(
    new Set([
      ...governingSectionRoute.highConfidence.map((item) => `${item.source}:${item.section}`),
      ...candidateSupport.map((item) => `${item.sourceName}:${item.section}`),
    ]),
  );
  const sourceNames = Array.from(
    new Set([
      ...candidateSupport.map((item) => item.sourceName),
      ...determineSourcePriorityForQuestion(input.question).map((item) =>
        item === "pwa" ? "PWA" : item === "compensation_manual" ? "Compensation Manual" : "Scheduler Manual",
      ),
    ]),
  );
  const confidence = confidenceFromCounts({
    primaryMatches: primaryMatches.length,
    sectionPackets: sectionPackets.length,
    seededRetrievedSupport: seededRetrievedSupport.length,
  });

  return {
    searchableChunks,
    constrainedSearchChunks,
    primaryMatches,
    expandedMatches,
    linkedMatches,
    governingSectionCandidates,
    governingSectionRoute,
    sectionPackets,
    seededRetrievedSupport,
    candidateSupport,
    exactSectionAnchors,
    sourceNames,
    confidence,
    matchReason:
      primaryMatches.length > 0
        ? "search_matches_found"
        : sectionPackets.length > 0
          ? "governing_packets_found"
          : seededRetrievedSupport.length > 0
            ? "retrieved_support_seeded"
            : "no_strong_contract_match",
    searchMode,
    routingFallbackOccurred,
  };
}
