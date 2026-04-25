import type { CopilotScenarioFamily, ParsedScenarioFacts } from "../../../types/contractCopilot.ts";
import type { SectionAwareGroundingPacket } from "../types.ts";
import type { MatchedInteractionRule } from "./interactionRules.ts";
import type {
  ContractDocumentChunk,
  ContractDocumentSource,
  ContractSearchMatch,
} from "./documentTypes.ts";

export type GoverningSectionCandidate = {
  id: string;
  source: ContractDocumentSource;
  section: string;
  title?: string;
  reason: string;
  priority: number;
  searchTerms: string[];
  crossRefTargets: string[];
};

export type GoverningSectionRoute = {
  highConfidence: GoverningSectionCandidate[];
  fallbackCandidates: GoverningSectionCandidate[];
  routeLabels: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pushCandidate(
  candidates: GoverningSectionCandidate[],
  candidate: GoverningSectionCandidate
) {
  const existing = candidates.find(
    (item) => item.source === candidate.source && item.section === candidate.section
  );
  if (!existing) {
    candidates.push(candidate);
    return;
  }
  existing.priority = Math.max(existing.priority, candidate.priority);
  existing.searchTerms = Array.from(new Set([...existing.searchTerms, ...candidate.searchTerms]));
  existing.crossRefTargets = Array.from(
    new Set([...existing.crossRefTargets, ...candidate.crossRefTargets])
  );
  if (!existing.title && candidate.title) {
    existing.title = candidate.title;
  }
}

function hasInteractionSignals(questionLower: string, facts: ParsedScenarioFacts) {
  return (
    questionLower.includes("sick") ||
    questionLower.includes("pickup") ||
    questionLower.includes("greenslip") ||
    questionLower.includes("green slip") ||
    /\bgs\b/.test(questionLower) ||
    questionLower.includes("overlap") ||
    questionLower.includes("called in sick") ||
    questionLower.includes("long call") ||
    questionLower.includes("reroute") ||
    questionLower.includes("reassign") ||
    /\bapd\b/.test(questionLower) ||
    questionLower.includes("authorized personal drop") ||
    facts.sickUsed === true ||
    Boolean(facts.pickupType) ||
    Boolean(facts.premiumType) ||
    facts.sameDayInteraction === true ||
    Boolean(facts.leaveType) ||
    facts.rerouteOccurred === true ||
    facts.reassignmentOccurred === true
  );
}

function isPureAlvGuaranteeIntent(questionLower: string, facts: ParsedScenarioFacts) {
  const mentionsGuarantee =
    questionLower.includes("minimum daily guarantee") ||
    questionLower.includes("daily guarantee") ||
    questionLower.includes("minimum guarantee") ||
    questionLower.includes("reserve guarantee") ||
    questionLower.includes("line guarantee") ||
    /\badg\b/.test(questionLower);
  const mentionsAlv =
    /\balv\b/.test(questionLower) || questionLower.includes("average line value");

  return (mentionsGuarantee || mentionsAlv) && !hasInteractionSignals(questionLower, facts);
}

function buildHeuristicCandidates(args: {
  questionLower: string;
  facts: ParsedScenarioFacts;
  scenario: string | undefined;
}) {
  const candidates: GoverningSectionCandidate[] = [];
  const { questionLower } = args;
  const mentionsApd =
    /\bapd\b/.test(questionLower) || questionLower.includes("authorized personal drop");
  const mentionsGuarantee =
    questionLower.includes("minimum daily guarantee") ||
    questionLower.includes("daily guarantee") ||
    questionLower.includes("minimum guarantee") ||
    questionLower.includes("reserve guarantee") ||
    questionLower.includes("line guarantee") ||
    /\badg\b/.test(questionLower);
  const mentionsReroute =
    questionLower.includes("reroute") ||
    questionLower.includes("rerouted") ||
    questionLower.includes("reassign");
  const mentionsXDay =
    questionLower.includes("x-day") ||
    questionLower.includes("x day") ||
    questionLower.includes("interrupted x-day") ||
    questionLower.includes("interrupted x-days") ||
    questionLower.includes("lost x-day") ||
    questionLower.includes("x-day credit");
  const mentionsShortCallDutyScenario =
    questionLower.includes("short call") &&
    (
      questionLower.includes("same day trip") ||
      questionLower.includes("subsequent same day trip") ||
      questionLower.includes("report time") ||
      questionLower.includes("reports at") ||
      questionLower.includes("duty") ||
      questionLower.includes("flight time") ||
      questionLower.includes("legality") ||
      questionLower.includes("both remain on schedule") ||
      questionLower.includes("assigned short call and trip")
    );
  const mentionsSick = questionLower.includes("sick") || questionLower.includes("called in sick");
  const mentionsGreenslip =
    questionLower.includes("green slip") ||
    questionLower.includes("greenslip") ||
    /\bgs\b/.test(questionLower);
  const mentionsLongCall = questionLower.includes("long call");
  const mentionsAlv =
    /\balv\b/.test(questionLower) || questionLower.includes("average line value");
  const pureAlvGuaranteeIntent = isPureAlvGuaranteeIntent(questionLower, args.facts);

  if (mentionsApd) {
    pushCandidate(candidates, {
      id: "heuristic-apd-pwa",
      source: "pwa",
      section: "Section 23 I.10",
      title: "APD request on reserve",
      reason: "APD question",
      priority: 120,
      searchTerms: [
        "authorized personal drop",
        "apd",
        "25% of the number of reserves required",
        "next-day apd requests",
        "apd request will be granted",
        "reserve availability",
      ],
      crossRefTargets: ["Section 23 I"],
    });
  }

  if (mentionsGuarantee) {
    pushCandidate(candidates, {
      id: "heuristic-guarantee-lineholder",
      source: "pwa",
      section: "Section 4 B",
      title: "Regular line guarantee",
      reason: "Minimum guarantee question",
      priority: pureAlvGuaranteeIntent ? 125 : 105,
      searchTerms: ["minimum daily guarantee", "line guarantee", "regular line guarantee", "adg"],
      crossRefTargets: ["Section 4 B"],
    });
    pushCandidate(candidates, {
      id: "heuristic-guarantee-reserve",
      source: "pwa",
      section: "Section 4 C",
      title: "Reserve guarantee",
      reason: "Minimum guarantee question",
      priority: pureAlvGuaranteeIntent ? 128 : 110,
      searchTerms: ["reserve guarantee", "reserve line guarantee", "minimum daily guarantee", "alv minus two hours"],
      crossRefTargets: ["Section 4 C"],
    });
    pushCandidate(candidates, {
      id: "heuristic-guarantee-scheduler",
      source: "scheduler_manual",
      section: "Guarantees",
      title: "Guarantee explanation",
      reason: "Guarantee implementation support",
      priority: 70,
      searchTerms: ["minimum daily guarantee", "line guarantee", "reserve guarantee"],
      crossRefTargets: [],
    });
  }

  if (mentionsAlv) {
    pushCandidate(candidates, {
      id: "heuristic-alv-definition",
      source: "pwa",
      section: "Section 22 ALV definition",
      title: "Average line value",
      reason: "ALV term question",
      priority: pureAlvGuaranteeIntent ? 122 : 90,
      searchTerms: ["average line value", "alv means", "projected average of all regular line values", "adg"],
      crossRefTargets: ["Section 22", "Section 4 B", "Section 4 C"],
    });
    pushCandidate(candidates, {
      id: "heuristic-alv-lineholder",
      source: "pwa",
      section: "Section 4 B",
      title: "Line guarantee using ALV",
      reason: "ALV lineholder guarantee use",
      priority: pureAlvGuaranteeIntent ? 132 : 115,
      searchTerms: ["alv", "average line value", "line guarantee", "regular line value", "adg"],
      crossRefTargets: ["Section 22", "Section 4 B"],
    });
    pushCandidate(candidates, {
      id: "heuristic-alv-guarantee",
      source: "pwa",
      section: "Section 4 C",
      title: "Reserve guarantee using ALV",
      reason: "ALV reserve guarantee use",
      priority: pureAlvGuaranteeIntent ? 135 : 120,
      searchTerms: ["alv minus two hours", "reserve pilot", "line guarantee", "reserve guarantee"],
      crossRefTargets: ["Section 4 B", "Section 4 C"],
    });
  }

  if (mentionsSick && mentionsGreenslip) {
    pushCandidate(candidates, {
      id: "heuristic-sick-gs-governing",
      source: "pwa",
      section: "Section 14 E",
      title: "Sick leave rejoin / add rotation rule",
      reason: "Sick plus Greenslip governing rule",
      priority: 128,
      searchTerms: [
        "advises the company of the date on which the pilot will be well",
        "added rotation will be used to replenish the pilot's sick leave credit allotment",
        "additional pay above the single pay and credit of a rotation necessary to replenish the pilot's sick bank will be paid",
      ],
      crossRefTargets: ["Section 14 E", "Section 23 Q"],
    });
    pushCandidate(candidates, {
      id: "heuristic-sick-gs-example",
      source: "pwa",
      section: "Section 14 E and Example Three",
      title: "Sick plus GS worked example",
      reason: "Worked example matching sick plus Greenslip overlap",
      priority: 132,
      searchTerms: [
        "example three",
        "11 hours will be used to replenish the pilot's available sick leave hours",
        "single pay no credit",
        "lesser of the alv or 75 hours",
        "green slip",
      ],
      crossRefTargets: ["Section 14 E", "Section 23 Q"],
    });
    pushCandidate(candidates, {
      id: "heuristic-sick-gs-q-examples",
      source: "pwa",
      section: "Section 23 Q Example one/two/three",
      title: "GS / GSWC sick-leave examples",
      reason: "Section 23 Q worked examples for sick and GS/GSWC",
      priority: 120,
      searchTerms: [
        "misses a rotation due to sick leave",
        "submits a gs or gswc",
        "processed in seniority order",
        "scheduled to operate after the pilot is well",
      ],
      crossRefTargets: ["Section 23 Q", "Section 14 E"],
    });
  }

  if (mentionsReroute) {
    if (mentionsXDay) {
      pushCandidate(candidates, {
        id: "heuristic-reroute-xday-pwa",
        source: "pwa",
        section: "Section 23 L.9",
        title: "X-day interruption",
        reason: "X-day interruption rule for reroute / interrupted X-day scenario",
        priority: 142,
        searchTerms: [
          "x-day interruption",
          "interrupted x-day",
          "lost x-day",
          "x-day credit",
          "reroute x-day",
        ],
        crossRefTargets: ["Section 23 L.9", "Section 23 L"],
      });
    }
    pushCandidate(candidates, {
      id: "heuristic-reroute-pwa",
      source: "pwa",
      section: "Section 23 L",
      title: "Reroute / reassignment",
      reason: "Reroute pay question",
      priority: 115,
      searchTerms: [
        "reroute pay",
        "rerouted rotation",
        "original trip changed trip",
        "deadhead",
      ],
      crossRefTargets: ["Section 23 L", "Section 4 F"],
    });
    pushCandidate(candidates, {
      id: "heuristic-reroute-guarantee",
      source: "pwa",
      section: "Section 4 F",
      title: "Rotation guarantee",
      reason: "Reroute pay interaction",
      priority: 100,
      searchTerms: ["rerouted rotation flown under", "rotation guarantee", "reroute pay"],
      crossRefTargets: ["Section 23 L"],
    });
    pushCandidate(candidates, {
      id: "heuristic-reroute-scheduler",
      source: "scheduler_manual",
      section: "Rerouted Rotations",
      title: "Rerouted Rotations",
      reason: "Reroute implementation support",
      priority: 80,
      searchTerms: ["rerouted rotations", "reroute pay", "deadhead", "same day"],
      crossRefTargets: ["Section 23 L"],
    });
  }

  if (mentionsShortCallDutyScenario) {
    pushCandidate(candidates, {
      id: "heuristic-shortcall-duty-pwa",
      source: "pwa",
      section: "Section 23 S.9",
      title: "Short call",
      reason: "Short-call plus same-day duty / report-time scenario",
      priority: 150,
      searchTerms: [
        "short call",
        "same day trip",
        "report time",
        "reports at",
        "promptly available",
        "short-call period",
        "report for a rotation",
      ],
      crossRefTargets: ["Section 23 S", "Section 12"],
    });
    pushCandidate(candidates, {
      id: "heuristic-shortcall-duty-rest",
      source: "pwa",
      section: "Section 12",
      title: "Duty / rest legality",
      reason: "Duty legality and report-time interaction",
      priority: 138,
      searchTerms: [
        "duty period",
        "flight time",
        "legality",
        "report time",
        "duty and rest",
      ],
      crossRefTargets: ["Section 12", "Section 23 S"],
    });
    pushCandidate(candidates, {
      id: "heuristic-shortcall-duty-scheduler",
      source: "scheduler_manual",
      section: "Short Call (23 S.9)",
      title: "Short Call",
      reason: "Scheduler manual short-call legality guidance",
      priority: 132,
      searchTerms: [
        "short call",
        "same day trip",
        "report time",
        "promptly available",
        "legal assignment",
        "flight duty period",
      ],
      crossRefTargets: ["Section 23 S.9", "Section 12"],
    });
  }

  if (mentionsGreenslip) {
    pushCandidate(candidates, {
      id: "heuristic-gs-pwa",
      source: "pwa",
      section: "Section 23 Q",
      title: "Greenslip",
      reason: "Greenslip pay question",
      priority: mentionsLongCall ? 118 : 100,
      searchTerms: [
        "green slip",
        "greenslip",
        "gs rotation",
        "reserve pilot awarded a gs rotation",
      ],
      crossRefTargets: ["Section 23 Q", "Section 4 F.7.d"],
    });
    pushCandidate(candidates, {
      id: "heuristic-gs-conflict",
      source: "pwa",
      section: "Section 4 F.7.d",
      title: "Greenslip with conflict",
      reason: "Greenslip conflict / overlap",
      priority: 95,
      searchTerms: ["green slips with conflict", "x-day", "conflict under section 23 q"],
      crossRefTargets: ["Section 23 Q"],
    });
    if (mentionsLongCall) {
      pushCandidate(candidates, {
        id: "heuristic-gs-longcall",
        source: "pwa",
        section: "Section 23 Q long call reserve",
        title: "GS long call reserve carveout",
        reason: "GS + long call overlap",
        priority: 130,
        searchTerms: [
          "long call reserve pilot",
          "within 18 hours of the first attempted contact",
          "single pay, no credit for the first duty period",
        ],
        crossRefTargets: ["Section 23 Q", "Section 23 S"],
      });
    }
  }

  return candidates;
}

export function resolveGoverningSections(args: {
  question: string;
  facts: ParsedScenarioFacts;
  scenario: CopilotScenarioFamily | null;
  matchedInteractionRules: MatchedInteractionRule[];
}): GoverningSectionRoute {
  const questionLower = args.question.toLowerCase();
  const routedCandidates: GoverningSectionCandidate[] = [];
  const fallbackCandidates: GoverningSectionCandidate[] = [];
  const routeLabels = new Set<string>();

  const mentionsApd =
    /\bapd\b/.test(questionLower) || questionLower.includes("authorized personal drop");
  const mentionsGuarantee =
    questionLower.includes("minimum daily guarantee") ||
    questionLower.includes("daily guarantee") ||
    questionLower.includes("minimum guarantee") ||
    questionLower.includes("reserve guarantee") ||
    questionLower.includes("line guarantee") ||
    /\badg\b/.test(questionLower);
  const mentionsAlv =
    /\balv\b/.test(questionLower) || questionLower.includes("average line value");
  const pureAlvGuaranteeIntent = isPureAlvGuaranteeIntent(questionLower, args.facts);
  const mentionsGreenslip =
    questionLower.includes("green slip") ||
    questionLower.includes("greenslip") ||
    /\bgs\b/.test(questionLower);
  const mentionsOverlap =
    questionLower.includes("overlap") ||
    questionLower.includes("overlapping") ||
    questionLower.includes("conflict") ||
    questionLower.includes("long call");
  const mentionsReroute =
    questionLower.includes("reroute") ||
    questionLower.includes("rerouted") ||
    questionLower.includes("reassign");
  const mentionsXDay =
    questionLower.includes("x-day") ||
    questionLower.includes("x day") ||
    questionLower.includes("interrupted x-day") ||
    questionLower.includes("interrupted x-days") ||
    questionLower.includes("lost x-day") ||
    questionLower.includes("x-day credit");
  const mentionsShortCallDutyScenario =
    questionLower.includes("short call") &&
    (
      questionLower.includes("same day trip") ||
      questionLower.includes("subsequent same day trip") ||
      questionLower.includes("report time") ||
      questionLower.includes("reports at") ||
      questionLower.includes("duty") ||
      questionLower.includes("flight time") ||
      questionLower.includes("legality") ||
      questionLower.includes("both remain on schedule") ||
      questionLower.includes("assigned short call and trip")
    );
  const mentionsSick = questionLower.includes("sick") || questionLower.includes("called in sick");
  const isSickGreenslip =
    mentionsSick &&
    (questionLower.includes("greenslip") || questionLower.includes("green slip") || /\bgs\b/.test(questionLower));

  const heuristicCandidates = buildHeuristicCandidates({
    questionLower,
    facts: args.facts,
    scenario: args.scenario ?? undefined,
  });

  if (mentionsApd) {
    routeLabels.add("apd");
    for (const candidate of heuristicCandidates.filter((item) =>
      item.section.includes("23 I.10") || item.section.includes("23. SCHEDULING")
    )) {
      pushCandidate(routedCandidates, candidate);
    }
  }

  if (mentionsGuarantee) {
    routeLabels.add("guarantee");
    for (const candidate of heuristicCandidates.filter((item) =>
      item.section.includes("Section 4 B") ||
      item.section.includes("Section 4 C") ||
      item.section.includes("4. MINIMUM PAY AND CREDIT GUARANTEES")
    )) {
      pushCandidate(routedCandidates, candidate);
    }
  }

  if (mentionsAlv) {
    routeLabels.add("alv");
    for (const candidate of heuristicCandidates.filter((item) =>
      item.id.includes("alv") || item.section.includes("Section 4 B") || item.section.includes("Section 4 C")
    )) {
      pushCandidate(routedCandidates, candidate);
    }
  }

  if (pureAlvGuaranteeIntent) {
    routeLabels.add("pure_alv_guarantee");
    for (const candidate of heuristicCandidates.filter((item) =>
      item.section.includes("Section 22") ||
      item.section.includes("Section 4 B") ||
      item.section.includes("Section 4 C") ||
      item.section.includes("4. MINIMUM PAY AND CREDIT GUARANTEES")
    )) {
      pushCandidate(routedCandidates, {
        ...candidate,
        priority: Math.max(candidate.priority, candidate.source === "pwa" ? 145 : 85),
      });
    }
  }

  if (mentionsGreenslip && mentionsOverlap) {
    routeLabels.add("greenslip_overlap");
    for (const candidate of heuristicCandidates.filter((item) =>
      item.section.includes("Section 23 Q") || item.section.includes("4 F.7.d")
    )) {
      pushCandidate(routedCandidates, candidate);
    }
  }

  if (isSickGreenslip) {
    routeLabels.add("sick_greenslip");
    for (const candidate of heuristicCandidates.filter((item) =>
      item.section.includes("Section 14 E") ||
      item.section.includes("Section 23 Q Example") ||
      item.section.includes("Section 23 Q")
    )) {
      pushCandidate(routedCandidates, candidate);
    }
  }

  if (mentionsReroute) {
    routeLabels.add("reroute");
    if (mentionsXDay) {
      routeLabels.add("x_day");
      for (const candidate of heuristicCandidates.filter((item) =>
        item.section.includes("Section 23 L.9") ||
        item.section.includes("Section 23 L")
      )) {
        pushCandidate(routedCandidates, {
          ...candidate,
          priority: Math.max(candidate.priority, candidate.section.includes("23 L.9") ? 170 : 145),
        });
      }
    }
    for (const candidate of heuristicCandidates.filter((item) =>
      item.section.includes("Section 23 L") ||
      item.section.includes("Section 23 K") ||
      item.section.includes("Section 4 F")
    )) {
      pushCandidate(routedCandidates, candidate);
    }
  }

  if (mentionsShortCallDutyScenario) {
    routeLabels.add("short_call_duty");
    for (const candidate of heuristicCandidates.filter((item) =>
      item.section.includes("Section 23 S.9") ||
      item.section.includes("Section 23 S") ||
      item.section.includes("Section 12") ||
      item.section.includes("Short Call (23 S.9)")
    )) {
      pushCandidate(routedCandidates, {
        ...candidate,
        priority: Math.max(
          candidate.priority,
          candidate.section.includes("23 S.9") ? 168 : candidate.section.includes("Section 12") ? 156 : 145
        ),
      });
    }
  }

  for (const rule of args.matchedInteractionRules) {
    for (const source of rule.governingSources) {
      const candidate: GoverningSectionCandidate = {
        id: `route:${rule.id}:${source.source}:${source.section}`,
        source: source.source,
        section: source.section,
        title: source.title,
        reason: `Deterministic route from interaction rule: ${rule.title}`,
        priority: source.source === "pwa" ? 160 : source.source === "compensation_manual" ? 120 : 100,
        searchTerms: rule.retrievalBoostTerms,
        crossRefTargets: [source.section],
      };
      if (routedCandidates.length > 0) {
        pushCandidate(routedCandidates, candidate);
      } else {
        pushCandidate(fallbackCandidates, candidate);
      }
    }
  }

  for (const candidate of heuristicCandidates) {
    if (!routedCandidates.some((item) => item.source === candidate.source && item.section === candidate.section)) {
      pushCandidate(fallbackCandidates, candidate);
    }
  }

  return {
    highConfidence: routedCandidates.sort((a, b) => b.priority - a.priority),
    fallbackCandidates: fallbackCandidates.sort((a, b) => b.priority - a.priority),
    routeLabels: Array.from(routeLabels),
  };
}

export function governingCandidateMatchesChunk(
  candidate: GoverningSectionCandidate,
  chunk: ContractDocumentChunk
) {
  if (candidate.source !== chunk.source) {
    return false;
  }

  const searchable = normalize(
    `${chunk.section} ${chunk.title ?? ""} ${chunk.text} ${chunk.crossRefs.join(" ")}`
  );

  if (searchable.includes(normalize(candidate.section))) {
    return true;
  }

  if (candidate.crossRefTargets.some((target) => searchable.includes(normalize(target)))) {
    return true;
  }

  return candidate.searchTerms.some((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm.length > 0 && searchable.includes(normalizedTerm);
  });
}

export function filterChunksForGoverningRoute(args: {
  chunks: ContractDocumentChunk[];
  route: GoverningSectionRoute;
}) {
  const activeCandidates =
    args.route.highConfidence.length > 0 ? args.route.highConfidence : args.route.fallbackCandidates;

  if (activeCandidates.length === 0) {
    return [];
  }

  const exactSectionMatches = args.chunks.filter((chunk) =>
    activeCandidates.some((candidate) => {
      if (candidate.source !== chunk.source) {
        return false;
      }
      const sectionHeader = normalize(`${chunk.section} ${chunk.title ?? ""}`);
      return sectionHeader.includes(normalize(candidate.section));
    })
  );

  if (exactSectionMatches.length > 0) {
    return exactSectionMatches;
  }

  return args.chunks.filter((chunk) =>
    activeCandidates.some((candidate) => governingCandidateMatchesChunk(candidate, chunk))
  );
}

function packetLooksDefinitionOnly(packet: SectionAwareGroundingPacket) {
  const header = `${packet.section} ${packet.title ?? ""} ${packet.note ?? ""}`.toLowerCase();
  const content = packet.content.toLowerCase();

  if (/definition|glossary/.test(header) && !/\bwill\b|\bshall\b|\breceive\b|\bgranted\b|\bcredit\b|\bguarantee\b|\bpaid\b/.test(content)) {
    return true;
  }

  const ruleVerbCount = [
    " will ",
    " shall ",
    " receive ",
    " granted ",
    " credit ",
    " guarantee ",
    " paid ",
    " entitled ",
    " may not ",
  ].filter((token) => content.includes(token)).length;

  return ruleVerbCount === 0 && content.length < 500;
}

export function hasUsableGoverningPackets(packets: SectionAwareGroundingPacket[]) {
  const governingPackets = packets.filter((packet) => packet.packetType === "governing_section");
  if (governingPackets.length === 0) {
    return false;
  }

  return governingPackets.some((packet) => !packetLooksDefinitionOnly(packet));
}

export function hasUsableRuleMatches(matches: ContractSearchMatch[]) {
  if (matches.length === 0) {
    return false;
  }

  return matches.some((match) => {
    const content = `${match.chunk.section} ${match.chunk.title ?? ""} ${match.chunk.text}`.toLowerCase();
    if (!match.chunk.isDefinition) {
      return true;
    }
    return /\bwill\b|\bshall\b|\breceive\b|\bgranted\b|\bcredit\b|\bguarantee\b|\bpaid\b|\bentitled\b|\bmay not\b/.test(
      content
    );
  });
}

export function resolveCandidateGoverningSections(args: {
  question: string;
  facts: ParsedScenarioFacts;
  scenario: CopilotScenarioFamily | null;
  matchedInteractionRules: MatchedInteractionRule[];
  primaryMatches: ContractSearchMatch[];
}) {
  const routed = resolveGoverningSections({
    question: args.question,
    facts: args.facts,
    scenario: args.scenario,
    matchedInteractionRules: args.matchedInteractionRules,
  });
  const candidates: GoverningSectionCandidate[] = [...routed.highConfidence, ...routed.fallbackCandidates];

  for (const match of args.primaryMatches.slice(0, 4)) {
    pushCandidate(candidates, {
      id: `primary:${match.chunk.id}`,
      source: match.chunk.source,
      section: match.chunk.section,
      title: match.chunk.title,
      reason: "High-confidence search match",
      priority: 60 + Math.min(match.score, 40),
      searchTerms: match.matchedTerms,
      crossRefTargets: match.chunk.crossRefs,
    });
  }

  return candidates.sort((left, right) => right.priority - left.priority).slice(0, 8);
}
