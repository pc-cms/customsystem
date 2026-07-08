/**
 * Per-table Fill/Credit adjustments for the active shift.
 *
 * Fill   (chip_to_table) → table received chips from cage → SUBTRACT from raw chip delta
 * Credit (chip_from_table) → table sent chips to cage     → ADD to raw chip delta
 *
 *   adjustment = Σcredit.amount − Σfill.amount
 *   displayed  = (actual − baseline) × denom + adjustment
 *
 * This mirrors the DB RPC `compute_shift_table_results`:
 *   Result = SnapResult − Fill + Credit
 * so live UI matches the final shift P&L.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveShift } from "@/hooks/use-shift";

export type TableAdjustment = { fill: number; credit: number; adjustment: number };
export type TableAdjustmentMap = Record<string, TableAdjustment>;

export const useShiftTableAdjustments = (shiftIdOverride?: string | null) => {
  const { casinoId } = useAuth();
  const { data: activeShift } = useActiveShift();
  const shiftId = shiftIdOverride === undefined ? (activeShift?.id ?? null) : shiftIdOverride;

  const query = useQuery({
    queryKey: ["shift-table-adjustments", casinoId, shiftId],
    queryFn: async () => {
      if (!casinoId || !shiftId) return [] as Array<{ table_id: string | null; transfer_type: string; amount: number }>;
      const { data, error } = await supabase
        .from("cage_transfers")
        .select("table_id, transfer_type, amount")
        .eq("casino_id", casinoId)
        .eq("shift_id", shiftId)
        .in("transfer_type", ["fill", "credit"]);
      if (error) throw error;
      return (data ?? []) as Array<{ table_id: string | null; transfer_type: string; amount: number }>;
    },
    enabled: !!casinoId && !!shiftId,
    ...liveQueryOptions(),
    refetchInterval: 10_000,
  });

  const map = useMemo<TableAdjustmentMap>(() => {
    const m: TableAdjustmentMap = {};
    (query.data || []).forEach(row => {
      if (!row.table_id) return;
      if (!m[row.table_id]) m[row.table_id] = { fill: 0, credit: 0, adjustment: 0 };
      const amt = Number(row.amount || 0);
      if (row.transfer_type === "fill") m[row.table_id].fill += amt;
      else if (row.transfer_type === "credit") m[row.table_id].credit += amt;
    });
    Object.values(m).forEach(v => { v.adjustment = v.credit - v.fill; });
    return m;
  }, [query.data]);

  /** Convenience accessor: adjustment for a single table (0 if none). */
  const adjustmentFor = (tableId: string): number => map[tableId]?.adjustment ?? 0;

  /** Flat map tableId → adjustment number (for liveTableResult). */
  const adjustmentMap = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    Object.entries(map).forEach(([k, v]) => { out[k] = v.adjustment; });
    return out;
  }, [map]);

  return { map, adjustmentMap, adjustmentFor, shiftId, isLoading: query.isLoading };
};
