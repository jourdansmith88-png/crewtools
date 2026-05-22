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
      layoverDetailIndex?: number;
      isHighlighted: false;
      dayLabel: string;
    };

export function buildTodayTimelineItems(
  dashboard: Pick<RotationDashboardData, "legs" | "snapshot" | "layoverDetails">,
): TodayTimelineItem[] {
  const orderedLayoverDetails =
    dashboard.layoverDetails?.map((detail, index) => ({
      city: detail.city.trim().toUpperCase(),
      detailIndex: index,
    })).filter((detail) => detail.city.length > 0) ?? [];
  const orderedLayoverCities =
    orderedLayoverDetails.length > 0
      ? orderedLayoverDetails
      : dashboard.snapshot.layoverCities
          .map((city, index) => ({ city: city.trim().toUpperCase(), detailIndex: index }))
          .filter((detail) => detail.city.length > 0);

  const items: TodayTimelineItem[] = [];
  let nextLayoverIndex = 0;
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
    const nextLayover = orderedLayoverCities[nextLayoverIndex];
    if (!isLastLeg && nextLayover?.city === arrivalCity) {
      items.push({
        key: `layover-${leg.id}-${arrivalCity}-${nextLayoverIndex}`,
        type: "layover",
        city: arrivalCity,
        layoverDetailIndex: orderedLayoverDetails.length > 0 ? nextLayover.detailIndex : undefined,
        isHighlighted: false,
        dayLabel: leg.dayLabel,
      });
      nextLayoverIndex += 1;
    }
  });
  return items;
}
