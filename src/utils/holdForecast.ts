export type HoldPlannerPilot = {
  employeeNumber: string;
  name: string;
  seniorityNumber: number;
  currentCategoryKey: string;
  currentCategoryCode: string;
  pilotHireDate: string;
  scheduledRetireDate: string;
};

export type HoldPlannerCategory = {
  key: string;
  base: string;
  fleet: string;
  seat: string;
  pilotCount: number;
  mostJuniorNumber: number;
};

export type HoldPlannerAeEntry = {
  awardCategory: string;
  awards: number;
  mostJuniorAwardNumber: number | null;
};

export type HoldPlannerAeHistoryPoint = {
  monthKey: string;
  awards: number;
  highestSeniorityNumber: number | null;
};

export type HoldPlannerAeHistoryRecord = {
  awardCategory: string;
  points: HoldPlannerAeHistoryPoint[];
};

export type HoldPlannerAeTrend = {
  awardCategory: string;
  lineMovement: number | null;
  awardsDelta: number | null;
};

export type HoldPlannerCategoryTrend = {
  key: string;
  pilotCountDelta: number | null;
};

export type CurrentAeStatus =
  | "Can Hold This AE"
  | "Senior to You This AE"
  | "Not Awarded This AE"
  | "No Recent AE Signal";

export type ForecastConfidence = "High" | "Medium" | "Low";

export type CurrentAeAnalysisResult = {
  status: CurrentAeStatus;
  awardedInLatestAe: boolean;
  awardLine: number | null;
  recentSignalCount: number;
  recentAwardsAverage: number | null;
  explanation: string[];
};

export type HoldForecastResult = {
  status: "Already Holding" | "Can Generally Hold" | "Likely Hold Soon" | "Building Toward It";
  holdWindow: "Now" | "3 months" | "6 months" | "12 months" | "12+ months";
  confidence: ForecastConfidence;
  currentListLine: number;
  blendedLine: number;
  currentGap: number;
  projectedRank: number | null;
  projectedLine: number | null;
  estimatedDateLabel: string | null;
  evidenceSummary: string[];
  explanation: string[];
  aeDataSparse: boolean;
  differsFromAe: boolean;
};

function parseDeltaDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, monthCode, year] = match;
  const monthMap: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };

  return new Date(Number(year), monthMap[monthCode] ?? 0, Number(day));
}

function parseMonthKey(value: string) {
  const normalized = value.toUpperCase();
  let match = normalized.match(/(\d{2})([A-Z]{3})(\d{4})/);
  if (match) {
    return parseDeltaDate(`${match[1]}${match[2]}${match[3]}`);
  }

  match = normalized.match(/([A-Z]{3,})\s*[_-]?(\d{4})/);
  if (match) {
    const monthCode = match[1].slice(0, 3);
    return parseDeltaDate(`01${monthCode}${match[2]}`);
  }

  return null;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null) {
  return value == null ? null : Math.round(value);
}

function buildRecentAeSignals(history: HoldPlannerAeHistoryRecord | null) {
  if (!history) {
    return {
      points: [] as HoldPlannerAeHistoryPoint[],
      recentLines: [] as number[],
      recentAwards: [] as number[],
      averageLine: null as number | null,
      averageAwards: null as number | null,
      averageLineDrift: null as number | null,
    };
  }

  const points = [...history.points]
    .filter((point) => point.highestSeniorityNumber != null || point.awards > 0)
    .sort((left, right) => {
      const leftDate = parseMonthKey(left.monthKey)?.getTime() ?? 0;
      const rightDate = parseMonthKey(right.monthKey)?.getTime() ?? 0;
      return leftDate - rightDate;
    })
    .slice(-4);

  const recentLines = points
    .map((point) => point.highestSeniorityNumber)
    .filter((value): value is number => value != null);
  const recentAwards = points.map((point) => point.awards).filter((value) => value > 0);

  const lineDrifts: number[] = [];
  for (let index = 1; index < recentLines.length; index += 1) {
    lineDrifts.push(recentLines[index] - recentLines[index - 1]);
  }

  return {
    points,
    recentLines,
    recentAwards,
    averageLine: round(average(recentLines)),
    averageAwards: average(recentAwards),
    averageLineDrift: average(lineDrifts),
  };
}

