/**
 * LIVE START — shared time-slot logic for all live-game operational modules.
 *
 * A casino/business-day has an "effective live start" (whole hour, 12:00..20:00).
 * It comes from `live_operation_start_events` (latest start/correction of the day)
 * and falls back to `casinos.shift_start`.
 *
 * Closing side of the day is unchanged: business day still rolls over at 07:00 EAT.
 */

/** Allowed opening hours for the LIVE START dropdown. */
export const LIVE_START_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
export const LIVE_START_OPTIONS = LIVE_START_HOURS.map(
  (h) => `${String(h).padStart(2, "0")}:00`,
);

export const DEFAULT_LIVE_START = "18:00";

/** Clamp any "HH:MM" to a whole hour inside 12..20. */
export function clampStartHour(hour: number): number {
  if (!Number.isFinite(hour)) return 18;
  return Math.min(20, Math.max(12, Math.floor(hour)));
}

/** Parse "HH:MM" (or "HH:MM:SS") into a whole start hour clamped to 12..20. */
export function parseStartHour(time?: string | null): number {
  if (!time) return 18;
  const h = parseInt(String(time).split(":")[0], 10);
  return clampStartHour(h);
}

/** Normalised "HH:00" label for the effective start. */
export function startLabel(time?: string | null): string {
  return `${String(parseStartHour(time)).padStart(2, "0")}:00`;
}

/**
 * Break List — 20-minute slots from the effective start through 05:40 next day.
 * `endHourExclusive` stays 30 (06:00) so the closing range never changes.
 */
export function breaklistSlots(startHour: number): string[] {
  const start = clampStartHour(startHour);
  const slots: string[] = [];
  for (let h = start; h <= 29; h++) {
    for (let m = 0; m < 60; m += 20) {
      slots.push(`${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

/**
 * Table Tracker / Numbers — hourly columns from the effective start
 * through 06:00 next day (Final).
 */
export function trackerSlots(startHour: number): string[] {
  const start = clampStartHour(startHour);
  const slots: string[] = [];
  for (let h = start; h <= 30; h++) slots.push(`${String(h % 24).padStart(2, "0")}:00`);
  return slots;
}

/** Head Count — hourly slots from the effective start through 05:00. */
export function headCountSlots(startHour: number): string[] {
  const start = clampStartHour(startHour);
  const slots: string[] = [];
  for (let h = start; h <= 29; h++) slots.push(`${String(h % 24).padStart(2, "0")}:00`);
  return slots;
}

/** True when an "HH:MM" slot belongs to the live window of the day. */
export function isInLiveHours(slot: string, startHour: number): boolean {
  const h = parseInt(slot.split(":")[0], 10);
  if (Number.isNaN(h)) return false;
  return h >= clampStartHour(startHour) || h < 7;
}

/** True when a raw hour (0..23) is inside the live window. */
export function isLiveHour(hour: number, startHour: number): boolean {
  return hour >= clampStartHour(startHour) || hour < 7;
}

/** Minutes-of-day helper for guard checks. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * True when live operations (open table / open LIVE cashdesk) are permitted
 * at `now` (EAT) for a casino whose effective start hour is `startHour`.
 * Hours before 07:00 belong to the previous business day and are always allowed.
 */
export function liveOpsAllowedAt(now: Date, startHour: number): boolean {
  if (now.getHours() < 7) return true;
  return minutesOfDay(now) >= clampStartHour(startHour) * 60;
}
