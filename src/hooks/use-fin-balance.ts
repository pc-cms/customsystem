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
  /** timestamp of the last recorded wallet state backing `physical` */
  physical_asof?: string | null;
  /** 'manual' = counted by hand, 'auto' = state written after a movement */
  physical_source?: string | null;
  /** Actual = last recorded wallet state (manual count or post-movement state). */
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
  incomes: {
    live_game: number;
    slots: number;
    /** Commissions only: other / refund / fee. */
    other: number;
    /** Tips & Bonuses (tips / bonus / legacy tips_bonus) — signed. */
    tips_bonus?: number;
    /** Other movements: investment / owner top-up — wallet movement, not income. */
    movements?: number;
    jp?: number;
    card_balance: number;
    missed_chips: number;
    missed_cards: number;
  };
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
    /** Approved cage (Live/Slots) expenses of that day. */
    cage_expenses?: number;
    /** True when every cage expense of that day is already booked on a wallet. */
    cage_posted?: boolean;
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
  // Starting float is an income at the beginning of the period: the physical
  // count of a wallet contains it, so Expected must contain it too.
  // Collections = owner withdrawal / CAPEX and Transfers (inter-casino / money change):
  // in both cases cash physically leaves this casino's wallets, so both reduce Expected.
  const expected =
    (s.starting_float?.grand_tzs || 0) +
    (incomes.live_game || 0) +
    (incomes.slots || 0) +
    (incomes.other || 0) +
    (incomes.jp || 0) +
    // Card balance is the per-day difference, summed over the period.
    (incomes.card_balance || 0) +
    (incomes.missed_chips || 0) +
    (incomes.missed_cards || 0) -
    (s.expenses_total || 0) -
    (s.collections_total || 0) -
    (s.transfers_total || 0);
  // Actual = physical counts ONLY. Wallets that were never counted contribute 0 —
  // the book/ledger replay is never used as a fallback.
  const actual = (s.wallets || []).reduce(
    (sum, w) => (w.actual_tzs != null ? sum + Number(w.actual_tzs) : sum),
    0,
  );

  return { expected, actual, variance: actual - expected };
};

