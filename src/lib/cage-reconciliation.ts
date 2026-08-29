/**
 * Cage reconciliation — canonical formula (Live Game cash check).
 *
 * Banks (CRDB / NBC, TZS & USD) are captured as MOVEMENT ONLY: the cashier
 * enters IN and OUT per channel, never a closing balance. The daily NET
 * (IN − OUT) is part of what the cage HOLDS at check time — money physically
 * handed over to the bank left the drawer and now sits in the bank channel.
 *
 * Therefore:
 *
 *   counted  = chips + cash(all currencies → TZS) + bankNet + cashlessIn − cashlessOut
 *   expected = shift expected balance (opening float + transactions + transfers
 *              − expenses).  Banks NEVER move Expected.
 *   variance = counted − expected
 *
 * Moving physical cash into a bank channel inside the same shift is variance
 * neutral: cash drops by X, bankNet rises by X, expected is untouched.
 * Adding the bank NET to BOTH sides (the previous behaviour) produced a false
 * shortage equal to the amount banked.
 */
import { BANK_CHANNELS, type Banks } from "@/components/cage/CageHelpers";

/** Daily bank movement across all channels, converted to TZS. */
export const bankNetTzs = (
  banks: Banks | null | undefined,
  rates: Record<string, number>,
): number =>
  BANK_CHANNELS.reduce((s, ch) => {
    const e = banks?.channels?.[ch.key];
    const net = Number(e?.in || 0) - Number(e?.out || 0);
    const rate = ch.currency === "TZS" ? 1 : Number(rates?.[ch.currency] || 0);
    return s + net * rate;
  }, 0);

export type CageCountedParts = {
  chipsTzs: number;
  cashTzs: number;
  bankNetTzs: number;
  cashlessInTzs?: number;
  cashlessOutTzs?: number;
};

/** Counted side of the reconciliation (TZS). */
export const cageCountedTotalTzs = (p: CageCountedParts): number =>
  p.chipsTzs + p.cashTzs + p.bankNetTzs
  + (p.cashlessInTzs || 0) - (p.cashlessOutTzs || 0);

/** Variance = counted − expected. Banks are NOT added to expected. */
export const cageVariance = (countedTzs: number, expectedTzs: number): number =>
  countedTzs - expectedTzs;
