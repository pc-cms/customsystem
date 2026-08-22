/**
 * CONTROL ROOM LAB — number/format rules (isolated from production formatters).
 *
 *  - Full numeric format, ASCII space as thousand separator: `1 250 000`.
 *  - Negative: `-1 250 000`.
 *  - `0` when a known/calculated amount is exactly zero.
 *  - `·` only when there is no event / no record / not applicable (null | undefined).
 *  - Percentages: one decimal (`12.4%`); missing denominator → `·`.
 */

export const NO_DATA = "·";

const groupInt = (n: number): string => {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  const s = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return neg ? `-${s}` : s;
};

/** Known amount → grouped integer. `null`/`undefined`/NaN → `·`. */
export const amount = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return NO_DATA;
  return groupInt(Number(n));
};

/** Same as `amount` but keeps `n` decimals (used for cent-level wallet figures). */
export const amountDec = (n: number | null | undefined, decimals = 2): string => {
  if (n == null || !Number.isFinite(Number(n))) return NO_DATA;
  const v = Number(n);
  const neg = v < 0;
  const abs = Math.abs(v);
  const int = Math.floor(abs);
  const frac = abs - int;
  const fracStr = decimals > 0 ? "." + frac.toFixed(decimals).slice(2) : "";
  return `${neg ? "-" : ""}${groupInt(int)}${fracStr}`;
};

/** Signed amount: `+1 250 000` / `-1 250 000` / `0`. */
export const signed = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return NO_DATA;
  const v = Number(n);
  if (Math.round(v) === 0) return "0";
  return `${v > 0 ? "+" : ""}${groupInt(v)}`;
};

/** Percentage with one decimal. `null` (no denominator) → `·`. */
export const percent = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(Number(v))) return NO_DATA;
  return `${Number(v).toFixed(1)}%`;
};

/** hold = result / drop * 100, `null` when drop is not a usable denominator. */
export const holdOf = (result: number, drop: number): number | null =>
  drop > 0 ? (result / drop) * 100 : null;

/** Tone class for a signed financial figure. Zero stays neutral. */
export const tone = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return "crl-faint";
  const v = Number(n);
  if (v > 0) return "crl-pos";
  if (v < 0) return "crl-neg";
  return "";
};

/** `2026-08-22` → `22/08/2026`. */
export const labDate = (iso: string | null | undefined): string => {
  if (!iso) return NO_DATA;
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
