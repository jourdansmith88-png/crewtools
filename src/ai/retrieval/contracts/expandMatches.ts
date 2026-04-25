import type { ContractDocumentChunk, ContractSearchMatch } from "./documentTypes.ts";

export function expandContractMatches(args: {
  matches: ContractSearchMatch[];
  chunkMap: Map<string, ContractDocumentChunk>;
  maxExpanded?: number;
}) {
  const expanded = new Map<string, ContractSearchMatch>();

  for (const match of args.matches) {
    expanded.set(match.chunk.id, match);

    for (const nearbyId of match.chunk.nearbyIds.slice(0, 2)) {
      const nearby = args.chunkMap.get(nearbyId);
      if (!nearby || expanded.has(nearby.id)) {
        continue;
      }
      expanded.set(nearby.id, {
        chunk: nearby,
        score: Math.max(1, match.score - 3),
        reasons: ["nearby_context"],
        matchedTerms: match.matchedTerms,
      });
    }
  }

  return Array.from(expanded.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, args.maxExpanded ?? 12);
}
