import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Returns a Map<player_id, latest visit timestamp> for the given player IDs.
 * "Latest" = checked_out_at if present, else checked_in_at.
 *
 * Strategy: fetch the latest 1000 visits for the given player IDs in one query
 * (sufficient for typical Reception search results of ≤20 players).
 */
export const useLastVisitsByPlayers = (playerIds: string[]) => {
  const { casinoId } = useAuth();
  // Sorted/joined for stable react-query key
  const key = [...playerIds].sort().join(",");

  return useQuery({
    queryKey: ["last-visits-by-players", casinoId, key],
    queryFn: async (): Promise<Map<string, string>> => {
      const result = new Map<string, string>();
      if (!casinoId || playerIds.length === 0) return result;

      const { data, error } = await supabase
        .from("casino_visits")
        .select("player_id, checked_in_at, checked_out_at")
        .in("player_id", playerIds)
        .order("checked_in_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      for (const v of data || []) {
        const ts = (v as any).checked_out_at || (v as any).checked_in_at;
        const pid = (v as any).player_id as string;
        const existing = result.get(pid);
        if (!existing || new Date(ts) > new Date(existing)) {
          result.set(pid, ts);
        }
      }
      return result;
    },
    enabled: !!casinoId && playerIds.length > 0,
    ...liveQueryOptions(),
  });
};

/**
 * Latest visit timestamp for a single player.
 */
export const useLastVisit = (playerId: string | undefined | null) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["last-visit", casinoId, playerId],
    queryFn: async (): Promise<string | null> => {
      if (!casinoId || !playerId) return null;
      const { data, error } = await supabase
        .from("casino_visits")
        .select("checked_in_at, checked_out_at")
        .eq("player_id", playerId)
        .order("checked_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return (data as any).checked_out_at || (data as any).checked_in_at;
    },
    enabled: !!casinoId && !!playerId,
    ...liveQueryOptions(),
  });
};
