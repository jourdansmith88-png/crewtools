const AIRPORT_AREA_GROUPS = {
  NYC: ["JFK", "LGA", "EWR"],
  BAY: ["SFO", "OAK", "SJC"],
  LA: ["LAX", "BUR", "SNA", "LGB", "ONT", "SBA"],
  HOUSTON: ["IAH", "HOU"],
  DALLAS: ["DFW", "DAL"],
  DC: ["DCA", "IAD", "BWI"],
  CHICAGO: ["ORD", "MDW"],
  SOUTH_FLORIDA: ["MIA", "FLL", "PBI"],
} as const;

const AIRPORT_TO_GROUP = new Map<string, string>(
  Object.entries(AIRPORT_AREA_GROUPS).flatMap(([group, airports]) =>
    airports.map((airport) => [airport, group] as const),
  ),
);

function normalizeAirportCode(value?: string | null) {
  return (value ?? "").trim().toUpperCase();
}

export function getAirportAreaGroup(airportCode?: string | null) {
  const normalized = normalizeAirportCode(airportCode);
  return normalized ? AIRPORT_TO_GROUP.get(normalized) ?? null : null;
}

export function areAirportsInSameArea(a?: string | null, b?: string | null) {
  const normalizedA = normalizeAirportCode(a);
  const normalizedB = normalizeAirportCode(b);
  if (!normalizedA || !normalizedB) {
    return false;
  }
  if (normalizedA === normalizedB) {
    return true;
  }
  const groupA = getAirportAreaGroup(normalizedA);
  const groupB = getAirportAreaGroup(normalizedB);
  return Boolean(groupA && groupB && groupA === groupB);
}

export function describeAirportAreaTransfer(a?: string | null, b?: string | null) {
  const normalizedA = normalizeAirportCode(a);
  const normalizedB = normalizeAirportCode(b);
  if (!normalizedA || !normalizedB) {
    return null;
  }
  if (!areAirportsInSameArea(normalizedA, normalizedB) || normalizedA === normalizedB) {
    return null;
  }
  return `Airport-area transfer: ${normalizedA} -> ${normalizedB}`;
}

export { AIRPORT_AREA_GROUPS };
