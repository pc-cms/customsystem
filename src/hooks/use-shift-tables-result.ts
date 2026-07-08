/**
 * useShiftTablesResultTotal — canonical chip-based shift P&L for a given shift.
 *
 *   Σ per table ((latest snapshot.actual − baseline.expected) × denomination)
 *   − Fill + Credit
 *
 * Wraps DB RPC `compute_shift_table_results(p_shift_id)` and sums the rows.
 * This is the single source of truth for `shifts.tables_result` (mirrored by
 * a DB trigger on close + on snapshot change).
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export function useShiftTablesResultTotal(shiftId: string | null | undefined) {
  return useQuery({
    queryKey: ["shift_tables_result_total", shiftId],
    queryFn: async () => {
      if (!shiftId) return null;
      const { data, error } = await (supabase as any).rpc("compute_shift_table_results", {
        p_shift_id: shiftId,
      });
      if (error) throw error;
      const rows = (data || []) as Array<{ table_id: string; result: number }>;
      return rows.reduce((s, r) => s + Number(r.result || 0), 0);
    },
    enabled: !!shiftId,
    // Hot KPI: shift P&L must always be fresh.
    ...liveQueryOptions(),
  });
}
