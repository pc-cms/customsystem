import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getBusinessDate } from "@/lib/business-day";
import { liveQueryOptions } from "@/lib/live-query-options";

/**
 * Returns visits for the current business day.
 *
 *  - "In Casino" = visits with date = today AND checked_out_at IS NULL.
 *    A DB trigger guarantees that any active table session re-opens / creates
 *    today's visit, so anyone in Active Players is always present here.
 *  - "Checked out" = visits with date = today AND checked_out_at IS NOT NULL.
 *
 * The 05:00 EAT auto-close cron closes any open visits at the rollover.
 *
 * Realtime-first: `casino_visits` is subscribed at App level via
 * useModuleLiveSync (ALWAYS_LIVE). No refetchOnMount/Focus needed.
 */
export const useVisitsToday = (selectFields = "*, players(first_name, last_name, nickname, photo_url, status, id_number, category, player_type, player_cards(*), player_tags(*))") => {
  const { casinoId } = useAuth();
  const today = getBusinessDate();

  return useQuery({
    queryKey: ["casino-visits-live", casinoId, today, selectFields],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("casino_visits")
        .select(selectFields)
        .eq("casino_id", casinoId)
        .eq("date", today)
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    ...liveQueryOptions(),
  });
};
