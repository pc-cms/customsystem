import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setGameTypes, type GameTypeDef } from "@/lib/table-game-group";

/** Loads the managed list of table game types and syncs the shared classifier. */
export const useGameTypes = () => {
  const q = useQuery({
    queryKey: ["table-game-types"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("table_game_types")
        .select("code, label, sort_order, legacy_games")
        .order("sort_order");
      if (error) throw error;
      const list = (data || []) as GameTypeDef[];
      setGameTypes(list);
      return list;
    },
  });
  return { types: q.data ?? [], isLoading: q.isLoading, version: q.dataUpdatedAt };
};
