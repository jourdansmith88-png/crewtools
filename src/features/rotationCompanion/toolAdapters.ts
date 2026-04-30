import type { RotationDashboardData } from "../../utils/rotationCompanion";

export type RotationCompanionContext = {
  rotationSummary: string;
  rotationNumber?: string;
  tripDates?: string;
  finalArrival?: string;
  layovers: string[];
  originalRotationText?: string;
  nextLegRoute?: string;
};

export type RotationToolAdapterResult = {
  title: string;
  detail: string;
};

export const rotationCompanionToolRegistry = {
  contractCopilot: {
    ui: "src/components/contractCopilot/ContractCopilotPanel.tsx",
    route: "server/routes/ai/contractCopilotRoute.ts",
    workflow: "src/ai/workflows/contractCopilot/runContractCopilot.ts",
  },
  rerouteCalculator: {
    route: "server/routes/ai/reroutePayAnalyzeRoute.ts",
    engine: "src/ai/tools/reroutePay/analyzeReroutePay.ts",
    parser: "src/ai/tools/reroutePay/parseMiCrewScreenshots.ts",
  },
  timecardPayParsing: {
    parser: "src/utils/deltaTimecardParser.ts",
    workflow: "src/ai/workflows/timecardParser/workflow.ts",
    payAudit: "src/utils/payAuditEngine.ts",
  },
  seniority: {
    data: "src/data/deltaSnapshot.ts",
    ui: "App.tsx (home + seniority views)",
  },
  ae: {
    engine: "src/utils/holdForecast.ts",
    data: "src/data/deltaSnapshot.ts",
    ui: "App.tsx (ae views)",
  },
} as const;

export function buildRotationCompanionContext(args: {
  dashboard: RotationDashboardData | null;
  rawRotationText: string;
}): RotationCompanionContext | null {
  const { dashboard, rawRotationText } = args;
  if (!dashboard) {
    return null;
  }
  const nextLegRoute = dashboard.nextLeg ? `${dashboard.nextLeg.origin}-${dashboard.nextLeg.destination}` : undefined;
  return {
    rotationSummary: [
      `Rotation ${dashboard.snapshot.rotationNumber}`,
      dashboard.snapshot.tripDates,
      `${dashboard.snapshot.legCount} legs`,
      `layovers ${dashboard.snapshot.layoverCities.join(", ") || "TBD"}`,
      `final arrival ${dashboard.snapshot.finalArrival}`,
    ].join(" • "),
    rotationNumber: dashboard.snapshot.rotationNumber,
    tripDates: dashboard.snapshot.tripDates,
    finalArrival: dashboard.snapshot.finalArrival,
    layovers: dashboard.snapshot.layoverCities,
    originalRotationText: rawRotationText.trim() || undefined,
    nextLegRoute,
  };
}

export function buildRerouteCalculatorAdapter(context: RotationCompanionContext): {
  originalRotationText?: string;
  changedRotationText?: string;
  description: string;
  toolBanner: RotationToolAdapterResult;
} {
  const description = [
    `Loaded rotation context: ${context.rotationSummary}.`,
    context.nextLegRoute ? `Next scheduled leg: ${context.nextLegRoute}.` : null,
    "Paste the reroute, reassignment, or changed segment details below to calculate Section 23 L impact.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    originalRotationText: context.originalRotationText,
    changedRotationText: undefined,
    description,
    toolBanner: {
      title: "Rotation context loaded into Reroute Pay Calculator",
      detail: description,
    },
  };
}

export function buildPayImpactAdapter(context: RotationCompanionContext): {
  toolBanner: RotationToolAdapterResult;
} {
  return {
    toolBanner: {
      title: "Rotation context available for Pay Tools",
      detail:
        `Using ${context.rotationSummary}. The Delta timecard parser and pay audit stay unchanged; add the posted timecard text when you are ready to compare company pay against the trip.`,
    },
  };
}

export function buildContractCopilotAdapter(context: RotationCompanionContext): {
  starterQuestion: string;
  toolBanner: RotationToolAdapterResult;
} {
  const starterQuestion = [
    `I loaded rotation ${context.rotationNumber ?? "this trip"} (${context.tripDates ?? "current dates"}).`,
    context.nextLegRoute ? `The next relevant leg is ${context.nextLegRoute}.` : "",
    `What contract sections should I check if something changes on this rotation?`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    starterQuestion,
    toolBanner: {
      title: "Rotation context available for Contract Copilot",
      detail:
        `Using ${context.rotationSummary}. The contract workflow is unchanged; this just gives it a trip-aware starting question.`,
    },
  };
}
