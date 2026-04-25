import type { SectionAwareGroundingPacket } from "../types.ts";
import type { ContractDocumentChunk, ContractDocumentSource, ContractSearchMatch } from "./documentTypes.ts";
import {
  governingCandidateMatchesChunk,
  type GoverningSectionCandidate,
} from "./governingSections.ts";

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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreAnchorForCandidate(
  candidate: GoverningSectionCandidate,
  chunk: ContractDocumentChunk,
  match: ContractSearchMatch | null
) {
  const searchable = normalize(`${chunk.section} ${chunk.title ?? ""} ${chunk.text}`);
  let score = candidate.priority + (match?.score ?? 0);

  if (searchable.includes(normalize(candidate.section))) {
    score += 25;
  }

  for (const term of candidate.searchTerms) {
    const normalizedTerm = normalize(term);
    if (normalizedTerm && searchable.includes(normalizedTerm)) {
      score += normalizedTerm.length > 18 ? 18 : 10;
    }
  }

  if (chunk.isDefinition && !/definition|glossary/i.test(candidate.section)) {
    score -= 16;
  }

  if (chunk.isException && candidate.id.includes("guarantee")) {
    score -= 8;
  }

  return score;
}

function scoreCandidateChunk(candidate: GoverningSectionCandidate, match: ContractSearchMatch | null) {
  const base = candidate.priority;
  if (!match) {
    return base;
  }
  return base + match.score;
}

function chunkHeaderMatchesCandidate(candidate: GoverningSectionCandidate, chunk: ContractDocumentChunk) {
  if (candidate.source !== chunk.source) {
    return false;
  }

  const header = normalize(`${chunk.section} ${chunk.title ?? ""}`);
  return header.includes(normalize(candidate.section));
}

