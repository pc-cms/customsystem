/**
 * Waiter-facing POS status for a player tab.
 * Returns a coarse label (allowed / warning / approval / unknown).
 * Never exposes numeric balances. Backed by the `pos_player_status` RPC.
 * Errors degrade silently to `unknown` (grey pill) — no toast spam in waiter UI.
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type PosPlayerStatus = "allowed" | "warning" | "approval" | "unknown";

export function usePosPlayerStatus(playerId: string | null, casinoId: string | null) {
  return useQuery<PosPlayerStatus>({
    queryKey: ["pos-player-status", playerId, casinoId],
    enabled: !!playerId && !!casinoId,
    ...liveQueryOptionsWithFallback(60000),
    retry: 1,
    queryFn: async (): Promise<PosPlayerStatus> => {
      try {
        const { data, error } = await supabase.rpc("pos_player_status" as any, {
          _player_id: playerId!,
          _casino_id: casinoId!,
        });
        if (error) return "unknown";
        const v = (data as unknown as string) ?? "";
        if (v === "allowed" || v === "warning" || v === "approval") return v;
        return "unknown";
      } catch {
        return "unknown";
      }
    },
  });
}
