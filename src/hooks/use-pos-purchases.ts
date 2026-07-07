/**
 * POS Purchases (M8): bar bulk / single-bottle purchases.
 * Records are immutable. Creates a pending-approval slots-cage expense.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type PosPurchaseRow = {
  id: string;
  casino_id: string;
  purchase_type: "bulk" | "single";
  bartender_user_id: string;
  supplier: string | null;
  notes: string;
  total_tzs: number;
  expense_id: string | null;
  business_date: string | null;
  created_at: string;
};

export type PosPurchaseItemRow = {
  id: string;
  purchase_id: string;
  item_id: string;
  qty: number;
  unit_cost_tzs: number;
  line_total_tzs: number;
  item_name?: string;
};

export type PosPurchaseInput = {
  casino_id: string;
  purchase_type: "bulk" | "single";
  supplier?: string;
  notes?: string;
  items: Array<{ item_id: string; qty: number; unit_cost_tzs: number }>;
};

const kList = (casinoId: string | null) => ["pos-purchases", casinoId] as const;
const kItems = (purchaseId: string | null) => ["pos-purchases", "items", purchaseId] as const;

export function usePosPurchases(casinoId: string | null, limit = 100) {
  return useQuery({
    queryKey: kList(casinoId),
    enabled: !!casinoId,
    queryFn: async (): Promise<PosPurchaseRow[]> => {
      const { data, error } = await supabase
        .from("pos_purchases")
        .select("*")
        .eq("casino_id", casinoId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PosPurchaseRow[];
    },
    ...liveQueryOptions(),
  });
}

export function usePosPurchaseItems(purchaseId: string | null) {
  return useQuery({
    queryKey: kItems(purchaseId),
    enabled: !!purchaseId,
    queryFn: async (): Promise<PosPurchaseItemRow[]> => {
      const { data, error } = await supabase
        .from("pos_purchase_items")
        .select("*, pos_menu_items(name)")
        .eq("purchase_id", purchaseId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        purchase_id: r.purchase_id,
        item_id: r.item_id,
        qty: Number(r.qty),
        unit_cost_tzs: Number(r.unit_cost_tzs),
        line_total_tzs: Number(r.line_total_tzs),
        item_name: r.pos_menu_items?.name ?? "—",
      }));
    },
  });
}

export function useCreatePosPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PosPurchaseInput): Promise<string> => {
      const { data, error } = await supabase.rpc("pos_create_purchase", {
        _payload: input as any,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: kList(vars.casino_id) });
      qc.invalidateQueries({ queryKey: ["pos-menu", "items", vars.casino_id] });
      qc.invalidateQueries({ queryKey: ["pos-inv"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}
