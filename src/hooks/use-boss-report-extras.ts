import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { liveQueryOptions } from "@/lib/live-query-options";

export type BossReportExtra = {
  id: string;
  casino_id: string;
  year: number;
  month: number;
  label: string;
  amount: number;
  sort_order: number;
};

export type BossExtraInput = Omit<BossReportExtra, "id" | "created_at" | "updated_at">;

export const useBossReportExtras = (casinoIds: string[], year: number, month: number) => {
  return useQuery({
    queryKey: ["boss-report-extras", casinoIds.sort().join(","), year, month],
    queryFn: async (): Promise<BossReportExtra[]> => {
      if (!casinoIds.length) return [];
      const { data, error } = await supabase
        .from("boss_report_extras")
        .select("id, casino_id, year, month, label, amount, sort_order")
        .in("casino_id", casinoIds)
        .eq("year", year)
        .eq("month", month)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => ({ ...r, amount: Number(r.amount || 0) }));
    },
    enabled: casinoIds.length > 0,
    ...liveQueryOptions(),
  });
};

export const useUpsertBossReportExtra = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: BossExtraInput & { id?: string }) => {
      const payload = {
        casino_id: row.casino_id,
        year: row.year,
        month: row.month,
        label: row.label,
        amount: row.amount,
        sort_order: row.sort_order,
      };
      if (row.id) {
        const { data, error } = await supabase
          .from("boss_report_extras")
          .update(payload)
          .eq("id", row.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("boss_report_extras")
        .upsert(payload, { onConflict: "casino_id, year, month, label" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["boss-report-extras", vars.casino_id, vars.year, vars.month] });
      queryClient.invalidateQueries({ queryKey: ["boss-monthly-report"] });
    },
  });
};

export const useDeleteBossReportExtra = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Unpaid rows: finance may delete directly (allowed by tg_unplanned_no_delete).
      const { error } = await supabase.from("boss_report_extras").delete().eq("id", id);
      if (!error) return;
      // Paid / protected rows: go through the finance function (refunds the wallet).
      const { error: rpcError } = await supabase.rpc("fin_unplanned_delete", { p_id: id });
      if (rpcError) throw new Error(rpcError.message || error.message || "Delete failed");
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boss-report-extras"] });
      queryClient.invalidateQueries({ queryKey: ["boss-monthly-report"] });
    },
  });
};
