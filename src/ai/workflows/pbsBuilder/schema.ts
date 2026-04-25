import { createSchema, expectObject, expectString, optionalStringArray } from "../../core/validation";

export type PBSBuilderAIInput = {
  pilotGoalSummary: string;
};

export type PBSBuilderAIOutput = {
  strategySummary: string;
  bidLineNotes?: string[];
  cautionFlags?: string[];
};

export const pbsBuilderAIInputSchema = createSchema<PBSBuilderAIInput>("pbsBuilderInput", (value) => {
  const object = expectObject(value, "PBS builder input");
  return {
    pilotGoalSummary: expectString(object.pilotGoalSummary, "pilotGoalSummary"),
  };
});

export const pbsBuilderAIOutputSchema = createSchema<PBSBuilderAIOutput>("pbsBuilderOutput", (value) => {
  const object = expectObject(value, "PBS builder output");
  return {
    strategySummary: expectString(object.strategySummary, "strategySummary"),
    bidLineNotes: optionalStringArray(object.bidLineNotes),
    cautionFlags: optionalStringArray(object.cautionFlags),
  };
});
