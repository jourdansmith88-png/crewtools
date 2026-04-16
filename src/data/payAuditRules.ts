export type PayAuditPriorityRule = {
  id: string;
  title: string;
  summary: string;
  contractAnchor: string;
  dataNeeded: string;
  firstMvpCheck: string;
};

export const payAuditPriorityRules: PayAuditPriorityRule[] = [
  {
    id: "reroute-pay",
    title: "Reroute Pay",
    summary:
      "Catch trips where the operation changed after award and the posted pay did not reflect the reroute, reassignment, or company-removal outcome.",
    contractAnchor: "Section 4 E / reroute and reassignment language in the PWA and scheduling references",
    dataNeeded:
      "Original rotation, modified rotation, reroute timing, actual flown duty, and the posted premium/credit lines tied to that trip.",
    firstMvpCheck:
      "Compare original awarded value vs. rerouted value and flag when posted pay misses the larger contract-protected outcome.",
  },
  {
    id: "payback-days",
    title: "Payback Days",
    summary:
      "Track when a pilot owes or recovers credit because of schedule changes, swaps, or contract cleanup after earlier removals or protections.",
    contractAnchor: "Section 4 guarantees plus scheduling-reference payback procedures",
    dataNeeded:
      "Bid-period line before and after changes, any removed or protected trips, and the final posted cleanup line items.",
    firstMvpCheck:
      "Show the expected payback balance for the month and explain why a day became payable, recoverable, or neutral.",
  },
  {
    id: "premium-pay",
    title: "Premium Pay",
    summary:
      "Audit green slip, silver slip, quick slip, and inverse assignment using the correct lineholder vs. reserve treatment.",
    contractAnchor: "Section 23 premium flying and MOU #25-05 quick-slip improvements",
    dataNeeded:
      "Premium event type, who initiated it, pilot status that day, coverage timing, awarded trip value, and posted premium line codes.",
    firstMvpCheck:
      "Map each premium event to its expected multiplier / protection rule and flag missing or misclassified premium pay.",
  },
  {
    id: "pickup-over-sick",
    title: "Pickup Over Sick Callout",
    summary:
      "Handle the lineholder case where a pilot sick-calls a trip, then picks up different flying and payroll handles the interaction incorrectly.",
    contractAnchor: "Section 14 sick leave plus line-guarantee interactions under Section 4",
    dataNeeded:
      "Sick-coded trip, replacement pickup, timing of the pickup, final flown credit, and all posted sick / trip / premium line items.",
    firstMvpCheck:
      "Explain whether the replacement flying should offset sick pay, sit beside it, or change the guarantee calculation for that month.",
  },
  {
    id: "leave-guarantee",
    title: "Leave and Guarantee",
    summary:
      "Reconcile how vacation, CQ, sick, training, and unpaid leave change line guarantee or reserve guarantee for that bid period.",
    contractAnchor: "Section 4 B / 4 C, Section 11 training, Section 13 leaves, and Section 14 sick leave",
    dataNeeded:
      "Monthly status, leave type and dates, schedule before/after leave impact, removed on-call days or rotations, and posted guarantee value.",
    firstMvpCheck:
      "Show the expected guarantee reduction or protection by leave type and flag under-credit or over-reduction.",
  },
];
