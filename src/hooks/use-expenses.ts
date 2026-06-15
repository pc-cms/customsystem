import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { offlineMutation } from "@/lib/offline-mutation";
import { toast } from "sonner";
import type { SafeExpenseInsert } from "@/lib/safe-inserts";

export type ExpenseSource = "live_game" | "slots" | "office" | "all";

export const useExpenses = (
  date?: string,
  cageType: "live_game" | "slots" = "live_game",
  range?: { from?: string; to?: string },
  options?: { source?: ExpenseSource },
) => {
  const { casinoId } = useAuth();
  const source = options?.source;
  return useQuery({
    queryKey: ["expenses", casinoId, date, cageType, range?.from, range?.to, source ?? "_default"],
    queryFn: async () => {
      if (!casinoId) return [];
      let query = supabase
        .from("expenses")
        .select("*, players(id, first_name, last_name)")
        .eq("casino_id", casinoId)
        .order("created_at", { ascending: false });

      // Source/cage_type gates
      if (source === undefined) {
        // Legacy behavior — Live cashier scope.
        query = query.eq("cage_type", cageType).neq("source", "office");
      } else if (source !== "all") {
        query = query.eq("source", source);
      }
      // source === "all" → no extra gates (managers view across all sources)

      if (range?.from || range?.to) {
        const from = range.from || range.to!;
        const to = range.to || range.from!;
        query = query
          .gte("business_date", from)
          .lte("business_date", to)
          .limit(2000);
      } else if (date) {
        query = query.eq("business_date", date);
      } else {
        query = query.limit(200);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
};


/** Slots cage expenses for a whole business day.
 *  Slots expenses have NO shift split — both day and evening slots shifts
 *  share the same business-day expense pool. */
export const useSlotsExpenses = (businessDate: string | undefined) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["expenses-slots", casinoId, businessDate],
    queryFn: async () => {
      if (!casinoId || !businessDate) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select("*, players(first_name, last_name)")
        .eq("casino_id", casinoId)
        .eq("business_date", businessDate)
        .eq("source", "slots")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId && !!businessDate,
    staleTime: 1000 * 60,
  });
};

export const useCreateSlotsExpense = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      slots_shift_id: string;
      category: string;
      amount: number;
      description: string;
      player_id?: string | null;
      player_name?: string;
      fin_category_id?: string | null;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await (supabase as any).from("expenses").insert({
        casino_id: casinoId,
        category: input.category,
        category_code: input.category,
        amount: input.amount,
        description: input.description,
        player_id: input.player_id ?? null,
        player_name: input.player_name || "",
        cage_slots_shift_id: input.slots_shift_id,
        cage_type: "slots",
        source: "slots",
        created_by: user.id,
        fin_category_id: input.fin_category_id ?? null,
      });
      if (error) throw error;
      await logAction(casinoId, "expense", "CAGE_SLOTS_EXPENSE_CREATED", {
        slots_shift_id: input.slots_shift_id, category: input.category, amount: input.amount,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-approvals"] });
      qc.invalidateQueries({ queryKey: ["daily-expenses"] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.slots_shift_id] });
      toast.success("Expense recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
};


export const useCreateExpense = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      category: string;
      amount: number;
      description: string;
      player_id: string | null;
      player_name?: string;
      shift_id?: string | null;
      fin_category_id?: string | null;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload: SafeExpenseInsert = {
        casino_id: casinoId,
        category: input.category as any,
        category_code: input.category,
        amount: input.amount,
        description: input.description,
        player_id: input.player_id,
        player_name: input.player_name || "",
        shift_id: input.shift_id || null,
        created_by: user.id,
        ...(input.fin_category_id ? { fin_category_id: input.fin_category_id } : {}),
      } as any;

      const result = await offlineMutation({
        table: "expenses",
        operation: "insert",
        payload,
        meta: { category: input.category, amount: input.amount },
      });

      if (result.error) throw new Error(result.error);

      if (!result.offline) {
        await logAction(casinoId, "expense", "EXPENSE_CREATED", { category: input.category, amount: input.amount });
      }
      return { offline: result.offline };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-approvals"] });
      qc.invalidateQueries({ queryKey: ["daily-expenses"] });
      if (!res.offline) toast.success("Expense recorded");
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useDeleteExpense = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (exp: { id: string; amount: number; category: string }) => {
      if (!user || !casinoId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", exp.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Cannot cancel: expense already approved or no permission");
      }
      await logAction(casinoId, "expense", "EXPENSE_DELETED", {
        expense_id: exp.id,
        category: exp.category,
        amount: exp.amount,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("Expense deleted"); },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });
};

export const useApproveExpense = () => {
  const qc = useQueryClient();
  const { casinoId, user, roles, managerOverride } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const isRoleManager =
        roles.includes("manager") ||
        roles.includes("shift_manager") ||
        roles.includes("super_admin");

      if (isRoleManager) {
        const { error } = await supabase.from("expenses").update({
          approved: true,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        }).eq("id", id);
        if (error) throw error;
      } else if (managerOverride.active && managerOverride.managerId) {
        const { error } = await (supabase as any).rpc("approve_expense_as_manager", {
          p_expense_id: id,
          p_manager_id: managerOverride.managerId,
        });
        if (error) throw error;
      } else {
        throw new Error("Manager access required to approve expenses");
      }
      await logAction(casinoId!, "expense", "EXPENSE_APPROVED", {
        expense_id: id,
        via_override: !isRoleManager,
        manager_id: isRoleManager ? user.id : managerOverride.managerId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["expenses-approvals"] });
      toast.success("Expense approved");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to approve"),
  });
};

/** Manager-only: re-classify an existing expense by changing its finance plan
 *  category. Does not touch the operational `category` code, amounts, dates or
 *  any cash-affecting field — pure analytical re-bucketing for Monthly Report.
 *  Pass `null` to clear the override (auto-resolve will kick in if category
 *  changes later). */
export const useUpdateExpenseFinCategory = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; fin_category_id: string | null }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("expenses")
        .update({ fin_category_id: input.fin_category_id })
        .eq("id", input.id);
      if (error) throw error;
      await logAction(casinoId!, "expense", "EXPENSE_FIN_CATEGORY_CHANGED", {
        expense_id: input.id,
        fin_category_id: input.fin_category_id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update category"),
  });
};

/** Manager-only: re-classify the operational category of an existing expense.
 *  Updates both `category` and `category_code`. Does NOT touch amount, cash,
 *  approval or fin_category. Writes an audit log row. */
export const useUpdateExpenseCategory = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; category: string; prev_category?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("expenses")
        .update({ category: input.category, category_code: input.category })
        .eq("id", input.id);
      if (error) throw error;
      await logAction(casinoId!, "expense", "EXPENSE_CATEGORY_CHANGED", {
        expense_id: input.id,
        from: input.prev_category ?? null,
        to: input.category,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly"] });
      toast.success("Category updated");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update category"),
  });
};

/** Manager-only: cancel (delete) an existing expense — including approved ones.
 *  RLS already lets managers delete any expense in their casino; this just
 *  routes through one mutation with an audit-log marker. */
export const useCancelExpenseAsManager = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (exp: { id: string; amount: number; category: string; approved: boolean; reason?: string }) => {
      if (!user || !casinoId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", exp.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Cannot cancel: not permitted");
      }
      await logAction(casinoId, "expense", "EXPENSE_CANCELLED", {
        expense_id: exp.id,
        category: exp.category,
        amount: exp.amount,
        was_approved: exp.approved,
        reason: exp.reason || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly"] });
      toast.success("Expense cancelled");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to cancel"),
  });
};

