/**
 * fin_month_closures — monthly Close Month ritual (super_admin only).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

export type MonthClosureRow = {
  id: string;
  casino_id: string;
  year: number;
  month: number;
  closed_at: string;
  closed_by: string;
  collection_total_tzs: number;
  collection_total_usd: number;
  collection_details: Array<{ wallet_id: string; currency: string; amount: number }>;
  new_float_details: Array<{ wallet_id: string; currency: string; amount: number }>;
  note: string | null;
};

export const useMonthClosures = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-month-closures", activeCasinoId],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fin_month_closures")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data || []) as MonthClosureRow[];
    },
    ...liveQueryOptionsWithFallback(60000),
  });
};

export const useRunCloseMonth = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      year: number;
      month: number;
      collection_details: Array<{ wallet_id: string; currency: string; amount: number }>;
      new_float_details: Array<{ wallet_id: string; currency: string; amount: number }>;
      note?: string;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");

      // Single atomic RPC: closure record + collection withdrawal per wallet
      // + new starting float + physical recount snapshot.
      const { error } = await (supabase as any).rpc("fin_close_month", {
        p_casino_id: activeCasinoId,
        p_year: input.year,
        p_month: input.month,
        p_collection: input.collection_details,
        p_new_float: input.new_float_details,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-month-closures"] });
      qc.invalidateQueries({ queryKey: ["fin-wallets"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      toast.success("Month closed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};
