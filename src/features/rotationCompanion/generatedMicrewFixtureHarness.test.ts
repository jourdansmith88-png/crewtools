import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseRotationIntoDashboard } from "../../utils/rotationCompanion.ts";

type ExpectedLeg = {
  carrier?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  isDeadhead?: boolean;
};

type GeneratedFixtureExpected = {
  shouldParse?: boolean;
  rotationNumber?: string;
  tripDates?: string;
  base?: string;
  fleet?: string;
  creditMinutes?: number;
  blockMinutes?: number;
  deadheadBlockMinutes?: number;
  finalArrival?: string;
  legCount?: number;
  operatingLegCount?: number;
  deadheadLegCount?: number;
  layovers?: string[];
  cityChain?: string[];
  legs?: ExpectedLeg[];
};

type GeneratedFixtureFile = {
  fixtureId: string;
  sourcePairingNumber?: string;
  sourceBase?: string;
  sourceFleet?: string;
  expected: GeneratedFixtureExpected;
  sourceDutySequence?: Array<Record<string, unknown>>;
  notes?: string[];
};

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const generatedRoot = path.resolve(
  process.cwd(),
  "test/fixtures/rotations/micrew/generated",
);
const expectedRoot = path.resolve(
  process.cwd(),
  "test/fixtures/rotations/expected",
);

function loadExpectedFixture(expectedPath: string) {
  return JSON.parse(readFileSync(expectedPath, "utf8")) as GeneratedFixtureFile;
}

function countOperatingLegs(legs: Array<{ isDeadhead?: boolean }>) {
  return legs.filter((leg) => !leg.isDeadhead).length;
}

function toCityChain(legs: Array<{ origin: string; destination: string }>) {
  return legs.map((leg) => `${leg.origin}-${leg.destination}`);
}

