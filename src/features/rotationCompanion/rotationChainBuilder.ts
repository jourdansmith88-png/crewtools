export type RotationChainLeg = {
  index?: number;
  flightNumber?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  scheduledOut?: string | null;
  scheduledIn?: string | null;
  scheduledBlock?: string | null;
  turn?: string | null;
  date?: string | null;
  isDeadhead?: boolean;
  carrier?: string | null;
  confirmationCode?: string | null;
  sourceText?: string | null;
  segmentType?: "operating" | "deadhead" | "return_to_gate";
};

export type RotationChainCandidate = RotationChainLeg & {
  sourceScreenshotIndex?: number;
  rawSourceLine?: string;
};

export type RotationChainContext = {
  base?: string | null;
  layoverCities?: string[];
  startDate?: string;
  endDate?: string;
};

export type RotationChainBuildResult = {
  rawFinalOrderedChain: RotationChainLeg[];
  userFacingLegs: RotationChainLeg[];
  prefixRecoveryAttempted: boolean;
  prefixRecoveredCount: number;
  recoveredPrefixLegs: string[];
  chainBeforePrefixRecoveryCount: number;
  chainAfterPrefixRecoveryCount: number;
  terminalReturnLeg: string;
  terminalCutIndex: number;
  discardedAfterTerminal: number;
};

export type RotationSnapshotComputation = {
  scheduledBlockMinutes: number;
  scheduledBlockSource: "header" | "computedFromUserFacingLegs" | "fallback";
  headerScheduledBlock?: number;
  computedUserFacingScheduledBlock: number;
  finalArrival: string;
  nextFlightCityPair: string;
};

export type ScreenshotRotationPartialDiagnosis = {
  rotationBase: string | null;
  hasTerminalReturnToBase: boolean;
  isPartial: boolean;
  partialReason: string | null;
};

function extractNormalizedClockToken(value?: string | null) {
  if (!value) {
    return "";
  }
  const compact = value.match(/\b(\d{3,4})\b/);
  return compact?.[1] ?? value.trim();
}

function parseClockTokenMinutes(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const colonMatch = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colonMatch?.[1] && colonMatch?.[2]) {
    return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
  }
  const compactMatch = value.match(/\b(\d{3,4})\b/);
  if (!compactMatch?.[1]) {
    return undefined;
  }
  const raw = compactMatch[1].padStart(4, "0");
  const hours = Number(raw.slice(0, 2));
  const minutes = Number(raw.slice(2, 4));
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
    return undefined;
  }
  return hours * 60 + minutes;
}

function extractEmbeddedDateToken(value?: string | null) {
  if (!value) {
    return undefined;
  }
  return value.match(/\b(\d{1,2}[A-Z]{3})\b/i)?.[1]?.toUpperCase();
}

function resolveLegDateToken(leg: {
  date?: string | null;
  scheduledOut?: string | null;
  scheduledIn?: string | null;
}) {
  return (
    extractEmbeddedDateToken(leg.date) ??
    extractEmbeddedDateToken(leg.scheduledOut) ??
    extractEmbeddedDateToken(leg.scheduledIn) ??
    undefined
  );
}

function parseClockishMinutes(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDateToken(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(\d{1,2})([A-Z]{3})\b/i);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const monthIndex = months.indexOf(match[2].toUpperCase());
  if (monthIndex < 0) {
    return undefined;
  }
  return Number(match[1]) * 100 + (monthIndex + 1);
}

function buildComparableLegMoment(date?: string | null, time?: string | null) {
  const dateToken = parseDateToken(extractEmbeddedDateToken(date) ?? date);
  const timeToken = parseClockTokenMinutes(time);
  if (dateToken == null && timeToken == null) {
    return undefined;
  }
  return (dateToken ?? 0) * 10000 + (timeToken ?? 0);
}

