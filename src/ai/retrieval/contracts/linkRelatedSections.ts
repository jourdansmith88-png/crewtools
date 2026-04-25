import type { ContractDocumentChunk, ContractSearchMatch } from "./documentTypes.ts";

export function linkRelatedContractSections(args: {
  matches: ContractSearchMatch[];
  allChunks: ContractDocumentChunk[];
  maxLinked?: number;
}) {
  const bySection = new Map<string, ContractDocumentChunk[]>();
  for (const chunk of args.allChunks) {
    const key = chunk.section.trim().toLowerCase();
    if (!bySection.has(key)) {
      bySection.set(key, []);
    }
    bySection.get(key)?.push(chunk);
  }

  const linked = new Map<string, ContractSearchMatch>();
  const knownIds = new Set(args.matches.map((match) => match.chunk.id));

  for (const match of args.matches) {
    for (const crossRef of match.chunk.crossRefs) {
      const related = bySection.get(crossRef.trim().toLowerCase()) ?? [];
      for (const chunk of related.slice(0, 2)) {
        if (knownIds.has(chunk.id) || linked.has(chunk.id)) {
          continue;
        }
        linked.set(chunk.id, {
          chunk,
          score: Math.max(1, match.score - 4),
          reasons: ["cross_reference"],
          matchedTerms: match.matchedTerms,
        });
      }
    }

    if (!match.chunk.isDefinition) {
      const definitions = args.allChunks.filter(
        (chunk) => chunk.isDefinition && match.matchedTerms.some((term) => chunk.text.toLowerCase().includes(term))
      );
      for (const definitionChunk of definitions.slice(0, 2)) {
        if (knownIds.has(definitionChunk.id) || linked.has(definitionChunk.id)) {
          continue;
        }
        linked.set(definitionChunk.id, {
          chunk: definitionChunk,
          score: Math.max(1, match.score - 5),
          reasons: ["linked_definition"],
          matchedTerms: match.matchedTerms,
        });
      }
    }
  }

  return Array.from(linked.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, args.maxLinked ?? 8);
}
