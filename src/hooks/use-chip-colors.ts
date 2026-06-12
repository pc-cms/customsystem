/**
 * use-chip-colors — Per-casino chip color settings.
 * Falls back to defaults from CHIP_COLORS in lib/currency.ts when no override exists.
 *
 * Three-color model (matches real poker chips):
 *   bg    — main body color
 *   edge  — color of the 6 inserts around the rim
 *   text  — denomination label color
 */
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CHIP_DENOMS } from "@/lib/currency";
import { toast } from "sonner";

export interface ChipColorRow {
  denomination: number;
  bg_color: string;
  edge_color: string;
  text_color: string;
}

export interface ChipColors {
  bg: string;
  edge: string;
  text: string;
}

// Default HEX values (mirror tailwind classes from CHIP_COLORS, approximate)
export const DEFAULT_CHIP_HEX: Record<number, ChipColors> = {
  500:        { bg: "#DC2626", edge: "#FFFFFF", text: "#FFFFFF" }, // red-600
  1_000:      { bg: "#2563EB", edge: "#FFFFFF", text: "#FFFFFF" }, // blue-600
  2_000:      { bg: "#16A34A", edge: "#FFFFFF", text: "#FFFFFF" }, // green-600
  5_000:      { bg: "#9333EA", edge: "#FFFFFF", text: "#FFFFFF" }, // purple-600
  10_000:     { bg: "#EAB308", edge: "#000000", text: "#000000" }, // yellow-500 → black inserts
  25_000:     { bg: "#F97316", edge: "#FFFFFF", text: "#FFFFFF" }, // orange-500
  50_000:     { bg: "#DB2777", edge: "#FFFFFF", text: "#FFFFFF" }, // pink-600
  100_000:    { bg: "#000000", edge: "#FFFFFF", text: "#FFFFFF" },
  500_000:    { bg: "#0D9488", edge: "#FFFFFF", text: "#FFFFFF" }, // teal-600
  1_000_000:  { bg: "#FBBF24", edge: "#000000", text: "#000000" }, // amber-400
  5_000_000:  { bg: "#BE123C", edge: "#FFFFFF", text: "#FFFFFF" }, // rose-700
  10_000_000: { bg: "#4338CA", edge: "#FFFFFF", text: "#FFFFFF" }, // indigo-700
};

export const useChipColors = () => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();

  // Live updates: any user in this casino who edits chip colors via Admin
  // → all other connected clients (Pit, Cashier, Reception) refresh in 1-2s.
  // No "force update" button needed.
  useEffect(() => {
    if (!casinoId) return;
    // Unique channel per hook instance — multiple components mount this hook
    // simultaneously, and reusing the same channel name causes
    // "cannot add 'postgres_changes' callbacks after subscribe()".
    const channelName = `casino:${casinoId}:chip_color_settings:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chip_color_settings",
          filter: `casino_id=eq.${casinoId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["chip_color_settings", casinoId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [casinoId, qc]);

  return useQuery({
    queryKey: ["chip_color_settings", casinoId],
    queryFn: async (): Promise<Record<number, ChipColors>> => {
      if (!casinoId) return {};
      const { data, error } = await supabase
        .from("chip_color_settings")
        .select("denomination, bg_color, edge_color, text_color")
        .eq("casino_id", casinoId);
      if (error) throw error;
      const map: Record<number, ChipColors> = {};
      (data || []).forEach((r: any) => {
        map[Number(r.denomination)] = {
          bg: r.bg_color,
          edge: r.edge_color || "#FFFFFF",
          text: r.text_color,
        };
      });
      return map;
    },
    enabled: !!casinoId,
    // staleTime intentionally short — realtime channel handles freshness.
    staleTime: 30_000,
  });
};

/**
 * Per-casino denomination visibility. A denom is visible when no row exists
 * (default) OR `is_visible` is true. Hidden when explicitly set to false.
 */
export const useChipVisibility = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["chip_visibility", casinoId],
    queryFn: async (): Promise<Record<number, boolean>> => {
      if (!casinoId) return {};
      const { data, error } = await supabase
        .from("chip_color_settings")
        .select("denomination, is_visible")
        .eq("casino_id", casinoId);
      if (error) throw error;
      const map: Record<number, boolean> = {};
      (data || []).forEach((r: any) => {
        map[Number(r.denomination)] = r.is_visible !== false;
      });
      return map;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });
};

/** CHIP_DENOMS filtered by current casino visibility (descending order). */
export const useVisibleChipDenoms = (): readonly number[] => {
  const { data: vis } = useChipVisibility();
  if (!vis) return CHIP_DENOMS;
  return CHIP_DENOMS.filter(d => vis[d] !== false);
};

export const useUpsertChipVisibility = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { denomination: number; is_visible: boolean }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const def = DEFAULT_CHIP_HEX[input.denomination] || { bg: "#6B7280", edge: "#FFFFFF", text: "#FFFFFF" };
      const { error } = await supabase
        .from("chip_color_settings")
        .upsert(
          {
            casino_id: casinoId,
            denomination: input.denomination,
            bg_color: def.bg,
            edge_color: def.edge,
            text_color: def.text,
            is_visible: input.is_visible,
            updated_by: user.id,
          },
          { onConflict: "casino_id,denomination" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chip_color_settings", casinoId] });
      qc.invalidateQueries({ queryKey: ["chip_visibility", casinoId] });
      toast.success("Chip visibility updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Resolve color for a denomination, with override → default fallback. */
export const resolveChipColor = (
  denom: number,
  overrides?: Record<number, ChipColors>,
): ChipColors => {
  if (overrides?.[denom]) return overrides[denom];
  return DEFAULT_CHIP_HEX[denom] || { bg: "#6B7280", edge: "#FFFFFF", text: "#FFFFFF" };
};

export const useUpsertChipColor = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { denomination: number; bg_color: string; edge_color: string; text_color: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("chip_color_settings")
        .upsert(
          {
            casino_id: casinoId,
            denomination: input.denomination,
            bg_color: input.bg_color,
            edge_color: input.edge_color,
            text_color: input.text_color,
            updated_by: user.id,
          },
          { onConflict: "casino_id,denomination" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chip_color_settings", casinoId] });
      toast.success("Chip color updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Greedy chip breakdown: largest → smallest. */
export const greedyChipBreakdown = (
  amount: number,
  denoms: readonly number[] = CHIP_DENOMS,
): Record<number, number> => {
  const result: Record<number, number> = {};
  let remaining = Math.max(0, Math.floor(amount));
  // Ensure descending order
  const sorted = [...denoms].sort((a, b) => b - a);
  for (const d of sorted) {
    if (remaining >= d) {
      const count = Math.floor(remaining / d);
      result[d] = count;
      remaining -= count * d;
    }
  }
  return result;
};

/** Sum chip values: { 100000: 2, 50000: 1 } => 250000 */
export const sumChips = (chips: Record<number, number>): number =>
  Object.entries(chips).reduce((s, [d, c]) => s + Number(d) * (c || 0), 0);

export const ALL_DENOMS = CHIP_DENOMS;
