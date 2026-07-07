/**
 * Comp budget — per-casino monthly limit on house comps issued through POS.
 * Reads via pos_comp_budget_status RPC; writes via pos_comp_budgets table.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type CompBudgetStatus = {
  month_start: string;
  limit_tzs: number;
  used_house_tzs: number;
  used_player_tzs: number;
  remaining_tzs: number;
  percent_used: number | null;
  is_over: boolean;
};

export function usePosCompBudgetStatus(casinoId: string | null) {
  return useQuery({
    queryKey: ["pos-comp-budget-status", casinoId],
    enabled: !!casinoId,
    queryFn: async (): Promise<CompBudgetStatus | null> => {
      const { data, error } = await supabase.rpc("pos_comp_budget_status", {
        _casino_id: casinoId!,
        _month_start: null,
      } as any);
      if (error) throw error;
      return data as unknown as CompBudgetStatus;
    },
    ...liveQueryOptions(),
  });
}

export function useSetPosCompBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { casino_id: string; month_start: string; limit_tzs: number; note?: string }) => {
      const { error } = await supabase
        .from("pos_comp_budgets")
        .upsert(
          {
            casino_id: input.casino_id,
            month_start: input.month_start,
            limit_tzs: input.limit_tzs,
            note: input.note ?? "",
          },
          { onConflict: "casino_id,month_start" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["pos-comp-budget-status", v.casino_id] });
    },
  });
}

export type CompBudgetOverride = {
  id: string;
  casino_id: string;
  tab_id: string;
  month_start: string;
  amount_tzs: number;
  manager_user_id: string;
  reason: string;
  created_at: string;
  manager_name?: string | null;
};

export function usePosCompBudgetOverrides(casinoId: string | null, monthStart?: string | null) {
  return useQuery({
    queryKey: ["pos-comp-budget-overrides", casinoId, monthStart ?? "current"],
    enabled: !!casinoId,
    ...liveQueryOptions(),
    queryFn: async (): Promise<CompBudgetOverride[]> => {
      let q = supabase
        .from("pos_comp_budget_overrides")
        .select("*")
        .eq("casino_id", casinoId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (monthStart) q = q.eq("month_start", monthStart);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as CompBudgetOverride[];
      const ids = Array.from(new Set(rows.map((r) => r.manager_user_id))).filter(Boolean);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", ids);
        (profs ?? []).forEach((p: any) => names.set(p.user_id, p.display_name ?? ""));
      }
      return rows.map((r) => ({ ...r, manager_name: names.get(r.manager_user_id) ?? null }));
    },
  });
}

