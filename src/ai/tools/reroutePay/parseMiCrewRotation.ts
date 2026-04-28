import type { ParsedMiCrewLeg, ParsedMiCrewRotation } from "./types.ts";

function normalize(value: string | undefined) {
  return (value ?? "").replace(/\r/g, "\n");
}

function parseClockToMinutes(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseClock(value: string | undefined) {
  const match = value?.match(/\b(\d{1,2}:\d{2})\b/);
  return match?.[1];
}

function parseLegLine(line: string): ParsedMiCrewLeg | null {
  const flightMatch = line.match(/\b(?:DL|FL)?\s?(\d{2,4})\b/i);
  const cityMatch = line.match(/\b([A-Z]{3})[-\s/]+([A-Z]{3})\b/);
  const timeMatches = [...line.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((match) => match[1]);
  const deadhead = /\bDH\b|\bDEADHEAD\b/i.test(line);
  if (!flightMatch && !cityMatch) {
    return null;
  }
  return {
    flightNumber: flightMatch?.[1],
    origin: cityMatch?.[1],
    destination: cityMatch?.[2],
    departureTime: timeMatches[0],
    arrivalTime: timeMatches[1],
    blockMinutes: parseClockToMinutes(line.match(/\bblock[:\s]+(\d{1,2}:\d{2})\b/i)?.[1]),
    turnMinutes: parseClockToMinutes(line.match(/\bturn[:\s]+(\d{1,2}:\d{2})\b/i)?.[1]),
    isDeadhead: deadhead || undefined,
  };
}

export function parseMiCrewRotation(args: {
  pastedText?: string;
  screenshotMetadata?: string[];
}): ParsedMiCrewRotation {
  const source = normalize(
    [args.pastedText ?? "", ...(args.screenshotMetadata ?? [])].filter(Boolean).join("\n"),
  );
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const legs = lines
    .map((line) => parseLegLine(line))
    .filter((leg): leg is ParsedMiCrewLeg => Boolean(leg));

  const layovers = lines
    .filter((line) => /\blayover\b/i.test(line))
    .map((line) => line.replace(/^.*layover[:\s]*/i, "").trim())
    .slice(0, 4);

  const rotationNumber =
    source.match(/\brotation[:\s#]+([A-Z0-9-]{2,12})\b/i)?.[1] ??
    source.match(/\btrip[:\s#]+([A-Z0-9-]{2,12})\b/i)?.[1];
  const date = source.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/)?.[1];
  const base = source.match(/\bbase[:\s]+([A-Z]{3})\b/i)?.[1];
  const creditMinutes =
    parseClockToMinutes(source.match(/\b(?:credit|tmcr|trip credit)[:\s]+(\d{1,2}:\d{2})\b/i)?.[1]) ??
    undefined;
  const tafbMinutes = parseClockToMinutes(source.match(/\b(?:tafb|time away)[:\s]+(\d{1,2}:\d{2})\b/i)?.[1]);
  const reportTime = parseClock(source.match(/\breport[:\s]+(\d{1,2}:\d{2})\b/i)?.[1]);
  const releaseTime = parseClock(source.match(/\brelease[:\s]+(\d{1,2}:\d{2})\b/i)?.[1]);

  const missingParseItems: string[] = [];
  if (!rotationNumber) {
    missingParseItems.push("Rotation number");
  }
  if (!creditMinutes) {
    missingParseItems.push("Trip credit");
  }
  if (!reportTime || !releaseTime) {
    missingParseItems.push("Report/release");
  }
  if (legs.length === 0) {
    missingParseItems.push("Detected legs");
  }

  const parseConfidence =
    legs.length >= 2 && creditMinutes != null ? "high" : legs.length > 0 || creditMinutes != null ? "medium" : "low";

  return {
    rotationNumber,
    date,
    base,
    creditMinutes,
    tafbMinutes,
    reportTime,
    releaseTime,
    layovers,
    legs,
    parseConfidence,
    missingParseItems,
  };
}
