/**
 * usePosPlayerOutstanding — sum of OPEN bar charges for a single player.
 * Used by PlayerPreviewHeader to surface "F&B Owed" tile.
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export function usePosPlayerOutstanding(playerId: string | null | undefined) {
  return useQuery({
    queryKey: ["pos-player-outstanding", playerId],
    enabled: !!playerId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("pos_player_charges")
        .select("amount_tzs")
        .eq("player_id", playerId!)
        .eq("status", "open");
      if (error) throw error;
      return (data ?? []).reduce((s, r: any) => s + Number(r.amount_tzs || 0), 0);
    },
    ...liveQueryOptions(),
  });
}
