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
import { rotation0613ICrewRawText } from "./fixtures/rotation0613ICrewText.ts";
import { rotation7942ICrewRawText } from "./fixtures/rotation7942ICrewText.ts";

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
  assert(
    JSON.stringify(parsed.layoverCities) === JSON.stringify(["SJC", "CLE"]),
    `[${label}] Expected layoverCities SJC, CLE, got ${parsed.layoverCities.join(" | ")}`,
  );

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
        layoverCities: parsed.layoverCities,
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

const ooTwoDigitDayFlight = parseICrewFlightToken("12", "12OO3895");
assert(
  ooTwoDigitDayFlight.carrier === "OO" &&
    ooTwoDigitDayFlight.flightNumber === "3895" &&
    ooTwoDigitDayFlight.marker === null,
  `Expected 12OO3895 => OO/3895, got ${JSON.stringify(ooTwoDigitDayFlight)}`,
);

runICrewAssertions("rotation0233 iCrew raw-text fixture", rotation0233ICrewRawText);
runICrewAssertions("rotation0233 iCrew live-paste fixture", rotation0233ICrewLivePasteText);

{
  const label = "rotation0613 iCrew raw-text fixture";
  const debugResult = parseICrewTextWithDiagnostics(rotation0613ICrewRawText);
  assert(debugResult.parserSucceeded === true, `[${label}] Expected parserSucceeded true, got ${JSON.stringify(debugResult.diagnostics)}`);
  const parsed = parseICrewText(rotation0613ICrewRawText);

  assert(parsed.header.base === "SLC", `[${label}] Expected base SLC, got ${parsed.header.base}`);
  assert(parsed.header.fleetCategory === "PILOT 220", `[${label}] Expected fleetCategory PILOT 220, got ${parsed.header.fleetCategory}`);
  assert(parsed.header.rotationNumber === "0613", `[${label}] Expected rotationNumber 0613, got ${parsed.header.rotationNumber}`);
  assert(parsed.header.position === "A", `[${label}] Expected position A, got ${parsed.header.position}`);
  assert(parsed.header.effectiveDate === "APR12", `[${label}] Expected effectiveDate APR12, got ${parsed.header.effectiveDate}`);
  assert(parsed.header.reportTime === "1615", `[${label}] Expected reportTime 1615, got ${parsed.header.reportTime}`);
  assert(parsed.header.tripDates === "12APR - 13APR", `[${label}] Expected tripDates 12APR - 13APR, got ${parsed.header.tripDates}`);
  assert(parsed.header.totalCreditMinutes === 630, `[${label}] Expected totalCreditMinutes 630, got ${parsed.header.totalCreditMinutes}`);
  assert(parsed.header.scheduledBlockMinutes === 59, `[${label}] Expected scheduledBlockMinutes 59, got ${parsed.header.scheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes === 51, `[${label}] Expected totalDeadheadBlockMinutes 51, got ${parsed.header.totalDeadheadBlockMinutes}`);
  assert(parsed.header.tafbCredit === "15:10", `[${label}] Expected tafbCredit 15:10, got ${parsed.header.tafbCredit}`);
  assert(parsed.header.tafbElapsed === "14:51", `[${label}] Expected tafbElapsed 14:51, got ${parsed.header.tafbElapsed}`);
  assert(
    JSON.stringify(parsed.layoverCities) === JSON.stringify(["IDA"]),
    `[${label}] Expected layoverCities IDA, got ${parsed.layoverCities.join(" | ")}`,
  );

  const ooRowResult = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("12OO3895 SLC 1726 IDA.1817 0.51 0.07"),
  );
  assert(ooRowResult?.matched === true, `[${label}] Expected 12OO3895 row to parse, got ${JSON.stringify(ooRowResult)}`);
  assert(
    ooRowResult?.parsedTokens?.carrier === "OO" &&
      ooRowResult?.parsedTokens?.flightNumber === "3895" &&
      ooRowResult?.parsedTokens?.dayToken === "12",
    `[${label}] Expected 12OO3895 => OO/3895 day 12, got ${JSON.stringify(ooRowResult?.parsedTokens)}`,
  );

  const allTripSegments = parsed.allTripSegments.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport} ${leg.isDeadhead ? "DH" : "OP"} ${leg.scheduledBlock}`,
  );
  assert(
    JSON.stringify(allTripSegments) ===
      JSON.stringify([
        "SLC-IDA DH 0:51",
        "IDA-SLC OP 0:59",
      ]),
    `[${label}] Expected allTripSegments SLC-IDA DH | IDA-SLC OP, got ${allTripSegments.join(" | ")}`,
  );

  const visibleOperatingLegs = parsed.visibleOperatingLegs.map((leg) => `${leg.departureAirport}-${leg.arrivalAirport}`);
  assert(
    JSON.stringify(visibleOperatingLegs) === JSON.stringify(["IDA-SLC"]),
    `[${label}] Expected visibleOperatingLegs IDA-SLC, got ${visibleOperatingLegs.join(" | ")}`,
  );
  assert(parsed.visibleOperatingLegs.length === 1, `[${label}] Expected visibleOperatingLegs length 1, got ${parsed.visibleOperatingLegs.length}`);
  assert(parsed.deadheadAnnotations.length === 1, `[${label}] Expected deadheadAnnotations length 1, got ${parsed.deadheadAnnotations.length}`);
  assert(
    parsed.deadheadAnnotations[0]?.cityPair === "SLC-IDA" &&
      parsed.deadheadAnnotations[0]?.carrier === "OO" &&
      parsed.deadheadAnnotations[0]?.carrierName === "SkyWest Airlines" &&
      parsed.deadheadAnnotations[0]?.flightNumber === "3895" &&
      parsed.deadheadAnnotations[0]?.scheduledBlockMinutes === 51 &&
      parsed.deadheadAnnotations[0]?.reason === "inferred_from_dhd_totals_and_regional_carrier",
    `[${label}] Expected OO3895 SkyWest deadhead annotation, got ${JSON.stringify(parsed.deadheadAnnotations[0])}`,
  );
  assert(parsed.operatingScheduledBlockMinutes === 59, `[${label}] Expected operatingScheduledBlockMinutes 59, got ${parsed.operatingScheduledBlockMinutes}`);
  assert(parsed.deadheadScheduledBlockMinutes === 51, `[${label}] Expected deadheadScheduledBlockMinutes 51, got ${parsed.deadheadScheduledBlockMinutes}`);
  assert(parsed.scheduledBlockSource === "iCrewSummaryTotals", `[${label}] Expected scheduledBlockSource iCrewSummaryTotals, got ${parsed.scheduledBlockSource}`);
  assert(parsed.partialStatus === false, `[${label}] Expected partialStatus false, got ${parsed.partialStatus}`);
  assert(parsed.finalOperatingArrival === "SLC", `[${label}] Expected finalOperatingArrival SLC, got ${parsed.finalOperatingArrival}`);
  assert(parsed.finalArrivalAfterDeadhead === "SLC", `[${label}] Expected finalArrivalAfterDeadhead SLC, got ${parsed.finalArrivalAfterDeadhead}`);
  assert(parsed.header.scheduledBlockMinutes === parsed.operatingScheduledBlockMinutes, `[${label}] Expected TBL to reconcile, got ${parsed.header.scheduledBlockMinutes} vs ${parsed.operatingScheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes === parsed.deadheadScheduledBlockMinutes, `[${label}] Expected TDHD to reconcile, got ${parsed.header.totalDeadheadBlockMinutes} vs ${parsed.deadheadScheduledBlockMinutes}`);

  console.log(`${label} passed`);
  console.log(
    `${label} parsed:`,
    JSON.stringify(
      {
        header: parsed.header,
        layoverCities: parsed.layoverCities,
        visibleOperatingLegs,
        deadheadAnnotations: parsed.deadheadAnnotations,
        operatingScheduledBlockMinutes: parsed.operatingScheduledBlockMinutes,
        deadheadScheduledBlockMinutes: parsed.deadheadScheduledBlockMinutes,
        diagnostics: debugResult.diagnostics,
      },
      null,
      2,
    ),
  );
}

{
  const label = "rotation7942 iCrew raw-text fixture";
  const debugResult = parseICrewTextWithDiagnostics(rotation7942ICrewRawText);
  assert(debugResult.parserSucceeded === true, `[${label}] Expected parserSucceeded true, got ${JSON.stringify(debugResult.diagnostics)}`);
  const parsed = parseICrewText(rotation7942ICrewRawText);

  assert(parsed.header.base === "SLC", `[${label}] Expected base SLC, got ${parsed.header.base}`);
  assert(parsed.header.fleetCategory === "PILOT 220", `[${label}] Expected fleetCategory PILOT 220, got ${parsed.header.fleetCategory}`);
  assert(parsed.header.rotationNumber === "7942", `[${label}] Expected rotationNumber 7942, got ${parsed.header.rotationNumber}`);
  assert(parsed.header.position === "AB", `[${label}] Expected position AB, got ${parsed.header.position}`);
  assert(parsed.header.effectiveDate === "APR19", `[${label}] Expected effectiveDate APR19, got ${parsed.header.effectiveDate}`);
  assert(parsed.header.reportTime === "1435", `[${label}] Expected reportTime 1435, got ${parsed.header.reportTime}`);
  assert(parsed.header.tripDates === "19APR - 21APR", `[${label}] Expected tripDates 19APR - 21APR, got ${parsed.header.tripDates}`);
  assert(parsed.header.totalCreditMinutes === 961, `[${label}] Expected totalCreditMinutes 961, got ${parsed.header.totalCreditMinutes}`);
  assert(parsed.header.scheduledBlockMinutes === 876, `[${label}] Expected scheduledBlockMinutes 876, got ${parsed.header.scheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes === 0, `[${label}] Expected totalDeadheadBlockMinutes 0, got ${parsed.header.totalDeadheadBlockMinutes}`);
  assert(parsed.header.tafbCredit === "55:39", `[${label}] Expected tafbCredit 55:39, got ${parsed.header.tafbCredit}`);
  assert(parsed.header.tafbElapsed === "55:05", `[${label}] Expected tafbElapsed 55:05, got ${parsed.header.tafbElapsed}`);
  assert(
    JSON.stringify(parsed.layoverCities) === JSON.stringify(["DEN", "LGA"]),
    `[${label}] Expected layoverCities DEN, LGA, got ${parsed.layoverCities.join(" | ")}`,
  );
  assert(!parsed.layoverCities.includes("SMF"), `[${label}] Expected layoverCities not to include SMF`);
  assert(!parsed.layoverCities.includes("DFW"), `[${label}] Expected layoverCities not to include DFW`);

  const continuationResult = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("*SMF 1712 SLC.1949 1.37"),
  );
  assert(continuationResult?.matched === true, `[${label}] Expected continuation leg row to parse, got ${JSON.stringify(continuationResult)}`);
  assert(
    continuationResult?.parsedTokens?.carrier === "DL" &&
      continuationResult?.parsedTokens?.flightNumber === "1342" &&
      continuationResult?.parsedTokens?.dayToken === "19",
    `[${label}] Expected continuation leg to inherit DL1342 day 19, got ${JSON.stringify(continuationResult?.parsedTokens)}`,
  );

  const allTripSegments = parsed.allTripSegments.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport} ${leg.scheduledOut ?? "?"}-${leg.scheduledIn ?? "?"} ${leg.scheduledBlock}`,
  );
  assert(
    JSON.stringify(allTripSegments) ===
      JSON.stringify([
        "SLC-SMF 1536 19APR-1610 19APR 1:34",
        "SMF-SLC 1712 19APR-1949 19APR 1:37",
        "SLC-DEN 2056 19APR-2217 19APR 1:21",
        "DEN-LGA 1742 20APR-2320 20APR 3:38",
        "LGA-DFW 1551 21APR-1840 21APR 3:49",
        "DFW-SLC 1933 21APR-2110 21APR 2:37",
      ]),
    `[${label}] Expected parsed allTripSegments to match fixture, got ${allTripSegments.join(" | ")}`,
  );

  const visibleOperatingLegs = parsed.visibleOperatingLegs.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport}`,
  );
  assert(
    JSON.stringify(visibleOperatingLegs) ===
      JSON.stringify(["SLC-SMF", "SMF-SLC", "SLC-DEN", "DEN-LGA", "LGA-DFW", "DFW-SLC"]),
    `[${label}] Expected 6 visible operating legs, got ${visibleOperatingLegs.join(" | ")}`,
  );
  assert(parsed.visibleOperatingLegs.length === 6, `[${label}] Expected visibleOperatingLegs length 6, got ${parsed.visibleOperatingLegs.length}`);
  assert(parsed.deadheadAnnotations.length === 0, `[${label}] Expected no deadheadAnnotations, got ${parsed.deadheadAnnotations.length}`);
  assert(parsed.operatingScheduledBlockMinutes === 876, `[${label}] Expected operatingScheduledBlockMinutes 876, got ${parsed.operatingScheduledBlockMinutes}`);
  assert(parsed.deadheadScheduledBlockMinutes === 0, `[${label}] Expected deadheadScheduledBlockMinutes 0, got ${parsed.deadheadScheduledBlockMinutes}`);
  assert(parsed.scheduledBlockSource === "iCrewSummaryTotals", `[${label}] Expected scheduledBlockSource iCrewSummaryTotals, got ${parsed.scheduledBlockSource}`);
  assert(parsed.partialStatus === false, `[${label}] Expected partialStatus false, got ${parsed.partialStatus}`);
  assert(parsed.finalOperatingArrival === "SLC", `[${label}] Expected finalOperatingArrival SLC, got ${parsed.finalOperatingArrival}`);
  assert(parsed.finalArrivalAfterDeadhead === "SLC", `[${label}] Expected finalArrivalAfterDeadhead SLC, got ${parsed.finalArrivalAfterDeadhead}`);
  assert(parsed.header.scheduledBlockMinutes === parsed.operatingScheduledBlockMinutes, `[${label}] Expected TBL to reconcile, got ${parsed.header.scheduledBlockMinutes} vs ${parsed.operatingScheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes === parsed.deadheadScheduledBlockMinutes, `[${label}] Expected TDHD to reconcile, got ${parsed.header.totalDeadheadBlockMinutes} vs ${parsed.deadheadScheduledBlockMinutes}`);

  console.log(`${label} passed`);
  console.log(
    `${label} parsed:`,
    JSON.stringify(
      {
        header: parsed.header,
        layoverCities: parsed.layoverCities,
        visibleOperatingLegs,
        deadheadAnnotations: parsed.deadheadAnnotations,
        operatingScheduledBlockMinutes: parsed.operatingScheduledBlockMinutes,
        deadheadScheduledBlockMinutes: parsed.deadheadScheduledBlockMinutes,
        diagnostics: debugResult.diagnostics,
      },
      null,
      2,
    ),
  );
}
