/**
 * Predicted (planned) hours per rota shift code.
 *
 * Rota shows a FORECAST — hours derived from the planned shift.
 * Attendance shows the FACT — manually entered / auto-filled hours.
 * Mapping mirrors the attendance auto-fill rules so the forecast and
 * the fact line up when a shift is worked as planned.
 *
 * Live Game (pit):  M / EM → 11h,  N / EN / G → 8h,  other working → 9h
 * Staff:            every working shift → 8h
 * Leave (L) and Off (O) are always 0h.
 */
export type ShiftHoursScope = "pit" | "staff" | "pit_arusha" | "pit_dodoma";

const NON_WORKING = new Set(["L", "O", "SP", "A", "S"]);

/** Staff (Floor/Security/Office) shift → hours. MO 6, D 9, M 12, N 9, T (Training 09:00–15:00) 6. */
const STAFF_HOURS: Record<string, number> = {
  MO: 6,
  D: 9,
  M: 12,
  N: 9,
  T: 6,
  G: 8,
  E: 8,
  EM: 11,
  EN: 8,
};

/** Live Game Arusha grid (2026-08+): M 18:00–05:00 11h, SW 19:00–06:00 11h, N 20:00–06:00 10h. */
const PIT_ARUSHA_HOURS: Record<string, number> = {
  M: 11,
  SW: 11,
  N: 10,
  E: 11,
  EM: 11,
  ESW: 11,
  EN: 10,
  T: 6,
};

/** Live Game Dodoma grid: M 20:00–06:00 10h, N 18:00–06:00 12h. */
const PIT_DODOMA_HOURS: Record<string, number> = {
  M: 10,
  EM: 10,
  N: 12,
  EN: 12,
  SW: 10,
  ESW: 10,
  E: 10,
  G: 10,
  T: 6,
};

export function predictedShiftHours(shift: string | null | undefined, scope: ShiftHoursScope = "pit"): number {
  if (!shift) return 0;
  const s = shift.toUpperCase();
  if (NON_WORKING.has(s)) return 0;
  if (scope === "staff") return STAFF_HOURS[s] ?? 8;
  if (scope === "pit_dodoma") return PIT_DODOMA_HOURS[s] ?? 10;
  if (scope === "pit_arusha") return PIT_ARUSHA_HOURS[s] ?? 11;
  if (s === "M" || s === "EM") return 11;
  if (s === "SW" || s === "ESW") return 11;
  if (s === "N" || s === "EN" || s === "G") return 8;
  return 9;
}
