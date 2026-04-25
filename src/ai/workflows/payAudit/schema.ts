import { createSchema, expectObject, expectString, optionalStringArray } from "../../core/validation";

export type PayAuditAIInput = {
  auditFindingSummary: string;
};

export type PayAuditAIOutput = {
  explanation: string;
  userFacingBullets?: string[];
  caveats?: string[];
};

export const payAuditAIInputSchema = createSchema<PayAuditAIInput>("payAuditInput", (value) => {
  const object = expectObject(value, "Pay audit AI input");
  return {
    auditFindingSummary: expectString(object.auditFindingSummary, "auditFindingSummary"),
  };
});

export const payAuditAIOutputSchema = createSchema<PayAuditAIOutput>("payAuditOutput", (value) => {
  const object = expectObject(value, "Pay audit AI output");
  return {
    explanation: expectString(object.explanation, "explanation"),
    userFacingBullets: optionalStringArray(object.userFacingBullets),
    caveats: optionalStringArray(object.caveats),
  };
});
