/**
 * POS Player Search hook — backed by `pos_player_search` RPC.
 * Returns up to 30 matches across name / nickname / phone / id_number / card / RFID.
 * NEVER returns money fields — only identity + masked phone.
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type PosPlayerSearchRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  category: string | null;
  phone_masked: string | null;
  home_casino_id: string | null;
  matched_card: boolean;
};

export function usePosPlayerSearch(casinoId: string | null, q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["pos-player-search", casinoId, term],
    enabled: !!casinoId && term.length >= 2,
    ...liveQueryOptionsWithFallback(30000),
    queryFn: async (): Promise<PosPlayerSearchRow[]> => {
      const { data, error } = await supabase.rpc("pos_player_search" as any, {
        _casino_id: casinoId,
        _q: term,
      });
      if (error) throw error;
      return (data ?? []) as unknown as PosPlayerSearchRow[];
    },
  });
}
