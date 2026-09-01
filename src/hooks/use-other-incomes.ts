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
  | "office"
  /** @deprecated legacy — migrated to `office`, kept readable for audit. */
  | "owner_topup"
  /** @deprecated legacy — no longer selectable, kept readable for audit. */
  | "refund"
  | "bonus"
  | "tips"
  | "tips_bonus"
  | "jp"
  | "collection"
  | "commission"
  | "agent_commission"
  | "fee"
  | "add_float"
  | "other";


/** All known sources, including legacy ones (used for labels of existing rows). */
export const ALL_INCOME_SOURCES: { value: OtherIncomeSource; label: string }[] = [
  { value: "investment", label: "Investment" },
  { value: "office", label: "Office" },
  { value: "commission", label: "Commission" },
  { value: "agent_commission", label: "Agent Commission" },
  { value: "fee", label: "Fee" },
  { value: "add_float", label: "Add Float" },
  { value: "other", label: "Other" },
  { value: "inter_casino_transfer", label: "Inter-Casino Transfer" },
  { value: "tips", label: "Tips" },
  { value: "bonus", label: "Gaming Bonus" },
  { value: "tips_bonus", label: "Tips & Bonuses" },
  { value: "owner_topup", label: "Office (legacy top-up)" },
  { value: "refund", label: "Refund (legacy)" },
  { value: "jp", label: "JP" },
  { value: "collection", label: "Collection" },
];


/**
 * Sources selectable when creating a NEW transaction.
 * JP, Tips and Gaming Bonus live on their own Office tabs.
 * Legacy `refund`, `owner_topup` and `tips_bonus` stay readable but not selectable.
 */
export const OTHER_INCOME_SOURCES = ALL_INCOME_SOURCES.filter((s) =>
  ["investment", "office", "commission", "agent_commission", "fee", "add_float", "other"].includes(
    s.value,
  ),
);

/**
 * SINGLE SOURCE OF TRUTH for income classification (shared by every page).
 *
 *   COMMISSIONS      — real income the business earned (signed).
 *   TIPS_BONUS       — tips & gaming bonuses (signed, IN/OUT), never income.
 *   MOVEMENTS        — investment / office: wallet movement, never income.
 *   ADD_FLOAT        — approved float top-up: Basic Float only, NOT a movement.
 *   JP               — jackpot, reported on its own line with its stored sign.
 *   inter_casino_transfer — handled by the transfer registry, never income.
 */
export const COMMISSION_SOURCES: OtherIncomeSource[] = [
  "commission",
  "agent_commission",
  "fee",
  // legacy, readable only
  "other",
  // NOTE: `refund` is retired — historical rows stay readable but are NEVER counted.
];
export const TIPS_BONUS_SOURCES: OtherIncomeSource[] = ["tips", "bonus", "tips_bonus"];
export const MOVEMENT_SOURCES: OtherIncomeSource[] = ["investment", "office", "owner_topup"];
export const FLOAT_SOURCES: OtherIncomeSource[] = ["add_float"];
/**
 * COLLECTION — cash collected from the casino (signed, own Office tab).
 * Never income: a negative amount takes money OUT of the wallet, a positive
 * amount returns it. Nets into the Collections group of the monthly report.
 */
export const COLLECTION_SOURCES: OtherIncomeSource[] = ["collection"];


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

/** JP-only hard delete. The database removes the selected entry and any linked legacy storno pair atomically. */
export const useDeleteJpEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("fin_jp_delete_entry", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      toast.success("JP entry deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/** JP-only direct edit. Unlike general finance corrections, this does not create a storno row. */
export const useUpdateJpEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      business_date: string;
      wallet_id: string;
      currency: string;
      amount: number;
      note?: string;
    }) => {
      const { error } = await (supabase as any)
        .from("fin_other_incomes")
        .update({
          business_date: input.business_date,
          wallet_id: input.wallet_id,
          currency: input.currency,
          amount: input.amount,
          note: input.note || null,
        })
        .eq("id", input.id)
        .eq("source", "jp");
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      toast.success("JP entry updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/**
 * Direct edit — no storno. Finance manager / super_admin only (enforced by the
 * `fin_other_income_update` RPC). Every change is written to `fin_audit_log`
 * by the `tg_fin_audit` trigger, and the mirrored wallet transaction is kept
 * in sync by the existing mirror trigger.
 */
export const useUpdateOtherIncome = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      business_date: string;
      wallet_id: string;
      fin_category_id?: string | null;
      source: OtherIncomeSource;
      currency?: string;
      amount: number;
      fx_rate?: number;
      note?: string;
    }) => {
      if (input.source === "refund") throw new Error("Refund is retired and cannot be used");
      const { error } = await (supabase as any).rpc("fin_other_income_update", {
        p_id: input.id,
        p_business_date: input.business_date,
        p_wallet_id: input.wallet_id,
        p_source: input.source,
        p_amount: input.amount,
        p_fin_category_id: input.fin_category_id || null,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      toast.success("Entry updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/**
 * Hard delete — finance manager / super_admin only. Removes the entry, any
 * legacy storno pair and the mirrored wallet transaction; logged in
 * `fin_audit_log`.
 */
export const useDeleteOtherIncome = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { id: string }) => {
      const id = typeof input === "string" ? input : input.id;
      const { error } = await (supabase as any).rpc("fin_other_income_delete", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      toast.success("Entry deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

