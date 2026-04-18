import { StatusBar } from "expo-status-bar";
import { Component, useEffect, useMemo, useRef, useState } from "react";
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
  useWindowDimensions,
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
type HoldLabel = "Current category" | "Can Hold" | "Close" | "Senior to You" | "No pilot";
type AeReachLabel =
  | "Junior to You"
  | "Close"
  | "Senior to You"
  | "No line yet"
  | "No pilot";
type PilotPriorityKey =
  | "upgrade-in-base"
  | "widebody-fo"
  | "better-captain-seat"
  | "commute-quality"
  | "systemwide-opportunities";
type MobileCategoryFilterKey =
  | "all"
  | "can-hold"
  | "close"
  | "senior-to-you"
  | "captain"
  | "fo"
  | "my-bases"
  | "goals";
type PilotPreferences = {
  currentCategory: string;
  homeBase: string;
  commute: boolean;
  commuteOrigin: string;
  commuterBases: string[];
  priority: PilotPriorityKey;
  goalCategories: string[];
};

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

const preferenceStorageKey = "crewtools.mobilePreferences";
const pilotPriorities: { key: PilotPriorityKey; label: string; shortLabel: string }[] = [
  { key: "upgrade-in-base", label: "Upgrade in base", shortLabel: "Upgrade" },
  { key: "widebody-fo", label: "Widebody FO", shortLabel: "Widebody FO" },
  { key: "better-captain-seat", label: "Better captain seat", shortLabel: "Better CA" },
  { key: "commute-quality", label: "Commute quality", shortLabel: "Commute" },
  { key: "systemwide-opportunities", label: "Systemwide opportunities", shortLabel: "Systemwide" },
];
const mobileCategoryFilters: { key: MobileCategoryFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "can-hold", label: "Can Hold" },
  { key: "close", label: "Close" },
  { key: "senior-to-you", label: "Senior to You" },
  { key: "captain", label: "Captain" },
  { key: "fo", label: "FO" },
  { key: "my-bases", label: "My Bases" },
  { key: "goals", label: "Goals" },
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

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (Platform.OS === "web") {
      console.error("CrewTools runtime error", error);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.container, { justifyContent: "center", flexGrow: 1 }]}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>CrewTools hit a runtime error</Text>
              <Text style={styles.sectionDescription}>
                The page loaded, but one screen crashed during render.
              </Text>
              <View style={styles.identityCard}>
                <Text style={styles.identityName}>Error details</Text>
                <Text style={styles.identityMeta}>
                  {this.state.error.message || "Unknown runtime error"}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const { width } = useWindowDimensions();
  const isCompactMobile = width < 520;
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
  const [mobilePreferences, setMobilePreferences] = useState<PilotPreferences>({
    currentCategory: "",
    homeBase: "",
    commute: false,
    commuteOrigin: "",
    commuterBases: [],
    priority: "upgrade-in-base",
    goalCategories: [],
  });
  const [mobilePreferencesLoaded, setMobilePreferencesLoaded] = useState(false);
  const [mobilePreferencesEditing, setMobilePreferencesEditing] = useState(true);
  const [mobilePreferencesEditorInitialized, setMobilePreferencesEditorInitialized] = useState(false);
  const [mobileGoalInput, setMobileGoalInput] = useState("");
  const [mobileCategoryFilter, setMobileCategoryFilter] =
    useState<MobileCategoryFilterKey>("all");

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
    if (Platform.OS !== "web") {
      setMobilePreferencesLoaded(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(preferenceStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PilotPreferences>;
        setMobilePreferences((current) => ({
          ...current,
          ...parsed,
          commuterBases: Array.isArray(parsed.commuterBases) ? parsed.commuterBases : current.commuterBases,
          goalCategories: Array.isArray(parsed.goalCategories) ? parsed.goalCategories : current.goalCategories,
          priority:
            parsed.priority && pilotPriorities.some((option) => option.key === parsed.priority)
              ? parsed.priority
              : current.priority,
        }));
      }
    } catch {
      // Keep defaults if storage is unavailable or malformed.
    } finally {
      setMobilePreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!mobilePreferencesLoaded || Platform.OS !== "web") {
      return;
    }

    window.localStorage.setItem(preferenceStorageKey, JSON.stringify(mobilePreferences));
  }, [mobilePreferences, mobilePreferencesLoaded]);

  useEffect(() => {
    if (!mobilePreferencesLoaded || mobilePreferencesEditorInitialized) {
      return;
    }

    const seededHomeBase =
      mobilePreferences.homeBase || currentPilot?.currentCategoryCode?.slice(0, 3) || "";
    const preferencesAreComplete = Boolean(
      currentPilot &&
        seededHomeBase &&
        (!mobilePreferences.commute ||
          mobilePreferences.commuterBases.length > 0 ||
          mobilePreferences.commuteOrigin.trim())
    );

    setMobilePreferencesEditing(!preferencesAreComplete);
    setMobilePreferencesEditorInitialized(true);
  }, [
    mobilePreferencesLoaded,
    mobilePreferencesEditorInitialized,
    mobilePreferences.homeBase,
    mobilePreferences.commute,
    mobilePreferences.commuterBases,
    mobilePreferences.commuteOrigin,
    currentPilot,
  ]);

  useEffect(() => {
    if (!currentPilot) {
      return;
    }

    setMobilePreferences((current) => ({
      ...current,
      currentCategory: current.currentCategory || currentPilot.currentCategoryCode,
      homeBase: current.homeBase || currentPilot.currentCategoryCode?.slice(0, 3) || "",
    }));
  }, [currentPilot]);

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

    return dedupeChartPointsByLabel(
      allPoints.map((point) => ({
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
      }))
    );
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

    return dedupeChartPointsByLabel([...past, ...future]);
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

    return dedupeChartPointsByLabel([...past, ...future]);
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
  const projectedCategoryPercent =
    projectedCategoryRank && projectedCategoryTotal
      ? Math.round((projectedCategoryRank / projectedCategoryTotal) * 100)
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
  const preferredCurrentCategoryCode =
    currentPilot?.currentCategoryCode || mobilePreferences.currentCategory || "";
  const preferredCurrentCategoryKey =
    buildCategoryKeyFromCategoryCode(preferredCurrentCategoryCode) ||
    currentPilot?.currentCategoryKey ||
    null;
  const preferredHomeBase =
    mobilePreferences.homeBase || currentPilot?.currentCategoryCode?.slice(0, 3) || "";
  const relevantBases = useMemo(() => {
    const basesToUse = [
      preferredHomeBase,
      ...(mobilePreferences.commute ? mobilePreferences.commuterBases : []),
    ].filter(Boolean);
    return Array.from(new Set(basesToUse));
  }, [preferredHomeBase, mobilePreferences.commute, mobilePreferences.commuterBases]);
  const goalCategoryKeys = useMemo(
    () =>
      mobilePreferences.goalCategories
        .map((goal) => normalizeCategoryPreference(goal))
        .filter(Boolean) as string[],
    [mobilePreferences.goalCategories]
  );
  const preferredCurrentCategoryEntry =
    deltaSnapshot.categories.find((entry) => entry.key === preferredCurrentCategoryKey) ?? null;
  const preferredCurrentAeEntry =
    deltaSnapshot.aeOpportunities.find(
      (entry) => entry.awardCategory === buildAwardCategoryFromCategoryCode(preferredCurrentCategoryCode)
    ) ?? null;
  const preferredCurrentAeTrend =
    (deltaSnapshot.aeTrends as readonly AeTrendEntry[]).find(
      (entry) => entry.awardCategory === buildAwardCategoryFromCategoryCode(preferredCurrentCategoryCode)
    ) ?? null;
  const preferredCurrentAeReach = preferredCurrentAeEntry
    ? evaluateAeReach(preferredCurrentAeEntry, userSeniorityNumber)
    : null;
  const preferredCurrentAeMovement =
    preferredCurrentAeEntry ? aeMovementByCategory.get(preferredCurrentAeEntry.awardCategory) ?? null : null;
  const mobileRelevantHoldEntries = useMemo(
    () => {
      try {
        return buildRelevantHoldEntries({
          entries: deltaSnapshot.categories,
          currentPilot,
          userSeniorityNumber,
          currentCategoryKey,
          relevantBases,
          priority: mobilePreferences.priority,
          goalCategoryKeys,
          categoryAssignmentsByKey,
        });
      } catch {
        return [];
      }
    },
    [
      currentPilot,
      userSeniorityNumber,
      currentCategoryKey,
      relevantBases,
      mobilePreferences.priority,
      goalCategoryKeys,
      categoryAssignmentsByKey,
    ]
  );
  const mobileMovementFeed = useMemo(
    () => {
      try {
        return buildMobileMovementFeed({
          aeEntries: deltaSnapshot.aeOpportunities,
          aeTrends: deltaSnapshot.aeTrends as readonly AeTrendEntry[],
          categoryTrends: deltaSnapshot.categoryTrends,
          userSeniorityNumber,
          relevantBases,
          priority: mobilePreferences.priority,
          goalCategoryKeys,
        });
      } catch {
        return [];
      }
    },
    [
      userSeniorityNumber,
      relevantBases,
      mobilePreferences.priority,
      goalCategoryKeys,
    ]
  );
  const mobileCareerMilestones = useMemo(
    () => {
      try {
        return buildCareerMilestones({
          currentPilot,
          categories: deltaSnapshot.categories,
          pilots: deltaSnapshot.pilotDirectory as readonly PilotRecord[],
          relevantBases,
          priority: mobilePreferences.priority,
          goalCategoryKeys,
        });
      } catch {
        return [];
      }
    },
    [currentPilot, relevantBases, mobilePreferences.priority, goalCategoryKeys]
  );
  const mobileFilteredCategoryEntries = useMemo(
    () => {
      try {
        return buildMobileCategoryCards({
          entries: deltaSnapshot.categories,
          currentPilot,
          userSeniorityNumber,
          currentCategoryKey,
          relevantBases,
          goalCategoryKeys,
          filter: mobileCategoryFilter,
          categoryAssignmentsByKey,
        });
      } catch {
        return [];
      }
    },
    [
      currentPilot,
      userSeniorityNumber,
      currentCategoryKey,
      relevantBases,
      goalCategoryKeys,
      mobileCategoryFilter,
      categoryAssignmentsByKey,
    ]
  );
  const trackedCategoryEntries = useMemo(
    () => {
      try {
        return goalCategoryKeys
          .map((goalKey) => deltaSnapshot.categories.find((entry) => entry.key === goalKey) ?? null)
          .filter(Boolean)
          .map((entry) =>
            buildMobileCategoryCardDatum(
              entry as CategoryEntry,
              currentPilot,
              userSeniorityNumber,
              currentCategoryKey,
              goalCategoryKeys,
              categoryAssignmentsByKey
            )
          );
      } catch {
        return [];
      }
    },
    [
      goalCategoryKeys,
      currentPilot,
      userSeniorityNumber,
      currentCategoryKey,
      categoryAssignmentsByKey,
    ]
  );
  const mobilePreferencesComplete = Boolean(currentPilot);
  const selectedCategoryEntry =
    selectedCategoryDetail
      ? deltaSnapshot.categories.find((entry) => entry.key === selectedCategoryDetail.categoryKey) ?? null
      : null;
  const selectedCategoryFit =
    selectedCategoryEntry ? evaluateCategoryHold(selectedCategoryEntry, userSeniorityNumber, currentCategoryKey) : null;
  const selectedCategoryTrend =
    selectedCategoryEntry ? categoryTrendMap.get(selectedCategoryEntry.key) ?? null : null;
  const selectedAeEntry =
    selectedAeDetailCategory
      ? deltaSnapshot.aeOpportunities.find(
          (entry) =>
            entry.awardCategory === selectedAeDetailCategory.awardCategory &&
            entry.seat === selectedAeDetailCategory.seat
        ) ?? null
      : null;
  const selectedAeFit = selectedAeEntry ? evaluateAeReach(selectedAeEntry, userSeniorityNumber) : null;
  const selectedAeTrend =
    selectedAeDetailCategory
      ? (deltaSnapshot.aeTrends as readonly AeTrendEntry[]).find(
          (entry) =>
            entry.awardCategory === selectedAeDetailCategory.awardCategory &&
            entry.seat === selectedAeDetailCategory.seat
        ) ?? null
      : null;

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
        base: currentPilot?.currentCategoryCode?.slice(0, 3) ?? "ATL",
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
    <AppErrorBoundary>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Delta Pilot Toolkit</Text>
          <Text style={styles.title}>CrewTools</Text>
          <Text style={styles.subtitle}>
            Know what you can hold... dream of what you can't.
          </Text>
        </View>

        {activeTab === "home" && (
          <MobileHomeDashboard
            currentPilot={currentPilot}
            employeeNumberInput={employeeNumberInput}
            onEmployeeNumberChange={setEmployeeNumberInput}
            preferences={mobilePreferences}
            onPreferencesChange={setMobilePreferences}
            preferencesEditing={mobilePreferencesEditing}
            onPreferencesEditingChange={setMobilePreferencesEditing}
            preferencesComplete={mobilePreferencesComplete}
            goalInput={mobileGoalInput}
            onGoalInputChange={setMobileGoalInput}
            currentCategoryEntry={preferredCurrentCategoryEntry}
            currentCategoryMovement={preferredCurrentAeMovement}
            currentCategoryReach={preferredCurrentAeReach}
            currentCategoryTrend={preferredCurrentAeTrend}
              systemPercent={systemPercent}
              systemTotalPilots={systemTotalPilots}
              currentCategoryPercent={currentCategoryPercent}
            currentCategorySummary={currentCategorySummary}
            projectedCategoryPercent={projectedCategoryPercent}
            projectedCategoryRank={projectedCategoryRank}
            projectedCategoryTotal={projectedCategoryTotal}
            relevantHolds={mobileRelevantHoldEntries}
            trackedCategories={trackedCategoryEntries}
            onOpenTrackedCategory={(entry) =>
              setSelectedCategoryDetail({
                categoryKey: entry.key,
                label: formatCategoryEntryCode(entry),
              })
            }
            growthRate={growthRate}
            onGrowthRateChange={(value) => {
              setGrowthRate(value);
              setForecastGrowthRate(value);
              setGrowthMenuOpen(false);
            }}
            growthMenuOpen={growthMenuOpen}
            onGrowthMenuToggle={() => setGrowthMenuOpen((current) => !current)}
            seniorityPercentSeries={seniorityPercentSeries}
            seniorityNumberSeries={seniorityNumberSeries}
            totalPilotCountSeries={totalPilotCountSeries}
          />
        )}

        {activeTab === "schedule" && (
          isCompactMobile ? (
            <MobileCareerPlanningView
              currentPilot={currentPilot}
              preferences={mobilePreferences}
              milestones={mobileCareerMilestones}
              activeWhatIfCategory={activeWhatIfCategory}
              whatIfSeat={whatIfSeat}
              setWhatIfSeat={setWhatIfSeat}
              whatIfFleetOptions={whatIfFleetOptions}
              selectedWhatIfFleet={selectedWhatIfFleet}
              setSelectedWhatIfFleet={setSelectedWhatIfFleet}
              whatIfBaseOptions={whatIfBaseOptions}
              selectedWhatIfBase={selectedWhatIfBase}
              setSelectedWhatIfBase={setSelectedWhatIfBase}
              whatIfEstimates={whatIfEstimates}
            />
          ) : (
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
          )
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
          isCompactMobile ? (
            <MobileCategoriesView
              currentPilot={currentPilot}
              entries={mobileFilteredCategoryEntries}
              filter={mobileCategoryFilter}
              onFilterChange={setMobileCategoryFilter}
              relevantBases={relevantBases}
              onOpenCategory={(entry) =>
                setSelectedCategoryDetail({
                  categoryKey: entry.key,
                  label: formatCategoryEntryCode(entry),
                })
              }
            />
          ) : (
          <SectionCard
            title="Seniority"
            description="Green means you can hold it. Beige means it is close. Red means the category is still senior to you. White is the current category."
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
              <LegendSwatch label="Can Hold" color="#D8EFD2" />
              <LegendSwatch label="Senior to You" color="#F8E1E5" />
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
                  {!isCompactMobile ? (
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                      <Text style={styles.tableHeaderCell}>SR</Text>
                      <Text style={styles.tableHeaderCell}>MID</Text>
                      <Text style={styles.tableHeaderCell}>JR</Text>
                      <Text style={styles.tableHeaderCell}>You</Text>
                    </View>
                  ) : null}
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
                        style={[
                          isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                          rowStyleForHold(fit.label),
                        ]}
                        onPress={() =>
                          setSelectedCategoryDetail({
                            categoryKey: entry.key,
                            label: formatCategoryEntryCode(entry),
                          })
                        }
                        activeOpacity={0.88}
                      >
                        {isCompactMobile ? (
                          <>
                            <View style={styles.mobileCategoryHeader}>
                              <View style={styles.mobileCategoryTitleWrap}>
                                <Text style={styles.tableCategoryText}>
                                  {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                                </Text>
                                <Text style={styles.tableSubtext}>{fit.label} • Tap for list</Text>
                              </View>
                              <View style={styles.mobileCategoryBadge}>
                                <Text style={styles.mobileCategoryBadgeText}>
                                  {userPosition.secondary ?? userPosition.primary}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.mobileMetricGrid}>
                              <MobileMetric label="SR" value={`#${entry.mostSeniorNumber}`} />
                              <MobileMetric
                                label="MID"
                                value={
                                  entry.middleSeniorityNumber != null
                                    ? `#${entry.middleSeniorityNumber}`
                                    : "-"
                                }
                              />
                              <MobileMetric
                                label="Junior"
                                value={`#${entry.mostJuniorNumber}`}
                                detail={formatSignedChange(trend?.lineMovement ?? null, "#")}
                                detailTone={toneForDelta(trend?.lineMovement ?? null)}
                              />
                              <MobileMetric
                                label="You"
                                value={userPosition.secondary ?? userPosition.primary}
                              />
                            </View>
                          </>
                        ) : (
                          <>
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
                            <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
                          </>
                        )}
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
                        style={[
                          isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                          rowStyleForHold(fit.label),
                        ]}
                        onPress={() =>
                          setSelectedCategoryDetail({
                            categoryKey: entry.key,
                            label: formatCategoryEntryCode(entry),
                          })
                        }
                        activeOpacity={0.88}
                      >
                        {isCompactMobile ? (
                          <>
                            <View style={styles.mobileCategoryHeader}>
                              <View style={styles.mobileCategoryTitleWrap}>
                                <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                                <Text style={styles.tableSubtext}>{fit.label} • Tap for list</Text>
                              </View>
                              <View style={styles.mobileCategoryBadge}>
                                <Text style={styles.mobileCategoryBadgeText}>
                                  {userPosition.secondary ?? userPosition.primary}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.mobileMetricGrid}>
                              <MobileMetric label="SR" value={`#${entry.mostSeniorNumber}`} />
                              <MobileMetric
                                label="MID"
                                value={
                                  entry.middleSeniorityNumber != null
                                    ? `#${entry.middleSeniorityNumber}`
                                    : "-"
                                }
                              />
                              <MobileMetric
                                label="Junior"
                                value={`#${entry.mostJuniorNumber}`}
                                detail={formatSignedChange(trend?.lineMovement ?? null, "#")}
                                detailTone={toneForDelta(trend?.lineMovement ?? null)}
                              />
                              <MobileMetric
                                label="You"
                                value={userPosition.secondary ?? userPosition.primary}
                              />
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
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
                            <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
                          </>
                        )}
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
                High is the most senior award, Mid is the middle award, and Junior is the latest award line reached in the newest posting.
              </Text>
              <View style={styles.legendRow}>
                <LegendSwatch label="Junior to You" color="#D8EFD2" />
                <LegendSwatch label="Senior to You" color="#F8E1E5" />
                <LegendSwatch label="Close" color="#F4E9D2" />
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
          )
        )}

        {activeTab === "ae" && (
          isCompactMobile ? (
            <MobileMovementView
              currentPilot={currentPilot}
              currentCategoryCode={preferredCurrentCategoryCode}
              currentCategoryMovement={preferredCurrentAeMovement}
              currentCategoryReach={preferredCurrentAeReach}
              currentCategoryTrend={preferredCurrentAeTrend}
              feedItems={mobileMovementFeed}
              onOpenAe={(item) =>
                setSelectedAeDetailCategory({
                  awardCategory: item.entry.awardCategory,
                  seat: item.entry.seat,
                })
              }
            />
          ) : (
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
              <ResultLine label="Junior to You" value={`${aeSummary.wentJunior}`} />
              <ResultLine label="Close" value={`${aeSummary.close}`} />
            </View>

            <View style={styles.legendRow}>
              <LegendSwatch label="Junior to You" color="#D8EFD2" />
              <LegendSwatch label="Senior to You" color="#F4D2D2" />
              <LegendSwatch label="Close" color="#EEE5D6" />
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
                    {!isCompactMobile ? (
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeaderCell, styles.tableCategoryCell]}>Category</Text>
                        <Text style={styles.tableHeaderCell}>High</Text>
                        <Text style={styles.tableHeaderCell}>Mid</Text>
                        <Text style={styles.tableHeaderCell}>Low</Text>
                        <Text style={styles.tableHeaderCell}>You</Text>
                      </View>
                    ) : null}
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
                          style={[
                            isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                            rowStyleForAeReach(fit.label),
                          ]}
                          onPress={() =>
                            setSelectedAeDetailCategory({
                              awardCategory: entry.awardCategory,
                              seat: entry.seat,
                            })
                          }
                          activeOpacity={0.88}
                        >
                          {isCompactMobile ? (
                            <>
                              <View style={styles.mobileCategoryHeader}>
                                <View style={styles.mobileCategoryTitleWrap}>
                                  <Text style={styles.tableCategoryText}>
                                    {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                                  </Text>
                                  <Text style={styles.tableSubtext}>{fit.label} • Tap for awards</Text>
                                </View>
                                <View style={styles.mobileCategoryBadge}>
                                  <Text style={styles.mobileCategoryBadgeText}>
                                    {userPosition.secondary ?? userPosition.primary}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.mobileMetricGrid}>
                                <MobileMetric
                                  label="High"
                                  value={formatSeniorityValue(entry.mostSeniorAwardNumber)}
                                />
                                <MobileMetric
                                  label="Mid"
                                  value={formatSeniorityValue(entry.middleAwardNumber)}
                                />
                                <MobileMetric
                                  label={`Junior ${entry.seat === "Captain" ? "CA" : "FO"}`}
                                  value={formatSeniorityValue(entry.mostJuniorAwardNumber)}
                                />
                                <MobileMetric
                                  label="You"
                                  value={userPosition.secondary ?? userPosition.primary}
                                />
                              </View>
                            </>
                          ) : (
                            <>
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
                            </>
                          )}
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
                          style={[
                            isCompactMobile ? styles.mobileCategoryCard : styles.tableRow,
                            rowStyleForAeReach(fit.label),
                          ]}
                          onPress={() =>
                            setSelectedAeDetailCategory({
                              awardCategory: entry.awardCategory,
                              seat: entry.seat,
                            })
                          }
                          activeOpacity={0.88}
                        >
                          {isCompactMobile ? (
                            <>
                              <View style={styles.mobileCategoryHeader}>
                                <View style={styles.mobileCategoryTitleWrap}>
                                  <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                                  <Text style={styles.tableSubtext}>{fit.label} • Tap for awards</Text>
                                </View>
                                <View style={styles.mobileCategoryBadge}>
                                  <Text style={styles.mobileCategoryBadgeText}>
                                    {userPosition.secondary ?? userPosition.primary}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.mobileMetricGrid}>
                                <MobileMetric
                                  label="High"
                                  value={formatSeniorityValue(entry.mostSeniorAwardNumber)}
                                />
                                <MobileMetric
                                  label="Mid"
                                  value={formatSeniorityValue(entry.middleAwardNumber)}
                                />
                                <MobileMetric
                                  label="Junior FO"
                                  value={formatSeniorityValue(entry.mostJuniorAwardNumber)}
                                />
                                <MobileMetric
                                  label="You"
                                  value={userPosition.secondary ?? userPosition.primary}
                                />
                              </View>
                            </>
                          ) : (
                            <>
                              <View style={styles.tableCategoryCell}>
                                <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                                <Text style={styles.tableSubtext}>{fit.label} • Tap for awards</Text>
                              </View>
                              <TableValueCell primary={formatSeniorityValue(entry.mostSeniorAwardNumber)} />
                              <TableValueCell primary={formatSeniorityValue(entry.middleAwardNumber)} />
                              <TableValueCell primary={formatSeniorityValue(entry.mostJuniorAwardNumber)} />
                              <TableValueCell primary={userPosition.secondary ?? userPosition.primary} />
                            </>
                          )}
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
          )
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
              {isCompactMobile ? mobileTabLabel(tab.key) : tab.label}
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
        <View style={[styles.modalBackdrop, isCompactMobile && styles.modalBackdropCompact]}>
          <View style={[styles.modalCard, isCompactMobile && styles.modalCardCompact]}>
            <TouchableOpacity
              style={styles.modalFloatingCloseButton}
              onPress={() => setSelectedCategoryDetail(null)}
            >
              <Text style={styles.modalFloatingCloseText}>X</Text>
            </TouchableOpacity>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                isCompactMobile && styles.modalScrollContentCompact,
              ]}
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
              </View>
              <View style={[styles.resultPanel, isCompactMobile && styles.modalSummaryPanelCompact]}>
                {selectedCategoryFit ? (
                  <ResultLine label="Quick status" value={selectedCategoryFit.label === "Current category" ? "Can Hold" : selectedCategoryFit.label} />
                ) : null}
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
                {selectedCategoryTrend ? (
                  <ResultLine
                    label="Trend direction"
                    value={`${describeMovementDirection(selectedCategoryTrend.lineMovement)} • ${formatSignedChange(selectedCategoryTrend.lineMovement, "#") ?? "Flat"}`}
                  />
                ) : null}
                {selectedCategoryEntry ? (
                  <ResultLine
                    label="Career relevance"
                    value={goalCategoryKeys.includes(selectedCategoryEntry.key) ? "Goal category" : `${selectedCategoryEntry.base} ${selectedCategoryEntry.seat === "Captain" ? "Captain" : "FO"} bid option`}
                  />
                ) : null}
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
                <LegendSwatch label="Senior to you" color="#F8E1E5" />
                <LegendSwatch label="You" color="#E4EEF8" />
                <LegendSwatch label="Retiring soon" color="#F6D6D6" />
                <LegendSwatch label="Junior to you" color="#D8EFD2" />
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
                      style={[
                        styles.listCompareRow,
                        isCompactMobile && styles.listCompareRowCompact,
                        rowState.style,
                      ]}
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
                      <Text
                        style={[
                          styles.listCompareNumber,
                          isCompactMobile && styles.listCompareNumberCompact,
                        ]}
                      >
                        #{pilot.seniorityNumber}
                      </Text>
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
        <View style={[styles.modalBackdrop, isCompactMobile && styles.modalBackdropCompact]}>
          <View style={[styles.modalCard, isCompactMobile && styles.modalCardCompact]}>
            <TouchableOpacity
              style={styles.modalFloatingCloseButton}
              onPress={() => setSelectedAeDetailCategory(null)}
            >
              <Text style={styles.modalFloatingCloseText}>X</Text>
            </TouchableOpacity>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                isCompactMobile && styles.modalScrollContentCompact,
              ]}
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
              </View>
              <View style={styles.modalTableHeader}>
                <Text style={[styles.tableHeaderCell, styles.modalNameCell]}>Pilot</Text>
                <Text style={styles.tableHeaderCell}>#</Text>
              </View>
              {selectedAeDetailCategory ? (
                <View style={[styles.resultPanel, isCompactMobile && styles.modalSummaryPanelCompact]}>
                  {(() => {
                    const totalMovement = buildTotalMovement(activeAeMovement, activeAeResidual);
                    return (
                      <>
                        {selectedAeFit ? (
                          <ResultLine label="Quick status" value={selectedAeFit.label} />
                        ) : null}
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
                        {selectedAeTrend ? (
                          <ResultLine
                            label="Trend direction"
                            value={`${describeMovementDirection(selectedAeTrend.lineMovement)} • ${formatSignedChange(selectedAeTrend.lineMovement, "#") ?? "Flat"}`}
                          />
                        ) : null}
                        {selectedAeEntry ? (
                          <ResultLine
                            label="Career relevance"
                            value={goalCategoryKeys.includes(buildCategoryKeyFromAeCategory(selectedAeEntry.awardCategory)) ? "Goal category" : `${selectedAeEntry.base} ${selectedAeEntry.seat === "Captain" ? "Captain" : "FO"} opportunity`}
                          />
                        ) : null}
                      </>
                    );
                  })()}
                </View>
              ) : null}
              {selectedAeDetailCategory ? (
                <View style={styles.listCompareWrap}>
                  <View style={styles.legendRow}>
                    <LegendSwatch label="Senior to you" color="#F8E1E5" />
                    <LegendSwatch label="You" color="#E4EEF8" />
                    <LegendSwatch label="Retiring soon" color="#F6D6D6" />
                    <LegendSwatch label="Junior to you" color="#D8EFD2" />
                  </View>
                  <View style={styles.listCompareColumns}>
                    <View style={[styles.listCompareCard, isCompactMobile && styles.listCompareCardCompact]}>
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
                            style={[
                              styles.listCompareRow,
                              isCompactMobile && styles.listCompareRowCompact,
                              rowState.style,
                            ]}
                          >
                            <View style={styles.listCompareNameWrap}>
                              <Text style={styles.listCompareName}>{pilot.name}</Text>
                              <Text style={styles.listCompareStatus}>{rowState.label}</Text>
                              <Text style={styles.listCompareContext}>
                                From {pilot.previousCategory || "Unknown"}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.listCompareNumber,
                                isCompactMobile && styles.listCompareNumberCompact,
                              ]}
                            >
                              #{pilot.seniorityNumber}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={[styles.listCompareCard, isCompactMobile && styles.listCompareCardCompact]}>
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
                            style={[
                              styles.listCompareRow,
                              isCompactMobile && styles.listCompareRowCompact,
                              rowState.style,
                            ]}
                          >
                            <View style={styles.listCompareNameWrap}>
                              <Text style={styles.listCompareName}>{pilot.name}</Text>
                              <Text style={styles.listCompareStatus}>{rowState.label}</Text>
                              <Text style={styles.listCompareContext}>
                                To {pilot.awardCategory || "Unknown"}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.listCompareNumber,
                                isCompactMobile && styles.listCompareNumberCompact,
                              ]}
                            >
                              #{pilot.seniorityNumber}
                            </Text>
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
    </AppErrorBoundary>
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

