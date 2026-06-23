/**
 * useDashboardTableResults — per-table P&L for the dashboard.
 *
 * RULE (per user, June 2026): No daily summing. Take the LATEST Chip Count
 * snapshot per table and compute result = Σ (actual − expected) × denomination.
 * Sum those per game type and total on the consumer side.
 *
 * Each chip_snapshots row carries both `actual_quantity` and `expected_quantity`
 * (the baseline at the moment of the count), so we don't need a separate
 * baseline lookup and we avoid the rolling-vs-initial baseline mismatch.
 *
 * Casino scope: filtered by active casino_id via the RPC. No cross-casino mix.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useShiftTableAdjustments } from "@/hooks/use-shift-table-adjustments";

export type TableResultMap = Record<string, number>;

export const useDashboardTableResults = (businessDate: string | undefined) => {
  const { casinoId } = useAuth();
  const { adjustmentMap } = useShiftTableAdjustments();
  const query = useQuery({
    queryKey: ["dashboard-table-results", casinoId, businessDate],
    queryFn: async (): Promise<TableResultMap> => {
      if (!casinoId || !businessDate) return {};

      // Latest snapshot per (location_type, location_id, denomination) for the day.
      const { data, error } = await supabase.rpc("chip_snapshots_latest", {
        _casino_id: casinoId,
        _date: businessDate,
      });
      if (error) throw error;

      const map: TableResultMap = {};
      (data || []).forEach((r: any) => {
        if (r.location_type !== "table" || !r.location_id) return;
        const denom = Number(r.denomination || 0);
        const actual = Number(r.actual_quantity || 0);
        const expected = Number(r.expected_quantity || 0);
        map[r.location_id] = (map[r.location_id] || 0) + (actual - expected) * denom;
      });
      return map;
    },
    enabled: !!casinoId && !!businessDate,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 10_000,
  });

  const data = useMemo<TableResultMap>(() => {
    const merged: TableResultMap = { ...(query.data ?? {}) };
    Object.entries(adjustmentMap).forEach(([tableId, adjustment]) => {
      merged[tableId] = (merged[tableId] || 0) + Number(adjustment || 0);
    });
    return merged;
  }, [query.data, adjustmentMap]);

  return { ...query, data };
};
