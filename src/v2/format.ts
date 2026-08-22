/**
 * UI V2 number helpers.
 * Canonical integer format: `1 250 000` / `-1 250 000` (plain ASCII spaces).
 */

export const v2Int = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "·";
  const v = Math.round(Number(n));
  const sign = v < 0 ? "-" : "";
  return sign + Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

/** Compact K/M — executive KPI cards only. */
export const v2Compact = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "·";
  const v = Number(n);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs < 1_000) return sign + Math.round(abs).toString();
  if (abs < 1_000_000) return sign + (abs / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return sign + (abs / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
};

/**
 * Zero vs dot semantics.
 * A known calculated value of 0 renders `0`; only null/undefined/NaN render `·`.
 * Never use truthiness to decide this.
 */
export const v2Money = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "·" : v2Int(n);

/** Explicit "no record" marker. */
export const V2_DOT = "·";