const generatedFixturePaths = readdirSync(generatedRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
  .map((entry) => path.join(generatedRoot, entry.name))
  .sort();

assert(generatedFixturePaths.length > 0, "Expected at least one generated MiCrew fixture");

const futureAssertionMessages = new Set<string>();

for (const fixturePath of generatedFixturePaths) {
  const fixtureId = path.basename(fixturePath, ".txt");
  const expectedPath = path.join(expectedRoot, `${fixtureId}.expected.json`);
  assert(existsSync(expectedPath), `Generated fixture ${fixtureId} is missing paired expected JSON`);

  const afterText = readFileSync(fixturePath, "utf8");
  const expectedFile = loadExpectedFixture(expectedPath);
  const expected = expectedFile.expected;

  assert(
    expectedFile.fixtureId === fixtureId,
    `Generated fixture ${fixtureId} expected.json fixtureId mismatch: ${expectedFile.fixtureId}`,
  );

  const parseResult = parseRotationIntoDashboard(afterText);
  const shouldParse = expected.shouldParse !== false;

  if (!shouldParse) {
    assert(!parseResult.ok, `Generated fixture ${fixtureId} should not parse yet, but parser returned ok`);
    continue;
  }

  assert(parseResult.ok, `Generated fixture ${fixtureId} should parse, got error: ${parseResult.ok ? "" : parseResult.error}`);
  if (!parseResult.ok) {
    continue;
  }

  const dashboard = parseResult.dashboard;
  const snapshot = dashboard.snapshot;
  const deadheadLegCount = dashboard.legs.filter((leg) => leg.isDeadhead).length;
  const operatingLegCount = countOperatingLegs(dashboard.legs);
  const actualCityChain = toCityChain(dashboard.legs);

  if (expected.rotationNumber) {
    assert(
      snapshot.rotationNumber === expected.rotationNumber,
      `Generated fixture ${fixtureId} rotation number mismatch: expected ${expected.rotationNumber}, got ${snapshot.rotationNumber}`,
    );
  }
  if (expected.tripDates) {
    assert(
      snapshot.tripDates === expected.tripDates,
      `Generated fixture ${fixtureId} trip dates mismatch: expected ${expected.tripDates}, got ${snapshot.tripDates}`,
    );
  }
  if (typeof expected.creditMinutes === "number") {
    assert(
      snapshot.totalCreditMinutes === expected.creditMinutes,
      `Generated fixture ${fixtureId} credit mismatch: expected ${expected.creditMinutes}, got ${snapshot.totalCreditMinutes}`,
    );
  }
  if (typeof expected.blockMinutes === "number") {
    assert(
      snapshot.scheduledBlockMinutes === expected.blockMinutes,
      `Generated fixture ${fixtureId} block mismatch: expected ${expected.blockMinutes}, got ${snapshot.scheduledBlockMinutes}`,
    );
  }
  if (typeof expected.deadheadBlockMinutes === "number") {
    assert(
      dashboard.parsedRotation.deadheadBlock === expected.deadheadBlockMinutes,
      `Generated fixture ${fixtureId} deadhead block mismatch: expected ${expected.deadheadBlockMinutes}, got ${dashboard.parsedRotation.deadheadBlock}`,
    );
  }
  if (typeof expected.finalArrival === "string") {
    assert(
      snapshot.finalArrival === expected.finalArrival,
      `Generated fixture ${fixtureId} final arrival mismatch: expected ${expected.finalArrival}, got ${snapshot.finalArrival}`,
    );
  }
  if (typeof expected.legCount === "number") {
    assert(
      snapshot.legCount === expected.legCount,
      `Generated fixture ${fixtureId} leg count mismatch: expected ${expected.legCount}, got ${snapshot.legCount}`,
    );
  }
  if (typeof expected.deadheadLegCount === "number") {
    assert(
      deadheadLegCount === expected.deadheadLegCount,
      `Generated fixture ${fixtureId} deadhead leg count mismatch: expected ${expected.deadheadLegCount}, got ${deadheadLegCount}`,
    );
  }
  if (typeof expected.operatingLegCount === "number") {
    assert(
      operatingLegCount === expected.operatingLegCount,
      `Generated fixture ${fixtureId} operating leg count mismatch: expected ${expected.operatingLegCount}, got ${operatingLegCount}`,
    );
  }
  if (expected.layovers) {
    assert(
      JSON.stringify(snapshot.layoverCities) === JSON.stringify(expected.layovers),
      `Generated fixture ${fixtureId} layovers mismatch: expected ${JSON.stringify(expected.layovers)}, got ${JSON.stringify(snapshot.layoverCities)}`,
    );
  }
  if (expected.cityChain) {
    assert(
      JSON.stringify(actualCityChain) === JSON.stringify(expected.cityChain),
      `Generated fixture ${fixtureId} city chain mismatch: expected ${JSON.stringify(expected.cityChain)}, got ${JSON.stringify(actualCityChain)}`,
    );
  }
  if (expected.legs) {
    assert(
      dashboard.legs.length === expected.legs.length,
      `Generated fixture ${fixtureId} expected ${expected.legs.length} leg assertions, got ${dashboard.legs.length} parsed legs`,
    );
    expected.legs.forEach((expectedLeg, index) => {
      const actualLeg = dashboard.legs[index];
      assert(actualLeg, `Generated fixture ${fixtureId} missing parsed leg at index ${index}`);
      if (expectedLeg.carrier) {
        assert(
          actualLeg.carrier === expectedLeg.carrier,
          `Generated fixture ${fixtureId} leg ${index + 1} carrier mismatch: expected ${expectedLeg.carrier}, got ${actualLeg.carrier}`,
        );
      }
      if (expectedLeg.flightNumber) {
        assert(
          actualLeg.flightNumber === expectedLeg.flightNumber,
          `Generated fixture ${fixtureId} leg ${index + 1} flight mismatch: expected ${expectedLeg.flightNumber}, got ${actualLeg.flightNumber}`,
        );
      }
      if (expectedLeg.origin) {
        assert(
          actualLeg.origin === expectedLeg.origin,
          `Generated fixture ${fixtureId} leg ${index + 1} origin mismatch: expected ${expectedLeg.origin}, got ${actualLeg.origin}`,
        );
      }
      if (expectedLeg.destination) {
        assert(
          actualLeg.destination === expectedLeg.destination,
          `Generated fixture ${fixtureId} leg ${index + 1} destination mismatch: expected ${expectedLeg.destination}, got ${actualLeg.destination}`,
        );
      }
      if (typeof expectedLeg.isDeadhead === "boolean") {
        assert(
          actualLeg.isDeadhead === expectedLeg.isDeadhead,
          `Generated fixture ${fixtureId} leg ${index + 1} deadhead mismatch: expected ${expectedLeg.isDeadhead}, got ${actualLeg.isDeadhead}`,
        );
      }
    });
  }

  if (expected.base) {
    futureAssertionMessages.add(
      `Generated fixture ${fixtureId}: base=${expected.base} present in expected JSON but not currently exposed by parseRotationIntoDashboard snapshot`,
    );
  }
  if (expected.fleet) {
    futureAssertionMessages.add(
      `Generated fixture ${fixtureId}: fleet=${expected.fleet} present in expected JSON but not currently exposed by parseRotationIntoDashboard snapshot`,
    );
  }
}

if (futureAssertionMessages.size > 0) {
  console.log("generatedMiCrewFixtureHarness future assertions:");
  for (const message of [...futureAssertionMessages].sort()) {
    console.log(`- ${message}`);
  }
}

console.log(
  `generatedMiCrewFixtureHarness passed (${generatedFixturePaths.length} generated fixture${generatedFixturePaths.length === 1 ? "" : "s"})`,
);
