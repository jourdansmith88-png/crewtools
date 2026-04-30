export type RerouteAnalyzerChoice = "unknown" | "yes" | "no";
export type ReroutePilotStatus = "unknown" | "lineholder" | "reserve";
export type RerouteTiming = "unknown" | "before_report" | "after_report" | "after_first_airborne";
export type RelativeToFirstBreak = "before" | "after" | "unknown";
export type TimingBasis = "actual" | "known_delay" | "published" | "unknown";
export type LateReleaseReason = "weather_or_airport_closure" | "company_controlled" | "unknown";

export type UploadedEvidenceSummary = {
  originalScreenshotName?: string;
  changedScreenshotName?: string;
  originalScreenshotNames?: string[];
  changedScreenshotNames?: string[];
  originalScreenshotCount?: number;
  changedScreenshotCount?: number;
  originalFilenames?: string[];
  changedFilenames?: string[];
  screenshotNames?: string[];
  screenshotParsingActive: boolean;
  notes: string[];
};

export type UploadedImage = {
  name: string;
  dataUrl: string;
};

export type ParsedScreenshotRotation = {
  sourceType: "original" | "rerouted";
  rotationNumber?: string | null;
  dateRange?: string | null;
  base?: string | null;
  creditMinutes?: number | null;
  blockMinutes?: number | null;
  tafbMinutes?: number | null;
  reportTime?: string | null;
  releaseTime?: string | null;
  layovers: string[];
  parseConfidence?: "high" | "medium" | "low";
  missingParseItems?: string[];
  legs: Array<{
    day?: string | null;
    type?: "flight" | "deadhead" | "unknown";
    flightNumber?: string | null;
    carrier?: string | null;
    origin?: string | null;
    destination?: string | null;
    depTime?: string | null;
    arrTime?: string | null;
    blockMinutes?: number | null;
    turnMinutes?: number | null;
    isDeadhead?: boolean;
    legKind?: "operating" | "deadhead";
    confirmationCode?: string | null;
    sourceText?: string | null;
    sourceImageIndex?: number;
  }>;
};

export type ParseMiCrewScreenshotsOutput = {
  screenshotParsingActive: boolean;
  uploadedEvidenceSummary: UploadedEvidenceSummary;
  missingFacts: string[];
  rotations?: ParsedScreenshotRotation[];
  parseConfidence?: "high" | "medium" | "low";
  missingParseItems?: string[];
  extractionNotes?: string[];
  rawExtractedText?: string[];
  rawVisionResponsePreview?: string[];
  rawTextPreview?: string[];
  structuredJsonParseError?: string;
  visionModelCalled?: boolean;
  modelSelected?: string;
  fallbackRegexLegsParsed?: number;
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
  originalImages?: UploadedImage[];
  changedImages?: UploadedImage[];
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

export type RerouteDutyPeriodEvent = {
  label: string;
  rerouteTiming?: "before_first_airborne" | "after_first_airborne" | "after_report" | "unknown";
  firstBreakInDutyAfterReroute?: boolean;
  originalScheduledRelease?: string;
  reroutedScheduledRelease?: string;
  reachedBase?: boolean;
  releasedAtBase?: boolean;
  rejoinedOriginalRotation?: boolean;
  transOceanic?: boolean;
  lateReleaseReason?: LateReleaseReason;
  touchedXDayOrLineDayOff?: boolean;
  originalRotationValueMinutes?: number;
  reroutedRotationValueMinutes?: number;
  reroutedSegments: RerouteSegment[];
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
  dutyPeriods?: RerouteDutyPeriodEvent[];
  legSelectionDiagnostics?: Array<{
    sourceType: "original" | "rerouted";
    route?: string;
    flightNumber?: string;
    blockMinutes?: number;
    classification: "unchanged/original" | "changed/rerouted" | "likely rejoin" | "ignored";
    reason: string;
    sourceImageIndex?: number;
  }>;
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
  dutyPeriods?: RerouteDutyPeriodEvent[];
};

export type ReroutePayItem = {
  eventLabel?: string;
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
  screenshotParserSummary?: {
    screenshotParsingActive: boolean;
    originalScreenshotsRead: number;
    changedScreenshotsRead: number;
    originalImagesReceived: number;
    changedImagesReceived: number;
    firstOriginalImageName?: string;
    firstChangedImageName?: string;
    firstOriginalStartsWithDataImage: boolean;
    firstChangedStartsWithDataImage: boolean;
    visionModelCalled: boolean;
    modelSelected?: string;
    parseConfidence: "high" | "medium" | "low";
    rotationCount: number;
    legsDetected: number;
    missingParseItems: string[];
    extractionNotes: string[];
    rawVisionResponsePreview: string[];
    rawTextPreview: string[];
    structuredJsonParseError?: string;
    fallbackRegexLegsParsed?: number;
    parsedLegs: Array<{
      sourceType: "original" | "rerouted";
      type: "flight" | "deadhead" | "unknown";
      flightNumber?: string;
      origin?: string;
      destination?: string;
      depTime?: string;
      arrTime?: string;
      blockMinutes?: number;
      turnMinutes?: number;
      sourceImageIndex?: number;
      classification?: "unchanged/original" | "changed/rerouted" | "likely rejoin" | "ignored";
      classificationReason?: string;
    }>;
  };
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
