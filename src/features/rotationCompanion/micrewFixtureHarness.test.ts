import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { MicrewFixtureCase } from "./micrewFixtureCase.ts";
import { buildTripWatchRotationSnapshot, compareRotationSnapshots } from "./tripWatchComparison.ts";
import { parseRotationIntoDashboard } from "../../utils/rotationCompanion.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const fixturesRoot = path.resolve(
  process.cwd(),
  "src/features/rotationCompanion/fixtures/micrewCases",
);

function readTextIfPresent(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function loadCaseExpected(caseDir: string) {
  const expectedPath = path.join(caseDir, "expected.json");
  const parsed = JSON.parse(readFileSync(expectedPath, "utf8")) as MicrewFixtureCase;
  assert(typeof parsed.caseId === "string" && parsed.caseId.length > 0, `Fixture ${caseDir} is missing caseId`);
  assert(
    typeof parsed.expected?.shouldParse === "boolean" && typeof parsed.expected?.shouldCompare === "boolean",
    `Fixture ${parsed.caseId} is missing parse/compare expectations`,
  );
  return parsed;
}

function loadCaseFolder(caseId: string) {
  const caseDir = path.join(fixturesRoot, caseId);
  return {
    caseId,
    caseDir,
    afterText: readTextIfPresent(path.join(caseDir, "after.real.micrew.txt")),
    beforeText: readTextIfPresent(path.join(caseDir, "before.synthetic.micrew.txt")),
    expected: loadCaseExpected(caseDir),
  };
}

function countOperatingLegs(legs: Array<{ isDeadhead?: boolean }>) {
  return legs.filter((leg) => !leg.isDeadhead).length;
}

const fixtureIds = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

assert(fixtureIds.includes("8008"), "Expected MiCrew fixture harness to include 8008");

for (const fixtureId of fixtureIds) {
  const fixture = loadCaseFolder(fixtureId);
  const { expected } = fixture;

  assert(
    fixture.expected.caseId === fixtureId,
    `Fixture ${fixtureId} expected.json caseId mismatch: ${fixture.expected.caseId}`,
  );

  const afterParse = parseRotationIntoDashboard(fixture.afterText);

  if (!expected.expected.shouldParse) {
    assert(
      !afterParse.ok,
      `Fixture ${fixtureId} should not parse yet, but parser returned ok`,
    );
    continue;
  }

  assert(afterParse.ok, `Fixture ${fixtureId} should parse, got error: ${afterParse.ok ? "" : afterParse.error}`);
  if (!afterParse.ok) {
    continue;
  }

  const afterDashboard = afterParse.dashboard;
  const afterSnapshot = afterDashboard.snapshot;
  const expectedValues = expected.expected;
  const deadheadLegCount = afterDashboard.legs.filter((leg) => leg.isDeadhead).length;
  const operatingLegCount = countOperatingLegs(afterDashboard.legs);

  assert(
    afterSnapshot.rotationNumber === expected.rotationNumber,
    `Fixture ${fixtureId} rotation number mismatch: expected ${expected.rotationNumber}, got ${afterSnapshot.rotationNumber}`,
  );
  assert(
    afterSnapshot.tripDates === expected.tripDates,
    `Fixture ${fixtureId} trip dates mismatch: expected ${expected.tripDates}, got ${afterSnapshot.tripDates}`,
  );
  assert(
    afterSnapshot.totalCreditMinutes === expectedValues.creditMinutes,
    `Fixture ${fixtureId} credit mismatch: expected ${expectedValues.creditMinutes}, got ${afterSnapshot.totalCreditMinutes}`,
  );
  assert(
    afterSnapshot.scheduledBlockMinutes === expectedValues.blockMinutes,
    `Fixture ${fixtureId} block mismatch: expected ${expectedValues.blockMinutes}, got ${afterSnapshot.scheduledBlockMinutes}`,
  );
  if (typeof expectedValues.deadheadBlockMinutes === "number") {
    assert(
      afterDashboard.parsedRotation.deadheadBlock === expectedValues.deadheadBlockMinutes,
      `Fixture ${fixtureId} deadhead block mismatch: expected ${expectedValues.deadheadBlockMinutes}, got ${afterDashboard.parsedRotation.deadheadBlock}`,
    );
  }
  assert(
    JSON.stringify(afterSnapshot.layoverCities) === JSON.stringify(expectedValues.layovers),
    `Fixture ${fixtureId} layovers mismatch: expected ${JSON.stringify(expectedValues.layovers)}, got ${JSON.stringify(afterSnapshot.layoverCities)}`,
  );
  assert(
    afterSnapshot.finalArrival === expectedValues.finalArrival,
    `Fixture ${fixtureId} final arrival mismatch: expected ${expectedValues.finalArrival}, got ${afterSnapshot.finalArrival}`,
  );
  assert(
    afterSnapshot.legCount === expectedValues.legCount,
    `Fixture ${fixtureId} leg count mismatch: expected ${expectedValues.legCount}, got ${afterSnapshot.legCount}`,
  );
  assert(
    deadheadLegCount === expectedValues.deadheadLegCount,
    `Fixture ${fixtureId} deadhead leg count mismatch: expected ${expectedValues.deadheadLegCount}, got ${deadheadLegCount}`,
  );
  assert(
    operatingLegCount === expectedValues.operatingLegCount,
    `Fixture ${fixtureId} operating leg count mismatch: expected ${expectedValues.operatingLegCount}, got ${operatingLegCount}`,
  );

  if (fixtureId === "8245") {
    const regionalDhLeg = afterDashboard.legs.find(
      (leg) => leg.origin === "GEG" && leg.destination === "SEA",
    );
    assert(regionalDhLeg, "Fixture 8245 should retain visible GEG-SEA regional leg");
    assert(
      regionalDhLeg?.carrier === "OO" && regionalDhLeg.isDeadhead === true,
      `Fixture 8245 expected GEG-SEA to remain OO deadhead, got ${JSON.stringify(regionalDhLeg)}`,
    );
    assert(
      afterDashboard.legs.some((leg) => leg.origin === "GEG" && leg.destination === "SEA"),
      "Fixture 8245 visible timeline should still contain GEG-SEA",
    );
  }

  if (!expectedValues.shouldCompare) {
    continue;
  }

  const beforeParse = parseRotationIntoDashboard(fixture.beforeText);
  assert(beforeParse.ok, `Fixture ${fixtureId} synthetic baseline should parse`);
  if (!beforeParse.ok) {
    continue;
  }

  const comparison = compareRotationSnapshots(
    buildTripWatchRotationSnapshot(beforeParse.dashboard),
    buildTripWatchRotationSnapshot(afterParse.dashboard),
  );

  assert(
    comparison.status === "ok",
    `Fixture ${fixtureId} compare should succeed, got ${comparison.status}`,
  );
  for (const watchItem of expectedValues.expectedWatchItems ?? []) {
    assert(
      comparison.watchItems.includes(watchItem),
      `Fixture ${fixtureId} expected watch item missing: ${watchItem}`,
    );
  }
}

function assertRegionalMicrewDeadheadSnippet(label: string, carrierCode: "OO" | "YX" | "9E", flightNumber: string) {
  const parsed = parseRotationIntoDashboard(
    [
      `ROT TEST-${carrierCode} 01MAY-01MAY`,
      "PPR REDACTED",
      "Rpt- 0700 01MAY",
      "Release- 1200 01MAY",
      "Credit- 05:00",
      "TAFB 05:00",
      `${carrierCode}${flightNumber} : SLC-BOI`,
      "Dep- 0800 01MAY",
      "Arr- 1000 01MAY",
      "Blk- 2:00",
      "TOTALS 05:00TL 02:00BL 00:00CR 00:00MU",
    ].join("\n"),
  );

  assert(parsed.ok, `[${label}] Expected MiCrew snippet to parse`);
  if (!parsed.ok) {
    return;
  }
  const leg = parsed.dashboard.legs[0];
  assert(leg, `[${label}] Expected one visible leg`);
  assert(
    leg?.carrier === carrierCode && leg?.isDeadhead === true,
    `[${label}] Expected ${carrierCode}${flightNumber} to remain ${carrierCode} deadhead, got ${JSON.stringify(leg)}`,
  );
  assert(
    parsed.dashboard.legs.filter((candidate) => !candidate.isDeadhead).length === 0,
    `[${label}] Expected regional snippet to exclude the leg from operating counts`,
  );
  assert(
    parsed.dashboard.parsedRotation.deadheadBlock === 120,
    `[${label}] Expected regional snippet to include deadhead block 120, got ${parsed.dashboard.parsedRotation.deadheadBlock}`,
  );
}

assertRegionalMicrewDeadheadSnippet("MiCrew OO regional deadhead", "OO", "3857");
assertRegionalMicrewDeadheadSnippet("MiCrew YX regional deadhead", "YX", "1234");
assertRegionalMicrewDeadheadSnippet("MiCrew 9E regional deadhead", "9E", "5045");
