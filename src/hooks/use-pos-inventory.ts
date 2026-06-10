/**
 * POS Inventory hooks — append-only movements + helpers.
 * Stock quantity on pos_menu_items is updated by the DB trigger when a
 * movement is inserted; we never mutate stock_qty directly here.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PosInventoryMovement = {
  id: string;
  item_id: string;
  delta: number;
  reason: string;
  user_id: string | null;
  created_at: string;
};

const kRecent = (casinoId: string | null) => ["pos-inv", "recent", casinoId] as const;
const kItem = (itemId: string) => ["pos-inv", "item", itemId] as const;

export function usePosInventoryRecent(casinoId: string | null, limit = 50) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: kRecent(casinoId),
    enabled: !!casinoId,
    queryFn: async (): Promise<(PosInventoryMovement & { item_name: string })[]> => {
      const { data, error } = await supabase
        .from("pos_inventory_movements")
        .select("*, pos_menu_items!inner(name, casino_id)")
        .eq("pos_menu_items.casino_id", casinoId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        item_id: r.item_id,
        delta: Number(r.delta),
        reason: r.reason,
        user_id: r.user_id,
        created_at: r.created_at,
        item_name: r.pos_menu_items?.name ?? "—",
      }));
    },
  });

  useEffect(() => {
    if (!casinoId) return;
    const ch = supabase
      .channel(`casino:${casinoId}:pos-inv`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pos_inventory_movements" },
        () => {
          qc.invalidateQueries({ queryKey: kRecent(casinoId) });
          qc.invalidateQueries({ queryKey: ["pos-menu", "items", casinoId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [casinoId, qc]);

  return q;
}

export function usePosInventoryItemHistory(itemId: string | null, limit = 30) {
  return useQuery({
    queryKey: kItem(itemId ?? ""),
    enabled: !!itemId,
    queryFn: async (): Promise<PosInventoryMovement[]> => {
      const { data, error } = await supabase
        .from("pos_inventory_movements")
        .select("*")
        .eq("item_id", itemId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PosInventoryMovement[];
    },
  });
}

export function useAddPosInventoryMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      item_id: string;
      delta: number;
      reason: string;
      user_id: string | null;
    }) => {
      const { error } = await supabase.from("pos_inventory_movements").insert({
        item_id: input.item_id,
        delta: input.delta,
        reason: input.reason,
        user_id: input.user_id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: kItem(vars.item_id) });
      qc.invalidateQueries({ queryKey: ["pos-inv"] });
      qc.invalidateQueries({ queryKey: ["pos-menu", "items"] });
    },
  });
}

export type StockStatus = "untracked" | "ok" | "low" | "out";

export function stockStatus(stock_qty: number | null, low_threshold: number | null): StockStatus {
  if (stock_qty == null) return "untracked";
  if (stock_qty <= 0) return "out";
  if (low_threshold != null && stock_qty <= low_threshold) return "low";
  return "ok";
}
