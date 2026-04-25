export type ContractCopilotRedFlagSeverity = "none" | "low" | "medium" | "high" | "critical";

export type ContractCopilotRedFlagDetectorInput = {
  question: string;
  shortAnswer?: string;
  plainEnglishExplanation?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  category?: string;
  selectedLane?: string;
  aiSynthesisUsed?: boolean;
  sourcesUsed?: string[];
  pwaSectionsUsed?: string[];
  compensationChunksUsed?: string[];
  schedulerChunksUsed?: string[];
  missingSourceWarnings?: string[];
  referencesCount?: number;
  retrievedSnippets?: string[];
  fallbackReason?: string;
  mustNotInclude?: string[];
};

export type ContractCopilotRedFlagDetectorResult = {
  redFlags: string[];
  severity: ContractCopilotRedFlagSeverity;
};

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function detectContractCopilotRedFlags(
  input: ContractCopilotRedFlagDetectorInput,
): ContractCopilotRedFlagDetectorResult {
  const redFlags: string[] = [];
  const combined = `${normalize(input.shortAnswer)} ${normalize(input.plainEnglishExplanation)}`.trim();
  const question = normalize(input.question);
  const sourcesUsed = input.sourcesUsed ?? [];
  const missingSourceWarnings = input.missingSourceWarnings ?? [];
  const referencesCount = input.referencesCount ?? 0;
  const retrievedSnippetContext = normalize((input.retrievedSnippets ?? []).join(" "));
  const contextualTerms = `${question} ${retrievedSnippetContext} ${normalize(input.category)}`.trim();

  const namedSourcesInFallback =
    /\bwhat controls:\b|\bavailable sources:\b|\bsources used:\b|\bi found related source support\b|\bsource support i found\b|\bwhat i can't confirm\b/.test(
      combined,
    );
  const weakGrounding =
    sourcesUsed.length === 0 ||
    missingSourceWarnings.length > 0 ||
    (referencesCount === 0 && !namedSourcesInFallback && input.selectedLane !== "document_section_explanation");
  if (weakGrounding && /\b(definitely|always|guaranteed|must)\b/.test(combined)) {
    redFlags.push("unsupported_certainty");
  }

  const unrelatedTopics = [
    { flag: "topic_drift", pattern: /\bapd\b/, allowed: /\bapd\b/.test(contextualTerms) },
    {
      flag: "topic_drift",
      pattern: /\balv\b/,
      allowed:
        /\balv\b/.test(contextualTerms) ||
        /\breserve guarantee\b|\bminimum guarantee\b|\bminimum daily guarantee\b|\bdaily guarantee\b|\badg\b|\bcredit guarantee\b/.test(contextualTerms),
    },
    { flag: "topic_drift", pattern: /\bgreenslip\b|\bgs\b|\bgswc\b/, allowed: /\bgreenslip\b|\bgs\b|\bgswc\b/.test(contextualTerms) },
    { flag: "topic_drift", pattern: /\bsick\b/, allowed: /\bsick\b/.test(contextualTerms) },
    { flag: "topic_drift", pattern: /\breserve\b/, allowed: /\breserve\b/.test(contextualTerms) },
  ];
  if (
    input.selectedLane !== "document_section_explanation" &&
    unrelatedTopics.some((entry) => entry.pattern.test(combined) && !entry.allowed) &&
    !redFlags.includes("topic_drift")
  ) {
    redFlags.push("topic_drift");
  }

  if (input.riskLevel === "high" || input.riskLevel === "critical") {
    if (
      (input.pwaSectionsUsed?.length ?? 0) === 0 &&
      (input.selectedLane === "contract_scenario_retrieval" || input.selectedLane === "document_section_explanation")
    ) {
      redFlags.push("missing_source_warning");
    }
    if (missingSourceWarnings.length > 0) {
      redFlags.push("missing_source_warning");
    }
  }

  if (/\bit depends\b/.test(combined) && !/\b(if|depends on|before|after|overlap|whether)\b/.test(combined)) {
    redFlags.push("vague_answer");
  }

  if (
    (input.selectedLane === "contract_scenario_retrieval" || input.selectedLane === "document_section_explanation") &&
    weakGrounding
  ) {
    redFlags.push("no_contract_reference");
  }

  if (
    input.category === "real_world_fb_scenarios" &&
    /\bit depends\b/.test(combined) &&
    !/\bwhat controls:|how it likely applies here:|what i can't confirm\b/.test(combined)
  ) {
    redFlags.push("oversimplified_complex_scenario");
  }

  if (
    input.category === "real_world_fb_scenarios" &&
    /\bclarifying question\b/.test(combined) &&
    !/\b(and|also|first|second|group|bucket|issue)\b/.test(combined)
  ) {
    redFlags.push("single_gating_question_only");
  }

  if (
    input.category === "real_world_fb_scenarios" &&
    /section 1 scope|scope:|definitions and glossary/.test(combined)
  ) {
    redFlags.push("irrelevant_support_primary");
  }

  if (
    input.category === "real_world_fb_scenarios" &&
    /\b(you should sue|legal right|the court will|guaranteed legal protection)\b/.test(combined)
  ) {
    redFlags.push("legal_advice_overreach");
  }

  if (
    input.category === "real_world_fb_scenarios" &&
    /\b(call in sick|fake sick|cough option|just use sick|abuse)\b/.test(combined)
  ) {
    redFlags.push("suggests_policy_abuse");
  }

  if (
    input.category === "real_world_fb_scenarios" &&
    weakGrounding &&
    /\bdefinitely|always|guaranteed|must\b/.test(combined)
  ) {
    redFlags.push("unsupported_policy_certainty");
  }

  const mustNotInclude = input.mustNotInclude ?? [];
  for (const phrase of mustNotInclude) {
    if (normalize(phrase).length > 0 && combined.includes(normalize(phrase))) {
      if (phrase.toLowerCase().includes("legal advice")) {
        redFlags.push("legal_advice_overreach");
      } else if (phrase.toLowerCase().includes("abuse")) {
        redFlags.push("suggests_policy_abuse");
      }
    }
  }

  if (
    (input.selectedLane === "direct_pay_rate_lookup" ||
      input.selectedLane === "apd_threshold_calculation" ||
      input.selectedLane === "direct_term_lookup") &&
    input.aiSynthesisUsed
  ) {
    redFlags.push("deterministic_mismatch");
  }

  const uniqueFlags = Array.from(new Set(redFlags));
  let severity: ContractCopilotRedFlagSeverity = "none";
  if (uniqueFlags.includes("unsupported_certainty") || uniqueFlags.includes("deterministic_mismatch")) {
    severity = input.riskLevel === "critical" ? "critical" : "high";
  } else if (
    uniqueFlags.includes("legal_advice_overreach") ||
    uniqueFlags.includes("suggests_policy_abuse") ||
    uniqueFlags.includes("unsupported_policy_certainty")
  ) {
    severity = input.riskLevel === "critical" ? "critical" : "high";
  } else if (uniqueFlags.includes("missing_source_warning")) {
    severity = input.riskLevel === "critical" ? "high" : "medium";
  } else if (uniqueFlags.includes("no_contract_reference")) {
    severity =
      namedSourcesInFallback && /\bwhat i can't confirm\b|\bstill unclear\b/.test(combined)
        ? "medium"
        : input.riskLevel === "critical"
          ? "high"
          : "medium";
  } else if (uniqueFlags.includes("topic_drift") || uniqueFlags.includes("vague_answer")) {
    severity = "medium";
  } else if (uniqueFlags.length > 0) {
    severity = "low";
  }

  return {
    redFlags: uniqueFlags,
    severity,
  };
}
