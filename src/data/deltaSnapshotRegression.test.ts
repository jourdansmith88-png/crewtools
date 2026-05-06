import { deltaSnapshot } from "./deltaSnapshot.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  deltaSnapshot.latestFiles.seniority === "May 2026 Seniority List.pdf",
  `Expected May 2026 seniority file, got ${deltaSnapshot.latestFiles.seniority}`,
);

assert(
  deltaSnapshot.latestFiles.category === "02MAY2026Category_List_A.pdf",
  `Expected May 2026 category file, got ${deltaSnapshot.latestFiles.category}`,
);

assert(
  deltaSnapshot.activeMonths.seniorityCategory === "2026-05",
  `Expected shared active month 2026-05, got ${deltaSnapshot.activeMonths.seniorityCategory}`,
);

assert(deltaSnapshot.pilotDirectory.length > 0, "Expected non-empty pilotDirectory");
assert(
  deltaSnapshot.latestCategoryAssignments.length > 0,
  "Expected non-empty latestCategoryAssignments",
);
assert(deltaSnapshot.aeOpportunities.length > 0, "Expected non-empty aeOpportunities");

const maySeniorityPilot = deltaSnapshot.pilotDirectory.find(
  (pilot) => pilot.name === "HUPPERICH, PETER K",
);
assert(Boolean(maySeniorityPilot), "Expected HUPPERICH, PETER K in May seniority data");
assert(
  Boolean(maySeniorityPilot?.currentBase) &&
    Boolean(maySeniorityPilot?.currentFleet) &&
    Boolean(maySeniorityPilot?.currentSeat),
  "Expected May seniority pilot to include current base/fleet/seat",
);

const mayCategoryPilot = deltaSnapshot.latestCategoryAssignments.find(
  (pilot) => pilot.name === "Easley, James T",
);
assert(Boolean(mayCategoryPilot), "Expected Easley, James T in May category assignments");
assert(
  Boolean(mayCategoryPilot?.base) &&
    Boolean(mayCategoryPilot?.fleet) &&
    Boolean(mayCategoryPilot?.seat),
  "Expected May category pilot to include base/fleet/seat",
);

console.log(
  JSON.stringify(
    {
      latestFiles: deltaSnapshot.latestFiles,
      activeMonths: deltaSnapshot.activeMonths,
      pilotDirectoryCount: deltaSnapshot.pilotDirectory.length,
      latestCategoryAssignmentsCount: deltaSnapshot.latestCategoryAssignments.length,
      aeOpportunityCount: deltaSnapshot.aeOpportunities.length,
      knownSeniorityPilot: maySeniorityPilot?.name ?? null,
      knownCategoryPilot: mayCategoryPilot?.name ?? null,
    },
    null,
    2,
  ),
);
