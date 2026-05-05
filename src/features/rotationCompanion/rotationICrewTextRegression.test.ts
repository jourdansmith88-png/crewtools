import {
  computeSnapshotFromUserFacingChain,
  diagnoseScreenshotRotationPartialStatus,
  excludeDeadheadLegsFromVisibleChain,
} from "./rotationChainBuilder.ts";
import {
  parseICrewFlightToken,
  parseICrewLayoverDetails,
  parseICrewText,
  parseICrewTextWithDiagnostics,
} from "./parseICrewText.ts";
import {
  rotation0233ICrewLivePasteText,
  rotation0233ICrewRawText,
} from "./fixtures/rotation0233ICrewText.ts";
import { rotation0233ICrewPartialText } from "./fixtures/rotation0233ICrewPartialText.ts";
import { rotation0983ICrewRawText } from "./fixtures/rotation0983ICrewText.ts";
import { rotation0613ICrewRawText } from "./fixtures/rotation0613ICrewText.ts";
import { rotation7942ICrewRawText } from "./fixtures/rotation7942ICrewText.ts";
import { rotation0118ICrewRawText } from "./fixtures/rotation0118ICrewText.ts";

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

const yxRegionalFlight = parseICrewFlightToken("06", "6YX1234");
assert(
  yxRegionalFlight.carrier === "YX" &&
    yxRegionalFlight.flightNumber === "1234" &&
    yxRegionalFlight.marker === null,
  `Expected 6YX1234 => YX/1234, got ${JSON.stringify(yxRegionalFlight)}`,
);

const yxCarrierNameFixture = `
SLC   PILOT 220         *** ROTATION OPER
0999     POS-A        EFFECTIVE APR06         CHECK IN AT 10.00
ACTUAL REPORT TIME 1000
TRIP DATES                    06APR - 07APR
REGULAR- 5.00TL                      1.00TBL  0.00TBMU  1.23TDHD  0.00TDMU
RESERVE- 5.00TL                      1.00TBL  0.00TBMU  1.23TDHD  0.00TDMU
TAFB  12.00CR
TAFB  11.30EX
06YX1234 SLC 1200 BOI.1323 1.23
BOI 10.00/HOTEL TEST
07  1DL9999   BOI0800   SLC.0900   1.00BL
06 TOTAL 0.00BL 1.23DHD
`.trim();

const yxCarrierNameParsed = parseICrewText(yxCarrierNameFixture);
assert(
  yxCarrierNameParsed.deadheadAnnotations[0]?.carrier === "YX" &&
    yxCarrierNameParsed.deadheadAnnotations[0]?.carrierName === "Republic Airways" &&
    yxCarrierNameParsed.deadheadAnnotations[0]?.reason ===
      "inferred_from_dhd_totals_and_regional_carrier",
  `Expected YX regional carrier mapping to Republic Airways with DHD-supported classification, got ${JSON.stringify(
    yxCarrierNameParsed.deadheadAnnotations[0],
  )}`,
);
assert(
  JSON.stringify(
    yxCarrierNameParsed.visibleOperatingLegs.map(
      (leg) => `${leg.departureAirport}-${leg.arrivalAirport}`,
    ),
  ) === JSON.stringify(["BOI-SLC"]),
  `Expected YX fixture to keep only BOI-SLC as operating, got ${yxCarrierNameParsed.visibleOperatingLegs
    .map((leg) => `${leg.departureAirport}-${leg.arrivalAirport}`)
    .join(" | ")}`,
);

runICrewAssertions("rotation0233 iCrew raw-text fixture", rotation0233ICrewRawText);
runICrewAssertions("rotation0233 iCrew live-paste fixture", rotation0233ICrewLivePasteText);