function buildStableLegKey(leg: {
  date?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  carrier?: string | null;
  flightNumber?: string | null;
  scheduledOut?: string | null;
}) {
  return [
    resolveLegDateToken(leg) ?? "",
    (leg.departureAirport ?? "").trim().toUpperCase(),
    (leg.arrivalAirport ?? "").trim().toUpperCase(),
    (leg.carrier ?? "").trim().toUpperCase(),
    (leg.flightNumber ?? "").trim().toUpperCase(),
    extractNormalizedClockToken(leg.scheduledOut),
  ].join("|");
}

function buildCandidateRichnessScore(leg: RotationChainLeg | RotationChainCandidate) {
  return [
    leg.scheduledIn ? 4 : 0,
    leg.scheduledBlock ? 4 : 0,
    resolveLegDateToken(leg) ? 2 : 0,
    leg.turn ? 1 : 0,
    leg.sourceText ? Math.min(leg.sourceText.length / 200, 1) : 0,
    "rawSourceLine" in leg && leg.rawSourceLine ? Math.min(leg.rawSourceLine.length / 200, 1) : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function mergePreferredLeg(
  preferred: RotationChainLeg | RotationChainCandidate | undefined,
  candidate: RotationChainLeg | RotationChainCandidate,
): RotationChainLeg {
  const winner =
    !preferred || buildCandidateRichnessScore(candidate) >= buildCandidateRichnessScore(preferred)
      ? candidate
      : preferred;
  return {
    index: "index" in winner ? winner.index : undefined,
    flightNumber: winner.flightNumber ?? null,
    departureAirport: winner.departureAirport ?? null,
    arrivalAirport: winner.arrivalAirport ?? null,
    scheduledOut: winner.scheduledOut ?? null,
    scheduledIn: winner.scheduledIn ?? null,
    scheduledBlock: winner.scheduledBlock ?? null,
    turn: winner.turn ?? null,
    date: winner.date ?? null,
    isDeadhead: winner.isDeadhead,
    carrier: winner.carrier ?? null,
    confirmationCode: winner.confirmationCode ?? null,
    sourceText: winner.sourceText ?? null,
    segmentType: winner.segmentType,
  };
}

function unwrapWrappedSeedChain(
  selectedChain: RotationChainLeg[],
  context: RotationChainContext,
) {
  const base = context.base?.trim().toUpperCase() || null;
  if (!base || selectedChain.length < 2) {
    return {
      unwrapped: selectedChain,
      wrapDetected: false,
    };
  }

  const firstLegMoment = buildComparableLegMoment(
    resolveLegDateToken(selectedChain[0]),
    selectedChain[0]?.scheduledOut,
  );
  let wrapIndex = -1;
  for (let index = 0; index < selectedChain.length - 1; index += 1) {
    const current = selectedChain[index];
    const next = selectedChain[index + 1];
    const nextLegMoment = buildComparableLegMoment(
      resolveLegDateToken(next),
      next?.scheduledOut,
    );
    if (
      current?.arrivalAirport?.toUpperCase() === base &&
      next?.departureAirport?.toUpperCase() === base &&
      firstLegMoment != null &&
      nextLegMoment != null &&
      nextLegMoment < firstLegMoment
    ) {
      wrapIndex = index;
    }
  }

  if (wrapIndex < 0) {
    return {
      unwrapped: selectedChain,
      wrapDetected: false,
    };
  }

  return {
    unwrapped: [...selectedChain.slice(wrapIndex + 1), ...selectedChain.slice(0, wrapIndex + 1)].map((leg, index) => ({
      ...leg,
      index: index + 1,
    })),
    wrapDetected: true,
  };
}

function dedupeAndEnrichChain(
  selectedChain: RotationChainLeg[],
  allCandidates: RotationChainCandidate[],
) {
  const bestByIdentity = new Map<string, RotationChainLeg>();
  for (const leg of [...allCandidates, ...selectedChain]) {
    const key = buildStableLegKey(leg);
    bestByIdentity.set(key, mergePreferredLeg(bestByIdentity.get(key), leg));
  }

  const deduped: RotationChainLeg[] = [];
  const seen = new Set<string>();
  for (const leg of selectedChain) {
    const key = buildStableLegKey(leg);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      ...mergePreferredLeg(bestByIdentity.get(key), leg),
      index: deduped.length + 1,
    });
  }
  return deduped;
}

