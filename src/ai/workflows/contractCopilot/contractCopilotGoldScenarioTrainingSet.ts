import type {
  ContractCopilotFailurePattern,
  ContractCopilotScenarioFamily,
} from "./contractCopilotAITestBank.ts";

export type ContractCopilotGoldScenario = {
  id: string;
  title: string;
  scenarioFamily: ContractCopilotScenarioFamily;
  userQuestion: string;
  governingSections: string[];
  correctOutcome: string;
  failurePatterns: ContractCopilotFailurePattern[];
  whyTricky: string;
  commonConfusions: string[];
  correctReasoningRule: string;
  retrievalHints: string[];
  reasoningGuard: string;
  contrastPairId?: string;
  contrastSummary?: string;
};

export type ContractCopilotGoldScenarioFamilyGroup = {
  family: ContractCopilotScenarioFamily;
  label: string;
  scenarioIds: string[];
  hardeningFocus: ContractCopilotFailurePattern[];
};

export const contractCopilotGoldScenarioTrainingSet: ContractCopilotGoldScenario[] = [
  {
    id: "gold-cc-1",
    title: "Greenslip overlap on one reserve day",
    scenarioFamily: "greenslip_premium_pickup",
    userQuestion: "I got a three day green slip that overlaps one reserve day how will it pay",
    governingSections: ["Section 23 Q", "Section 4 F.7.d", "Section 4 H.4", "Section 2 Definitions"],
    correctOutcome:
      "Start on the Greenslip path. The non-overlap days should be treated as Greenslip days, and the overlap day is the portion that may need separate contract review rather than automatically converting the whole trip into another premium type.",
    failurePatterns: [
      "wrong_governing_section",
      "premium_type_drift",
      "overlap_logic_drift",
      "inference_overrode_contract",
    ],
    whyTricky:
      "The question mixes a premium pickup type with a reserve-day overlap, so the model can easily jump to the overlap and forget that the starting rule path is still Greenslip.",
    commonConfusions: [
      "Treating the whole trip like inverse assignment just because one day overlaps reserve time.",
      "Answering from generic reserve coverage concepts instead of the Greenslip/conflict language.",
    ],
    correctReasoningRule:
      "When the pilot explicitly says Greenslip, govern from Greenslip language first. Then separate non-overlap days from the overlap day instead of reclassifying the whole event.",
    retrievalHints: [
      "Search Greenslip definitions and Section 23 Q first.",
      "Pull conflict / X-day cross-references from Section 4 F.7.d and Section 4 H.4.",
      "Prefer snippets that mention GS, conflict, or X-day over generic reserve coverage text.",
    ],
    reasoningGuard:
      "If the question explicitly says Greenslip or GS, do not drift into inverse assignment unless the facts expressly say inverse assignment.",
    contrastPairId: "gold-cc-2",
    contrastSummary:
      "A Greenslip that overlaps a reserve day should stay on the Greenslip path first, while a true inverse-assignment scenario starts from a different governing section.",
  },
  {
    id: "gold-cc-2",
    title: "Reserve inverse assignment is not Greenslip",
    scenarioFamily: "reserve_assignment_long_call_short_call",
    userQuestion: "I'm reserve. If I get inverse assigned, what should happen?",
    governingSections: ["Section 23 N", "Section 23 O", "Reserve assignment provisions"],
    correctOutcome:
      "Analyze the event under reserve assignment rules first. Do not answer it like a lineholder premium pickup or Greenslip unless the facts actually show that premium type.",
    failurePatterns: [
      "wrong_governing_section",
      "reserve_vs_lineholder_drift",
      "premium_type_drift",
    ],
    whyTricky:
      "The words 'extra flying' or 'picked up' can make the model drift toward premium pickup concepts even though the actual trigger is reserve inverse assignment.",
    commonConfusions: [
      "Using lineholder pickup logic for a reserve assignment.",
      "Treating inverse assignment like Greenslip because both can involve premium-style pay questions.",
    ],
    correctReasoningRule:
      "When the pilot explicitly says inverse assignment on reserve, start with reserve assignment provisions and only layer on other pay concepts if the governing text calls for them.",
    retrievalHints: [
      "Boost reserve assignment and inverse assignment language.",
      "Penalize Greenslip-only snippets unless the same snippet also mentions inverse assignment.",
    ],
    reasoningGuard:
      "Reserve inverse assignment should not inherit Greenslip logic just because both scenarios involve open time or premium pay questions.",
    contrastPairId: "gold-cc-1",
    contrastSummary:
      "Inverse assignment and Greenslip may look operationally similar, but they start from different governing rules and should not be merged.",
  },
  {
    id: "gold-cc-3",
    title: "GS on an X-day does not automatically become IA",
    scenarioFamily: "greenslip_premium_pickup",
    userQuestion: "I picked up GS on an X-day. Does that automatically become IA?",
    governingSections: ["Section 23 Q", "Section 2 Definitions", "Section 4 H.4"],
    correctOutcome:
      "No. An explicit Greenslip should remain on the Greenslip path unless another fact shows it was actually processed as inverse assignment or another premium type.",
    failurePatterns: [
      "definition_drift",
      "premium_type_drift",
      "overlap_logic_drift",
    ],
    whyTricky:
      "The X-day fact invites the model to overreact to reserve concepts and forget that the contract still distinguishes pickup types by their actual processing path.",
    commonConfusions: [
      "Assuming any X-day event becomes inverse assignment.",
      "Using reserve-duty concepts to overwrite the defined premium type.",
    ],
    correctReasoningRule:
      "Definitions matter. If the event is described as GS, preserve that classification until the facts or governing section establish a different classification.",
    retrievalHints: [
      "Always search definitions when the question asks whether one premium type becomes another.",
      "Pull X-day language only as supporting context, not as the primary governing source.",
    ],
    reasoningGuard:
      "Do not convert one premium type into another unless the governing language or facts expressly say the processing path changed.",
    contrastPairId: "gold-cc-2",
    contrastSummary:
      "An X-day overlap on GS raises conflict questions, but it is still different from a true inverse-assignment event.",
  },
  {
    id: "gold-cc-4",
    title: "Reserve month changes the rule path",
    scenarioFamily: "reserve_assignment_long_call_short_call",
    userQuestion: "Does this answer change if I was reserve instead of lineholder?",
    governingSections: ["Reserve vs lineholder framework", "Section 23 scheduling status provisions"],
    correctOutcome:
      "Yes. Reserve status can materially change which scheduling and pay rules apply, so the answer should be re-evaluated under reserve rules rather than assuming the lineholder path still governs.",
    failurePatterns: ["reserve_vs_lineholder_drift", "status_scope_drift"],
    whyTricky:
      "This is a scope question, not a narrow pay calculation question. The model can miss that the user's real ask is whether the governing framework itself changes.",
    commonConfusions: [
      "Answering the original scenario without re-checking status.",
      "Treating reserve and lineholder differences as minor details instead of a rule-path split.",
    ],
    correctReasoningRule:
      "When the user asks whether reserve status changes the answer, answer the scope question directly: status may change the governing rule path before any detailed pay analysis happens.",
    retrievalHints: [
      "Boost framework and status-governing sections.",
      "Prefer reserve vs lineholder language over narrow premium references if the user is asking about status scope.",
    ],
    reasoningGuard:
      "If status is the question, answer the status-governing rule first before drilling into narrower scenario logic.",
    contrastPairId: "gold-cc-5",
    contrastSummary:
      "A reserve-vs-lineholder scope question asks which rulebook path controls, while long-call or short-call questions ask how a specific reserve regime operates inside that path.",
  },
  {
    id: "gold-cc-5",
    title: "Long call versus short call matters inside reserve logic",
    scenarioFamily: "reserve_assignment_long_call_short_call",
    userQuestion: "Does being long call instead of short call change how this reserve assignment works?",
    governingSections: ["Reserve assignment provisions", "Long call / short call rules"],
    correctOutcome:
      "Potentially yes. Once the pilot is known to be reserve, long-call versus short-call status can change how the assignment rule applies, so that distinction should be checked before giving a firm answer.",
    failurePatterns: ["status_scope_drift", "timing_drift", "wrong_governing_section"],
    whyTricky:
      "The model may stop too early after identifying 'reserve' and fail to ask whether a more specific reserve status changes the assignment rule.",
    commonConfusions: [
      "Treating all reserve categories as interchangeable.",
      "Skipping call-type distinctions because the question already sounds reserve-specific.",
    ],
    correctReasoningRule:
      "Reserve is not the final level of specificity. If long-call versus short-call can change assignment handling, the answer should preserve that distinction.",
    retrievalHints: [
      "When the question mentions long call or short call, search those terms explicitly after reserve assignment text is found.",
      "Expand nearby reserve sections rather than broadening into unrelated pickup text.",
    ],
    reasoningGuard:
      "After identifying a reserve question, still check whether a narrower reserve status controls the outcome.",
    contrastPairId: "gold-cc-4",
    contrastSummary:
      "Reserve-vs-lineholder decides the major rule path, while long-call versus short-call fine-tunes the answer within reserve rules.",
  },
  {
    id: "gold-cc-6",
    title: "APD threshold is not full reserve minimum",
    scenarioFamily: "apd_pd_reserve_day_rules",
    userQuestion: "Can I use APD on reserve if reserve coverage is below the required minimum?",
    governingSections: ["Section 23 I. 10. a.", "Section 23 V"],
    correctOutcome:
      "Yes, potentially. The governing APD question is whether available reserves are at least 25% of the number of reserves required at the time of processing, not whether coverage is at or above the full required minimum.",
    failurePatterns: [
      "wrong_governing_section",
      "coverage_threshold_drift",
      "inference_overrode_contract",
      "reserve_vs_lineholder_drift",
    ],
    whyTricky:
      "The phrase 'below required minimum' sounds decisive, but the APD language uses a narrower threshold that can still permit approval even when full minimum coverage is not met.",
    commonConfusions: [
      "Substituting generic reserve coverage logic for the specific APD threshold.",
      "Drifting into Greenslip, overlap, or other reserve-availability concepts because they share the word reserve.",
    ],
    correctReasoningRule:
      "For APD eligibility on reserve, lead with Section 23 I.10.a. If that governing text is present, do not let broader reserve coverage concepts override the specific 25% threshold test.",
    retrievalHints: [
      "Boost APD, authorized personal drop, Section 23 I, and 25% threshold language.",
      "Penalize Greenslip or overlap snippets that do not also contain APD language.",
    ],
    reasoningGuard:
      "When APD governing text is found, answer from that text first and reduce inference from nearby reserve-coverage concepts.",
    contrastPairId: "gold-cc-7",
    contrastSummary:
      "APD eligibility depends on a specific reserve-availability threshold, while APD holiday-period exceptions can allow denial regardless of reserve count.",
  },
  {
    id: "gold-cc-7",
    title: "APD holiday exception can override ordinary APD approval logic",
    scenarioFamily: "apd_pd_reserve_day_rules",
    userQuestion: "Can APD still be denied during a holiday period even if reserve availability looks sufficient?",
    governingSections: ["Section 23 I. 10. a. Exception", "Section 23 I"],
    correctOutcome:
      "Yes. The holiday-period exception may allow denial regardless of ordinary reserve-availability numbers, so the holiday carveout should be checked before assuming approval.",
    failurePatterns: ["exception_missed", "wrong_governing_section", "coverage_threshold_drift"],
    whyTricky:
      "The model can stop after finding the ordinary APD threshold and miss the exception that changes the result in a narrower time window.",
    commonConfusions: [
      "Applying the general APD threshold without checking the exception paragraph.",
      "Assuming a favorable reserve count always controls the answer.",
    ],
    correctReasoningRule:
      "Once the governing APD section is found, check whether the section contains an exception that narrows or overrides the general rule for this time period.",
    retrievalHints: [
      "When APD is found, expand to nearby paragraphs and exception text.",
      "Search holiday-period language before finalizing the answer.",
    ],
    reasoningGuard:
      "Do not stop at the main APD rule if the same section contains an exception that can flip the result.",
    contrastPairId: "gold-cc-6",
    contrastSummary:
      "The ordinary APD threshold may support approval, but a holiday exception can still change the outcome.",
  },
  {
    id: "gold-cc-8",
    title: "PD request can be blocked by published MSL spacing",
    scenarioFamily: "apd_pd_reserve_day_rules",
    userQuestion: "Can my PD request be denied if it breaks the published minimum separation in my reserve pattern?",
    governingSections: ["Section 23 I", "Published MSL exception language"],
    correctOutcome:
      "Yes. If granting the PD would violate the published minimum separation required by the bid package for that reserve pattern, the request can be denied under the stated exception language.",
    failurePatterns: ["exception_missed", "wrong_governing_section", "status_scope_drift"],
    whyTricky:
      "The request sounds like a simple PD eligibility question, but the controlling rule is the reserve-pattern spacing exception rather than the general desire to take a day off.",
    commonConfusions: [
      "Answering from general PD availability instead of the bid-package spacing rule.",
      "Missing that reserve-pattern design can itself control approval.",
    ],
    correctReasoningRule:
      "For PD/APD reserve-day requests, check not only general eligibility but also any reserve-pattern spacing exception in the same governing section.",
    retrievalHints: [
      "Search PD and published MSL together.",
      "Pull nearby exception paragraphs when reserve pattern or bid package is mentioned.",
    ],
    reasoningGuard:
      "A reserve-day request can fail for a structural exception even when the pilot otherwise sounds eligible.",
  },
  {
    id: "gold-cc-9",
    title: "Reroute after report needs original-versus-changed comparison",
    scenarioFamily: "reroute_reassignment",
    userQuestion: "If my trip reroutes after report, what should happen to pay or credit?",
    governingSections: ["Section 23 K", "Reroute / reassignment provisions"],
    correctOutcome:
      "Start by comparing the original trip and the changed trip under the reroute/reassignment rules. Timing after report matters, and the answer should explain that the pay or credit outcome depends on how the original sequence changed.",
    failurePatterns: ["wrong_governing_section", "timing_drift", "inference_overrode_contract"],
    whyTricky:
      "The user wants a pay answer, but the controlling question is first whether this was a reroute path and how the timing after report affects the comparison between the original and changed sequences.",
    commonConfusions: [
      "Giving a generic pay-protection answer without first classifying the event.",
      "Ignoring the 'after report' timing detail that can change the rule path.",
    ],
    correctReasoningRule:
      "For reroute questions, answer from reroute provisions and compare original versus changed duty. Timing is not side commentary; it is often part of the governing test.",
    retrievalHints: [
      "Search reroute and after report together.",
      "Expand to neighboring reroute/reassignment definition and pay-protection text.",
    ],
    reasoningGuard:
      "Do not answer reroute pay questions as generic pay protection before classifying the event and timing.",
    contrastPairId: "gold-cc-10",
    contrastSummary:
      "A reroute after report and a reassignment before report can look operationally similar, but timing can change which section governs.",
  },
  {
    id: "gold-cc-10",
    title: "Same-day scheduling change may be reassignment instead of reroute",
    scenarioFamily: "reroute_reassignment",
    userQuestion: "Crew Scheduling changed my trip the same day. Is that reroute or reassignment?",
    governingSections: ["Section 23 K", "Reroute vs reassignment definitions"],
    correctOutcome:
      "It depends on what changed and when, so the answer should identify the fact that separates reroute from reassignment instead of collapsing both into one bucket.",
    failurePatterns: ["definition_drift", "timing_drift", "question_scope_drift"],
    whyTricky:
      "This is a classification question disguised as a scheduling complaint. The model can answer too quickly without surfacing the exact fact that determines which definition applies.",
    commonConfusions: [
      "Treating any same-day change as reroute.",
      "Using outcome language before establishing the governing definition.",
    ],
    correctReasoningRule:
      "When the question asks 'was this reroute or reassignment,' identify the missing fact that controls the definition before moving to pay consequences.",
    retrievalHints: [
      "Search definition sections and same-day timing references first.",
      "Prefer classification language over downstream pay snippets for the first answer.",
    ],
    reasoningGuard:
      "If the user is asking a classification question, answer the classification logic first and only then explain likely downstream consequences.",
    contrastPairId: "gold-cc-9",
    contrastSummary:
      "Both scenarios involve schedule changes, but one asks about a post-report reroute pay path while the other asks which definition applies at all.",
  },
  {
    id: "gold-cc-11",
    title: "Sick then pickup depends on sequence",
    scenarioFamily: "sick_leave_pickup_interaction",
    userQuestion: "I called in sick and later picked up a trip. What matters?",
    governingSections: ["Section 14", "Section 23 I", "Pickup interaction language"],
    correctOutcome:
      "The sequence controls the answer. The analysis should separate a pickup that overlaps the sick period from one that happens after the sick period has ended, because those two paths can be treated differently.",
    failurePatterns: ["timing_drift", "question_scope_drift", "inference_overrode_contract"],
    whyTricky:
      "The pilot is asking broadly what matters, but the real contract pivot is timing and overlap, not a generic 'sick plus pickup' label.",
    commonConfusions: [
      "Giving a vague answer that never states sequence is the controlling fact.",
      "Treating any pickup after sick leave as identical regardless of overlap.",
    ],
    correctReasoningRule:
      "For sick/pickup interaction questions, answer the timing rule first: overlap and sequence can materially change the result.",
    retrievalHints: [
      "Search Section 14 plus pickup interaction sections together.",
      "Boost overlap, later, and same-day timing language.",
    ],
    reasoningGuard:
      "Do not answer sick-plus-pickup scenarios without saying whether overlap versus non-overlap changes the contract path.",
    contrastPairId: "gold-cc-12",
    contrastSummary:
      "A pickup after a sick period ends is a different question from picking up time that still overlaps the originally sick days.",
  },
  {
    id: "gold-cc-12",
    title: "Pickup overlapping sick days is not the same as pickup after recovery",
    scenarioFamily: "pay_protection_overlap_logic",
    userQuestion: "I picked up a trip that overlaps the days I originally called in sick for.",
    governingSections: ["Section 14", "Overlap / conflict treatment language"],
    correctOutcome:
      "The overlap is the key fact. The answer should explain that overlapping days may be treated differently from non-overlap days and should not be analyzed like a later, clean pickup after recovery.",
    failurePatterns: ["overlap_logic_drift", "timing_drift", "inference_overrode_contract"],
    whyTricky:
      "The words sound similar to an ordinary post-sick pickup, but overlap can create a different contract branch and should not be blurred together.",
    commonConfusions: [
      "Answering it the same way as a pickup after the sick period is over.",
      "Skipping the day-by-day overlap analysis and staying too abstract.",
    ],
    correctReasoningRule:
      "When pickup days overlap the originally sick days, analyze the overlapping portion separately instead of treating the entire event like a later pickup.",
    retrievalHints: [
      "Search overlap or conflict treatment language after finding the sick section.",
      "Look for day-by-day or overlap-specific wording instead of only general pickup text.",
    ],
    reasoningGuard:
      "An overlap scenario should produce a split answer, not a single all-or-nothing rule if the contract treats overlapping days differently.",
    contrastPairId: "gold-cc-11",
    contrastSummary:
      "Overlap with sick days usually requires a split analysis, while a later pickup after recovery may not.",
  },
  {
    id: "gold-cc-17",
    title: "GS overlaps first sick day then continues after sick ends",
    scenarioFamily: "sick_leave_pickup_interaction",
    userQuestion:
      "I called in sick, got awarded a Greenslip that overlapped the first sick day, and the GS kept going after sick leave ended. How should pay and credit work?",
    governingSections: ["Section 14 E", "Section 14 E and Example Three", "Section 23 Q Example one/two/three"],
    correctOutcome:
      "Split the answer. The overlap day can have different pay, credit, and sick-bank replenishment treatment from the later GS days. Any GS days that operate after the sick period ends should be analyzed separately rather than flattened into the overlap-day result.",
    failurePatterns: [
      "wrong_governing_section",
      "overlap_logic_drift",
      "timing_drift",
      "inference_overrode_contract",
    ],
    whyTricky:
      "This is not a one-label scenario. The contract example distinguishes single-pay/no-credit overlap treatment from replenishment language, and the later GS days may still stand on their own.",
    commonConfusions: [
      "Treating the entire GS like one sick-day interaction because the first day overlapped.",
      "Answering only in pay terms and ignoring separate credit or replenishment treatment.",
      "Skipping the later GS days after the pilot is well.",
    ],
    correctReasoningRule:
      "When GS overlaps the first sick day and continues after sick ends, preserve separate dimensions: overlap-day pay, overlap-day credit, sick-bank replenishment, and later GS days after the sick period.",
    retrievalHints: [
      "Pull Section 14 E main rule plus Example Three together.",
      "Boost language about replenish, single pay, no credit, lesser of ALV or 75 hours, and rotations scheduled after the pilot is well.",
      "Carry the Section 23 Q examples that describe GS/GSWC timing around sick leave.",
    ],
    reasoningGuard:
      "Do not flatten overlap-day treatment and later GS days into one answer. Preserve pay, credit, and replenishment as separate dimensions if the packet supports them.",
    contrastPairId: "gold-cc-19",
    contrastSummary:
      "An overlap-day GS needs split treatment, while a GS that starts after sick leave ends should not be answered like an overlap-day example.",
  },
  {
    id: "gold-cc-18",
    title: "GS fully inside sick leave period stays on the overlap example",
    scenarioFamily: "sick_leave_pickup_interaction",
    userQuestion:
      "My Greenslip sat entirely inside the days I was on sick leave. How should it pay and credit?",
    governingSections: ["Section 14 E", "Section 14 E and Example Three"],
    correctOutcome:
      "Do not answer this like clean later GS days. If the whole GS stays inside the sick period, the overlap example controls more heavily, including the separate single-pay/no-credit and replenishment treatment described in the worked example.",
    failurePatterns: [
      "wrong_governing_section",
      "overlap_logic_drift",
      "inference_overrode_contract",
    ],
    whyTricky:
      "The model can over-generalize from later GS day language and miss that a fully overlapping GS should stay anchored to the sick-leave example.",
    commonConfusions: [
      "Treating the whole GS like normal Greenslip because it was awarded as GS.",
      "Ignoring the no-credit and replenishment language in the example.",
    ],
    correctReasoningRule:
      "If the GS remains fully inside the sick period, stay anchored to the overlap example and preserve the distinct pay, credit, and replenishment treatment it describes.",
    retrievalHints: [
      "Prefer Section 14 E Example Three when the question says the GS was fully inside sick leave.",
      "Boost single pay, no credit, replenish, ALV, and 75-hour example language.",
    ],
    reasoningGuard:
      "Do not drift into clean later-GS reasoning when the facts say the whole GS stayed inside sick leave.",
    contrastPairId: "gold-cc-19",
    contrastSummary:
      "A GS fully inside sick leave should stay anchored to the overlap example, unlike a GS that begins after the pilot is well.",
  },
  {
    id: "gold-cc-19",
    title: "GS starts after sick leave ends",
    scenarioFamily: "sick_leave_pickup_interaction",
    userQuestion: "I was sick earlier, but the Greenslip started after sick leave ended. How should that be handled?",
    governingSections: ["Section 14 E", "Section 23 Q Example one/two/three"],
    correctOutcome:
      "A GS that starts after sick leave ends should not be answered like an overlap-day example. Later GS days are more likely to stand on their own Greenslip treatment, while any sick-bank replenishment piece should be handled separately if the governing language still points to it.",
    failurePatterns: [
      "timing_drift",
      "overlap_logic_drift",
      "wrong_governing_section",
    ],
    whyTricky:
      "The word sick can pull the model back into overlap examples even when the GS starts only after the pilot is well.",
    commonConfusions: [
      "Reusing overlap-day no-credit treatment for a later GS that begins after sick ends.",
      "Ignoring the main-rule language about rotations scheduled to operate after the pilot is well.",
    ],
    correctReasoningRule:
      "When the GS starts after sick leave ends, keep the later GS treatment separate from any overlap example. Use the 'after the pilot is well' language and only carry replenishment nuances if the governing text still supports them.",
    retrievalHints: [
      "Boost 'scheduled to operate after the pilot is well' and related Section 23 Q examples.",
      "Penalize Example Three drift if the facts clearly say the GS starts after sick leave ends.",
    ],
    reasoningGuard:
      "Do not answer a post-sick GS like an overlap-day example unless the facts still include an overlapping sick day.",
    contrastPairId: "gold-cc-17",
    contrastSummary:
      "A clean post-sick GS should be treated differently from a GS whose first day still overlaps sick leave.",
  },
  {
    id: "gold-cc-20",
    title: "Overlap day can pay differently from credit and sick-bank replenishment",
    scenarioFamily: "sick_leave_pickup_interaction",
    userQuestion:
      "If my GS overlapped a sick day, could that day still pay one way while credit and sick-bank replenishment are handled differently?",
    governingSections: ["Section 14 E", "Section 14 E and Example Three"],
    correctOutcome:
      "Yes, potentially. The worked example distinguishes single pay on the overlap piece from no-credit treatment and separate sick-bank replenishment language, so the answer should preserve those dimensions rather than collapsing them into one label.",
    failurePatterns: [
      "inference_overrode_contract",
      "overlap_logic_drift",
      "wrong_governing_section",
    ],
    whyTricky:
      "The scenario sounds like a binary pay question, but the example breaks the answer into separate dimensions. The model often loses that nuance and flattens everything into one outcome.",
    commonConfusions: [
      "Assuming pay and credit must match.",
      "Ignoring the replenishment language because the question was asked as a pay question.",
    ],
    correctReasoningRule:
      "If the worked example distinguishes pay, credit, and replenishment, the answer must preserve those distinctions instead of collapsing the overlap day into a single label.",
    retrievalHints: [
      "Carry both Example Three quotes together: replenish language and single pay/no credit language.",
      "Prefer the worked example over short isolated snippets when the user asks about pay versus credit nuance.",
    ],
    reasoningGuard:
      "Do not flatten overlap-day pay, credit, and replenishment into one label when the example shows separate treatment.",
    contrastPairId: "gold-cc-18",
    contrastSummary:
      "Both scenarios use the sick + GS example, but this one explicitly tests whether the answer preserves separate pay, credit, and replenishment dimensions.",
  },
  {
    id: "gold-cc-13",
    title: "Pay protection question should not ignore overlap logic",
    scenarioFamily: "pay_protection_overlap_logic",
    userQuestion: "If part of my original trip overlaps with the replacement flying, how should pay protection work?",
    governingSections: ["Pay protection provisions", "Overlap / conflict treatment sections"],
    correctOutcome:
      "The answer should split the protected and overlapping portions instead of assuming the same pay-protection treatment applies to the entire sequence. Overlap can change how one portion is evaluated.",
    failurePatterns: ["overlap_logic_drift", "wrong_governing_section", "timing_drift"],
    whyTricky:
      "The user asks about pay protection broadly, but the overlap detail means the answer cannot stay at a whole-trip level if the contract treats overlapping and non-overlapping portions differently.",
    commonConfusions: [
      "Applying one pay-protection rule to every day of the sequence.",
      "Ignoring the overlap detail because pay protection is usually discussed at a trip level.",
    ],
    correctReasoningRule:
      "When overlap appears inside a pay-protection question, preserve the split between overlapping and non-overlapping portions if the contract treats them differently.",
    retrievalHints: [
      "Search pay protection together with overlap or conflict terms.",
      "Expand to nearby exception text after finding the governing pay-protection section.",
    ],
    reasoningGuard:
      "Overlap language should trigger a split analysis even inside a question that sounds like a single pay-protection outcome.",
    contrastPairId: "gold-cc-14",
    contrastSummary:
      "Overlap changes the pay-protection analysis, while a clean non-overlap replacement sequence can often be explained more simply.",
  },
  {
    id: "gold-cc-14",
    title: "Clean replacement sequence is simpler than overlap protection",
    scenarioFamily: "pay_protection_overlap_logic",
    userQuestion: "If my original trip is replaced and nothing overlaps, how should I think about pay protection?",
    governingSections: ["Pay protection provisions"],
    correctOutcome:
      "Start from the governing pay-protection section and explain the replacement sequence without injecting overlap caveats that are not present in the facts.",
    failurePatterns: ["question_scope_drift", "overlap_logic_drift"],
    whyTricky:
      "The model can become overcautious after seeing many overlap cases and start adding overlap warnings even when the user explicitly says nothing overlaps.",
    commonConfusions: [
      "Dragging overlap logic into a clean replacement question.",
      "Treating every replacement flying case as if the overlap exception must be discussed.",
    ],
    correctReasoningRule:
      "Do not add overlap complexity when the facts rule it out. Answer the clean pay-protection path directly.",
    retrievalHints: [
      "Search pay-protection text first.",
      "Do not expand into overlap sections unless the question or retrieved text actually raises overlap.",
    ],
    reasoningGuard:
      "Avoid defensive overlap caveats when the user explicitly says there is no overlap.",
    contrastPairId: "gold-cc-13",
    contrastSummary:
      "A clean replacement sequence should stay simpler than a split overlap-protection scenario.",
  },
  {
    id: "gold-cc-15",
    title: "Reserve days off question needs reserve-specific governing text first",
    scenarioFamily: "apd_pd_reserve_day_rules",
    userQuestion: "How do I figure out how many days off I get as a reserve in May",
    governingSections: ["Reserve schedule framework", "Reserve day-off provisions"],
    correctOutcome:
      "Start with whether May is a reserve month and then apply the reserve-specific day-off provisions for that month. Do not answer from lineholder scheduling concepts or unrelated premium-flying sections.",
    failurePatterns: ["reserve_vs_lineholder_drift", "status_scope_drift", "wrong_governing_section"],
    whyTricky:
      "This sounds like a simple planning question, but it first requires the model to recognize it as a reserve-framework question rather than a lineholder or premium question.",
    commonConfusions: [
      "Answering with vague scheduling advice instead of reserve day-off rules.",
      "Letting unrelated reserve-availability or premium-flying language pollute the answer because the word reserve appears in many contexts.",
    ],
    correctReasoningRule:
      "For reserve day-off questions, answer from reserve day-off provisions first. Determine the correct reserve-month framework before discussing secondary details.",
    retrievalHints: [
      "Boost reserve day-off and reserve schedule framework language.",
      "Penalize premium or overlap snippets that are unrelated to days-off rules.",
    ],
    reasoningGuard:
      "The word reserve alone is not enough; the model should identify that the user is asking about reserve day-off entitlements, not reserve coverage or premium flying.",
  },
  {
    id: "gold-cc-16",
    title: "GS plus long call overlap is an explicit contract interaction rule",
    scenarioFamily: "greenslip_premium_pickup",
    userQuestion:
      "On reserve I picked up a 3-day Greenslip. Day 1 and 2 were off days. Day 3 overlaps with a long call. How will it pay?",
    governingSections: ["Section 23 - GS on reserve", "Section 23 Q", "Long call 18-hour rule"],
    correctOutcome:
      "Day 1 and 2 should stay on the normal Greenslip path because they are clean off-day Greenslip days. Day 3 is governed by the explicit GS-on-reserve long-call rule: if the report is within 18 hours of first attempted contact, the first duty period is single pay, no credit rather than ordinary GS premium treatment.",
    failurePatterns: [
      "wrong_governing_section",
      "greenslip_only_reasoning",
      "reserve_override_inference",
      "missed_18_hour_rule",
      "unnecessary_clarification",
    ],
    whyTricky:
      "It looks like a generic Greenslip overlap question, but the contract already resolves this interaction with a specific long-call rule. The model fails when it keeps reasoning abstractly instead of finding the explicit interaction text.",
    commonConfusions: [
      "Treating Day 3 like generic Greenslip overlap that merely 'needs review.'",
      "Letting generic reserve logic override Greenslip instead of recognizing this is a pre-resolved contract interaction.",
      "Missing the 18-hour first-attempted-contact trigger entirely.",
    ],
    correctReasoningRule:
      "When Greenslip on reserve overlaps long call, search for the specific GS-on-reserve long-call rule before inferring from generic Greenslip or reserve overlap concepts. If the 18-hour rule is present, apply it directly.",
    retrievalHints: [
      "Boost 'GS rotation on reserve', 'long call reserve pilot', 'within 18 hours of first attempted contact', and 'single pay, no credit for the first duty period'.",
      "Pull governing GS-on-reserve language before generic Greenslip definitions or generic reserve overlap snippets.",
      "Penalize overlap or reserve snippets that do not mention GS plus long call together.",
    ],
    reasoningGuard:
      "This is a known interaction rule, not a new inference problem. If the question contains Greenslip plus long call overlap, prioritize the explicit Section 23 GS-on-reserve 18-hour language and do not default to generic GS or generic reserve override logic.",
    contrastPairId: "gold-cc-1",
    contrastSummary:
      "A generic Greenslip overlap may require split reasoning, but GS plus long call overlap should lead with the explicit long-call carveout and should not degrade to 'separate review' when that carveout is present.",
  },
];

