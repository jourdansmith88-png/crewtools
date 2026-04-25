import { createSchema, expectObject, expectString, optionalStringArray } from "../../core/validation";

export type TripParserAIInput = {
  rawTripText: string;
};

export type TripParserAIOutput = {
  summary: string;
  extractedSegments?: string[];
  warnings?: string[];
};

export const tripParserAIInputSchema = createSchema<TripParserAIInput>("tripParserInput", (value) => {
  const object = expectObject(value, "Trip parser input");
  return {
    rawTripText: expectString(object.rawTripText, "rawTripText"),
  };
});

export const tripParserAIOutputSchema = createSchema<TripParserAIOutput>("tripParserOutput", (value) => {
  const object = expectObject(value, "Trip parser output");
  return {
    summary: expectString(object.summary, "summary"),
    extractedSegments: optionalStringArray(object.extractedSegments),
    warnings: optionalStringArray(object.warnings),
  };
});
