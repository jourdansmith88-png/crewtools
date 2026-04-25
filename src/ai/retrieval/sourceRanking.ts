import type { AIGroundingSnippet, AIGroundingTier } from "./types.ts";

const tierWeight: Record<AIGroundingTier, number> = {
  pwa: 500,
  compensation_manual: 450,
  scheduler_manual: 400,
  crewtools_logic: 300,
  web_discussion: 200,
  forum_unofficial: 100,
};

export function rankGroundingSnippets<T extends AIGroundingSnippet>(snippets: T[]) {
  return [...snippets].sort((left, right) => {
    const leftScore = tierWeight[left.tier] + left.relevanceScore;
    const rightScore = tierWeight[right.tier] + right.relevanceScore;
    return rightScore - leftScore;
  });
}
