import { formatMinutes, diffClockMinutes } from "./parseTime.ts";
import { reroutePayRules } from "./reroutePayRules.ts";
import type { RerouteCalculationResult, RerouteDutyPeriodEvent, RerouteEvent, ReroutePayItem } from "./types.ts";

export type DeterministicRerouteCalculation = {
  estimatedAdditionalPayMinutes?: number;
  payItems: ReroutePayItem[];
  missingFacts: string[];
  warnings: string[];
  calculationSteps: string[];
  calculation: RerouteCalculationResult;
};

function sumKnownMinutes(items: ReroutePayItem[]) {
  const known = items.map((item) => item.minutes).filter((value): value is number => value != null);
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : undefined;
}

function lateReleaseThresholdMinutes(event: RerouteEvent) {
  return event.transOceanic ? 25 * 60 : 4 * 60;
}

function buildPerEventSnapshot(baseEvent: RerouteEvent, dutyPeriod: RerouteDutyPeriodEvent): RerouteEvent {
  return {
    ...baseEvent,
    rerouteTiming: dutyPeriod.rerouteTiming ?? baseEvent.rerouteTiming,
    originalScheduledRelease: dutyPeriod.originalScheduledRelease ?? baseEvent.originalScheduledRelease,
    reroutedScheduledRelease: dutyPeriod.reroutedScheduledRelease ?? baseEvent.reroutedScheduledRelease,
    firstBreakInDutyAfterReroute:
      dutyPeriod.firstBreakInDutyAfterReroute ?? baseEvent.firstBreakInDutyAfterReroute,
    reachedBase: dutyPeriod.reachedBase ?? baseEvent.reachedBase,
    releasedAtBase: dutyPeriod.releasedAtBase ?? baseEvent.releasedAtBase,
    rejoinedOriginalRotation: dutyPeriod.rejoinedOriginalRotation ?? baseEvent.rejoinedOriginalRotation,
    transOceanic: dutyPeriod.transOceanic ?? baseEvent.transOceanic,
    lateReleaseReason: dutyPeriod.lateReleaseReason ?? baseEvent.lateReleaseReason,
    touchedXDayOrLineDayOff: dutyPeriod.touchedXDayOrLineDayOff ?? baseEvent.touchedXDayOrLineDayOff,
    originalRotationValueMinutes:
      dutyPeriod.originalRotationValueMinutes ?? baseEvent.originalRotationValueMinutes,
    reroutedRotationValueMinutes:
      dutyPeriod.reroutedRotationValueMinutes ?? baseEvent.reroutedRotationValueMinutes,
    reroutedSegments: dutyPeriod.reroutedSegments,
    dutyPeriods: undefined,
  };
}

