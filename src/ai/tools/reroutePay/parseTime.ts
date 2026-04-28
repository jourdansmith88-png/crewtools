export function parseClockToMinutes(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseTime(value: string | undefined) {
  return parseClockToMinutes(value);
}

export function formatMinutes(value: number | undefined) {
  if (value == null) {
    return "Unknown";
  }
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function diffClockMinutes(start: string | undefined, end: string | undefined) {
  const startMinutes = parseClockToMinutes(start);
  const endMinutes = parseClockToMinutes(end);
  if (startMinutes == null || endMinutes == null) {
    return undefined;
  }
  let diff = endMinutes - startMinutes;
  if (diff < 0) {
    diff += 24 * 60;
  }
  return diff;
}
