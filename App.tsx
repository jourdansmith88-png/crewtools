import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { deltaCharts as embeddedDeltaCharts } from "./src/data/deltaCharts";
import { deltaSnapshot } from "./src/data/deltaSnapshot";
import {
  annualTakeHomeRate,
  definedContributionRate,
  payScales,
  payScenarioOptions,
  profitSharingRate,
  profitSharingTakeHomeRate,
  resolvePayScenario,
} from "./src/data/payScales";
import {
  computePayAudit,
  computeTripHealth,
  formatCurrency,
  formatPercent,
} from "./src/utils/calculators";

const embeddedChartData = embeddedDeltaCharts as unknown as DeltaChartsData;

type TabKey = "home" | "schedule" | "pay" | "seniority" | "ae";
type SeatFilter = "All" | "Captain" | "First Officer";
type ChartStartMode = "hire" | "today";
type HoldLabel = "Current category" | "Can hold" | "Near the line" | "Cannot hold" | "No pilot";
type AeReachLabel =
  | "Award went junior to you"
  | "Close / no clear line"
  | "Award stayed senior"
  | "No line yet"
  | "No pilot";

type CategoryEntry = {
  key: string;
  base: string;
  fleet: string;
  seat: string;
  pilotCount: number;
  mostSeniorNumber: number;
  middleSeniorityNumber: number | null;
  mostJuniorNumber: number;
};

type AeEntry = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  awards: number;
  bypassAwards: number;
  mostSeniorAwardNumber: number | null;
  middleAwardNumber: number | null;
  mostJuniorAwardNumber: number | null;
};
type AeHistoryPoint = {
  sourceFile: string;
  monthKey: string;
  awards: number;
  highestSeniorityNumber: number | null;
};
type AeHistoryRecord = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  points: AeHistoryPoint[];
};
type AeTrendEntry = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  latestAwards: number;
  previousAwards: number | null;
  awardsDelta: number | null;
  latestJuniorNumber: number | null;
  previousJuniorNumber: number | null;
  lineMovement: number | null;
};
type LatestAeAwardRow = {
  awardCategory: string;
  base: string;
  fleet: string;
  seat: string;
  employeeNumber: string;
  name: string;
  seniorityNumber: number;
  previousCategory: string;
  bypassAward: boolean;
  outOfSequence: boolean;
  projectedTrainingMonth: string | null;
  payProtectionDate: string | null;
  scheduledRetireDate: string | null;
  sourceFile: string;
};
type LatestCategoryAssignment = {
  employeeNumber: string;
  name: string;
  seniorityNumber: number;
  base: string;
  fleet: string;
  seat: string;
  categoryKey: string;
  awardCategory: string;
  scheduledRetireDate: string | null;
};
type AeDetailSelection = {
  awardCategory: string;
  seat: string;
};
type AeMovementSummary = {
  aeIn: number;
  aeOut: number;
  net: number;
};
type AeResidualSummary = {
  categoryDelta: number | null;
  aeNet: number;
  residual: number | null;
};
type HoldEstimate = {
  growthRate: number;
  targetLabel: string;
  currentJuniorLine: number;
  currentGap: number;
  firstHoldPoint: {
    label: string;
    timeMs: number;
    projectedRank: number;
    projectedJuniorLine: number;
  } | null;
};

type PilotRecord = {
  employeeNumber: string;
  name: string;
  seniorityNumber: number;
  currentCategoryCode: string;
  currentCategoryKey: string;
  pilotHireDate: string;
  scheduledRetireDate: string;
  currentCategoryRank?: number | null;
  currentCategoryTotal?: number | null;
};
type BaseEntry = {
  base: string;
  isCarveout?: boolean;
  categories: number;
  pilots: number;
  instructors: number;
};
type PilotHistoryPoint = {
  sourceFile: string;
  monthKey: string;
  seniorityNumber: number;
  totalPilots: number;
  systemPercent: number | null;
  categoryCode: string;
};
type PilotHistoryRecord = {
  employeeNumber: string;
  name: string;
  points: PilotHistoryPoint[];
};
type MonthlyPilotCount = {
  sourceFile?: string;
  monthKey: string;
  pilotCount: number;
};
type DeltaChartsData = {
  generatedAt: string;
  monthlyPilotCounts: readonly MonthlyPilotCount[];
  pilotHistoryByEmployee: readonly PilotHistoryRecord[];
  pilotHistoryShardBaseUrl?: string;
};
type ChartPoint = {
  label: string;
  value: number;
  valueLabel: string;
  tone: "past" | "future";
  timeMs?: number;
  referenceOnePercent?: number | null;
  referenceTwoPercent?: number | null;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "seniority", label: "Seniority" },
  { key: "ae", label: "AE" },
  { key: "schedule", label: "Schedule" },
  { key: "pay", label: "Pay" },
];

