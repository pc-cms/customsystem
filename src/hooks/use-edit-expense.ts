/**
 * Manager / Finance Manager edit of an existing expense.
 *
 * Single mutation that patches `expenses` directly — relies on existing RLS
 * (manager/finance_manager/super_admin can UPDATE any row in their casino) and
 * the DB trigger `expenses_set_amount_tzs` that recomputes `amount_tzs` from
 * `amount + currency + business_date` via `fin_daily_rates`.
 *
 * Writes a structured audit row via logAction.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";

export type EditExpensePatch = {
  id: string;
  fin_category_id?: string | null;
  wallet_id?: string | null;
  amount?: number;
  currency?: "TZS" | "USD" | "EUR" | "GBP" | "KES";
  description?: string;
  player_id?: string | null;
  player_name?: string;
  /** Snapshot of pre-edit values for audit log. */
  before?: Record<string, any>;
};

export const useEditExpense = () => {
  const qc = useQueryClient();
  const { casinoId, roles } = useAuth();
  return useMutation({
    mutationFn: async (patch: EditExpensePatch) => {
      const allowed =
        roles.includes("manager") ||
        roles.includes("finance_manager") ||
        roles.includes("super_admin");
      if (!allowed) throw new Error("Manager role required");
      if (!casinoId) throw new Error("No casino");

      const update: Record<string, any> = {};
      if (patch.fin_category_id !== undefined) update.fin_category_id = patch.fin_category_id;
      if (patch.wallet_id !== undefined) update.wallet_id = patch.wallet_id;
      if (patch.amount !== undefined) update.amount = patch.amount;
      if (patch.currency !== undefined) update.currency = patch.currency;
      if (patch.description !== undefined) update.description = patch.description;
      if (patch.player_id !== undefined) update.player_id = patch.player_id;
      if (patch.player_name !== undefined) update.player_name = patch.player_name;

      if (Object.keys(update).length === 0) return;

      const { error } = await (supabase as any)
        .from("expenses")
        .update(update)
        .eq("id", patch.id);
      if (error) throw error;

      await logAction(casinoId, "expense", "EXPENSE_EDITED", {
        expense_id: patch.id,
        before: patch.before ?? null,
        after: update,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses-slots"] });
      qc.invalidateQueries({ queryKey: ["daily-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly-report"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      toast.success("Expense updated");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update expense"),
  });
};
