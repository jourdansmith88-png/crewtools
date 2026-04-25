import {
  createSchema,
  expectObject,
  expectString,
  optionalString,
  optionalStringArray,
} from "../../core/validation.ts";

export type TripScreenshotParserAIInput = {
  imageDataUrl: string;
  imageName: string;
  evidenceType: "trip_screenshot" | "schedule_screenshot" | "timecard_screenshot";
  questionHint?: string;
};

export type TripScreenshotParserAIOutputLeg = {
  id: string;
  legLabel?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  legType?: "operating" | "deadhead" | "unknown";
  originalDepartureTime?: string;
  changedDepartureTime?: string;
  originalArrivalTime?: string;
  changedArrivalTime?: string;
  changeTimestamp?: string;
  notes?: string;
};

export type TripScreenshotParserAIOutput = {
  summary: string;
  pairingNumber?: string;
  dutyDate?: string;
  dutyPeriodLabel?: string;
  reportTime?: string;
  releaseTime?: string;
  originalLegTiming?: string[];
  changedLegTiming?: string[];
  rerouteIndicators?: string[];
  reassignmentIndicators?: string[];
  visibleChangeTimestamps?: string[];
  legs: TripScreenshotParserAIOutputLeg[];
  missingOrUnclear?: string[];
  confidence: "high" | "medium" | "low";
};

const legJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "legLabel",
    "flightNumber",
    "origin",
    "destination",
    "legType",
    "originalDepartureTime",
    "changedDepartureTime",
    "originalArrivalTime",
    "changedArrivalTime",
    "changeTimestamp",
    "notes",
  ],
  properties: {
    id: { type: "string" },
    legLabel: { type: "string" },
    flightNumber: { type: "string" },
    origin: { type: "string" },
    destination: { type: "string" },
    legType: { type: "string", enum: ["operating", "deadhead", "unknown"] },
    originalDepartureTime: { type: "string" },
    changedDepartureTime: { type: "string" },
    originalArrivalTime: { type: "string" },
    changedArrivalTime: { type: "string" },
    changeTimestamp: { type: "string" },
    notes: { type: "string" },
  },
};

const tripScreenshotParserOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "pairingNumber",
    "dutyDate",
    "dutyPeriodLabel",
    "reportTime",
    "releaseTime",
    "originalLegTiming",
    "changedLegTiming",
    "rerouteIndicators",
    "reassignmentIndicators",
    "visibleChangeTimestamps",
    "legs",
    "missingOrUnclear",
    "confidence",
  ],
  properties: {
    summary: { type: "string", minLength: 1 },
    pairingNumber: { type: "string" },
    dutyDate: { type: "string" },
    dutyPeriodLabel: { type: "string" },
    reportTime: { type: "string" },
    releaseTime: { type: "string" },
    originalLegTiming: {
      type: "array",
      items: { type: "string" },
    },
    changedLegTiming: {
      type: "array",
      items: { type: "string" },
    },
    rerouteIndicators: {
      type: "array",
      items: { type: "string" },
    },
    reassignmentIndicators: {
      type: "array",
      items: { type: "string" },
    },
    visibleChangeTimestamps: {
      type: "array",
      items: { type: "string" },
    },
    legs: {
      type: "array",
      items: legJsonSchema,
    },
    missingOrUnclear: {
      type: "array",
      items: { type: "string" },
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
  },
};

export const tripScreenshotParserAIInputSchema = createSchema<TripScreenshotParserAIInput>(
  "tripScreenshotParserInput",
  (value) => {
    const object = expectObject(value, "Trip screenshot parser input");
    return {
      imageDataUrl: expectString(object.imageDataUrl, "imageDataUrl"),
      imageName: expectString(object.imageName, "imageName"),
      evidenceType:
        object.evidenceType === "trip_screenshot" ||
        object.evidenceType === "schedule_screenshot" ||
        object.evidenceType === "timecard_screenshot"
          ? object.evidenceType
          : "trip_screenshot",
      questionHint: optionalString(object.questionHint),
    };
  }
);

export const tripScreenshotParserAIOutputSchema = createSchema<TripScreenshotParserAIOutput>(
  "tripScreenshotParserOutput",
  (value) => {
    const object = expectObject(value, "Trip screenshot parser output");
    return {
      summary: expectString(object.summary, "summary"),
      pairingNumber: optionalString(object.pairingNumber),
      dutyDate: optionalString(object.dutyDate),
      dutyPeriodLabel: optionalString(object.dutyPeriodLabel),
      reportTime: optionalString(object.reportTime),
      releaseTime: optionalString(object.releaseTime),
      originalLegTiming: optionalStringArray(object.originalLegTiming),
      changedLegTiming: optionalStringArray(object.changedLegTiming),
      rerouteIndicators: optionalStringArray(object.rerouteIndicators),
      reassignmentIndicators: optionalStringArray(object.reassignmentIndicators),
      visibleChangeTimestamps: optionalStringArray(object.visibleChangeTimestamps),
      legs: Array.isArray(object.legs)
        ? object.legs.map((item, index) => {
            const leg = expectObject(item, `legs[${index}]`);
            return {
              id: expectString(leg.id, `legs[${index}].id`),
              legLabel: optionalString(leg.legLabel),
              flightNumber: optionalString(leg.flightNumber),
              origin: optionalString(leg.origin),
              destination: optionalString(leg.destination),
              legType:
                leg.legType === "operating" || leg.legType === "deadhead" || leg.legType === "unknown"
                  ? leg.legType
                  : undefined,
              originalDepartureTime: optionalString(leg.originalDepartureTime),
              changedDepartureTime: optionalString(leg.changedDepartureTime),
              originalArrivalTime: optionalString(leg.originalArrivalTime),
              changedArrivalTime: optionalString(leg.changedArrivalTime),
              changeTimestamp: optionalString(leg.changeTimestamp),
              notes: optionalString(leg.notes),
            };
          })
        : [],
      missingOrUnclear: optionalStringArray(object.missingOrUnclear),
      confidence:
        object.confidence === "high" || object.confidence === "medium" || object.confidence === "low"
          ? object.confidence
          : "low",
    };
  },
  tripScreenshotParserOutputJsonSchema
);
