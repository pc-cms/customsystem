/**
 * Casino business day logic.
 * All time calculations use Africa/Dar_es_Salaam (EAT, UTC+3 — same as Africa/Nairobi).
 * Business-day rollover is at 07:00 EAT (matches DB business_date_of /
 * get_current_business_date / build_business_day_snapshot). Manual Cage closures
 * recorded in business_day_closures take precedence over the time-based fallback
 * via the get_current_business_date RPC.
 */

/** Get current date/time as a Date object whose LOCAL fields (getHours/getMinutes/getDate)
 *  equal EAT wall-clock fields, regardless of the browser's timezone.
 *  DO NOT call .toISOString() on the result expecting EAT;
 *  use ymdEAT() / getBusinessDate() for date strings. */
export function nowEAT(): Date {
  // en-CA gives YYYY-MM-DD, en-GB 24h time — together they form EAT wall clock.
  const d = new Date();
  const date = d.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour12: false });
  // Construct without "Z" so the values are interpreted as the browser's local time —
  // this way getHours()/getMinutes()/getDate() return the EAT wall-clock numbers.
  return new Date(`${date}T${time}`);
}

/** Current EAT calendar date as YYYY-MM-DD. */
function ymdEAT(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
}

export function getBusinessDate(shiftEndHour = 7): string {
  const now = new Date();
  // Hour in EAT regardless of browser timezone
  const eatHour = parseInt(
    now.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }),
    10
  );
  // Before fallback rollover → still the previous EAT calendar day
  const target = eatHour < shiftEndHour
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : now;
  return ymdEAT(target);
}


/**
 * Check if a given date string matches the current business day.
 */
export function isBusinessToday(date: string, shiftEndHour = 7): boolean {
  return date === getBusinessDate(shiftEndHour);
}

/**
 * Parse a time string like "05:30" into total minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Check if the current time is past the breaklist lock time for the business day.
 * The lock time is always relative to the "next morning" (e.g., 05:30 means
 * the breaklist locks at 05:30 the morning after the shift started).
 */
export function isAfterBreaklistLock(lockTime = "05:30"): boolean {
  const now = nowEAT();
  const h = now.getHours();
  const m = now.getMinutes();
  const currentMinutes = h * 60 + m;
  const lockMinutes = timeToMinutes(lockTime);

  // Lock time is in the early morning (< 12:00 = next-day lock)
  // If current time is between lockTime and shift start (~18:00), we're past the lock
  if (lockMinutes < 720) {
    // e.g., lock at 05:30 → locked if time is >= 05:30 AND < 18:00
    return currentMinutes >= lockMinutes && h < 18;
  }
  return false;
}

/**
 * Returns an ISO UTC timestamp corresponding to a wall-clock hour in EAT (UTC+3, no DST)
 * for a given business date (YYYY-MM-DD).
 *
 * Example: businessDayHourUTC("2026-05-01", 7) → "2026-05-01T04:00:00.000Z"
 */
export function businessDayHourUTC(businessDate: string, hourEAT: number): string {
  const baseUtc = new Date(`${businessDate}T00:00:00.000Z`).getTime();
  const utcTime = baseUtc + (hourEAT - 3) * 60 * 60 * 1000;
  return new Date(utcTime).toISOString();
}


/**
 * Business date (YYYY-MM-DD) of an arbitrary timestamp.
 * Africa/Dar_es_Salaam (UTC+3), rollover at 07:00 EAT. Mirrors DB `business_date_of`.
 */
export function businessDateOf(iso: string, shiftEndHour = 7): string {
  const t = new Date(iso).getTime();
  const shifted = new Date(t - shiftEndHour * 3600_000 + 3 * 3600_000);
  return shifted.toISOString().slice(0, 10);
}
