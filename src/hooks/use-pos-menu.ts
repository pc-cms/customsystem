/**
 * POS Menu hooks — categories, items, price history.
 * Scope: by casino_id (from useCasino). RLS enforces server-side.
 * Mutations: insert + update only (no delete — archival via is_active=false).
 * Price changes for items are mirrored into pos_menu_price_history by DB trigger.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PosMenuCategory = {
  id: string;
  casino_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PosMenuItem = {
  id: string;
  casino_id: string;
  category_id: string;
  name: string;
  price_tzs: number;
  stock_qty: number | null;
  low_threshold: number | null;
  is_active: boolean;
  avg_cost_tzs: number;
  last_purchase_cost_tzs: number | null;
  last_purchase_at: string | null;
  bottle_size_ml: number | null;
  serving_size_ml: number | null;
  price_round_step_tzs: number;
  created_at: string;
  updated_at: string;
};

export type PosMenuPriceHistoryRow = {
  id: string;
  item_id: string;
  old_price_tzs: number | null;
  new_price_tzs: number;
  changed_at: string;
  changed_by: string | null;
};

const kCats = (casinoId: string | null) => ["pos-menu", "categories", casinoId] as const;
const kItems = (casinoId: string | null) => ["pos-menu", "items", casinoId] as const;
const kHistory = (itemId: string) => ["pos-menu", "price-history", itemId] as const;

// ─── Categories ────────────────────────────────────────────────────────────

export function usePosMenuCategories(casinoId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: kCats(casinoId),
    enabled: !!casinoId,
    queryFn: async (): Promise<PosMenuCategory[]> => {
      const { data, error } = await supabase
        .from("pos_menu_categories")
        .select("*")
        .eq("casino_id", casinoId!)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PosMenuCategory[];
    },
  });

  useEffect(() => {
    if (!casinoId) return;
    const channel = supabase
      .channel(`casino:${casinoId}:pos-menu-cats`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_menu_categories", filter: `casino_id=eq.${casinoId}` },
        () => qc.invalidateQueries({ queryKey: kCats(casinoId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [casinoId, qc]);

  return q;
}

export function useUpsertPosMenuCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      casino_id: string;
      name: string;
      sort_order: number;
      is_active: boolean;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from("pos_menu_categories")
          .update({
            name: input.name,
            sort_order: input.sort_order,
            is_active: input.is_active,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pos_menu_categories").insert({
          casino_id: input.casino_id,
          name: input.name,
          sort_order: input.sort_order,
          is_active: input.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: kCats(vars.casino_id) });
    },
  });
}

// ─── Items ─────────────────────────────────────────────────────────────────

export function usePosMenuItems(casinoId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: kItems(casinoId),
    enabled: !!casinoId,
    queryFn: async (): Promise<PosMenuItem[]> => {
      const { data, error } = await supabase
        .from("pos_menu_items")
        .select("*")
        .eq("casino_id", casinoId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PosMenuItem[];
    },
  });

  useEffect(() => {
    if (!casinoId) return;
    const channel = supabase
      .channel(`casino:${casinoId}:pos-menu-items`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_menu_items", filter: `casino_id=eq.${casinoId}` },
        () => qc.invalidateQueries({ queryKey: kItems(casinoId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [casinoId, qc]);

  return q;
}

export function useUpsertPosMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      casino_id: string;
      category_id: string;
      name: string;
      price_tzs: number;
      stock_qty: number | null;
      low_threshold: number | null;
      is_active: boolean;
      bottle_size_ml?: number | null;
      serving_size_ml?: number | null;
      price_round_step_tzs?: number;
    }) => {
      const payload: Record<string, unknown> = {
        category_id: input.category_id,
        name: input.name,
        price_tzs: input.price_tzs,
        stock_qty: input.stock_qty,
        low_threshold: input.low_threshold,
        is_active: input.is_active,
      };
      if (input.bottle_size_ml !== undefined) payload.bottle_size_ml = input.bottle_size_ml;
      if (input.serving_size_ml !== undefined) payload.serving_size_ml = input.serving_size_ml;
      if (input.price_round_step_tzs !== undefined) payload.price_round_step_tzs = input.price_round_step_tzs;

      if (input.id) {
        const { error } = await supabase
          .from("pos_menu_items")
          .update(payload as any)
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pos_menu_items").insert({
          casino_id: input.casino_id,
          ...payload,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: kItems(vars.casino_id) });
      if (vars.id) qc.invalidateQueries({ queryKey: kHistory(vars.id) });
    },
  });
}

/** Apply suggested price (per-serving from moving avg) to multiple items. */
export function useApplySuggestedPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { casino_id: string; updates: Array<{ id: string; price_tzs: number }> }) => {
      for (const u of input.updates) {
        const { error } = await supabase
          .from("pos_menu_items")
          .update({ price_tzs: u.price_tzs })
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: kItems(vars.casino_id) });
    },
  });
}

// ─── Price history (read-only) ─────────────────────────────────────────────

export function usePosMenuPriceHistory(itemId: string | null) {
  return useQuery({
    queryKey: kHistory(itemId ?? ""),
    enabled: !!itemId,
    queryFn: async (): Promise<PosMenuPriceHistoryRow[]> => {
      const { data, error } = await supabase
        .from("pos_menu_price_history")
        .select("*")
        .eq("item_id", itemId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PosMenuPriceHistoryRow[];
    },
  });
}
