/**
 * Player Chip Adjustments — simple immutable two-amount log
 * (chip_in / chip_out + note) recorded from the Player Preview header.
 * Audit-only: does NOT touch cash, cage, wallets, NEP/Drop, chip inventory.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export type PlayerChipAdjustment = {
  id: string;
  casino_id: string;
  player_id: string;
  chip_in: number;
  chip_out: number;
  note: string;
  operator_id: string;
  business_date: string;
  created_at: string;
};

export const usePlayerChipAdjustments = (playerId: string | null | undefined) => {
  return useQuery({
    queryKey: ["player_chip_adjustments", playerId],
    queryFn: async () => {
      if (!playerId) return [] as PlayerChipAdjustment[];
      const { data, error } = await (supabase.from as any)("player_chip_adjustments")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as PlayerChipAdjustment[];
    },
    enabled: !!playerId,
    ...liveQueryOptions(),
  });
};

export const useCreatePlayerChipAdjustment = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      player_id: string;
      chip_in: number;
      chip_out: number;
      note?: string;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const chipIn = Math.trunc(input.chip_in || 0);
      const chipOut = Math.trunc(input.chip_out || 0);
      if (chipIn === 0 && chipOut === 0) {
        throw new Error("Enter Chip IN or Chip OUT amount");
      }
      const { error } = await (supabase.from as any)("player_chip_adjustments").insert({
        casino_id: casinoId,
        player_id: input.player_id,
        chip_in: chipIn,
        chip_out: chipOut,
        note: (input.note || "").slice(0, 500),
        operator_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["player_chip_adjustments", vars.player_id] });
      qc.invalidateQueries({ queryKey: ["player_chip_adjustments", "by-range"] });
      qc.invalidateQueries({ queryKey: ["player-period-stats", vars.player_id] });
      toast.success("Chip adjustment recorded");
    },
    onError: (e: any) => toast.error(e.message || "Failed to record adjustment"),
  });
};
