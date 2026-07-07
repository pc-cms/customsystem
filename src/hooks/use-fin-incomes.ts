/**
 * fin_incomes — Other Incomes (non-operational revenue) per casino, category, year/month, currency.
 * Replaces the legacy `expenses.is_income` hack with a dedicated table.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

export type FinIncomeRow = {
  id: string;
  casino_id: string;
  fin_category_id: string;
  year: number;
  month: number;
  currency: string;
  amount: number;
  notes: string | null;
};

export const useFinIncomes = (year: number) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-incomes", activeCasinoId, year],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fin_incomes")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .eq("year", year);
      if (error) throw error;
      return (data || []) as FinIncomeRow[];
    },
    ...liveQueryOptions(),
  });
};

export const useUpsertFinIncome = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      year: number;
      month: number;
      category_id: string;
      currency: "TZS" | "USD";
      amount: number;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await (supabase as any).from("fin_incomes").upsert(
        {
          casino_id: activeCasinoId,
          year: input.year,
          month: input.month,
          fin_category_id: input.category_id,
          currency: input.currency,
          amount: input.amount,
        },
        { onConflict: "casino_id,fin_category_id,year,month,currency" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-incomes"] });
      toast.success("Income saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
};