function dedupeChartPointsByLabel(points: ChartPoint[]) {
  const deduped = new Map<string, ChartPoint>();
  points.forEach((point) => {
    deduped.set(point.label.replace(/\s+/g, "").toUpperCase(), point);
  });
  return Array.from(deduped.values());
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
  const parsedDate = dateFromMonthKey(monthKey);
  if (parsedDate) {
    return `${parsedDate.toLocaleString("en-US", { month: "short" })}${parsedDate.getFullYear()}`;
  }

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
      label: "Can Hold" as HoldLabel,
      note: `Pilot is senior enough to hold this category now.`,
    };
  }

  if (gap <= 300) {
    return {
      label: "Close" as HoldLabel,
      note: `Pilot is ${gap} numbers junior to the current line.`,
    };
  }

  return {
    label: "Senior to You" as HoldLabel,
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
      label: "Junior to You" as AeReachLabel,
      note: "The latest AE award reached at least to this pilot's number.",
    };
  }

  if (gap <= 250) {
    return {
      label: "Close" as AeReachLabel,
      note: `Pilot is ${gap} numbers junior to the latest AE award line.`,
    };
  }

  return {
    label: "Senior to You" as AeReachLabel,
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
      if (result.label === "Can Hold") {
        acc.canHold += 1;
      }
      if (result.label === "Close") {
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
      if (result.label === "Junior to You") {
        acc.wentJunior += 1;
      }
      if (result.label === "Close") {
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
  if (label === "Can Hold") {
    return styles.tableRowHold;
  }
  if (label === "Senior to You") {
    return styles.tableRowNoHold;
  }
  return styles.tableRowNeutral;
}

function rowStyleForAeReach(label: string) {
  if (label === "Junior to You") {
    return styles.tableRowHold;
  }
  if (label === "Senior to You") {
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

function MobileMetric({
  label,
  value,
  detail,
  detailTone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string | null;
  detailTone?: "positive" | "negative" | "neutral";
}) {
  return (
    <View style={styles.mobileMetricCard}>
      <Text style={styles.mobileMetricLabel}>{label}</Text>
      <Text style={styles.mobileMetricValue}>{value}</Text>
      {detail ? (
        <Text
          style={[
            styles.mobileMetricDetail,
            detailTone === "positive" && styles.tableDeltaPositive,
            detailTone === "negative" && styles.tableDeltaNegative,
          ]}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function MiniBarChart({
  title,
  subtitle,
  points,
  showTrack = true,
}: {
  title: string;
  subtitle: string;
  points: ChartPoint[];
  showTrack?: boolean;
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 520;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const hasReferenceLines = points.some(
    (point) => point.referenceOnePercent != null || point.referenceTwoPercent != null
  );

  return (
    <View style={[styles.chartCard, isCompact && styles.chartCardCompact]}>
      <Text style={styles.chartTitle}>{title}</Text>
      <Text style={styles.chartSubtitle}>{subtitle}</Text>
      {hasReferenceLines ? (
        <View style={[styles.chartLegendRow, isCompact && styles.chartLegendRowCompact]}>
          <LegendSwatch label="Actual / current" color="#6E79F6" />
          <LegendSwatch label="1% plan" color="#B44A3B" />
          <LegendSwatch label="2% plan" color="#5D9C3F" />
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.chartRow, isCompact && styles.chartRowCompact]}>
          {points.map((point) => (
            <View
              key={`${title}-${point.label}-${point.valueLabel}`}
              style={[styles.chartColumn, isCompact && styles.chartColumnCompact]}
            >
              <Text
                style={[
                  styles.chartValue,
                  isCompact && styles.chartValueCompact,
                  point.tone === "future" && styles.chartValueFuture,
                ]}
              >
                {point.valueLabel}
              </Text>
              <View
                style={[
                  styles.chartBarWrap,
                  isCompact && styles.chartBarWrapCompact,
                ]}
              >
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
                    isCompact && styles.chartBarCompact,
                    point.tone === "future" && styles.chartBarFuture,
                    { height: `${Math.max(8, Math.round((point.value / maxValue) * 100))}%` },
                  ]}
                />
              </View>
              <Text style={[styles.chartLabel, isCompact && styles.chartLabelCompact]}>
                {point.label}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function MobileHomeDashboard({
  currentPilot,
  employeeNumberInput,
  onEmployeeNumberChange,
  preferences,
  onPreferencesChange,
  preferencesEditing,
  onPreferencesEditingChange,
  preferencesComplete,
  goalInput,
  onGoalInputChange,
  currentCategoryEntry,
  currentCategoryMovement,
  currentCategoryReach,
  currentCategoryTrend,
  systemPercent,
  systemTotalPilots,
  currentCategoryPercent,
  currentCategorySummary,
  projectedCategoryPercent,
  projectedCategoryRank,
  projectedCategoryTotal,
  trackedCategories,
  onOpenTrackedCategory,
  growthRate,
  onGrowthRateChange,
  growthMenuOpen,
  onGrowthMenuToggle,
  seniorityPercentSeries,
  seniorityNumberSeries,
  totalPilotCountSeries,
}: {
  currentPilot: PilotRecord | null;
  employeeNumberInput: string;
  onEmployeeNumberChange: (value: string) => void;
  preferences: PilotPreferences;
  onPreferencesChange: React.Dispatch<React.SetStateAction<PilotPreferences>>;
  preferencesEditing: boolean;
  onPreferencesEditingChange: (value: boolean) => void;
  preferencesComplete: boolean;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  currentCategoryEntry: CategoryEntry | null;
  currentCategoryMovement: AeMovementSummary | null;
  currentCategoryReach: ReturnType<typeof evaluateAeReach> | null;
  currentCategoryTrend: AeTrendEntry | null;
  systemPercent: number | null;
  systemTotalPilots: number;
  currentCategoryPercent: number | null;
  currentCategorySummary: CategoryEntry | null;
  projectedCategoryPercent: number | null;
  projectedCategoryRank: number | null;
  projectedCategoryTotal: number | null;
  trackedCategories: ReturnType<typeof buildMobileCategoryCardDatum>[];
  onOpenTrackedCategory: (entry: CategoryEntry) => void;
  growthRate: number;
  onGrowthRateChange: (value: number) => void;
  growthMenuOpen: boolean;
  onGrowthMenuToggle: () => void;
  seniorityPercentSeries: ChartPoint[];
  seniorityNumberSeries: ChartPoint[];
  totalPilotCountSeries: ChartPoint[];
}) {
  const addGoal = () => {
    const normalized = normalizeCategoryPreference(goalInput);
    if (!normalized) {
      return;
    }
    onPreferencesChange((current) => ({
      ...current,
      goalCategories: Array.from(new Set([...current.goalCategories, normalized])),
    }));
    onGoalInputChange("");
  };
  const welcomeRole =
    currentCategorySummary?.seat === "Captain" ||
    currentPilot?.currentCategoryCode?.toUpperCase().endsWith("CA")
      ? "Captain"
      : currentCategorySummary?.seat === "First Officer" ||
          currentPilot?.currentCategoryCode?.toUpperCase().endsWith("FO")
        ? "FO"
        : "Pilot";

  return (
    <SectionCard
      title="Pilot Dashboard"
      description="Where you stand, what moved, and why your vacation is in February."
    >
      <View style={styles.identityCard}>
        <Text style={styles.identityName}>
          {currentPilot?.name ? `Welcome back ${welcomeRole} ${currentPilot.name}` : "Welcome back"}
        </Text>
        <Text style={styles.identityMeta}>
          {currentPilot
            ? `${currentPilot.currentCategoryCode} • Seniority #${currentPilot.seniorityNumber}`
            : "Add your employee number so CrewTools can personalize the mobile dashboard."}
        </Text>
        <FormRow>
          <LabeledInput
            label="Employee Number"
            value={employeeNumberInput}
            onChangeText={onEmployeeNumberChange}
          />
        </FormRow>
      </View>

      <View style={styles.mobileSummaryMetricRow}>
        <MobileKeyMetricCard
          label="System Seniority"
          value={systemPercent != null ? `${systemPercent}%` : "--"}
          detail={currentPilot ? "System list position" : "Enter employee number"}
          subdetail={
            currentPilot ? `#${currentPilot.seniorityNumber} of ${systemTotalPilots}` : ""
          }
        />
        <MobileKeyMetricCard
          label="Current Category"
          value={currentCategoryPercent != null ? `${currentCategoryPercent}%` : "--"}
          detail={currentPilot?.currentCategoryCode ?? "Category position loads after lookup"}
          subdetail={
            currentCategorySummary && currentPilot?.currentCategoryRank && currentPilot?.currentCategoryTotal
              ? `${currentPilot.currentCategoryRank}/${currentPilot.currentCategoryTotal} in ${currentCategorySummary.base}`
              : ""
          }
        />
        <MobileKeyMetricCard
          label="Projected Seniority"
          value={projectedCategoryPercent != null ? `${projectedCategoryPercent}%` : "--"}
          detail="Once all AE conversions are processed"
          subdetail={
            currentCategorySummary && projectedCategoryRank && projectedCategoryTotal
              ? `${projectedCategoryRank}/${projectedCategoryTotal} in ${currentCategorySummary.base}`
              : ""
          }
        />
      </View>

      <MobilePreferencesPanel
        currentPilot={currentPilot}
        preferencesEditing={preferencesEditing}
        preferencesComplete={preferencesComplete}
        onPreferencesEditingChange={onPreferencesEditingChange}
        goalInput={goalInput}
        onGoalInputChange={onGoalInputChange}
        onAddGoal={addGoal}
        onPreferencesChange={onPreferencesChange}
        watchedCategories={trackedCategories.map((item) => item.entry.key)}
      />

      <View style={styles.mobileDashboardStack}>
        <MobileDashboardCard eyebrow="The Dream List" title="The dream list">
          <Text style={styles.mobileDashboardBodyText}>
            Add the categories you want on Home, tap a row for the current seniority list, and delete it when you no longer need it.
          </Text>
          {trackedCategories.length > 0 ? (
            <View style={styles.mobileListStack}>
              {trackedCategories.map((item) => (
                <View key={`tracked-${item.entry.key}`} style={styles.mobileListRow}>
                  <TouchableOpacity
                    style={styles.mobileListMainAction}
                    activeOpacity={0.88}
                    onPress={() => onOpenTrackedCategory(item.entry)}
                  >
                    <View style={styles.mobileListCopy}>
                      <Text style={styles.mobileListTitle}>{formatCategoryEntryCode(item.entry)}</Text>
                      <Text style={styles.mobileListText}>{item.supportingText}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.mobileListActions}>
                    <MobileStatusBadge label={item.statusLabel} tone={item.tone} compact />
                    <TouchableOpacity
                      style={styles.mobileDeleteMiniButton}
                      onPress={() =>
                        onPreferencesChange((current) => ({
                          ...current,
                          goalCategories: current.goalCategories.filter((entry) => entry !== item.entry.key),
                        }))
                      }
                    >
                      <Text style={styles.mobileDeleteMiniButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.mobileDecisionFooter}>
              No watched categories yet. Use Edit to add the seats you want pinned on Home.
            </Text>
          )}
        </MobileDashboardCard>
      </View>

      <MobileDashboardCard eyebrow="Seniority Progression" title="How your seniority grows over time">
        <Text style={styles.mobileDashboardBodyText}>
          Keep one shared annual growth assumption for your percent, number, and total-list charts.
        </Text>
        <View style={styles.dropdownWrap}>
          <Text style={styles.inputLabel}>Annual growth</Text>
          <TouchableOpacity style={styles.dropdownButton} onPress={onGrowthMenuToggle}>
            <Text style={styles.dropdownButtonText}>{Math.round(growthRate * 100)}% annual growth</Text>
          </TouchableOpacity>
          {growthMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {forecastGrowthRates.map((option) => (
                <TouchableOpacity
                  key={`home-growth-${option.value}`}
                  style={styles.dropdownItem}
                  onPress={() => onGrowthRateChange(option.value)}
                >
                  <Text style={styles.dropdownItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.mobileChartStack}>
          <MiniBarChart
            title="System Seniority Percent"
            subtitle={`Projected system seniority percent with ${Math.round(growthRate * 100)}% annual growth.`}
            points={seniorityPercentSeries.map((point) => ({
              ...point,
              referenceOnePercent: null,
              referenceTwoPercent: null,
            }))}
          />
          <MiniBarChart
            title="Pilot Seniority Number"
            subtitle="Projected seniority number over time at the same growth rate."
            points={seniorityNumberSeries}
          />
          <MiniBarChart
            title="Total Pilot List"
            subtitle="Past list size in navy, projected list size in red."
            points={totalPilotCountSeries}
          />
        </View>
      </MobileDashboardCard>
    </SectionCard>
  );
}

function MobilePreferencesEditor({
  currentPilot,
  onPreferencesChange,
  onDone,
  goalInput,
  onGoalInputChange,
  onAddGoal,
  watchedCategories,
}: {
  currentPilot: PilotRecord | null;
  onPreferencesChange: React.Dispatch<React.SetStateAction<PilotPreferences>>;
  onDone: () => void;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  onAddGoal: () => void;
  watchedCategories: string[];
}) {
  return (
    <View style={styles.mobilePreferencesEditor}>
      <ResultLine
        label="Current category"
        value={
          currentPilot?.currentCategoryCode ??
          "Enter employee number first"
        }
      />
      <View style={styles.mobileFormGroup}>
        <Text style={styles.inputLabel}>Categories I'm Watching</Text>
        <Text style={styles.mobileSectionText}>
          Add target categories here. Tap a saved chip to remove it.
        </Text>
        <View style={styles.mobileGoalRow}>
          <View style={[styles.textChipShell, styles.mobileGoalInputWrap]}>
            <TextInput
              value={goalInput}
              onChangeText={onGoalInputChange}
              placeholder="ATL-320-CA or SLC220A"
              placeholderTextColor="#7B7367"
              autoCapitalize="characters"
              style={styles.textChipInput}
            />
          </View>
          <TouchableOpacity style={styles.mobileAddGoalButton} onPress={onAddGoal}>
            <Text style={styles.mobileAddGoalButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {watchedCategories.length > 0 ? (
          <View style={styles.baseSelector}>
            {watchedCategories.map((goal) => (
              <TouchableOpacity
                key={`goal-${goal}`}
                style={[styles.baseChip, styles.goalChip]}
                onPress={() =>
                  onPreferencesChange((current) => ({
                    ...current,
                    goalCategories: current.goalCategories.filter((entry) => entry !== goal),
                  }))
                }
              >
                <Text style={[styles.baseChipLabel, styles.goalChipLabel]}>
                  {displayCategoryPreference(goal)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.mobileDecisionFooter}>
            No watch categories yet. Add the seats you want this dashboard to track.
          </Text>
        )}
      </View>
      <TouchableOpacity style={styles.mobileSavePrefsButton} onPress={onDone}>
        <Text style={styles.mobileSavePrefsButtonText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

function MobilePreferencesPanel({
  currentPilot,
  preferencesEditing,
  preferencesComplete,
  onPreferencesEditingChange,
  goalInput,
  onGoalInputChange,
  onAddGoal,
  onPreferencesChange,
  watchedCategories,
}: {
  currentPilot: PilotRecord | null;
  preferencesEditing: boolean;
  preferencesComplete: boolean;
  onPreferencesEditingChange: (value: boolean) => void;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  onAddGoal: () => void;
  onPreferencesChange: React.Dispatch<React.SetStateAction<PilotPreferences>>;
  watchedCategories: string[];
}) {
  return (
    <View style={styles.mobilePreferencesCard}>
      <View style={styles.mobilePrefsSummaryHeader}>
        <View style={styles.mobileListCopy}>
          <Text style={styles.mobileSectionTitle}>Categories I'm Watching</Text>
          <Text style={styles.mobileSectionText}>
            {preferencesComplete
              ? "Add the seats you want pinned on Home, and remove them when you no longer need them."
              : "Load your pilot first, then add the categories you want pinned on Home."}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.mobileEditPrefsButton}
          onPress={() => onPreferencesEditingChange(!preferencesEditing)}
        >
          <Text style={styles.mobileEditPrefsButtonText}>
            {preferencesEditing ? "Close" : "Edit"}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.mobileFormGroup}>
        <Text style={styles.inputLabel}>Categories I'm Watching</Text>
        {watchedCategories.length > 0 ? (
          <View style={styles.baseSelector}>
            {watchedCategories.map((goal) => (
              <TouchableOpacity
                key={`summary-goal-${goal}`}
                style={[styles.baseChip, styles.goalChip, styles.goalChipRemovable]}
                onPress={() =>
                  onPreferencesChange((current) => ({
                    ...current,
                    goalCategories: current.goalCategories.filter((entry) => entry !== goal),
                  }))
                }
              >
                <Text style={[styles.baseChipLabel, styles.goalChipLabel]}>
                  {displayCategoryPreference(goal)} ×
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.mobileDecisionFooter}>
            No tracked categories yet. Tap Edit to add the seats you want to follow.
          </Text>
        )}
      </View>
      {preferencesEditing ? (
        <MobilePreferencesEditor
          currentPilot={currentPilot}
          onPreferencesChange={onPreferencesChange}
          onDone={() => onPreferencesEditingChange(false)}
          goalInput={goalInput}
          onGoalInputChange={onGoalInputChange}
          onAddGoal={onAddGoal}
          watchedCategories={watchedCategories}
        />
      ) : null}
    </View>
  );
}

function MobileKeyMetricCard({
  label,
  value,
  detail,
  subdetail,
}: {
  label: string;
  value: string;
  detail: string;
  subdetail?: string;
}) {
  return (
    <View style={styles.mobileKeyMetricCard}>
      <Text style={styles.mobileKeyMetricLabel}>{label}</Text>
      <Text style={styles.mobileKeyMetricValue}>{value}</Text>
      <Text style={styles.mobileKeyMetricDetail}>{detail}</Text>
      {subdetail ? <Text style={styles.mobileKeyMetricSubdetail}>{subdetail}</Text> : null}
    </View>
  );
}

function MobileCategoriesView({
  currentPilot,
  entries,
  filter,
  onFilterChange,
  relevantBases,
  onOpenCategory,
}: {
  currentPilot: PilotRecord | null;
  entries: ReturnType<typeof buildMobileCategoryCards>;
  filter: MobileCategoryFilterKey;
  onFilterChange: (value: MobileCategoryFilterKey) => void;
  relevantBases: string[];
  onOpenCategory: (entry: CategoryEntry) => void;
}) {
  return (
    <SectionCard
      title="Categories"
      description="Tap a category to see the full list. Mobile stays focused on quick bid decisions instead of table scanning."
    >
      <View style={styles.identityCard}>
        <Text style={styles.identityName}>{currentPilot?.name ?? "Pilot categories"}</Text>
        <Text style={styles.identityMeta}>
          {relevantBases.length > 0
            ? `My bases: ${relevantBases.join(", ")}`
            : "Set your base preferences on Home to prioritize the right categories."}
        </Text>
      </View>
      <View style={styles.baseSelector}>
        {mobileCategoryFilters.map((chip) => (
          <TouchableOpacity
            key={chip.key}
            style={[styles.baseChip, filter === chip.key && styles.baseChipActive]}
            onPress={() => onFilterChange(chip.key)}
          >
            <Text style={[styles.baseChipLabel, filter === chip.key && styles.baseChipLabelActive]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.mobileCardStack}>
        {entries.map((item) => (
          <TouchableOpacity
            key={`mobile-category-${item.entry.key}`}
            style={[styles.mobileDecisionCard, statusBackgroundStyle(item.tone)]}
            activeOpacity={0.9}
            onPress={() => onOpenCategory(item.entry)}
          >
            <View style={styles.mobileDecisionHeader}>
              <View style={styles.mobileDecisionTitleWrap}>
                <Text style={styles.mobileDecisionTitle}>{formatCategoryEntryCode(item.entry)}</Text>
                <Text style={styles.mobileDecisionSubtitle}>{item.supportingText}</Text>
              </View>
              <MobileStatusBadge label={item.statusLabel} tone={item.tone} />
            </View>
            <View style={styles.mobileInfoRow}>
              <InfoChip label="Junior line" value={`#${item.entry.mostJuniorNumber}`} />
              <InfoChip
                label="You there"
                value={item.holdDisplay}
              />
              <InfoChip
                label="Trend"
                value={item.trendText}
              />
            </View>
            <Text style={styles.mobileDecisionFooter}>{item.relevanceText}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SectionCard>
  );
}

function MobileMovementView({
  currentPilot,
  currentCategoryCode,
  currentCategoryMovement,
  currentCategoryReach,
  currentCategoryTrend,
  feedItems,
  onOpenAe,
}: {
  currentPilot: PilotRecord | null;
  currentCategoryCode: string;
  currentCategoryMovement: AeMovementSummary | null;
  currentCategoryReach: ReturnType<typeof evaluateAeReach> | null;
  currentCategoryTrend: AeTrendEntry | null;
  feedItems: ReturnType<typeof buildMobileMovementFeed>;
  onOpenAe: (item: ReturnType<typeof buildMobileMovementFeed>[number]) => void;
}) {
  return (
    <SectionCard
      title="Movement"
      description="See what changed in the categories that matter to you this month, not a giant dump of every seat in the system."
    >
      <MobileDashboardCard eyebrow="Current Category Movement" title={currentCategoryCode || currentPilot?.currentCategoryCode || "Set your current category"}>
        <View style={styles.mobileDashboardHeaderRow}>
          <MobileStatusBadge
            label={currentCategoryReach?.label ?? "No line yet"}
            tone={toneForPilotStatus(currentCategoryReach?.label ?? "No line yet")}
          />
          <Text style={styles.mobileDashboardMeta}>
            {describeMovementDirection(currentCategoryTrend?.lineMovement ?? null)}
          </Text>
        </View>
        <Text style={styles.mobileDashboardBodyText}>
          {currentCategoryMovement
            ? `AE only: In ${currentCategoryMovement.aeIn} • Out ${currentCategoryMovement.aeOut} • Net ${formatSignedCount(currentCategoryMovement.net)}`
            : "No parsed AE movement for this category in the latest posting."}
        </Text>
      </MobileDashboardCard>
      <View style={styles.mobileCardStack}>
        {feedItems.map((item) => (
          <TouchableOpacity
            key={`movement-${item.entry.awardCategory}`}
            style={[styles.mobileDecisionCard, statusBackgroundStyle(item.tone)]}
            activeOpacity={0.9}
            onPress={() => onOpenAe(item)}
          >
            <View style={styles.mobileDecisionHeader}>
              <View style={styles.mobileDecisionTitleWrap}>
                <Text style={styles.mobileDecisionTitle}>{item.entry.awardCategory}</Text>
                <Text style={styles.mobileDecisionSubtitle}>{item.summaryText}</Text>
              </View>
              <MobileStatusBadge label={item.statusLabel} tone={item.tone} />
            </View>
            <View style={styles.mobileInfoRow}>
              <InfoChip label="Junior line" value={formatSeniorityValue(item.entry.mostJuniorAwardNumber)} />
              <InfoChip label="Trend" value={item.trendText} />
              <InfoChip label="Awards" value={`${item.entry.awards}`} />
            </View>
            <Text style={styles.mobileDecisionFooter}>{item.relevanceText}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SectionCard>
  );
}

function MobileCareerPlanningView({
  currentPilot,
  preferences,
  milestones,
  activeWhatIfCategory,
  whatIfSeat,
  setWhatIfSeat,
  whatIfFleetOptions,
  selectedWhatIfFleet,
  setSelectedWhatIfFleet,
  whatIfBaseOptions,
  selectedWhatIfBase,
  setSelectedWhatIfBase,
  whatIfEstimates,
}: {
  currentPilot: PilotRecord | null;
  preferences: PilotPreferences;
  milestones: ReturnType<typeof buildCareerMilestones>;
  activeWhatIfCategory: CategoryEntry | null;
  whatIfSeat: Exclude<SeatFilter, "All">;
  setWhatIfSeat: (value: Exclude<SeatFilter, "All">) => void;
  whatIfFleetOptions: string[];
  selectedWhatIfFleet: string;
  setSelectedWhatIfFleet: (value: string) => void;
  whatIfBaseOptions: string[];
  selectedWhatIfBase: string;
  setSelectedWhatIfBase: (value: string) => void;
  whatIfEstimates: HoldEstimate[];
}) {
  return (
    <SectionCard
      title="Career & Planning"
      description="Plan the next meaningful milestone first, then use the hold tool to drill into one specific seat."
    >
      <View style={styles.mobileCardStack}>
        {milestones.map((milestone) => (
          <View
            key={`milestone-${milestone.key}`}
            style={[styles.mobileDecisionCard, statusBackgroundStyle(milestone.tone)]}
          >
            <View style={styles.mobileDecisionHeader}>
              <View style={styles.mobileDecisionTitleWrap}>
                <Text style={styles.mobileDecisionTitle}>{milestone.label}</Text>
                <Text style={styles.mobileDecisionSubtitle}>{milestone.targetCode}</Text>
              </View>
              <MobileStatusBadge label={milestone.statusLabel} tone={milestone.tone} />
            </View>
            <Text style={styles.mobileDecisionFooter}>{milestone.timing}</Text>
          </View>
        ))}
      </View>
      <View style={styles.mobilePreferencesCard}>
        <Text style={styles.mobileSectionTitle}>When can I hold this?</Text>
        <Text style={styles.mobileSectionText}>
          Use the exact seat you care about and compare the 1% and 2% planning paths.
        </Text>
        <Text style={styles.inputLabel}>Seat</Text>
        <View style={styles.baseSelector}>
          {(["Captain", "First Officer"] as const).map((seat) => (
            <TouchableOpacity
              key={`mobile-career-seat-${seat}`}
              style={[styles.baseChip, whatIfSeat === seat && styles.baseChipActive]}
              onPress={() => setWhatIfSeat(seat)}
            >
              <Text style={[styles.baseChipLabel, whatIfSeat === seat && styles.baseChipLabelActive]}>
                {seat === "Captain" ? "CA" : "FO"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.inputLabel}>Fleet</Text>
        <View style={styles.baseSelector}>
          {whatIfFleetOptions.map((fleet) => (
            <TouchableOpacity
              key={`mobile-career-fleet-${fleet}`}
              style={[styles.baseChip, selectedWhatIfFleet === fleet && styles.baseChipActive]}
              onPress={() => setSelectedWhatIfFleet(fleet)}
            >
              <Text style={[styles.baseChipLabel, selectedWhatIfFleet === fleet && styles.baseChipLabelActive]}>
                {fleet}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.inputLabel}>Base</Text>
        <View style={styles.baseSelector}>
          {whatIfBaseOptions.map((base) => (
            <TouchableOpacity
              key={`mobile-career-base-${base}`}
              style={[styles.baseChip, selectedWhatIfBase === base && styles.baseChipActive]}
              onPress={() => setSelectedWhatIfBase(base)}
            >
              <Text style={[styles.baseChipLabel, selectedWhatIfBase === base && styles.baseChipLabelActive]}>
                {base}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {activeWhatIfCategory && currentPilot ? (
          <>
            <Text style={styles.mobileSectionText}>
              {formatCategoryEntryCode(activeWhatIfCategory)} • Current Junior{" "}
              {activeWhatIfCategory.seat === "Captain" ? "CA" : "FO"} #
              {activeWhatIfCategory.mostJuniorNumber}
            </Text>
            <View style={styles.mobileCardStack}>
              {whatIfEstimates.map((estimate) => (
                <View
                  key={`mobile-what-if-${estimate.growthRate}`}
                  style={[styles.mobileDecisionCard, styles.mobileNeutralCard]}
                >
                  <View style={styles.mobileDecisionHeader}>
                    <View style={styles.mobileDecisionTitleWrap}>
                      <Text style={styles.mobileDecisionTitle}>
                        {Math.round(estimate.growthRate * 100)}% growth
                      </Text>
                      <Text style={styles.mobileDecisionSubtitle}>
                        {estimate.firstHoldPoint
                          ? estimate.firstHoldPoint.label === "Today"
                            ? "Can Hold now"
                            : `Est. hold by ${estimate.firstHoldPoint.label}`
                          : "Longer-range"}
                      </Text>
                    </View>
                    <MobileStatusBadge
                      label={estimate.currentGap === 0 ? "Can Hold" : "Senior to You"}
                      tone={estimate.currentGap === 0 ? "green" : "red"}
                      compact
                    />
                  </View>
                  <View style={styles.mobileInfoRow}>
                    <InfoChip label="Your number" value={estimate.firstHoldPoint ? `#${estimate.firstHoldPoint.projectedRank}` : `#${currentPilot.seniorityNumber}`} />
                    <InfoChip label="Junior line" value={estimate.firstHoldPoint ? `#${estimate.firstHoldPoint.projectedJuniorLine}` : "—"} />
                    <InfoChip label="Gap today" value={`${estimate.currentGap}`} />
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </SectionCard>
  );
}

function MobileDashboardCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.mobileDashboardCard}>
      <Text style={styles.mobileDashboardEyebrow}>{eyebrow}</Text>
      <Text style={styles.mobileDashboardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MobileStatusBadge({
  label,
  tone,
  compact,
}: {
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.mobileStatusBadge,
        tone === "green" && styles.mobileStatusBadgeGreen,
        tone === "amber" && styles.mobileStatusBadgeAmber,
        tone === "red" && styles.mobileStatusBadgeRed,
        compact && styles.mobileStatusBadgeCompact,
      ]}
    >
      <Text style={styles.mobileStatusBadgeText}>{label}</Text>
    </View>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mobileInfoChip}>
      <Text style={styles.mobileInfoChipLabel}>{label}</Text>
      <Text style={styles.mobileInfoChipValue}>{value}</Text>
    </View>
  );
}

function mobileTabLabel(tab: TabKey) {
  if (tab === "seniority") {
    return "Categories";
  }
  if (tab === "ae") {
    return "Movement";
  }
  if (tab === "schedule") {
    return "Career";
  }
  return tabs.find((entry) => entry.key === tab)?.label ?? tab;
}

function displayCategoryPreference(goal: string) {
  const [base = "", fleet = "", seatCode = ""] = goal.split("-");
  if (!base || !fleet || !seatCode) {
    return goal;
  }
  return `${base}-${fleet}-${seatCode === "A" ? "CA" : seatCode === "B" ? "FO" : seatCode}`;
}

function buildCategoryKeyFromCategoryCode(categoryCode: string) {
  const normalized = categoryCode.trim().toUpperCase();
  if (normalized.length < 5) {
    return null;
  }
  const base = normalized.slice(0, 3);
  const seatCode = normalized.slice(-1);
  const fleet = normalized.slice(3, -1);
  if (!base || !fleet) {
    return null;
  }
  const positionCode = seatCode === "A" ? "A" : seatCode === "B" ? "B" : seatCode;
  return `${base}-${fleet}-${positionCode}`;
}

function buildAwardCategoryFromCategoryCode(categoryCode: string) {
  const categoryKey = buildCategoryKeyFromCategoryCode(categoryCode);
  if (!categoryKey) {
    return null;
  }
  const [base = "", fleet = "", seatCode = ""] = categoryKey.split("-");
  return `${base}-${fleet}-${seatCode === "A" ? "CA" : seatCode === "B" ? "FO" : seatCode}`;
}

function normalizeCategoryPreference(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("-CA") || trimmed.includes("-FO")) {
    return buildCategoryKeyFromAeCategory(trimmed);
  }
  if (trimmed.includes("-A") || trimmed.includes("-B")) {
    return trimmed;
  }
  return buildCategoryKeyFromCategoryCode(trimmed);
}

function toneForPilotStatus(label: string) {
  if (label === "Can Hold" || label === "Junior to You") {
    return "green" as const;
  }
  if (label === "Close") {
    return "amber" as const;
  }
  if (label === "Senior to You") {
    return "red" as const;
  }
  return "neutral" as const;
}

function statusBackgroundStyle(tone: "green" | "amber" | "red" | "neutral") {
  if (tone === "green") {
    return styles.mobileGreenCard;
  }
  if (tone === "amber") {
    return styles.mobileAmberCard;
  }
  if (tone === "red") {
    return styles.mobileRedCard;
  }
  return styles.mobileNeutralCard;
}

function describeMovementDirection(value: number | null) {
  if (value == null || value === 0) {
    return "Flat latest line";
  }
  return value > 0 ? "Moved junior" : "Moved senior";
}

function buildRelevantHoldEntries({
  entries,
  currentPilot,
  userSeniorityNumber,
  currentCategoryKey,
  relevantBases,
  priority,
  goalCategoryKeys,
  categoryAssignmentsByKey,
}: {
  entries: readonly CategoryEntry[];
  currentPilot: PilotRecord | null;
  userSeniorityNumber: number;
  currentCategoryKey: string | null;
  relevantBases: string[];
  priority: PilotPriorityKey;
  goalCategoryKeys: readonly string[];
  categoryAssignmentsByKey: ReadonlyMap<string, LatestCategoryAssignment[]>;
}) {
  const preferredBaseSet = new Set(relevantBases);

  return entries
    .filter((entry) => {
      if (priority === "systemwide-opportunities") {
        return true;
      }
      if (!preferredBaseSet.size) {
        return true;
      }
      return preferredBaseSet.has(entry.base);
    })
    .map((entry) => buildMobileCategoryCardDatum(entry, currentPilot, userSeniorityNumber, currentCategoryKey, goalCategoryKeys, categoryAssignmentsByKey))
    .sort((left, right) => right.score - left.score);
}

function buildMobileCategoryCards({
  entries,
  currentPilot,
  userSeniorityNumber,
  currentCategoryKey,
  relevantBases,
  goalCategoryKeys,
  filter,
  categoryAssignmentsByKey,
}: {
  entries: readonly CategoryEntry[];
  currentPilot: PilotRecord | null;
  userSeniorityNumber: number;
  currentCategoryKey: string | null;
  relevantBases: string[];
  goalCategoryKeys: readonly string[];
  filter: MobileCategoryFilterKey;
  categoryAssignmentsByKey: ReadonlyMap<string, LatestCategoryAssignment[]>;
}) {
  const preferredBaseSet = new Set(relevantBases);

  return entries
    .map((entry) =>
      buildMobileCategoryCardDatum(
        entry,
        currentPilot,
        userSeniorityNumber,
        currentCategoryKey,
        goalCategoryKeys,
        categoryAssignmentsByKey
      )
    )
    .filter((item) => {
      if (filter === "all") return true;
      if (filter === "can-hold") return item.statusLabel === "Can Hold";
      if (filter === "close") return item.statusLabel === "Close";
      if (filter === "senior-to-you") return item.statusLabel === "Senior to You";
      if (filter === "captain") return item.entry.seat === "Captain";
      if (filter === "fo") return item.entry.seat === "First Officer";
      if (filter === "my-bases") return preferredBaseSet.size === 0 ? true : preferredBaseSet.has(item.entry.base);
      if (filter === "goals") return item.isGoal;
      return true;
    })
    .sort((left, right) => {
      if (filter === "all" || filter === "my-bases") {
        return right.score - left.score;
      }
      return right.score - left.score;
    });
}

function buildMobileCategoryCardDatum(
  entry: CategoryEntry,
  currentPilot: PilotRecord | null,
  userSeniorityNumber: number,
  currentCategoryKey: string | null,
  goalCategoryKeys: readonly string[],
  categoryAssignmentsByKey: ReadonlyMap<string, LatestCategoryAssignment[]>
) {
  const fit = evaluateCategoryHold(entry, userSeniorityNumber, currentCategoryKey);
  const trend = deltaSnapshot.categoryTrends.find((item) => item.key === entry.key) ?? null;
  const assignments = categoryAssignmentsByKey.get(entry.key) ?? [];
  const userPosition = describeUserCategoryPosition(
    entry,
    fit,
    userSeniorityNumber,
    currentPilot,
    assignments
  );
  const isGoal = goalCategoryKeys.includes(entry.key);
  const statusLabel = fit.label === "Current category" ? "Can Hold" : fit.label;
  const tone = toneForPilotStatus(statusLabel);
  const holdDisplay =
    statusLabel === "Can Hold" ? userPosition.secondary ?? "Holdable" : statusLabel === "Close" ? "—" : "—";
  const gap = Math.max(0, userSeniorityNumber - entry.mostJuniorNumber);
  const supportingText =
    statusLabel === "Can Hold"
      ? `You'd likely sit ${userPosition.secondary ?? "inside the category"} here.`
      : statusLabel === "Close"
        ? `${gap} numbers from the current line.`
        : statusLabel === "Senior to You"
          ? "Not holdable today."
          : "Current category.";
  const relevanceText = isGoal
    ? "Goal category"
    : currentPilot && entry.base === currentPilot.currentCategoryCode?.slice(0, 3)
      ? "Current base priority"
      : "Useful bid option";
  const score =
    (statusLabel === "Can Hold" ? 90 : statusLabel === "Close" ? 70 : statusLabel === "Senior to You" ? 40 : 80) +
    (isGoal ? 25 : 0) +
    (entry.seat === "Captain" ? 4 : 0) -
    gap / 1000;

  return {
    entry,
    fit,
    userPosition,
    trend,
    isGoal,
    statusLabel,
    tone,
    holdDisplay,
    supportingText,
    relevanceText,
    trendText: describeMovementDirection(trend?.lineMovement ?? null),
    score,
  };
}

function buildMobileMovementFeed({
  aeEntries,
  aeTrends,
  categoryTrends,
  userSeniorityNumber,
  relevantBases,
  priority,
  goalCategoryKeys,
}: {
  aeEntries: readonly AeEntry[];
  aeTrends: readonly AeTrendEntry[];
  categoryTrends: readonly {
    key: string;
    base: string;
    fleet: string;
    seat: string;
    latestJuniorNumber: number;
    previousJuniorNumber: number | null;
    lineMovement: number | null;
    latestPilotCount: number;
    previousPilotCount: number | null;
    pilotCountDelta: number | null;
  }[];
  userSeniorityNumber: number;
  relevantBases: readonly string[];
  priority: PilotPriorityKey;
  goalCategoryKeys: readonly string[];
}) {
  const relevantBaseSet = new Set(relevantBases);
  return aeEntries
    .filter((entry) => {
      if (priority === "systemwide-opportunities") {
        return true;
      }
      if (!relevantBaseSet.size) {
        return true;
      }
      return relevantBaseSet.has(entry.base);
    })
    .map((entry) => {
      const reach = evaluateAeReach(entry, userSeniorityNumber);
      const trend = aeTrends.find((item) => item.awardCategory === entry.awardCategory) ?? null;
      const categoryTrend =
        categoryTrends.find((item) => item.key === buildCategoryKeyFromAeCategory(entry.awardCategory)) ?? null;
      const isGoal = goalCategoryKeys.includes(buildCategoryKeyFromAeCategory(entry.awardCategory));
      const statusLabel = reach.label === "No line yet" ? "Close" : reach.label;
      const tone = toneForPilotStatus(statusLabel);
      return {
        entry,
        statusLabel,
        tone,
        summaryText: `${describeMovementDirection(trend?.lineMovement ?? null)} • ${formatSignedCount(
          trend?.awardsDelta ?? null
        )} awards`,
        trendText: formatSignedChange(trend?.lineMovement ?? categoryTrend?.lineMovement ?? null, "#") ?? "Flat",
        relevanceText: isGoal ? "Goal category movement" : `${entry.base} ${entry.seat === "Captain" ? "Captain" : "FO"} movement`,
        score:
          (statusLabel === "Junior to You" ? 90 : statusLabel === "Close" ? 70 : 50) +
          (isGoal ? 25 : 0) +
          Math.abs(trend?.lineMovement ?? 0),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

function buildCareerMilestones({
  currentPilot,
  categories,
  pilots,
  relevantBases,
  priority,
  goalCategoryKeys,
}: {
  currentPilot: PilotRecord | null;
  categories: readonly CategoryEntry[];
  pilots: readonly PilotRecord[];
  relevantBases: readonly string[];
  priority: PilotPriorityKey;
  goalCategoryKeys: readonly string[];
}) {
  if (!currentPilot) {
    return [];
  }

  const relevantBaseSet = new Set(relevantBases);
  const candidatePool = categories.filter((entry) => {
    if (priority === "systemwide-opportunities") {
      return true;
    }
    if (!relevantBaseSet.size) {
      return true;
    }
    return relevantBaseSet.has(entry.base);
  });

  const pickBest = (label: string, entries: readonly CategoryEntry[]) => {
    const sorted = [...entries].sort((left, right) => {
      const leftGap = Math.max(0, currentPilot.seniorityNumber - left.mostJuniorNumber);
      const rightGap = Math.max(0, currentPilot.seniorityNumber - right.mostJuniorNumber);
      return leftGap - rightGap;
    });
    const target = sorted[0];
    if (!target) {
      return null;
    }
    const estimate = buildCategoryHoldEstimate(currentPilot, target, pilots, 0.01);
    const fit = evaluateCategoryHold(target, currentPilot.seniorityNumber, currentPilot.currentCategoryKey);
    const statusLabel = fit.label === "Current category" ? "Can Hold" : fit.label;
    return {
      key: `${label}-${target.key}`,
      label,
      targetCode: formatCategoryEntryCode(target),
      statusLabel,
      tone: toneForPilotStatus(statusLabel),
      timing:
        estimate.firstHoldPoint == null
          ? "Longer-range"
          : estimate.firstHoldPoint.label === "Today"
            ? "Can Hold now"
            : `Est. ${estimate.firstHoldPoint.label}`,
      isGoal: goalCategoryKeys.includes(target.key),
    };
  };

  const widebodyFleets = new Set(["330", "350", "765", "7ER"]);
  const narrowbodyCaptain = pickBest(
    "Narrowbody Captain",
    candidatePool.filter((entry) => entry.seat === "Captain" && !widebodyFleets.has(entry.fleet))
  );
  const widebodyFo = pickBest(
    "Widebody FO",
    categories.filter((entry) => entry.seat === "First Officer" && widebodyFleets.has(entry.fleet))
  );
  const betterCaptainSeat = pickBest(
    "Better Captain Seat",
    categories
      .filter((entry) => entry.seat === "Captain")
      .sort((left, right) => payPriorityScore(right) - payPriorityScore(left))
  );

  return [narrowbodyCaptain, widebodyFo, betterCaptainSeat].filter(Boolean) as Array<{
    key: string;
    label: string;
    targetCode: string;
    statusLabel: string;
    tone: "green" | "amber" | "red" | "neutral";
    timing: string;
    isGoal: boolean;
  }>;
}

function buildCommuteBaseSuggestions(commuteOrigin: string, userSeniorityNumber: number) {
  const normalized = commuteOrigin.trim().toUpperCase();
  const nearbyBaseMap: Record<string, string[]> = {
    SNA: ["LAX", "SEA", "SLC"],
    ONT: ["LAX", "SLC", "SEA"],
    SAN: ["LAX", "SLC", "SEA"],
    PHX: ["SLC", "LAX", "SEA"],
    LAS: ["LAX", "SLC", "SEA"],
    DEN: ["SLC", "SEA", "MSP"],
    BOI: ["SLC", "SEA", "MSP"],
    PDX: ["SEA", "SLC", "LAX"],
    OAK: ["LAX", "SEA", "SLC"],
    SFO: ["LAX", "SEA", "SLC"],
    JFK: ["NYC", "BOS", "ATL"],
    LGA: ["NYC", "BOS", "ATL"],
    EWR: ["NYC", "BOS", "ATL"],
    MCO: ["ATL", "NYC", "DTW"],
    TPA: ["ATL", "NYC", "DTW"],
    AUS: ["ATL", "LAX", "MSP"],
  };

  const nearbyBases = nearbyBaseMap[normalized] ?? (bases.includes(normalized) ? [normalized] : bases);

  return nearbyBases
    .map((base) => {
      const baseEntries = deltaSnapshot.categories.filter((entry) => entry.base === base);
      const holdable = baseEntries.filter((entry) => userSeniorityNumber <= entry.mostJuniorNumber).length;
      const close = baseEntries.filter(
        (entry) => userSeniorityNumber > entry.mostJuniorNumber && userSeniorityNumber - entry.mostJuniorNumber <= 300
      ).length;
      return {
        base,
        score: holdable * 10 + close * 4,
        label: holdable > 0 ? `${holdable} holdable` : close > 0 ? `${close} close` : "longer-range",
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function payPriorityScore(entry: CategoryEntry) {
  const equipment = normalizePayEquipment(entry.fleet, entry.seat);
  if (!equipment) {
    return 0;
  }
  const seatKey = entry.seat === "Captain" ? "Captain" : "First Officer";
  const rates = payScales[seatKey][equipment];
  return rates?.[rates.length - 1] ?? 0;
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
  mobileCategoryCard: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 10,
  },
  mobileCategoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  mobileCategoryTitleWrap: {
    flex: 1,
    gap: 4,
  },
  mobileCategoryBadge: {
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(12,35,64,0.08)",
  },
  mobileCategoryBadgeText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0C2340",
  },
  mobileMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mobileMetricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 120,
    backgroundColor: "rgba(255,255,255,0.45)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: "rgba(12,35,64,0.08)",
  },
  mobileMetricLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#6B7C93",
  },
  mobileMetricValue: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0C2340",
  },
  mobileMetricDetail: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7C93",
  },
  mobileDashboardStack: {
    gap: 12,
  },
  desktopDashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  desktopDashboardColumn: {
    flex: 1,
    minWidth: 280,
  },
  mobileSummaryMetricRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  mobileKeyMetricCard: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D4DEE9",
    padding: 14,
    gap: 6,
  },
  mobileKeyMetricLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6B7C93",
  },
  mobileKeyMetricValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0C2340",
  },
  mobileKeyMetricDetail: {
    fontSize: 12,
    lineHeight: 18,
    color: "#52606D",
    fontWeight: "600",
  },
  mobileKeyMetricSubdetail: {
    fontSize: 12,
    lineHeight: 18,
    color: "#0C2340",
    fontWeight: "800",
  },
  mobileDashboardCard: {
    backgroundColor: "#F8FBFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D4DEE9",
    padding: 16,
    gap: 10,
  },
  mobileDashboardEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#6B7C93",
  },
  mobileDashboardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0C2340",
  },
  mobileDashboardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  mobileDashboardMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7C93",
  },
  mobileDashboardBodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#52606D",
  },
  mobilePreferencesCard: {
    backgroundColor: "#F7FAFC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D4DEE9",
    padding: 16,
    gap: 12,
  },
  mobilePreferencesEditor: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#D4DEE9",
  },
  mobileSectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0C2340",
  },
  mobileSectionText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#52606D",
  },
  mobilePrefsSummaryCard: {
    backgroundColor: "#F8FBFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D4DEE9",
    padding: 16,
    gap: 12,
  },
  mobilePrefsCollapsedWrap: {
    marginTop: -2,
  },
  mobilePrefsCollapsedButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D4DEE9",
    backgroundColor: "#F8FBFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  mobilePrefsCollapsedButtonText: {
    color: "#0C2340",
    fontSize: 14,
    fontWeight: "800",
  },
  mobilePrefsSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  mobileEditPrefsButton: {
    backgroundColor: "#E4EEF8",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mobileEditPrefsButtonText: {
    color: "#0C2340",
    fontSize: 12,
    fontWeight: "800",
  },
  mobileFormGroup: {
    gap: 8,
  },
  textChipShell: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFD9E5",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  textChipInput: {
    fontSize: 16,
    color: "#102A43",
    paddingVertical: 10,
  },
  mobileGoalRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  mobileGoalInputWrap: {
    flex: 1,
  },
  mobileAddGoalButton: {
    backgroundColor: "#A6192E",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  mobileAddGoalButtonText: {
    color: "#F8FBFF",
    fontSize: 13,
    fontWeight: "800",
  },
  mobileSavePrefsButton: {
    alignSelf: "flex-start",
    backgroundColor: "#A6192E",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  mobileSavePrefsButtonText: {
    color: "#F8FBFF",
    fontSize: 13,
    fontWeight: "800",
  },
  mobileChartStack: {
    gap: 14,
  },
  goalChip: {
    backgroundColor: "#E4EEF8",
  },
  goalChipRemovable: {
    paddingRight: 14,
  },
  goalChipLabel: {
    color: "#0C2340",
  },
  mobileCardStack: {
    gap: 12,
  },
  mobileDecisionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  mobileGreenCard: {
    backgroundColor: "#DFF0DB",
    borderColor: "#B9D7B1",
  },
  mobileAmberCard: {
    backgroundColor: "#F4E9D2",
    borderColor: "#DEC99B",
  },
  mobileRedCard: {
    backgroundColor: "#F8E1E5",
    borderColor: "#E5B7C0",
  },
  mobileNeutralCard: {
    backgroundColor: "#F1F5F9",
    borderColor: "#D4DEE9",
  },
  mobileDecisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  mobileDecisionTitleWrap: {
    flex: 1,
    gap: 4,
  },
  mobileDecisionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0C2340",
  },
  mobileDecisionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: "#52606D",
  },
  mobileDecisionFooter: {
    fontSize: 12,
    fontWeight: "700",
    color: "#52606D",
  },
  mobileStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E7EEF6",
  },
  mobileStatusBadgeCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mobileStatusBadgeGreen: {
    backgroundColor: "#2F6B36",
  },
  mobileStatusBadgeAmber: {
    backgroundColor: "#B88A28",
  },
  mobileStatusBadgeRed: {
    backgroundColor: "#A6192E",
  },
  mobileStatusBadgeText: {
    color: "#F8FBFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  mobileInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mobileInfoChip: {
    minWidth: 88,
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  mobileInfoChipLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#6B7C93",
  },
  mobileInfoChipValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0C2340",
  },
  mobileListStack: {
    gap: 10,
  },
  mobileListRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  mobileListMainAction: {
    flex: 1,
  },
  mobileListActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  mobileListCopy: {
    flex: 1,
    gap: 4,
  },
  mobileListTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0C2340",
  },
  mobileListText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#52606D",
  },
  mobileDeleteMiniButton: {
    backgroundColor: "#F8E1E5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5B7C0",
  },
  mobileDeleteMiniButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#A6192E",
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
  modalBackdropCompact: {
    padding: 10,
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "88%",
    backgroundColor: "#FCF8EF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D9C9A5",
    padding: 18,
    position: "relative",
  },
  modalCardCompact: {
    maxHeight: "94%",
    padding: 14,
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
    paddingRight: 56,
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
  modalFloatingCloseButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E8DED0",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "#D9C9A5",
    shadowColor: "#0C2340",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  modalFloatingCloseText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#173645",
    lineHeight: 18,
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
    paddingTop: 8,
  },
  modalScrollContentCompact: {
    gap: 12,
    paddingBottom: 20,
    paddingTop: 6,
  },
  modalSummaryPanelCompact: {
    padding: 14,
    gap: 10,
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
  listCompareCardCompact: {
    minWidth: 0,
    padding: 12,
    gap: 6,
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
  listCompareRowCompact: {
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  listCompareRowSenior: {
    backgroundColor: "#F8E1E5",
  },
  listCompareRowYou: {
    backgroundColor: "#E4EEF8",
  },
  listCompareRowRetiring: {
    backgroundColor: "#F6D6D6",
  },
  listCompareRowJunior: {
    backgroundColor: "#D8EFD2",
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
    color: "#4E5968",
  },
  listCompareContext: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6E675D",
  },
  listCompareNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: "#173645",
  },
  listCompareNumberCompact: {
    fontSize: 14,
    marginTop: 2,
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
  chartCardCompact: {
    backgroundColor: "#F7FAFC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D4DEE9",
    padding: 14,
  },
  chartLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  chartLegendRowCompact: {
    gap: 10,
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
  chartRowCompact: {
    gap: 12,
    minHeight: 194,
    paddingBottom: 2,
  },
  chartColumn: {
    width: 34,
    alignItems: "center",
    gap: 6,
  },
  chartColumnCompact: {
    width: 40,
    gap: 8,
  },
  chartValue: {
    fontSize: 10,
    color: "#16395D",
    fontWeight: "700",
    textAlign: "center",
  },
  chartValueCompact: {
    fontSize: 11,
    lineHeight: 14,
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
  chartBarWrapCompact: {
    width: 28,
    height: 118,
    borderRadius: 10,
  },
  chartBar: {
    width: 16,
    backgroundColor: "#0C2340",
    borderRadius: 6,
  },
  chartBarCompact: {
    width: 18,
    borderRadius: 7,
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
  chartLabelCompact: {
    fontSize: 11,
    lineHeight: 14,
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