{
  const label = "rotation0233 iCrew partial-text fixture";
  const debugResult = parseICrewTextWithDiagnostics(rotation0233ICrewPartialText);
  assert(
    debugResult.parserSucceeded === true,
    `[${label}] Expected parserSucceeded true, got ${JSON.stringify(debugResult.diagnostics)}`,
  );
  const parsed = parseICrewText(rotation0233ICrewPartialText);

  assert(parsed.header.rotationNumber === "0233", `[${label}] Expected rotationNumber 0233, got ${parsed.header.rotationNumber}`);
  assert(parsed.header.base === "SLC", `[${label}] Expected base SLC, got ${parsed.header.base}`);
  assert(parsed.header.tripDates === "04APR - 06APR", `[${label}] Expected tripDates 04APR - 06APR, got ${parsed.header.tripDates}`);
  assert(parsed.header.totalCreditMinutes == null, `[${label}] Expected totalCreditMinutes null, got ${parsed.header.totalCreditMinutes}`);
  assert(parsed.header.scheduledBlockMinutes == null, `[${label}] Expected scheduledBlockMinutes null, got ${parsed.header.scheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes == null, `[${label}] Expected totalDeadheadBlockMinutes null, got ${parsed.header.totalDeadheadBlockMinutes}`);
  assert(parsed.header.tafbCredit == null, `[${label}] Expected tafbCredit null, got ${parsed.header.tafbCredit}`);
  assert(parsed.header.tafbElapsed == null, `[${label}] Expected tafbElapsed null, got ${parsed.header.tafbElapsed}`);

  const parsedSegments = parsed.normalizedCandidates.map(
    (segment) => `${segment.departureAirport}-${segment.arrivalAirport} ${segment.carrier}${segment.flightNumber} ${segment.scheduledBlock}`,
  );
  assert(
    JSON.stringify(parsedSegments) ===
      JSON.stringify([
        "SLC-SJC DL1272 2:02",
        "SJC-SLC DL1254 1:48",
        "SLC-CLE DL2855 3:18",
        "CLE-LGA 9E5045 1:23",
      ]),
    `[${label}] Expected complete parsed segments through CLE-LGA, got ${parsedSegments.join(" | ")}`,
  );

  assert(
    JSON.stringify(parsed.incompleteFragments) ===
      JSON.stringify(["06 563 LGA 1628 MCI.1922 * 3.5"]),
    `[${label}] Expected truncated 563 row in incompleteFragments, got ${parsed.incompleteFragments.join(" | ")}`,
  );

  assert(
    parsed.deadheadAnnotations.length === 0,
    `[${label}] Expected no confirmed deadheadAnnotations without DHD totals, got ${JSON.stringify(parsed.deadheadAnnotations)}`,
  );
  assert(parsed.partialStatus === true, `[${label}] Expected partialStatus true, got ${parsed.partialStatus}`);
  assert(
    parsed.partialReason === "Partial iCrew text detected. Please paste the full rotation text.",
    `[${label}] Expected exact partialReason copy, got ${parsed.partialReason}`,
  );
  assert(
    parsed.scheduledBlockSource === "computedFromPartialICrewLegs",
    `[${label}] Expected scheduledBlockSource computedFromPartialICrewLegs, got ${parsed.scheduledBlockSource}`,
  );
  assert(
    parsed.operatingScheduledBlockMinutes === 511,
    `[${label}] Expected computed operatingScheduledBlockMinutes 511, got ${parsed.operatingScheduledBlockMinutes}`,
  );
  assert(
    parsed.deadheadScheduledBlockMinutes === 0,
    `[${label}] Expected deadheadScheduledBlockMinutes 0, got ${parsed.deadheadScheduledBlockMinutes}`,
  );
  assert(
    parsed.parserNotes.some((note) => /did not include summary totals/i.test(note)),
    `[${label}] Expected parserNotes to mention missing totals, got ${JSON.stringify(parsed.parserNotes)}`,
  );
  assert(
    parsed.parserNotes.some((note) => /incomplete leg row/i.test(note)),
    `[${label}] Expected parserNotes to mention incomplete leg rows, got ${JSON.stringify(parsed.parserNotes)}`,
  );
  assert(
    parsed.parserNotes.some((note) => /Regional\/offline carrier segments were preserved/i.test(note)),
    `[${label}] Expected parserNotes to mention unresolved regional carrier evidence, got ${JSON.stringify(parsed.parserNotes)}`,
  );

  const truncatedAttempt = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("06 563 LGA 1628 MCI.1922 * 3.5"),
  );
  assert(
    truncatedAttempt?.matched === false && truncatedAttempt?.failureReason === "missing_block_token",
    `[${label}] Expected truncated 563 row to fail with missing_block_token, got ${JSON.stringify(truncatedAttempt)}`,
  );

  console.log(`${label} passed`);
  console.log(
    `${label} parsed:`,
    JSON.stringify(
      {
        header: parsed.header,
        parsedSegments,
        incompleteFragments: parsed.incompleteFragments,
        partialStatus: parsed.partialStatus,
        partialReason: parsed.partialReason,
        parserNotes: parsed.parserNotes,
        diagnostics: debugResult.diagnostics,
      },
      null,
      2,
    ),
  );
}

{
  const label = "rotation0983 iCrew raw-text fixture";
  const debugResult = parseICrewTextWithDiagnostics(rotation0983ICrewRawText);
  assert(debugResult.parserSucceeded === true, `[${label}] Expected parserSucceeded true, got ${JSON.stringify(debugResult.diagnostics)}`);
  const parsed = parseICrewText(rotation0983ICrewRawText);

  assert(parsed.header.rotationNumber === "0983", `[${label}] Expected rotationNumber 0983, got ${parsed.header.rotationNumber}`);
  assert(parsed.header.base === "SLC", `[${label}] Expected base SLC, got ${parsed.header.base}`);
  assert(parsed.header.effectiveDate === "MAR17", `[${label}] Expected effectiveDate MAR17, got ${parsed.header.effectiveDate}`);
  assert(parsed.header.reportTime === "1326", `[${label}] Expected reportTime 1326, got ${parsed.header.reportTime}`);
  assert(parsed.header.tripDates === "17MAR - 20MAR", `[${label}] Expected tripDates 17MAR - 20MAR, got ${parsed.header.tripDates}`);
  assert(parsed.header.totalCreditMinutes === 1315, `[${label}] Expected totalCreditMinutes 1315, got ${parsed.header.totalCreditMinutes}`);
  assert(parsed.header.scheduledBlockMinutes === 1035, `[${label}] Expected scheduledBlockMinutes 1035, got ${parsed.header.scheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes === 194, `[${label}] Expected totalDeadheadBlockMinutes 194, got ${parsed.header.totalDeadheadBlockMinutes}`);
  assert(
    JSON.stringify(parsed.layoverCities) === JSON.stringify(["DTW", "BOS", "MSP"]),
    `[${label}] Expected layoverCities DTW, BOS, MSP, got ${parsed.layoverCities.join(" | ")}`,
  );

  const rduTurnResult = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("18 2393 RDU*1931 RDU.1953 0.22 1.48"),
  );
  assert(rduTurnResult?.matched === true, `[${label}] Expected RDU*1931 return-to-gate row to parse, got ${JSON.stringify(rduTurnResult)}`);
  assert(
    rduTurnResult?.parsedTokens?.departureAirport === "RDU" &&
      rduTurnResult?.parsedTokens?.departureTime === "1931" &&
      rduTurnResult?.parsedTokens?.arrivalAirport === "RDU" &&
      rduTurnResult?.parsedTokens?.arrivalTime === "1953" &&
      rduTurnResult?.parsedTokens?.blockToken === "0.22" &&
      rduTurnResult?.parsedTokens?.turnToken === "1.48" &&
      rduTurnResult?.parsedTokens?.segmentType === "return_to_gate",
    `[${label}] Expected RDU*1931 parsed tokens with return_to_gate metadata, got ${JSON.stringify(rduTurnResult?.parsedTokens)}`,
  );

  const continuationResult = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("RDU 2141 BOS.2339 1.58 0.04"),
  );
  assert(continuationResult?.matched === true, `[${label}] Expected RDU-BOS continuation row to parse, got ${JSON.stringify(continuationResult)}`);
  assert(
    continuationResult?.parsedTokens?.carrier === "DL" &&
      continuationResult?.parsedTokens?.flightNumber === "2393" &&
      continuationResult?.parsedTokens?.dayToken === "18",
    `[${label}] Expected continuation row to inherit DL2393 on day 18, got ${JSON.stringify(continuationResult?.parsedTokens)}`,
  );

  const allTripSegments = parsed.allTripSegments.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport} ${leg.date} ${leg.isDeadhead ? "DH" : leg.segmentType === "return_to_gate" ? "RTG" : "OP"} ${leg.scheduledBlock}`,
  );
  assert(
    JSON.stringify(allTripSegments) ===
      JSON.stringify([
        "SLC-DTW 17MAR DH 3:14",
        "DTW-MSP 18MAR OP 2:04",
        "MSP-RDU 18MAR OP 2:18",
        "RDU-RDU 18MAR RTG 0:22",
        "RDU-BOS 18MAR OP 1:58",
        "BOS-RDU 19MAR OP 1:51",
        "RDU-MSP 19MAR OP 2:56",
        "MSP-SAT 20MAR OP 2:49",
        "SAT-SLC 20MAR OP 2:57",
      ]),
    `[${label}] Expected parsed allTripSegments to match fixture, got ${allTripSegments.join(" | ")}`,
  );

  const visibleOperatingLegs = parsed.visibleOperatingLegs.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport} ${leg.segmentType === "return_to_gate" ? "RTG" : "OP"}`,
  );
  assert(
    JSON.stringify(visibleOperatingLegs) ===
      JSON.stringify([
        "DTW-MSP OP",
        "MSP-RDU OP",
        "RDU-RDU RTG",
        "RDU-BOS OP",
        "BOS-RDU OP",
        "RDU-MSP OP",
        "MSP-SAT OP",
        "SAT-SLC OP",
      ]),
    `[${label}] Expected visibleOperatingLegs through SAT-SLC with RDU-RDU return_to_gate, got ${visibleOperatingLegs.join(" | ")}`,
  );
  assert(parsed.deadheadAnnotations.length === 1, `[${label}] Expected deadheadAnnotations length 1, got ${parsed.deadheadAnnotations.length}`);
  assert(
    parsed.deadheadAnnotations[0]?.cityPair === "SLC-DTW" &&
      parsed.deadheadAnnotations[0]?.carrier === "DL" &&
      parsed.deadheadAnnotations[0]?.flightNumber === "2244" &&
      parsed.deadheadAnnotations[0]?.reason === "explicit_D_marker",
    `[${label}] Expected D2244 deadhead annotation, got ${JSON.stringify(parsed.deadheadAnnotations[0])}`,
  );

  assert(parsed.operatingScheduledBlockMinutes === 1035, `[${label}] Expected operatingScheduledBlockMinutes 1035, got ${parsed.operatingScheduledBlockMinutes}`);
  assert(parsed.deadheadScheduledBlockMinutes === 194, `[${label}] Expected deadheadScheduledBlockMinutes 194, got ${parsed.deadheadScheduledBlockMinutes}`);
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
        allTripSegments,
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
  assert(
    parsed.layoverDetails[0]?.city === "IDA" &&
      parsed.layoverDetails[0]?.hotelName === "Hilton Garden Inn" &&
      parsed.layoverDetails[0]?.hotelPhone === "208-522-9500" &&
      parsed.layoverDetails[0]?.transportProvider === "Hilton Garden Inn" &&
      parsed.layoverDetails[0]?.transportType === "ccar" &&
      parsed.layoverDetails[0]?.transportPhone === "11111111111" &&
      parsed.layoverDetails[0]?.pickup === "Outside baggage claim",
    `[${label}] Expected rich layover detail mapping for IDA, got ${JSON.stringify(parsed.layoverDetails[0])}`,
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

  const yxNonDeadheadToken = parseICrewFlightToken("06", "6YX1234");
  assert(
    yxNonDeadheadToken.carrier === "YX" &&
      yxNonDeadheadToken.flightNumber === "1234" &&
      yxNonDeadheadToken.marker === null,
    `[${label}] Expected YX token support to parse without implicit deadhead classification, got ${JSON.stringify(yxNonDeadheadToken)}`,
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
        layoverDetails: parsed.layoverDetails,
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
  const label = "iCrew layover transport classification";
  const layoverDetails = parseICrewLayoverDetails(`
ABC - HOTEL - Test Hotel     208-555-1111
      TRANSPORTATION - SKYHOP GLOBAL 954-573-2727
      LIMO 954-573-2727
XYZ - HOTEL - Another Hotel     303-555-2222
      TRANSPORTATION - Hotel Shuttle
      CCAR 11111111111
`.trim());

  const skyhopDetail = layoverDetails.find((detail) => detail.city === "ABC");
  const ccarDetail = layoverDetails.find((detail) => detail.city === "XYZ");

  assert(
    skyhopDetail?.transportType === "skyhop" &&
      skyhopDetail.transportProvider === "SkyHop Global" &&
      skyhopDetail.transportPhone === "954-573-2727",
    `[${label}] Expected SKYHOP transport classification, got ${JSON.stringify(skyhopDetail)}`,
  );
  assert(
    ccarDetail?.transportType === "ccar" &&
      ccarDetail.transportProvider === "Hotel Shuttle" &&
      ccarDetail.transportPhone === "11111111111",
    `[${label}] Expected CCAR transport classification without SkyHop promotion, got ${JSON.stringify(ccarDetail)}`,
  );

  console.log(`${label} passed`);
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
  assert(
    parsed.layoverDetails[0]?.hotelName === "LEMERIDIEN AC HOTEL" &&
      parsed.layoverDetails[1]?.hotelName === "DOUBLETREE LGA",
    `[${label}] Expected DEN/LGA layover hotel details, got ${JSON.stringify(parsed.layoverDetails)}`,
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
  assert(
    continuationResult?.parsedTokens?.makeUpToken === "0.09" &&
      continuationResult?.parsedTokens?.turnToken === "1.07",
    `[${label}] Expected continuation leg to separate M/U 0.09 from TURN 1.07, got ${JSON.stringify(continuationResult?.parsedTokens)}`,
  );

  const firstLeg = parsed.allTripSegments[0];
  const continuationLeg = parsed.allTripSegments[1];
  const denLgaLeg = parsed.allTripSegments[3];
  const lgaDfwLeg = parsed.allTripSegments[4];
  assert(firstLeg?.scheduledBlock === "1:34", `[${label}] Expected first leg block 1:34, got ${firstLeg?.scheduledBlock}`);
  assert(continuationLeg?.turn === "1:07", `[${label}] Expected SMF-SLC turn 1:07, got ${continuationLeg?.turn}`);
  assert(denLgaLeg?.turn == null, `[${label}] Expected DEN-LGA turn null, got ${denLgaLeg?.turn}`);
  assert(lgaDfwLeg?.turn === null || lgaDfwLeg?.turn === "0:53", `[${label}] Expected LGA-DFW turn to preserve true TURN when available, got ${lgaDfwLeg?.turn}`);

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

{
  const label = "rotation0118 iCrew raw-text fixture";
  const debugResult = parseICrewTextWithDiagnostics(rotation0118ICrewRawText);
  assert(debugResult.parserSucceeded === true, `[${label}] Expected parserSucceeded true, got ${JSON.stringify(debugResult.diagnostics)}`);
  const parsed = parseICrewText(rotation0118ICrewRawText);

  assert(parsed.header.rotationNumber === "0118", `[${label}] Expected rotationNumber 0118, got ${parsed.header.rotationNumber}`);
  assert(parsed.header.base === "SLC", `[${label}] Expected base SLC, got ${parsed.header.base}`);
  assert(parsed.header.position === "A", `[${label}] Expected position A, got ${parsed.header.position}`);
  assert(parsed.header.effectiveDate === "MAY02", `[${label}] Expected effectiveDate MAY02, got ${parsed.header.effectiveDate}`);
  assert(parsed.header.tripDates === "02MAY - 04MAY", `[${label}] Expected tripDates 02MAY - 04MAY, got ${parsed.header.tripDates}`);
  assert(parsed.header.totalCreditMinutes === 945, `[${label}] Expected totalCreditMinutes 945, got ${parsed.header.totalCreditMinutes}`);
  assert(parsed.header.scheduledBlockMinutes === 565, `[${label}] Expected scheduledBlockMinutes 565, got ${parsed.header.scheduledBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockMinutes === 120, `[${label}] Expected totalDeadheadBlockMinutes 120, got ${parsed.header.totalDeadheadBlockMinutes}`);
  assert(parsed.header.totalDeadheadBlockSource === "summedDhdLines", `[${label}] Expected totalDeadheadBlockSource summedDhdLines, got ${parsed.header.totalDeadheadBlockSource}`);
  assert(parsed.header.tafbCredit === "47:11", `[${label}] Expected TAFB credit 47:11, got ${parsed.header.tafbCredit}`);
  assert(
    parsed.layoverDetails.some((detail) => detail.city === "DFW" && detail.hotelName === "HOTEL DFW") &&
      parsed.layoverDetails.some((detail) => detail.city === "BUR" && detail.hotelName === "HOTEL BURBANK"),
    `[${label}] Expected DFW and BUR layover details to be captured, got ${JSON.stringify(parsed.layoverDetails)}`,
  );
  assert(
    debugResult.diagnostics.parsedTotals?.totalDeadheadBlockMinutes === 120,
    `[${label}] Expected diagnostics totalDeadheadBlockMinutes 120 from summed day DHD lines, got ${debugResult.diagnostics.parsedTotals?.totalDeadheadBlockMinutes}`,
  );
  assert(
    debugResult.diagnostics.parsedTotals?.totalDeadheadBlockSource === "summedDhdLines",
    `[${label}] Expected diagnostics totalDeadheadBlockSource summedDhdLines, got ${debugResult.diagnostics.parsedTotals?.totalDeadheadBlockSource}`,
  );

  const allTripSegments = parsed.allTripSegments.map(
    (leg) => `${leg.departureAirport}-${leg.arrivalAirport} ${leg.date} ${leg.isDeadhead ? "DH" : "OP"} ${leg.scheduledBlock}`,
  );
  assert(
    JSON.stringify(allTripSegments) ===
      JSON.stringify([
        "SLC-DFW 02MAY OP 2:30",
        "DFW-SEA 03MAY OP 4:14",
        "SEA-SNA 03MAY OP 2:41",
        "BUR-SLC 04MAY DH 2:00",
      ]),
    `[${label}] Expected parsed allTripSegments to match fixture, got ${allTripSegments.join(" | ")}`,
  );

  const row2796 = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("2 2796 SLC 1759 DFW 2129 2.30 0.08 221"),
  );
  assert(
    parsed.allTripSegments[0]?.flightNumber === "2796" &&
      parsed.visibleOperatingLegs[0]?.flightNumber === "2796",
    `[${label}] Expected first flight number to stay 2796, got ${parsed.allTripSegments[0]?.flightNumber} / ${parsed.visibleOperatingLegs[0]?.flightNumber}`,
  );

  assert(
    row2796?.matched === true &&
      row2796?.parsedTokens?.flightNumber === "2796" &&
      row2796?.parsedTokens?.arrivalAirport === "DFW" &&
      row2796?.parsedTokens?.arrivalTime === "2129" &&
      row2796?.parsedTokens?.makeUpToken === "0.08" &&
      row2796?.parsedTokens?.turnToken == null &&
      row2796?.parsedTokens?.equipmentShip === "221",
    `[${label}] Expected 2796 split-arrival row to parse correctly, got ${JSON.stringify(row2796)}`,
  );

  const row803 = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("3 803 *DFW 1627 SEA 1841 4.14 0.09 0.59M"),
  );
  assert(
    row803?.matched === true &&
      row803?.parsedTokens?.departureAirport === "DFW" &&
      row803?.parsedTokens?.arrivalAirport === "SEA" &&
      row803?.parsedTokens?.makeUpToken === "0.09" &&
      row803?.parsedTokens?.turnToken === "0.59" &&
      row803?.parsedTokens?.mealMarker === "M",
    `[${label}] Expected 803 star-airport row to parse correctly, got ${JSON.stringify(row803)}`,
  );

  const row1105 = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("1105 SEA 1940 SNA 2221 2.41 0.07"),
  );
  assert(
    row1105?.matched === true &&
      row1105?.parsedTokens?.dayToken === "03" &&
      row1105?.parsedTokens?.carrier === "DL" &&
      row1105?.parsedTokens?.flightNumber === "1105" &&
      row1105?.parsedTokens?.arrivalAirport === "SNA" &&
      row1105?.parsedTokens?.arrivalTime === "2221" &&
      row1105?.parsedTokens?.makeUpToken === "0.07" &&
      row1105?.parsedTokens?.turnToken == null,
    `[${label}] Expected 1105 continuation row to inherit day and parse correctly, got ${JSON.stringify(row1105)}`,
  );

  const row828 = debugResult.diagnostics.attemptedLegParseResults.find((item) =>
    item.line.includes("4 D 828 BUR 1240 SLC 1540 2.00 223"),
  );
  assert(
    row828?.matched === true &&
      row828?.parsedTokens?.carrier === "DL" &&
      row828?.parsedTokens?.flightNumber === "828" &&
      row828?.parsedTokens?.arrivalAirport === "SLC" &&
      row828?.parsedTokens?.arrivalTime === "1540" &&
      row828?.parsedTokens?.blockToken === "2.00",
    `[${label}] Expected separated D-marker row to parse correctly, got ${JSON.stringify(row828)}`,
  );

  assert(parsed.deadheadAnnotations.length === 1, `[${label}] Expected 1 deadhead annotation, got ${parsed.deadheadAnnotations.length}`);
  assert(
    parsed.deadheadAnnotations[0]?.cityPair === "BUR-SLC" &&
      parsed.deadheadAnnotations[0]?.flightNumber === "828" &&
      parsed.deadheadAnnotations[0]?.reason === "explicit_D_marker",
    `[${label}] Expected BUR-SLC explicit D-marker deadhead, got ${JSON.stringify(parsed.deadheadAnnotations[0])}`,
  );
  assert(parsed.visibleOperatingLegs.length === 3, `[${label}] Expected 3 operating legs, got ${parsed.visibleOperatingLegs.length}`);
  assert(parsed.operatingScheduledBlockMinutes === 565, `[${label}] Expected operating block 565, got ${parsed.operatingScheduledBlockMinutes}`);
  assert(parsed.deadheadScheduledBlockMinutes === 120, `[${label}] Expected deadhead block 120, got ${parsed.deadheadScheduledBlockMinutes}`);
  assert(parsed.partialStatus === false, `[${label}] Expected partialStatus false, got ${parsed.partialStatus}`);
  assert(
    !parsed.parserNotes.some((note) => note.includes("missing summary totals") || note.includes("totalDeadheadBlock")),
    `[${label}] Expected parserNotes not to claim totalDeadheadBlock is missing, got ${JSON.stringify(parsed.parserNotes)}`,
  );
  assert(
    parsed.parserNotes.includes("Deadhead total recovered from day-level DHD lines."),
    `[${label}] Expected summedDhdLines recovery note, got ${JSON.stringify(parsed.parserNotes)}`,
  );
  assert(parsed.scheduledBlockSource === "iCrewSummaryTotals", `[${label}] Expected scheduledBlockSource iCrewSummaryTotals, got ${parsed.scheduledBlockSource}`);
  assert(
    parsed.parserNotes.some((note) => note.includes("Route continuity warning")),
    `[${label}] Expected non-blocking route continuity warning, got ${JSON.stringify(parsed.parserNotes)}`,
  );

  console.log(`${label} passed`);
  console.log(
    `${label} parsed:`,
    JSON.stringify(
      {
        header: parsed.header,
        allTripSegments,
        visibleOperatingLegs: parsed.visibleOperatingLegs.map(
          (leg) => `${leg.departureAirport}-${leg.arrivalAirport}`,
        ),
        deadheadAnnotations: parsed.deadheadAnnotations,
        parserNotes: parsed.parserNotes,
      },
      null,
      2,
    ),
  );
}

{
  const label = "iCrew post-BLK token parsing";
  const representativeText = [
    "SLC   PILOT 220         *** ROTATION OPER",
    "9999     POS-A        EFFECTIVE APR19         CHECK IN AT 14.35",
    "ACTUAL REPORT TIME 1435",
    "TRIP DATES                    19APR - 21APR",
    "REGULAR- 10.00TL                      8.01TBL  0.24TBMU  0.53TDHD  0.00TDMU",
    "RESERVE- 10.00TL                      8.01TBL  0.24TBMU  0.53TDHD  0.00TDMU",
    "TAFB  10.00CR",
    "TAFB  10.00EX",
    "19  1342  SLC 1536 SMF.1610 * 1.34 0.14 1.02 8142",
    "20  716 *DEN 1742 LGA.2320 3.38 0.10 8337",
    "21  846 LGA 1551 DFW.1840 3.49 0.21 0.53M8310",
  ].join("\n");
  const debugResult = parseICrewTextWithDiagnostics(representativeText);
  assert(debugResult.parserSucceeded === true, `[${label}] Expected parserSucceeded true, got ${JSON.stringify(debugResult.diagnostics)}`);
  const [firstRow, secondRow, thirdRow] = debugResult.diagnostics.attemptedLegParseResults.filter((item) => item.matched);
  assert(
    firstRow?.parsedTokens?.carrier === "DL" &&
      firstRow?.parsedTokens?.flightNumber === "1342" &&
      firstRow?.parsedTokens?.blockToken === "1.34" &&
      firstRow?.parsedTokens?.makeUpToken === "0.14" &&
      firstRow?.parsedTokens?.turnToken === "1.02" &&
      firstRow?.parsedTokens?.equipmentShip === "8142",
    `[${label}] Expected 1342 row to parse BLK/M-U/TURN/EQP correctly, got ${JSON.stringify(firstRow?.parsedTokens)}`,
  );
  assert(
    secondRow?.parsedTokens?.carrier === "DL" &&
      secondRow?.parsedTokens?.flightNumber === "716" &&
      secondRow?.parsedTokens?.blockToken === "3.38" &&
      secondRow?.parsedTokens?.makeUpToken === "0.10" &&
      secondRow?.parsedTokens?.turnToken == null &&
      secondRow?.parsedTokens?.equipmentShip === "8337",
    `[${label}] Expected 716 row to keep M/U and omit TURN, got ${JSON.stringify(secondRow?.parsedTokens)}`,
  );
  assert(
    thirdRow?.parsedTokens?.carrier === "DL" &&
      thirdRow?.parsedTokens?.flightNumber === "846" &&
      thirdRow?.parsedTokens?.blockToken === "3.49" &&
      thirdRow?.parsedTokens?.makeUpToken === "0.21" &&
      thirdRow?.parsedTokens?.turnToken === "0.53" &&
      thirdRow?.parsedTokens?.mealMarker === "M" &&
      thirdRow?.parsedTokens?.equipmentShip === "8310",
    `[${label}] Expected 846 row to parse TURN+meal+EQP correctly, got ${JSON.stringify(thirdRow?.parsedTokens)}`,
  );
  console.log(`${label} passed`);
}
