import {
  computeSnapshotFromUserFacingChain,
  diagnoseScreenshotRotationPartialStatus,
  excludeDeadheadLegsFromVisibleChain,
} from "./rotationChainBuilder.ts";
import {
  parseICrewFlightToken,
  parseICrewText,
  parseICrewTextWithDiagnostics,
} from "./parseICrewText.ts";
import {
  rotation0233ICrewLivePasteText,
  rotation0233ICrewRawText,
} from "./fixtures/rotation0233ICrewText.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runICrewAssertions(label: string, rawText: string) {
  const debugResult = parseICrewTextWithDiagnostics(rawText);
  assert(debugResult.parserSucceeded === true, `[${label}] Expected parserSucceeded true, got ${JSON.stringify(debugResult.diagnostics)}`);
  const parsed = parseICrewText(rawText);

  assert(parsed.header.rotationNumber === "0233", `[${label}] Expected rotationNumber 0233, got ${parsed.header.rotationNumber}`);
  assert(parsed.header.base === "SLC", `[${label}] Expected base SLC, got ${parsed.header.base}`);
  assert(parsed.header.tripDates === "04APR - 06APR", `[${label}] Expected tripDates 04APR - 06APR, got ${parsed.header.tripDates}`);
  assert(parsed.header.totalCreditMinutes === 980, `[${label}] Expected totalCreditMinutes 980, got ${parsed.header.totalCreditMinutes}`);
  assert(parsed.header.scheduledBlockMinutes === 662, `[${label}] Expected TBL 662, got ${parsed.header.scheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes === 233, `[${label}] Expected TDHD 233, got ${parsed.header.totalDeadheadBlockMinutes}`);
  assert(parsed.header.tafbCredit === "51:32", `[${label}] Expected TAFB credit 51:32, got ${parsed.header.tafbCredit}`);
  assert(parsed.header.tafbElapsed === "51:14", `[${label}] Expected TAFB elapsed 51:14, got ${parsed.header.tafbElapsed}`);

  const allTripSegments = parsed.allTripSegments.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport} ${leg.isDeadhead ? "DH" : "OP"} ${leg.scheduledBlock}`,
  );
  assert(
    JSON.stringify(allTripSegments) ===
      JSON.stringify([
        "SLC-SJC OP 2:02",
        "SJC-SLC OP 1:48",
        "SLC-CLE OP 3:18",
        "CLE-LGA DH 1:23",
        "LGA-MCI OP 3:54",
        "MCI-SLC DH 2:30",
      ]),
    `[${label}] Expected allTripSegments to match fixture, got ${allTripSegments.join(" | ")}`,
  );

  const visibleOperatingLegs = parsed.visibleOperatingLegs.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport}`,
  );
  assert(
    JSON.stringify(visibleOperatingLegs) ===
      JSON.stringify(["SLC-SJC", "SJC-SLC", "SLC-CLE", "LGA-MCI"]),
    `[${label}] Expected visibleOperatingLegs SLC-SJC | SJC-SLC | SLC-CLE | LGA-MCI, got ${visibleOperatingLegs.join(" | ")}`,
  );
  assert(
    JSON.stringify(parsed.logbookLegs.map((leg) => `${leg.departureAirport}-${leg.arrivalAirport}`)) ===
      JSON.stringify(visibleOperatingLegs),
    `[${label}] Expected logbook legs to match visible operating legs`,
  );

  assert(parsed.deadheadAnnotations.length === 2, `[${label}] Expected 2 deadhead annotations, got ${parsed.deadheadAnnotations.length}`);
  assert(parsed.visibleOperatingLegs.length === 4, `[${label}] Expected 4 visibleOperatingLegs, got ${parsed.visibleOperatingLegs.length}`);
  assert(
    parsed.deadheadAnnotations[0]?.cityPair === "CLE-LGA" &&
      parsed.deadheadAnnotations[0]?.carrier === "9E" &&
      parsed.deadheadAnnotations[0]?.flightNumber === "5045" &&
      parsed.deadheadAnnotations[0]?.carrierName === "Endeavor Air" &&
      parsed.deadheadAnnotations[0]?.reason === "inferred_from_dhd_totals_and_regional_carrier" &&
      parsed.deadheadAnnotations[0]?.scheduledBlockMinutes === 83,
    `[${label}] Expected CLE-LGA offline DH annotation, got ${JSON.stringify(parsed.deadheadAnnotations[0])}`,
  );
  assert(
    parsed.deadheadAnnotations[1]?.cityPair === "MCI-SLC" &&
      parsed.deadheadAnnotations[1]?.carrier === "DL" &&
      parsed.deadheadAnnotations[1]?.flightNumber === "2903" &&
      parsed.deadheadAnnotations[1]?.reason === "explicit_D_marker" &&
      parsed.deadheadAnnotations[1]?.scheduledBlockMinutes === 150,
    `[${label}] Expected MCI-SLC explicit D-marker annotation, got ${JSON.stringify(parsed.deadheadAnnotations[1])}`,
  );
  if (label.includes("live-paste")) {
    assert(
      parsed.deadheadAnnotations[0]?.confirmationCode == null,
      `[${label}] Expected CLE-LGA confirmationCode null for raw text, got ${parsed.deadheadAnnotations[0]?.confirmationCode}`,
    );
    assert(
      parsed.deadheadAnnotations[1]?.confirmationCode == null,
      `[${label}] Expected MCI-SLC confirmationCode null for raw text, got ${parsed.deadheadAnnotations[1]?.confirmationCode}`,
    );
  }

  assert(parsed.partialStatus === false, `[${label}] Expected partialStatus false, got ${parsed.partialStatus}`);
  assert(parsed.operatingScheduledBlockMinutes === 662, `[${label}] Expected operatingScheduledBlockMinutes 662, got ${parsed.operatingScheduledBlockMinutes}`);
  assert(parsed.deadheadScheduledBlockMinutes === 233, `[${label}] Expected deadheadScheduledBlockMinutes 233, got ${parsed.deadheadScheduledBlockMinutes}`);
  assert(parsed.scheduledBlockSource === "iCrewSummaryTotals", `[${label}] Expected scheduledBlockSource iCrewSummaryTotals, got ${parsed.scheduledBlockSource}`);
  assert(parsed.finalOperatingArrival === "MCI", `[${label}] Expected final operating arrival MCI, got ${parsed.finalOperatingArrival}`);
  assert(parsed.finalArrivalAfterDeadhead === "SLC", `[${label}] Expected final arrival after DH SLC, got ${parsed.finalArrivalAfterDeadhead}`);

  assert(
    parsed.header.scheduledBlockMinutes === parsed.operatingScheduledBlockMinutes,
    `[${label}] Expected TBL ${parsed.header.scheduledBlockMinutes} to equal operating block sum ${parsed.operatingScheduledBlockMinutes}`,
  );
  assert(
    parsed.header.totalDeadheadBlockMinutes === parsed.deadheadScheduledBlockMinutes,
    `[${label}] Expected TDHD ${parsed.header.totalDeadheadBlockMinutes} to equal deadhead block sum ${parsed.deadheadScheduledBlockMinutes}`,
  );

const sharedDisplayModelVisibleOperatingLegs = excludeDeadheadLegsFromVisibleChain(
  parsed.allTripSegments,
  parsed.deadheadAnnotations,
).map((leg, index) => ({ ...leg, index: index + 1, isDeadhead: false, segmentType: "operating" as const }));

const sharedDisplaySnapshot = computeSnapshotFromUserFacingChain({
  userFacingLegs: sharedDisplayModelVisibleOperatingLegs,
  headerScheduledBlockMinutes: undefined,
  fallbackScheduledBlockMinutes: 0,
  finalArrivalFallback: "TBD",
});

const sharedDisplayPartialDiagnosis = diagnoseScreenshotRotationPartialStatus({
  userFacingLegs: sharedDisplayModelVisibleOperatingLegs,
  allTripSegments: parsed.allTripSegments,
  context: {
    base: parsed.header.base,
    startDate: "04APR",
    endDate: "06APR",
  },
});

const sharedDisplayAllTripSegments = parsed.allTripSegments.map(
  (leg) => `${leg.departureAirport}-${leg.arrivalAirport}`,
);
const sharedDisplayOperatingLegs = sharedDisplayModelVisibleOperatingLegs.map(
  (leg) => `${leg.departureAirport}-${leg.arrivalAirport}`,
);
const sharedDisplayDeadheads = parsed.deadheadAnnotations.map(
  (annotation) =>
    `${annotation.cityPair}/${annotation.carrier}/${annotation.flightNumber}/${annotation.confirmationCode ?? "NONE"}`,
);
const expectedSharedDisplayDeadheads = label.includes("live-paste")
  ? ["CLE-LGA/9E/5045/NONE", "MCI-SLC/DL/2903/NONE"]
  : ["CLE-LGA/9E/5045/GSWLN8", "MCI-SLC/DL/2903/GSWLN4"];
const sharedDisplayFinalArrivalAfterDh =
  parsed.deadheadAnnotations.at(-1)?.destination ?? sharedDisplaySnapshot.finalArrival;

  assert(
    JSON.stringify(sharedDisplayAllTripSegments) ===
      JSON.stringify([
        "SLC-SJC",
        "SJC-SLC",
        "SLC-CLE",
        "CLE-LGA",
        "LGA-MCI",
        "MCI-SLC",
      ]),
    `[${label}] Expected shared display model allTripSegments to match fixture, got ${sharedDisplayAllTripSegments.join(" | ")}`,
  );
  assert(
    JSON.stringify(sharedDisplayOperatingLegs) ===
      JSON.stringify(["SLC-SJC", "SJC-SLC", "SLC-CLE", "LGA-MCI"]),
    `[${label}] Expected shared display model visibleOperatingLegs SLC-SJC | SJC-SLC | SLC-CLE | LGA-MCI, got ${sharedDisplayOperatingLegs.join(" | ")}`,
  );
  assert(
    JSON.stringify(sharedDisplayDeadheads) ===
      JSON.stringify(expectedSharedDisplayDeadheads),
    `[${label}] Expected shared display model deadheads ${expectedSharedDisplayDeadheads.join(" and ")}, got ${sharedDisplayDeadheads.join(" | ")}`,
  );
  assert(
    sharedDisplaySnapshot.scheduledBlockMinutes === 662,
    `[${label}] Expected shared display model scheduled block 662, got ${sharedDisplaySnapshot.scheduledBlockMinutes}`,
  );
  assert(
    sharedDisplaySnapshot.scheduledBlockSource === "computedFromUserFacingLegs",
    `[${label}] Expected shared display model scheduledBlockSource computedFromUserFacingLegs, got ${sharedDisplaySnapshot.scheduledBlockSource}`,
  );
  assert(
    sharedDisplayPartialDiagnosis.isPartial === false,
    `[${label}] Expected shared display model partial false, got ${sharedDisplayPartialDiagnosis.isPartial}`,
  );
  assert(
    sharedDisplaySnapshot.finalArrival === "MCI",
    `[${label}] Expected shared display model final operating arrival MCI, got ${sharedDisplaySnapshot.finalArrival}`,
  );
  assert(
    sharedDisplayFinalArrivalAfterDh === "SLC",
    `[${label}] Expected shared display model final arrival after DH SLC, got ${sharedDisplayFinalArrivalAfterDh}`,
  );

  console.log(`${label} passed`);
  console.log(
    `${label} parsed:`,
    JSON.stringify(
      {
        header: parsed.header,
        visibleOperatingLegs,
        deadheadAnnotations: parsed.deadheadAnnotations,
        operatingScheduledBlockMinutes: parsed.operatingScheduledBlockMinutes,
        deadheadScheduledBlockMinutes: parsed.deadheadScheduledBlockMinutes,
        diagnostics: debugResult.diagnostics,
        sharedDisplayModel: {
          allTripSegments: sharedDisplayAllTripSegments,
          visibleOperatingLegs: sharedDisplayOperatingLegs,
          logbookLegs: sharedDisplayOperatingLegs,
          deadheadAnnotations: sharedDisplayDeadheads,
          scheduledBlockMinutes: sharedDisplaySnapshot.scheduledBlockMinutes,
          scheduledBlockSource: sharedDisplaySnapshot.scheduledBlockSource,
          partialStatus: sharedDisplayPartialDiagnosis.isPartial,
          finalOperatingArrival: sharedDisplaySnapshot.finalArrival,
          finalArrivalAfterDh: sharedDisplayFinalArrivalAfterDh,
        },
      },
      null,
      2,
    ),
  );
}

const numericFlight = parseICrewFlightToken("04", "1272");
assert(
  numericFlight.carrier === "DL" && numericFlight.flightNumber === "1272" && numericFlight.marker === null,
  `Expected 1272 => DL/1272, got ${JSON.stringify(numericFlight)}`,
);

const explicitDeadheadFlight = parseICrewFlightToken("06", "D2903");
assert(
  explicitDeadheadFlight.carrier === "DL" &&
    explicitDeadheadFlight.flightNumber === "2903" &&
    explicitDeadheadFlight.marker === "D",
  `Expected D2903 => DL/2903 marker D, got ${JSON.stringify(explicitDeadheadFlight)}`,
);

const regionalFlight = parseICrewFlightToken("06", "69E5045");
assert(
  regionalFlight.carrier === "9E" &&
    regionalFlight.flightNumber === "5045" &&
    regionalFlight.marker === null,
  `Expected 69E5045 => 9E/5045, got ${JSON.stringify(regionalFlight)}`,
);

const ooRegionalFlight = parseICrewFlightToken("06", "6OO1234");
assert(
  ooRegionalFlight.carrier === "OO" &&
    ooRegionalFlight.flightNumber === "1234" &&
    ooRegionalFlight.marker === null,
  `Expected 6OO1234 => OO/1234, got ${JSON.stringify(ooRegionalFlight)}`,
);

runICrewAssertions("rotation0233 iCrew raw-text fixture", rotation0233ICrewRawText);
runICrewAssertions("rotation0233 iCrew live-paste fixture", rotation0233ICrewLivePasteText);
