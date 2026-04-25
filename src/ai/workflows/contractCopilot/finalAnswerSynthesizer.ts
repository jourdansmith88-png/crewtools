type FinalAnswerSynthesisArgs = {
  groundedShortAnswer?: string;
  deterministicShortAnswer?: string;
  scenarioBreakdown?: string[];
  payBreakdown?: string[];
  whatCouldChange?: string[];
  whyItApplies?: string;
  needsClarification?: boolean;
};

function cleanSentence(value: string | undefined) {
  const trimmed = (value ?? "").replace(/^[-•]\s*/, "").trim();
  if (!trimmed) {
    return "";
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function looksRedundant(candidate: string, existing: string) {
  const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedExisting = existing.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalizedCandidate || !normalizedExisting) {
    return false;
  }
  return normalizedExisting.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedExisting);
}

function firstUseful(items: string[] | undefined, current: string) {
  for (const item of items ?? []) {
    const sentence = cleanSentence(item);
    if (!sentence) {
      continue;
    }
    if (looksRedundant(sentence, current)) {
      continue;
    }
    return sentence;
  }
  return "";
}

export function synthesizeContractCopilotTopAnswer(args: FinalAnswerSynthesisArgs) {
  const base =
    cleanSentence(args.groundedShortAnswer) ||
    cleanSentence(args.deterministicShortAnswer) ||
    "This is the most likely contract path from the facts available.";

  const followup =
    firstUseful(args.payBreakdown, base) ||
    firstUseful(args.scenarioBreakdown, base) ||
    firstUseful(args.whyItApplies ? [args.whyItApplies] : [], base);

  const changeSentence = (() => {
    const firstChange = args.whatCouldChange?.find((item) => item.trim().length > 0);
    if (!firstChange) {
      return "";
    }
    const prefix = args.needsClarification ? "This could change if" : "That could change if";
    const cleaned = firstChange.replace(/^[-•]\s*/, "").trim().replace(/[.!?]$/, "");
    return cleaned ? `${prefix} ${cleaned}.` : "";
  })();

  const sentences = [base];
  if (followup) {
    sentences.push(followup);
  }
  if (args.needsClarification && changeSentence) {
    sentences.push(changeSentence);
  }

  return sentences.join(" ").replace(/\s+/g, " ").trim();
}