const seatFilters: SeatFilter[] = ["All", "Captain", "First Officer"];
const growthRates = Array.from({ length: 6 }, (_, index) => ({
  label: `${index}%`,
  value: index / 100,
}));
const forecastGrowthRates = Array.from({ length: 5 }, (_, index) => ({
  label: `${index + 1}%`,
  value: (index + 1) / 100,
}));
const chartStartModes: { label: string; value: ChartStartMode }[] = [
  { label: "Since Hire Date", value: "hire" },
  { label: "From Today", value: "today" },
];
const bases = deltaSnapshot.operationalBases.map((entry) => entry.base);
const aeBaseFilters = ["All", ...bases];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [employeeNumberInput, setEmployeeNumberInput] = useState("");
  const [growthRate, setGrowthRate] = useState(0.01);
  const [growthMenuOpen, setGrowthMenuOpen] = useState(false);
  const [forecastGrowthRate, setForecastGrowthRate] = useState(0.01);
  const [forecastGrowthMenuOpen, setForecastGrowthMenuOpen] = useState(false);
  const [payScenarioMenuOpen, setPayScenarioMenuOpen] = useState(false);
  const [selectedAeBaseFilter, setSelectedAeBaseFilter] = useState("All");
  const [selectedAeFleetFilter, setSelectedAeFleetFilter] = useState("All");
  const [selectedCategoryBaseFilter, setSelectedCategoryBaseFilter] = useState("All");
  const [chartStartMode, setChartStartMode] = useState<ChartStartMode>("hire");
  const [selectedPayScenarioCode, setSelectedPayScenarioCode] = useState("");
  const [monthlyCreditHours, setMonthlyCreditHours] = useState(75);
  const [whatIfSeat, setWhatIfSeat] = useState<Exclude<SeatFilter, "All">>("Captain");
  const [selectedWhatIfFleet, setSelectedWhatIfFleet] = useState("");
  const [selectedWhatIfBase, setSelectedWhatIfBase] = useState("");
  const [selectedAeDetailCategory, setSelectedAeDetailCategory] = useState<AeDetailSelection | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [aeSearch, setAeSearch] = useState("");
  const [categorySeatFilter, setCategorySeatFilter] = useState<SeatFilter>("All");
  const [aeSeatFilter, setAeSeatFilter] = useState<SeatFilter>("All");

  const [blockHours, setBlockHours] = useState("18");
  const [dutyHours, setDutyHours] = useState("31");
  const [layoverHours, setLayoverHours] = useState("11");
  const [legs, setLegs] = useState("5");

  const [hourlyRate, setHourlyRate] = useState("243");
  const [creditedHours, setCreditedHours] = useState("82");
  const [premiumHours, setPremiumHours] = useState("7");
  const [perDiemDays, setPerDiemDays] = useState("12");
  const [missedBreakPay, setMissedBreakPay] = useState("350");
  const [pilotHistoryCache, setPilotHistoryCache] = useState<Record<string, PilotHistoryRecord>>({});
  const [loadedPilotHistoryShards, setLoadedPilotHistoryShards] = useState<Record<string, true>>(
    {}
  );
  const scrollRef = useRef<ScrollView | null>(null);
  const [whatIfSectionY, setWhatIfSectionY] = useState(0);

  const currentPilot = useMemo(
    () => findPilotByEmployeeNumber(deltaSnapshot.pilotDirectory, employeeNumberInput),
    [employeeNumberInput]
  );

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !currentPilot ||
      !embeddedChartData.pilotHistoryShardBaseUrl
    ) {
      return;
    }

    const normalizedEmployeeNumber = normalizeDigits(currentPilot.employeeNumber);
    const shardKey = buildPilotHistoryShardKey(normalizedEmployeeNumber);
    if (loadedPilotHistoryShards[shardKey]) {
      return;
    }

    let cancelled = false;

    fetch(`${embeddedChartData.pilotHistoryShardBaseUrl}/${shardKey}.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load pilot history shard: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          const shardEntries = data as Record<string, PilotHistoryRecord>;
          setPilotHistoryCache((current) => ({ ...current, ...shardEntries }));
          setLoadedPilotHistoryShards((current) => ({ ...current, [shardKey]: true }));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [currentPilot, loadedPilotHistoryShards]);

  const userSeniorityNumber = currentPilot?.seniorityNumber ?? 0;
  const currentCategoryKey = currentPilot?.currentCategoryKey ?? null;

  const tripHealth = useMemo(
    () =>
      computeTripHealth(
        Number(blockHours) || 0,
        Number(dutyHours) || 0,
        Number(layoverHours) || 0,
        Number(legs) || 0
      ),
    [blockHours, dutyHours, layoverHours, legs]
  );

  const payAudit = useMemo(
    () =>
      computePayAudit(
        Number(hourlyRate) || 0,
        Number(creditedHours) || 0,
        Number(premiumHours) || 0,
        Number(perDiemDays) || 0,
        Number(missedBreakPay) || 0
      ),
    [hourlyRate, creditedHours, premiumHours, perDiemDays, missedBreakPay]
  );

  const filteredCategories = useMemo(
    () =>
      deltaSnapshot.categories.filter((entry) => {
        const matchesBase =
          selectedCategoryBaseFilter === "All" || entry.base === selectedCategoryBaseFilter;
        const matchesSeat =
          categorySeatFilter === "All" || entry.seat === categorySeatFilter;
        const query = categorySearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query) ||
          entry.key.toLowerCase().includes(query);
        return matchesBase && matchesSeat && matchesQuery;
      }),
    [selectedCategoryBaseFilter, categorySearch, categorySeatFilter]
  );

  const categoryTrendMap = useMemo(
    () => new Map(deltaSnapshot.categoryTrends.map((entry) => [entry.key, entry])),
    []
  );

  const groupedCategoryTables = useMemo(
    () =>
      bases
        .map((base) => ({
          base,
          summary: buildBaseCategorySummary(
            filteredCategories.filter((entry) => entry.base === base),
            categoryTrendMap
          ),
          rows: filteredCategories
            .filter((entry) => entry.base === base)
            .sort((left, right) => {
              const seatOrder =
                (left.seat === "Captain" ? 0 : 1) - (right.seat === "Captain" ? 0 : 1);
              if (seatOrder !== 0) {
                return seatOrder;
              }
              return left.fleet.localeCompare(right.fleet);
            }),
        }))
        .filter((group) => group.rows.length > 0),
    [filteredCategories, categoryTrendMap]
  );

  const filteredSeniorityAe = useMemo(
    () =>
      deltaSnapshot.aeOpportunities.filter((entry) => {
        const matchesBase =
          selectedCategoryBaseFilter === "All" || entry.base === selectedCategoryBaseFilter;
        const matchesSeat = categorySeatFilter === "All" || entry.seat === categorySeatFilter;
        const query = categorySearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query) ||
          entry.awardCategory.toLowerCase().includes(query);
        return matchesBase && matchesSeat && matchesQuery;
      }),
    [selectedCategoryBaseFilter, categorySeatFilter, categorySearch]
  );

  const groupedSeniorityAeTables = useMemo(
    () =>
      bases
        .map((base) => ({
          base,
          rows: filteredSeniorityAe
            .filter((entry) => entry.base === base)
            .sort((left, right) => {
              const seatOrder =
                (left.seat === "Captain" ? 0 : 1) - (right.seat === "Captain" ? 0 : 1);
              if (seatOrder !== 0) {
                return seatOrder;
              }
              return left.fleet.localeCompare(right.fleet);
            }),
        }))
        .filter((group) => group.rows.length > 0),
    [filteredSeniorityAe]
  );

  const filteredAe = useMemo(
    () =>
      deltaSnapshot.aeOpportunities.filter((entry) => {
        const matchesBase =
          selectedAeBaseFilter === "All" || entry.base === selectedAeBaseFilter;
        const matchesFleet =
          selectedAeFleetFilter === "All" || entry.fleet === selectedAeFleetFilter;
        const matchesSeat = aeSeatFilter === "All" || entry.seat === aeSeatFilter;
        const query = aeSearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query) ||
          entry.awardCategory.toLowerCase().includes(query);
        return matchesBase && matchesFleet && matchesSeat && matchesQuery;
      }),
    [selectedAeBaseFilter, selectedAeFleetFilter, aeSearch, aeSeatFilter]
  );

  const aeFleetOptions = useMemo(
    () =>
      Array.from(
        new Set(
          deltaSnapshot.aeOpportunities
            .filter((entry) => aeSeatFilter === "All" || entry.seat === aeSeatFilter)
            .map((entry) => entry.fleet)
        )
      ).sort(),
    [aeSeatFilter]
  );

  const aeBaseOptions = useMemo(
    () =>
      Array.from(
        new Set(
          deltaSnapshot.aeOpportunities
            .filter((entry) => {
              const matchesSeat = aeSeatFilter === "All" || entry.seat === aeSeatFilter;
              const matchesFleet =
                selectedAeFleetFilter === "All" || entry.fleet === selectedAeFleetFilter;
              return matchesSeat && matchesFleet;
            })
            .map((entry) => entry.base)
        )
      ).sort(),
    [aeSeatFilter, selectedAeFleetFilter]
  );

  useEffect(() => {
    if (
      selectedAeFleetFilter !== "All" &&
      !aeFleetOptions.some((fleet) => fleet === selectedAeFleetFilter)
    ) {
      setSelectedAeFleetFilter("All");
    }
  }, [selectedAeFleetFilter, aeFleetOptions]);

  useEffect(() => {
    if (
      selectedAeBaseFilter !== "All" &&
      !aeBaseOptions.some((base) => base === selectedAeBaseFilter)
    ) {
      setSelectedAeBaseFilter("All");
    }
  }, [selectedAeBaseFilter, aeBaseOptions]);

  const whatIfCategoryOptions = useMemo(
    () =>
      deltaSnapshot.categories
        .filter((entry) => {
          return entry.seat === whatIfSeat;
        })
        .sort((left, right) => {
          return (
            left.fleet.localeCompare(right.fleet) ||
            left.base.localeCompare(right.base)
          );
        }),
    [whatIfSeat]
  );

  const whatIfFleetOptions = useMemo(
    () => Array.from(new Set(whatIfCategoryOptions.map((entry) => entry.fleet))),
    [whatIfCategoryOptions]
  );

  const whatIfBaseOptions = useMemo(
    () =>
      Array.from(
        new Set(
          whatIfCategoryOptions
            .filter((entry) => entry.fleet === selectedWhatIfFleet)
            .map((entry) => entry.base)
        )
      ),
    [whatIfCategoryOptions, selectedWhatIfFleet]
  );

  useEffect(() => {
    if (!whatIfFleetOptions.length) {
      setSelectedWhatIfFleet("");
      return;
    }

    if (!whatIfFleetOptions.some((fleet) => fleet === selectedWhatIfFleet)) {
      setSelectedWhatIfFleet(whatIfFleetOptions[0]);
    }
  }, [selectedWhatIfFleet, whatIfFleetOptions]);

  useEffect(() => {
    if (!whatIfBaseOptions.length) {
      setSelectedWhatIfBase("");
      return;
    }

    if (!whatIfBaseOptions.some((base) => base === selectedWhatIfBase)) {
      setSelectedWhatIfBase(whatIfBaseOptions[0]);
    }
  }, [selectedWhatIfBase, whatIfBaseOptions]);

  const activeWhatIfCategory = useMemo(
    () =>
      whatIfCategoryOptions.find(
        (entry) =>
          entry.seat === whatIfSeat &&
          entry.fleet === selectedWhatIfFleet &&
          entry.base === selectedWhatIfBase
      ) ?? null,
    [whatIfCategoryOptions, whatIfSeat, selectedWhatIfFleet, selectedWhatIfBase]
  );

  const groupedAeTables = useMemo(
    () =>
      bases
        .map((base) => ({
          base,
          rows: filteredAe
            .filter((entry) => entry.base === base)
            .sort((left, right) => {
              const seatOrder =
                (left.seat === "Captain" ? 0 : 1) - (right.seat === "Captain" ? 0 : 1);
              if (seatOrder !== 0) {
                return seatOrder;
              }
              return left.fleet.localeCompare(right.fleet);
            }),
        }))
        .filter((group) => group.rows.length > 0),
    [filteredAe]
  );

  const latestAeAwardRows =
    (((deltaSnapshot as unknown as { latestAeAwards?: readonly LatestAeAwardRow[] }).latestAeAwards ??
      []) as readonly LatestAeAwardRow[]);
  const latestCategoryAssignments =
    (((deltaSnapshot as unknown as {
      latestCategoryAssignments?: readonly LatestCategoryAssignment[];
    }).latestCategoryAssignments ?? []) as readonly LatestCategoryAssignment[]);

  const activeAeAwardRows = useMemo(
    () =>
      selectedAeDetailCategory
        ? latestAeAwardRows.filter(
            (entry) =>
              entry.awardCategory === selectedAeDetailCategory.awardCategory &&
              entry.seat === selectedAeDetailCategory.seat
          )
        : [],
    [latestAeAwardRows, selectedAeDetailCategory]
  );

  const activeAeLeavingRows = useMemo(
    () =>
      selectedAeDetailCategory
        ? latestAeAwardRows
            .filter(
              (entry) =>
                entry.previousCategory === selectedAeDetailCategory.awardCategory
            )
            .sort((left, right) => left.seniorityNumber - right.seniorityNumber)
        : [],
    [latestAeAwardRows, selectedAeDetailCategory]
  );

  const activeCurrentCategoryList = useMemo(
    () =>
      selectedAeDetailCategory
        ? latestCategoryAssignments
            .filter(
              (entry) =>
                entry.categoryKey ===
                buildCategoryKeyFromAeCategory(selectedAeDetailCategory.awardCategory)
            )
            .sort((left, right) => left.seniorityNumber - right.seniorityNumber)
        : [],
    [latestCategoryAssignments, selectedAeDetailCategory]
  );

  const aeMovementByCategory = useMemo(() => {
    const movement = new Map<string, AeMovementSummary>();

    latestAeAwardRows.forEach((row) => {
      const current = movement.get(row.awardCategory) ?? { aeIn: 0, aeOut: 0, net: 0 };
      current.aeIn += 1;
      movement.set(row.awardCategory, current);

      if (row.previousCategory) {
        const previous = movement.get(row.previousCategory) ?? { aeIn: 0, aeOut: 0, net: 0 };
        previous.aeOut += 1;
        movement.set(row.previousCategory, previous);
      }
    });

    movement.forEach((entry) => {
      entry.net = entry.aeIn - entry.aeOut;
    });

    return movement;
  }, [latestAeAwardRows]);

  const aeMovementByBase = useMemo(() => {
    const movement = new Map<string, AeMovementSummary>();

    latestAeAwardRows.forEach((row) => {
      const incoming = movement.get(row.base) ?? { aeIn: 0, aeOut: 0, net: 0 };
      incoming.aeIn += 1;
      movement.set(row.base, incoming);

      const previousBase = row.previousCategory.split("-")[0] ?? "";
      if (previousBase) {
        const outgoing = movement.get(previousBase) ?? { aeIn: 0, aeOut: 0, net: 0 };
        outgoing.aeOut += 1;
        movement.set(previousBase, outgoing);
      }
    });

    movement.forEach((entry) => {
      entry.net = entry.aeIn - entry.aeOut;
    });

    return movement;
  }, [latestAeAwardRows]);

  const activeAeMovement = useMemo(
    () =>
      selectedAeDetailCategory
        ? aeMovementByCategory.get(selectedAeDetailCategory.awardCategory) ?? {
            aeIn: activeAeAwardRows.length,
            aeOut: 0,
            net: activeAeAwardRows.length,
          }
        : null,
    [activeAeAwardRows.length, aeMovementByCategory, selectedAeDetailCategory]
  );

  const aeResidualByCategory = useMemo(() => {
    const residuals = new Map<string, AeResidualSummary>();
    const trendLookup = categoryTrendMap as ReadonlyMap<
      string,
      { pilotCountDelta: number | null }
    >;

    aeMovementByCategory.forEach((movement, awardCategory) => {
      const trend = trendLookup.get(buildCategoryKeyFromAeCategory(awardCategory)) ?? null;
      const categoryDelta = trend?.pilotCountDelta ?? null;
      residuals.set(awardCategory, {
        categoryDelta,
        aeNet: movement.net,
        residual: categoryDelta != null ? categoryDelta - movement.net : null,
      });
    });

    return residuals;
  }, [aeMovementByCategory, categoryTrendMap]);

  const aeResidualByBase = useMemo(() => {
    const residuals = new Map<string, AeResidualSummary>();

    bases.forEach((base) => {
      const categoryDelta = deltaSnapshot.categoryTrends
        .filter((entry) => entry.base === base)
        .reduce((sum, entry) => sum + (entry.pilotCountDelta ?? 0), 0);
      const aeNet = aeMovementByBase.get(base)?.net ?? 0;
      residuals.set(base, {
        categoryDelta,
        aeNet,
        residual: categoryDelta - aeNet,
      });
    });

    return residuals;
  }, [aeMovementByBase]);

  const activeAeResidual = useMemo(
    () =>
      selectedAeDetailCategory
        ? aeResidualByCategory.get(selectedAeDetailCategory.awardCategory) ?? null
        : null,
    [aeResidualByCategory, selectedAeDetailCategory]
  );

  const holdSummary = useMemo(
    () => buildHoldSummary(deltaSnapshot.categories, userSeniorityNumber, currentCategoryKey),
    [userSeniorityNumber, currentCategoryKey]
  );

  const aeSummary = useMemo(
    () => buildAeSummary(deltaSnapshot.aeOpportunities, userSeniorityNumber),
    [userSeniorityNumber]
  );

  const careerProjection = useMemo(
    () =>
      currentPilot
        ? buildCareerProjection(
            currentPilot,
            deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
            growthRate,
            chartStartMode
          )
        : [],
    [currentPilot, growthRate, chartStartMode]
  );

  const whatIfEstimates = useMemo(
    () =>
      currentPilot && activeWhatIfCategory
        ? [0.01, 0.02].map((scenarioGrowthRate) =>
            buildCategoryHoldEstimate(
              currentPilot,
              activeWhatIfCategory,
              deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
              scenarioGrowthRate
            )
          )
        : [],
    [currentPilot, activeWhatIfCategory]
  );

  const pilotHistory = useMemo(() => {
    if (!currentPilot) {
      return null;
    }
    return pilotHistoryCache[normalizeDigits(currentPilot.employeeNumber)] ?? null;
  }, [currentPilot, pilotHistoryCache]);

  const seniorityPercentSeries = useMemo(() => {
    const allPoints =
      chartStartMode === "hire"
        ? careerProjection.map((point) => {
            const checkpointDate = point.timeMs != null ? new Date(point.timeMs) : null;
            const estimatedPast = checkpointDate != null
              ? buildEstimatedPastPoint(
                  currentPilot,
                  checkpointDate,
                  embeddedChartData.monthlyPilotCounts
                )
              : null;
            const isHistorical = checkpointDate != null && checkpointDate <= new Date();
            const historicalPoint =
              checkpointDate != null ? findHistoryPointAtOrBefore(pilotHistory, checkpointDate) : null;
            const actualValue =
              historicalPoint?.systemPercent ?? estimatedPast?.systemPercent ?? point.systemPercent;
            const value = isHistorical ? actualValue : point.systemPercent;
            const valueLabel = isHistorical ? `~${value}%` : `${point.systemPercent}%`;

            return {
              label: point.label,
              value,
              valueLabel,
              tone: isHistorical ? ("past" as const) : ("future" as const),
              timeMs: point.timeMs,
            };
          })
        : [
            ...(pilotHistory?.points
              .filter((point) => {
                const earliestDate = currentPilot
                  ? resolvePilotChartStartDate(currentPilot, pilotHistory, chartStartMode)
                  : null;
                if (!earliestDate) {
                  return false;
                }
                const pointDate = dateFromMonthKey(point.monthKey);
                return pointDate != null && pointDate >= earliestDate && pointDate <= new Date();
              })
              .map((point) => {
                const pointDate = dateFromMonthKey(point.monthKey);
                return {
                  label: shortenMonthLabel(point.monthKey),
                  value: point.systemPercent ?? 0,
                  valueLabel: point.systemPercent != null ? `${point.systemPercent}%` : "-",
                  tone: "past" as const,
                  timeMs: pointDate?.getTime(),
                };
              }) ?? []),
            ...careerProjection.map((point) => ({
              label: point.label,
              value: point.systemPercent,
              valueLabel: `${point.systemPercent}%`,
              tone: "future" as const,
              timeMs: point.timeMs,
            })),
          ];

    return allPoints.map((point) => ({
      ...point,
      referenceOnePercent:
        currentPilot && point.timeMs != null
          ? buildReferencePercentAtTime(
              currentPilot,
              deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
              0.01,
              chartStartMode,
              point.timeMs
            )
          : null,
      referenceTwoPercent:
        currentPilot && point.timeMs != null
          ? buildReferencePercentAtTime(
              currentPilot,
              deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
              0.02,
              chartStartMode,
              point.timeMs
            )
          : null,
    }));
  }, [pilotHistory, careerProjection, currentPilot, chartStartMode]);

  const totalPilotCountSeries = useMemo(() => {
    const earliestDate = resolveListChartStartDate(
      currentPilot,
      pilotHistory,
      chartStartMode,
      embeddedChartData.monthlyPilotCounts
    );
    const past: ChartPoint[] = embeddedChartData.monthlyPilotCounts
      .filter((point) => {
        if (!earliestDate) {
          return false;
        }
        const pointDate = dateFromMonthKey(point.monthKey);
        return pointDate != null && pointDate >= earliestDate && pointDate <= new Date();
      })
        .map((point) => ({
          label: shortenMonthLabel(point.monthKey),
          value: point.pilotCount,
          valueLabel: `${point.pilotCount}`,
          tone: "past",
          timeMs: dateFromMonthKey(point.monthKey)?.getTime(),
        }));

    const lastCount = past.at(-1)?.value ?? 0;
    const future = buildProjectedPilotCountSeries(
      lastCount,
      currentPilot?.scheduledRetireDate ?? null,
      forecastGrowthRate,
      chartStartMode
    );

    return [...past, ...future];
  }, [currentPilot, forecastGrowthRate, chartStartMode, pilotHistory]);

  const seniorityNumberSeries = useMemo(() => {
    if (chartStartMode === "hire") {
      return careerProjection.map((point) => {
        const checkpointDate = point.timeMs != null ? new Date(point.timeMs) : null;
        const estimatedPast =
          checkpointDate != null
            ? buildEstimatedPastPoint(
                currentPilot,
                checkpointDate,
                embeddedChartData.monthlyPilotCounts
              )
            : null;
        const historicalPoint =
          checkpointDate != null ? findHistoryPointAtOrBefore(pilotHistory, checkpointDate) : null;
        const isHistorical = checkpointDate != null && checkpointDate <= new Date();
        const actualValue =
          historicalPoint?.seniorityNumber ?? estimatedPast?.seniorityNumber ?? point.projectedRank;
        const value = isHistorical ? actualValue : point.projectedRank;
        const valueLabel = isHistorical ? `~#${value}` : `#${point.projectedRank}`;

        return {
          label: point.label,
          value,
          valueLabel,
          tone: isHistorical ? ("past" as const) : ("future" as const),
          timeMs: point.timeMs,
        };
      });
    }

    const earliestDate = currentPilot
      ? resolvePilotChartStartDate(currentPilot, pilotHistory, chartStartMode)
      : null;
    const past: ChartPoint[] =
      pilotHistory?.points
        .filter((point) => {
          if (!earliestDate) {
            return false;
          }
          const pointDate = dateFromMonthKey(point.monthKey);
          return pointDate != null && pointDate >= earliestDate && pointDate <= new Date();
        })
        .map((point) => ({
          label: shortenMonthLabel(point.monthKey),
          value: point.seniorityNumber,
          valueLabel: `#${point.seniorityNumber}`,
          tone: "past",
          timeMs: dateFromMonthKey(point.monthKey)?.getTime(),
        })) ?? [];

    const future: ChartPoint[] = careerProjection.map((point) => ({
      label: point.label,
      value: point.projectedRank,
      valueLabel: `#${point.projectedRank}`,
      tone: "future",
      timeMs: point.timeMs,
    }));

    return [...past, ...future];
  }, [pilotHistory, careerProjection, currentPilot, chartStartMode]);

  const visibleCategoryTrends = useMemo(
    () =>
      deltaSnapshot.categoryTrends.filter((entry) => {
        const matchesSeat =
          categorySeatFilter === "All" || entry.seat === categorySeatFilter;
        const query = categorySearch.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          entry.base.toLowerCase().includes(query) ||
          entry.fleet.toLowerCase().includes(query);
        return matchesSeat && matchesQuery;
      }),
    [categorySearch, categorySeatFilter]
  );

  const visibleAeTrends = useMemo(
    () =>
      (deltaSnapshot.aeTrends as unknown as readonly AeTrendEntry[]).filter(
        (entry) =>
          (selectedAeBaseFilter === "All" || entry.base === selectedAeBaseFilter) &&
          (selectedAeFleetFilter === "All" || entry.fleet === selectedAeFleetFilter) &&
          (aeSeatFilter === "All" || entry.seat === aeSeatFilter) &&
          (aeSearch.trim().length === 0 ||
            entry.base.toLowerCase().includes(aeSearch.trim().toLowerCase()) ||
            entry.fleet.toLowerCase().includes(aeSearch.trim().toLowerCase()) ||
            entry.awardCategory.toLowerCase().includes(aeSearch.trim().toLowerCase()))
      ),
    [selectedAeBaseFilter, selectedAeFleetFilter, aeSeatFilter, aeSearch]
  );

  const systemTotalPilots = deltaSnapshot.pilotDirectory.length;
  const systemPercent = currentPilot
    ? Math.round((currentPilot.seniorityNumber / Math.max(systemTotalPilots, 1)) * 100)
    : null;
  const currentCategorySummary = currentPilot
    ? deltaSnapshot.categories.find((entry) => entry.key === currentPilot.currentCategoryKey) ?? null
    : null;
  const currentCategoryPercent =
    currentPilot?.currentCategoryRank && currentPilot?.currentCategoryTotal
      ? Math.round((currentPilot.currentCategoryRank / currentPilot.currentCategoryTotal) * 100)
      : null;
  const currentCategoryTrend = currentPilot
    ? deltaSnapshot.categoryTrends.find((entry) => entry.key === currentPilot.currentCategoryKey) ?? null
    : null;
  const projectedCategoryTotal =
    currentPilot?.currentCategoryTotal && currentCategoryTrend?.pilotCountDelta != null
      ? Math.max(1, currentPilot.currentCategoryTotal + currentCategoryTrend.pilotCountDelta)
      : currentPilot?.currentCategoryTotal ?? null;
  const projectedCategoryRank =
    currentPilot?.currentCategoryRank && currentPilot?.currentCategoryTotal && projectedCategoryTotal
      ? Math.max(
          1,
          Math.round(
            (currentPilot.currentCategoryRank / currentPilot.currentCategoryTotal) *
              projectedCategoryTotal
          )
        )
      : null;
  const payEstimate = currentPilot
    ? buildPayEstimate(
        currentPilot,
        selectedPayScenarioCode ||
          derivePilotPayScenarioCode(currentPilot) ||
          payScenarioOptions[0]?.code ||
          "",
        monthlyCreditHours
      )
    : buildPayEstimate(
        null,
        selectedPayScenarioCode || payScenarioOptions[0]?.code || "",
        monthlyCreditHours
      );
  const activePayScenario =
    resolvePayScenario(selectedPayScenarioCode) ??
    (currentPilot ? resolvePayScenario(derivePilotPayScenarioCode(currentPilot) ?? "") : null) ??
    payScenarioOptions[0] ??
    null;

  const jumpToAeWhatIfPlanner = () => {
    setActiveTab("ae");
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, whatIfSectionY - 110),
        animated: true,
      });
    }, 80);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Delta Pilot Toolkit</Text>
          <Text style={styles.title}>Senority+</Text>
          <Text style={styles.subtitle}>
            Built for fast category reads: identify the pilot, group the tables by base, and color what they can hold.
          </Text>
          <View style={styles.heroMetrics}>
            <MetricCard label="Pilot" value={currentPilot ? currentPilot.currentCategoryCode : "Lookup"} tone="green" />
            <MetricCard label="Likely Holds" value={`${holdSummary.canHold}`} tone="blue" />
            <MetricCard label="AE Went JR" value={`${aeSummary.wentJunior}`} tone="gold" />
          </View>
        </View>

        <View style={styles.tabRow}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "home" && (
          <View style={styles.sectionStack}>
            <SectionCard
              title="Pilot Identity"
              description="Enter an employee number so the app can find the pilot on the latest seniority list and highlight the current category automatically."
            >
              <FormRow>
                <LabeledInput
                  label="Employee Number"
                  value={employeeNumberInput}
                  onChangeText={setEmployeeNumberInput}
                />
              </FormRow>
              {currentPilot ? (
                <View style={styles.identityCard}>
                  <Text style={styles.identityName}>{currentPilot.name}</Text>
                  <Text style={styles.identityMeta}>
                    Emp {currentPilot.employeeNumber} • Seniority #{currentPilot.seniorityNumber}
                  </Text>
                  <Text style={styles.identityMeta}>
                    Current category {currentPilot.currentCategoryCode} • Hire {currentPilot.pilotHireDate}
                  </Text>
                </View>
              ) : (
                <Text style={styles.insightText}>
                  No pilot selected yet. Once an employee number matches the latest list, category tables turn into a personal hold map.
                </Text>
              )}
            </SectionCard>

            <SectionCard
              title="Latest Delta Snapshot"
              description={`Using ${deltaSnapshot.latestFiles.category}, ${deltaSnapshot.latestFiles.seniority}, and ${deltaSnapshot.latestFiles.ae}.`}
            >
              {currentPilot ? (
                <View style={styles.summaryCardRow}>
                  <SummaryCard
                    title="System Seniority"
                    mainValue={systemPercent != null ? `${systemPercent}%` : "-"}
                    detailValue={`${currentPilot.seniorityNumber} of ${systemTotalPilots}`}
                    subValue={
                      systemPercent != null
                        ? "You're currently at this system percentile."
                        : "No pilot selected"
                    }
                    progress={systemPercent ?? 0}
                  />
                  <SummaryCard
                    title={currentPilot.currentCategoryCode}
                    mainValue={
                      currentCategoryPercent != null ? `${currentCategoryPercent}%` : "Unavailable"
                    }
                    detailValue={
                      currentPilot.currentCategoryRank && currentPilot.currentCategoryTotal
                        ? `${currentPilot.currentCategoryRank} of ${currentPilot.currentCategoryTotal}`
                        : "Current category rank unavailable"
                    }
                    subValue={
                      currentCategoryPercent != null
                        ? "You're currently at this category percentile."
                        : "Current category rank unavailable"
                    }
                    progress={currentCategoryPercent ?? 0}
                  />
                  <SummaryCard
                    title={`Projected ${currentPilot.currentCategoryCode}`}
                    mainValue={
                      currentCategoryPercent != null ? `${currentCategoryPercent}%` : "Unavailable"
                    }
                    detailValue={
                      projectedCategoryRank && projectedCategoryTotal
                        ? `${projectedCategoryRank} of ${projectedCategoryTotal}`
                        : "Projected category position unavailable"
                    }
                    subValue={
                      currentCategoryPercent != null
                        ? "Projected at this category percentile."
                        : "Projected category position unavailable"
                    }
                    progress={currentCategoryPercent ?? 0}
                  />
                </View>
              ) : null}

              <View style={styles.snapshotRow}>
                <SnapshotPill label="Category Rows" value={`${deltaSnapshot.counts.categoryRows}`} />
                <SnapshotPill label="AE Awards" value={`${deltaSnapshot.counts.aeRows}`} />
                <SnapshotPill label="Live Bases" value={`${deltaSnapshot.operationalBases.length}`} />
              </View>
              <View style={styles.resultPanel}>
                <ResultLine label="Can hold now" value={`${holdSummary.canHold}`} />
                <ResultLine label="Near the line" value={`${holdSummary.nearLine}`} />
                <ResultLine label="Current category" value={holdSummary.currentCategory ? "1" : "0"} />
                <ResultLine label="AE went junior" value={`${aeSummary.wentJunior}`} />
              </View>
              <TouchableOpacity style={styles.quickLinkButton} onPress={jumpToAeWhatIfPlanner}>
                <Text style={styles.quickLinkButtonText}>Jump To “When can I hold….”</Text>
              </TouchableOpacity>
              <View style={styles.sectionStack}>
                <Text style={styles.inputLabel}>Career Progression Assumption</Text>
                <View style={styles.formRow}>
                  <View style={styles.dropdownWrap}>
                    <Text style={styles.inputLabel}>Annual Growth</Text>
                    <TouchableOpacity
                      style={styles.dropdownButton}
                      onPress={() => setGrowthMenuOpen((open) => !open)}
                    >
                      <Text style={styles.dropdownButtonText}>{Math.round(growthRate * 100)}%</Text>
                    </TouchableOpacity>
                    {growthMenuOpen ? (
                      <View style={styles.dropdownMenu}>
                        {growthRates.map((option) => (
                          <TouchableOpacity
                            key={option.label}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setGrowthRate(option.value);
                              setGrowthMenuOpen(false);
                            }}
                          >
                            <Text style={styles.dropdownItemText}>{option.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.dropdownWrap}>
                    <Text style={styles.inputLabel}>Chart Start</Text>
                    <View style={styles.baseSelector}>
                      {chartStartModes.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[styles.baseChip, chartStartMode === option.value && styles.baseChipActive]}
                          onPress={() => setChartStartMode(option.value)}
                        >
                          <Text style={[styles.baseChipLabel, chartStartMode === option.value && styles.baseChipLabelActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
                {currentPilot ? (
                  <View style={styles.projectionCard}>
                    <Text style={styles.projectionTitle}>System Seniority Over Career</Text>
                    <Text style={styles.projectionMeta}>
                      Through retirement on {currentPilot.scheduledRetireDate} with {Math.round(growthRate * 100)}% annual growth starting from {chartStartLabel(chartStartMode).toLowerCase()}.
                    </Text>
                    <MiniBarChart
                      title="System Seniority Percent"
                      subtitle="Past lists in blue, projected future in orange. Lower percent means more senior."
                      points={seniorityPercentSeries}
                    />
                    <View style={styles.forecastControlRow}>
                      <View style={[styles.dropdownWrap, styles.forecastGrowthWrap]}>
                        <Text style={styles.inputLabel}>Forecast Growth For Lower Graphs</Text>
                        <TouchableOpacity
                          style={styles.dropdownButton}
                          onPress={() => setForecastGrowthMenuOpen((open) => !open)}
                        >
                          <Text style={styles.dropdownButtonText}>
                            {Math.round(forecastGrowthRate * 100)}%
                          </Text>
                        </TouchableOpacity>
                        {forecastGrowthMenuOpen ? (
                          <View style={styles.dropdownMenu}>
                            {forecastGrowthRates.map((option) => (
                              <TouchableOpacity
                                key={option.label}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  setForecastGrowthRate(option.value);
                                  setForecastGrowthMenuOpen(false);
                                }}
                              >
                                <Text style={styles.dropdownItemText}>{option.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <MiniBarChart
                      title="Projected Seniority Number"
                      subtitle="Past list position in blue, future estimated seniority number in orange based on retirements to age 65. Growth changes list size, but not your rank number."
                      points={seniorityNumberSeries}
                    />
                    <MiniBarChart
                      title="Total Pilot Count"
                      subtitle={`Past list size in blue. Future projected list size in orange using a ${Math.round(
                        forecastGrowthRate * 100
                      )}% annual growth assumption.`}
                      points={totalPilotCountSeries}
                    />
                  </View>
                ) : (
                  <Text style={styles.insightText}>
                    Enter an employee number to see a career progression graph based on retirements to age 65 and your selected growth assumption.
                  </Text>
                )}
              </View>
              <View style={styles.sectionStack}>
                <Text style={styles.inputLabel}>Estimated Pay</Text>
                <View style={styles.paySummaryCard}>
                  <View style={styles.payControlsRow}>
                    <View style={[styles.dropdownWrap, styles.payScenarioWrap]}>
                      <Text style={styles.inputLabel}>What If Category</Text>
                      <TouchableOpacity
                        style={styles.dropdownButton}
                        onPress={() => setPayScenarioMenuOpen((open) => !open)}
                      >
                        <Text style={styles.dropdownButtonText}>
                          {activePayScenario?.shortLabel ?? "Select category"}
                        </Text>
                      </TouchableOpacity>
                      {payScenarioMenuOpen ? (
                        <ScrollView style={styles.dropdownMenuTall} nestedScrollEnabled>
                          {payScenarioOptions.map((option) => (
                            <TouchableOpacity
                              key={option.code}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setSelectedPayScenarioCode(option.code);
                                setPayScenarioMenuOpen(false);
                              }}
                            >
                              <Text style={styles.dropdownItemText}>{option.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>
                    <View style={[styles.dropdownWrap, styles.sliderWrap]}>
                      <Text style={styles.inputLabel}>Monthly Credit Hours</Text>
                      <View style={styles.sliderCard}>
                        <View style={styles.sliderHeader}>
                          <Text style={styles.sliderValue}>{Math.round(monthlyCreditHours)} hrs</Text>
                          <View style={styles.sliderMetaGroup}>
                            <Text style={styles.sliderMeta}>0-200 range</Text>
                            <Text style={styles.sliderMeta}>
                              {Math.round(monthlyCreditHours * 12)} annual
                            </Text>
                          </View>
                        </View>
                        <View style={styles.sliderTrackShell}>
                          <Slider
                            minimumValue={0}
                            maximumValue={200}
                            step={1}
                            value={monthlyCreditHours}
                            onValueChange={setMonthlyCreditHours}
                            minimumTrackTintColor="#8B5C14"
                            maximumTrackTintColor="#D8CCB8"
                            thumbTintColor="#123C4A"
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                  {payEstimate ? (
                    <>
                      <ResultLine label="Effective date" value="1/1/2026" />
                      <ResultLine
                        label="Selected rate"
                        value={`${payEstimate.scenarioLabel} • Year ${payEstimate.payYear}`}
                      />
                      <ResultLine label="Pay rate" value={formatCurrency(payEstimate.payRate)} />
                      <ResultLine label="Monthly credit hours" value={`${Math.round(monthlyCreditHours)}`} />
                      <ResultLine label="Base pay" value={formatCurrency(payEstimate.basePay)} />
                      <ResultLine label="DC contribution" value={formatCurrency(payEstimate.dcContribution)} />
                      <ResultLine label="Profit sharing" value={formatCurrency(payEstimate.profitSharing)} />
                      <ResultLine label="Gross compensation" value={formatCurrency(payEstimate.grossCompensation)} />
                      <ResultLine label="Monthly take home" value={formatCurrency(payEstimate.monthlyTakeHome)} emphasis />
                      <ResultLine label="Profit sharing take home" value={formatCurrency(payEstimate.profitSharingTakeHome)} />
                      <ResultLine label="Annual take home" value={formatCurrency(payEstimate.annualTakeHome)} emphasis />
                      <Text style={styles.insightText}>
                        What-if pay uses {payEstimate.scenarioLabel} at {Math.round(monthlyCreditHours)} credit hours per month. DC is fixed at 17% of base pay.
                      </Text>
                    </>
                  ) : (
                    <>
                      <ResultLine label="Current quick monthly estimate" value={formatCurrency(payAudit.totalExpected)} />
                      <Text style={styles.insightText}>
                        Pick a pay category to compare possible bids. Entering an employee number personalizes the pay year automatically.
                      </Text>
                    </>
                  )}
                </View>
              </View>
              <View style={styles.sectionStack}>
                <Text style={styles.inputLabel}>Operational Bases</Text>
                {deltaSnapshot.operationalBases.slice(0, 6).map((base: BaseEntry) => (
                  <View key={base.base} style={styles.resultPanel}>
                    <ResultLine label={`${base.base} categories`} value={`${base.categories}`} />
                    <ResultLine label="Pilots" value={`${base.pilots}`} />
                    <ResultLine label="Instructors" value={`${base.instructors}`} />
                  </View>
                ))}
              </View>
            <View
              style={styles.sectionStack}
              onLayout={(event) => setWhatIfSectionY(event.nativeEvent.layout.y)}
            >
              <Text style={styles.inputLabel}>Carveouts</Text>
              {deltaSnapshot.carveoutBases.map((base: BaseEntry) => (
                <View key={base.base} style={styles.resultPanel}>
                  <ResultLine label={base.base} value={`${base.pilots} total pilots`} />
                  <Text style={styles.insightText}>{describeCarveout(base.base)}</Text>
                </View>
              ))}
            </View>
            </SectionCard>
          </View>
        )}

        {activeTab === "schedule" && (
          <SectionCard
            title="Schedule Analyzer"
            description="Keep the schedule tools nearby for trip quality, fatigue risk, and reroute awareness."
          >
            <FormRow>
              <LabeledInput label="Block Hours" value={blockHours} onChangeText={setBlockHours} />
              <LabeledInput label="Duty Hours" value={dutyHours} onChangeText={setDutyHours} />
            </FormRow>
            <FormRow>
              <LabeledInput label="Layover Hours" value={layoverHours} onChangeText={setLayoverHours} />
              <LabeledInput label="Legs" value={legs} onChangeText={setLegs} />
            </FormRow>
            <View style={styles.resultPanel}>
              <ResultLine label="Productivity" value={formatPercent(tripHealth.productivity)} />
              <ResultLine label="Fatigue Index" value={`${Math.round(tripHealth.fatigueIndex)}/100`} />
              <ResultLine label="Complexity" value={`${Math.round(tripHealth.complexity)}/100`} />
            </View>
            <Text style={styles.insightText}>{tripHealth.recommendation}</Text>
          </SectionCard>
        )}

        {activeTab === "pay" && (
          <SectionCard
            title="Pay Audit"
            description="Estimate expected pay with the same quick audit flow."
          >
            <FormRow>
              <LabeledInput label="Hourly Rate" value={hourlyRate} onChangeText={setHourlyRate} prefix="$" />
              <LabeledInput label="Credited Hours" value={creditedHours} onChangeText={setCreditedHours} />
            </FormRow>
            <FormRow>
              <LabeledInput label="Premium Hours" value={premiumHours} onChangeText={setPremiumHours} />
              <LabeledInput label="Per Diem Days" value={perDiemDays} onChangeText={setPerDiemDays} />
            </FormRow>
            <FormRow>
              <LabeledInput label="Missed Break Pay" value={missedBreakPay} onChangeText={setMissedBreakPay} prefix="$" />
            </FormRow>
            <View style={styles.resultPanel}>
              <ResultLine label="Base Pay" value={formatCurrency(payAudit.basePay)} />
              <ResultLine label="Premium Pay" value={formatCurrency(payAudit.premiumPay)} />
              <ResultLine label="Per Diem" value={formatCurrency(payAudit.perDiem)} />
              <ResultLine label="Expected Total" value={formatCurrency(payAudit.totalExpected)} emphasis />
            </View>
          </SectionCard>
        )}

        {activeTab === "seniority" && (
          <SectionCard
            title="Seniority"
            description="Green means the selected pilot can hold it. Red means they cannot. White is the current category. SR, MID, and JR show the holding line bands for each category."
          >
            <FormRow>
              <LabeledInput
                label="Employee Number"
                value={employeeNumberInput}
                onChangeText={setEmployeeNumberInput}
              />
              <LabeledInput
                label="Search Base or Fleet"
                value={categorySearch}
                onChangeText={setCategorySearch}
                keyboardType="default"
              />
            </FormRow>

            <Text style={styles.inputLabel}>Base Filter</Text>
            <View style={styles.baseSelector}>
              {aeBaseFilters.map((base) => (
                <TouchableOpacity
                  key={base}
                  style={[styles.baseChip, selectedCategoryBaseFilter === base && styles.baseChipActive]}
                  onPress={() => setSelectedCategoryBaseFilter(base)}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      selectedCategoryBaseFilter === base && styles.baseChipLabelActive,
                    ]}
                  >
                    {base}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Seat Filter</Text>
            <View style={styles.baseSelector}>
              {seatFilters.map((seat) => (
                <TouchableOpacity
                  key={seat}
                  style={[styles.baseChip, categorySeatFilter === seat && styles.baseChipActive]}
                  onPress={() => setCategorySeatFilter(seat)}
                >
                  <Text style={[styles.baseChipLabel, categorySeatFilter === seat && styles.baseChipLabelActive]}>
                    {seat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.legendRow}>
              <LegendSwatch label="Can hold" color="#D8EFD2" />
              <LegendSwatch label="Cannot hold" color="#F4D2D2" />
              <LegendSwatch label="Current" color="#FFFFFF" border />
            </View>

            {currentPilot ? (
              <View style={styles.identityCard}>
                <Text style={styles.identityName}>{currentPilot.name}</Text>
                <Text style={styles.identityMeta}>
                  Current category {currentPilot.currentCategoryCode} • Seniority #{currentPilot.seniorityNumber}
                </Text>
              </View>
            ) : null}

            <View style={styles.sectionStack}>
              {groupedCategoryTables.map((group) => {
                const captainRows = group.rows.filter((entry) => entry.seat === "Captain");
                const firstOfficerRows = group.rows.filter((entry) => entry.seat === "First Officer");
                return (
                <View key={group.base} style={styles.tableCard}>
                  <Text style={styles.tableTitle}>{group.base}</Text>
                  <Text style={styles.tableMeta}>
                    Current pilots {group.summary.currentPilots} • Projected pilots {group.summary.projectedPilots} ({formatSignedCount(group.summary.projectedDelta)})
                  </Text>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                    <Text style={styles.tableHeaderCell}>SR</Text>
                    <Text style={styles.tableHeaderCell}>MID</Text>
                    <Text style={styles.tableHeaderCell}>JR</Text>
                    <Text style={styles.tableHeaderCell}>You</Text>
                    <Text style={styles.tableHeaderCell}>Total</Text>
                  </View>
                  <Text style={styles.seatSectionLabel}>Captain</Text>
                  {captainRows.map((entry) => {
                    const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
                    const trend = categoryTrendMap.get(entry.key) ?? null;
                    return (
                      <View key={entry.key} style={[styles.tableRow, rowStyleForHold(fit.label)]}>
                        <View style={styles.tableCategoryCell}>
                          <Text style={styles.tableCategoryText}>
                            {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                          </Text>
                          <Text style={styles.tableSubtext}>{fit.label}</Text>
                        </View>
                        <TableValueCell primary={`#${entry.mostSeniorNumber}`} />
                        <TableValueCell
                          primary={entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-"}
                        />
                        <TableValueCell
                          primary={`#${entry.mostJuniorNumber}`}
                          delta={formatSignedChange(trend?.lineMovement ?? null, "#")}
                          deltaTone={toneForDelta(trend?.lineMovement ?? null)}
                        />
                        <TableValueCell
                          primary={describeUserCategoryPosition(entry, fit, userSeniorityNumber)}
                        />
                        <TableValueCell
                          primary={`${entry.pilotCount}`}
                          delta={formatSignedCount(trend?.pilotCountDelta ?? null)}
                          deltaTone={toneForDelta(trend?.pilotCountDelta ?? null)}
                        />
                      </View>
                    );
                  })}
                  {captainRows.length > 0 && firstOfficerRows.length > 0 ? (
                    <View style={styles.seatDivider}>
                      <Text style={styles.seatDividerText}>First Officer</Text>
                    </View>
                  ) : firstOfficerRows.length > 0 ? (
                    <Text style={styles.seatSectionLabel}>First Officer</Text>
                  ) : null}
                  {firstOfficerRows.map((entry) => {
                    const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
                    const trend = categoryTrendMap.get(entry.key) ?? null;
                    return (
                      <View key={entry.key} style={[styles.tableRow, rowStyleForHold(fit.label)]}>
                        <View style={styles.tableCategoryCell}>
                          <Text style={styles.tableCategoryText}>
                            {entry.fleet} FO
                          </Text>
                          <Text style={styles.tableSubtext}>{fit.label}</Text>
                        </View>
                        <TableValueCell primary={`#${entry.mostSeniorNumber}`} />
                        <TableValueCell
                          primary={entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-"}
                        />
                        <TableValueCell
                          primary={`#${entry.mostJuniorNumber}`}
                          delta={formatSignedChange(trend?.lineMovement ?? null, "#")}
                          deltaTone={toneForDelta(trend?.lineMovement ?? null)}
                        />
                        <TableValueCell
                          primary={describeUserCategoryPosition(entry, fit, userSeniorityNumber)}
                        />
                        <TableValueCell
                          primary={`${entry.pilotCount}`}
                          delta={formatSignedCount(trend?.pilotCountDelta ?? null)}
                          deltaTone={toneForDelta(trend?.pilotCountDelta ?? null)}
                        />
                      </View>
                    );
                  })}
                </View>
                );
              })}
            </View>

            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>Latest AE Award Ranges</Text>
              <Text style={styles.insightText}>
                High is the most senior award, Mid is the middle award, and Low is the junior-most award reached in the latest AE posting.
              </Text>
              <View style={styles.legendRow}>
                <LegendSwatch label="Award went junior to you" color="#D8EFD2" />
                <LegendSwatch label="Award stayed senior" color="#F4D2D2" />
                <LegendSwatch label="Close / no clear line" color="#EEE5D6" />
              </View>
              {groupedSeniorityAeTables.map((group) => {
                const captainRows = group.rows.filter((entry) => entry.seat === "Captain");
                const firstOfficerRows = group.rows.filter((entry) => entry.seat === "First Officer");
                return (
                  <View key={`${group.base}-seniority-ae`} style={styles.tableCard}>
                    <Text style={styles.tableTitle}>{group.base}</Text>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                      <Text style={styles.tableHeaderCell}>High</Text>
                      <Text style={styles.tableHeaderCell}>Mid</Text>
                      <Text style={styles.tableHeaderCell}>Low</Text>
                      <Text style={styles.tableHeaderCell}>Awards</Text>
                      <Text style={styles.tableHeaderCell}>Bypass</Text>
                    </View>
                    <Text style={styles.seatSectionLabel}>Captain</Text>
                    {captainRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      return (
                        <View
                          key={`${entry.awardCategory}-seniority`}
                          style={[styles.tableRow, rowStyleForAeReach(fit.label)]}
                        >
                          <View style={styles.tableCategoryCell}>
                            <Text style={styles.tableCategoryText}>{entry.fleet} CA</Text>
                            <Text style={styles.tableSubtext}>{fit.label}</Text>
                          </View>
                          <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                          <TableValueCell primary={`${entry.awards}`} />
                          <TableValueCell primary={`${entry.bypassAwards}`} />
                        </View>
                      );
                    })}
                    {captainRows.length > 0 && firstOfficerRows.length > 0 ? (
                      <View style={styles.seatDivider}>
                        <Text style={styles.seatDividerText}>First Officer</Text>
                      </View>
                    ) : firstOfficerRows.length > 0 ? (
                      <Text style={styles.seatSectionLabel}>First Officer</Text>
                    ) : null}
                    {firstOfficerRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      return (
                        <View
                          key={`${entry.awardCategory}-seniority`}
                          style={[styles.tableRow, rowStyleForAeReach(fit.label)]}
                        >
                          <View style={styles.tableCategoryCell}>
                            <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                            <Text style={styles.tableSubtext}>{fit.label}</Text>
                          </View>
                          <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                          <TableValueCell primary={`${entry.awards}`} />
                          <TableValueCell primary={`${entry.bypassAwards}`} />
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>

            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>Carveouts</Text>
              {deltaSnapshot.carveoutBases.map((base: BaseEntry) => (
                <View key={`${base.base}-category-info`} style={styles.resultPanel}>
                  <ResultLine label={base.base} value={`${base.pilots} total pilots`} />
                  <Text style={styles.insightText}>{describeCarveout(base.base)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>Month Over Month Category Movement</Text>
              {visibleCategoryTrends.slice(0, 8).map((entry) => (
                <View key={`${entry.key}-trend`} style={styles.resultPanel}>
                  <ResultLine label={`${entry.base} ${entry.fleet} ${entry.seat}`} value={formatDelta(entry.lineMovement, "line")} />
                  <ResultLine label="Pilot count delta" value={formatSignedCount(entry.pilotCountDelta)} />
                  <ResultLine label="Current JR line" value={`#${entry.latestJuniorNumber}`} />
                </View>
              ))}
            </View>

          </SectionCard>
        )}

        {activeTab === "ae" && (
          <SectionCard
            title="AE"
            description="Spoiler: you probably didn't get 350A. Let's see what actually moved."
          >
            <FormRow>
              <LabeledInput
                label="Employee Number"
                value={employeeNumberInput}
                onChangeText={setEmployeeNumberInput}
              />
              <LabeledInput
                label="Search Fleet or Seat"
                value={aeSearch}
                onChangeText={setAeSearch}
                keyboardType="default"
              />
            </FormRow>

            <Text style={styles.inputLabel}>1. Seat</Text>
            <View style={styles.baseSelector}>
              {seatFilters.map((seat) => (
                <TouchableOpacity
                  key={seat}
                  style={[styles.baseChip, aeSeatFilter === seat && styles.baseChipActive]}
                  onPress={() => setAeSeatFilter(seat)}
                >
                  <Text style={[styles.baseChipLabel, aeSeatFilter === seat && styles.baseChipLabelActive]}>
                    {seat === "Captain" ? "CA" : seat === "First Officer" ? "FO" : "All"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>2. Fleet</Text>
            <View style={styles.baseSelector}>
              <TouchableOpacity
                style={[styles.baseChip, selectedAeFleetFilter === "All" && styles.baseChipActive]}
                onPress={() => setSelectedAeFleetFilter("All")}
              >
                <Text
                  style={[
                    styles.baseChipLabel,
                    selectedAeFleetFilter === "All" && styles.baseChipLabelActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {aeFleetOptions.map((fleet) => (
                <TouchableOpacity
                  key={`ae-fleet-${fleet}`}
                  style={[
                    styles.baseChip,
                    selectedAeFleetFilter === fleet && styles.baseChipActive,
                  ]}
                  onPress={() => setSelectedAeFleetFilter(fleet)}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      selectedAeFleetFilter === fleet && styles.baseChipLabelActive,
                    ]}
                  >
                    {fleet}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>3. Base</Text>
            <View style={styles.baseSelector}>
              <TouchableOpacity
                style={[styles.baseChip, selectedAeBaseFilter === "All" && styles.baseChipActive]}
                onPress={() => setSelectedAeBaseFilter("All")}
              >
                <Text
                  style={[
                    styles.baseChipLabel,
                    selectedAeBaseFilter === "All" && styles.baseChipLabelActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {aeBaseOptions.map((base) => (
                <TouchableOpacity
                  key={`ae-base-${base}`}
                  style={[
                    styles.baseChip,
                    selectedAeBaseFilter === base && styles.baseChipActive,
                  ]}
                  onPress={() => setSelectedAeBaseFilter(base)}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      selectedAeBaseFilter === base && styles.baseChipLabelActive,
                    ]}
                  >
                    {base}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.resultPanel}>
              <ResultLine label="Pilot" value={currentPilot?.name ?? "Not found"} />
              <ResultLine label="AE went junior" value={`${aeSummary.wentJunior}`} />
              <ResultLine label="AE near the line" value={`${aeSummary.close}`} />
            </View>

            <View style={styles.legendRow}>
              <LegendSwatch label="Award went junior to you" color="#D8EFD2" />
              <LegendSwatch label="Award stayed senior" color="#F4D2D2" />
              <LegendSwatch label="Close / no clear line" color="#EEE5D6" />
            </View>

            <View style={styles.resultPanel}>
              <Text style={styles.insightText}>
                AE shows the latest award movement, not whether you can hold the category overall.
                Green means the latest AE award reached junior to your number, red means the
                award stayed senior to you, and neutral means the line was close or unclear.
                Tap any category row to see who came in, who left, and where those pilots moved
                from or to.
              </Text>
            </View>

            <TouchableOpacity style={styles.quickLinkButton} onPress={jumpToAeWhatIfPlanner}>
              <Text style={styles.quickLinkButtonText}>Jump To “When can I hold….”</Text>
            </TouchableOpacity>

            <View style={styles.sectionStack}>
              {groupedAeTables.map((group) => {
                const captainRows = group.rows.filter((entry) => entry.seat === "Captain");
                const firstOfficerRows = group.rows.filter((entry) => entry.seat === "First Officer");
                return (
                  <View key={`${group.base}-ae`} style={styles.tableCard}>
                    <Text style={styles.tableTitle}>{group.base}</Text>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                      <Text style={styles.tableHeaderCell}>High</Text>
                      <Text style={styles.tableHeaderCell}>Mid</Text>
                      <Text style={styles.tableHeaderCell}>Low</Text>
                      <Text style={styles.tableHeaderCell}>Awards</Text>
                      <Text style={styles.tableHeaderCell}>Bypass</Text>
                    </View>
                    <Text style={styles.seatSectionLabel}>Captain</Text>
                    {captainRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      return (
                        <TouchableOpacity
                          key={entry.awardCategory}
                          style={[styles.tableRow, rowStyleForAeReach(fit.label)]}
                          onPress={() =>
                            setSelectedAeDetailCategory({
                              awardCategory: entry.awardCategory,
                              seat: entry.seat,
                            })
                          }
                          activeOpacity={0.88}
                        >
                          <View style={styles.tableCategoryCell}>
                            <Text style={styles.tableCategoryText}>
                              {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                            </Text>
                            <Text style={styles.tableSubtext}>{fit.label} • Tap for awards</Text>
                          </View>
                          <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                          <TableValueCell primary={`${entry.awards}`} />
                          <TableValueCell primary={`${entry.bypassAwards}`} />
                        </TouchableOpacity>
                      );
                    })}
                    {captainRows.length > 0 && firstOfficerRows.length > 0 ? (
                      <View style={styles.seatDivider}>
                        <Text style={styles.seatDividerText}>First Officer</Text>
                      </View>
                    ) : firstOfficerRows.length > 0 ? (
                      <Text style={styles.seatSectionLabel}>First Officer</Text>
                    ) : null}
                    {firstOfficerRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      return (
                        <TouchableOpacity
                          key={entry.awardCategory}
                          style={[styles.tableRow, rowStyleForAeReach(fit.label)]}
                          onPress={() =>
                            setSelectedAeDetailCategory({
                              awardCategory: entry.awardCategory,
                              seat: entry.seat,
                            })
                          }
                          activeOpacity={0.88}
                        >
                          <View style={styles.tableCategoryCell}>
                            <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                            <Text style={styles.tableSubtext}>{fit.label} • Tap for awards</Text>
                          </View>
                          <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                          <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                          <TableValueCell primary={`${entry.awards}`} />
                          <TableValueCell primary={`${entry.bypassAwards}`} />
                        </TouchableOpacity>
                      );
                    })}
                    <View style={styles.baseNetBar}>
                      {(() => {
                        const movement = aeMovementByBase.get(group.base) ?? null;
                        const residual = aeResidualByBase.get(group.base) ?? null;
                        const totalMovement = buildTotalMovement(movement, residual);
                        return (
                          <>
                            <Text style={styles.baseNetText}>
                              {group.base} Total Movement: In {totalMovement.totalIn} • Out {totalMovement.totalOut} • Net{" "}
                              {formatSignedCount(totalMovement.net)}
                            </Text>
                            <Text style={styles.baseNetSubtext}>
                              AE only: In {movement?.aeIn ?? 0} • Out {movement?.aeOut ?? 0} • Net{" "}
                              {formatSignedCount(movement?.net ?? 0)}
                            </Text>
                            <Text style={styles.baseNetSubtext}>
                              Other movement (retirements, leave, training, etc.):{" "}
                              {formatSignedCount(residual?.residual ?? 0)}
                            </Text>
                          </>
                        );
                      })()}
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>When can I hold....</Text>
              <Text style={styles.inputLabel}>1. Seat</Text>
              <View style={styles.baseSelector}>
                {(["Captain", "First Officer"] as const).map((seat) => (
                  <TouchableOpacity
                    key={seat}
                    style={[styles.baseChip, whatIfSeat === seat && styles.baseChipActive]}
                    onPress={() => setWhatIfSeat(seat)}
                  >
                    <Text
                      style={[
                        styles.baseChipLabel,
                        whatIfSeat === seat && styles.baseChipLabelActive,
                      ]}
                    >
                      {seat === "Captain" ? "CA" : "FO"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>2. Fleet</Text>
              <View style={styles.baseSelector}>
                {whatIfFleetOptions.map((fleet) => (
                  <TouchableOpacity
                    key={`${whatIfSeat}-${fleet}`}
                    style={[
                      styles.baseChip,
                      selectedWhatIfFleet === fleet && styles.baseChipActive,
                    ]}
                    onPress={() => setSelectedWhatIfFleet(fleet)}
                  >
                    <Text
                      style={[
                        styles.baseChipLabel,
                        selectedWhatIfFleet === fleet && styles.baseChipLabelActive,
                      ]}
                    >
                      {fleet}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>3. Base</Text>
              <View style={styles.baseSelector}>
                {whatIfBaseOptions.map((base) => (
                  <TouchableOpacity
                    key={`${whatIfSeat}-${selectedWhatIfFleet}-${base}`}
                    style={[
                      styles.baseChip,
                      selectedWhatIfBase === base && styles.baseChipActive,
                    ]}
                    onPress={() => setSelectedWhatIfBase(base)}
                  >
                    <Text
                      style={[
                        styles.baseChipLabel,
                        selectedWhatIfBase === base && styles.baseChipLabelActive,
                      ]}
                    >
                      {base}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {activeWhatIfCategory && currentPilot ? (
                <>
                  <View style={styles.resultPanel}>
                    <ResultLine label="Target" value={formatCategoryEntryCode(activeWhatIfCategory)} />
                    <ResultLine label="Current JR line" value={`#${activeWhatIfCategory.mostJuniorNumber}`} />
                    <ResultLine label="Your number today" value={`#${currentPilot.seniorityNumber}`} />
                    <ResultLine
                      label="Gap today"
                      value={
                        currentPilot.seniorityNumber <= activeWhatIfCategory.mostJuniorNumber
                          ? "Can hold now"
                          : `${currentPilot.seniorityNumber - activeWhatIfCategory.mostJuniorNumber} numbers away`
                      }
                      emphasis
                    />
                    <Text style={styles.insightText}>
                      When you can hold the most Junior seat. Its a planning estimate, Not a guarantee.
                    </Text>
                  </View>

                  <FormRow>
                    {whatIfEstimates.map((estimate) => (
                      <View
                        key={`${estimate.targetLabel}-${estimate.growthRate}`}
                        style={[styles.resultPanel, styles.whatIfScenarioPanel]}
                      >
                        <ResultLine
                          label={`${Math.round(estimate.growthRate * 100)}% growth`}
                          value={
                            estimate.firstHoldPoint
                              ? estimate.firstHoldPoint.label === "Today"
                                ? "Can hold now"
                                : `Est. hold by ${estimate.firstHoldPoint.label}`
                              : "Not by retirement"
                          }
                          emphasis
                        />
                        <ResultLine
                          label="Projected your number"
                          value={
                            estimate.firstHoldPoint
                              ? `#${estimate.firstHoldPoint.projectedRank}`
                              : "—"
                          }
                        />
                        <ResultLine
                          label="Projected JR line"
                          value={
                            estimate.firstHoldPoint
                              ? `#${estimate.firstHoldPoint.projectedJuniorLine}`
                              : "—"
                          }
                        />
                        <ResultLine
                          label="Numbers away today"
                          value={
                            estimate.currentGap === 0
                              ? "0"
                              : `${estimate.currentGap}`
                          }
                        />
                      </View>
                    ))}
                  </FormRow>
                </>
              ) : (
                <Text style={styles.insightText}>
                  Enter your employee number and pick a target category to estimate when your
                  projected seniority could hold that seat.
                </Text>
              )}
            </View>
          </SectionCard>
        )}
      </ScrollView>
      <Modal
        visible={selectedAeDetailCategory != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAeDetailCategory(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>
                  {selectedAeDetailCategory?.awardCategory ?? "AE Awards"}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Latest posting awards in seniority order. Every pilot shown below was awarded this exact category.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setSelectedAeDetailCategory(null)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalTableHeader}>
              <Text style={[styles.tableHeaderCell, styles.modalNameCell]}>Pilot</Text>
              <Text style={styles.tableHeaderCell}>#</Text>
            </View>
            {selectedAeDetailCategory ? (
              <View style={styles.resultPanel}>
                {(() => {
                  const totalMovement = buildTotalMovement(activeAeMovement, activeAeResidual);
                  return (
                    <>
                      <ResultLine
                        label="Awarded to"
                        value={selectedAeDetailCategory.awardCategory}
                      />
                      <ResultLine
                        label="Summary"
                        value={`${activeAeAwardRows.length} awards • High ${formatSeniorityValue(
                          activeAeAwardRows[0]?.seniorityNumber ?? null
                        )} • Low ${formatSeniorityValue(
                          activeAeAwardRows.at(-1)?.seniorityNumber ?? null
                        )}`}
                      />
                      <ResultLine
                        label="Total movement"
                        value={`In ${totalMovement.totalIn} • Out ${totalMovement.totalOut} • Net ${formatSignedCount(
                          totalMovement.net
                        )}`}
                      />
                      <ResultLine
                        label="AE only"
                        value={`In ${activeAeMovement?.aeIn ?? 0} • Out ${activeAeMovement?.aeOut ?? 0} • Net ${formatSignedCount(
                          activeAeMovement?.net ?? 0
                        )}`}
                      />
                      <ResultLine
                        label="Other movement (retirements, leave, training, etc.)"
                        value={formatSignedCount(activeAeResidual?.residual ?? 0)}
                      />
                    </>
                  );
                })()}
              </View>
            ) : null}
            <ScrollView style={styles.modalScroll} nestedScrollEnabled>
              {selectedAeDetailCategory ? (
                <View style={styles.listCompareWrap}>
                  <View style={styles.legendRow}>
                    <LegendSwatch label="Senior to you" color="#CFEAFF" />
                    <LegendSwatch label="You / near your number" color="#E8F3D1" />
                    <LegendSwatch label="Retiring soon" color="#F6D6D6" />
                    <LegendSwatch label="Junior to you" color="#F6F1E8" />
                  </View>
                  <View style={styles.listCompareColumns}>
                    <View style={styles.listCompareCard}>
                      <Text style={styles.listCompareTitle}>Coming To {selectedAeDetailCategory.awardCategory}</Text>
                      <Text style={styles.listCompareMeta}>
                        {activeAeAwardRows.length} pilots • JR{" "}
                        {formatSeniorityValue(activeAeAwardRows.at(-1)?.seniorityNumber ?? null)}
                      </Text>
                      {activeAeAwardRows.map((pilot) => {
                        const rowState = getAeCompareRowState(pilot, currentPilot);
                        return (
                          <View
                            key={`incoming-${pilot.employeeNumber}`}
                            style={[styles.listCompareRow, rowState.style]}
                          >
                            <View style={styles.listCompareNameWrap}>
                              <Text style={styles.listCompareName}>{pilot.name}</Text>
                              <Text style={styles.listCompareStatus}>{rowState.label}</Text>
                              <Text style={styles.listCompareContext}>
                                From {pilot.previousCategory || "Unknown"}
                              </Text>
                            </View>
                            <Text style={styles.listCompareNumber}>#{pilot.seniorityNumber}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.listCompareCard}>
                      <Text style={styles.listCompareTitle}>Leaving The {selectedAeDetailCategory.awardCategory}</Text>
                      <Text style={styles.listCompareMeta}>
                        {activeAeLeavingRows.length} pilots • JR{" "}
                        {formatSeniorityValue(activeAeLeavingRows.at(-1)?.seniorityNumber ?? null)}
                      </Text>
                      {activeAeLeavingRows.map((pilot) => {
                        const rowState = getAeCompareRowState(pilot, currentPilot);
                        return (
                          <View
                            key={`leaving-${pilot.employeeNumber}`}
                            style={[styles.listCompareRow, rowState.style]}
                          >
                            <View style={styles.listCompareNameWrap}>
                              <Text style={styles.listCompareName}>{pilot.name}</Text>
                              <Text style={styles.listCompareStatus}>{rowState.label}</Text>
                              <Text style={styles.listCompareContext}>
                                To {pilot.awardCategory || "Unknown"}
                              </Text>
                            </View>
                            <Text style={styles.listCompareNumber}>#{pilot.seniorityNumber}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}
              {activeAeAwardRows.length === 0 ? (
                <Text style={styles.insightText}>No awards were parsed for this category.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function findPilotByEmployeeNumber(
  pilots: readonly PilotRecord[],
  input: string
) {
  const normalizedInput = normalizeDigits(input);
  if (!normalizedInput) {
    return null;
  }

  return (
    pilots.find((pilot) => normalizeDigits(pilot.employeeNumber) === normalizedInput) ??
    null
  );
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function buildPilotHistoryShardKey(employeeNumber: string) {
  return (employeeNumber.slice(0, 2) || "00").padEnd(2, "0");
}

function buildCategoryKeyFromAeCategory(awardCategory: string) {
  const [base = "", fleet = "", seatCode = ""] = awardCategory.split("-");
  const positionCode = seatCode === "CA" ? "A" : seatCode === "FO" ? "B" : seatCode;
  return `${base}-${fleet}-${positionCode}`;
}

function formatCategoryEntryCode(entry: Pick<CategoryEntry, "base" | "fleet" | "seat">) {
  return `${entry.base}-${entry.fleet}-${entry.seat === "Captain" ? "CA" : "FO"}`;
}

function buildTotalMovement(
  movement: AeMovementSummary | null,
  residual: AeResidualSummary | null
) {
  const aeIn = movement?.aeIn ?? 0;
  const aeOut = movement?.aeOut ?? 0;
  const extraIn = Math.max(0, residual?.residual ?? 0);
  const extraOut = Math.max(0, -(residual?.residual ?? 0));
  const totalIn = aeIn + extraIn;
  const totalOut = aeOut + extraOut;
  const net = totalIn - totalOut;

  return {
    totalIn,
    totalOut,
    net,
  };
}

function buildCategoryHoldEstimate(
  pilot: PilotRecord,
  target: CategoryEntry,
  pilots: readonly PilotRecord[],
  growthRate: number
): HoldEstimate {
  const currentTotalPilots = Math.max(1, pilots.length);
  const currentJuniorLine = target.mostJuniorNumber;
  const juniorLineShare = currentJuniorLine / currentTotalPilots;
  const futurePath = buildCareerProjection(pilot, pilots, growthRate, "today");

  const checkpoints = futurePath.map((point) => ({
    label: point.label,
    timeMs: point.timeMs ?? Date.now(),
    projectedRank: point.projectedRank,
    projectedJuniorLine: Math.max(
      currentJuniorLine,
      Math.round(point.projectedTotal * juniorLineShare)
    ),
  }));

  return {
    growthRate,
    targetLabel: formatCategoryEntryCode(target),
    currentJuniorLine,
    currentGap: Math.max(0, pilot.seniorityNumber - currentJuniorLine),
    firstHoldPoint:
      checkpoints.find((point) => point.projectedRank <= point.projectedJuniorLine) ?? null,
  };
}

function isRetiringSoon(scheduledRetireDate: string | null, monthsAhead = 12) {
  const retireDate = scheduledRetireDate ? parseDeltaDate(scheduledRetireDate) : null;
  if (!retireDate) {
    return false;
  }

  const now = new Date();
  const threshold = new Date(now.getFullYear(), now.getMonth() + monthsAhead, now.getDate());
  return retireDate >= now && retireDate <= threshold;
}

function getAeCompareRowState(
  pilot: Pick<LatestAeAwardRow, "employeeNumber" | "seniorityNumber" | "scheduledRetireDate"> |
    Pick<LatestCategoryAssignment, "employeeNumber" | "seniorityNumber" | "scheduledRetireDate">,
  currentPilot: PilotRecord | null
) {
  if (!currentPilot) {
    return {
      style: styles.listCompareRowJunior,
      label: "Junior to you",
    };
  }

  if (pilot.employeeNumber === currentPilot.employeeNumber) {
    return {
      style: styles.listCompareRowYou,
      label: "You",
    };
  }

  if (Math.abs(pilot.seniorityNumber - currentPilot.seniorityNumber) <= 150) {
    return {
      style: styles.listCompareRowYou,
      label: "Near your number",
    };
  }

  if (isRetiringSoon(pilot.scheduledRetireDate)) {
    return {
      style: styles.listCompareRowRetiring,
      label: `Retires ${pilot.scheduledRetireDate}`,
    };
  }

  if (pilot.seniorityNumber < currentPilot.seniorityNumber) {
    return {
      style: styles.listCompareRowSenior,
      label: "Senior to you",
    };
  }

  return {
    style: styles.listCompareRowJunior,
    label: "Junior to you",
  };
}

function parseDeltaDate(value: string) {
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

  return new Date(Number(year), monthMap[monthCode], Number(day));
}

function buildCareerProjection(
  pilot: PilotRecord,
  pilots: readonly PilotRecord[],
  growthRate: number,
  chartStartMode: ChartStartMode
) {
  const startDate = resolveChartStartDate(pilot, chartStartMode);
  const retireDate = parseDeltaDate(pilot.scheduledRetireDate);
  if (!retireDate) {
    return [];
  }

  const checkpoints: Date[] = [startDate];
  for (let year = startDate.getFullYear() + 1; year <= retireDate.getFullYear(); year += 1) {
    checkpoints.push(new Date(year, 0, 1));
  }

  const currentTotalPilots = pilots.length;

  return checkpoints
    .filter((date) => date <= retireDate)
    .map((date) => {
      const yearsElapsed = Math.max(
        0,
        (date.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      const retirementsAhead = pilots.filter((entry) => {
        const retirement = parseDeltaDate(entry.scheduledRetireDate);
        return (
          retirement != null &&
          retirement <= date &&
          entry.seniorityNumber < pilot.seniorityNumber
        );
      }).length;
      const projectedRank = Math.max(1, pilot.seniorityNumber - retirementsAhead);
      const projectedTotal = Math.max(
        projectedRank,
        Math.round(currentTotalPilots * Math.pow(1 + growthRate, yearsElapsed))
      );
      const topPercent = Math.max(
        1,
        Math.round((projectedRank / projectedTotal) * 100)
      );
      const systemPercent = Number(((projectedRank / projectedTotal) * 100).toFixed(1));
      const progressPercent = Math.max(
        4,
        Math.min(100, Math.round(((projectedTotal - projectedRank) / projectedTotal) * 100))
      );

      return {
        label:
          date.getFullYear() === startDate.getFullYear()
            ? "Today"
            : `${date.getFullYear()}`,
        timeMs: date.getTime(),
        projectedRank,
        projectedTotal,
        retirementsAhead,
        topPercent,
        systemPercent,
        progressPercent,
      };
    });
}

function buildProjectedPilotCountSeries(
  startingCount: number,
  scheduledRetireDate: string | null,
  growthRate: number,
  chartStartMode: ChartStartMode
) {
  if (!scheduledRetireDate || startingCount === 0) {
    return [];
  }

  const retireDate = parseDeltaDate(scheduledRetireDate);
  if (!retireDate) {
    return [];
  }

  const startDate = resolveYearOnlyStartDate(chartStartMode);
  const currentYear = startDate.getFullYear();
  const points: ChartPoint[] = [];
  let yearOffset = 1;
  for (let year = currentYear + 1; year <= retireDate.getFullYear(); year += 1) {
    const projectedCount = Math.round(startingCount * Math.pow(1 + growthRate, yearOffset));
    points.push({
      label: `${year}`,
      value: projectedCount,
      valueLabel: `${projectedCount}`,
      tone: "future",
    });
    yearOffset += 1;
  }
  return points;
}

function buildPayEstimate(
  pilot: PilotRecord | null,
  payScenarioCode: string,
  monthlyHours: number
) {
  const scenario = resolvePayScenario(payScenarioCode);
  if (!scenario) {
    return null;
  }

  const { equipmentLabel, seat } = scenario;
  const payYear = pilot ? derivePayYear(pilot.pilotHireDate) : 1;
  const rates = payScales[seat][equipmentLabel];
  const payRate = rates?.[payYear - 1];

  if (!payRate) {
    return null;
  }

  const annualCreditHours = monthlyHours * 12;
  const basePay = payRate * annualCreditHours;
  const dcContribution = basePay * definedContributionRate;
  const profitSharing = basePay * profitSharingRate;
  const grossCompensation = basePay + dcContribution + profitSharing;
  const monthlyTakeHome = (basePay * annualTakeHomeRate) / 12;
  const profitSharingTakeHome = profitSharing * profitSharingTakeHomeRate;
  const annualTakeHome = monthlyTakeHome * 12 + profitSharingTakeHome;

  return {
    scenarioCode: scenario.code,
    scenarioLabel: scenario.shortLabel,
    seat,
    equipmentLabel,
    payYear,
    payRate,
    annualCreditHours,
    basePay,
    dcContribution,
    profitSharing,
    grossCompensation,
    annualTakeHome,
    monthlyTakeHome,
    profitSharingTakeHome,
  };
}

function derivePilotPayScenarioCode(pilot: PilotRecord) {
  const normalizedCategory = pilot.currentCategoryCode.toUpperCase();
  const matchingScenario = payScenarioOptions.find((option) =>
    normalizedCategory.endsWith(option.code)
  );
  return matchingScenario?.code ?? null;
}

function derivePayYear(hireDate: string) {
  const parsedHire = parseDeltaDate(hireDate);
  const payScaleDate = new Date(2026, 0, 1);
  if (!parsedHire) {
    return 1;
  }

  let years = payScaleDate.getFullYear() - parsedHire.getFullYear();
  const beforeAnniversary =
    payScaleDate.getMonth() < parsedHire.getMonth() ||
    (payScaleDate.getMonth() === parsedHire.getMonth() &&
      payScaleDate.getDate() < parsedHire.getDate());
  if (beforeAnniversary) {
    years -= 1;
  }

  return Math.max(1, Math.min(12, years + 1));
}

function resolveChartStartDate(pilot: PilotRecord, chartStartMode: ChartStartMode) {
  if (chartStartMode === "hire") {
    return parseDeltaDate(pilot.pilotHireDate) ?? new Date();
  }
  return new Date();
}

function resolvePilotChartStartDate(
  pilot: PilotRecord,
  pilotHistory: PilotHistoryRecord | null,
  chartStartMode: ChartStartMode
) {
  if (chartStartMode === "today") {
    const latestPoint = pilotHistory?.points.at(-1);
    return latestPoint ? dateFromMonthKey(latestPoint.monthKey) : new Date();
  }
  if (chartStartMode === "hire") {
    return parseDeltaDate(pilot.pilotHireDate) ?? new Date();
  }
  return new Date();
}

function resolveListChartStartDate(
  pilot: PilotRecord | null,
  pilotHistory: PilotHistoryRecord | null,
  chartStartMode: ChartStartMode,
  monthlyPilotCounts: readonly { monthKey: string }[]
) {
  if (chartStartMode === "today") {
    const latestSystemPoint = monthlyPilotCounts.at(-1);
    return latestSystemPoint ? dateFromMonthKey(latestSystemPoint.monthKey) : new Date();
  }
  if (chartStartMode === "hire" && pilot) {
    return parseDeltaDate(pilot.pilotHireDate) ?? new Date();
  }
  return new Date();
}

function resolveYearOnlyStartDate(chartStartMode: ChartStartMode) {
  if (chartStartMode === "today") {
    return new Date();
  }
  return new Date();
}

function buildReferencePercentAtTime(
  pilot: PilotRecord,
  pilots: readonly PilotRecord[],
  growthRate: number,
  chartStartMode: ChartStartMode,
  timeMs: number
) {
  const startDate = resolveChartStartDate(pilot, chartStartMode);
  const targetDate = new Date(timeMs);
  if (targetDate < startDate) {
    return null;
  }

  const currentTotalPilots = pilots.length;
  const yearsElapsed = Math.max(
    0,
    (targetDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  const retirementsAhead = pilots.filter((entry) => {
    const retirement = parseDeltaDate(entry.scheduledRetireDate);
    return (
      retirement != null &&
      retirement <= targetDate &&
      entry.seniorityNumber < pilot.seniorityNumber
    );
  }).length;
  const projectedRank = Math.max(1, pilot.seniorityNumber - retirementsAhead);
  const projectedTotal = Math.max(
    projectedRank,
    Math.round(currentTotalPilots * Math.pow(1 + growthRate, yearsElapsed))
  );

  return Number(((projectedRank / projectedTotal) * 100).toFixed(1));
}

function buildEstimatedPastPoint(
  pilot: PilotRecord | null,
  targetDate: Date,
  monthlyPilotCounts: readonly { monthKey: string; pilotCount: number }[]
) {
  if (!pilot) {
    return null;
  }

  const hireDate = parseDeltaDate(pilot.pilotHireDate);
  if (!hireDate) {
    return null;
  }

  const now = new Date();
  const clampedTargetDate = targetDate > now ? now : targetDate;
  const hireAnchorCount = resolveHireYearPilotCount(hireDate, monthlyPilotCounts);
  const startRank = hireAnchorCount;
  const endRank = pilot.seniorityNumber;
  const totalSpan = Math.max(1, now.getTime() - hireDate.getTime());
  const elapsed = Math.max(0, clampedTargetDate.getTime() - hireDate.getTime());
  const progress = Math.max(0, Math.min(1, elapsed / totalSpan));
  const estimatedRank = Math.round(startRank + (endRank - startRank) * progress);
  const pilotCountAtDate = resolvePilotCountAtDate(clampedTargetDate, monthlyPilotCounts);
  const effectivePilotCount = Math.max(estimatedRank, pilotCountAtDate ?? hireAnchorCount);

  return {
    seniorityNumber: estimatedRank,
    systemPercent: Number(((estimatedRank / effectivePilotCount) * 100).toFixed(1)),
  };
}

function findHistoryPointAtOrBefore(
  pilotHistory: PilotHistoryRecord | null,
  targetDate: Date
) {
  if (!pilotHistory) {
    return null;
  }

  let match: PilotHistoryPoint | null = null;
  for (const point of pilotHistory.points) {
    const pointDate = dateFromMonthKey(point.monthKey);
    if (!pointDate || pointDate > targetDate) {
      continue;
    }
    if (!match) {
      match = point;
      continue;
    }
    const matchDate = dateFromMonthKey(match.monthKey);
    if (matchDate && pointDate > matchDate) {
      match = point;
    }
  }

  return match;
}

function resolveHireYearPilotCount(
  hireDate: Date,
  monthlyPilotCounts: readonly { monthKey: string; pilotCount: number }[]
) {
  const hireYearMatches = monthlyPilotCounts
    .map((point) => ({
      ...point,
      pointDate: dateFromMonthKey(point.monthKey),
    }))
    .filter(
      (point) =>
        point.pointDate != null && point.pointDate.getFullYear() === hireDate.getFullYear()
    )
    .sort((left, right) => {
      const leftDiff = Math.abs(left.pointDate!.getTime() - hireDate.getTime());
      const rightDiff = Math.abs(right.pointDate!.getTime() - hireDate.getTime());
      return leftDiff - rightDiff;
    });

  if (hireYearMatches[0]) {
    return hireYearMatches[0].pilotCount;
  }

  const nearestAnyYear = monthlyPilotCounts
    .map((point) => ({
      ...point,
      pointDate: dateFromMonthKey(point.monthKey),
    }))
    .filter((point) => point.pointDate != null)
    .sort((left, right) => {
      const leftDiff = Math.abs(left.pointDate!.getTime() - hireDate.getTime());
      const rightDiff = Math.abs(right.pointDate!.getTime() - hireDate.getTime());
      return leftDiff - rightDiff;
    })[0];

  return nearestAnyYear?.pilotCount ?? 1;
}

function resolvePilotCountAtDate(
  targetDate: Date,
  monthlyPilotCounts: readonly { monthKey: string; pilotCount: number }[]
) {
  const nearest = monthlyPilotCounts
    .map((point) => ({
      ...point,
      pointDate: dateFromMonthKey(point.monthKey),
    }))
    .filter((point) => point.pointDate != null)
    .sort((left, right) => {
      const leftDiff = Math.abs(left.pointDate!.getTime() - targetDate.getTime());
      const rightDiff = Math.abs(right.pointDate!.getTime() - targetDate.getTime());
      return leftDiff - rightDiff;
    })[0];

  return nearest?.pilotCount ?? null;
}

function dateFromMonthKey(monthKey: string) {
  const normalized = monthKey.toUpperCase();
  let match = normalized.match(/(\d{2})([A-Z]{3})(\d{4})/);
  if (match) {
    const [, day, monthCode, year] = match;
    return new Date(Number(year), monthIndex(monthCode), Number(day));
  }
  match = normalized.match(/([A-Z]+)\s+(\d{4})/);
  if (match) {
    return new Date(Number(match[2]), monthIndex(match[1].slice(0, 3)), 1);
  }
  return null;
}

function monthIndex(monthCode: string) {
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
  return monthMap[monthCode] ?? 0;
}

function chartStartLabel(mode: ChartStartMode) {
  return chartStartModes.find((option) => option.value === mode)?.label ?? "Today";
}

function shortenMonthLabel(monthKey: string) {
  const compact = monthKey
    .replace(" Seniority List", "")
    .replace("Category_List_", "")
    .replace(".pdf", "")
    .trim();

  if (compact.length <= 8) {
    return compact;
  }

  const words = compact.split(" ");
  if (words.length >= 2) {
    return `${words[0].slice(0, 3)}${words[1]}`;
  }

  return compact.slice(0, 8);
}

function evaluateCategoryHold(
  entry: CategoryEntry,
  userSeniorityNumber: number,
  currentCategoryKey: string | null
) {
  if (!userSeniorityNumber) {
    return {
      label: "No pilot" as HoldLabel,
      note: "Enter an employee number to compare the pilot against this category.",
    };
  }

  if (currentCategoryKey === entry.key) {
    return {
      label: "Current category" as HoldLabel,
      note: "This is the pilot's current category.",
    };
  }

  const gap = userSeniorityNumber - entry.mostJuniorNumber;
  if (gap <= 0) {
    return {
      label: "Can hold" as HoldLabel,
      note: `Pilot is senior enough to hold this category now.`,
    };
  }

  if (gap <= 300) {
    return {
      label: "Near the line" as HoldLabel,
      note: `Pilot is ${gap} numbers junior to the current line.`,
    };
  }

  return {
    label: "Cannot hold" as HoldLabel,
    note: `Pilot is ${gap} numbers junior to the current line.`,
  };
}

function evaluateAeReach(entry: AeEntry, userSeniorityNumber: number) {
  if (entry.mostJuniorAwardNumber == null) {
    return {
      label: "No line yet" as AeReachLabel,
      note: "This AE category does not have a parsed junior-most award line yet.",
    };
  }

  if (!userSeniorityNumber) {
    return {
      label: "No pilot" as AeReachLabel,
      note: "Enter an employee number to compare against the latest AE award range.",
    };
  }

  const gap = userSeniorityNumber - entry.mostJuniorAwardNumber;
  if (gap <= 0) {
    return {
      label: "Award went junior to you" as AeReachLabel,
      note: "The latest AE award reached at least to this pilot's number.",
    };
  }

  if (gap <= 250) {
    return {
      label: "Close / no clear line" as AeReachLabel,
      note: `Pilot is ${gap} numbers junior to the latest AE award line.`,
    };
  }

  return {
    label: "Award stayed senior" as AeReachLabel,
    note: `Pilot is ${gap} numbers junior to the latest AE award line.`,
  };
}

function buildHoldSummary(
  entries: readonly CategoryEntry[],
  userSeniorityNumber: number,
  currentCategoryKey: string | null
) {
  return entries.reduce(
    (acc, entry) => {
      const result = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
      if (result.label === "Can hold") {
        acc.canHold += 1;
      }
      if (result.label === "Near the line") {
        acc.nearLine += 1;
      }
      if (result.label === "Current category") {
        acc.currentCategory += 1;
      }
      return acc;
    },
    { canHold: 0, nearLine: 0, currentCategory: 0 }
  );
}

function buildAeSummary(entries: readonly AeEntry[], userSeniorityNumber: number) {
  return entries.reduce(
    (acc, entry) => {
      const result = evaluateAeReach(entry, userSeniorityNumber);
      if (result.label === "Award went junior to you") {
        acc.wentJunior += 1;
      }
      if (result.label === "Close / no clear line") {
        acc.close += 1;
      }
      return acc;
    },
    { wentJunior: 0, close: 0 }
  );
}

function buildAeProjection(
  pilot: PilotRecord | null,
  target: AeEntry | null,
  history: AeHistoryRecord | null,
  pilots: readonly PilotRecord[]
) {
  if (!pilot || !target || target.mostJuniorAwardNumber == null) {
    return null;
  }

  const pilotsAhead = pilots.filter(
    (entry) =>
      entry.seniorityNumber > target.mostJuniorAwardNumber! &&
      entry.seniorityNumber <= pilot.seniorityNumber
  ).length;
  const positionsNeeded = Math.max(0, pilotsAhead);
  const averageAwardsPerPosting =
    history && history.points.length > 0
      ? history.points.reduce((sum, point) => sum + point.awards, 0) / history.points.length
      : target.awards;
  const estimatedPostingsToReach =
    averageAwardsPerPosting > 0 ? Math.ceil(positionsNeeded / averageAwardsPerPosting) : null;

  return {
    pilotsAhead,
    positionsNeeded,
    averageAwardsPerPosting,
    estimatedPostingsToReach,
  };
}

function buildBaseCategorySummary(
  entries: readonly CategoryEntry[],
  trendMap: ReadonlyMap<string, {
    latestPilotCount: number;
    pilotCountDelta: number | null;
  }>
) {
  return entries.reduce(
    (acc, entry) => {
      const trend = trendMap.get(entry.key);
      acc.currentPilots += entry.pilotCount;
      acc.projectedDelta += trend?.pilotCountDelta ?? 0;
      acc.projectedPilots += entry.pilotCount + (trend?.pilotCountDelta ?? 0);
      return acc;
    },
    { currentPilots: 0, projectedPilots: 0, projectedDelta: 0 }
  );
}

function rowStyleForHold(label: HoldLabel) {
  if (label === "Current category") {
    return styles.tableRowCurrent;
  }
  if (label === "Can hold") {
    return styles.tableRowHold;
  }
  if (label === "Cannot hold") {
    return styles.tableRowNoHold;
  }
  return styles.tableRowNeutral;
}

function rowStyleForAeReach(label: string) {
  if (label === "Award went junior to you") {
    return styles.tableRowHold;
  }
  if (label === "Award stayed senior") {
    return styles.tableRowNoHold;
  }
  return styles.tableRowNeutral;
}

function formatSignedCount(value: number | null) {
  if (value == null) {
    return "New";
  }
  if (value === 0) {
    return "Flat";
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function formatSignedChange(value: number | null, prefix = "") {
  if (value == null) {
    return null;
  }
  if (value === 0) {
    return "0";
  }
  return value > 0 ? `+${prefix}${value}` : `-${prefix}${Math.abs(value)}`;
}

function formatSeniorityValue(value: number | null) {
  return value != null ? `#${value}` : "-";
}

function formatOneDecimal(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "-";
}

function toneForDelta(value: number | null) {
  if (value == null || value === 0) {
    return "neutral" as const;
  }
  return value > 0 ? ("positive" as const) : ("negative" as const);
}

function describeUserCategoryPosition(
  entry: CategoryEntry,
  fit: { label: HoldLabel; note: string },
  userSeniorityNumber: number
) {
  if (!userSeniorityNumber) {
    return "-";
  }
  if (fit.label === "Current category") {
    return `#${userSeniorityNumber}`;
  }
  const gap = userSeniorityNumber - entry.mostJuniorNumber;
  if (gap <= 0) {
    return "hold";
  }
  return `+${gap}`;
}

function formatDelta(value: number | null, noun: string) {
  if (value == null) {
    return "New";
  }
  if (value === 0) {
    return "No change";
  }
  return value > 0 ? `+${value} ${noun}` : `${value} ${noun}`;
}

function describeCarveout(base: string) {
  if (base === "NBC") {
    return "Not a true base. These pilots are not currently assigned a base, including leave status or new-hire training transitions.";
  }
  if (base === "INS") {
    return "Instructor carveout. Useful for visibility, but not treated as a normal operating base.";
  }
  if (base === "SUP") {
    return "Management carveout for chief and assistant chief pilot categories.";
  }
  return "Special carveout category.";
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDescription}>{description}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "gold" | "green";
}) {
  return (
    <View style={[styles.metricCard, tone === "gold" && styles.metricGold, tone === "green" && styles.metricGreen]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SnapshotPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.snapshotPill}>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotValue}>{value}</Text>
    </View>
  );
}

function SummaryCard({
  title,
  mainValue,
  detailValue,
  subValue,
  progress,
}: {
  title: string;
  mainValue: string;
  detailValue: string;
  subValue: string;
  progress: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryMain}>{mainValue}</Text>
      <Text style={styles.summaryDetail}>{detailValue}</Text>
      <Text style={styles.summarySub}>{subValue}</Text>
      <View style={styles.summaryTrack}>
        <View style={[styles.summaryFill, { width: `${Math.max(6, Math.min(100, progress))}%` }]} />
      </View>
    </View>
  );
}

function LegendSwatch({
  label,
  color,
  border,
}: {
  label: string;
  color: string;
  border?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }, border && styles.legendBorder]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.formRow}>{children}</View>;
}

function LabeledInput({
  label,
  value,
  onChangeText,
  prefix,
  suffix,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  prefix?: string;
  suffix?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputShell}>
        {prefix ? <Text style={styles.inputAffix}>{prefix}</Text> : null}
        <TextInput
          keyboardType={keyboardType ?? "numeric"}
          value={value}
          onChangeText={onChangeText}
          style={styles.input}
          placeholderTextColor="#7B7367"
        />
        {suffix ? <Text style={styles.inputAffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function ResultLine({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.resultLine}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={[styles.resultValue, emphasis && styles.resultValueEmphasis]}>{value}</Text>
    </View>
  );
}

function TableValueCell({
  primary,
  delta,
  deltaTone = "neutral",
}: {
  primary: string;
  delta?: string | null;
  deltaTone?: "positive" | "negative" | "neutral";
}) {
  return (
    <View style={styles.tableValueCell}>
      <Text style={styles.tableCell}>{primary}</Text>
      {delta ? (
        <Text
          style={[
            styles.tableDelta,
            deltaTone === "positive" && styles.tableDeltaPositive,
            deltaTone === "negative" && styles.tableDeltaNegative,
          ]}
        >
          {delta}
        </Text>
      ) : null}
    </View>
  );
}

function MiniBarChart({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: ChartPoint[];
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const hasReferenceLines = points.some(
    (point) => point.referenceOnePercent != null || point.referenceTwoPercent != null
  );

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>{title}</Text>
      <Text style={styles.chartSubtitle}>{subtitle}</Text>
      {hasReferenceLines ? (
        <View style={styles.chartLegendRow}>
          <LegendSwatch label="Actual / current" color="#6E79F6" />
          <LegendSwatch label="1% plan" color="#B44A3B" />
          <LegendSwatch label="2% plan" color="#5D9C3F" />
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartRow}>
          {points.map((point) => (
            <View key={`${title}-${point.label}-${point.valueLabel}`} style={styles.chartColumn}>
              <Text style={[styles.chartValue, point.tone === "future" && styles.chartValueFuture]}>
                {point.valueLabel}
              </Text>
              <View style={styles.chartBarWrap}>
                {point.referenceOnePercent != null ? (
                  <View
                    style={[
                      styles.chartReferenceMark,
                      styles.chartReferenceOne,
                      {
                        bottom: `${Math.max(
                          0,
                          Math.min(100, Math.round((point.referenceOnePercent / maxValue) * 100))
                        )}%`,
                      },
                    ]}
                  />
                ) : null}
                {point.referenceTwoPercent != null ? (
                  <View
                    style={[
                      styles.chartReferenceMark,
                      styles.chartReferenceTwo,
                      {
                        bottom: `${Math.max(
                          0,
                          Math.min(100, Math.round((point.referenceTwoPercent / maxValue) * 100))
                        )}%`,
                      },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.chartBar,
                    point.tone === "future" && styles.chartBarFuture,
                    { height: `${Math.max(8, Math.round((point.value / maxValue) * 100))}%` },
                  ]}
                />
              </View>
              <Text style={styles.chartLabel}>{point.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F4EFE4",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    gap: 18,
  },
  hero: {
    backgroundColor: "#123C4A",
    borderRadius: 28,
    padding: 22,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#B9D8E2",
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#FFF7E9",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#E7F0F4",
  },
  heroMetrics: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  metricCard: {
    minWidth: 98,
    flex: 1,
    backgroundColor: "#1E566B",
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  metricGold: {
    backgroundColor: "#9F6B1F",
  },
  metricGreen: {
    backgroundColor: "#436F48",
  },
  metricLabel: {
    color: "#F9E7BF",
    fontSize: 12,
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#E7DFD0",
  },
  tabButtonActive: {
    backgroundColor: "#123C4A",
  },
  tabLabel: {
    color: "#5A5248",
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#FFF7E9",
  },
  sectionStack: {
    gap: 14,
  },
  card: {
    backgroundColor: "#FFF9EF",
    borderRadius: 24,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E7DFD0",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2B2925",
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: "#655D53",
  },
  cardBody: {
    gap: 14,
  },
  snapshotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: 220,
    backgroundColor: "#F8F4EC",
    borderRadius: 18,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "#DDD2C1",
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2C2A26",
  },
  summaryMain: {
    fontSize: 42,
    fontWeight: "800",
    color: "#163743",
    lineHeight: 44,
  },
  summaryDetail: {
    fontSize: 14,
    color: "#6A6258",
    fontWeight: "600",
  },
  summarySub: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5D564D",
  },
  summaryTrack: {
    height: 18,
    borderRadius: 999,
    backgroundColor: "#E5E7EA",
    overflow: "hidden",
  },
  summaryFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#63A64E",
  },
  snapshotPill: {
    backgroundColor: "#123C4A",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  snapshotLabel: {
    fontSize: 11,
    color: "#BED7DF",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  snapshotValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFF7E9",
  },
  formRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  inputGroup: {
    flex: 1,
    minWidth: 140,
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    color: "#5D554A",
    fontWeight: "600",
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4EFE4",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DED3C0",
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputAffix: {
    color: "#6F675C",
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: "#1F1C18",
    paddingVertical: 12,
  },
  resultPanel: {
    backgroundColor: "#F2E7D3",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  quickLinkButton: {
    alignSelf: "flex-start",
    backgroundColor: "#123C4A",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickLinkButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFF7E9",
  },
  whatIfScenarioPanel: {
    flex: 1,
    minWidth: 260,
  },
  paySummaryCard: {
    backgroundColor: "#F8F4EC",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#DDD2C1",
  },
  payControlsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-start",
  },
  resultLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: "#534D44",
  },
  resultValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#123C4A",
  },
  resultValueEmphasis: {
    color: "#8B5C14",
  },
  baseSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  baseChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#EDE2CF",
  },
  baseChipActive: {
    backgroundColor: "#8B5C14",
  },
  baseChipLabel: {
    color: "#544C43",
    fontWeight: "700",
  },
  baseChipLabelActive: {
    color: "#FFF8E6",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendColor: {
    width: 18,
    height: 18,
    borderRadius: 6,
  },
  legendBorder: {
    borderWidth: 1,
    borderColor: "#C9C0B2",
  },
  legendText: {
    fontSize: 13,
    color: "#564F46",
    fontWeight: "600",
  },
  identityCard: {
    backgroundColor: "#F6F1E8",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDD2C1",
    gap: 6,
  },
  identityName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E3B46",
  },
  identityMeta: {
    fontSize: 14,
    color: "#5E564D",
  },
  tableCard: {
    backgroundColor: "#FBF6ED",
    borderRadius: 18,
    padding: 12,
    gap: 6,
    borderWidth: 2,
    borderColor: "#CCBEAA",
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1D3A45",
  },
  tableMeta: {
    fontSize: 12,
    color: "#645B50",
    fontWeight: "600",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#D9CEBC",
  },
  tableHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: "#5F574D",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  tableRowHold: {
    backgroundColor: "#D8EFD2",
    borderColor: "#B5D5A9",
  },
  tableRowNoHold: {
    backgroundColor: "#F4D2D2",
    borderColor: "#D7ADAD",
  },
  tableRowCurrent: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CEC4B5",
  },
  tableRowNeutral: {
    backgroundColor: "#EEE5D6",
    borderColor: "#D9CEBC",
  },
  seatSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6A6054",
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(18, 24, 32, 0.42)",
    padding: 20,
    justifyContent: "center",
  },
  modalCard: {
    maxHeight: "80%",
    backgroundColor: "#FCF8EF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D9C9A5",
    padding: 18,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#173645",
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5F5A52",
  },
  modalCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E8DED0",
  },
  modalCloseText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#173645",
  },
  modalTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#D9C9A5",
    paddingBottom: 8,
    gap: 10,
  },
  modalScroll: {
    maxHeight: 420,
  },
  modalTableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE5D6",
  },
  modalNameCell: {
    flex: 1.6,
  },
  modalPilotName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#173645",
  },
  listCompareWrap: {
    gap: 12,
    marginBottom: 14,
  },
  listCompareColumns: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  listCompareCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: "#F6F1E8",
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#DDD2C1",
  },
  listCompareTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#173645",
  },
  listCompareMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5F5A52",
  },
  listCompareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE5D6",
  },
  listCompareRowSenior: {
    backgroundColor: "#CFEAFF",
  },
  listCompareRowYou: {
    backgroundColor: "#E8F3D1",
  },
  listCompareRowRetiring: {
    backgroundColor: "#F6D6D6",
  },
  listCompareRowJunior: {
    backgroundColor: "#F6F1E8",
  },
  listCompareNameWrap: {
    flex: 1,
    gap: 2,
  },
  listCompareName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#173645",
  },
  listCompareStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5F5A52",
  },
  listCompareContext: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6E675D",
  },
  listCompareNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: "#24535F",
  },
  baseNetBar: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#CCBEAA",
  },
  baseNetText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#24535F",
    textAlign: "center",
  },
  baseNetSubtext: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#5B544A",
    textAlign: "center",
  },
  seatDivider: {
    marginVertical: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#CCBEAA",
  },
  seatDividerText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6A6054",
  },
  tableCategoryCell: {
    flex: 1.7,
  },
  tableValueCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  tableCell: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#1E312F",
  },
  tableDelta: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B6358",
  },
  tableDeltaPositive: {
    color: "#4A9A42",
  },
  tableDeltaNegative: {
    color: "#C35044",
  },
  tableCategoryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1D3A45",
  },
  tableSubtext: {
    fontSize: 11,
    color: "#5C5348",
  },
  insightText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4D473F",
  },
  projectionCard: {
    backgroundColor: "#F6F1E8",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#DDD2C1",
  },
  projectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1D3A45",
  },
  projectionMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: "#655D53",
  },
  forecastControlRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  forecastGrowthWrap: {
    maxWidth: 220,
  },
  aeTargetWrap: {
    maxWidth: 340,
  },
  projectionRow: {
    gap: 6,
  },
  projectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5A5248",
  },
  projectionValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#123C4A",
  },
  projectionTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E5D8C7",
    overflow: "hidden",
  },
  projectionFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#436F48",
  },
  projectionStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  projectionStat: {
    fontSize: 12,
    color: "#665E54",
  },
  chartCard: {
    gap: 10,
  },
  chartLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dropdownWrap: {
    flex: 1,
    minWidth: 220,
    gap: 8,
  },
  payScenarioWrap: {
    flex: 1.2,
    minWidth: 220,
  },
  sliderWrap: {
    flex: 0.8,
    minWidth: 220,
    maxWidth: 420,
  },
  dropdownButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#F4EFE4",
    borderWidth: 1,
    borderColor: "#DED3C0",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F1C18",
  },
  dropdownMenu: {
    backgroundColor: "#FFF9EF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DED3C0",
    overflow: "hidden",
  },
  dropdownMenuTall: {
    maxHeight: 240,
    backgroundColor: "#FFF9EF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DED3C0",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE5D6",
  },
  dropdownItemText: {
    fontSize: 15,
    color: "#433D35",
    fontWeight: "600",
  },
  sliderCard: {
    backgroundColor: "#F4EFE4",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DED3C0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  sliderTrackShell: {
    paddingHorizontal: 2,
    marginTop: -6,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  sliderMetaGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sliderValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#123C4A",
  },
  sliderMeta: {
    fontSize: 10,
    color: "#6B6358",
    fontWeight: "600",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1D3A45",
  },
  chartSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#675F55",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingBottom: 4,
    minHeight: 210,
  },
  chartColumn: {
    width: 34,
    alignItems: "center",
    gap: 6,
  },
  chartValue: {
    fontSize: 10,
    color: "#5B68D8",
    fontWeight: "700",
    textAlign: "center",
  },
  chartValueFuture: {
    color: "#C77A20",
  },
  chartBarWrap: {
    width: 24,
    height: 130,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#EEE5D8",
    borderRadius: 8,
    paddingBottom: 2,
    position: "relative",
    overflow: "hidden",
  },
  chartBar: {
    width: 16,
    backgroundColor: "#6E79F6",
    borderRadius: 6,
  },
  chartBarFuture: {
    backgroundColor: "#F3A536",
  },
  chartReferenceMark: {
    position: "absolute",
    width: "100%",
    height: 2,
    left: 0,
    opacity: 0.95,
  },
  chartReferenceOne: {
    backgroundColor: "#B44A3B",
  },
  chartReferenceTwo: {
    backgroundColor: "#5D9C3F",
  },
  chartLabel: {
    fontSize: 10,
    color: "#685F54",
    textAlign: "center",
  },
  seniorityCard: {
    backgroundColor: "#F4EFE4",
    borderRadius: 20,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E1D7C7",
  },
  seniorityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  seniorityTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1D3A45",
  },
  seniorityRole: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7A5A27",
  },
  seniorityMeta: {
    fontSize: 13,
    color: "#655D53",
  },
});
