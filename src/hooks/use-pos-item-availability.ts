import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PosItemAvailabilityStatus =
  | "ok"
  | "low"
  | "out"
  | "negative"
  | "untracked"
  | "config_error";

export interface PosItemAvailabilityRow {
  sellable_item_id: string;
  casino_id: string;
  item_name: string;
  has_recipe: boolean;
  sellable_stock_qty: number | null;
  low_threshold: number;
  portions_available: number | null;
  bottleneck_ingredient_id: string | null;
  bottleneck_ingredient_name: string | null;
  bottleneck_remaining: number | null;
  empty_recipe: boolean;
  status: PosItemAvailabilityStatus;
}

const KEY = (casinoId: string | null) => ["pos-item-availability", casinoId] as const;

/**
 * Read-only availability summary for all active sellable items in a casino.
 * Indicator only — never blocks sales.
 */
export function usePosItemAvailability(casinoId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY(casinoId ?? null),
    enabled: !!casinoId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pos_item_availability" as any)
        .select("*")
        .eq("casino_id", casinoId!);
      if (error) throw error;
      return (data ?? []) as unknown as PosItemAvailabilityRow[];
    },
  });

  // Debounced refetch on inventory movements / menu updates.
  useEffect(() => {
    if (!casinoId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        qc.invalidateQueries({ queryKey: KEY(casinoId) });
      }, 400);
    };
    const ch = supabase
      .channel(`pos-availability-${casinoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_inventory_movements", filter: `casino_id=eq.${casinoId}` },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pos_menu_items", filter: `casino_id=eq.${casinoId}` },
        schedule,
      )
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [casinoId, qc]);

  return query;
}

export interface PosItemAvailabilityIngredient {
  ingredient_item_id: string;
  ingredient_name: string | null;
  quantity: number;
  unit: string | null;
  waste_percent: number;
  required_per_portion: number;
  ingredient_stock_qty: number | null;
  portions_for_ingredient: number | null;
  is_bottleneck: boolean;
}

export interface PosItemAvailabilityDetail {
  summary: PosItemAvailabilityRow | Record<string, never>;
  recipe_id: string | null;
  ingredients: PosItemAvailabilityIngredient[];
}

/** Manager-only ingredient breakdown for one sellable item. */
export function usePosItemAvailabilityDetail(itemId: string | null | undefined) {
  return useQuery({
    queryKey: ["pos-item-availability-detail", itemId],
    enabled: !!itemId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pos_item_availability_detail" as any, {
        item_id: itemId!,
      });
      if (error) throw error;
      return data as unknown as PosItemAvailabilityDetail;
    },
  });
}

export function statusLabel(s: PosItemAvailabilityStatus): string {
  switch (s) {
    case "ok": return "OK";
    case "low": return "Low";
    case "out": return "Out";
    case "negative": return "Negative";
    case "untracked": return "Untracked";
    case "config_error": return "Config Error";
  }
}

export function statusBadgeClass(s: PosItemAvailabilityStatus): string {
  switch (s) {
    case "ok":
      return "bg-cms-amount-positive/15 text-cms-amount-positive";
    case "low":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "out":
    case "negative":
      return "bg-cms-amount-negative/20 text-cms-amount-negative";
    case "untracked":
      return "bg-muted text-muted-foreground";
    case "config_error":
      return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
  }
}