function chunkLooksLikeStrictAnchor(candidate: GoverningSectionCandidate, chunk: ContractDocumentChunk) {
  if (candidate.source !== chunk.source) {
    return false;
  }

  if (chunkHeaderMatchesCandidate(candidate, chunk)) {
    return true;
  }

  const textStart = normalize(chunk.text.slice(0, 420));
  const title = normalize(chunk.title ?? "");
  const candidateTitle = normalize(candidate.title ?? "");
  const packetLooksExample = /example/.test(normalize(`${candidate.section} ${candidate.title ?? ""} ${candidate.reason}`));

  if (candidateTitle && title && title.includes(candidateTitle)) {
    return true;
  }

  if (packetLooksExample && textStart.includes("example")) {
    return candidate.searchTerms.some((term) => {
      const normalizedTerm = normalize(term);
      return normalizedTerm.length > 0 && textStart.includes(normalizedTerm);
    });
  }

  return candidate.searchTerms.some((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm.length > 0 && textStart.includes(normalizedTerm);
  });
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

function buildPacketFromAnchor(args: {
  candidate: GoverningSectionCandidate;
  anchor: ContractDocumentChunk;
  allChunks: ContractDocumentChunk[];
  allMatches: ContractSearchMatch[];
  packetType: SectionAwareGroundingPacket["packetType"];
}) {
  const byId = new Map(args.allChunks.map((chunk) => [chunk.id, chunk]));
  const packetChunks: ContractDocumentChunk[] = [args.anchor];
  const crossRefsFollowed = new Set<string>();

  for (const nearbyId of args.anchor.nearbyIds) {
    const nearby = byId.get(nearbyId);
    if (!nearby) {
      continue;
    }
    if (nearby.source !== args.anchor.source) {
      continue;
    }
    if (nearby.section !== args.anchor.section) {
      continue;
    }
    packetChunks.push(nearby);
  }

  const sameSectionMatches = args.allMatches
    .filter(
      (match) =>
        match.chunk.source === args.anchor.source &&
        match.chunk.section === args.anchor.section &&
        Math.abs(match.chunk.page - args.anchor.page) <= 1
    )
    .map((match) => match.chunk);

  for (const chunk of sameSectionMatches) {
    packetChunks.push(chunk);
  }

  const dedupedPacketChunks = uniqueById(packetChunks).sort((left, right) => {
    if (left.page !== right.page) {
      return left.page - right.page;
    }
    return left.id.localeCompare(right.id);
  });

  const crossRefTargets = Array.from(
    new Set([
      ...args.candidate.crossRefTargets,
      ...args.anchor.crossRefs,
      ...dedupedPacketChunks.flatMap((chunk) => chunk.crossRefs),
    ])
  );

  for (const target of crossRefTargets) {
    const normalizedTarget = normalize(target);
    const related = args.allChunks.find(
      (chunk) =>
        chunk.source === args.candidate.source &&
        (normalize(chunk.section).includes(normalizedTarget) ||
          normalize(chunk.text).includes(normalizedTarget))
    );
    if (related && !dedupedPacketChunks.some((chunk) => chunk.id === related.id)) {
      dedupedPacketChunks.push(related);
      crossRefsFollowed.add(target);
    }
  }

  const content = dedupedPacketChunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const pages = Array.from(new Set(dedupedPacketChunks.map((chunk) => chunk.page))).sort((a, b) => a - b);
  const matchedTerms = Array.from(
    new Set(
      args.allMatches
        .filter((match) => dedupedPacketChunks.some((chunk) => chunk.id === match.chunk.id))
        .flatMap((match) => match.matchedTerms)
    )
  );

  return {
    id: `${args.packetType}:${args.candidate.id}:${args.anchor.id}`,
    sourceLabel: sourceLabelFromDocumentSource(args.anchor.source),
    tier: tierFromDocumentSource(args.anchor.source),
    section: args.candidate.section,
    title: args.candidate.title ?? args.anchor.title ?? args.anchor.section,
    packetType: args.packetType,
    content,
    pages,
    matchedTerms,
    crossRefsFollowed: Array.from(crossRefsFollowed),
    usedSectionExpansion: dedupedPacketChunks.length > 1,
    note: args.candidate.reason,
    relevanceScore: scoreCandidateChunk(
      args.candidate,
      args.allMatches.find((match) => match.chunk.id === args.anchor.id) ?? null
    ),
  } satisfies SectionAwareGroundingPacket;
}

function choosePacketType(candidate: GoverningSectionCandidate) {
  if (candidate.source === "compensation_manual") {
    return "compensation_support" as const;
  }
  if (candidate.source === "scheduler_manual") {
    return "scheduler_support" as const;
  }
  if (/example/i.test(candidate.section) || /example/i.test(candidate.title ?? "") || /example/i.test(candidate.reason)) {
    return "worked_example" as const;
  }
  if (/exception|note|conflict/i.test(candidate.title ?? "") || /exception|note/i.test(candidate.reason)) {
    return "exception_note" as const;
  }
  return "governing_section" as const;
}

export function buildSectionAwarePackets(args: {
  candidates: GoverningSectionCandidate[];
  allChunks: ContractDocumentChunk[];
  primaryMatches: ContractSearchMatch[];
  expandedMatches: ContractSearchMatch[];
  linkedMatches: ContractSearchMatch[];
}) {
  const allMatches = [...args.primaryMatches, ...args.expandedMatches, ...args.linkedMatches];
  const packets: SectionAwareGroundingPacket[] = [];

  for (const candidate of args.candidates) {
    const packetType = choosePacketType(candidate);
    const strictAnchorPool = uniqueById([
      ...allMatches.filter((match) => chunkLooksLikeStrictAnchor(candidate, match.chunk)).map((match) => match.chunk),
      ...args.allChunks.filter((chunk) => chunkLooksLikeStrictAnchor(candidate, chunk)),
    ]);
    const broadAnchorPool = uniqueById([
      ...allMatches
        .filter((match) => governingCandidateMatchesChunk(candidate, match.chunk))
        .map((match) => match.chunk),
      ...args.allChunks.filter((chunk) => governingCandidateMatchesChunk(candidate, chunk)),
    ]);

    const anchorPool = strictAnchorPool.length > 0 ? strictAnchorPool : broadAnchorPool;
    const candidateAnchors = uniqueById(anchorPool.sort((left, right) => {
        const leftMatch = allMatches.find((match) => match.chunk.id === left.id) ?? null;
        const rightMatch = allMatches.find((match) => match.chunk.id === right.id) ?? null;
        return scoreAnchorForCandidate(candidate, right, rightMatch) - scoreAnchorForCandidate(candidate, left, leftMatch);
      })).slice(0, 1);

    for (const anchor of candidateAnchors) {
      packets.push(
        buildPacketFromAnchor({
          candidate,
          anchor,
          allChunks: args.allChunks,
          allMatches,
          packetType,
        })
      );
    }
  }

  return uniqueById(packets).sort((left, right) => right.relevanceScore - left.relevanceScore);
}
