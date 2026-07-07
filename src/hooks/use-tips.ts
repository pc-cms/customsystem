/**
 * use-tips — aggregations for cashier-collected tips.
 *
 * Tips are stored in `transactions` with type IN ('tips_live','tips_poker','tips_floor').
 * They are immutable like all other cash transactions. They DO NOT affect
 * tables_result / shift_result and DO NOT create player visits.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { liveQueryOptions } from "@/lib/live-query-options";

export type TipsKind = "tips_live" | "tips_poker" | "tips_floor";

export interface TipsRow {
  id: string;
  type: TipsKind;
  amount: number;
  business_date: string;
  created_at: string;
  table_id: string | null;
  tips_recipient_employee_id: string | null;
  cancelled_at: string | null;
  chips: Record<string, number> | null;
  gaming_tables?: { name: string } | null;
  employees?: { full_name: string } | null;
}

/** All tips of a given kind in date range. */
export const useTipsByRange = (
  kind: TipsKind | TipsKind[],
  startIso: string,
  endIso: string,
  enabled = true,
) => {
  const { activeCasinoId: casinoId } = useCasino();
  const kinds = Array.isArray(kind) ? kind : [kind];
  return useQuery({
    queryKey: ["tips", casinoId, kinds.join(","), startIso, endIso],
    enabled: enabled && !!casinoId,
    queryFn: async () => {
      if (!casinoId) return [] as TipsRow[];
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, amount, business_date, created_at, table_id, tips_recipient_employee_id, cancelled_at, chips, gaming_tables(name), employees:tips_recipient_employee_id(full_name)")
        .eq("casino_id", casinoId)
        .in("type", kinds as any)
        .gte("business_date", startIso)
        .lte("business_date", endIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as any[]).filter(r => !r.cancelled_at) as TipsRow[];
    },
    ...liveQueryOptions(),
  });
};

/** Sum of Live Game tips (tips_live only) per day within a period.
 *  Drives the Monthly Tips "Collected" hint so the suggested pool matches the
 *  Period Total shown in the Live Game Tips tab. Poker tips are excluded —
 *  they belong to the Club Poker pool, not the dealer pool. */
export const useTipsCollectedForPeriod = (startIso: string, endIso: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["tips", "live-pool", casinoId, startIso, endIso],
    enabled: !!casinoId,
    queryFn: async () => {
      if (!casinoId) return { byDay: {} as Record<string, number>, total: 0 };
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, business_date, cancelled_at")
        .eq("casino_id", casinoId)
        .in("type", ["tips_live"] as any)
        .gte("business_date", startIso)
        .lte("business_date", endIso);
      if (error) throw error;
      const byDay: Record<string, number> = {};
      let total = 0;
      ((data || []) as any[]).forEach(r => {
        if (r.cancelled_at) return;
        const d = r.business_date as string;
        const amt = Number(r.amount) || 0;
        byDay[d] = (byDay[d] || 0) + amt;
        total += amt;
      });
      return { byDay, total };
    },
    ...liveQueryOptions(),
  });
};