function buildChronologicalContiguousChain(
  selectedChain: RotationChainLeg[],
  allCandidates: RotationChainCandidate[],
) {
  if (selectedChain.length === 0) {
    return [];
  }

  const bestByIdentity = new Map<string, RotationChainLeg>();
  for (const leg of [...allCandidates, ...selectedChain]) {
    const key = buildStableLegKey(leg);
    bestByIdentity.set(key, mergePreferredLeg(bestByIdentity.get(key), leg));
  }

  const pool = Array.from(bestByIdentity.values());
  const chain: RotationChainLeg[] = [];
  const used = new Set<string>();
  let current = mergePreferredLeg(undefined, selectedChain[0]);

  while (current) {
    const currentKey = buildStableLegKey(current);
    if (used.has(currentKey)) {
      break;
    }
    used.add(currentKey);
    chain.push({ ...current, index: chain.length + 1 });

    const currentArrivalAirport = current.arrivalAirport?.toUpperCase() ?? null;
    if (!currentArrivalAirport) {
      break;
    }
    const currentMoment = buildComparableLegMoment(
      resolveLegDateToken(current),
      current.scheduledIn ?? current.scheduledOut,
    );
    const nextCandidates = pool
      .filter((candidate) => {
        const candidateKey = buildStableLegKey(candidate);
        if (used.has(candidateKey)) {
          return false;
        }
        if ((candidate.departureAirport ?? "").toUpperCase() !== currentArrivalAirport) {
          return false;
        }
        const candidateMoment = buildComparableLegMoment(
          resolveLegDateToken(candidate),
          candidate.scheduledOut,
        );
        if (currentMoment != null && candidateMoment != null && candidateMoment < currentMoment) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const leftMoment =
          buildComparableLegMoment(resolveLegDateToken(left), left.scheduledOut) ?? Number.POSITIVE_INFINITY;
        const rightMoment =
          buildComparableLegMoment(resolveLegDateToken(right), right.scheduledOut) ?? Number.POSITIVE_INFINITY;
        if (leftMoment !== rightMoment) {
          return leftMoment - rightMoment;
        }
        return buildCandidateRichnessScore(right) - buildCandidateRichnessScore(left);
      });

    current = nextCandidates[0] ? mergePreferredLeg(undefined, nextCandidates[0]) : undefined;
  }

  return chain;
}

