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
  /** timestamp of the last physical count backing `physical` */
  physical_asof?: string | null;
  /** Actual = last physical count + every movement booked after it. */
  actual_native?: number;
  actual_tzs?: number;
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
  incomes: { live_game: number; slots: number; other: number; jp?: number; card_balance: number; missed_chips: number; missed_cards: number };
  expenses_total: number;
  collections_total: number;
  transfers_total: number;
  /** Day-by-day audit rows (only days with movement). */
  daily?: Array<{
    business_date: string;
    day_closed: boolean;
    live_game: number;
    slots: number;
    other: number;
    jp?: number;
    expenses: number;
    collections: number;
    net: number;
  }>;
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
  // Collections = owner withdrawal / CAPEX: the cash physically leaves the casino,
  // so it must reduce Expected. Pure internal moves (transfers, money change) stay neutral.
  const expected =
    (incomes.live_game || 0) +
    (incomes.slots || 0) +
    (incomes.other || 0) +
    // Players card deposits are physically in the cash desk but are not earnings —
    // add them back so the drawer reconciles without inflating the result.
    (incomes.card_balance || 0) +
    (incomes.missed_chips || 0) +
    (incomes.missed_cards || 0) -
    (s.expenses_total || 0) -
    (s.collections_total || 0);
  const actual = (s.wallets || []).reduce((sum, w) => {
    // The RPC already anchors Actual on the last physical count and adds every
    // movement booked after it — so Money In / Out keeps moving the number.
    if (w.actual_tzs != null) return sum + Number(w.actual_tzs);
    return sum + Number(w.ledger_tzs ?? w.ledger ?? 0);
  }, 0);

  // Actual includes the float baseline; subtract it so Variance = business P/L variance.
  const actualNet = actual - (s.starting_float?.grand_tzs || 0);
  return { expected, actual: actualNet, variance: actualNet - expected };
  
};
