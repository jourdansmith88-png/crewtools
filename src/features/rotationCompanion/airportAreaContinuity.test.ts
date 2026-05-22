import {
  areAirportsInSameArea,
  describeAirportAreaTransfer,
  getAirportAreaGroup,
} from "./airportAreaContinuity.ts";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(getAirportAreaGroup("JFK") === "NYC", "Expected JFK to map to NYC");
assert(getAirportAreaGroup("LGA") === "NYC", "Expected LGA to map to NYC");
assert(getAirportAreaGroup("EWR") === "NYC", "Expected EWR to map to NYC");
assert(getAirportAreaGroup("SFO") === "BAY", "Expected SFO to map to BAY");
assert(getAirportAreaGroup("OAK") === "BAY", "Expected OAK to map to BAY");
assert(getAirportAreaGroup("SJC") === "BAY", "Expected SJC to map to BAY");
assert(getAirportAreaGroup("LAX") === "LA", "Expected LAX to map to LA");
assert(getAirportAreaGroup("BUR") === "LA", "Expected BUR to map to LA");
assert(getAirportAreaGroup("SNA") === "LA", "Expected SNA to map to LA");
assert(getAirportAreaGroup("LGB") === "LA", "Expected LGB to map to LA");
assert(getAirportAreaGroup("ONT") === "LA", "Expected ONT to map to LA");
assert(getAirportAreaGroup("SBA") === "LA", "Expected SBA to map to LA");
assert(getAirportAreaGroup("IAH") === "HOUSTON", "Expected IAH to map to HOUSTON");
assert(getAirportAreaGroup("HOU") === "HOUSTON", "Expected HOU to map to HOUSTON");
assert(getAirportAreaGroup("DFW") === "DALLAS", "Expected DFW to map to DALLAS");
assert(getAirportAreaGroup("DAL") === "DALLAS", "Expected DAL to map to DALLAS");
assert(getAirportAreaGroup("DCA") === "DC", "Expected DCA to map to DC");
assert(getAirportAreaGroup("IAD") === "DC", "Expected IAD to map to DC");
assert(getAirportAreaGroup("BWI") === "DC", "Expected BWI to map to DC");
assert(getAirportAreaGroup("ORD") === "CHICAGO", "Expected ORD to map to CHICAGO");
assert(getAirportAreaGroup("MDW") === "CHICAGO", "Expected MDW to map to CHICAGO");
assert(getAirportAreaGroup("MIA") === "SOUTH_FLORIDA", "Expected MIA to map to SOUTH_FLORIDA");
assert(getAirportAreaGroup("FLL") === "SOUTH_FLORIDA", "Expected FLL to map to SOUTH_FLORIDA");
assert(getAirportAreaGroup("PBI") === "SOUTH_FLORIDA", "Expected PBI to map to SOUTH_FLORIDA");

assert(areAirportsInSameArea("LGA", "JFK"), "Expected LGA/JFK to match");
assert(areAirportsInSameArea("SFO", "SJC"), "Expected SFO/SJC to match");
assert(!areAirportsInSameArea("LGA", "DTW"), "Expected LGA/DTW not to match");
assert(!areAirportsInSameArea("SFO", "SLC"), "Expected SFO/SLC not to match");

assert(
  describeAirportAreaTransfer("LGA", "JFK") === "Airport-area transfer: LGA -> JFK",
  "Expected transfer description for LGA -> JFK",
);
assert(
  describeAirportAreaTransfer("LGA", "DTW") === null,
  "Expected no transfer description for unrelated airports",
);

console.log("airport area continuity passed");
