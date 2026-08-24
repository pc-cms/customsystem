/**
 * Office > Bank / Cashless day grid.
 *
 * Rows = days of the selected month, columns = wallet (account x currency).
 * A cell holds the DAILY MOVEMENT of that wallet (may be negative).
 *
 * Manual entries are real wallet movements: one row per (wallet, business_date)
 * in `fin_wallet_tx`, tagged `ref_table = 'office_grid'`, so Wallets balances
 * and the monthly balance pick them up immediately. Movements posted by other
 * modules (expenses, transfers, collections) are shown too, but read-only.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { fetchPaged } from "@/lib/fetch-paged";
import { invalidateFinance } from "@/lib/fin-invalidate";
import { groupOfWallet, type WalletGroup } from "@/lib/wallet-groups";
import { liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { toast } from "sonner";

export const OFFICE_GRID_REF = "office_grid";
export const OFFICE_GRID_KIND = "adjustment";

export type GridWallet = {
  id: string;
  name: string;
  currency: string;
  kind: string | null;
  wallet_group: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

export type GridCell = {
  /** Signed movement of the day across every source, in wallet currency. */
  total: number;
  /** Signed movement entered manually on this grid. */
  manual: number;
  /** Id of the manual row, when it exists. */
  manualId: string | null;
};

type TxRow = {
  id: string;
  wallet_id: string;
  business_date: string;
  amount: number;
  kind: string;
  ref_table: string | null;
};

/** Expenses / collections are stored positive — the sign lives in `kind`. */
const NEGATIVE_KINDS = new Set(["expense", "manual_expense", "collection", "adjustment_out"]);
const signed = (r: { kind: string; amount: number | string }) => {
  const n = Number(r.amount) || 0;
  return NEGATIVE_KINDS.has(r.kind) ? -Math.abs(n) : n;
};

export const cellKey = (walletId: string, date: string) => `${walletId}|${date}`;

/** Days of the period, ascending, as YYYY-MM-DD. */
export const daysOfPeriod = (from: string, to: string): string[] => {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

export const useWalletDayGrid = (opts: { from: string; to: string; groups: WalletGroup[] }) => {
  const { activeCasinoId } = useCasino();
  const { from, to, groups } = opts;

  const walletsQ = useQuery({
    queryKey: ["fin-wallets-grid", activeCasinoId],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fin_wallets")
        .select("id, name, currency, kind, wallet_group, sort_order, is_active")
        .eq("casino_id", activeCasinoId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as GridWallet[];
    },
    ...liveQueryOptionsWithFallback(60000),
  });

  const wallets = useMemo(() => {
    const set = new Set(groups);
    return (walletsQ.data || [])
      .filter((w) => w.is_active !== false && set.has(groupOfWallet(w)))
      .sort(
        (a, b) =>
          (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
          a.name.localeCompare(b.name) ||
          a.currency.localeCompare(b.currency),
      );
  }, [walletsQ.data, groups]);


  const walletIds = useMemo(() => wallets.map((w) => w.id).sort(), [wallets]);

  const monthQ = useQuery({
    queryKey: ["fin-wallet-grid-tx", activeCasinoId, from, to, walletIds.join(",")],
    enabled: !!activeCasinoId && walletIds.length > 0,
    queryFn: async () => {
      const rows = await fetchPaged<TxRow>((a, b) =>
        supabase
          .from("fin_wallet_tx")
          .select("id, wallet_id, business_date, amount, kind, ref_table")
          .eq("casino_id", activeCasinoId!)
          .in("wallet_id", walletIds)
          .gte("business_date", from)
          .lte("business_date", to)
          .range(a, b),
      );
      const cells = new Map<string, GridCell>();
      rows.forEach((r) => {
        const k = cellKey(r.wallet_id, r.business_date);
        const cur = cells.get(k) || { total: 0, manual: 0, manualId: null };
        const v = signed(r);
        cur.total += v;
        if (r.ref_table === OFFICE_GRID_REF) {
          cur.manual += v;
          cur.manualId = cur.manualId ?? r.id;
        }
        cells.set(k, cur);
      });
      return cells;
    },
    ...liveQueryOptionsWithFallback(30000),
  });

  const startQ = useQuery({
    queryKey: ["fin-wallet-grid-start", activeCasinoId, from, walletIds.join(",")],
    enabled: !!activeCasinoId && walletIds.length > 0,
    queryFn: async () => {
      const rows = await fetchPaged<{ wallet_id: string; amount: number; kind: string }>((a, b) =>
        supabase
          .from("fin_wallet_tx")
          .select("wallet_id, amount, kind")
          .eq("casino_id", activeCasinoId!)
          .in("wallet_id", walletIds)
          .lt("business_date", from)
          .range(a, b),
      );
      const map = new Map<string, number>();
      rows.forEach((r) => map.set(r.wallet_id, (map.get(r.wallet_id) || 0) + signed(r)));
      return map;
    },
    ...liveQueryOptionsWithFallback(60000),
  });

  return {
    wallets,
    cells: monthQ.data ?? new Map<string, GridCell>(),
    startBalances: startQ.data ?? new Map<string, number>(),
    isLoading: walletsQ.isLoading || monthQ.isLoading || startQ.isLoading,
  };
};

/** Create / update / delete the manual movement of a (wallet, day) cell. */
export const useSetWalletDayAmount = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      wallet: GridWallet;
      date: string;
      amount: number;
      existingId: string | null;
      fxRate: number;
    }) => {
      if (!activeCasinoId || !user) throw new Error("Not authenticated");
      const { wallet, date, amount, existingId, fxRate } = input;

      if (!amount) {
        if (existingId) {
          const { error } = await supabase.from("fin_wallet_tx").delete().eq("id", existingId);
          if (error) throw error;
        }
        return;
      }

      const payload = {
        casino_id: activeCasinoId,
        wallet_id: wallet.id,
        business_date: date,
        currency: wallet.currency,
        amount,
        fx_rate: fxRate,
        amount_tzs: amount * fxRate,
        kind: OFFICE_GRID_KIND,
        ref_table: OFFICE_GRID_REF,
        created_by: user.id,
        posted_at: new Date().toISOString(),
        note: "Office grid entry",
      };

      if (existingId) {
        const { error } = await supabase
          .from("fin_wallet_tx")
          .update({ amount, fx_rate: fxRate, amount_tzs: amount * fxRate })
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fin_wallet_tx").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateFinance(qc);
      qc.invalidateQueries({ queryKey: ["fin-wallet-grid-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-grid-start"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
};
