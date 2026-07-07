import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const useActivityLogs = (limit = 100) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["activity-logs", casinoId, limit],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("casino_id", casinoId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
  });
};

/**
 * Returns the total cumulative bet across all completed client sessions for a
 * given business date. Uses the `sessions_total_bet_sum` view (security_invoker)
 * — the SUM is computed server-side so the UI cannot tamper with the figure or
 * be misled by RLS-filtered partial rows.
 */
export const useClientSessionsTotalBet = (date?: string) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["client-sessions-total-bet", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return 0;
      let query = (supabase as any)
        .from("sessions_total_bet_sum")
        .select("total_bet")
        .eq("casino_id", casinoId);
      if (date) query = query.eq("business_date", date);
      const { data, error } = await query.maybeSingle();
      if (error) {
        // Graceful fallback if the view is missing in older deployments.
        if ((error as any)?.code === "42P01") return 0;
        throw error;
      }
      return Number(data?.total_bet || 0);
    },
    enabled: !!casinoId,
    ...liveQueryOptionsWithFallback(120000),
  });
};
