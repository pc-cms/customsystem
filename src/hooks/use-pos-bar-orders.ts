/**
 * POS Bar Display hook — active orders (pending/preparing/ready) for current casino,
 * across all open tabs/shifts, with realtime + advance/mark-problem/force-close mutations.
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
  notes: string | null;
  is_problem: boolean;
  problem_reason: string | null;
  force_closed_at: string | null;
  closed_by_system: boolean;
  auto_closed_at: string | null;
  items: PosOrderItem[];
  tab: {
    id: string;
    player_name: string | null;
    walkin_label: string | null;
  } | null;
  waiter: { display_name: string | null } | null;
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
      const rows = (data ?? []) as any[];
      const waiterIds = Array.from(new Set(rows.map((r) => r.waiter_user_id).filter(Boolean)));
      let waiterMap: Record<string, string> = {};
      if (waiterIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", waiterIds);
        for (const p of profs ?? []) {
          waiterMap[(p as any).user_id] = (p as any).display_name ?? "";
        }
      }
      return rows.map((r) => ({
        ...r,
        waiter: r.waiter_user_id ? { display_name: waiterMap[r.waiter_user_id] ?? null } : null,
      })) as unknown as PosBarOrder[];
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

export function useMarkOrderProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { order_id: string; reason: string }) => {
      const { error } = await supabase
        .from("pos_orders")
        .update({
          is_problem: true,
          problem_reason: input.reason,
          problem_marked_at: new Date().toISOString(),
        } as any)
        .eq("id", input.order_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-bar-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-problem-orders"] });
    },
  });
}

/**
 * Force-close a stuck order. Server-side trigger blocks force-close on `pending`
 * orders (stock would otherwise be skipped). FE also guards to fail fast.
 */
export function useForceCloseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { order_id: string; current_status: PosOrderStatus; reason: string }) => {
      if (input.current_status === "pending") {
        throw new Error(
          "Pending orders cannot be force-closed. Ask the bartender to accept the order first, or void/mark-as-problem.",
        );
      }
      const { error } = await supabase
        .from("pos_orders")
        .update({
          force_closed_at: new Date().toISOString(),
          force_close_reason: input.reason,
        } as any)
        .eq("id", input.order_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-bar-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-problem-orders"] });
    },
  });
}

/** Manager view: all problem-flagged + force-closed orders for current casino. */
export function usePosProblemOrders(casinoId: string | null) {
  return useQuery({
    queryKey: ["pos-problem-orders", casinoId],
    enabled: !!casinoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_orders")
        .select("*, items:pos_order_items(*), tab:pos_tabs(id, player_name, walkin_label)")
        .eq("casino_id", casinoId!)
        .or("is_problem.eq.true,force_closed_at.not.is.null")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