export function analyzeCurrentAE({
  pilot,
  target,
  latestAe,
  aeHistory,
}: {
  pilot: HoldPlannerPilot | null;
  target: HoldPlannerCategory | null;
  latestAe: HoldPlannerAeEntry | null;
  aeHistory: HoldPlannerAeHistoryRecord | null;
}): CurrentAeAnalysisResult | null {
  if (!target) {
    return null;
  }

  const recentSignals = buildRecentAeSignals(aeHistory);
  const recentSignalCount = recentSignals.points.length;
  const recentAwardsAverage = recentSignals.averageAwards;

  if (!latestAe || latestAe.awards <= 0 || latestAe.mostJuniorAwardNumber == null) {
    const status: CurrentAeStatus =
      recentSignalCount > 0 ? "Not Awarded This AE" : "No Recent AE Signal";
    const explanation = [
      recentSignalCount > 0
        ? "Latest AE did not award this category."
        : "No recent AE signal is available for this category.",
      pilot && pilot.currentCategoryKey === target.key
        ? "You may still generally hold this seat already. AE visibility and general holdability are different."
        : "This tool only answers the latest award, not general holdability.",
    ];

    return {
      status,
      awardedInLatestAe: false,
      awardLine: null,
      recentSignalCount,
      recentAwardsAverage,
      explanation,
    };
  }

  if (!pilot) {
    return {
      status: "No Recent AE Signal",
      awardedInLatestAe: true,
      awardLine: latestAe.mostJuniorAwardNumber,
      recentSignalCount,
      recentAwardsAverage,
      explanation: [
        "Enter an employee number to compare this pilot against the current AE line.",
      ],
    };
  }

  if (pilot.seniorityNumber <= latestAe.mostJuniorAwardNumber) {
    return {
      status: "Can Hold This AE",
      awardedInLatestAe: true,
      awardLine: latestAe.mostJuniorAwardNumber,
      recentSignalCount,
      recentAwardsAverage,
      explanation: [
        `Latest AE awarded this category through #${latestAe.mostJuniorAwardNumber}.`,
        "Your number is senior enough to hold this specific award if it were available to you.",
      ],
    };
  }

    return {
      status: "Senior to You This AE",
      awardedInLatestAe: true,
      awardLine: latestAe.mostJuniorAwardNumber,
      recentSignalCount,
      recentAwardsAverage,
      explanation: [
        `Latest AE JR pilot was #${latestAe.mostJuniorAwardNumber}.`,
        `You are ${pilot.seniorityNumber - latestAe.mostJuniorAwardNumber} numbers junior to this specific AE line.`,
      ],
    };
  }

