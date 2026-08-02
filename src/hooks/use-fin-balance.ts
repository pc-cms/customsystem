/**
 * Balance snapshot — Expected vs Actual reconciliation per casino / period.
 * Reads from RPC fin_balance_snapshot.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { liveQueryOptionsWithFallback } from "@/lib/live-query-options";

export type WalletBalanceRow = {
  wallet_id: string;
  name: string;
  kind: string;
  currency: string;
  /** @deprecated use ledger_native / ledger_tzs */
  ledger: number;
  ledger_native: number;
  ledger_tzs: number;
  physical: number | null;
};

export type BalanceSnapshot = {
  period: { start: string; end: string };
  rates: { usd_tzs: number };
  starting_float: {
    tzs: number;
    usd: number;
    grand_tzs: number;
    per_wallet: Array<{ wallet_id: string; name: string; currency: string; amount: number }>;
  };
  incomes: { live_game: number; slots: number; other: number; card_balance: number; missed_chips: number; missed_cards: number };
  expenses_total: number;
  collections_total: number;
  transfers_total: number;
  wallets: WalletBalanceRow[];
};

export const useFinBalanceSnapshot = (from: string, to: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-balance-snapshot", activeCasinoId, from, to],
    enabled: !!activeCasinoId && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fin_balance_snapshot", {
        p_casino_id: activeCasinoId,
        p_period_start: from,
        p_period_end: to,
      });
      if (error) throw error;
      return data as BalanceSnapshot;
    },
    ...liveQueryOptionsWithFallback(15_000),
  });
};

/** Convenience: compute Expected/Actual/Variance in Grand TZS from a snapshot. */
export const computeBalanceTotals = (s: BalanceSnapshot | undefined) => {
  if (!s) return { expected: 0, actual: 0, variance: 0 };
  const incomes = s.incomes;
  // Physical cash count per wallet already contains the starting float
  // (a count records the wallet's current total, float included).
  // So Expected must NOT add starting_float — otherwise it double-counts.
  // Collections are an internal move between our own wallets (cage -> office),
  // never a cost — they must NOT reduce Expected.
  const expected =
    (incomes.live_game || 0) +
    (incomes.slots || 0) +
    (incomes.other || 0) +
    // Players card deposits are physically in the cash desk but are not earnings —
    // add them back so the drawer reconciles without inflating the result.
    (incomes.card_balance || 0) +
    (incomes.missed_chips || 0) +
    (incomes.missed_cards || 0) -
    (s.expenses_total || 0);
  const usdRate = s.rates?.usd_tzs || 2600;
  const actual = (s.wallets || []).reduce((sum, w) => {
    // Prefer physical count (native currency) → convert to TZS; else use TZS ledger.
    if (w.physical != null) {
      const p = Number(w.physical);
      if (w.currency === "USD") return sum + p * usdRate;
      if (w.currency === "TZS") return sum + p;
      // EUR/GBP/KES physicals without FX — approximate via ledger_tzs / native ratio
      const native = Number(w.ledger_native ?? w.ledger ?? 0);
      const tzs = Number(w.ledger_tzs ?? 0);
      const rate = native ? tzs / native : 0;
      return sum + p * rate;
    }
    return sum + Number(w.ledger_tzs ?? w.ledger ?? 0);
  }, 0);
  // Actual includes the float baseline; subtract it so Variance = business P/L variance.
  const actualNet = actual - (s.starting_float?.grand_tzs || 0);
  return { expected, actual: actualNet, variance: actualNet - expected };
  
};
