/**
 * POS Orders hooks — orders of a tab + add/void.
 * Adding an order also inserts a single pos_order_items row; DB triggers
 * compute order total and tab total.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPosOperator, setPosOperator } from "@/lib/pos-operator";
import { maybePrintBarTicket } from "@/lib/pos-print";

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
  operation_mode: PosOperationMode | null;
  ordered_by_employee_id: string | null;
};

export type PosOperationMode = "complimentary" | "paid";

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
      tab_id: string;
      item_id: string;
      qty: number;
      notes?: string | null;
      modifier_ids?: string[];
    }) => {
      const op = getPosOperator();
      if (!op) throw new Error("Terminal locked — unlock with your PIN.");
      const { data, error } = await supabase.rpc("pos_create_order", {
        _token: op.token,
        _tab_id: input.tab_id,
        _item_id: input.item_id,
        _qty: input.qty,
        _notes: input.notes ?? null,
        _modifier_ids: input.modifier_ids ?? [],
      });
      if (error) {
        if (String(error.message).includes("OPERATOR_LOCKED")) setPosOperator(null);
        throw error;
      }
      const orderId = data as unknown as string;
      void maybePrintBarTicket(orderId);
      return orderId;
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


/** Void after send: requires POS manager PIN + reason (server-verified). */
export function useVoidPosOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { order_id: string; reason: string; manager_pin: string }) => {
      const { error } = await supabase.rpc("pos_void_order_mgr" as any, {
        _order_id: input.order_id, _reason: input.reason, _manager_pin: input.manager_pin,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-tabs"] });
    },
  });
}
