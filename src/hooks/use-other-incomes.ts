/**
 * fin_other_incomes — immutable "other income" transactions.
 * Investments, transfers between casinos, refunds, bonuses, etc.
 * All rows mirror into fin_wallet_tx via DB trigger.
 * Corrections happen through reversal only.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateFinance } from "@/lib/fin-invalidate";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

export type OtherIncomeSource =
  | "investment"
  | "inter_casino_transfer"
  | "owner_topup"
  | "refund"
  | "bonus"
  | "tips"
  | "tips_bonus"
  | "jp"
  | "fee"
  | "other";

/** All known sources, including JP (used for labels of existing rows). */
export const ALL_INCOME_SOURCES: { value: OtherIncomeSource; label: string }[] = [
  { value: "investment", label: "Investment" },
  { value: "inter_casino_transfer", label: "Inter-Casino Transfer" },
  { value: "tips", label: "Tips" },
  { value: "bonus", label: "Bonus" },
  { value: "tips_bonus", label: "Tips & Bonuses" },
  { value: "owner_topup", label: "Owner Top-up" },
  { value: "refund", label: "Refund" },
  { value: "jp", label: "JP" },
  { value: "fee", label: "Fee" },
  { value: "other", label: "Other" },
];

/**
 * Sources selectable on the Other Incomes tab.
 * JP, Tips and Bonus live on their own Office tabs.
 * `tips_bonus` is legacy: kept for labels only, no longer selectable.
 */
export const OTHER_INCOME_SOURCES = ALL_INCOME_SOURCES.filter(
  (s) => !["jp", "tips", "bonus", "tips_bonus", "inter_casino_transfer"].includes(s.value),
);

/**
 * SINGLE SOURCE OF TRUTH for income classification (shared by every page).
 *
 *   COMMISSIONS      — real income the business earned.
 *   TIPS_BONUS       — tips & bonuses (signed, IN/OUT), never income.
 *   MOVEMENTS        — investment / owner top-up: wallet movement, never income.
 *   JP               — jackpot, reported on its own line.
 *   inter_casino_transfer — handled by the transfer registry, never income.
 */
export const COMMISSION_SOURCES: OtherIncomeSource[] = ["other", "refund", "fee"];
export const TIPS_BONUS_SOURCES: OtherIncomeSource[] = ["tips", "bonus", "tips_bonus"];
export const MOVEMENT_SOURCES: OtherIncomeSource[] = ["investment", "owner_topup"];

/** @deprecated use COMMISSION_SOURCES — kept as alias for existing imports. */
export const REAL_INCOME_SOURCES: OtherIncomeSource[] = COMMISSION_SOURCES;




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

export const useOtherIncomes = (
  from: string,
  to: string,
  opts?: { only?: OtherIncomeSource[]; exclude?: OtherIncomeSource[] },
) => {
  const { activeCasinoId } = useCasino();
  const only = opts?.only;
  const exclude = opts?.exclude;
  return useQuery({
    queryKey: ["fin-other-incomes", activeCasinoId, from, to, only?.join(",") || "", exclude?.join(",") || ""],
    enabled: !!activeCasinoId && !!from && !!to,
    queryFn: async () => {
      let q = (supabase as any)
        .from("fin_other_incomes")
        .select("*, fin_wallets(name, currency, kind), fin_categories(name)")
        .eq("casino_id", activeCasinoId)
        .gte("business_date", from)
        .lte("business_date", to);
      if (only?.length) q = q.in("source", only);
      if (exclude?.length) q = q.not("source", "in", `(${exclude.join(",")})`);
      const { data, error } = await q
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OtherIncomeRow[];
    },
    ...liveQueryOptions(),
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
      invalidateFinance(qc);
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
      invalidateFinance(qc);
      toast.success("Income reversed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useUpdateOtherIncome = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      business_date: string;
      wallet_id: string;
      fin_category_id?: string | null;
      source: OtherIncomeSource;
      currency: string;
      amount: number;
      fx_rate?: number;
      note?: string;
    }) => {
      const { id, ...patch } = input;
      const { error } = await (supabase as any)
        .from("fin_other_incomes")
        .update({
          business_date: patch.business_date,
          wallet_id: patch.wallet_id,
          fin_category_id: patch.fin_category_id || null,
          source: patch.source,
          currency: patch.currency,
          amount: patch.amount,
          // keep the mirrored wallet transaction in sync when the currency changes
          fx_rate: patch.fx_rate ?? (patch.currency === "TZS" ? 1 : undefined),
          note: patch.note || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      toast.success("Income updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useDeleteOtherIncome = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("fin_other_incomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      toast.success("Income deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
};
