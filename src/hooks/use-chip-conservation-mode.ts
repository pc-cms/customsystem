import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export type ChipConservationMode = "strict" | "observation";

/**
 * Strict mode: для нового казино — жёсткий инвариант.
 * Observation mode: для внедрения в работающее казино —
 *   аномалии не блокируются, фиксируются только в shifts.closing_count.chip_miss_total.
 */
export const useChipConservationMode = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["chip-conservation-mode", casinoId],
    queryFn: async (): Promise<ChipConservationMode> => {
      if (!casinoId) return "strict";
      const { data, error } = await supabase
        .from("casinos")
        .select("chip_conservation_mode")
        .eq("id", casinoId)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.chip_conservation_mode ?? "strict") as ChipConservationMode;
    },
    enabled: !!casinoId,
    staleTime: 1000 * 60 * 60 * 24, // 24h — casino config flag
  });
};

export const useUpdateChipConservationMode = () => {
  const qc = useQueryClient();
  const { casinoId } = useAuth();
  return useMutation({
    mutationFn: async (mode: ChipConservationMode) => {
      if (!casinoId) throw new Error("No active casino selected");
      const { data, error } = await supabase
        .from("casinos")
        .update({ chip_conservation_mode: mode } as any)
        .eq("id", casinoId)
        .select("id, chip_conservation_mode");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No permission to change this setting (Manager / Super Admin only)");
      }
      return mode;
    },
    onSuccess: (mode) => {
      qc.invalidateQueries({ queryKey: ["chip-conservation-mode"] });
      qc.invalidateQueries({ queryKey: ["chip-conservation"] });
      toast.success(
        mode === "strict"
          ? "Strict mode: hard chip invariant enforced"
          : "Observation mode: anomalies tracked monthly, no hard block"
      );
    },
    onError: (e: Error) => {
      console.error("[chip-conservation-mode] update failed:", e);
      toast.error(e.message);
    },
  });
};
