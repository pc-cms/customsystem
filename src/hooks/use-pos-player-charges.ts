/**
 * Outstanding POS charges placed against player accounts.
 * Inserts are emitted only by DB trigger on pos_tabs close.
 * UI may settle/void (cashier/manager/finance/super_admin only via RLS).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type PlayerCharge = {
  id: string;
  casino_id: string;
  tab_id: string;
  player_id: string;
  business_date: string;
  amount_tzs: number;
  status: "open" | "settled" | "voided";
  settled_at: string | null;
  settled_by: string | null;
  settlement_ref: string | null;
  void_reason: string | null;
  created_at: string;
};

export type PlayerChargeRow = PlayerCharge & {
  player_name?: string | null;
};

export function usePlayerCharges(
  casinoId: string | null,
  filter: { status?: "open" | "settled" | "voided" | "all"; playerId?: string | null } = {},
) {
  const status = filter.status ?? "open";
  return useQuery({
    queryKey: ["pos-player-charges", casinoId, status, filter.playerId ?? null],
    enabled: !!casinoId,
    ...liveQueryOptions(),
    queryFn: async (): Promise<PlayerChargeRow[]> => {
      let q = supabase
        .from("pos_player_charges")
        .select("*")
        .eq("casino_id", casinoId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (status !== "all") q = q.eq("status", status);
      if (filter.playerId) q = q.eq("player_id", filter.playerId);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as PlayerCharge[];

      // Resolve player names
      const ids = Array.from(new Set(rows.map(r => r.player_id)));
      let names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: pls } = await supabase
          .from("players")
          .select("id, first_name, last_name")
          .in("id", ids);
        (pls ?? []).forEach((p: any) => {
          names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "—");
        });
      }
      return rows.map(r => ({ ...r, player_name: names.get(r.player_id) ?? null }));
    },
  });
}

export function useSettlePlayerCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ref?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pos_player_charges")
        .update({
          status: "settled",
          settled_at: new Date().toISOString(),
          settled_by: user?.id ?? null,
          settlement_ref: input.ref ?? null,
        })
        .eq("id", input.id)
        .eq("status", "open");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-player-charges"] }),
  });
}

export function useVoidPlayerCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("pos_player_charges")
        .update({ status: "voided", void_reason: input.reason })
        .eq("id", input.id)
        .eq("status", "open");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-player-charges"] }),
  });
}
