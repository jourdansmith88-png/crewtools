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
  reportTime?: string | null;
};

export type RotationChainBuildResult = {
  rawFinalOrderedChain: RotationChainLeg[];
  allTripSegments: RotationChainLeg[];
  userFacingLegs: RotationChainLeg[];
  deadheadAnnotations: ScreenshotDeadheadAnnotation[];
  canonicalCandidateSource: "builderInputCandidates" | "selectedSeedChainFallback";
  chainAnchorReason: string;
  anchoredFirstLeg: string;
  wasChainRotated: boolean;
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

export type ScreenshotDeadheadAnnotation = {
  cityPair: string;
  origin: string;
  destination: string;
  carrier?: string | null;
  flightNumber?: string | null;
  scheduledOut?: string | null;
  scheduledIn?: string | null;
  confirmationCode?: string | null;
  source: "discardedFragment" | "unmatchedCandidate" | "candidateEvidence";
  reason:
    | "confirmation_code"
    | "leading_D_marker"
    | "leading_O_marker"
    | "confirmation_code_and_return_to_base";
  marker?: "D" | "O" | null;
};

export function normalizeCarrierFlight(
  carrier?: string | null,
  flightNumber?: string | null,
) {
  const normalizedCarrier = (carrier ?? "").trim().toUpperCase();
  const normalizedFlightRaw = (flightNumber ?? "").trim().toUpperCase();
  if (!normalizedCarrier && !normalizedFlightRaw) {
    return {
      carrier: "",
      flightNumber: "",
    };
  }
  const withoutCarrierPrefix =
    normalizedCarrier && normalizedFlightRaw.startsWith(normalizedCarrier)
      ? normalizedFlightRaw.slice(normalizedCarrier.length)
      : normalizedFlightRaw;
  const digitMatch = withoutCarrierPrefix.match(/(\d{2,5})/);
  return {
    carrier: normalizedCarrier,
    flightNumber: digitMatch?.[1] ?? withoutCarrierPrefix,
  };
}

function buildDeadheadAnnotationMatchKey(annotation: ScreenshotDeadheadAnnotation) {
  const normalized = normalizeCarrierFlight(annotation.carrier, annotation.flightNumber);
  return [
    annotation.origin.trim().toUpperCase(),
    annotation.destination.trim().toUpperCase(),
    normalized.carrier,
    normalized.flightNumber,
    extractNormalizedClockToken(annotation.scheduledOut),
  ].join("|");
}

function buildVisibleLegDeadheadMatchKey(leg: RotationChainLeg) {
  const normalized = normalizeCarrierFlight(leg.carrier, leg.flightNumber);
  return [
    (leg.departureAirport ?? "").trim().toUpperCase(),
    (leg.arrivalAirport ?? "").trim().toUpperCase(),
    normalized.carrier,
    normalized.flightNumber,
    extractNormalizedClockToken(leg.scheduledOut),
  ].join("|");
}

export function excludeDeadheadLegsFromVisibleChain(
  userFacingLegs: RotationChainLeg[],
  deadheadAnnotations: ScreenshotDeadheadAnnotation[],
) {
  if (userFacingLegs.length === 0 || deadheadAnnotations.length === 0) {
    return userFacingLegs;
  }
  const exactDeadheadKeys = new Set(deadheadAnnotations.map(buildDeadheadAnnotationMatchKey));
  const routeFlightDeadheadKeys = new Set(
    deadheadAnnotations.map((annotation) => {
      const normalized = normalizeCarrierFlight(annotation.carrier, annotation.flightNumber);
      return [
        annotation.origin.trim().toUpperCase(),
        annotation.destination.trim().toUpperCase(),
        normalized.carrier,
        normalized.flightNumber,
      ].join("|");
    }),
  );
  return userFacingLegs.filter((leg) => {
    const exactKey = buildVisibleLegDeadheadMatchKey(leg);
    if (exactDeadheadKeys.has(exactKey)) {
      return false;
    }
    const normalized = normalizeCarrierFlight(leg.carrier, leg.flightNumber);
    const routeFlightKey = [
      (leg.departureAirport ?? "").trim().toUpperCase(),
      (leg.arrivalAirport ?? "").trim().toUpperCase(),
      normalized.carrier,
      normalized.flightNumber,
    ].join("|");
    return !routeFlightDeadheadKeys.has(routeFlightKey);
  });
}

function annotateChainLegsWithDeadheadMetadata(
  legs: RotationChainLeg[],
  deadheadAnnotations: ScreenshotDeadheadAnnotation[],
) {
  const deadheadByExactKey = new Map(
    deadheadAnnotations.map((annotation) => [buildDeadheadAnnotationMatchKey(annotation), annotation]),
  );
  const deadheadByRouteFlightKey = new Map(
    deadheadAnnotations.map((annotation) => {
      const normalized = normalizeCarrierFlight(annotation.carrier, annotation.flightNumber);
      const routeFlightKey = [
        annotation.origin.trim().toUpperCase(),
        annotation.destination.trim().toUpperCase(),
        normalized.carrier,
        normalized.flightNumber,
      ].join("|");
      return [routeFlightKey, annotation] as const;
    }),
  );

  return legs.map((leg, index) => {
    const exactKey = buildVisibleLegDeadheadMatchKey(leg);
    const normalized = normalizeCarrierFlight(leg.carrier, leg.flightNumber);
    const routeFlightKey = [
      (leg.departureAirport ?? "").trim().toUpperCase(),
      (leg.arrivalAirport ?? "").trim().toUpperCase(),
      normalized.carrier,
      normalized.flightNumber,
    ].join("|");
    const matchedAnnotation = deadheadByExactKey.get(exactKey) ?? deadheadByRouteFlightKey.get(routeFlightKey);
    if (!matchedAnnotation) {
      return {
        ...leg,
        index: index + 1,
        isDeadhead: false,
        legKind: leg.segmentType === "return_to_gate" ? "operating" : leg.legKind ?? "operating",
      };
    }

    return {
      ...leg,
      index: index + 1,
      isDeadhead: true,
      legKind: "deadhead" as const,
      carrier: leg.carrier ?? matchedAnnotation.carrier ?? null,
      flightNumber: leg.flightNumber ?? matchedAnnotation.flightNumber ?? null,
      confirmationCode: leg.confirmationCode ?? matchedAnnotation.confirmationCode ?? null,
      sourceText: leg.sourceText ?? null,
      segmentType: "deadhead" as const,
    };
  });
}

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

function normalizeFlightNumberKey(value?: string | null) {
  return normalizeCarrierFlight(null, value).flightNumber;
}

function buildStableLegKey(leg: {
  date?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  carrier?: string | null;
  flightNumber?: string | null;
  scheduledOut?: string | null;
}) {
  const normalized = normalizeCarrierFlight(leg.carrier, leg.flightNumber);
  return [
    resolveLegDateToken(leg) ?? "",
    (leg.departureAirport ?? "").trim().toUpperCase(),
    (leg.arrivalAirport ?? "").trim().toUpperCase(),
    normalized.carrier,
    normalized.flightNumber,
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

function isWeakDuplicateCandidate(candidate: RotationChainLeg | RotationChainCandidate) {
  return !resolveLegDateToken(candidate) && !candidate.scheduledIn && !candidate.scheduledBlock;
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

function pruneWeakRouteDuplicates(
  legs: Array<RotationChainLeg | RotationChainCandidate>,
) {
  const bestRichByRouteFlight = new Map<string, RotationChainLeg | RotationChainCandidate>();
  for (const leg of legs) {
    const normalized = normalizeCarrierFlight(leg.carrier, leg.flightNumber);
    const routeFlightKey = [
      (leg.departureAirport ?? "").trim().toUpperCase(),
      (leg.arrivalAirport ?? "").trim().toUpperCase(),
      normalized.carrier,
      normalized.flightNumber,
    ].join("|");
    const existing = bestRichByRouteFlight.get(routeFlightKey);
    if (!existing || buildCandidateRichnessScore(leg) > buildCandidateRichnessScore(existing)) {
      bestRichByRouteFlight.set(routeFlightKey, leg);
    }
  }

  return legs.filter((leg) => {
    if (!isWeakDuplicateCandidate(leg)) {
      return true;
    }
    const normalized = normalizeCarrierFlight(leg.carrier, leg.flightNumber);
    const routeFlightKey = [
      (leg.departureAirport ?? "").trim().toUpperCase(),
      (leg.arrivalAirport ?? "").trim().toUpperCase(),
      normalized.carrier,
      normalized.flightNumber,
    ].join("|");
    const richer = bestRichByRouteFlight.get(routeFlightKey);
    return !richer || richer === leg || buildCandidateRichnessScore(richer) <= buildCandidateRichnessScore(leg);
  });
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

function buildCanonicalChronologicalCandidateChain(
  allCandidates: RotationChainCandidate[],
  context: RotationChainContext,
) {
  const candidatesWithMoments = allCandidates.filter(
    (candidate) =>
      Boolean(candidate.departureAirport && candidate.arrivalAirport) &&
      buildComparableLegMoment(resolveLegDateToken(candidate), candidate.scheduledOut) != null,
  );
  if (candidatesWithMoments.length === 0) {
    return [] as RotationChainLeg[];
  }
  const seed = mergePreferredLeg(undefined, chooseAnchoredFirstLeg(candidatesWithMoments, context).leg);
  return buildChronologicalContiguousChain([seed], allCandidates);
}

function chooseAnchoredFirstLeg<T extends RotationChainLeg | RotationChainCandidate>(
  legs: T[],
  context: RotationChainContext,
) {
  const base = context.base?.trim().toUpperCase() || null;
  const startDate = context.startDate?.trim().toUpperCase() || null;
  const reportTimeMinutes = parseClockTokenMinutes(context.reportTime);
  const ranked = [...legs]
    .map((leg) => {
      const departureAirport = (leg.departureAirport ?? "").trim().toUpperCase();
      const legDate = resolveLegDateToken(leg) ?? null;
      const departureMinutes = parseClockTokenMinutes(leg.scheduledOut);
      const comparableMoment =
        buildComparableLegMoment(resolveLegDateToken(leg), leg.scheduledOut) ?? Number.POSITIVE_INFINITY;
      const fromBase = Boolean(base) && departureAirport === base;
      const onStartDate = Boolean(startDate) && legDate === startDate;
      const afterReport = departureMinutes != null && reportTimeMinutes != null && departureMinutes >= reportTimeMinutes;

      let priority = 4;
      let reason = "continuity_fallback";
      if (fromBase && onStartDate && afterReport) {
        priority = 0;
        reason = "base_start_date_after_report";
      } else if (fromBase && onStartDate) {
        priority = 1;
        reason = "base_start_date";
      } else if (onStartDate) {
        priority = 2;
        reason = "earliest_start_date_leg";
      } else if (legDate) {
        priority = 3;
        reason = "earliest_dated_leg";
      }

      return {
        leg,
        priority,
        reason,
        comparableMoment,
        richness: buildCandidateRichnessScore(leg),
      };
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      if (left.comparableMoment !== right.comparableMoment) {
        return left.comparableMoment - right.comparableMoment;
      }
      return right.richness - left.richness;
    });

  const best = ranked[0];
  return {
    leg: best?.leg ?? legs[0],
    reason: best?.reason ?? "continuity_fallback",
  };
}

function rotateClosedLoopChainToAnchor(
  chain: RotationChainLeg[],
  context: RotationChainContext,
) {
  if (chain.length <= 1) {
    return {
      rotatedChain: chain,
      chainAnchorReason: chain[0]
        ? chooseAnchoredFirstLeg(chain, context).reason
        : "continuity_fallback",
      anchoredFirstLeg: chain[0]
        ? `${chain[0]?.departureAirport ?? "?"}-${chain[0]?.arrivalAirport ?? "?"}`
        : "unknown",
      wasChainRotated: false,
    };
  }

  const { leg: anchoredLeg, reason } = chooseAnchoredFirstLeg(chain, context);
  const anchorKey = buildStableLegKey(anchoredLeg);
  const anchorIndex = chain.findIndex((leg) => buildStableLegKey(leg) === anchorKey);
  const firstDeparture = chain[0]?.departureAirport?.trim().toUpperCase() ?? null;
  const lastArrival = chain.at(-1)?.arrivalAirport?.trim().toUpperCase() ?? null;
  const isClosedLoop = Boolean(firstDeparture && lastArrival && firstDeparture === lastArrival);

  if (anchorIndex <= 0 || !isClosedLoop) {
    return {
      rotatedChain: chain.map((leg, index) => ({ ...leg, index: index + 1 })),
      chainAnchorReason: reason,
      anchoredFirstLeg: `${(chain[anchorIndex >= 0 ? anchorIndex : 0]?.departureAirport) ?? "?"}-${(chain[anchorIndex >= 0 ? anchorIndex : 0]?.arrivalAirport) ?? "?"}`,
      wasChainRotated: false,
    };
  }

  const rotatedChain = [...chain.slice(anchorIndex), ...chain.slice(0, anchorIndex)].map((leg, index) => ({
    ...leg,
    index: index + 1,
  }));
  return {
    rotatedChain,
    chainAnchorReason: reason,
    anchoredFirstLeg: `${anchoredLeg.departureAirport ?? "?"}-${anchoredLeg.arrivalAirport ?? "?"}`,
    wasChainRotated: true,
  };
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
  if (!firstSelectedLeg?.departureAirport) {
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
  const prunedCandidates = pruneWeakRouteDuplicates(args.legCandidates) as RotationChainCandidate[];
  const prunedSeedChain = pruneWeakRouteDuplicates(args.rawFinalOrderedChain) as RotationChainLeg[];
  const canonicalCandidateChain = buildCanonicalChronologicalCandidateChain(prunedCandidates, args.context);
  const canonicalSanitizeResult =
    canonicalCandidateChain.length > 0
      ? sanitizeScreenshotFinalChainBeforeDisplay(canonicalCandidateChain, args.context)
      : null;
  const unwrappedSeedResult = unwrapWrappedSeedChain(prunedSeedChain, args.context);
  const enrichedSeedChain = dedupeAndEnrichChain(unwrappedSeedResult.unwrapped, prunedCandidates);
  const prefixRecoveryResult = recoverContiguousPrefixForScreenshotChain(
    enrichedSeedChain,
    prunedCandidates,
    args.context,
  );
  const chronologicalFallbackChain = buildChronologicalContiguousChain(
    prefixRecoveryResult.recoveredChain,
    prunedCandidates,
  );
  const fallbackSanitizeResult = sanitizeScreenshotFinalChainBeforeDisplay(chronologicalFallbackChain, args.context);
  const usingCanonicalCandidates = Boolean(canonicalSanitizeResult && canonicalSanitizeResult.sanitizedUserFacingLegs.length > 0);
  const sanitizeResult = canonicalSanitizeResult ?? fallbackSanitizeResult;
  const anchoredChainResult = rotateClosedLoopChainToAnchor(sanitizeResult.sanitizedUserFacingLegs, args.context);
  const allTripSegments = anchoredChainResult.rotatedChain;
  const deadheadAnnotations = extractDeadheadAnnotationsFromScreenshotEvidence({
    userFacingLegs: [],
    allTripSegments,
    discardedFragments: [],
    unmatchedCandidates: [],
    builderInputCandidates: prunedCandidates,
    rotationBase: args.context.base,
  });
  const annotatedTripSegments = annotateChainLegsWithDeadheadMetadata(allTripSegments, deadheadAnnotations);
  return {
    rawFinalOrderedChain: prunedSeedChain,
    allTripSegments: annotatedTripSegments,
    userFacingLegs: annotatedTripSegments,
    deadheadAnnotations,
    canonicalCandidateSource: usingCanonicalCandidates ? "builderInputCandidates" : "selectedSeedChainFallback",
    chainAnchorReason: anchoredChainResult.chainAnchorReason,
    anchoredFirstLeg: anchoredChainResult.anchoredFirstLeg,
    wasChainRotated: anchoredChainResult.wasChainRotated,
    prefixRecoveryAttempted: usingCanonicalCandidates ? false : prefixRecoveryResult.prefixRecoveryAttempted,
    prefixRecoveredCount: usingCanonicalCandidates ? 0 : prefixRecoveryResult.prefixRecoveredCount,
    recoveredPrefixLegs: usingCanonicalCandidates ? [] : prefixRecoveryResult.recoveredPrefixLegs,
    chainBeforePrefixRecoveryCount: usingCanonicalCandidates
      ? canonicalCandidateChain.length
      : prefixRecoveryResult.chainBeforePrefixRecoveryCount,
    chainAfterPrefixRecoveryCount: usingCanonicalCandidates
      ? allTripSegments.length
      : prefixRecoveryResult.chainAfterPrefixRecoveryCount,
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
  const operatingLegs = args.userFacingLegs.filter((leg) => !leg.isDeadhead);
  const computedUserFacingScheduledBlock = operatingLegs.reduce(
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
  const finalLeg = operatingLegs.at(-1) ?? args.userFacingLegs.at(-1);
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
  allTripSegments?: RotationChainLeg[];
  context: RotationChainContext;
}) {
  const fullTripSegments = args.allTripSegments?.length ? args.allTripSegments : args.userFacingLegs;
  const rotationBase =
    args.context.base?.trim().toUpperCase() ||
    fullTripSegments[0]?.departureAirport?.trim().toUpperCase() ||
    args.userFacingLegs[0]?.departureAirport?.trim().toUpperCase() ||
    null;
  const firstVisibleLeg = args.userFacingLegs[0];
  const lastVisibleLeg = args.userFacingLegs.at(-1);
  const lastTripSegment = fullTripSegments.at(-1);
  const hasTerminalReturnToBase = Boolean(
    rotationBase &&
      (lastTripSegment?.arrivalAirport?.trim().toUpperCase() === rotationBase ||
        lastVisibleLeg?.arrivalAirport?.trim().toUpperCase() === rotationBase),
  );
  const startsAwayFromBase = Boolean(
    rotationBase &&
      fullTripSegments[0]?.departureAirport?.trim().toUpperCase() !== rotationBase,
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

function detectDeadheadReason(args: {
  sourceText?: string | null;
  confirmationCode?: string | null;
  destination?: string | null;
  rotationBase?: string | null;
}) {
  const sourceText = args.sourceText ?? "";
  const marker = detectDeadheadMarker(sourceText);
  const returnsToBase =
    Boolean(args.rotationBase) &&
    (args.destination ?? "").trim().toUpperCase() === (args.rotationBase ?? "").trim().toUpperCase();
  if (args.confirmationCode && returnsToBase) {
    return "confirmation_code_and_return_to_base" as const;
  }
  if (args.confirmationCode) {
    return "confirmation_code" as const;
  }
  if (marker === "D") {
    return "leading_D_marker" as const;
  }
  if (marker === "O") {
    return "leading_O_marker" as const;
  }
  return null;
}

function extractConfirmationCode(value?: string | null) {
  if (!value) {
    return undefined;
  }
  return value.match(/Confirmation\s*#\s*([A-Z0-9]+)/i)?.[1]?.toUpperCase();
}

function detectDeadheadMarker(value?: string | null) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (/^(?:O)\s+(?:[A-Z0-9]{1,3})?\d{2,4}\b/i.test(normalized) || /\bO\s+(?:[A-Z0-9]{1,3})?\d{2,4}\b/i.test(normalized)) {
    return "O" as const;
  }
  if (/^(?:D)\s+(?:[A-Z0-9]{1,3})?\d{2,4}\b/i.test(normalized) || /\bD\s+(?:[A-Z0-9]{1,3})?\d{2,4}\b/i.test(normalized)) {
    return "D" as const;
  }
  return null;
}

export function extractDeadheadAnnotationsFromScreenshotEvidence(args: {
  userFacingLegs: RotationChainLeg[];
  discardedFragments?: Array<RotationChainLeg | RotationChainCandidate>;
  unmatchedCandidates?: Array<RotationChainLeg | RotationChainCandidate>;
  builderInputCandidates?: Array<RotationChainLeg | RotationChainCandidate>;
  allTripSegments?: Array<RotationChainLeg | RotationChainCandidate>;
  rotationBase?: string | null;
}) {
  const candidateGroups: Array<{
    source: ScreenshotDeadheadAnnotation["source"];
    candidates: Array<RotationChainLeg | RotationChainCandidate>;
  }> = [
    { source: "candidateEvidence", candidates: args.allTripSegments ?? [] },
    { source: "discardedFragment", candidates: args.discardedFragments ?? [] },
    { source: "unmatchedCandidate", candidates: args.unmatchedCandidates ?? [] },
    { source: "candidateEvidence", candidates: args.builderInputCandidates ?? [] },
  ];

  const bestByKey = new Map<string, ScreenshotDeadheadAnnotation & { score: number }>();

  for (const group of candidateGroups) {
    for (const candidate of group.candidates) {
      const key = buildStableLegKey(candidate);
      const confirmationCode = candidate.confirmationCode ?? extractConfirmationCode(candidate.sourceText) ?? extractConfirmationCode("rawSourceLine" in candidate ? candidate.rawSourceLine : undefined);
      const marker = detectDeadheadMarker(`${candidate.sourceText ?? ""} ${"rawSourceLine" in candidate ? candidate.rawSourceLine ?? "" : ""}`.trim());
      const reason = detectDeadheadReason({
        sourceText: `${candidate.sourceText ?? ""} ${"rawSourceLine" in candidate ? candidate.rawSourceLine ?? "" : ""}`.trim(),
        confirmationCode,
        destination: candidate.arrivalAirport,
        rotationBase: args.rotationBase,
      });
      if (!reason) {
        continue;
      }
      const sourceScore =
        group.source === "discardedFragment" ? 3 : group.source === "unmatchedCandidate" ? 2 : 1;
      const qualityScore =
        sourceScore * 10 +
        (confirmationCode ? 5 : 0) +
        (candidate.scheduledIn ? 2 : 0) +
        (candidate.scheduledBlock ? 2 : 0) +
        (resolveLegDateToken(candidate) ? 1 : 0);
      const annotation = {
        cityPair: `${candidate.departureAirport ?? "?"}-${candidate.arrivalAirport ?? "?"}`,
        origin: candidate.departureAirport ?? "?",
        destination: candidate.arrivalAirport ?? "?",
        carrier: normalizeCarrierFlight(candidate.carrier, candidate.flightNumber).carrier || null,
        flightNumber: normalizeCarrierFlight(candidate.carrier, candidate.flightNumber).flightNumber || null,
        scheduledOut: candidate.scheduledOut ?? null,
        scheduledIn: candidate.scheduledIn ?? null,
        confirmationCode: confirmationCode ?? null,
        source: group.source,
        reason,
        marker,
        score: qualityScore,
      };
      const existing = bestByKey.get(key);
      if (!existing || annotation.score > existing.score) {
        bestByKey.set(key, annotation);
      }
    }
  }

  return Array.from(bestByKey.values())
    .sort((left, right) => {
      const leftMoment = buildComparableLegMoment(resolveLegDateToken(left as RotationChainLeg), left.scheduledOut) ?? Number.POSITIVE_INFINITY;
      const rightMoment = buildComparableLegMoment(resolveLegDateToken(right as RotationChainLeg), right.scheduledOut) ?? Number.POSITIVE_INFINITY;
      if (leftMoment !== rightMoment) {
        return leftMoment - rightMoment;
      }
      return left.cityPair.localeCompare(right.cityPair);
    })
    .map(({ score: _score, ...annotation }) => annotation);
}
