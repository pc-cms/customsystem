/**
 * POS Bar Display hook — active orders (pending/preparing/ready) for current casino,
 * across all open tabs/shifts, with realtime + advance status mutation.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PosOrderItem, PosOrderStatus } from "./use-pos-orders";

export type PosBarOrder = {
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
  items: PosOrderItem[];
  tab: {
    id: string;
    player_name: string | null;
    walkin_label: string | null;
  } | null;
};

const kBar = (casinoId: string | null) => ["pos-bar-orders", casinoId] as const;

const ACTIVE: PosOrderStatus[] = ["pending", "preparing", "ready"];

export function usePosBarOrders(casinoId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: kBar(casinoId),
    enabled: !!casinoId,
    queryFn: async (): Promise<PosBarOrder[]> => {
      const { data, error } = await supabase
        .from("pos_orders")
        .select("*, items:pos_order_items(*), tab:pos_tabs(id, player_name, walkin_label)")
        .eq("casino_id", casinoId!)
        .in("status", ACTIVE)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PosBarOrder[];
    },
  });

  useEffect(() => {
    if (!casinoId) return;
    const ch = supabase
      .channel(`casino:${casinoId}:pos-bar`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_orders", filter: `casino_id=eq.${casinoId}` },
        () => qc.invalidateQueries({ queryKey: kBar(casinoId) }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_order_items" },
        () => qc.invalidateQueries({ queryKey: kBar(casinoId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [casinoId, qc]);

  return q;
}

export function useAdvancePosOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { order_id: string; to: "preparing" | "ready" | "served" }) => {
      const patch: {
        status: "preparing" | "ready" | "served";
        ready_at?: string;
        served_at?: string;
      } = { status: input.to };
      if (input.to === "ready") patch.ready_at = new Date().toISOString();
      if (input.to === "served") patch.served_at = new Date().toISOString();
      const { error } = await supabase.from("pos_orders").update(patch).eq("id", input.order_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-bar-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
    },
  });
}