export function calculateReroutePay(event: RerouteEvent): DeterministicRerouteCalculation {
  const payItems: ReroutePayItem[] = [];
  const missingFacts: string[] = [];
  const warnings: string[] = [];
  const calculationSteps: string[] = [];

  const dutyPeriods =
    event.dutyPeriods && event.dutyPeriods.length > 0
      ? event.dutyPeriods
      : [{ label: "Event 1", reroutedSegments: event.reroutedSegments }] satisfies RerouteDutyPeriodEvent[];

  for (const dutyPeriod of dutyPeriods) {
    const currentEvent = buildPerEventSnapshot(event, dutyPeriod);
    const prefix = dutyPeriods.length > 1 ? `${dutyPeriod.label}: ` : "";

    if (currentEvent.rerouteTiming === "before_first_airborne") {
      warnings.push(`${prefix}Pre-first-airborne reroute uses the Section 23 L.2 gate and may require delayed roundtrip exception facts.`);
      missingFacts.push(`${prefix}Whether the delayed roundtrip exception applies`);
      calculationSteps.push(`${prefix}23 L.2 gate checked before any reroute-pay math.`);
    }

    for (const segment of currentEvent.reroutedSegments) {
      if (!segment.isRerouted) {
        continue;
      }
      if (segment.blockMinutes == null) {
        missingFacts.push(`${prefix}Block time for rerouted segment ${segment.origin ?? "?"}-${segment.destination ?? "?"}`);
        continue;
      }
      if (segment.relativeToFirstBreak === "unknown") {
        missingFacts.push(`${prefix}Whether rerouted segment ${segment.origin ?? "?"}-${segment.destination ?? "?"} was before or after first break in duty`);
        continue;
      }
      const multiplier = segment.relativeToFirstBreak === "before" ? 0.5 : 1.0;
      const ruleInfo =
        segment.relativeToFirstBreak === "before"
          ? reroutePayRules.reroutedSegmentBeforeBreak
          : reroutePayRules.reroutedSegmentAfterBreak;
      const minutes = Math.round(segment.blockMinutes * multiplier);
      payItems.push({
        eventLabel: dutyPeriod.label,
        label: dutyPeriods.length > 1 ? `${dutyPeriod.label} — ${ruleInfo.label}` : ruleInfo.label,
        rule: ruleInfo.rule,
        minutes,
        math: `${formatMinutes(segment.blockMinutes)} × ${multiplier === 0.5 ? "50%" : "100%"} = ${formatMinutes(minutes)} pay / no credit`,
        sourceAnchor: ruleInfo.sourceAnchor,
        confidence: segment.timingBasis === "actual" ? "high" : "medium",
      });
      calculationSteps.push(
        `${prefix}${ruleInfo.rule}: ${segment.origin ?? "?"}-${segment.destination ?? "?"} ${formatMinutes(segment.blockMinutes)} at ${multiplier === 0.5 ? "50%" : "100%"} pay / no credit.`,
      );
    }

    if (currentEvent.releasedAtBase && currentEvent.pilotStatus === "lineholder") {
      calculationSteps.push(`${prefix}23 L.4.c / Section 4 F: release at base may preserve original rotation guarantee in addition to reroute pay.`);
      if (currentEvent.originalRotationValueMinutes == null) {
        missingFacts.push(`${prefix}Original rotation value to evaluate release-at-base guarantee`);
      }
    }

    const releaseSlip = diffClockMinutes(currentEvent.originalScheduledRelease, currentEvent.reroutedScheduledRelease);
    const thresholdMinutes = lateReleaseThresholdMinutes(currentEvent);
    if (releaseSlip == null) {
      missingFacts.push(`${prefix}Original and rerouted scheduled release times`);
    } else if (releaseSlip > thresholdMinutes) {
      if (currentEvent.pilotStatus === "lineholder") {
        if (currentEvent.lateReleaseReason === "weather_or_airport_closure") {
          warnings.push(`${prefix}23 L.8 late-release premium may not apply because the late release appears weather or airport-closure driven.`);
        } else if (currentEvent.reroutedRotationValueMinutes == null) {
          missingFacts.push(`${prefix}Duty period value beyond the 23 L.8 threshold`);
        } else {
          payItems.push({
            eventLabel: dutyPeriod.label,
            label:
              dutyPeriods.length > 1
                ? `${dutyPeriod.label} — ${reroutePayRules.lineholderLateRelease.label}`
                : reroutePayRules.lineholderLateRelease.label,
            rule: reroutePayRules.lineholderLateRelease.rule,
            minutes: currentEvent.reroutedRotationValueMinutes,
            math: `Late release exceeded ${formatMinutes(thresholdMinutes)} threshold; add ${formatMinutes(currentEvent.reroutedRotationValueMinutes)} pay / no credit for affected duty period.`,
            sourceAnchor: reroutePayRules.lineholderLateRelease.sourceAnchor,
            confidence: currentEvent.lateReleaseReason === "company_controlled" ? "high" : "medium",
          });
          calculationSteps.push(
            `${prefix}23 L.8: rerouted scheduled release exceeded original scheduled release by ${formatMinutes(releaseSlip)}, above the ${formatMinutes(thresholdMinutes)} threshold.`,
          );
        }
      } else {
        if (currentEvent.touchedXDayOrLineDayOff == null) {
          missingFacts.push(`${prefix}Whether the late release extended into an X-day or regular line day-off`);
        } else if (!currentEvent.touchedXDayOrLineDayOff) {
          warnings.push(`${prefix}23 L.9 premium needs an extension into an X-day or line day-off.`);
        } else if (currentEvent.reroutedRotationValueMinutes == null) {
          missingFacts.push(`${prefix}Affected duty period value for the 23 L.9 premium`);
        } else {
          payItems.push({
            eventLabel: dutyPeriod.label,
            label:
              dutyPeriods.length > 1
                ? `${dutyPeriod.label} — ${reroutePayRules.reserveXDayLateRelease.label}`
                : reroutePayRules.reserveXDayLateRelease.label,
            rule: reroutePayRules.reserveXDayLateRelease.rule,
            minutes: currentEvent.reroutedRotationValueMinutes,
            math: `Late release exceeded ${formatMinutes(thresholdMinutes)} and touched an X-day / line day-off; add ${formatMinutes(currentEvent.reroutedRotationValueMinutes)} pay / no credit.`,
            sourceAnchor: reroutePayRules.reserveXDayLateRelease.sourceAnchor,
            confidence: "medium",
          });
          calculationSteps.push(
            `${prefix}23 L.9: reserve late release exceeded ${formatMinutes(thresholdMinutes)} and extended into protected time off.`,
          );
        }
      }
    }

    if (
      currentEvent.reachedBase === false &&
      currentEvent.rejoinedOriginalRotation === false &&
      currentEvent.reroutedRotationValueMinutes != null &&
      currentEvent.originalScheduledRelease != null &&
      currentEvent.reroutedScheduledRelease != null
    ) {
      if (currentEvent.lateReleaseReason === "unknown") {
        missingFacts.push(`${prefix}Whether the additional duty period was company-controlled or weather / airport closure`);
        calculationSteps.push(`${prefix}23 L.10 / L.11 issue flagged because the reroute appears to create an additional duty period after the original rotation.`);
      } else {
        const minutes = currentEvent.reroutedRotationValueMinutes;
        payItems.push({
          eventLabel: dutyPeriod.label,
          label:
            dutyPeriods.length > 1
              ? `${dutyPeriod.label} — ${reroutePayRules.additionalDutyPeriod.label}`
              : reroutePayRules.additionalDutyPeriod.label,
          rule: reroutePayRules.additionalDutyPeriod.rule,
          minutes,
          math:
            currentEvent.lateReleaseReason === "company_controlled"
              ? `${formatMinutes(minutes)} single pay / credit plus ${formatMinutes(minutes)} single pay / no credit for additional duty period.`
              : `${formatMinutes(minutes)} single pay / credit for additional duty period.`,
          sourceAnchor: reroutePayRules.additionalDutyPeriod.sourceAnchor,
          confidence: "medium",
        });
        calculationSteps.push(
          `${prefix}23 L.10 / L.11: additional duty period treatment depends on whether the cause was company-controlled or weather / airport closure.`,
        );
      }
    }
  }

  const estimatedAdditionalPayMinutes = sumKnownMinutes(payItems);
  if (estimatedAdditionalPayMinutes == null) {
    warnings.push("Not enough deterministic values are present to total all reroute pay items yet.");
  }

  const calculation: RerouteCalculationResult = {
    calculationType: payItems.length > 0 ? "reroute_rule_items" : "insufficient_inputs",
    estimatedPayMinutes: estimatedAdditionalPayMinutes,
    calculationSteps:
      calculationSteps.length > 0
        ? calculationSteps
        : ["I do not have enough structured reroute values yet to calculate a Section 23 L pay item."],
    labels: payItems.map((item) => item.rule),
    missingFacts: Array.from(new Set(missingFacts)).slice(0, 5),
    confidence:
      payItems.length > 0 && missingFacts.length === 0
        ? "high"
        : payItems.length > 0
          ? "medium"
          : "low",
  };

  return {
    estimatedAdditionalPayMinutes,
    payItems,
    missingFacts: calculation.missingFacts,
    warnings,
    calculationSteps: calculation.calculationSteps,
    calculation,
  };
}
