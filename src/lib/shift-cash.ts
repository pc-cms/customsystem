/**
 * Shift cash-flow helper.
 *
 * Single source of truth for Δ(cash + mobile) per shift, used by both the
 * printable Shift Closing Report (Cash Flow Opener/Closer panel) and the
 * Reports → Live Game table.
 *
 * Formula matches `cashDelta` from `CloseShiftDialog.computeShiftBalance`:
 *   closer (TZS, all currencies + mobile) − opener (TZS, all currencies + mobile)
 * — excludes float/collection/chips/expenses (those are separate terms in the
 * Cash Desk Result reconciliation).
 *
 * For legacy/imported shifts that don't have opening_float / closing_count
 * populated, returns `null` so callers can fall back to the stored
 * `shifts.cash_result` field.
 */
import { CURRENCIES, DEFAULT_EXCHANGE_RATES } from "./currency";

type CashByDenom = Record<string | number, number>;
type CashByCurrency = Record<string, CashByDenom>;
type MobileMap = Record<string, number>;

export interface ShiftCashFlow {
  openerTzs: number;
  closerTzs: number;
  cashDelta: number;
}

const sumDenoms = (cash: CashByDenom | undefined): number =>
  cash
    ? Object.entries(cash).reduce(
        (s, [d, q]) => s + Number(d) * (Number(q) || 0),
        0,
      )
    : 0;

const sumMobile = (m: MobileMap | undefined): number =>
  m ? Object.values(m).reduce((s, v) => s + (Number(v) || 0), 0) : 0;

const toTzs = (
  byCcy: Record<string, number>,
  rates: Record<string, number>,
): number =>
  CURRENCIES.reduce((s, c) => {
    const v = byCcy[c] || 0;
    if (!v) return s;
    if (c === "TZS") return s + v;
    const r = rates[c] || DEFAULT_EXCHANGE_RATES[c] || 0;
    return s + v * r;
  }, 0);

const hasUsefulPayload = (
  cash: CashByCurrency | undefined,
  mobile: MobileMap | undefined,
): boolean => {
  if (cash && Object.keys(cash).length) return true;
  if (mobile && Object.keys(mobile).length) return true;
  return false;
};

/** Compute Cash Flow (closer − opener) for a shift, in TZS.
 *  Returns null when source snapshots are missing (legacy/imported shifts). */
export function computeShiftCashFlow(shift: {
  opening_float?: any;
  closing_count?: any;
  exchange_rates?: any;
} | null | undefined): ShiftCashFlow | null {
  if (!shift) return null;
  const op = shift.opening_float || {};
  const cl = shift.closing_count || {};
  const opCash = op.cash as CashByCurrency | undefined;
  const clCash = cl.cash as CashByCurrency | undefined;
  const opMobile = op.mobile as MobileMap | undefined;
  const clMobile = cl.mobile as MobileMap | undefined;

  if (!hasUsefulPayload(opCash, opMobile) && !hasUsefulPayload(clCash, clMobile)) {
    return null;
  }

  const rates = (shift.exchange_rates || {}) as Record<string, number>;

  const openerByCcy = Object.fromEntries(
    CURRENCIES.map((c) => [c, sumDenoms(opCash?.[c])]),
  ) as Record<string, number>;
  const closerByCcy = Object.fromEntries(
    CURRENCIES.map((c) => [c, sumDenoms(clCash?.[c])]),
  ) as Record<string, number>;

  const openerTzs = toTzs(openerByCcy, rates) + sumMobile(opMobile);
  const closerTzs = toTzs(closerByCcy, rates) + sumMobile(clMobile);

  return {
    openerTzs,
    closerTzs,
    cashDelta: closerTzs - openerTzs,
  };
}
