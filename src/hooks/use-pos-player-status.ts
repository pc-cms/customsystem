/**
 * Waiter-facing POS status for a player tab.
 * Returns a coarse label (allowed / warning / approval) without exposing
 * numeric balances. Backed by the `pos_player_status` RPC.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PosPlayerStatus = "allowed" | "warning" | "approval";

export function usePosPlayerStatus(playerId: string | null, casinoId: string | null) {
  return useQuery({
    queryKey: ["pos-player-status", playerId, casinoId],
    enabled: !!playerId && !!casinoId,
    staleTime: 60_000,
    queryFn: async (): Promise<PosPlayerStatus> => {
      const { data, error } = await supabase.rpc("pos_player_status" as any, {
        _player_id: playerId!,
        _casino_id: casinoId!,
      });
      if (error) throw error;
      return ((data as unknown as string) ?? "allowed") as PosPlayerStatus;
    },
  });
}
