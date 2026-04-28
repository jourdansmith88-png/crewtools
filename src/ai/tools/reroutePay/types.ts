export type RerouteAnalyzerChoice = "unknown" | "yes" | "no";
export type ReroutePilotStatus = "unknown" | "lineholder" | "reserve";
export type RerouteTiming = "unknown" | "before_report" | "after_report" | "after_first_airborne";
export type RelativeToFirstBreak = "before" | "after" | "unknown";
export type TimingBasis = "actual" | "known_delay" | "published" | "unknown";
export type LateReleaseReason = "weather_or_airport_closure" | "company_controlled" | "unknown";

export type UploadedEvidenceSummary = {
  originalScreenshotName?: string;
  changedScreenshotName?: string;
  screenshotNames?: string[];
  screenshotParsingActive: boolean;
  notes: string[];
};

export type RerouteAnalysisInput = {
  originalRotationText?: string;
  changedRotationText?: string;
  description: string;
  pilotStatus: ReroutePilotStatus;
  rerouteTiming: RerouteTiming;
  finalCreditDecreased: RerouteAnalyzerChoice;
  touchedXDay: RerouteAnalyzerChoice;
  deadheadInvolved: RerouteAnalyzerChoice;
  bidPeriodCrossover: RerouteAnalyzerChoice;
  uploadedEvidenceSummary: UploadedEvidenceSummary;
  parsedFactOverrides?: Partial<ParsedRerouteFacts>;
};

export type ParsedRerouteFacts = {
  pilotStatus?: ReroutePilotStatus;
  originalAffectedFlying?: string;
  reroutedFlying?: string;
  rejoinPoint?: string;
  originalAffectedMinutes?: number;
  reroutedMinutes?: number;
  timing?: RerouteTiming;
  touchedXDay?: boolean;
  breakInDuty?: boolean;
  releaseMoreThanFourHoursLate?: boolean;
  oceanCrossing?: boolean;
  confidence: "high" | "medium" | "low";
  missingFacts: string[];
};

export type ParsedMiCrewLeg = {
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureTime?: string;
  arrivalTime?: string;
  blockMinutes?: number;
  turnMinutes?: number;
  isDeadhead?: boolean;
};

export type RerouteSegment = {
  date?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  blockMinutes?: number;
  isDeadhead?: boolean;
  isRerouted?: boolean;
  relativeToFirstBreak: RelativeToFirstBreak;
  timingBasis: TimingBasis;
};

export type ParsedMiCrewRotation = {
  rotationNumber?: string;
  date?: string;
  base?: string;
  creditMinutes?: number;
  tafbMinutes?: number;
  reportTime?: string;
  releaseTime?: string;
  layovers: string[];
  legs: ParsedMiCrewLeg[];
  parseConfidence: "high" | "medium" | "low";
  missingParseItems: string[];
};

export type BuiltRerouteEvent = ParsedRerouteFacts & {
  affectedOriginalPortion?: string;
  reroutedPortion?: string;
};

export type RerouteEvent = {
  pilotStatus: "lineholder" | "reserve";
  rerouteTiming: "before_first_airborne" | "after_first_airborne" | "after_report" | "unknown";
  originalScheduledRelease?: string;
  reroutedScheduledRelease?: string;
  firstBreakInDutyAfterReroute?: boolean;
  reachedBase?: boolean;
  releasedAtBase?: boolean;
  rejoinedOriginalRotation?: boolean;
  transOceanic?: boolean;
  lateReleaseReason: LateReleaseReason;
  touchedXDayOrLineDayOff?: boolean;
  originalRotationValueMinutes?: number;
  reroutedRotationValueMinutes?: number;
  reroutedSegments: RerouteSegment[];
};

export type ReroutePayItem = {
  label: string;
  rule: string;
  minutes?: number;
  math: string;
  sourceAnchor: string;
  confidence: "high" | "medium" | "low";
};

export type RerouteCalculationResult = {
  calculationType:
    | "original_value_preserved"
    | "rerouted_value_controls"
    | "difference_only"
    | "insufficient_inputs"
    | "reroute_rule_items";
  estimatedPayMinutes?: number;
  calculationSteps: string[];
  labels: string[];
  missingFacts: string[];
  confidence: "high" | "medium" | "low";
};

export type RerouteSupportCard = {
  sourceName: string;
  section: string;
  title?: string;
  quoteSnippet?: string;
  note?: string;
};

export type RerouteAnalysisOutput = {
  status: "resolved" | "caution" | "warning";
  estimatedAdditionalPayMinutes?: number;
  payItems: ReroutePayItem[];
  calculationSteps: string[];
  plainEnglishExplanation: string;
  missingFacts: string[];
  warnings: string[];
  whatControls?: string | string[];
  supportCards: RerouteSupportCard[];
  likelyIssue: string;
  shortAnswer: string;
  originalRotation?: ParsedMiCrewRotation;
  changedRotation?: ParsedMiCrewRotation;
  rerouteEvent: BuiltRerouteEvent;
  ruleEvent: RerouteEvent;
  calculation: RerouteCalculationResult;
  estimatedPayLabel: string;
  classification: {
    likelyReroute: boolean | "unknown";
    likelyContinuation: boolean | "unknown";
    possiblePayProtection: boolean | "unknown";
    missingFacts: string[];
  };
  factsUsed: string[];
  whatThisDependsOn: string[];
  likelyPaths: string[];
  whatToCheck: string[];
  sourceLimitations: string[];
  focusedQuestions: string[];
  debug?: Record<string, unknown>;
};

export type ReroutePayAnalyzeApiRequest = {
  input: RerouteAnalysisInput;
};

export type ReroutePayAnalyzeApiResponse =
  | {
      ok: true;
      result: RerouteAnalysisOutput;
    }
  | {
      ok: false;
      status?: "warning";
      error: string;
      result?: RerouteAnalysisOutput;
    };
