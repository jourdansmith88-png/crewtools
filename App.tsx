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
import { payAuditPriorityRules } from "./src/data/payAuditRules";
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
import {
  buildPayAuditContext,
  buildPayAuditResult,
} from "./src/utils/payAuditEngine";
import { parseDeltaTimecard, parseTimeValue } from "./src/utils/deltaTimecardParser";

const embeddedChartData = embeddedDeltaCharts as unknown as DeltaChartsData;

const premiumTypeOptions = [
  { key: "none", label: "None" },
  { key: "green-slip", label: "Green Slip" },
  { key: "silver-slip", label: "Silver Slip" },
  { key: "quick-slip", label: "Quick Slip" },
  { key: "inverse-assignment", label: "Inverse Assignment" },
] as const;

const payToolCards = [
  {
    key: "timecard-auditor",
    title: "Time Card Auditor",
    subtitle: "Paste a Delta monthly timecard and scan premiums, sick interactions, and payback clues.",
    cta: "Open Auditor",
    badge: "Live",
    glyph: "TC",
  },
  {
    key: "rotation-importer",
    title: "Rotation Importer",
    subtitle: "Connect the timecard back to the trip so we can audit what really happened operationally.",
    cta: "Coming Next",
    badge: "Roadmap",
    glyph: "RI",
  },
  {
    key: "statement-translator",
    title: "Statement Translator",
    subtitle: "Turn posted pay codes into plain English with Delta contract breadcrumbs.",
    cta: "Coming Next",
    badge: "Roadmap",
    glyph: "ST",
  },
  {
    key: "reroute-calculator",
    title: "Reroute Calculator",
    subtitle: "Check reroute and reassignment outcomes against the PWA instead of trusting payroll math.",
    cta: "Coming Next",
    badge: "Priority",
    glyph: "RR",
  },
  {
    key: "flight-pay",
    title: "Flight Pay Calculator",
    subtitle: "Roll the whole month together once schedules, leaves, premiums, and statements are all parsed.",
    cta: "Coming Next",
    badge: "Roadmap",
    glyph: "FP",
  },
] as const;

