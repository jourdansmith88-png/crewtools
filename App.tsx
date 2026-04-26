import { StatusBar } from "expo-status-bar";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import {
  useColorScheme,
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
import { FliegerMarker } from "./src/components/FliegerMarker";
import { BottomNavItem } from "./src/components/BottomNavItem";
import { DecisionRow } from "./src/components/DecisionRow";
import { InstrumentField } from "./src/components/InstrumentField";
import { InstrumentButton, InstrumentChip } from "./src/components/InstrumentButton";
import { InstrumentPanel } from "./src/components/InstrumentPanel";
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
import {
  analyzeCurrentAE,
  forecastHoldability,
  type CurrentAeAnalysisResult,
  type HoldForecastResult,
} from "./src/utils/holdForecast";
import { ContractCopilotPanel } from "./src/components/contractCopilot/ContractCopilotPanel";
import { fliegerTypography, getFliegerPalette } from "./src/theme/flieger";

const embeddedChartData = embeddedDeltaCharts as unknown as DeltaChartsData;
const appStylePalette = getFliegerPalette();
const appStyleIsDark = appStylePalette.textPrimary === "#F2E9DC";
const appDecisionRowSurface = appStyleIsDark ? "#303840" : "#D2D8DE";
const appDecisionRowHighlight = appStyleIsDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)";
const appDecisionRowShadowEdge = appStyleIsDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.08)";

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
type HoldPlannerView = "ae" | "forecast";
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
  const colorScheme = useColorScheme();
  const flieger = getFliegerPalette(colorScheme);
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
  const [holdPlannerView, setHoldPlannerView] = useState<HoldPlannerView>("forecast");

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
  const aeHistoryByAwardCategory = useMemo(
    () =>
      new Map(
        ((deltaSnapshot as unknown as { aeHistoryByCategory?: readonly AeHistoryRecord[] })
          .aeHistoryByCategory ?? []).map((entry) => [entry.awardCategory, entry])
      ),
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
  const activeWhatIfAwardCategory = activeWhatIfCategory
    ? formatCategoryEntryCode(activeWhatIfCategory)
    : null;
  const activeWhatIfAeEntry = useMemo(
    () =>
      activeWhatIfAwardCategory
        ? deltaSnapshot.aeOpportunities.find((entry) => entry.awardCategory === activeWhatIfAwardCategory) ??
          null
        : null,
    [activeWhatIfAwardCategory]
  );
  const activeWhatIfAeHistory = useMemo(
    () => (activeWhatIfAwardCategory ? aeHistoryByAwardCategory.get(activeWhatIfAwardCategory) ?? null : null),
    [activeWhatIfAwardCategory, aeHistoryByAwardCategory]
  );
  const activeWhatIfCategoryTrend = useMemo(
    () => (activeWhatIfCategory ? categoryTrendMap.get(activeWhatIfCategory.key) ?? null : null),
    [activeWhatIfCategory, categoryTrendMap]
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

  const currentAeAnalysis = useMemo<CurrentAeAnalysisResult | null>(
    () =>
      analyzeCurrentAE({
        pilot: currentPilot,
        target: activeWhatIfCategory,
        latestAe: activeWhatIfAeEntry,
        aeHistory: activeWhatIfAeHistory,
      }),
    [currentPilot, activeWhatIfCategory, activeWhatIfAeEntry, activeWhatIfAeHistory]
  );

  const holdForecast = useMemo<HoldForecastResult | null>(
    () =>
      forecastHoldability({
        pilot: currentPilot,
        target: activeWhatIfCategory,
        latestAe: activeWhatIfAeEntry,
        aeHistory: activeWhatIfAeHistory,
        categoryTrend: activeWhatIfCategoryTrend,
        pilots: deltaSnapshot.pilotDirectory as unknown as readonly PilotRecord[],
        growthRate: forecastGrowthRate,
      }),
    [
      currentPilot,
      activeWhatIfCategory,
      activeWhatIfAeEntry,
      activeWhatIfAeHistory,
      activeWhatIfCategoryTrend,
      forecastGrowthRate,
    ]
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
      <SafeAreaView style={[styles.safeArea, { backgroundColor: flieger.background }]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, { backgroundColor: flieger.background }]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.hero,
            {
              backgroundColor: flieger.surface,
              borderWidth: 2,
              borderColor: flieger.borderStrong,
              borderRadius: 16,
            },
          ]}
        >
          <View style={{ alignItems: "center", gap: 12 }}>
            <FliegerMarker color={flieger.textPrimary} dotSize={7} triangleWidth={14} triangleHeight={12} />
            <Text
              style={[
                styles.title,
                {
                  color: flieger.textPrimary,
                  fontFamily: fliegerTypography.familyDisplay,
                  letterSpacing: fliegerTypography.letterSpacingWordmark,
                },
              ]}
            >
              FLIGHTCREWTOOLS
            </Text>
          <Text
            style={[
                styles.subtitle,
                {
                  color: flieger.label,
                  textAlign: "center",
                  fontFamily: fliegerTypography.familyLabel,
                  letterSpacing: fliegerTypography.letterSpacingWide,
                },
              ]}
          >
              DATA. DECISION. ACTION.
          </Text>
          </View>
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

            <View style={styles.sectionStack}>
              <ContractCopilotPanel />
            </View>
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
            description="Green means you can hold it. Neutral means it is close. Red means the category is still senior to you. Current marks your present category."
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
              <LegendSwatch label="Current" color="#D8CDB8" border />
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
                          <InstrumentCategoryCard
                            title={`${entry.fleet} ${entry.seat === "Captain" ? "CA" : "FO"}`}
                            status={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).status}
                            tone={toneForPilotStatus(fit.label === "Current category" ? "Can Hold" : fit.label)}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).badgeLabel}
                            statPairs={[
                              { label: "SR", value: `#${entry.mostSeniorNumber}` },
                              { label: "MID", value: entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-" },
                              { label: "JUNIOR", value: `#${entry.mostJuniorNumber}` },
                              { label: "YOU", value: `${userPosition.secondary ?? userPosition.primary}${formatSignedChange(trend?.lineMovement ?? null, "#") ? ` ${formatSignedChange(trend?.lineMovement ?? null, "#")}` : ""}` },
                            ]}
                            footer="Tap for details"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>
                                {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                              </Text>
                              <Text style={styles.tableSubtext}>{fit.label === "Can Hold" || fit.label === "Current category" ? "CAN HOLD • Tap for details" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for details" : `${fit.label.toUpperCase()} • Tap for details`}</Text>
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
                          <InstrumentCategoryCard
                            title={`${entry.fleet} FO`}
                            status={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).status}
                            tone={toneForPilotStatus(fit.label === "Current category" ? "Can Hold" : fit.label)}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fliegerStatusCopy(fit.label === "Current category" ? "Can Hold" : fit.label).badgeLabel}
                            statPairs={[
                              { label: "SR", value: `#${entry.mostSeniorNumber}` },
                              { label: "MID", value: entry.middleSeniorityNumber != null ? `#${entry.middleSeniorityNumber}` : "-" },
                              { label: "JUNIOR", value: `#${entry.mostJuniorNumber}` },
                              { label: "YOU", value: `${userPosition.secondary ?? userPosition.primary}${formatSignedChange(trend?.lineMovement ?? null, "#") ? ` ${formatSignedChange(trend?.lineMovement ?? null, "#")}` : ""}` },
                            ]}
                            footer="Tap for details"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                              <Text style={styles.tableSubtext}>{fit.label === "Can Hold" || fit.label === "Current category" ? "CAN HOLD • Tap for details" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for details" : `${fit.label.toUpperCase()} • Tap for details`}</Text>
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
                          <InstrumentCategoryCard
                            title={`${entry.fleet} ${entry.seat === "Captain" ? "CA" : "FO"}`}
                            status={fit.label === "Junior to You" ? "CAN HOLD" : fit.label === "Senior to You" ? "NOT HOLDABLE" : fit.label.toUpperCase()}
                            tone={fit.label === "Junior to You" ? "green" : fit.label === "Senior to You" ? "red" : "amber"}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fit.label === "Junior to You" ? "IN CATEGORY" : fit.label === "Senior to You" ? "SENIOR TO YOU" : "STATUS"}
                            statPairs={[
                              { label: "HIGH", value: formatSeniorityValue(entry.mostSeniorAwardNumber) },
                              { label: "MID", value: formatSeniorityValue(entry.middleAwardNumber) },
                              { label: "JUNIOR", value: formatSeniorityValue(entry.mostJuniorAwardNumber) },
                              { label: "YOU", value: userPosition.secondary ?? userPosition.primary },
                            ]}
                            footer="Tap for awards"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>
                                {entry.fleet} {entry.seat === "Captain" ? "CA" : "FO"}
                              </Text>
                                <Text style={styles.tableSubtext}>{fit.label === "Junior to You" ? "CAN HOLD • Tap for awards" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for awards" : `${fit.label.toUpperCase()} • Tap for awards`}</Text>
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
                          <InstrumentCategoryCard
                            title={`${entry.fleet} FO`}
                            status={fit.label === "Junior to You" ? "CAN HOLD" : fit.label === "Senior to You" ? "NOT HOLDABLE" : fit.label.toUpperCase()}
                            tone={fit.label === "Junior to You" ? "green" : fit.label === "Senior to You" ? "red" : "amber"}
                            badgePrimary={userPosition.secondary ?? userPosition.primary}
                            badgeLabel={fit.label === "Junior to You" ? "IN CATEGORY" : fit.label === "Senior to You" ? "SENIOR TO YOU" : "STATUS"}
                            statPairs={[
                              { label: "HIGH", value: formatSeniorityValue(entry.mostSeniorAwardNumber) },
                              { label: "MID", value: formatSeniorityValue(entry.middleAwardNumber) },
                              { label: "JUNIOR", value: formatSeniorityValue(entry.mostJuniorAwardNumber) },
                              { label: "YOU", value: userPosition.secondary ?? userPosition.primary },
                            ]}
                            footer="Tap for awards"
                          />
                        ) : (
                          <>
                            <View style={styles.tableCategoryCell}>
                              <Text style={styles.tableCategoryText}>{entry.fleet} FO</Text>
                                <Text style={styles.tableSubtext}>{fit.label === "Junior to You" ? "CAN HOLD • Tap for awards" : fit.label === "Senior to You" ? "NOT HOLDABLE • Tap for awards" : `${fit.label.toUpperCase()} • Tap for awards`}</Text>
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
              <View style={styles.baseSelector}>
                <TouchableOpacity
                  style={[styles.baseChip, holdPlannerView === "ae" && styles.baseChipActive]}
                  onPress={() => setHoldPlannerView("ae")}
                >
                  <Text style={[styles.baseChipLabel, holdPlannerView === "ae" && styles.baseChipLabelActive]}>
                    This Award
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.baseChip, holdPlannerView === "forecast" && styles.baseChipActive]}
                  onPress={() => setHoldPlannerView("forecast")}
                >
                  <Text
                    style={[
                      styles.baseChipLabel,
                      holdPlannerView === "forecast" && styles.baseChipLabelActive,
                    ]}
                  >
                    Forecast
                  </Text>
                </TouchableOpacity>
              </View>

              {activeWhatIfCategory && currentPilot ? (
                <>
                  <View style={styles.resultPanel}>
                    <ResultLine label="Target" value={formatCategoryEntryCode(activeWhatIfCategory)} />
                    <ResultLine
                      label={`Current list ${activeWhatIfCategory.seat === "Captain" ? "CA" : "FO"} line`}
                      value={`#${activeWhatIfCategory.mostJuniorNumber}`}
                    />
                    <ResultLine label="Your number today" value={`#${currentPilot.seniorityNumber}`} />
                    <Text style={styles.insightText}>
                      AE analysis answers this month. Forecast answers the broader holdability question.
                    </Text>
                  </View>

                  {holdPlannerView === "ae" ? (
                    <CurrentAeDesktopPanel analysis={currentAeAnalysis} />
                  ) : (
                    <ForecastDesktopPanel
                      forecast={holdForecast}
                      analysis={currentAeAnalysis}
                      forecastGrowthRate={forecastGrowthRate}
                      forecastGrowthMenuOpen={forecastGrowthMenuOpen}
                      setForecastGrowthRate={setForecastGrowthRate}
                      setForecastGrowthMenuOpen={setForecastGrowthMenuOpen}
                    />
                  )}
                </>
              ) : (
                <Text style={styles.insightText}>
                  Enter your employee number and pick a target category to compare this award against the broader hold forecast.
                </Text>
              )}
            </View>
          </SectionCard>
        )}
      </ScrollView>
      <View
        style={[
          styles.bottomTabBar,
          {
            backgroundColor: flieger.surface,
            borderTopWidth: 2,
            borderTopColor: flieger.borderStrong,
          },
        ]}
      >
        <View style={{ position: "absolute", top: -18, left: 0, right: 0, alignItems: "center" }}>
          <FliegerMarker color={flieger.textPrimary} dotSize={5} triangleWidth={10} triangleHeight={9} />
        </View>
        {tabs.map((tab) => (
          <BottomNavItem
            key={tab.key}
            icon={tab.icon}
            label={tab.label}
            active={activeTab === tab.key}
            onPress={() => setActiveTab(tab.key)}
          />
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

function formatFliegerCategoryTitle(entry: Pick<CategoryEntry, "fleet" | "seat">) {
  return `${entry.fleet} ${entry.seat === "Captain" ? "CA" : "FO"}`;
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
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel style={styles.card}>
      <Text style={[styles.cardTitle, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
        {title}
      </Text>
      <Text
        style={[
          styles.cardDescription,
          { color: palette.textSecondary, fontFamily: fliegerTypography.familyBody },
        ]}
      >
        {description}
      </Text>
      <View style={styles.cardBody}>{children}</View>
    </InstrumentPanel>
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
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel
      variant="dataPlate"
      tone={tone === "gold" ? "red" : tone === "green" ? "green" : "neutral"}
      style={[styles.metricCard, tone === "gold" && styles.metricGold, tone === "green" && styles.metricGreen]}
    >
      <Text style={[styles.metricLabel, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.metricValue,
          {
            color: tone === "gold" ? palette.red : tone === "green" ? palette.green : palette.textPrimary,
            fontFamily: fliegerTypography.familyValue,
            fontVariant: ["tabular-nums"],
          },
        ]}
      >
        {value}
      </Text>
    </InstrumentPanel>
  );
}

function SnapshotPill({ label, value }: { label: string; value: string }) {
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel variant="dataPlate" style={styles.snapshotPill}>
      <Text style={[styles.snapshotLabel, { color: palette.textMuted, fontFamily: fliegerTypography.familyLabel }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.snapshotValue,
          { color: palette.textPrimary, fontFamily: fliegerTypography.familyValue, fontVariant: ["tabular-nums"] },
        ]}
      >
        {value}
      </Text>
    </InstrumentPanel>
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
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel variant="elevated" style={styles.summaryCard}>
      <Text style={[styles.summaryTitle, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
        {title}
      </Text>
      <Text
        style={[
          styles.summaryMain,
          { color: palette.cream, fontFamily: fliegerTypography.familyValue, fontVariant: ["tabular-nums"] },
        ]}
      >
        {mainValue}
      </Text>
      <Text
        style={[styles.summaryDetail, { color: palette.textSecondary, fontFamily: fliegerTypography.familyBody }]}
      >
        {detailValue}
      </Text>
      <Text style={[styles.summarySub, { color: palette.textMuted, fontFamily: fliegerTypography.familyBody }]}>
        {subValue}
      </Text>
      <View style={[styles.summaryTrack, { backgroundColor: palette.accentSoft }]}>
        <View
          style={[
            styles.summaryFill,
            { width: `${Math.max(6, Math.min(100, progress))}%`, backgroundColor: palette.red },
          ]}
        />
      </View>
    </InstrumentPanel>
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
      <InstrumentField
        label={label}
        value={value}
        onChangeText={onChangeText}
        prefix={prefix}
        suffix={suffix}
        keyboardType={keyboardType ?? "numeric"}
      />
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
      <InstrumentField
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline
        minHeight={220}
        autoCapitalize="characters"
      />
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

function fliegerStatusCopy(label: string) {
  if (label === "Can Hold" || label === "Junior to You") {
    return {
      status: "CAN HOLD",
      badgeLabel: "IN CATEGORY",
    };
  }
  if (label === "Senior to You") {
    return {
      status: "NOT HOLDABLE",
      badgeLabel: "SENIOR TO YOU",
    };
  }
  return {
    status: label.toUpperCase(),
    badgeLabel: "STATUS",
  };
}

function fliegerTonePalette(tone: "green" | "amber" | "red" | "neutral") {
  const palette = getFliegerPalette();
  if (tone === "green") {
    return {
      borderColor: palette.greenBorder,
      statusColor: palette.green,
      badgeBackground: palette.surfaceRaised,
      badgeBorder: palette.greenBorder,
    };
  }
  if (tone === "red") {
    return {
      borderColor: palette.redBorder,
      statusColor: palette.red,
      badgeBackground: palette.surfaceRaised,
      badgeBorder: palette.redBorder,
    };
  }
  return {
    borderColor: palette.borderStrong,
    statusColor: tone === "amber" ? palette.label : palette.textSecondary,
    badgeBackground: palette.surfaceRaised,
    badgeBorder: palette.borderStrong,
  };
}

function InstrumentCategoryCard({
  title,
  status,
  tone,
  badgePrimary,
  badgeLabel,
  statPairs,
  footer,
  onPress,
}: {
  title: string;
  status: string;
  tone: "green" | "amber" | "red" | "neutral";
  badgePrimary: string;
  badgeLabel: string;
  statPairs: Array<{ label: string; value: string }>;
  footer?: string;
  onPress?: () => void;
}) {
  const palette = getFliegerPalette();
  const tonePalette = fliegerTonePalette(tone);
  return (
    <DecisionRow
      title={title}
      status={status}
      variant={tone === "green" ? "canHold" : tone === "red" ? "notHoldable" : tone === "amber" ? "close" : "current"}
      badgePrimary={badgePrimary}
      badgeLabel={badgeLabel}
      statPairs={statPairs}
      footer={footer}
      onPress={onPress}
    />
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
  onOpenCurrentCategory,
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
  onOpenCurrentCategory: (entry: CategoryEntry) => void;
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
        currentCategoryEntry={currentCategoryEntry}
        preferencesEditing={preferencesEditing}
        preferencesComplete={preferencesComplete}
        onPreferencesEditingChange={onPreferencesEditingChange}
        goalInput={goalInput}
        onGoalInputChange={onGoalInputChange}
        onAddGoal={addGoal}
        onPreferencesChange={onPreferencesChange}
        watchedCategories={trackedCategories.map((item) => item.entry.key)}
        trackedCategoryItems={trackedCategories}
        onOpenCurrentCategory={onOpenCurrentCategory}
        onOpenTrackedCategory={onOpenTrackedCategory}
      />

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
          Add the seats you want pinned on Home. You can remove saved seats from the list above.
        </Text>
        <View style={styles.mobileGoalRow}>
          <View style={styles.mobileGoalInputWrap}>
            <InstrumentField
              value={goalInput}
              onChangeText={onGoalInputChange}
              placeholder="ATL-320-CA or SLC220A"
              autoCapitalize="characters"
            />
          </View>
          <InstrumentButton label="Add" variant="active" onPress={onAddGoal} style={styles.mobileAddGoalButton} />
        </View>
        {watchedCategories.length > 0 ? (
          <View style={styles.baseSelector}>
            {watchedCategories.map((goal) => (
              <InstrumentChip
                key={`goal-${goal}`}
                style={[styles.baseChip, styles.goalChip]}
                variant="active"
                label={displayCategoryPreference(goal)}
                onPress={() =>
                  onPreferencesChange((current) => ({
                    ...current,
                    goalCategories: current.goalCategories.filter((entry) => entry !== goal),
                  }))
                }
              />
            ))}
          </View>
        ) : (
          <Text style={styles.mobileDecisionFooter}>
            No watch categories yet. Add the seats you want this dashboard to track.
          </Text>
        )}
      </View>
      <InstrumentButton label="Save" variant="active" onPress={onDone} style={styles.mobileSavePrefsButton} />
    </View>
  );
}

function MobilePreferencesPanel({
  currentPilot,
  currentCategoryEntry,
  preferencesEditing,
  preferencesComplete,
  onPreferencesEditingChange,
  goalInput,
  onGoalInputChange,
  onAddGoal,
  onPreferencesChange,
  watchedCategories,
  trackedCategoryItems,
  onOpenCurrentCategory,
  onOpenTrackedCategory,
}: {
  currentPilot: PilotRecord | null;
  currentCategoryEntry: CategoryEntry | null;
  preferencesEditing: boolean;
  preferencesComplete: boolean;
  onPreferencesEditingChange: (value: boolean) => void;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  onAddGoal: () => void;
  onPreferencesChange: React.Dispatch<React.SetStateAction<PilotPreferences>>;
  watchedCategories: string[];
  trackedCategoryItems: ReturnType<typeof buildMobileCategoryCardDatum>[];
  onOpenCurrentCategory: (entry: CategoryEntry) => void;
  onOpenTrackedCategory: (entry: CategoryEntry) => void;
}) {
  const palette = getFliegerPalette();
  const watchedRows = [
    ...(currentCategoryEntry
      ? [
          {
            key: `current-${currentCategoryEntry.key}`,
            title: formatCategoryEntryCode(currentCategoryEntry),
            subtitle: "CAN HOLD • Tap for details",
            badge: "Current",
            tone: "green" as const,
            deletable: false,
            onPress: () => onOpenTrackedCategory(currentCategoryEntry),
            onDelete: null,
          },
        ]
      : []),
    ...trackedCategoryItems
      .filter((item) => item.entry.key !== currentCategoryEntry?.key)
      .map((item) => ({
        key: `watch-${item.entry.key}`,
        title: formatCategoryEntryCode(item.entry),
        subtitle:
          item.statusLabel === "Can Hold"
            ? "CAN HOLD • Tap for details"
            : item.statusLabel === "Senior to You"
              ? "NOT HOLDABLE • Tap for details"
              : `${item.statusLabel.toUpperCase()} • Tap for details`,
        badge: item.statusLabel === "Can Hold" ? "IN CATEGORY" : item.statusLabel === "Senior to You" ? "SENIOR TO YOU" : item.statusLabel.toUpperCase(),
        tone: item.tone,
        deletable: true,
        onPress: () => onOpenTrackedCategory(item.entry),
        onDelete: () =>
          onPreferencesChange((current) => ({
            ...current,
            goalCategories: current.goalCategories.filter((entry) => entry !== item.entry.key),
          })),
      })),
  ];

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
        <InstrumentButton
          label={preferencesEditing ? "Close" : "Edit"}
          variant={preferencesEditing ? "danger" : "active"}
          compact
          onPress={() => onPreferencesEditingChange(!preferencesEditing)}
          style={styles.mobileEditPrefsButton}
        />
      </View>
      {watchedRows.length > 0 ? (
        <View style={styles.mobileTrackedCategoryList}>
          {watchedRows.map((row) => (
            <View key={row.key} style={styles.mobileTrackedCategoryRow}>
              <TouchableOpacity
                style={[
                  styles.mobileTrackedCategoryMain,
                  statusBackgroundStyle(row.tone),
                ]}
                activeOpacity={0.85}
                onPress={row.onPress}
              >
                <View pointerEvents="none" style={styles.mobileTrackedCategoryTopEdge} />
                <View pointerEvents="none" style={styles.mobileTrackedCategoryBottomEdge} />
                <View
                  pointerEvents="none"
                  style={styles.mobileTrackedCategoryInnerEdge}
                />
                <View style={styles.mobileTrackedCategoryCopy}>
                  <Text style={[styles.mobileTrackedCategoryTitle, { color: palette.textPrimary }]}>{row.title}</Text>
                  <Text style={[styles.mobileTrackedCategorySubtitle, { color: palette.textMuted }]}>{row.subtitle}</Text>
                </View>
                <MobileStatusBadge label={row.badge} tone={row.tone} />
              </TouchableOpacity>
              {row.deletable && row.onDelete ? (
                <InstrumentButton
                  label="Delete"
                  variant="danger"
                  compact
                  onPress={row.onDelete}
                  style={styles.mobileTrackedDeleteButton}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.mobileDecisionFooter}>
          Your current category will always live here. Tap Edit to add more seats to follow.
        </Text>
      )}
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
          <InstrumentChip
            key={chip.key}
            style={[styles.baseChip, filter === chip.key && styles.baseChipActive]}
            variant={filter === chip.key ? "active" : "neutral"}
            label={chip.label}
            onPress={() => onFilterChange(chip.key)}
          />
        ))}
      </View>
      <View style={styles.mobileCardStack}>
        {entries.map((item) => (
          <InstrumentCategoryCard
            key={`mobile-category-${item.entry.key}`}
            title={formatFliegerCategoryTitle(item.entry)}
            status={
              item.statusLabel === "Can Hold"
                ? "CAN HOLD"
                : item.statusLabel === "Senior to You"
                  ? "NOT HOLDABLE"
                  : item.statusLabel.toUpperCase()
            }
            tone={item.tone}
            badgePrimary={item.badgePrimary}
            badgeLabel={item.badgeLabel}
            statPairs={[
              { label: "SR", value: `#${item.entry.mostSeniorNumber}` },
              {
                label: "MID",
                value: item.entry.middleSeniorityNumber != null ? `#${item.entry.middleSeniorityNumber}` : "-",
              },
              {
                label: "JUNIOR",
                value: `#${item.entry.mostJuniorNumber}${item.userPosition.primary.startsWith("+") ? ` ${item.userPosition.primary}` : ""}`,
              },
              { label: "YOU", value: item.userPosition.secondary ?? item.userPosition.primary },
            ]}
            footer="Tap for details"
            onPress={() => onOpenCategory(item.entry)}
          />
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
          <InstrumentCategoryCard
            key={`movement-${item.entry.awardCategory}`}
            title={item.entry.awardCategory}
            status={item.statusLabel === "Junior to You" ? "CAN HOLD" : item.statusLabel === "Senior to You" ? "NOT HOLDABLE" : item.statusLabel.toUpperCase()}
            tone={item.tone}
            badgePrimary={item.summaryText.includes("#") ? item.summaryText.split(" ").find((part) => part.startsWith("#")) ?? item.summaryText : item.statusLabel === "Senior to You" ? "AE" : "LIVE"}
            badgeLabel={item.statusLabel === "Senior to You" ? "SENIOR TO YOU" : item.statusLabel === "Junior to You" ? "IN CATEGORY" : "LATEST AE"}
            statPairs={[
              { label: "JUNIOR", value: formatSeniorityValue(item.entry.mostJuniorAwardNumber) },
              { label: "TREND", value: item.trendText.replace("Moved ", "") },
              { label: "AWARDS", value: `${item.entry.awards}` },
              { label: "BASE", value: item.entry.base },
            ]}
            footer="Tap for awards"
            onPress={() => onOpenAe(item)}
          />
        ))}
      </View>
    </SectionCard>
  );
}

function MobileCareerPlanningView({
  currentPilot,
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
  holdPlannerView,
  setHoldPlannerView,
  currentAeAnalysis,
  holdForecast,
  forecastGrowthRate,
  setForecastGrowthRate,
  forecastGrowthMenuOpen,
  setForecastGrowthMenuOpen,
}: {
  currentPilot: PilotRecord | null;
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
  holdPlannerView: HoldPlannerView;
  setHoldPlannerView: (value: HoldPlannerView) => void;
  currentAeAnalysis: CurrentAeAnalysisResult | null;
  holdForecast: HoldForecastResult | null;
  forecastGrowthRate: number;
  setForecastGrowthRate: (value: number) => void;
  forecastGrowthMenuOpen: boolean;
  setForecastGrowthMenuOpen: (value: boolean) => void;
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
        <Text style={styles.mobileSectionTitle}>Hold Planner</Text>
        <Text style={styles.mobileSectionText}>
          Use `This Award` for the monthly AE question. Use `Forecast` for the broader planning question.
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
        <View style={styles.baseSelector}>
          <TouchableOpacity
            style={[styles.baseChip, holdPlannerView === "ae" && styles.baseChipActive]}
            onPress={() => setHoldPlannerView("ae")}
          >
            <Text style={[styles.baseChipLabel, holdPlannerView === "ae" && styles.baseChipLabelActive]}>
              This Award
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.baseChip, holdPlannerView === "forecast" && styles.baseChipActive]}
            onPress={() => setHoldPlannerView("forecast")}
          >
            <Text
              style={[
                styles.baseChipLabel,
                holdPlannerView === "forecast" && styles.baseChipLabelActive,
              ]}
            >
              Forecast
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.plannerModeHint}>
          {holdPlannerView === "ae"
            ? "This Award answers: did this seat actually award this month, where was the line, and were you senior enough?"
            : "Forecast answers: can you generally hold it, how far away are you, and when does blended evidence suggest it opens up?"}
        </Text>
            {activeWhatIfCategory && currentPilot ? (
          <>
            <Text style={styles.mobileSectionText}>
              {formatCategoryEntryCode(activeWhatIfCategory)} • Current JR pilot #
              {activeWhatIfCategory.mostJuniorNumber}
            </Text>
            {holdPlannerView === "ae" ? (
              <CurrentAePlannerCard analysis={currentAeAnalysis} />
            ) : (
              <ForecastPlannerCard
                forecast={holdForecast}
                analysis={currentAeAnalysis}
                forecastGrowthRate={forecastGrowthRate}
                forecastGrowthMenuOpen={forecastGrowthMenuOpen}
                setForecastGrowthRate={setForecastGrowthRate}
                setForecastGrowthMenuOpen={setForecastGrowthMenuOpen}
              />
            )}
          </>
        ) : (
          <Text style={styles.mobileSectionText}>
            Enter your employee number and pick a target category to compare the current award versus the broader hold forecast.
          </Text>
        )}
      </View>
    </SectionCard>
  );
}

function CurrentAePlannerCard({
  analysis,
}: {
  analysis: CurrentAeAnalysisResult | null;
}) {
  if (!analysis) {
    return null;
  }

  return (
    <View style={[styles.mobileDecisionCard, styles.mobileNeutralCard]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.mobileDecisionTitle}>This Award</Text>
          <Text style={styles.mobileDecisionSubtitle}>
            Tactical monthly read. Latest AE visibility only, not general holdability.
          </Text>
        </View>
        <MobileStatusBadge label={analysis.status} tone={toneForCurrentAeStatus(analysis.status)} compact />
      </View>
      <View style={styles.mobileInfoRow}>
        <InfoChip label="Awarded" value={analysis.awardedInLatestAe ? "Yes" : "No"} />
        <InfoChip label="Latest AE JR pilot" value={analysis.awardLine != null ? `#${analysis.awardLine}` : "—"} />
        <InfoChip label="Recent AEs" value={`${analysis.recentSignalCount}`} />
      </View>
      {analysis.recentAwardsAverage != null ? (
        <Text style={styles.mobileDecisionFooter}>
          Recent AE average: {analysis.recentAwardsAverage.toFixed(1)} awards.
        </Text>
      ) : null}
      <Text style={styles.plannerSectionLabel}>What this award says</Text>
      <View style={styles.mobileEvidenceList}>
        {analysis.explanation.map((line) => (
          <Text key={`ae-analysis-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ForecastPlannerCard({
  forecast,
  analysis,
  forecastGrowthRate,
  forecastGrowthMenuOpen,
  setForecastGrowthRate,
  setForecastGrowthMenuOpen,
}: {
  forecast: HoldForecastResult | null;
  analysis: CurrentAeAnalysisResult | null;
  forecastGrowthRate: number;
  forecastGrowthMenuOpen: boolean;
  setForecastGrowthRate: (value: number) => void;
  setForecastGrowthMenuOpen: (value: boolean) => void;
}) {
  if (!forecast) {
    return null;
  }

  return (
    <View style={[styles.mobileDecisionCard, styles.mobileNeutralCard]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.mobileDecisionTitle}>Forecast</Text>
          <Text style={styles.mobileDecisionSubtitle}>
            Broader planning read using current list, AE history, movement, and list growth.
          </Text>
        </View>
        <MobileStatusBadge
          label={forecast.status}
          tone={toneForForecastStatus(forecast.status)}
          compact
        />
      </View>
      <View style={styles.dropdownWrap}>
        <Text style={styles.inputLabel}>Forecast growth</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setForecastGrowthMenuOpen(!forecastGrowthMenuOpen)}
        >
          <Text style={styles.dropdownButtonText}>
            {Math.round(forecastGrowthRate * 100)}% annual growth
          </Text>
        </TouchableOpacity>
        {forecastGrowthMenuOpen ? (
          <View style={styles.dropdownMenu}>
            {forecastGrowthRates.map((option) => (
              <TouchableOpacity
                key={`forecast-growth-${option.value}`}
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
      <View style={styles.mobileInfoRow}>
        <InfoChip label="Window" value={forecast.holdWindow} />
        <InfoChip label="Confidence" value={forecast.confidence} />
        <InfoChip label="Gap today" value={`${forecast.currentGap}`} />
      </View>
      <View style={styles.mobileInfoRow}>
        <InfoChip label="Current JR pilot" value={`#${forecast.currentListLine}`} />
        <InfoChip label="Forecast JR pilot" value={`#${forecast.blendedLine}`} />
        <InfoChip label="Est. date" value={forecast.estimatedDateLabel ?? "Longer-range"} />
      </View>
      {forecast.differsFromAe && analysis ? (
        <View style={styles.mobilePlannerCallout}>
          <Text style={styles.mobilePlannerCalloutTitle}>Why Forecast can differ from This Award</Text>
          <Text style={styles.mobilePlannerCalloutText}>
            Latest AE did not fully answer this seat. Forecast blends broader seniority, trend, and progression data.
          </Text>
        </View>
      ) : null}
      <Text style={styles.plannerSectionLabel}>Blended evidence</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.evidenceSummary.map((line) => (
          <Text key={`forecast-evidence-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
      <Text style={styles.plannerSectionLabel}>Why the forecast says this</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.explanation.map((line) => (
          <Text key={`forecast-explanation-${line}`} style={styles.mobileEvidenceTextMuted}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function CurrentAeDesktopPanel({
  analysis,
}: {
  analysis: CurrentAeAnalysisResult | null;
}) {
  if (!analysis) {
    return null;
  }

  return (
    <View style={[styles.resultPanel, styles.desktopPlannerPanel]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.projectionTitle}>This Award</Text>
          <Text style={styles.projectionMeta}>
            Tactical monthly read. This answers what happened in the latest AE, not general holdability.
          </Text>
        </View>
        <MobileStatusBadge label={analysis.status} tone={toneForCurrentAeStatus(analysis.status)} compact />
      </View>
      <FormRow>
        <ResultLine label="Awarded in latest AE" value={analysis.awardedInLatestAe ? "Yes" : "No"} />
        <ResultLine label="Latest AE JR pilot" value={analysis.awardLine != null ? `#${analysis.awardLine}` : "—"} />
        <ResultLine label="Recent AEs" value={`${analysis.recentSignalCount}`} />
      </FormRow>
      <Text style={styles.plannerSectionLabel}>What this award says</Text>
      <View style={styles.mobileEvidenceList}>
        {analysis.explanation.map((line) => (
          <Text key={`desktop-ae-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ForecastDesktopPanel({
  forecast,
  analysis,
  forecastGrowthRate,
  forecastGrowthMenuOpen,
  setForecastGrowthRate,
  setForecastGrowthMenuOpen,
}: {
  forecast: HoldForecastResult | null;
  analysis: CurrentAeAnalysisResult | null;
  forecastGrowthRate: number;
  forecastGrowthMenuOpen: boolean;
  setForecastGrowthRate: (value: number) => void;
  setForecastGrowthMenuOpen: (value: boolean) => void;
}) {
  if (!forecast) {
    return null;
  }

  return (
    <View style={[styles.resultPanel, styles.desktopPlannerPanel]}>
      <View style={styles.mobileDecisionHeader}>
        <View style={styles.mobileDecisionTitleWrap}>
          <Text style={styles.projectionTitle}>Forecast</Text>
          <Text style={styles.projectionMeta}>
            Broader planning read based on current list, AE history, category movement, and projected seniority progression.
          </Text>
        </View>
        <MobileStatusBadge label={forecast.status} tone={toneForForecastStatus(forecast.status)} compact />
      </View>
      <View style={[styles.forecastControlRow, styles.desktopForecastControlRow]}>
        <View style={styles.forecastGrowthWrap}>
          <Text style={styles.inputLabel}>Forecast growth</Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setForecastGrowthMenuOpen(!forecastGrowthMenuOpen)}
          >
            <Text style={styles.dropdownButtonText}>{Math.round(forecastGrowthRate * 100)}% annual growth</Text>
          </TouchableOpacity>
          {forecastGrowthMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {forecastGrowthRates.map((option) => (
                <TouchableOpacity
                  key={`desktop-forecast-growth-${option.value}`}
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
      <FormRow>
        <ResultLine label="Hold window" value={forecast.holdWindow} emphasis />
        <ResultLine label="Confidence" value={forecast.confidence} />
        <ResultLine label="Gap today" value={`${forecast.currentGap}`} />
      </FormRow>
      <FormRow>
        <ResultLine label="Current JR pilot" value={`#${forecast.currentListLine}`} />
        <ResultLine label="Forecast JR pilot" value={`#${forecast.blendedLine}`} />
        <ResultLine label="Estimated date" value={forecast.estimatedDateLabel ?? "Longer-range"} />
      </FormRow>
      {forecast.differsFromAe && analysis ? (
        <View style={styles.mobilePlannerCallout}>
          <Text style={styles.mobilePlannerCalloutTitle}>Why Forecast can differ from This Award</Text>
          <Text style={styles.mobilePlannerCalloutText}>
            Latest AE did not fully answer this seat. Forecast blends broader seniority, trend, and progression data.
          </Text>
        </View>
      ) : null}
      <Text style={styles.plannerSectionLabel}>Blended evidence</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.evidenceSummary.map((line) => (
          <Text key={`desktop-forecast-${line}`} style={styles.mobileEvidenceText}>
            • {line}
          </Text>
        ))}
      </View>
      <Text style={styles.plannerSectionLabel}>Why the forecast says this</Text>
      <View style={styles.mobileEvidenceList}>
        {forecast.explanation.map((line) => (
          <Text key={`desktop-forecast-explain-${line}`} style={styles.mobileEvidenceTextMuted}>
            • {line}
          </Text>
        ))}
      </View>
    </View>
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
  const palette = getFliegerPalette();
  return (
    <InstrumentPanel style={styles.mobileDashboardCard}>
      <Text style={[styles.mobileDashboardEyebrow, { color: palette.label, fontFamily: fliegerTypography.familyLabel }]}>
        {eyebrow}
      </Text>
      <Text style={[styles.mobileDashboardTitle, { color: palette.textPrimary, fontFamily: fliegerTypography.familyDisplay }]}>
        {title}
      </Text>
      {children}
    </InstrumentPanel>
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
  const palette = getFliegerPalette();
  return (
    <View
      style={[
        styles.mobileStatusBadge,
        {
          backgroundColor:
            tone === "green"
              ? (appStyleIsDark ? "rgba(0,255,102,0.16)" : "rgba(0,255,102,0.20)")
              : tone === "amber"
                ? palette.badgeNeutral
                : tone === "red"
                  ? (appStyleIsDark ? "rgba(255,48,48,0.16)" : "rgba(255,48,48,0.18)")
                  : palette.badgeNeutral,
          borderColor:
            tone === "green"
              ? palette.greenBorder
              : tone === "amber"
                ? palette.borderStrong
                : tone === "red"
                  ? palette.redBorder
                  : palette.badgeNeutralBorder,
          borderWidth: 2,
          borderRadius: 14,
          shadowColor:
            tone === "green"
              ? palette.green
              : tone === "red"
                ? palette.red
                : palette.borderStrong,
          shadowOpacity: tone === "neutral" ? 0.12 : appStyleIsDark ? 0.2 : 0.14,
          shadowRadius: appStyleIsDark ? 4 : 3,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        },
        tone === "green" && styles.mobileStatusBadgeGreen,
        tone === "amber" && styles.mobileStatusBadgeAmber,
        tone === "red" && styles.mobileStatusBadgeRed,
        compact && styles.mobileStatusBadgeCompact,
      ]}
    >
      <Text
        style={[
          styles.mobileStatusBadgeText,
          {
            color:
              tone === "green"
                ? palette.green
                : tone === "red"
                  ? palette.red
                  : tone === "amber"
                    ? palette.label
                    : palette.textPrimary,
            fontFamily: fliegerTypography.familyLabel,
          },
        ]}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  const palette = getFliegerPalette();
  return (
    <View
      style={[
        styles.mobileInfoChip,
        {
          backgroundColor: palette.surfaceRaised,
          borderWidth: 2,
          borderColor: palette.border,
          borderRadius: 14,
        },
      ]}
    >
      <Text
        style={[styles.mobileInfoChipLabel, { color: palette.textMuted, fontFamily: fliegerTypography.familyLabel }]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.mobileInfoChipValue,
          { color: palette.textPrimary, fontFamily: fliegerTypography.familyValue, fontVariant: ["tabular-nums"] },
        ]}
      >
        {value}
      </Text>
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

function toneForCurrentAeStatus(status: CurrentAeAnalysisResult["status"]) {
  if (status === "Can Hold This AE") {
    return "green" as const;
  }
  if (status === "Not Awarded This AE" || status === "No Recent AE Signal") {
    return "amber" as const;
  }
  return "red" as const;
}

function toneForForecastStatus(status: HoldForecastResult["status"]) {
  if (status === "Already Holding" || status === "Can Generally Hold") {
    return "green" as const;
  }
  if (status === "Likely Hold Soon") {
    return "amber" as const;
  }
  return "red" as const;
}

function statusBackgroundStyle(tone: "green" | "amber" | "red" | "neutral") {
  const palette = getFliegerPalette();
  const isDark = palette.textPrimary === "#F2E9DC";
  const rowSurface = isDark ? "#303840" : "#D2D8DE";
  if (tone === "green") {
    return {
      backgroundColor: rowSurface,
      borderColor: palette.green,
      borderWidth: 2.8,
      shadowColor: "rgba(0,255,102,0.25)",
      shadowOpacity: isDark ? 0.24 : 0.14,
      shadowRadius: isDark ? 6 : 4,
      shadowOffset: { width: 0, height: isDark ? 3 : 2 },
      elevation: 5,
    };
  }
  if (tone === "amber") {
    return {
      backgroundColor: rowSurface,
      borderColor: palette.borderStrong,
      borderWidth: 2.8,
      shadowColor: "rgba(17,24,32,0.08)",
      shadowOpacity: isDark ? 0.16 : 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: isDark ? 3 : 2 },
      elevation: 3,
    };
  }
  if (tone === "red") {
    return {
      backgroundColor: rowSurface,
      borderColor: palette.red,
      borderWidth: 2.8,
      shadowColor: "rgba(255,48,48,0.25)",
      shadowOpacity: isDark ? 0.24 : 0.14,
      shadowRadius: isDark ? 6 : 4,
      shadowOffset: { width: 0, height: isDark ? 3 : 2 },
      elevation: 5,
    };
  }
  return {
    backgroundColor: rowSurface,
    borderColor: palette.borderStrong,
    borderWidth: 2.8,
    shadowColor: "rgba(17,24,32,0.08)",
    shadowOpacity: isDark ? 0.16 : 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: isDark ? 3 : 2 },
    elevation: 3,
  };
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

  const badgePrimary =
    statusLabel === "Can Hold"
      ? userPosition.secondary ?? "IN"
      : statusLabel === "Senior to You"
        ? userPosition.primary
        : statusLabel === "Close"
          ? userPosition.primary
          : userPosition.secondary ?? userPosition.primary;
  const badgeLabel =
    statusLabel === "Can Hold"
      ? "IN CATEGORY"
      : statusLabel === "Senior to You"
        ? "SENIOR TO YOU"
        : statusLabel === "Close"
          ? "FROM LINE"
          : "STATUS";

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
    badgePrimary,
    badgeLabel,
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
    const estimate = forecastHoldability({
      pilot: currentPilot,
      target,
      latestAe: null,
      aeHistory: null,
      categoryTrend: null,
      pilots,
      growthRate: 0.01,
    });
    const fit = evaluateCategoryHold(target, currentPilot.seniorityNumber, currentPilot.currentCategoryKey);
    const statusLabel = fit.label === "Current category" ? "Can Hold" : fit.label;
    return {
      key: `${label}-${target.key}`,
      label,
      targetCode: formatCategoryEntryCode(target),
      statusLabel,
      tone: toneForPilotStatus(statusLabel),
      timing: estimate?.estimatedDateLabel ? `Est. ${estimate.estimatedDateLabel}` : estimate?.holdWindow ?? "Longer-range",
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
    backgroundColor: appStylePalette.background,
  },
  container: {
    padding: 20,
    paddingBottom: 120,
    gap: 18,
  },
  hero: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 16,
    padding: 22,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingWide,
    color: appStylePalette.accent,
    textAlign: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
    textAlign: "center",
    letterSpacing: fliegerTypography.letterSpacingWordmark,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: appStylePalette.textMuted,
    letterSpacing: fliegerTypography.letterSpacingWide,
    textTransform: "uppercase",
  },
  heroMetrics: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  metricCard: {
    minWidth: 98,
    flex: 1,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  metricGold: {
    borderColor: appStylePalette.redBorder,
  },
  metricGreen: {
    borderColor: appStylePalette.greenBorder,
  },
  metricLabel: {
    color: appStylePalette.label,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  metricValue: {
    color: appStylePalette.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
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
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: appStylePalette.surface,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.borderStrong,
  },
  tabButton: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: appStylePalette.surfaceRaised,
    alignItems: "center",
    gap: 8,
  },
  tabButtonActive: {
    backgroundColor: "rgba(102,217,242,0.10)",
  },
  tabIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: appStylePalette.surfaceRecessed,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconCircleActive: {
    backgroundColor: "rgba(102,217,242,0.14)",
  },
  tabIconText: {
    color: appStylePalette.textPrimary,
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
    color: "#66D9F2",
  },
  tabLabel: {
    color: appStylePalette.textMuted,
    fontWeight: "700",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  tabLabelActive: {
    color: "#66D9F2",
  },
  sectionStack: {
    gap: 14,
  },
  card: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: appStylePalette.accent,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
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
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  summaryMain: {
    fontSize: 42,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  summaryDetail: {
    fontSize: 14,
    color: appStylePalette.textMuted,
    fontWeight: "600",
  },
  summarySub: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textMuted,
  },
  summaryTrack: {
    height: 18,
    borderRadius: 999,
    backgroundColor: appStylePalette.surfaceRecessed,
    overflow: "hidden",
  },
  summaryFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: appStylePalette.accent,
  },
  snapshotPill: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  snapshotLabel: {
    fontSize: 12,
    color: appStylePalette.textMuted,
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
  },
  snapshotValue: {
    fontSize: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
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
    color: appStylePalette.accent,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: appStylePalette.surfaceRecessed,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputAffix: {
    color: appStylePalette.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: appStylePalette.textPrimary,
    paddingVertical: 12,
  },
  textAreaShell: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 220,
  },
  textAreaInput: {
    minHeight: 192,
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textPrimary,
  },
  resultPanel: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  quickLinkButton: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickLinkButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.accent,
  },
  whatIfScenarioPanel: {
    flex: 1,
    minWidth: 260,
  },
  paySummaryCard: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
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
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  payToolCardActive: {
    borderColor: "#007FA3",
  },
  payToolHero: {
    minHeight: 104,
    backgroundColor: appStylePalette.surfaceRaised,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "space-between",
  },
  payToolGlyph: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.accent,
  },
  payToolBadge: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRecessed,
    color: appStylePalette.textPrimary,
    fontSize: 12,
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
    color: appStylePalette.textPrimary,
  },
  payToolSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
  },
  payToolButton: {
    marginHorizontal: 18,
    marginBottom: 18,
    backgroundColor: appStylePalette.surfaceRaised,
    color: appStylePalette.textPrimary,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    borderRadius: 12,
    overflow: "hidden",
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  payToolPlaceholder: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  payToolPlaceholderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  payToolPlaceholderText: {
    fontSize: 14,
    lineHeight: 22,
    color: appStylePalette.textMuted,
  },
  auditButton: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  auditButtonDisabled: {
    backgroundColor: appStylePalette.surfaceRaised,
  },
  auditButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  auditSummaryHero: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    padding: 18,
    gap: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  auditSummaryHeader: {
    gap: 4,
  },
  auditSummaryTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
  },
  auditSummaryMeta: {
    fontSize: 13,
    color: "#344552",
    fontWeight: "700",
  },
  auditSummaryMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  auditSummaryFormula: {
    fontSize: 13,
    color: "#41505C",
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
    color: "#41505C",
  },
  resultValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111820",
  },
  resultValueEmphasis: {
    color: "#007FA3",
  },
  baseSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  baseChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#2B3239",
    borderWidth: 1.5,
    borderColor: "#46515C",
  },
  baseChipActive: {
    backgroundColor: "rgba(102,217,242,0.12)",
    borderColor: "#66D9F2",
  },
  baseChipLabel: {
    color: "#C3CBD2",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  baseChipLabelActive: {
    color: "#66D9F2",
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
    color: "#344552",
    fontWeight: "600",
  },
  identityCard: {
    backgroundColor: "#C6CDD4",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    gap: 6,
  },
  identityName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111820",
  },
  identityMeta: {
    fontSize: 14,
    color: "#344552",
  },
  tableCard: {
    backgroundColor: "#2B3239",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: "#46515C",
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f3ead7",
    letterSpacing: 1.1,
  },
  tableMeta: {
    fontSize: 12,
    color: "#C3CBD2",
    fontWeight: "600",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#46515C",
  },
  tableHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    color: "#C3CBD2",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 2.8,
    overflow: "visible",
    shadowOffset: { width: 0, height: appStyleIsDark ? 3 : 2 },
    shadowRadius: appStyleIsDark ? 6 : 4,
    shadowOpacity: appStyleIsDark ? 0.22 : 0.1,
    elevation: 5,
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
  instrumentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  instrumentCardTitleWrap: {
    flex: 1,
    gap: 4,
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
    backgroundColor: "rgba(0,155,194,0.10)",
  },
  mobileCategoryBadgeText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111820",
  },
  mobileMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  instrumentStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: appStylePalette.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: appStylePalette.surfaceRaised,
  },
  instrumentStatCell: {
    width: "50%",
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: appStylePalette.border,
  },
  instrumentStatCellLeft: {
    borderRightWidth: 1,
    borderRightColor: appStylePalette.border,
  },
  instrumentStatCellRight: {},
  mobileMetricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 120,
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: appStylePalette.borderStrong,
  },
  mobileMetricLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: appStylePalette.accent,
  },
  mobileMetricValue: {
    fontSize: 24,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  mobileMetricDetail: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.textMuted,
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
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 14,
    gap: 6,
  },
  mobileKeyMetricLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
    color: appStylePalette.accent,
  },
  mobileKeyMetricValue: {
    fontSize: 28,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  mobileKeyMetricDetail: {
    fontSize: 12,
    lineHeight: 18,
    color: appStylePalette.textMuted,
    fontWeight: "600",
  },
  mobileKeyMetricSubdetail: {
    fontSize: 12,
    lineHeight: 18,
    color: appStylePalette.textPrimary,
    fontWeight: "800",
  },
  mobileDashboardCard: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 16,
    gap: 10,
  },
  mobileDashboardEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
    color: appStylePalette.accent,
  },
  mobileDashboardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
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
    color: appStylePalette.textMuted,
  },
  mobileDashboardBodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
  },
  mobilePreferencesCard: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 16,
    gap: 12,
  },
  mobilePreferencesEditor: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.border,
  },
  mobileSectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  mobileSectionText: {
    fontSize: 14,
    lineHeight: 21,
    color: appStylePalette.textMuted,
  },
  mobilePrefsSummaryCard: {
    backgroundColor: appStylePalette.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    padding: 16,
    gap: 12,
  },
  mobilePrefsCollapsedWrap: {
    marginTop: -2,
  },
  mobilePrefsCollapsedButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    backgroundColor: appStylePalette.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  mobilePrefsCollapsedButtonText: {
    color: appStylePalette.textPrimary,
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
    backgroundColor: "rgba(102,217,242,0.12)",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#66D9F2",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mobileEditPrefsButtonText: {
    color: "#66D9F2",
    fontSize: 12,
    fontWeight: "800",
  },
  mobileFormGroup: {
    gap: 8,
  },
  mobileTrackedCategoryList: {
    gap: 10,
  },
  mobileTrackedCategoryRow: {
    gap: 8,
  },
  mobileTrackedCategoryMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 2.8,
    borderColor: appStylePalette.borderStrong,
    backgroundColor: appDecisionRowSurface,
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: "relative",
    overflow: "visible",
    shadowOffset: { width: 0, height: appStyleIsDark ? 3 : 2 },
    shadowRadius: appStyleIsDark ? 6 : 4,
    shadowOpacity: appStyleIsDark ? 0.22 : 0.1,
    elevation: 5,
  },
  mobileTrackedCategoryTopEdge: {
    position: "absolute",
    top: 1.5,
    left: 1.5,
    right: 1.5,
    height: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: appDecisionRowHighlight,
  },
  mobileTrackedCategoryBottomEdge: {
    position: "absolute",
    left: 1.5,
    right: 1.5,
    bottom: 1.5,
    height: 1,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: appDecisionRowShadowEdge,
  },
  mobileTrackedCategoryInnerEdge: {
    position: "absolute",
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.35)",
  },
  mobileTrackedCategoryCopy: {
    flex: 1,
    gap: 4,
  },
  mobileTrackedCategoryTitle: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  mobileTrackedCategorySubtitle: {
    fontSize: 14,
    lineHeight: 18,
    color: appStylePalette.textMuted,
  },
  mobileTrackedDeleteButton: {
    alignSelf: "flex-start",
    backgroundColor: "#201315",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#A92B2B",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mobileTrackedDeleteButtonText: {
    color: "#FF6C6C",
    fontSize: 12,
    fontWeight: "800",
  },
  textChipShell: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
    backgroundColor: appStylePalette.surfaceRecessed,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  textChipInput: {
    fontSize: 16,
    color: appStylePalette.textPrimary,
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
    backgroundColor: appStylePalette.surfaceRaised,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  mobileAddGoalButtonText: {
    color: appStylePalette.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  mobileSavePrefsButton: {
    alignSelf: "flex-start",
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
  },
  mobileSavePrefsButtonText: {
    color: appStylePalette.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  mobileChartStack: {
    gap: 14,
  },
  goalChip: {
    backgroundColor: "rgba(102,217,242,0.12)",
    borderWidth: 1.5,
    borderColor: "#66D9F2",
  },
  goalChipRemovable: {
    paddingRight: 14,
  },
  goalChipLabel: {
    color: "#66D9F2",
  },
  mobileCardStack: {
    gap: 12,
  },
  mobileDecisionCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 14,
    gap: 10,
  },
  mobileGreenCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#00FF66",
  },
  mobileAmberCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#5F6B76",
  },
  mobileRedCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#FF3030",
  },
  mobileNeutralCard: {
    backgroundColor: appStylePalette.surfaceRecessed,
    borderColor: "#5F6B76",
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
    color: appStylePalette.textPrimary,
    letterSpacing: 1.1,
  },
  mobileDecisionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textMuted,
  },
  mobileDecisionFooter: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.textMuted,
  },
  plannerModeHint: {
    fontSize: 12,
    lineHeight: 18,
    color: appStylePalette.textMuted,
  },
  plannerSectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: appStylePalette.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  mobileEvidenceList: {
    gap: 6,
  },
  mobileEvidenceText: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textPrimary,
  },
  mobileEvidenceTextMuted: {
    fontSize: 13,
    lineHeight: 19,
    color: appStylePalette.textMuted,
  },
  mobilePlannerCallout: {
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appStylePalette.accent,
    padding: 12,
    gap: 4,
  },
  mobilePlannerCalloutTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: appStylePalette.accent,
  },
  mobilePlannerCalloutText: {
    fontSize: 13,
    lineHeight: 19,
    color: appStylePalette.textMuted,
  },
  mobileStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
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
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  mobileInfoChipLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: fliegerTypography.letterSpacingLabel,
    color: appStylePalette.accent,
  },
  mobileInfoChipValue: {
    fontSize: 15,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
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
    color: "#111820",
  },
  mobileListText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#41505C",
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
    backgroundColor: appDecisionRowSurface,
    borderColor: "#00FF66",
  },
  tableRowNoHold: {
    backgroundColor: appDecisionRowSurface,
    borderColor: "#FF3030",
  },
  tableRowCurrent: {
    backgroundColor: appDecisionRowSurface,
    borderColor: "#00FF66",
  },
  tableRowNeutral: {
    backgroundColor: appDecisionRowSurface,
    borderColor: "#5F6B76",
  },
  seatSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: appStylePalette.textMuted,
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
    backgroundColor: appStylePalette.surface,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
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
    color: appStylePalette.textPrimary,
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: appStylePalette.textMuted,
  },
  modalFloatingCloseButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: appStylePalette.surfaceRecessed,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: appStylePalette.borderStrong,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  modalFloatingCloseText: {
    fontSize: 16,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
    lineHeight: 18,
  },
  modalTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: appStylePalette.borderStrong,
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
    borderBottomColor: appStylePalette.borderStrong,
  },
  modalNameCell: {
    flex: 1.6,
  },
  modalPilotName: {
    fontSize: 14,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
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
    backgroundColor: appStylePalette.surfaceRaised,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: appStylePalette.borderStrong,
  },
  listCompareCardCompact: {
    minWidth: 0,
    padding: 12,
    gap: 6,
  },
  listCompareTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  listCompareMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: appStylePalette.textMuted,
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
    borderBottomColor: appStylePalette.borderStrong,
  },
  listCompareRowCompact: {
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  listCompareRowSenior: {
    backgroundColor: "rgba(255,43,43,0.10)",
  },
  listCompareRowYou: {
    backgroundColor: "rgba(0,155,194,0.12)",
  },
  listCompareRowRetiring: {
    backgroundColor: "#F6D6D6",
  },
  listCompareRowJunior: {
    backgroundColor: "rgba(0,255,0,0.10)",
  },
  listCompareNameWrap: {
    flex: 1,
    gap: 2,
  },
  listCompareName: {
    fontSize: 13,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
  },
  listCompareStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: appStylePalette.textMuted,
  },
  listCompareContext: {
    fontSize: 11,
    fontWeight: "600",
    color: appStylePalette.textMuted,
  },
  listCompareNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: appStylePalette.textPrimary,
  },
  listCompareNumberCompact: {
    fontSize: 14,
    marginTop: 2,
  },
  baseNetBar: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.border,
  },
  baseNetText: {
    fontSize: 13,
    fontWeight: "800",
    color: appStylePalette.accent,
    textAlign: "center",
  },
  baseNetSubtext: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: appStylePalette.textMuted,
    textAlign: "center",
  },
  seatDivider: {
    marginVertical: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: appStylePalette.borderStrong,
  },
  seatDividerText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: appStylePalette.textMuted,
  },
  tableCategoryCell: {
    flex: 1.7,
  },
  tableValueCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    minHeight: 48,
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: appStylePalette.border,
  },
  tableCell: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "900",
    color: appStylePalette.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  tableDelta: {
    fontSize: 11,
    fontWeight: "700",
    color: appStylePalette.textMuted,
    fontVariant: ["tabular-nums"],
  },
  tableDeltaPositive: {
    color: "#8fa36a",
  },
  tableDeltaNegative: {
    color: "#d94a50",
  },
  tableCategoryText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "800",
    color: appStylePalette.textPrimary,
  },
  tableSubtext: {
    fontSize: 14,
    lineHeight: 16,
    color: appStylePalette.textMuted,
  },
  insightText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#41505C",
  },
  projectionCard: {
    backgroundColor: "#C6CDD4",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
  },
  projectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111820",
  },
  projectionMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: "#344552",
  },
  forecastControlRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  desktopForecastControlRow: {
    marginBottom: 8,
  },
  forecastGrowthWrap: {
    maxWidth: 220,
  },
  desktopPlannerPanel: {
    marginTop: 12,
    gap: 12,
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
    color: "#344552",
  },
  projectionValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111820",
  },
  projectionTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#AEB7C0",
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
    color: "#344552",
  },
  chartCard: {
    gap: 10,
  },
  chartCardCompact: {
    backgroundColor: "#C6CDD4",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
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
    backgroundColor: "#D8DDE2",
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111820",
  },
  dropdownMenu: {
    backgroundColor: "#D8DDE2",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
    overflow: "hidden",
  },
  dropdownMenuTall: {
    maxHeight: 240,
    backgroundColor: "#D8DDE2",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#5F6B76",
  },
  dropdownItemText: {
    fontSize: 15,
    color: "#111820",
    fontWeight: "600",
  },
  sliderCard: {
    backgroundColor: "#D8DDE2",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#5F6B76",
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
    color: "#111820",
  },
  sliderMeta: {
    fontSize: 13,
    color: "#41505C",
    fontWeight: "600",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111820",
  },
  chartSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#41505C",
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
    fontSize: 12,
    color: "#111820",
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
    backgroundColor: "#AEB7C0",
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
    backgroundColor: "#111820",
    borderRadius: 6,
  },
  chartBarCompact: {
    width: 18,
    borderRadius: 7,
  },
  chartBarFuture: {
    backgroundColor: "#FF2B2B",
  },
  chartReferenceMark: {
    position: "absolute",
    width: "100%",
    height: 2,
    left: 0,
    opacity: 0.95,
  },
  chartReferenceOne: {
    backgroundColor: "#007FA3",
  },
  chartReferenceTwo: {
    backgroundColor: "#68737D",
  },
  chartLabel: {
    fontSize: 12,
    color: "#41505C",
    textAlign: "center",
  },
  chartLabelCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  seniorityCard: {
    backgroundColor: "#C6CDD4",
    borderRadius: 20,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#5F6B76",
  },
  seniorityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  seniorityTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111820",
  },
  seniorityRole: {
    fontSize: 14,
    fontWeight: "700",
    color: "#344552",
  },
  seniorityMeta: {
    fontSize: 13,
    color: "#41505C",
  },
});
