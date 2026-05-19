export function looksLikeICrewRotationText(rawText: string) {
  const normalized = rawText.replace(/\s+/g, " ").toUpperCase();
  const strongMarkers = [
    "*** ROTATION OPER",
    "REGULAR-",
    "TDHD",
    "TAFB",
    "PWA FDP/SKD MAX/ACT MAX",
    "ROT GUAR",
  ];
  const matchedMarkerCount = strongMarkers.filter((marker) => normalized.includes(marker)).length;
  const hasDayFlightHeader = /DAY\s+FLT\s+T\s+DEPARTS\s+ARRIVES/i.test(normalized);
  const hasRotationHeader = /POS-[A-Z0-9]{1,3}.*EFFECTIVE\s+[A-Z]{3}\d{2}/i.test(normalized);
  const hasCompactHeader =
    /\bPILOT\s+\d{3}\s+[A-Z]{3}\s+\d{3,4}\s+[A-Z]{1,3}\s+[A-Z]{3}\d{2}\s+CHECKIN\s+\d{4}\b/i.test(normalized);
  const hasCompactTripDatesAndTotals =
    /\bTRIP DATES\b.*\bCREDIT\b.*\bTBL\b.*\bTDHD\b/i.test(normalized);
  return (
    matchedMarkerCount >= 2 ||
    (matchedMarkerCount >= 1 && hasDayFlightHeader) ||
    (matchedMarkerCount >= 2 && hasRotationHeader) ||
    (hasCompactHeader && hasCompactTripDatesAndTotals)
  );
}
