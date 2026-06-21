/**
 * POS Orders hooks — orders of a tab + add/void.
 * Adding an order also inserts a single pos_order_items row; DB triggers
 * compute order total and tab total.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PosOrderStatus = "pending" | "preparing" | "ready" | "served" | "void";

export type PosOrder = {
  id: string;
  casino_id: string;
  shift_id: string | null;
  tab_id: string;
  waiter_user_id: string;
  status: PosOrderStatus;
  total_tzs: number;
  created_at: string;
  ready_at: string | null;
  served_at: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  business_date: string | null;
  source: string;
};

export type PosOrderItem = {
  id: string;
  order_id: string;
  item_id: string;
  item_name: string;
  qty: number;
  unit_price_tzs: number;
  line_total_tzs: number;
};

export type PosOrderWithItems = PosOrder & { items: PosOrderItem[] };

const kOrders = (tabId: string | null) => ["pos-orders", tabId] as const;

export function usePosTabOrders(tabId: string | null, casinoId?: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: kOrders(tabId),
    enabled: !!tabId,
    queryFn: async (): Promise<PosOrderWithItems[]> => {
      const { data, error } = await supabase
        .from("pos_orders")
        .select("*, items:pos_order_items(*)")
        .eq("tab_id", tabId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PosOrderWithItems[];
    },
  });

  useEffect(() => {
    if (!tabId || !casinoId) return;
    const channel = supabase
      .channel(`casino:${casinoId}:pos-orders-${tabId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_orders", filter: `tab_id=eq.${tabId}` },
        () => qc.invalidateQueries({ queryKey: kOrders(tabId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tabId, casinoId, qc]);

  return q;
}

export function useAddPosOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      casino_id: string;
      shift_id: string;
      tab_id: string;
      waiter_user_id: string;
      item_id: string;
      item_name: string;
      unit_price_tzs: number;
      qty: number;
      notes?: string | null;
      modifiers?: Array<{ id: string; name: string; price_tzs_delta: number }>;
    }) => {
      // Insert order shell — total_tzs computed by trigger after order_items insert
      const { data: order, error: oErr } = await supabase
        .from("pos_orders")
        .insert({
          casino_id: input.casino_id,
          shift_id: input.shift_id,
          tab_id: input.tab_id,
          waiter_user_id: input.waiter_user_id,
          status: "pending",
          notes: input.notes ?? null,
        } as any)
        .select("id")
        .single();
      if (oErr) throw oErr;

      const lineTotal = input.unit_price_tzs * input.qty;
      const { data: item, error: iErr } = await supabase
        .from("pos_order_items")
        .insert({
          order_id: order.id,
          item_id: input.item_id,
          item_name: input.item_name,
          qty: input.qty,
          unit_price_tzs: input.unit_price_tzs,
          line_total_tzs: lineTotal,
        })
        .select("id")
        .single();
      if (iErr) throw iErr;

      // Attach modifiers (DB trigger recomputes line_total via per-unit formula).
      if (input.modifiers && input.modifiers.length > 0) {
        const rows = input.modifiers.map((m) => ({
          order_item_id: (item as any).id as string,
          modifier_id: m.id,
          modifier_name_snapshot: m.name,
          price_tzs_delta_snapshot: m.price_tzs_delta,
        }));
        const { error: mErr } = await supabase.from("pos_order_item_modifiers").insert(rows);
        if (mErr) throw mErr;
      }
      return order.id as string;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: kOrders(v.tab_id) });
      qc.invalidateQueries({ queryKey: ["pos-tabs"] });
      qc.invalidateQueries({ queryKey: ["pos-menu", "items"] });
    },
  });
}

/** Update notes on a pending order (waiter only — locked once bartender starts). */
export function useUpdatePosOrderNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { order_id: string; notes: string | null }) => {
      const { error } = await supabase
        .from("pos_orders")
        .update({ notes: input.notes } as any)
        .eq("id", input.order_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-bar-orders"] });
    },
  });
}


export function useVoidPosOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { order_id: string; reason?: string }) => {
      const { error } = await supabase
        .from("pos_orders")
        .update({
          status: "void",
          voided_at: new Date().toISOString(),
          voided_reason: input.reason ?? null,
        })
        .eq("id", input.order_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-tabs"] });
    },
  });
}
