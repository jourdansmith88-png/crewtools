import { createSchema, expectObject, expectString, optionalStringArray } from "../../core/validation";

export type TimecardParserAIInput = {
  rawTimecardText: string;
};

export type TimecardParserAIOutput = {
  summary: string;
  extractedSections?: string[];
  ambiguousLines?: string[];
};

export const timecardParserAIInputSchema = createSchema<TimecardParserAIInput>(
  "timecardParserInput",
  (value) => {
    const object = expectObject(value, "Timecard parser input");
    return {
      rawTimecardText: expectString(object.rawTimecardText, "rawTimecardText"),
    };
  }
);

export const timecardParserAIOutputSchema = createSchema<TimecardParserAIOutput>(
  "timecardParserOutput",
  (value) => {
    const object = expectObject(value, "Timecard parser output");
    return {
      summary: expectString(object.summary, "summary"),
      extractedSections: optionalStringArray(object.extractedSections),
      ambiguousLines: optionalStringArray(object.ambiguousLines),
    };
  }
);