export function recoverContiguousPrefixForScreenshotChain(
  selectedChain: RotationChainLeg[],
  allCandidates: RotationChainCandidate[],
  context: RotationChainContext,
) {
  const base = context.base?.trim().toUpperCase() || null;
  if (selectedChain.length === 0) {
    return {
      prefixRecoveryAttempted: false,
      prefixRecoveredCount: 0,
      recoveredPrefixLegs: [] as string[],
      chainBeforePrefixRecoveryCount: 0,
      chainAfterPrefixRecoveryCount: 0,
      recoveredChain: selectedChain,
    };
  }

  const firstSelectedLeg = selectedChain[0];
  if (!firstSelectedLeg?.departureAirport || (base && firstSelectedLeg.departureAirport.toUpperCase() === base)) {
    return {
      prefixRecoveryAttempted: false,
      prefixRecoveredCount: 0,
      recoveredPrefixLegs: [] as string[],
      chainBeforePrefixRecoveryCount: selectedChain.length,
      chainAfterPrefixRecoveryCount: selectedChain.length,
      recoveredChain: selectedChain,
    };
  }

  const seenKeys = new Set(selectedChain.map((leg) => buildStableLegKey(leg)));
  const prefix: RotationChainLeg[] = [];
  let currentFirstLeg = firstSelectedLeg;
  let neededArrival = currentFirstLeg.departureAirport?.toUpperCase() ?? null;

  while (neededArrival) {
    const currentDepartureMoment = buildComparableLegMoment(currentFirstLeg.date, currentFirstLeg.scheduledOut);
    const candidates = allCandidates
      .filter((candidate) => {
        if ((candidate.arrivalAirport ?? "").toUpperCase() !== neededArrival) {
          return false;
        }
        const stableKey = buildStableLegKey(candidate);
        if (seenKeys.has(stableKey)) {
          return false;
        }
        const candidateArrivalMoment = buildComparableLegMoment(candidate.date, candidate.scheduledIn ?? candidate.scheduledOut);
        if (currentDepartureMoment != null && candidateArrivalMoment != null && candidateArrivalMoment > currentDepartureMoment) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const leftMoment = buildComparableLegMoment(left.date, left.scheduledIn ?? left.scheduledOut) ?? -Infinity;
        const rightMoment = buildComparableLegMoment(right.date, right.scheduledIn ?? right.scheduledOut) ?? -Infinity;
        return rightMoment - leftMoment;
      });

    const bestCandidate = candidates[0];
    if (!bestCandidate) {
      break;
    }

    const recoveredLeg: RotationChainLeg = {
      index: 0,
      flightNumber: bestCandidate.flightNumber ?? null,
      departureAirport: bestCandidate.departureAirport ?? null,
      arrivalAirport: bestCandidate.arrivalAirport ?? null,
      scheduledOut: bestCandidate.scheduledOut ?? null,
      scheduledIn: bestCandidate.scheduledIn ?? null,
      scheduledBlock: bestCandidate.scheduledBlock ?? null,
      turn: bestCandidate.turn ?? null,
      date: bestCandidate.date ?? null,
      isDeadhead: bestCandidate.isDeadhead,
      carrier: bestCandidate.carrier ?? null,
      confirmationCode: bestCandidate.confirmationCode ?? null,
      sourceText: bestCandidate.sourceText ?? null,
      segmentType: bestCandidate.segmentType,
    };

    prefix.unshift(recoveredLeg);
    seenKeys.add(buildStableLegKey(bestCandidate));
    currentFirstLeg = recoveredLeg;
    neededArrival = currentFirstLeg.departureAirport?.toUpperCase() ?? null;
    if (base && currentFirstLeg.departureAirport?.toUpperCase() === base) {
      break;
    }
  }

  const recoveredChain = [...prefix, ...selectedChain].map((leg, index) => ({ ...leg, index: index + 1 }));
  return {
    prefixRecoveryAttempted: prefix.length > 0,
    prefixRecoveredCount: prefix.length,
    recoveredPrefixLegs: prefix.map((leg) => `${leg.departureAirport ?? "?"}-${leg.arrivalAirport ?? "?"}`),
    chainBeforePrefixRecoveryCount: selectedChain.length,
    chainAfterPrefixRecoveryCount: recoveredChain.length,
    recoveredChain,
  };
}

