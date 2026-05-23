import type { CalendarUpdateEvent, ProjectionConfidence } from "./rotationProjection.ts";

export type ParsedICalendarEvent = {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  dtstart?: string;
  dtend?: string;
  lastModified?: string;
  sequence?: number;
  rawFields: Record<string, string>;
};

function unfoldICalendarLines(rawText: string) {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parsePropertyLine(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }
  const rawName = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const name = rawName.split(";")[0]?.toUpperCase().trim();
  if (!name) {
    return null;
  }
  return { name, value };
}

function normalizeIcsTimestamp(value?: string) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  const utcMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    const [, year, month, day, hour, minute, second] = utcMatch;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }
  const localMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const [, year, month, day, hour, minute, second] = localMatch;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }
  return trimmed || undefined;
}

function formatIcsClock(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/T(\d{2})(\d{2})/);
  if (!match) {
    return undefined;
  }
  return `${match[1]}:${match[2]}`;
}

function decodeIcsText(value?: string) {
  if (!value) {
    return "";
  }
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export function normalizeWebcalUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  try {
    if (trimmed.startsWith("webcal://")) {
      const normalized = `https://${trimmed.slice("webcal://".length)}`;
      const parsed = new URL(normalized);
      return parsed.toString();
    }
    if (trimmed.startsWith("https://")) {
      return new URL(trimmed).toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function parseICalendarFeed(rawText: string): ParsedICalendarEvent[] {
  const lines = unfoldICalendarLines(rawText);
  const events: ParsedICalendarEvent[] = [];
  let current: ParsedICalendarEvent | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.toUpperCase() === "BEGIN:VEVENT") {
      current = { rawFields: {} };
      continue;
    }
    if (line.toUpperCase() === "END:VEVENT") {
      if (current) {
        events.push(current);
      }
      current = null;
      continue;
    }
    if (!current) {
      continue;
    }

    const property = parsePropertyLine(line);
    if (!property) {
      continue;
    }

    current.rawFields[property.name] = property.value;
    switch (property.name) {
      case "UID":
        current.uid = property.value;
        break;
      case "SUMMARY":
        current.summary = decodeIcsText(property.value);
        break;
      case "DESCRIPTION":
        current.description = decodeIcsText(property.value);
        break;
      case "LOCATION":
        current.location = decodeIcsText(property.value);
        break;
      case "DTSTART":
        current.dtstart = property.value;
        break;
      case "DTEND":
        current.dtend = property.value;
        break;
      case "LAST-MODIFIED":
        current.lastModified = property.value;
        break;
      case "SEQUENCE":
        current.sequence = Number.parseInt(property.value, 10);
        break;
      default:
        break;
    }
  }

  return events;
}

function extractFlightCode(text: string) {
  const match = text
    .toUpperCase()
    .match(/\b((?:[A-Z]{2,3})|(?:\d[A-Z]))(\d{2,4})\b/);
  if (!match) {
    return { carrier: undefined, flightNumber: undefined };
  }
  return { carrier: match[1], flightNumber: match[2] };
}

function extractCityPair(text: string) {
  const normalized = text.toUpperCase();
  const match = normalized.match(/\b([A-Z]{3})\s*(?:-|->|→|TO)\s*([A-Z]{3})\b/);
  if (!match) {
    return { origin: undefined, destination: undefined };
  }
  return { origin: match[1], destination: match[2] };
}

function deriveEventConfidence(input: {
  flightNumber?: string;
  origin?: string;
  destination?: string;
  scheduledOut?: string;
  scheduledIn?: string;
}): ProjectionConfidence {
  if (input.flightNumber && input.origin && input.destination && input.scheduledOut && input.scheduledIn) {
    return "high";
  }
  if ((input.flightNumber && input.origin && input.destination) || (input.flightNumber && input.scheduledOut && input.scheduledIn)) {
    return "medium";
  }
  if (input.flightNumber || input.origin || input.destination || input.scheduledOut || input.scheduledIn) {
    return "low";
  }
  return "needs_refresh";
}

export function extractFlightEventFromCalendarEvent(event: ParsedICalendarEvent): CalendarUpdateEvent {
  const rawSummary = event.summary ?? "";
  const rawDescription = event.description ?? "";
  const rawLocation = event.location ?? "";
  const searchText = [rawSummary, rawDescription, rawLocation].filter(Boolean).join("\n");
  const { carrier, flightNumber } = extractFlightCode(searchText);
  const { origin, destination } = extractCityPair(searchText);
  const scheduledOut = formatIcsClock(event.dtstart);
  const scheduledIn = formatIcsClock(event.dtend);
  const confidence = deriveEventConfidence({ flightNumber, origin, destination, scheduledOut, scheduledIn });

  return {
    source: "calendar_sync",
    eventId: event.uid,
    uid: event.uid,
    carrier,
    flightNumber,
    origin,
    destination,
    scheduledOut,
    scheduledIn,
    occurredAt: normalizeIcsTimestamp(event.dtstart),
    receivedAt: normalizeIcsTimestamp(event.lastModified) ?? normalizeIcsTimestamp(event.dtstart),
    lastModified: normalizeIcsTimestamp(event.lastModified),
    sequence: typeof event.sequence === "number" && Number.isFinite(event.sequence) ? event.sequence : undefined,
    rawSummary,
    rawDescription,
    location: rawLocation || undefined,
    confidence,
  };
}

export function buildCalendarUpdateEvents(rawText: string) {
  return parseICalendarFeed(rawText).map(extractFlightEventFromCalendarEvent);
}
