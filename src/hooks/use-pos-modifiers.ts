/**
 * POS Modifiers — reusable item modifiers (e.g. Extra Milk +500).
 * Per-unit price delta: line_total = (unit + Σ delta) * qty (enforced by DB trigger).
 * Modifier attach/detach is only allowed while parent order status = 'pending' AND tab is open.
 * Archive-only (no hard delete) so old order snapshots remain readable.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PosModifier = {
  id: string;
  casino_id: string;
  name: string;
  price_tzs_delta: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PosOrderItemModifier = {
  id: string;
  order_item_id: string;
  modifier_id: string | null;
  modifier_name_snapshot: string;
  price_tzs_delta_snapshot: number;
  created_at: string;
};

const k = (casinoId: string | null) => ["pos-modifiers", casinoId] as const;

export function usePosModifiers(casinoId: string | null, activeOnly = true) {
  return useQuery({
    queryKey: [...k(casinoId), activeOnly],
    enabled: !!casinoId,
    queryFn: async (): Promise<PosModifier[]> => {
      let q = supabase.from("pos_modifiers").select("*").eq("casino_id", casinoId!);
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q.order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as PosModifier[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertPosModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PosModifier> & { casino_id: string; name: string }) => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        casino_id: input.casino_id,
        name: input.name,
        price_tzs_delta: input.price_tzs_delta ?? 0,
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? 0,
        updated_at: new Date().toISOString(),
      };
      const { error } = input.id
        ? await supabase.from("pos_modifiers").update(payload).eq("id", input.id)
        : await supabase.from("pos_modifiers").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: k(v.casino_id) }),
  });
}

export function useArchivePosModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("pos_modifiers")
        .update({ is_active: input.is_active, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-modifiers"] }),
  });
}

/** Read modifiers attached to a given order item. */
export function usePosOrderItemModifiers(orderItemIds: string[]) {
  return useQuery({
    queryKey: ["pos-order-item-modifiers", orderItemIds.slice().sort().join(",")],
    enabled: orderItemIds.length > 0,
    queryFn: async (): Promise<PosOrderItemModifier[]> => {
      const { data, error } = await supabase
        .from("pos_order_item_modifiers")
        .select("*")
        .in("order_item_id", orderItemIds);
      if (error) throw error;
      return (data ?? []) as PosOrderItemModifier[];
    },
  });
}

export function useAttachModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { order_item_id: string; modifier: PosModifier }) => {
      const { error } = await supabase.from("pos_order_item_modifiers").insert({
        order_item_id: input.order_item_id,
        modifier_id: input.modifier.id,
        modifier_name_snapshot: input.modifier.name,
        price_tzs_delta_snapshot: input.modifier.price_tzs_delta,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-order-item-modifiers"] });
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-tabs"] });
      qc.invalidateQueries({ queryKey: ["pos-bar-orders"] });
    },
  });
}

export function useDetachModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_order_item_modifiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-order-item-modifiers"] });
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-tabs"] });
      qc.invalidateQueries({ queryKey: ["pos-bar-orders"] });
    },
  });
}