export function sanitizeScreenshotFinalChainBeforeDisplay(
  rawFinalOrderedChain: RotationChainLeg[],
  context: RotationChainContext,
) {
  if (rawFinalOrderedChain.length <= 1) {
    return {
      sanitizedUserFacingLegs: rawFinalOrderedChain,
      terminalReturnLeg: rawFinalOrderedChain.at(-1)
        ? `${rawFinalOrderedChain.at(-1)?.departureAirport ?? "?"}-${rawFinalOrderedChain.at(-1)?.arrivalAirport ?? "?"}`
        : "unknown",
      terminalCutIndex: rawFinalOrderedChain.length > 0 ? rawFinalOrderedChain.length - 1 : -1,
      discardedAfterTerminal: 0,
    };
  }

  const base = context.base?.trim().toUpperCase() || null;
  if (!base) {
    return {
      sanitizedUserFacingLegs: rawFinalOrderedChain,
      terminalReturnLeg: rawFinalOrderedChain.at(-1)
        ? `${rawFinalOrderedChain.at(-1)?.departureAirport ?? "?"}-${rawFinalOrderedChain.at(-1)?.arrivalAirport ?? "?"}`
        : "unknown",
      terminalCutIndex: rawFinalOrderedChain.length > 0 ? rawFinalOrderedChain.length - 1 : -1,
      discardedAfterTerminal: 0,
    };
  }

  let terminalCutIndex = -1;
  for (let index = rawFinalOrderedChain.length - 1; index >= 0; index -= 1) {
    const leg = rawFinalOrderedChain[index];
    if (leg?.arrivalAirport?.toUpperCase() !== base) {
      continue;
    }
    const hasLaterBaseDeparture = rawFinalOrderedChain
      .slice(index + 1)
      .some((laterLeg) => laterLeg?.departureAirport?.toUpperCase() === base);
    if (hasLaterBaseDeparture) {
      continue;
    }
    terminalCutIndex = index;
    break;
  }

  if (terminalCutIndex < 0) {
    return {
      sanitizedUserFacingLegs: rawFinalOrderedChain,
      terminalReturnLeg: "not_found",
      terminalCutIndex: -1,
      discardedAfterTerminal: 0,
    };
  }

  const sanitizedUserFacingLegs = rawFinalOrderedChain.slice(0, terminalCutIndex + 1);
  return {
    sanitizedUserFacingLegs,
    terminalReturnLeg: `${rawFinalOrderedChain[terminalCutIndex]?.departureAirport ?? "?"}-${rawFinalOrderedChain[terminalCutIndex]?.arrivalAirport ?? "?"}`,
    terminalCutIndex,
    discardedAfterTerminal: Math.max(0, rawFinalOrderedChain.length - sanitizedUserFacingLegs.length),
  };
}

export function buildScreenshotUserFacingChain(args: {
  rawFinalOrderedChain: RotationChainLeg[];
  legCandidates: RotationChainCandidate[];
  context: RotationChainContext;
}) {
  const unwrappedSeedResult = unwrapWrappedSeedChain(args.rawFinalOrderedChain, args.context);
  const enrichedSeedChain = dedupeAndEnrichChain(unwrappedSeedResult.unwrapped, args.legCandidates);
  const prefixRecoveryResult = recoverContiguousPrefixForScreenshotChain(
    enrichedSeedChain,
    args.legCandidates,
    args.context,
  );
  const chronologicalChain = buildChronologicalContiguousChain(
    prefixRecoveryResult.recoveredChain,
    args.legCandidates,
  );
  const sanitizeResult = sanitizeScreenshotFinalChainBeforeDisplay(chronologicalChain, args.context);
  return {
    rawFinalOrderedChain: args.rawFinalOrderedChain,
    userFacingLegs: sanitizeResult.sanitizedUserFacingLegs.map((leg, index) => ({ ...leg, index: index + 1 })),
    prefixRecoveryAttempted: prefixRecoveryResult.prefixRecoveryAttempted,
    prefixRecoveredCount: prefixRecoveryResult.prefixRecoveredCount,
    recoveredPrefixLegs: prefixRecoveryResult.recoveredPrefixLegs,
    chainBeforePrefixRecoveryCount: prefixRecoveryResult.chainBeforePrefixRecoveryCount,
    chainAfterPrefixRecoveryCount: prefixRecoveryResult.chainAfterPrefixRecoveryCount,
    terminalReturnLeg: sanitizeResult.terminalReturnLeg,
    terminalCutIndex: sanitizeResult.terminalCutIndex,
    discardedAfterTerminal: sanitizeResult.discardedAfterTerminal,
  } satisfies RotationChainBuildResult;
}

