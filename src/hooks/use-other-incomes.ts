/**
 * fin_other_incomes — immutable "other income" transactions.
 * Investments, transfers between casinos, refunds, bonuses, etc.
 * All rows mirror into fin_wallet_tx via DB trigger.
 * Corrections happen through reversal only.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

export type OtherIncomeSource =
  | "investment"
  | "inter_casino_transfer"
  | "owner_topup"
  | "refund"
  | "bonus"
  | "other";

export const OTHER_INCOME_SOURCES: { value: OtherIncomeSource; label: string }[] = [
  { value: "investment", label: "Investment" },
  { value: "inter_casino_transfer", label: "Inter-Casino Transfer" },
  { value: "owner_topup", label: "Owner Top-up" },
  { value: "refund", label: "Refund" },
  { value: "bonus", label: "Bonus" },
  { value: "other", label: "Other" },
];

export type OtherIncomeRow = {
  id: string;
  casino_id: string;
  business_date: string;
  wallet_id: string;
  fin_category_id: string | null;
  source: OtherIncomeSource;
  currency: string;
  amount: number;
  fx_rate: number;
  note: string | null;
  created_by: string;
  created_at: string;
  reverses_id: string | null;
  reversed_by_id: string | null;
  wallet_tx_id: string | null;
  fin_wallets?: { name: string; currency: string; kind: string } | null;
  fin_categories?: { name: string } | null;
};

export const useOtherIncomes = (from: string, to: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-other-incomes", activeCasinoId, from, to],
    enabled: !!activeCasinoId && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fin_other_incomes")
        .select("*, fin_wallets(name, currency, kind), fin_categories(name)")
        .eq("casino_id", activeCasinoId)
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OtherIncomeRow[];
    },
    staleTime: 15_000,
  });
};

export const useAddOtherIncome = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      business_date: string;
      wallet_id: string;
      fin_category_id?: string | null;
      source: OtherIncomeSource;
      currency: string;
      amount: number;
      fx_rate?: number;
      note?: string;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const { error } = await (supabase as any).from("fin_other_incomes").insert({
        casino_id: activeCasinoId,
        business_date: input.business_date,
        wallet_id: input.wallet_id,
        fin_category_id: input.fin_category_id || null,
        source: input.source,
        currency: input.currency,
        amount: input.amount,
        fx_rate: input.fx_rate ?? (input.currency === "TZS" ? 1 : 2500),
        note: input.note || null,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-other-incomes"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-bal-asof"] });
      toast.success("Income added");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useReverseOtherIncome = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (row: OtherIncomeRow) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await (supabase as any).from("fin_other_incomes").insert({
        casino_id: row.casino_id,
        business_date: today,
        wallet_id: row.wallet_id,
        fin_category_id: row.fin_category_id,
        source: row.source,
        currency: row.currency,
        amount: row.amount,
        fx_rate: row.fx_rate,
        note: `Reversal of ${row.id}`,
        created_by: uid,
        reverses_id: row.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-other-incomes"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-bal-asof"] });
      toast.success("Income reversed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};
