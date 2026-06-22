/**
 * useDashboardTableResults — canonical per-table P&L for the dashboard.
 *
 * Source of truth: DB RPC `compute_shift_table_results(p_shift_id)`, which is
 * the same function the DB trigger uses to populate `shifts.tables_result`.
 *
 * For each shift that overlaps the given business day window (07:00 EAT
 * rollover via `businessDayHourUTC`), we call the RPC and sum results per
 * table_id. This matches Cage shift P&L exactly and avoids the stale
 * `chip_baseline` (rolling) vs `chip_initial_baseline` (original) mismatch
 * that caused the dashboard to show drastically wrong totals.
 *
 * Casino scope: always filtered by the active casino_id — no cross-casino
 * mixing. Subdomain dictates casinoId, so Arusha sees only Arusha, etc.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { businessDayHourUTC } from "@/lib/business-day";

export type TableResultMap = Record<string, number>;

export const useDashboardTableResults = (businessDate: string | undefined) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["dashboard-table-results", casinoId, businessDate],
    queryFn: async (): Promise<TableResultMap> => {
      if (!casinoId || !businessDate) return {};
      const start = businessDayHourUTC(businessDate, 7);
      const end = businessDayHourUTC(businessDate, 7 + 24);

      // All shifts whose opened_at falls inside this business day. We pick by
      // opened_at to match useCashChecksByBusinessDate / cage day-scoping rules.
      const { data: shifts, error } = await supabase
        .from("shifts")
        .select("id")
        .eq("casino_id", casinoId)
        .gte("opened_at", start)
        .lt("opened_at", end);
      if (error) throw error;
      const ids = (shifts || []).map((s: any) => s.id);
      if (!ids.length) return {};

      // Fan-out the canonical RPC per shift (same source as shifts.tables_result).
      const rpcCalls = await Promise.all(
        ids.map((id) =>
          (supabase as any).rpc("compute_shift_table_results", { p_shift_id: id })
        )
      );

      const map: TableResultMap = {};
      rpcCalls.forEach((res: any) => {
        if (res.error) throw res.error;
        (res.data || []).forEach((r: any) => {
          map[r.table_id] = (map[r.table_id] || 0) + Number(r.result || 0);
        });
      });
      return map;
    },
    enabled: !!casinoId && !!businessDate,
    staleTime: 15_000,
  });
};
