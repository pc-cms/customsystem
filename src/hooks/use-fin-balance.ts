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
  ledger: number;
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
  incomes: { live_game: number; slots: number; other: number; missed_chips: number };
  expenses_total: number;
  collections_total: number;
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
  const expected =
    (s.starting_float?.grand_tzs || 0) +
    (incomes.live_game || 0) +
    (incomes.slots || 0) +
    (incomes.other || 0) +
    (incomes.missed_chips || 0) -
    (s.expenses_total || 0) -
    (s.collections_total || 0);
  const usdRate = s.rates?.usd_tzs || 2500;
  const actual = (s.wallets || []).reduce((sum, w) => {
    const val = Number(w.physical ?? w.ledger ?? 0);
    if (w.currency === "USD") return sum + val * usdRate;
    return sum + val;
  }, 0);
  return { expected, actual, variance: actual - expected };
};
