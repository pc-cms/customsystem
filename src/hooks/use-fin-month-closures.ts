/**
 * fin_month_closures — monthly Close Month ritual (super_admin only).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    staleTime: 60_000,
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
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const totals = { tzs: 0, usd: 0 };
      input.collection_details.forEach((d) => {
        if (d.currency === "TZS") totals.tzs += Number(d.amount || 0);
        else if (d.currency === "USD") totals.usd += Number(d.amount || 0);
      });

      // 1) Insert closure record
      const { error: e1 } = await (supabase as any).from("fin_month_closures").insert({
        casino_id: activeCasinoId,
        year: input.year,
        month: input.month,
        closed_by: uid,
        collection_total_tzs: totals.tzs,
        collection_total_usd: totals.usd,
        collection_details: input.collection_details,
        new_float_details: input.new_float_details,
        note: input.note || null,
      });
      if (e1) throw e1;

      // 2) Apply new Starting Float per wallet
      const nextMonthFirst = new Date(input.year, input.month, 1) // month is 1-12; JS uses next-month index
        .toISOString()
        .slice(0, 10);
      for (const nf of input.new_float_details) {
        const { error: eUp } = await supabase
          .from("fin_wallets")
          .update({
            starting_float_amount: nf.amount,
            starting_float_date: nextMonthFirst,
            starting_float_note: `Close Month ${input.year}-${String(input.month).padStart(2, "0")}`,
          })
          .eq("id", nf.wallet_id);
        if (eUp) throw eUp;
      }
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
