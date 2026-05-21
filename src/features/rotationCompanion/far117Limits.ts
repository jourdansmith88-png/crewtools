export function getUnaugmentedFlightTimeLimitMinutes(reportTime?: string | null) {
  if (!reportTime) {
    return undefined;
  }
  const digits = reportTime.replace(/\D/g, "");
  if (digits.length < 4) {
    return undefined;
  }
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return undefined;
  }
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes <= 4 * 60 + 59) {
    return 8 * 60;
  }
  if (totalMinutes <= 19 * 60 + 59) {
    return 9 * 60;
  }
  return 8 * 60;
}
