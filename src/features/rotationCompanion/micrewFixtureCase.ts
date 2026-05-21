export type MicrewFixtureSourceType =
  | "screenshot_transcription"
  | "micrew_mobile_text"
  | "unknown";

export type MicrewFixtureBaselineType = "real" | "synthetic" | "none";

export type MicrewFixtureAfterType = "real_final" | "real_flown" | "unknown";

export type MicrewFixtureExpected = {
  creditMinutes: number;
  blockMinutes: number;
  deadheadBlockMinutes?: number;
  layovers: string[];
  finalArrival: string;
  legCount: number;
  deadheadLegCount: number;
  operatingLegCount: number;
  shouldParse: boolean;
  shouldCompare: boolean;
  expectedWatchItems?: string[];
};

export type MicrewFixtureCase = {
  caseId: string;
  rotationNumber: string;
  base: string;
  tripDates: string;
  sourceType: MicrewFixtureSourceType;
  baselineType: MicrewFixtureBaselineType;
  afterType: MicrewFixtureAfterType;
  expected: MicrewFixtureExpected;
};
