import type { RotationDashboardData } from "../../utils/rotationCompanion.ts";

export type TodayTimelineItem =
  | {
      key: string;
      type: "leg";
      leg: RotationDashboardData["legs"][number];
      isHighlighted: boolean;
      dayLabel: string;
    }
  | {
      key: string;
      type: "layover";
      city: string;
      isHighlighted: false;
      dayLabel: string;
    };

export function buildTodayTimelineItems(dashboard: Pick<RotationDashboardData, "legs" | "snapshot">): TodayTimelineItem[] {
  const layoverSet = new Set(
    dashboard.snapshot.layoverCities.map((city) => city.trim().toUpperCase()).filter(Boolean),
  );
  const items: TodayTimelineItem[] = [];
  dashboard.legs.forEach((leg, index) => {
    items.push({
      key: `leg-${leg.id}`,
      type: "leg",
      leg,
      isHighlighted: index === 0,
      dayLabel: leg.dayLabel,
    });
    const arrivalCity = leg.destination.trim().toUpperCase();
    const isLastLeg = index === dashboard.legs.length - 1;
    if (!isLastLeg && layoverSet.has(arrivalCity)) {
      items.push({
        key: `layover-${leg.id}-${arrivalCity}`,
        type: "layover",
        city: arrivalCity,
        isHighlighted: false,
        dayLabel: leg.dayLabel,
      });
    }
  });
  return items;
}
