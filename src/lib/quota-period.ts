/**
 * Quota periods follow Indonesian time (WIB, UTC+7, no DST) so "today" and
 * "this month" reset at local midnight rather than 07:00 WIB (UTC midnight).
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function startOfDayWib(now: Date = new Date()): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  return new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_OFFSET_MS,
  );
}

export function startOfMonthWib(now: Date = new Date()): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - WIB_OFFSET_MS);
}