export function computeSnapshotFromUserFacingChain(args: {
  userFacingLegs: RotationChainLeg[];
  headerScheduledBlockMinutes?: number;
  fallbackScheduledBlockMinutes?: number;
  finalArrivalFallback?: string;
}) {
  const computedUserFacingScheduledBlock = args.userFacingLegs.reduce(
    (sum, leg) => sum + (parseClockishMinutes(leg.scheduledBlock) ?? 0),
    0,
  );
  const scheduledBlockSource: "header" | "computedFromUserFacingLegs" | "fallback" =
    typeof args.headerScheduledBlockMinutes === "number" && args.headerScheduledBlockMinutes > 0
      ? "header"
      : computedUserFacingScheduledBlock > 0
        ? "computedFromUserFacingLegs"
        : "fallback";
  const scheduledBlockMinutes =
    scheduledBlockSource === "header"
      ? args.headerScheduledBlockMinutes!
      : scheduledBlockSource === "computedFromUserFacingLegs"
        ? computedUserFacingScheduledBlock
        : args.fallbackScheduledBlockMinutes ?? 0;
  const finalLeg = args.userFacingLegs.at(-1);
  const firstLeg = args.userFacingLegs[0];
  return {
    scheduledBlockMinutes,
    scheduledBlockSource,
    headerScheduledBlock: args.headerScheduledBlockMinutes,
    computedUserFacingScheduledBlock,
    finalArrival: finalLeg?.arrivalAirport ?? args.finalArrivalFallback ?? "TBD",
    nextFlightCityPair: firstLeg ? `${firstLeg.departureAirport ?? "?"}-${firstLeg.arrivalAirport ?? "?"}` : "unknown",
  } satisfies RotationSnapshotComputation;
}

export function diagnoseScreenshotRotationPartialStatus(args: {
  userFacingLegs: RotationChainLeg[];
  context: RotationChainContext;
}) {
  const rotationBase =
    args.context.base?.trim().toUpperCase() ||
    args.userFacingLegs[0]?.departureAirport?.trim().toUpperCase() ||
    null;
  const firstVisibleLeg = args.userFacingLegs[0];
  const lastVisibleLeg = args.userFacingLegs.at(-1);
  const hasTerminalReturnToBase = Boolean(
    rotationBase &&
      lastVisibleLeg?.arrivalAirport?.trim().toUpperCase() === rotationBase,
  );
  const startsAwayFromBase = Boolean(
    rotationBase &&
      firstVisibleLeg?.departureAirport?.trim().toUpperCase() !== rotationBase,
  );
  const missingTripDates = !args.context.startDate || !args.context.endDate;
  const isPartial =
    args.userFacingLegs.length > 0 &&
    (!hasTerminalReturnToBase || startsAwayFromBase || missingTripDates);

  let partialReason: string | null = null;
  if (args.userFacingLegs.length > 0) {
    if (startsAwayFromBase && missingTripDates) {
      partialReason =
        "Partial rotation detected. Visible screenshot chain starts mid-rotation and trip dates are unknown, so the header or opening legs may be missing.";
    } else if (startsAwayFromBase) {
      partialReason =
        "Partial rotation detected. Visible screenshot chain starts mid-rotation, so the opening legs may be missing.";
    } else if (missingTripDates) {
      partialReason =
        "Partial rotation detected. Visible screenshot chain is missing header dates, so the full trip boundaries are unknown.";
    } else if (!hasTerminalReturnToBase) {
      partialReason =
        "Partial rotation detected. Visible screenshot chain does not return to base, so the terminal return may be missing.";
    }
  }

  return {
    rotationBase,
    hasTerminalReturnToBase,
    isPartial,
    partialReason: isPartial ? partialReason : null,
  } satisfies ScreenshotRotationPartialDiagnosis;
}