type TabKey = "home" | "schedule" | "pay" | "seniority" | "ae";
type SeatFilter = "All" | "Captain" | "First Officer";
type ChartStartMode = "hire" | "today";
type PayToolKey = (typeof payToolCards)[number]["key"];
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
type CategoryDetailSelection = {
  categoryKey: string;
  label: string;
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

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "seniority", label: "Seniority", icon: "#" },
  { key: "ae", label: "AE", icon: "⇄" },
  { key: "schedule", label: "Schedule", icon: "◷" },
  { key: "pay", label: "Pay", icon: "$" },
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
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<CategoryDetailSelection | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [aeSearch, setAeSearch] = useState("");
  const [categorySeatFilter, setCategorySeatFilter] = useState<SeatFilter>("All");
  const [aeSeatFilter, setAeSeatFilter] = useState<SeatFilter>("All");

  const [blockHours, setBlockHours] = useState("18");
  const [dutyHours, setDutyHours] = useState("31");
  const [layoverHours, setLayoverHours] = useState("11");
  const [legs, setLegs] = useState("5");

  const [hourlyRate, setHourlyRate] = useState("243");
  const [creditedHours, setCreditedHours] = useState("0");
  const [premiumHours, setPremiumHours] = useState("0");
  const [premiumType, setPremiumType] = useState<(typeof premiumTypeOptions)[number]["key"]>(
    "green-slip"
  );
  const [selectedPayTool, setSelectedPayTool] = useState<PayToolKey>("timecard-auditor");
  const [perDiemHours, setPerDiemHours] = useState("0");
  const [missedBreakPay, setMissedBreakPay] = useState("0");
  const [timecardRawInput, setTimecardRawInput] = useState("");
  const [timecardAuditRequested, setTimecardAuditRequested] = useState(false);
  const [actualBasePay, setActualBasePay] = useState("0");
  const [actualPremiumPay, setActualPremiumPay] = useState("0");
  const [actualPerDiem, setActualPerDiem] = useState("0");
  const [actualAdjustments, setActualAdjustments] = useState("0");
  const [actualPostedTotal, setActualPostedTotal] = useState("0");
  const [reserveStatus, setReserveStatus] = useState(false);
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
        parseAuditHoursInput(perDiemHours),
        Number(missedBreakPay) || 0
      ),
    [hourlyRate, creditedHours, premiumHours, perDiemHours, missedBreakPay]
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

  const selectedCategoryAssignments = useMemo(
    () =>
      selectedCategoryDetail
        ? latestCategoryAssignments
            .filter((entry) => entry.categoryKey === selectedCategoryDetail.categoryKey)
            .sort((left, right) => left.seniorityNumber - right.seniorityNumber)
        : [],
    [latestCategoryAssignments, selectedCategoryDetail]
  );

  const selectedCategoryPreviewRows = useMemo(() => {
    if (!selectedCategoryDetail) {
      return [];
    }

    const existing = [...selectedCategoryAssignments];
    if (!currentPilot || !userSeniorityNumber) {
      return existing;
    }

    const alreadyListed = existing.some(
      (assignment) => assignment.employeeNumber === currentPilot.employeeNumber
    );
    if (alreadyListed) {
      return existing;
    }

    const userRow: LatestCategoryAssignment & { synthetic?: boolean } = {
      employeeNumber: currentPilot.employeeNumber,
      name: currentPilot.name,
      seniorityNumber: currentPilot.seniorityNumber,
      base: "",
      fleet: "",
      seat: "",
      categoryKey: selectedCategoryDetail.categoryKey,
      awardCategory: selectedCategoryDetail.label,
      scheduledRetireDate: currentPilot.scheduledRetireDate,
      synthetic: true,
    };

    const inserted = [...existing, userRow];
    inserted.sort((left, right) => left.seniorityNumber - right.seniorityNumber);
    return inserted;
  }, [selectedCategoryAssignments, selectedCategoryDetail, currentPilot, userSeniorityNumber]);

  const categoryAssignmentsByKey = useMemo(() => {
    const grouped = new Map<string, LatestCategoryAssignment[]>();

    latestCategoryAssignments.forEach((assignment) => {
      const bucket = grouped.get(assignment.categoryKey) ?? [];
      bucket.push(assignment);
      grouped.set(assignment.categoryKey, bucket);
    });

    grouped.forEach((assignments) => {
      assignments.sort((left, right) => left.seniorityNumber - right.seniorityNumber);
    });

    return grouped;
  }, [latestCategoryAssignments]);

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

  const otherPilotSummary = useMemo(
    () => ({
      instructors: deltaSnapshot.operationalBases.reduce(
        (sum: number, base: BaseEntry) => sum + base.instructors,
        0
      ),
      carveoutPilots: deltaSnapshot.carveoutBases.reduce(
        (sum: number, base: BaseEntry) => sum + base.pilots,
        0
      ),
      total:
        deltaSnapshot.operationalBases.reduce(
          (sum: number, base: BaseEntry) => sum + base.instructors,
          0
        ) +
        deltaSnapshot.carveoutBases.reduce((sum: number, base: BaseEntry) => sum + base.pilots, 0),
    }),
    []
  );

  const totalInactivePilots = otherPilotSummary.carveoutPilots;

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

  const parsedTimecard = useMemo(() => parseDeltaTimecard(timecardRawInput), [timecardRawInput]);
  const parsedPremiumPayEquivalent = useMemo(() => {
    if (!parsedTimecard) {
      return 0;
    }
    return parsedTimecard.premiumHoursTotal * (Number(hourlyRate) || 0) * 2;
  }, [parsedTimecard, hourlyRate]);
  const parsedPremiumType = useMemo<(typeof premiumTypeOptions)[number]["key"]>(() => {
    if (!parsedTimecard || parsedTimecard.premiumHoursTotal <= 0) {
      return "none";
    }
    if (parseTimeValue(parsedTimecard.reserveAssignGqSlipPay) > 0) {
      return "inverse-assignment";
    }
    if (parseTimeValue(parsedTimecard.quickSlipPay) > 0) {
      return "quick-slip";
    }
    if (parseTimeValue(parsedTimecard.silverSlipPay) > 0) {
      return "silver-slip";
    }
    if (parseTimeValue(parsedTimecard.gsSlipPay) > 0) {
      return "green-slip";
    }
    return "none";
  }, [parsedTimecard]);
  const parsedTotalCreditHours = parsedTimecard ? parseTimeValue(parsedTimecard.totalCredit) : 0;
  const parsedVacationCreditHours = parsedTimecard ? parseTimeValue(parsedTimecard.vacationCreditUsed) : 0;
  const parsedAdditionalPayOnlyHours = parsedTimecard
    ? parseTimeValue(parsedTimecard.additionalPayOnlyTotal)
    : 0;
  const parsedApplicableBaseCreditHours = parsedTimecard
    ? parseTimeValue(parsedTimecard.creditApplicableToRegGs)
    : 0;
  const parsedDerivedBaseBeforeVacationHours =
    parsedApplicableBaseCreditHours > 0 && parsedVacationCreditHours > 0
      ? Math.max(0, parsedApplicableBaseCreditHours - parsedVacationCreditHours)
      : parsedTotalCreditHours;
  const parsedBasePayEquivalent = useMemo(() => {
    const baseCreditHours =
      parsedApplicableBaseCreditHours ||
      parsedTotalCreditHours + parsedVacationCreditHours;
    return baseCreditHours * (Number(hourlyRate) || 0);
  }, [parsedApplicableBaseCreditHours, parsedTotalCreditHours, parsedVacationCreditHours, hourlyRate]);
  const hasPostedBaseContext =
    (Number(actualBasePay) || 0) > 0 ||
    parsedTotalCreditHours > 0 ||
    (Number(actualPostedTotal) || 0) > 0;
  const effectiveActualPremiumPay =
    (Number(actualPremiumPay) || 0) > 0 ? Number(actualPremiumPay) || 0 : parsedPremiumPayEquivalent;
  const displayedDueCreditHours =
    parsedApplicableBaseCreditHours ||
    parsedTotalCreditHours + parsedVacationCreditHours ||
    Number(creditedHours) ||
    0;
  const displayedPremiumCreditHours = parsedTimecard?.premiumHoursTotal || Number(premiumHours) || 0;
  const displayedTotalCreditHours =
    displayedDueCreditHours + displayedPremiumCreditHours + parsedAdditionalPayOnlyHours;
  const effectiveActualBasePay =
    (Number(actualBasePay) || 0) > 0 ? Number(actualBasePay) || 0 : parsedBasePayEquivalent;
  const effectiveActualPostedTotal =
    (Number(actualPostedTotal) || 0) > 0
      ? Number(actualPostedTotal) || 0
      : hasPostedBaseContext
        ? effectiveActualBasePay +
          effectiveActualPremiumPay +
          (Number(actualPerDiem) || 0) +
          (Number(actualAdjustments) || 0)
        : 0;

  useEffect(() => {
    if (!parsedTimecard?.scheduleStatus) {
      return;
    }
    setReserveStatus(parsedTimecard.scheduleStatus === "reserve");
  }, [parsedTimecard?.scheduleStatus]);

  useEffect(() => {
    setTimecardAuditRequested(false);
    setCreditedHours("0");
    setActualBasePay("0");
    setActualPremiumPay("0");
    setActualPerDiem("0");
    setActualAdjustments("0");
    setActualPostedTotal("0");
    setPremiumHours("0");
    setPremiumType("none");
  }, [timecardRawInput]);

  const payAuditContext = useMemo(
    () =>
      buildPayAuditContext({
        base: currentPilot?.currentCategoryCode.slice(0, 3) ?? "ATL",
        fleet: activePayScenario?.code.replace(/[AB]$/, "") ?? "320",
        seat: activePayScenario?.seat === "Captain" ? "CA" : "FO",
        longevityYear: currentPilot ? derivePayYear(currentPilot.pilotHireDate) : 1,
        reserveStatus,
        month: "2026-04",
      }),
    [currentPilot, activePayScenario, reserveStatus]
  );

  const payAuditResult = useMemo(
    () =>
      buildPayAuditResult(payAuditContext, {
        hourlyRate: Number(hourlyRate) || 0,
        creditedHours: Number(creditedHours) || 0,
        premiumHours: Number(premiumHours) || 0,
        premiumType,
        tafbHours: parseAuditHoursInput(perDiemHours),
        missedBreakPay: Number(missedBreakPay) || 0,
        actualBasePay: effectiveActualBasePay,
        actualPremiumPay: effectiveActualPremiumPay,
        actualPerDiem: Number(actualPerDiem) || 0,
        actualAdjustments: Number(actualAdjustments) || 0,
        actualPostedTotal: effectiveActualPostedTotal,
      }),
    [
      payAuditContext,
      hourlyRate,
      creditedHours,
      premiumHours,
      premiumType,
      perDiemHours,
      missedBreakPay,
      actualBasePay,
      effectiveActualBasePay,
      actualPremiumPay,
      effectiveActualPremiumPay,
      actualPerDiem,
      actualAdjustments,
      actualPostedTotal,
      effectiveActualPostedTotal,
    ]
  );

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
        </View>

        {activeTab === "home" && (
          <View style={styles.sectionStack}>
            <SectionCard
              title="Latest Delta Snapshot"
              description={`Using ${deltaSnapshot.latestFiles.category}, ${deltaSnapshot.latestFiles.seniority}, and ${deltaSnapshot.latestFiles.ae}.`}
            >
              <View style={styles.identityCard}>
                {currentPilot ? (
                  <>
                    <Text style={styles.identityName}>{currentPilot.name}</Text>
                    <Text style={styles.identityMeta}>
                      Emp {currentPilot.employeeNumber} • Seniority #{currentPilot.seniorityNumber}
                    </Text>
                    <Text style={styles.identityMeta}>
                      {currentPilot.currentCategoryCode} • Hire {currentPilot.pilotHireDate}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.identityName}>Pilot Lookup</Text>
                    <Text style={styles.identityMeta}>
                      Enter an employee number to personalize the dashboard and category reads.
                    </Text>
                  </>
                )}
                <FormRow>
                  <LabeledInput
                    label="Employee Number"
                    value={employeeNumberInput}
                    onChangeText={setEmployeeNumberInput}
                  />
                </FormRow>
              </View>
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
                <SnapshotPill label="Total Pilots" value={`${systemTotalPilots}`} />
                <SnapshotPill label="Inactive Pilots" value={`${totalInactivePilots}`} />
                <SnapshotPill label="Live Bases" value={`${deltaSnapshot.operationalBases.length}`} />
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
                      subtitle="Past lists in navy, projected future in red. Lower percent means more senior."
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
                      subtitle="Past list position in navy, future estimated seniority number in red based on retirements to age 65. Growth changes list size, but not your rank number."
                      points={seniorityNumberSeries}
                    />
                    <MiniBarChart
                      title="Total Pilot Count"
                      subtitle={`Past list size in navy. Future projected list size in red using a ${Math.round(
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
                  </View>
                ))}
              </View>
              <View style={styles.sectionStack}>
                <Text style={styles.inputLabel}>Other Pilots</Text>
                <View style={styles.resultPanel}>
                  <ResultLine label="Total" value={`${otherPilotSummary.total}`} />
                  <ResultLine label="Instructor pilots" value={`${otherPilotSummary.instructors}`} />
                  <ResultLine label="Carveout pilots" value={`${otherPilotSummary.carveoutPilots}`} />
                  <Text style={styles.insightText}>
                    Includes instructors plus carveout groups like NBC, INS, and SUP that are useful
                    for visibility but not treated as normal operating bases.
                  </Text>
                </View>
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
            description="Pilot-first pay tools: open the right calculator, paste the company data, and get a verdict with a contract breadcrumb."
          >
            <View style={styles.payToolGrid}>
              {payToolCards.map((tool) => (
                <TouchableOpacity
                  key={tool.key}
                  activeOpacity={0.9}
                  style={[
                    styles.payToolCard,
                    selectedPayTool === tool.key && styles.payToolCardActive,
                  ]}
                  onPress={() => setSelectedPayTool(tool.key)}
                >
                  <View style={styles.payToolHero}>
                    <Text style={styles.payToolGlyph}>{tool.glyph}</Text>
                    <Text style={styles.payToolBadge}>{tool.badge}</Text>
                  </View>
                  <View style={styles.payToolBody}>
                    <Text style={styles.payToolTitle}>{tool.title}</Text>
                    <Text style={styles.payToolSubtitle}>{tool.subtitle}</Text>
                  </View>
                  <Text style={styles.payToolButton}>
                    {selectedPayTool === tool.key ? "Open Now" : tool.cta}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedPayTool === "timecard-auditor" ? (
              <>
            <View style={styles.sectionStack}>
              <Text style={styles.inputLabel}>1. Paste Delta Monthly Timecard</Text>
              <TextAreaInput
                label="Raw timecard text"
                value={timecardRawInput}
                onChangeText={setTimecardRawInput}
                placeholder="Paste the Delta Monthly Time Data text here. The app will parse premium lines, trigger values, payback days, and key audit clues."
              />
              <TouchableOpacity
                style={[
                  styles.auditButton,
                  !parsedTimecard && styles.auditButtonDisabled,
                ]}
                disabled={!parsedTimecard}
                onPress={() => {
                  if (!parsedTimecard) {
                    return;
                  }
                  const parsedAuditBaseHours =
                    parsedApplicableBaseCreditHours ||
                    parsedTotalCreditHours + parsedVacationCreditHours;
                  setCreditedHours(parsedAuditBaseHours.toFixed(2));
                  setPremiumHours(parsedTimecard.premiumHoursTotal.toFixed(2));
                  setPremiumType(parsedPremiumType);
                  setTimecardAuditRequested(true);
                }}
              >
                <Text style={styles.auditButtonText}>Audit Timecard</Text>
              </TouchableOpacity>
              {timecardAuditRequested && parsedTimecard ? (
                <View style={styles.auditSummaryHero}>
                  <View style={styles.auditSummaryHeader}>
                    <Text style={styles.auditSummaryTitle}>
                      {payAuditResult.findings.some((finding) => finding.severity === "high")
                        ? "Likely incorrect"
                        : payAuditResult.findings.length > 0
                          ? "Needs review"
                          : "Looks correct so far"}
                    </Text>
                    <Text style={styles.auditSummaryMeta}>
                      {payAuditResult.findings.length} potential discrepancy
                      {payAuditResult.findings.length === 1 ? "" : "ies"}
                    </Text>
                  </View>
                  <View style={styles.auditSummaryMetrics}>
                    <SnapshotPill label="Total Credit" value={`${displayedTotalCreditHours.toFixed(2)} hrs`} />
                  </View>
                  <Text style={styles.auditSummaryFormula}>
                    {`${formatHoursToClock(displayedDueCreditHours)} base`}
                    {parsedAdditionalPayOnlyHours > 0
                      ? ` + ${formatHoursToClock(parsedAdditionalPayOnlyHours)} addtl`
                      : ""}
                    {displayedPremiumCreditHours > 0
                      ? ` + ${formatHoursToClock(displayedPremiumCreditHours)} premium`
                      : ""}
                    {` = ${formatHoursToClock(displayedTotalCreditHours)} total`}
                  </Text>
                </View>
              ) : null}
              {timecardAuditRequested && parsedTimecard ? (
                <View style={styles.resultPanel}>
                  <Text style={styles.inputLabel}>2. What The Auditor Saw</Text>
                  <ResultLine label="Pilot / bid period" value={`${parsedTimecard.pilotName ?? "Unknown"} • ${parsedTimecard.bidPeriod ?? "Unknown period"}`} />
                  <ResultLine
                    label="Category / listed ALV"
                    value={`${parsedTimecard.categoryCode ?? "Unknown"} • ${parsedTimecard.alv ?? "Unknown ALV"}`}
                  />
                  {parsedApplicableBaseCreditHours > 0 ? (
                    <ResultLine
                      label="Base month credit"
                      value={parsedTimecard.creditApplicableToRegGs ?? "Unknown"}
                    />
                  ) : null}
                  <ResultLine
                    label="Total credit on card"
                    value={parsedTimecard.totalCredit ?? "Unknown"}
                  />
                  {parsedVacationCreditHours > 0 ? (
                    <ResultLine
                      label="Vacation used in month"
                      value={parsedTimecard.vacationCreditUsed ?? "0:00"}
                    />
                  ) : null}
                  {parsedAdditionalPayOnlyHours > 0 ? (
                    <ResultLine
                      label="Additional pay only from activity rows"
                      value={parsedTimecard.additionalPayOnlyTotal ?? "0:00"}
                    />
                  ) : null}
                  <ResultLine
                    label="Detected month type"
                    value={
                      parsedTimecard.scheduleStatus === "reserve"
                        ? "Reserve"
                        : parsedTimecard.scheduleStatus === "lineholder"
                          ? "Lineholder"
                          : "Unknown"
                    }
                  />
                  <ResultLine label="Pasted premium credit" value={`${parsedTimecard.premiumHoursTotal.toFixed(2)} hrs`} />
                  <ResultLine
                    label="Derived posted premium"
                    value={formatCurrency(parsedPremiumPayEquivalent)}
                  />
                  <ResultLine
                    label="Premium lines found"
                    value={`GS ${parsedTimecard.gsSlipPay ?? "0:00"} • QS ${parsedTimecard.quickSlipPay ?? "0:00"} • SS ${parsedTimecard.silverSlipPay ?? "0:00"} • RES G/Q ${parsedTimecard.reserveAssignGqSlipPay ?? "0:00"}`}
                  />
                  <ResultLine
                    label="Sick / payback clues"
                    value={`Sick entries ${parsedTimecard.sickEntries} • Sick bank deduction ${parsedTimecard.sickBankDeduction ?? "0:00"} • Payback days ${parsedTimecard.paybackDaysAvailable ?? 0}`}
                  />
                  <ResultLine
                    label="Contract clue"
                    value={
                      parsedTimecard.sickEntries > 0
                        ? "Section 14 E.2 sick bank deduction / Section 23 premium flying / MOU #25-05 quick-slip improvements"
                        : "Section 23 premium flying / MOU #25-05 quick-slip improvements"
                    }
                  />
                  <Text style={styles.insightText}>
                    This paste-in flow uses the Delta timecard as posted evidence. If the findings say
                    `Likely incorrect`, the rule line below is the reference a pilot can start with when
                    disputing the pay result.
                  </Text>
                </View>
              ) : null}
            </View>
            {timecardAuditRequested ? (
              <>
                <View style={styles.resultPanel}>
                  <Text style={styles.inputLabel}>3. What The Auditor Thinks Is Due</Text>
                  {parsedApplicableBaseCreditHours > 0 && parsedVacationCreditHours > 0 ? (
                    <ResultLine
                      label="Base Credit Before Vacation"
                      value={`${parsedDerivedBaseBeforeVacationHours.toFixed(2)} hrs`}
                    />
                  ) : null}
                  {parsedVacationCreditHours > 0 ? (
                    <ResultLine
                      label="Vacation Credit Added"
                      value={`${parsedVacationCreditHours.toFixed(2)} hrs`}
                    />
                  ) : null}
                  <ResultLine
                    label="Base Month Credit"
                    value={`${displayedDueCreditHours.toFixed(2)} hrs`}
                  />
                  {parsedAdditionalPayOnlyHours > 0 ? (
                    <ResultLine
                      label="Additional Pay Only Credit"
                      value={`${parsedAdditionalPayOnlyHours.toFixed(2)} hrs`}
                    />
                  ) : null}
                  <ResultLine
                    label="Premium Credit Due"
                    value={`${displayedPremiumCreditHours.toFixed(2)} hrs`}
                  />
                  <ResultLine
                    label="Total Credit Due"
                    value={`${displayedTotalCreditHours.toFixed(2)} hrs`}
                    emphasis
                  />
                </View>
                <View style={styles.sectionStack}>
                  <Text style={styles.inputLabel}>4. Discrepancies</Text>
                  {payAuditResult.findings.length > 0 ? (
                    payAuditResult.findings.map((finding) => (
                      <View key={finding.id} style={styles.resultPanel}>
                        <ResultLine
                          label={`${finding.severity.toUpperCase()} • ${finding.confidence} confidence`}
                          value={finding.title}
                          emphasis
                        />
                        <ResultLine
                          label="Expected vs actual"
                          value={`${formatCurrency(finding.expectedAmount ?? 0)} / ${formatCurrency(
                            finding.actualAmount ?? 0
                          )}`}
                        />
                        <ResultLine
                          label="Variance"
                          value={`${finding.variance != null && finding.variance >= 0 ? "+" : "-"}${formatCurrency(
                            Math.abs(finding.variance ?? 0)
                          )}`}
                        />
                        <ResultLine label="Contract / rule" value={finding.ruleRef} />
                        <Text style={styles.insightText}>{finding.explanation}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.resultPanel}>
                      <Text style={styles.insightText}>
                        No discrepancies are flagged by the current rule set. That does not guarantee the
                        month is clean yet, but the auditor does not see an obvious mismatch from the
                        pasted timecard and current assumptions.
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.sectionStack}>
                  <Text style={styles.inputLabel}>Refine Audit Inputs</Text>
                  <FormRow>
                    <LabeledInput label="Hourly Rate" value={hourlyRate} onChangeText={setHourlyRate} prefix="$" />
                    <LabeledInput label="Credited Hours" value={creditedHours} onChangeText={setCreditedHours} />
                  </FormRow>
                  <FormRow>
                    <LabeledInput label="Premium Hours" value={premiumHours} onChangeText={setPremiumHours} />
                  </FormRow>
                  <Text style={styles.inputLabel}>Premium Event</Text>
                  <View style={styles.baseSelector}>
                    {premiumTypeOptions.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[styles.baseChip, premiumType === option.key && styles.baseChipActive]}
                        onPress={() => {
                          setPremiumType(option.key);
                          if (option.key === "none") {
                            setPremiumHours("0");
                          } else if ((Number(premiumHours) || 0) === 0) {
                            setPremiumHours("5");
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.baseChipLabel,
                            premiumType === option.key && styles.baseChipLabelActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <FormRow>
                    <LabeledInput label="Missed Break Pay" value={missedBreakPay} onChangeText={setMissedBreakPay} prefix="$" />
                    <LabeledInput label="Actual Base Pay" value={actualBasePay} onChangeText={setActualBasePay} prefix="$" />
                  </FormRow>
                  <FormRow>
                    <LabeledInput label="Actual Premium Pay" value={actualPremiumPay} onChangeText={setActualPremiumPay} prefix="$" />
                    <LabeledInput label="Actual Per Diem" value={actualPerDiem} onChangeText={setActualPerDiem} prefix="$" />
                  </FormRow>
                  <FormRow>
                    <LabeledInput label="Actual Adjustments" value={actualAdjustments} onChangeText={setActualAdjustments} prefix="$" />
                    <LabeledInput label="Posted Total" value={actualPostedTotal} onChangeText={setActualPostedTotal} prefix="$" />
                  </FormRow>
                  <Text style={styles.inputLabel}>Status This Month</Text>
                  <View style={styles.baseSelector}>
                    <TouchableOpacity
                      style={[styles.baseChip, !reserveStatus && styles.baseChipActive]}
                      onPress={() => setReserveStatus(false)}
                    >
                      <Text style={[styles.baseChipLabel, !reserveStatus && styles.baseChipLabelActive]}>
                        Lineholder
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.baseChip, reserveStatus && styles.baseChipActive]}
                      onPress={() => setReserveStatus(true)}
                    >
                      <Text style={[styles.baseChipLabel, reserveStatus && styles.baseChipLabelActive]}>
                        Reserve
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.sectionStack}>
                  <Text style={styles.inputLabel}>Rules Ledger Assumptions</Text>
                  {payAuditResult.assumptions.map((assumption) => (
                    <View key={assumption} style={styles.resultPanel}>
                      <Text style={styles.insightText}>{assumption}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
              </>
            ) : (
              <View style={styles.payToolPlaceholder}>
                <Text style={styles.payToolPlaceholderTitle}>
                  {payToolCards.find((tool) => tool.key === selectedPayTool)?.title ?? "Pay Tool"}
                </Text>
                <Text style={styles.payToolPlaceholderText}>
                  This tool is queued behind the timecard auditor. It will reuse the same Delta-first
                  parser, rules ledger, and contract-reference explanation model that the auditor is
                  already using.
                </Text>
              </View>
            )}
          </SectionCard>
        )}

        {activeTab === "seniority" && (
          <SectionCard
            title="Seniority"
            description="Navy means the selected pilot can hold it. Red means they cannot. White is the current category. SR, MID, and Junior show the holding line bands for each category."
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
              <LegendSwatch label="Can hold" color="#E4EEF8" />
              <LegendSwatch label="Cannot hold" color="#F8E1E5" />
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
                  </View>
                  <Text style={styles.seatSectionLabel}>Captain</Text>
                  {captainRows.map((entry) => {
                    const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
                    const trend = categoryTrendMap.get(entry.key) ?? null;
                    const categoryAssignments = categoryAssignmentsByKey.get(entry.key) ?? [];
                    const userPosition = describeUserCategoryPosition(
                      entry,
                      fit,
                      userSeniorityNumber,
                      currentPilot,
                      categoryAssignments
                    );
                    return (
                      <TouchableOpacity
                        key={entry.key}
                        style={[styles.tableRow, rowStyleForHold(fit.label)]}
                        onPress={() =>
                          setSelectedCategoryDetail({
                            categoryKey: entry.key,
                            label: formatCategoryEntryCode(entry),
                          })
                        }
                        activeOpacity={0.88}
                      >
                        <View style={styles.tableCategoryCell}>
                          <Text style={styles.tableCategoryText}>
                            {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                          </Text>
                          <Text style={styles.tableSubtext}>{fit.label} • Tap for list</Text>
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
                          primary={userPosition.secondary ?? userPosition.primary}
                        />
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
                    const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
                    const trend = categoryTrendMap.get(entry.key) ?? null;
                    const categoryAssignments = categoryAssignmentsByKey.get(entry.key) ?? [];
                    const userPosition = describeUserCategoryPosition(
                      entry,
                      fit,
                      userSeniorityNumber,
                      currentPilot,
                      categoryAssignments
                    );
                    return (
                      <TouchableOpacity
                        key={entry.key}
                        style={[styles.tableRow, rowStyleForHold(fit.label)]}
                        onPress={() =>
                          setSelectedCategoryDetail({
                            categoryKey: entry.key,
                            label: formatCategoryEntryCode(entry),
                          })
                        }
                        activeOpacity={0.88}
                      >
                        <View style={styles.tableCategoryCell}>
                          <Text style={styles.tableCategoryText}>
                            {entry.fleet} FO
                          </Text>
                          <Text style={styles.tableSubtext}>{fit.label} • Tap for list</Text>
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
                          primary={userPosition.secondary ?? userPosition.primary}
                        />
                      </TouchableOpacity>
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
                <LegendSwatch label="Award went junior to you" color="#E4EEF8" />
                <LegendSwatch label="Award stayed senior" color="#F8E1E5" />
                <LegendSwatch label="Close / no clear line" color="#EEF3F8" />
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
                  <ResultLine
                    label={`Current Junior ${entry.seat === "Captain" ? "CA" : "FO"}`}
                    value={`#${entry.latestJuniorNumber}`}
                  />
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
                Navy means the latest AE award reached junior to your number, red means the
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
                      <Text style={styles.tableHeaderCell}>You</Text>
                    </View>
                    <Text style={styles.seatSectionLabel}>Captain</Text>
                    {captainRows.map((entry) => {
                      const fit = evaluateAeReach(entry, userSeniorityNumber);
                      const categoryAssignments =
                        categoryAssignmentsByKey.get(buildCategoryKeyFromAeCategory(entry.awardCategory)) ?? [];
                      const userPosition = describeAeCategoryPosition(
                        entry,
                        userSeniorityNumber,
                        currentPilot,
                        categoryAssignments
                      );
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
                          <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
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
                      const categoryAssignments =
                        categoryAssignmentsByKey.get(buildCategoryKeyFromAeCategory(entry.awardCategory)) ?? [];
                      const userPosition = describeAeCategoryPosition(
                        entry,
                        userSeniorityNumber,
                        currentPilot,
                        categoryAssignments
                      );
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
                          <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
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

            <View
              style={styles.sectionStack}
              onLayout={(event) => setWhatIfSectionY(event.nativeEvent.layout.y)}
            >
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
                    <ResultLine
                      label={`Current Junior ${activeWhatIfCategory.seat === "Captain" ? "CA" : "FO"}`}
                      value={`#${activeWhatIfCategory.mostJuniorNumber}`}
                    />
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
                          label={`Projected Junior ${activeWhatIfCategory.seat === "Captain" ? "CA" : "FO"}`}
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
      <View style={styles.bottomTabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <View style={[styles.tabIconCircle, activeTab === tab.key && styles.tabIconCircleActive]}>
              <Text
                style={[
                  styles.tabIconText,
                  tab.icon.length > 1 && styles.tabIconTextWide,
                  activeTab === tab.key && styles.tabIconTextActive,
                ]}
              >
                {tab.icon}
              </Text>
            </View>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Modal
        visible={selectedCategoryDetail != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCategoryDetail(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalTitle}>
                    {selectedCategoryDetail?.label ?? "Category List"}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Current category list in seniority order. Colored to show who is senior to you,
                    junior to you, retiring soon, and where you would slot into the category.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setSelectedCategoryDetail(null)}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.resultPanel}>
                <ResultLine
                  label="Current pilots"
                  value={`${selectedCategoryAssignments.length}`}
                />
                <ResultLine
                  label="Most senior"
                  value={formatSeniorityValue(selectedCategoryAssignments[0]?.seniorityNumber ?? null)}
                />
                <ResultLine
                  label="Most junior"
                  value={formatSeniorityValue(selectedCategoryAssignments.at(-1)?.seniorityNumber ?? null)}
                />
                {currentPilot ? (
                  <ResultLine
                    label="You"
                    value={
                      (() => {
                        const rank = selectedCategoryPreviewRows.findIndex(
                          (row) => row.employeeNumber === currentPilot.employeeNumber
                        );
                        if (rank < 0) {
                          return `#${currentPilot.seniorityNumber}`;
                        }
                        const total = selectedCategoryPreviewRows.length;
                        const percent = Math.round(((rank + 1) / Math.max(total, 1)) * 100);
                        return `${percent}%`;
                      })()
                    }
                  />
                ) : null}
              </View>
              <View style={styles.legendRow}>
                <LegendSwatch label="Senior to you" color="#CFEAFF" />
                <LegendSwatch label="You / near your number" color="#E8F3D1" />
                <LegendSwatch label="Retiring soon" color="#F6D6D6" />
                <LegendSwatch label="Junior to you" color="#F6F1E8" />
              </View>
              <View style={styles.modalTableHeader}>
                <Text style={[styles.tableHeaderCell, styles.modalNameCell]}>Pilot</Text>
                <Text style={styles.tableHeaderCell}>#</Text>
              </View>
              <View style={styles.listCompareWrap}>
                {selectedCategoryPreviewRows.map((pilot) => {
                  const rowState = getAeCompareRowState(pilot, currentPilot);
                  const synthetic = "synthetic" in pilot && Boolean(pilot.synthetic);
                  return (
                    <View
                      key={`category-preview-${pilot.employeeNumber}-${pilot.seniorityNumber}`}
                      style={[styles.listCompareRow, rowState.style]}
                    >
                      <View style={styles.listCompareNameWrap}>
                        <Text style={styles.listCompareName}>
                          {synthetic ? currentPilot?.name ?? "You" : pilot.name}
                        </Text>
                        <Text style={styles.listCompareStatus}>
                          {synthetic ? "You would slot here" : rowState.label}
                        </Text>
                        <Text style={styles.listCompareContext}>
                          {synthetic ? "Projected position in this category" : "Current holder"}
                        </Text>
                      </View>
                      <Text style={styles.listCompareNumber}>#{pilot.seniorityNumber}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={selectedAeDetailCategory != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAeDetailCategory(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
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
                          label="Awards"
                          value={`${activeAeAwardRows.length}`}
                        />
                        <ResultLine
                          label="Bypass awards"
                          value={`${activeAeAwardRows.filter((row) => row.bypassAward).length}`}
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

function parseAuditHoursInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.includes(":") ? parseTimeValue(trimmed) : Number(trimmed) || 0;
}

function formatHoursToClock(value: number) {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
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
  userSeniorityNumber: number,
  currentPilot: PilotRecord | null,
  categoryAssignments: readonly LatestCategoryAssignment[]
) {
  if (!userSeniorityNumber) {
    return { primary: "-", secondary: null as string | null };
  }
  if (fit.label === "Current category") {
    if (currentPilot?.currentCategoryRank && currentPilot.currentCategoryTotal) {
      const percent = Math.round(
        (currentPilot.currentCategoryRank / currentPilot.currentCategoryTotal) * 100
      );
      return {
        primary: `${currentPilot.currentCategoryRank}/${currentPilot.currentCategoryTotal}`,
        secondary: `${percent}%`,
      };
    }
    return { primary: `#${userSeniorityNumber}`, secondary: null };
  }
  const gap = userSeniorityNumber - entry.mostJuniorNumber;
  if (gap <= 0) {
    if (categoryAssignments.length > 0) {
      const existingRank = currentPilot
        ? categoryAssignments.findIndex(
            (assignment) => assignment.employeeNumber === currentPilot.employeeNumber
          )
        : -1;

      const rank =
        existingRank >= 0
          ? existingRank + 1
          : categoryAssignments.filter(
              (assignment) => assignment.seniorityNumber < userSeniorityNumber
            ).length + 1;
      const total = existingRank >= 0 ? categoryAssignments.length : categoryAssignments.length + 1;
      const percent = total > 0 ? Math.round((rank / total) * 100) : null;

      return {
        primary: `${rank}/${total}`,
        secondary: percent != null ? `${percent}%` : null,
      };
    }

    const categorySpan = Math.max(1, entry.mostJuniorNumber - entry.mostSeniorNumber);
    const relativePosition = Math.max(
      0,
      Math.min(1, (userSeniorityNumber - entry.mostSeniorNumber) / categorySpan)
    );
    const estimatedRank = Math.max(
      1,
      Math.min(entry.pilotCount, Math.round(relativePosition * (entry.pilotCount - 1)) + 1)
    );
    const percent = entry.pilotCount > 0 ? Math.round((estimatedRank / entry.pilotCount) * 100) : null;
    return {
      primary: `${estimatedRank}/${entry.pilotCount}`,
      secondary: percent != null ? `${percent}%` : null,
    };
  }
  return { primary: `+${gap}`, secondary: null };
}

function describeAeCategoryPosition(
  entry: AeEntry,
  userSeniorityNumber: number,
  currentPilot: PilotRecord | null,
  categoryAssignments: readonly LatestCategoryAssignment[]
) {
  if (!userSeniorityNumber || entry.mostJuniorAwardNumber == null) {
    return { primary: "-", secondary: null as string | null };
  }

  const gap = userSeniorityNumber - entry.mostJuniorAwardNumber;
  if (gap > 0) {
    return { primary: `+${gap}`, secondary: null as string | null };
  }

  if (categoryAssignments.length > 0) {
    const existingRank = currentPilot
      ? categoryAssignments.findIndex(
          (assignment) => assignment.employeeNumber === currentPilot.employeeNumber
        )
      : -1;
    const rank =
      existingRank >= 0
        ? existingRank + 1
        : categoryAssignments.filter(
            (assignment) => assignment.seniorityNumber < userSeniorityNumber
          ).length + 1;
    const total = existingRank >= 0 ? categoryAssignments.length : categoryAssignments.length + 1;
    const percent = total > 0 ? Math.round((rank / total) * 100) : null;

    return {
      primary: `${rank}/${total}`,
      secondary: percent != null ? `${percent}%` : null,
    };
  }

  return { primary: "hold", secondary: null as string | null };
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

function TextAreaInput({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.textAreaShell}>
        <TextInput
          multiline
          value={value}
          onChangeText={onChangeText}
          style={styles.textAreaInput}
          placeholder={placeholder}
          placeholderTextColor="#7B7367"
          textAlignVertical="top"
          autoCapitalize="characters"
        />
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
    backgroundColor: "#EEF3F8",
  },
  container: {
    padding: 20,
    paddingBottom: 120,
    gap: 18,
  },
  hero: {
    backgroundColor: "#0C2340",
    borderRadius: 28,
    padding: 22,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#C7D3E3",
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#F8FBFF",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#D6E0EC",
  },
  heroMetrics: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  metricCard: {
    minWidth: 98,
    flex: 1,
    backgroundColor: "#16395D",
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  metricGold: {
    backgroundColor: "#A6192E",
  },
  metricGreen: {
    backgroundColor: "#234B73",
  },
  metricLabel: {
    color: "#D7E2EE",
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
  bottomTabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
    backgroundColor: "#F7FAFD",
    borderTopWidth: 1,
    borderTopColor: "#CFD9E5",
  },
  tabButton: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#E7EEF6",
    alignItems: "center",
    gap: 8,
  },
  tabButtonActive: {
    backgroundColor: "#EAF0F7",
  },
  tabIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#D3DEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconCircleActive: {
    backgroundColor: "#A6192E",
  },
  tabIconText: {
    color: "#30465F",
    fontWeight: "900",
    fontSize: 22,
    lineHeight: 24,
  },
  tabIconTextWide: {
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 0.4,
  },
  tabIconTextActive: {
    color: "#F8FBFF",
  },
  tabLabel: {
    color: "#30465F",
    fontWeight: "700",
    fontSize: 12,
  },
  tabLabelActive: {
    color: "#A6192E",
  },
  sectionStack: {
    gap: 14,
  },
  card: {
    backgroundColor: "#FBFDFF",
    borderRadius: 24,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: "#CFD9E5",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#102A43",
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: "#55677D",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "#D4DEE9",
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#102A43",
  },
  summaryMain: {
    fontSize: 42,
    fontWeight: "800",
    color: "#0C2340",
    lineHeight: 44,
  },
  summaryDetail: {
    fontSize: 14,
    color: "#6B7C93",
    fontWeight: "600",
  },
  summarySub: {
    fontSize: 13,
    lineHeight: 19,
    color: "#52606D",
  },
  summaryTrack: {
    height: 18,
    borderRadius: 999,
    backgroundColor: "#E3EAF2",
    overflow: "hidden",
  },
  summaryFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#A6192E",
  },
  snapshotPill: {
    backgroundColor: "#0C2340",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  snapshotLabel: {
    fontSize: 11,
    color: "#C9D7E6",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  snapshotValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#F8FBFF",
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
    color: "#52606D",
    fontWeight: "600",
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CFD9E5",
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputAffix: {
    color: "#6B7C93",
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: "#102A43",
    paddingVertical: 12,
  },
  textAreaShell: {
    backgroundColor: "#F7FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CFD9E5",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 220,
  },
  textAreaInput: {
    minHeight: 192,
    fontSize: 15,
    lineHeight: 21,
    color: "#102A43",
  },
  resultPanel: {
    backgroundColor: "#F5F8FC",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  quickLinkButton: {
    alignSelf: "flex-start",
    backgroundColor: "#A6192E",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickLinkButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#F8FBFF",
  },
  whatIfScenarioPanel: {
    flex: 1,
    minWidth: 260,
  },
  paySummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#D4DEE9",
  },
  payToolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 8,
  },
  payToolCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4DEE9",
  },
  payToolCardActive: {
    borderColor: "#A6192E",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  payToolHero: {
    minHeight: 104,
    backgroundColor: "#E8EFF7",
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "space-between",
  },
  payToolGlyph: {
    fontSize: 28,
    fontWeight: "900",
    color: "#A6192E",
  },
  payToolBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    color: "#0C2340",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  payToolBody: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 8,
  },
  payToolTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0C2340",
  },
  payToolSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#52606D",
  },
  payToolButton: {
    marginHorizontal: 18,
    marginBottom: 18,
    backgroundColor: "#A6192E",
    color: "#F8FBFF",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    borderRadius: 12,
    overflow: "hidden",
    paddingVertical: 12,
  },
  payToolPlaceholder: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "#D4DEE9",
  },
  payToolPlaceholderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0C2340",
  },
  payToolPlaceholderText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#52606D",
  },
  auditButton: {
    alignSelf: "flex-start",
    backgroundColor: "#A6192E",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  auditButtonDisabled: {
    backgroundColor: "#9FB2C8",
  },
  auditButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#F8FBFF",
  },
  auditSummaryHero: {
    backgroundColor: "#EAF1F8",
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#CFD9E5",
  },
  auditSummaryHeader: {
    gap: 4,
  },
  auditSummaryTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0C2340",
  },
  auditSummaryMeta: {
    fontSize: 13,
    color: "#52606D",
    fontWeight: "700",
  },
  auditSummaryMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  auditSummaryFormula: {
    fontSize: 13,
    color: "#52606D",
    fontWeight: "700",
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
    color: "#52606D",
  },
  resultValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0C2340",
  },
  resultValueEmphasis: {
    color: "#A6192E",
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
    backgroundColor: "#E7EEF6",
  },
  baseChipActive: {
    backgroundColor: "#A6192E",
  },
  baseChipLabel: {
    color: "#334E68",
    fontWeight: "700",
  },
  baseChipLabelActive: {
    color: "#F8FBFF",
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
    borderColor: "#B8C7D9",
  },
  legendText: {
    fontSize: 13,
    color: "#52606D",
    fontWeight: "600",
  },
  identityCard: {
    backgroundColor: "#F7FAFC",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D4DEE9",
    gap: 6,
  },
  identityName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0C2340",
  },
  identityMeta: {
    fontSize: 14,
    color: "#52606D",
  },
  tableCard: {
    backgroundColor: "#FDFEFF",
    borderRadius: 18,
    padding: 12,
    gap: 6,
    borderWidth: 2,
    borderColor: "#C5D2E1",
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0C2340",
  },
  tableMeta: {
    fontSize: 12,
    color: "#6B7C93",
    fontWeight: "600",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#D7E0EA",
  },
  tableHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: "#52606D",
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
    backgroundColor: "#E4EEF8",
    borderColor: "#B8CBE0",
  },
  tableRowNoHold: {
    backgroundColor: "#F8E1E5",
    borderColor: "#E5B7C0",
  },
  tableRowCurrent: {
    backgroundColor: "#FFFFFF",
    borderColor: "#C7D2E0",
  },
  tableRowNeutral: {
    backgroundColor: "#EEF3F8",
    borderColor: "#D7E0EA",
  },
  seatSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6B7C93",
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(18, 24, 32, 0.42)",
    padding: 20,
    justifyContent: "center",
  },
  modalCard: {
    maxHeight: "88%",
    backgroundColor: "#FCF8EF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D9C9A5",
    padding: 18,
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
    flexGrow: 0,
  },
  modalScrollContent: {
    gap: 14,
    paddingBottom: 12,
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
    color: "#102A43",
  },
  tableDelta: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7C93",
  },
  tableDeltaPositive: {
    color: "#355C7D",
  },
  tableDeltaNegative: {
    color: "#A6192E",
  },
  tableCategoryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0C2340",
  },
  tableSubtext: {
    fontSize: 11,
    color: "#52606D",
  },
  insightText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#52606D",
  },
  projectionCard: {
    backgroundColor: "#F7FAFC",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#D4DEE9",
  },
  projectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0C2340",
  },
  projectionMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: "#52606D",
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
    color: "#52606D",
  },
  projectionValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0C2340",
  },
  projectionTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#DCE4EE",
    overflow: "hidden",
  },
  projectionFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#A6192E",
  },
  projectionStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  projectionStat: {
    fontSize: 12,
    color: "#6B7C93",
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
    backgroundColor: "#F7FAFC",
    borderWidth: 1,
    borderColor: "#CFD9E5",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#102A43",
  },
  dropdownMenu: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFD9E5",
    overflow: "hidden",
  },
  dropdownMenuTall: {
    maxHeight: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFD9E5",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E3EAF2",
  },
  dropdownItemText: {
    fontSize: 15,
    color: "#334E68",
    fontWeight: "600",
  },
  sliderCard: {
    backgroundColor: "#F7FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CFD9E5",
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
    color: "#0C2340",
  },
  sliderMeta: {
    fontSize: 10,
    color: "#6B7C93",
    fontWeight: "600",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0C2340",
  },
  chartSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#52606D",
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
    color: "#16395D",
    fontWeight: "700",
    textAlign: "center",
  },
  chartValueFuture: {
    color: "#A6192E",
  },
  chartBarWrap: {
    width: 24,
    height: 130,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#E3EAF2",
    borderRadius: 8,
    paddingBottom: 2,
    position: "relative",
    overflow: "hidden",
  },
  chartBar: {
    width: 16,
    backgroundColor: "#0C2340",
    borderRadius: 6,
  },
  chartBarFuture: {
    backgroundColor: "#C8102E",
  },
  chartReferenceMark: {
    position: "absolute",
    width: "100%",
    height: 2,
    left: 0,
    opacity: 0.95,
  },
  chartReferenceOne: {
    backgroundColor: "#A6192E",
  },
  chartReferenceTwo: {
    backgroundColor: "#5B7FA3",
  },
  chartLabel: {
    fontSize: 10,
    color: "#6B7C93",
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
