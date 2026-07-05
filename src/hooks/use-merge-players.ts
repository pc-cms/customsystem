import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PlayerMergeRow = {
  id: string;
  survivor_id: string;
  loser_ids: string[];
  casino_id: string | null;
  reason: string;
  field_choices: Record<string, string>;
  survivor_snapshot: any;
  loser_snapshots: any[];
  affected_counts: Record<string, number>;
  performed_by: string | null;
  performed_at: string;
  undone_at: string | null;
  undone_by: string | null;
};

const INVALIDATE_KEYS = [
  ["players"],
  ["duplicate-groups"],
  ["casino-visits-live"],
  ["player-economy"],
  ["transactions"],
  ["player-groups"],
  ["blacklist"],
];

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  for (const key of INVALIDATE_KEYS) {
    qc.invalidateQueries({ queryKey: key });
  }
};

export const useMergePlayers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      survivor_id: string;
      loser_ids: string[];
      field_choices: Record<string, string>;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc("merge_players" as any, {
        _survivor_id: input.survivor_id,
        _loser_ids: input.loser_ids,
        _field_choices: input.field_choices,
        _reason: input.reason,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidateAll(qc);
      toast.success("Players merged");
    },
    onError: (e: any) => toast.error(e?.message ?? "Merge failed"),
  });
};


export const usePlayerMergeHistory = (playerId: string | null) => {
  return useQuery({
    queryKey: ["player-merges", playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_merges" as any)
        .select("*")
        .or(`survivor_id.eq.${playerId},loser_ids.cs.{${playerId}}`)
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PlayerMergeRow[];
    },
    staleTime: 30_000,
  });
};

export const useBasketPlayers = (ids: string[]) => {
  return useQuery({
    queryKey: ["merge-basket-players", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname, phone, id_number, photo_url, birth_date, category, player_type, status, casino_id, created_at")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5_000,
  });
};
