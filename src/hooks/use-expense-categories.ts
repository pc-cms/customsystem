/**
 * Per-casino expense categories CRUD.
 * Scope values: 'live_game' | 'slots' | 'office' | 'any'.
 * Used by SlotsExpenses / Expenses / DailyExpenses (Add Office) and Admin CRUD.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export type CategoryScope = "live_game" | "slots" | "office" | "any";

export interface ExpenseCategory {
  id: string;
  casino_id: string;
  code: string;
  label: string;
  scope: CategoryScope;
  active: boolean;
  sort_order: number;
}

export const useExpenseCategories = (scope?: CategoryScope | "all") => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["expense-categories", casinoId, scope ?? "all"],
    queryFn: async () => {
      if (!casinoId) return [] as ExpenseCategory[];
      let q = (supabase as any)
        .from("expense_categories")
        .select("id, casino_id, code, label, scope, active, sort_order")
        .eq("casino_id", casinoId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data || []) as ExpenseCategory[];
      if (scope && scope !== "all") {
        rows = rows.filter(r => r.scope === scope || r.scope === "any");
      }
      return rows;
    },
    enabled: !!casinoId,
    ...liveQueryOptions(), // 24h — categories change rarely
    gcTime: 1000 * 60 * 60 * 24 * 7,
  });
};

export const useCreateExpenseCategory = () => {
  const qc = useQueryClient();
  const { casinoId } = useAuth();
  return useMutation({
    mutationFn: async (input: { code: string; label: string; scope: CategoryScope; sort_order?: number }) => {
      if (!casinoId) throw new Error("No casino");
      const { error } = await (supabase as any).from("expense_categories").insert({
        casino_id: casinoId,
        code: input.code.trim(),
        label: input.label.trim(),
        scope: input.scope,
        sort_order: input.sort_order ?? 100,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("Category added");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useUpdateExpenseCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; label?: string; scope?: CategoryScope; active?: boolean; sort_order?: number }) => {
      const patch: any = {};
      if (input.label !== undefined) patch.label = input.label;
      if (input.scope !== undefined) patch.scope = input.scope;
      if (input.active !== undefined) patch.active = input.active;
      if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
      const { error } = await (supabase as any).from("expense_categories").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-categories"] }),
    onError: (e: any) => toast.error(e.message),
  });
};

export const useDeleteExpenseCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("Category deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useCreateOfficeExpense = () => {
  const qc = useQueryClient();
  const { casinoId } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      category_code: string;
      amount: number;
      description: string;
      fin_category_id?: string | null;
      wallet_id: string;
      currency?: string;
      exchange_rate?: number;
      business_date?: string | null;
    }) => {
      if (!casinoId) throw new Error("No casino");
      if (!input.wallet_id) throw new Error("Choose a wallet");
      const { data, error } = await (supabase as any).rpc("create_office_expense", {
        p_casino_id: casinoId,
        p_category_code: input.category_code,
        p_amount: input.amount,
        p_description: input.description,
        p_wallet_id: input.wallet_id,
        p_fin_category_id: input.fin_category_id ?? null,
        p_currency: input.currency ?? "TZS",
        p_exchange_rate: input.exchange_rate ?? 1,
        p_business_date: input.business_date ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-approvals"] });
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["daily-expenses"] });
      qc.invalidateQueries({ queryKey: ["finance-wallets"] });
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      toast.success("Office expense recorded — wallet debited");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

