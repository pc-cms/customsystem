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
export type ShiftHoursScope = "pit" | "staff";

const NON_WORKING = new Set(["L", "O", "SP", "A", "S"]);

export function predictedShiftHours(shift: string | null | undefined, scope: ShiftHoursScope = "pit"): number {
  if (!shift) return 0;
  const s = shift.toUpperCase();
  if (NON_WORKING.has(s)) return 0;
  if (scope === "staff") return 8;
  if (s === "M" || s === "EM") return 11;
  if (s === "N" || s === "EN" || s === "G") return 8;
  return 9;
}
