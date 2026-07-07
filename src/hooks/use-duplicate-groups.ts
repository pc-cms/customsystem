import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";

export type DuplicatePlayer = {
  id: string;
  casino_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  phone: string | null;
  id_number: string | null;
  birth_date: string | null;
  photo_url: string | null;
  status: string;
  category: string;
  player_type: string;
  created_at: string;
};

export type DuplicateGroup = {
  group_key: string;
  match_reason: string;
  players: DuplicatePlayer[];
};

export const useDuplicateGroups = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["duplicate-groups", activeCasinoId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_duplicate_groups" as any, {
        _casino_id: activeCasinoId ?? null,
        _limit: 50,
      });
      if (error) throw error;
      return (data ?? []) as DuplicateGroup[];
    },
    ...liveQueryOptionsWithFallback(60000),
  });
};
