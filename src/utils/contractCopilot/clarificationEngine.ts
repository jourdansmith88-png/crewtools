import type {
  ClarifyingQuestion,
  ContractQuickReply,
  CopilotScenarioFamily,
  ParsedScenarioFacts,
} from "../../types/contractCopilot.ts";

function quickReplies(
  values: Array<{ id: string; label: string; factPatch?: Partial<ParsedScenarioFacts>; replyMessage?: string }>
): ContractQuickReply[] {
  return values.map((value) => ({ ...value }));
}

const clarificationQuestionMap: Record<
  CopilotScenarioFamily,
  Partial<Record<keyof ParsedScenarioFacts, ClarifyingQuestion>>
> = {
  status_basics: {
    status: {
      id: "status-month",
      prompt: "Were you reserve or lineholder that month?",
      factField: "status",
      required: true,
      quickReplies: quickReplies([
        { id: "reserve", label: "I'm reserve", factPatch: { status: "reserve" } },
        { id: "lineholder", label: "I'm lineholder", factPatch: { status: "lineholder" } },
      ]),
    },
  },
  reroute_reassignment: {
    status: {
      id: "reroute-status",
      prompt: "Were you reserve or lineholder that month?",
      factField: "status",
      required: true,
      quickReplies: quickReplies([
        { id: "reserve", label: "I'm reserve", factPatch: { status: "reserve" } },
        { id: "lineholder", label: "I'm lineholder", factPatch: { status: "lineholder" } },
      ]),
    },
    rerouteOccurred: {
      id: "reroute-happened",
      prompt: "Was the trip actually rerouted?",
      factField: "rerouteOccurred",
      required: true,
      quickReplies: quickReplies([
        { id: "yes", label: "Yes, rerouted", factPatch: { rerouteOccurred: true, tripTouched: true } },
        { id: "no", label: "No reroute", factPatch: { rerouteOccurred: false } },
      ]),
    },
    eventTiming: {
      id: "reroute-timing",
      prompt: "Did the change happen the same day or later?",
      factField: "eventTiming",
      required: false,
      quickReplies: quickReplies([
        { id: "same-day", label: "Same day", factPatch: { eventTiming: "same_day" } },
        { id: "later", label: "Later", factPatch: { eventTiming: "later" } },
        { id: "not-sure", label: "Not sure", factPatch: { eventTiming: "not_sure" } },
      ]),
    },
  },
  sick_leave_interaction: {
    status: {
      id: "leave-status",
      prompt: "Were you reserve or lineholder that month?",
      factField: "status",
      required: true,
      quickReplies: quickReplies([
        { id: "reserve", label: "I'm reserve", factPatch: { status: "reserve" } },
        { id: "lineholder", label: "I'm lineholder", factPatch: { status: "lineholder" } },
      ]),
    },
    leaveType: {
      id: "leave-type",
      prompt: "Was this sick, vacation, or another leave type?",
      factField: "leaveType",
      required: true,
      quickReplies: quickReplies([
        { id: "sick", label: "Sick", factPatch: { leaveType: "sick", sickUsed: true } },
        { id: "vacation", label: "Vacation", factPatch: { leaveType: "vacation" } },
        { id: "other", label: "Other leave", factPatch: { leaveType: "other_leave" } },
      ]),
    },
  },
  premium_pickup: {
    status: {
      id: "pickup-status",
      prompt: "Were you reserve or lineholder that month?",
      factField: "status",
      required: true,
      quickReplies: quickReplies([
        { id: "reserve", label: "I'm reserve", factPatch: { status: "reserve" } },
        { id: "lineholder", label: "I'm lineholder", factPatch: { status: "lineholder" } },
      ]),
    },
    pickupType: {
      id: "pickup-type",
      prompt: "Which premium type are you asking about?",
      factField: "pickupType",
      required: true,
      quickReplies: quickReplies([
        {
          id: "greenslip",
          label: "Greenslip",
          factPatch: { pickupType: "greenslip", premiumType: "greenslip" },
        },
        {
          id: "inverse",
          label: "Inverse assignment",
          factPatch: {
            pickupType: "inverse_assignment",
            premiumType: "inverse_assignment",
            assignmentType: "inverse_assignment",
          },
        },
        {
          id: "other",
          label: "Other premium / pickup",
          factPatch: { pickupType: "other_premium_pickup", premiumType: "other_premium_pickup" },
        },
      ]),
    },
  },
  dispute_citation_helper: {
    questionIntent: {
      id: "citation-or-dispute",
      prompt: "Are you looking for citation help or a dispute summary?",
      factField: "questionIntent",
      required: true,
      quickReplies: quickReplies([
        { id: "citation", label: "Citation help", factPatch: { questionIntent: "citation_help" } },
        { id: "dispute", label: "Dispute summary", factPatch: { questionIntent: "dispute_help" } },
      ]),
    },
  },
};

export function buildClarifyingQuestions(
  scenario: CopilotScenarioFamily | null,
  missingFacts: Array<keyof ParsedScenarioFacts>
): ClarifyingQuestion[] {
  if (!scenario) {
    return [];
  }

  const mapping = clarificationQuestionMap[scenario];
  return missingFacts
    .map((fact) => mapping[fact])
    .filter((question): question is ClarifyingQuestion => Boolean(question))
    .slice(0, 1);
}