export function forecastHoldability({
  pilot,
  target,
  latestAe,
  aeHistory,
  categoryTrend,
  pilots,
  growthRate,
}: {
  pilot: HoldPlannerPilot | null;
  target: HoldPlannerCategory | null;
  latestAe: HoldPlannerAeEntry | null;
  aeHistory: HoldPlannerAeHistoryRecord | null;
  categoryTrend: HoldPlannerCategoryTrend | null;
  pilots: readonly HoldPlannerPilot[];
  growthRate: number;
}): HoldForecastResult | null {
  if (!pilot || !target) {
    return null;
  }

  const currentListLine = target.mostJuniorNumber;
  const recentSignals = buildRecentAeSignals(aeHistory);
  const latestAeLine = latestAe?.mostJuniorAwardNumber ?? null;

  const blendedSources = [
    { value: currentListLine, weight: 0.5 },
    ...(latestAeLine != null ? [{ value: latestAeLine, weight: 0.3 }] : []),
    ...(recentSignals.averageLine != null ? [{ value: recentSignals.averageLine, weight: 0.2 }] : []),
  ];
  const weightedLine =
    blendedSources.reduce((sum, entry) => sum + entry.value * entry.weight, 0) /
    blendedSources.reduce((sum, entry) => sum + entry.weight, 0);
  const blendedLine = Math.max(currentListLine, Math.round(weightedLine || currentListLine));

  const currentGap = Math.max(0, pilot.seniorityNumber - blendedLine);
  const aeDataSparse = latestAeLine == null && recentSignals.points.length === 0;

  if (pilot.currentCategoryKey === target.key) {
    return {
      status: "Already Holding",
      holdWindow: "Now",
      confidence: "High",
      currentListLine,
      blendedLine,
      currentGap: 0,
      projectedRank: pilot.seniorityNumber,
      projectedLine: blendedLine,
      estimatedDateLabel: "Now",
      evidenceSummary: [
        "You are already in this category today.",
        `Current JR pilot sits at #${currentListLine}.`,
      ],
      explanation: [
        "You currently hold this category. AE visibility and general holdability are different.",
      ],
      aeDataSparse,
      differsFromAe: latestAeLine == null,
    };
  }

  if (pilot.seniorityNumber <= blendedLine) {
    return {
      status: "Can Generally Hold",
      holdWindow: "Now",
      confidence: latestAeLine != null ? "High" : "Medium",
      currentListLine,
      blendedLine,
      currentGap: 0,
      projectedRank: pilot.seniorityNumber,
      projectedLine: blendedLine,
      estimatedDateLabel: "Now",
      evidenceSummary: [
        `Current JR pilot is #${currentListLine}.`,
        latestAeLine != null
          ? `Latest AE JR pilot is #${latestAeLine}.`
          : "Latest AE is missing, so forecast leans more heavily on current-list data.",
      ],
      explanation: [
        aeDataSparse
          ? "Absence of AE evidence is not evidence you cannot hold it. Forecast uses broader list and trend data."
          : "Forecast and current list both say this seat is generally holdable now.",
      ],
      aeDataSparse,
      differsFromAe: latestAeLine == null,
    };
  }

  const lineDriftSignals = [
    ...(recentSignals.averageLineDrift != null ? [recentSignals.averageLineDrift] : []),
    ...(categoryTrend?.pilotCountDelta != null ? [categoryTrend.pilotCountDelta] : []),
  ];
  const lineDriftPerQuarter = average(lineDriftSignals) ?? 0;
  const retireDate = parseDeltaDate(pilot.scheduledRetireDate);
  const currentTotalPilots = Math.max(1, pilots.length);
  const now = new Date();
  const checkpoints: {
    date: Date;
    projectedRank: number;
    projectedLine: number;
    monthsAhead: number;
  }[] = [];

  for (let monthsAhead = 3; monthsAhead <= 24; monthsAhead += 3) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() + monthsAhead, now.getDate());
    if (retireDate && targetDate > retireDate) {
      break;
    }

    const retirementsAhead = pilots.filter((entry) => {
      const scheduledRetire = parseDeltaDate(entry.scheduledRetireDate);
      return (
        scheduledRetire != null &&
        scheduledRetire <= targetDate &&
        entry.seniorityNumber < pilot.seniorityNumber
      );
    }).length;

    const yearsElapsed = monthsAhead / 12;
    const projectedRank = Math.max(1, pilot.seniorityNumber - retirementsAhead);
    const projectedTotal = Math.max(
      projectedRank,
      Math.round(currentTotalPilots * Math.pow(1 + growthRate, yearsElapsed))
    );
    const projectedLine = Math.max(
      currentListLine,
      Math.round(blendedLine + lineDriftPerQuarter * (monthsAhead / 3))
    );

    checkpoints.push({
      date: targetDate,
      projectedRank,
      projectedLine: Math.min(projectedTotal, projectedLine),
      monthsAhead,
    });
  }

  const firstHoldPoint =
    checkpoints.find((point) => point.projectedRank <= point.projectedLine) ?? null;

  const holdWindow: HoldForecastResult["holdWindow"] = firstHoldPoint
    ? firstHoldPoint.monthsAhead <= 3
      ? "3 months"
      : firstHoldPoint.monthsAhead <= 6
        ? "6 months"
        : firstHoldPoint.monthsAhead <= 12
          ? "12 months"
          : "12+ months"
    : "12+ months";

  const confidenceSignalCount =
    1 +
    (latestAeLine != null ? 1 : 0) +
    (recentSignals.points.length > 1 ? 1 : 0) +
    (categoryTrend?.pilotCountDelta != null ? 1 : 0);
  const confidence: ForecastConfidence =
    confidenceSignalCount >= 4 ? "High" : confidenceSignalCount >= 2 ? "Medium" : "Low";

  const estimatedDateLabel = firstHoldPoint
    ? firstHoldPoint.date.toLocaleString("en-US", { month: "short", year: "numeric" })
    : null;

  const evidenceSummary = [
    `Current JR pilot is #${currentListLine}.`,
    latestAeLine != null ? `Latest AE JR pilot is #${latestAeLine}.` : "Latest AE JR pilot is missing for this seat.",
    recentSignals.averageLine != null
      ? `Recent AE history averages around #${recentSignals.averageLine}.`
      : "Recent AE history is sparse, so list data carries more weight.",
  ];

  const explanation = [
    latestAeLine == null
      ? "Latest AE did not award this category or the line is missing."
      : "Latest AE is only one tactical signal in the forecast.",
    "Forecast uses current seniority list, AE history, list growth, retirements, and movement trends.",
    firstHoldPoint
      ? `Blended evidence points to likely holdability around ${estimatedDateLabel}.`
      : "Blended evidence says this remains a longer-range target from today.",
  ];

  return {
    status:
      holdWindow === "3 months" || holdWindow === "6 months"
        ? "Likely Hold Soon"
        : "Building Toward It",
    holdWindow,
    confidence,
    currentListLine,
    blendedLine,
    currentGap,
    projectedRank: firstHoldPoint?.projectedRank ?? null,
    projectedLine: firstHoldPoint?.projectedLine ?? null,
    estimatedDateLabel,
    evidenceSummary,
    explanation,
    aeDataSparse,
    differsFromAe: latestAeLine == null || (latestAeLine < pilot.seniorityNumber && currentGap === 0),
  };
}
