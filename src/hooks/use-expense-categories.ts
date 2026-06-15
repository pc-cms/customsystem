/**
 * Per-casino expense categories CRUD.
 * Scope values: 'live_game' | 'slots' | 'office' | 'any'.
 * Used by SlotsExpenses / Expenses / DailyExpenses (Add Office) and Admin CRUD.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    staleTime: 60_000,
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
    mutationFn: async (input: { category_code: string; amount: number; description: string; fin_category_id?: string | null }) => {
      if (!casinoId) throw new Error("No casino");
      const { data, error } = await (supabase as any).rpc("create_office_expense", {
        p_casino_id: casinoId,
        p_category_code: input.category_code,
        p_amount: input.amount,
        p_description: input.description,
      });
      if (error) throw error;
      // Apply optional manager override of fin_category_id
      if (input.fin_category_id && data) {
        await (supabase as any).from("expenses").update({ fin_category_id: input.fin_category_id }).eq("id", data);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-approvals"] });
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["daily-expenses"] });
      qc.invalidateQueries({ queryKey: ["finance-wallets"] });
      toast.success("Office expense recorded — MAIN_CASH debited");
    },
    onError: (e: any) => toast.error(e.message),
  });
};
