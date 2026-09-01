/**
 * fin_month_opening — the explicit "Open Month" ritual.
 *
 * A month is unusable for Office postings until a person confirms its opening:
 * starting float + opening wallet balances. Nothing rolls over automatically.
 * Status precedence: closed > open > not_opened.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";
import { useMonthClosures } from "./use-fin-month-closures";

export type MonthOpeningRow = {
  id: string;
  casino_id: string;
  year: number;
  month: number;
  opening_float_tzs: number;
  wallet_balances: Array<{ wallet_id: string; amount: number }>;
  opened_by: string;
  opened_at: string;
  note: string | null;
};

export type MonthStatus = "open" | "closed" | "not_opened";

export const useMonthOpenings = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-month-openings", activeCasinoId],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fin_month_opening")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data || []) as MonthOpeningRow[];
    },
    ...liveQueryOptionsWithFallback(60000),
  });
};

/** Status of a given month for the active casino. */
export const monthStatusOf = (
  openings: MonthOpeningRow[],
  closures: Array<{ year: number; month: number }>,
  year: number,
  month: number,
): MonthStatus => {
  if (closures.some((c) => c.year === year && c.month === month)) return "closed";
  if (openings.some((o) => o.year === year && o.month === month)) return "open";
  return "not_opened";
};

export const useMonthStatus = (year: number, month: number) => {
  const { data: openings = [] } = useMonthOpenings();
  const { data: closures = [] } = useMonthClosures();
  return monthStatusOf(openings, closures, year, month);
};

export const useOpenMonth = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      year: number;
      month: number;
      float_details: Array<{ wallet_id: string; amount: number }>;
      wallet_balances: Array<{ wallet_id: string; amount: number }>;
      note?: string;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await (supabase as any).rpc("fin_open_month", {
        p_casino_id: activeCasinoId,
        p_year: input.year,
        p_month: input.month,
        p_float_details: input.float_details,
        p_wallet_balances: input.wallet_balances,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-month-openings"] });
      qc.invalidateQueries({ queryKey: ["fin-month-finance"] });
      qc.invalidateQueries({ queryKey: ["fin-wallets"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      toast.success("Month opened");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to open month"),
  });
};