export const contractCopilotGoldScenarioFamilyGroups: ContractCopilotGoldScenarioFamilyGroup[] = [
  {
    family: "greenslip_premium_pickup",
    label: "Greenslip / premium pickup",
    scenarioIds: ["gold-cc-1", "gold-cc-3", "gold-cc-16"],
    hardeningFocus: [
      "wrong_governing_section",
      "premium_type_drift",
      "definition_drift",
      "overlap_logic_drift",
      "missed_18_hour_rule",
    ],
  },
  {
    family: "reserve_assignment_long_call_short_call",
    label: "Reserve assignment / long call / short call",
    scenarioIds: ["gold-cc-2", "gold-cc-4", "gold-cc-5"],
    hardeningFocus: [
      "reserve_vs_lineholder_drift",
      "status_scope_drift",
      "wrong_governing_section",
      "timing_drift",
    ],
  },
  {
    family: "apd_pd_reserve_day_rules",
    label: "APD / PD / reserve-day rules",
    scenarioIds: ["gold-cc-6", "gold-cc-7", "gold-cc-8", "gold-cc-15"],
    hardeningFocus: [
      "wrong_governing_section",
      "coverage_threshold_drift",
      "exception_missed",
      "status_scope_drift",
    ],
  },
  {
    family: "reroute_reassignment",
    label: "Reroute timing / reassignment",
    scenarioIds: ["gold-cc-9", "gold-cc-10"],
    hardeningFocus: ["timing_drift", "definition_drift", "question_scope_drift"],
  },
  {
    family: "sick_leave_pickup_interaction",
    label: "Sick / leave / pickup interaction",
    scenarioIds: ["gold-cc-11", "gold-cc-17", "gold-cc-18", "gold-cc-19", "gold-cc-20"],
    hardeningFocus: [
      "timing_drift",
      "question_scope_drift",
      "inference_overrode_contract",
      "overlap_logic_drift",
      "wrong_governing_section",
    ],
  },
  {
    family: "pay_protection_overlap_logic",
    label: "Overlap / pay conflicts",
    scenarioIds: ["gold-cc-12", "gold-cc-13", "gold-cc-14"],
    hardeningFocus: ["overlap_logic_drift", "timing_drift", "wrong_governing_section"],
  },
];

export const contractCopilotGoldScenarioHardeningPriorities = [
  {
    family: "apd_pd_reserve_day_rules",
    rationale:
      "High trust risk because a wrong governing section can flip a real reserve-day approval answer even when the contract text is explicit.",
  },
  {
    family: "greenslip_premium_pickup",
    rationale:
      "High pilot usage and frequent drift between Greenslip, inverse assignment, and overlap logic.",
  },
  {
    family: "reserve_assignment_long_call_short_call",
    rationale:
      "Status and reserve subtype often change the rule path, so scope errors are common and costly.",
  },
  {
    family: "reroute_reassignment",
    rationale:
      "Timing and classification questions are common and easily answered from the wrong section if definitions are not surfaced.",
  },
  {
    family: "pay_protection_overlap_logic",
    rationale:
      "Overlap scenarios reward split reasoning and expose whether the copilot can separate governed portions cleanly.",
  },
  {
    family: "sick_leave_pickup_interaction",
    rationale:
      "Sequence-sensitive scenarios are common and reveal whether the copilot can explain timing without collapsing into generic caution.",
  },
] as const;
