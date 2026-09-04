import { CURRENCIES } from "@/lib/currency";
import { cashSum } from "./CashDenomInput";

export const MOBILE_PROVIDERS = ["Mpesa", "Tigo", "Halo", "AirTel"] as const;

export type MobileProviders = Record<string, number>;

/**
 * Explicit bank channels (bank + currency) captured in the cashdesk.
 * Key format is `<BANK>_<CURRENCY>` — the Closing Inbox maps it to the
 * matching wallet canonical code (BANK_CRDB_TZS, BANK_NBC_USD, …).
 */
export const BANK_CHANNELS = [
  { key: "CRDB_TZS", bank: "CRDB", currency: "TZS" },
  { key: "CRDB_USD", bank: "CRDB", currency: "USD" },
  { key: "NBC_TZS", bank: "NBC", currency: "TZS" },
  { key: "NBC_USD", bank: "NBC", currency: "USD" },
  { key: "SELCOM_TZS", bank: "Selcom", currency: "TZS" },
  { key: "SELCOM_USD", bank: "Selcom", currency: "USD" },
] as const;

export type BankChannelEntry = { in: number; out: number; final?: number };
export type BankChannels = Record<string, BankChannelEntry>;

/**
 * `tzs` / `usd` stay for backward compatibility (legacy generic balances and
 * every downstream report). For new closings they are DERIVED from the daily
 * NET (IN − OUT) per channel — banks are captured as movement only, there is
 * no closing balance entry any more. `final` is kept optional so historical
 * records still read correctly.
 */
export type Banks = { tzs: number; usd: number; channels?: BankChannels };

export const emptyBankChannels = (): BankChannels =>
  Object.fromEntries(BANK_CHANNELS.map(c => [c.key, { in: 0, out: 0 }]));

export const emptyMobile = (): MobileProviders => Object.fromEntries(MOBILE_PROVIDERS.map(p => [p, 0]));
export const emptyBanks = (): Banks => ({ tzs: 0, usd: 0, channels: emptyBankChannels() });

/** Recompute the legacy tzs/usd totals from the per-channel daily NET. */
export const withDerivedBankTotals = (b: Banks): Banks => {
  if (!b.channels) return b;
  const sum = (cur: string) =>
    BANK_CHANNELS.filter(c => c.currency === cur)
      .reduce((s, c) => s + (Number(b.channels?.[c.key]?.in || 0) - Number(b.channels?.[c.key]?.out || 0)), 0);
  return { ...b, tzs: sum("TZS"), usd: sum("USD") };
};

/** Daily NET (IN − OUT) per channel — this is what the Closing Inbox posts. */
export const bankChannelNet = (b: Banks, key: string) =>
  Number(b.channels?.[key]?.in || 0) - Number(b.channels?.[key]?.out || 0);


export const mobileTotal = (m: MobileProviders) => Object.values(m).reduce((s, v) => s + (v || 0), 0);
export const bankTotalTzs = (b: Banks, rates: Record<string, number>) => (b.tzs || 0) + (b.usd || 0) * (rates["USD"] || 0);


export const chipSum = (chips: Record<number, number>) =>
  Object.entries(chips).reduce((s, [d, c]) => s + Number(d) * (c || 0), 0);

export const emptyCash = (): Record<string, Record<number, number>> =>
  Object.fromEntries(CURRENCIES.map(c => [c, {}]));

export const calcCashTotalTzs = (
  cash: Record<string, Record<number, number>>,
  rates: Record<string, number>,
) =>
  Object.entries(cash).reduce((sum, [cur, denoms]) => {
    const t = cashSum(denoms);
    const rate = cur === "TZS" ? 1 : (rates[cur] || 0);
    return sum + t * rate;
  }, 0);

export const calcGrandTotal = (
  chips: Record<number, number>,
  cash: Record<string, Record<number, number>>,
  banks: Banks,
  mobile: MobileProviders,
  rates: Record<string, number>,
) => chipSum(chips) + calcCashTotalTzs(cash, rates) + bankTotalTzs(banks, rates) + mobileTotal(mobile);

// Per-denomination miss QUANTITY: counted - opening (signed).
export const computeMissByDenom = (
  opening: Record<number, number>,
  counted: Record<number, number>,
  denoms: readonly number[],
): Record<number, number> => {
  const out: Record<number, number> = {};
  denoms.forEach(d => { out[d] = (counted[d] || 0) - (opening[d] || 0); });
  return out;
};

// Total signed VALUE in TZS of per-denom miss.
export const missTotalValue = (missByDenom: Record<number, number>): number =>
  Object.entries(missByDenom).reduce((s, [d, q]) => s + Number(d) * (q || 0), 0);

// Cash Desk balance is now computed via the canonical formula in
// `@/lib/cage-balance` (mirrors DB RPC `compute_shift_balance`).
export { computeShiftBalance } from "@/lib/cage-balance";
