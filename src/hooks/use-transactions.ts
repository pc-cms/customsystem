import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { offlineMutation } from "@/lib/offline-mutation";
import { toast } from "sonner";
import { formatNumberSpaces } from "@/lib/currency";
import type { SafeTransactionInsert } from "@/lib/safe-inserts";
import { businessDayHourUTC } from "@/lib/business-day";
import { liveQueryOptions } from "@/lib/live-query-options";

export const useTransactions = (date?: string) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["transactions", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      let query = supabase
        .from("transactions")
        .select("*, players(first_name, last_name, nickname), gaming_tables(name)")
        .eq("casino_id", casinoId)
        .order("created_at", { ascending: false });
      
      if (date) {
        // Business day window: D 11:00 EAT → D+1 11:00 EAT
        query = query.gte("created_at", businessDayHourUTC(date, 7)).lt("created_at", businessDayHourUTC(date, 7 + 24));
      }
      
      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    // Realtime-first: `transactions` is subscribed via useModuleLiveSync
    // for the `cage` / `cage_view` modules. No poll / no refetchOnMount.
    ...liveQueryOptions(),
  });
};

export const useCreateTransaction = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      player_id: string | null;
      table_id: string | null;
      type: "buy" | "cashout" | "in" | "out" | "tips_live" | "tips_poker" | "tips_floor";
      amount: number;
      chips?: Record<string, number>;
      shift_id?: string;
      tips_recipient_employee_id?: string | null;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload: SafeTransactionInsert & { tips_recipient_employee_id?: string | null } = {
        casino_id: casinoId,
        player_id: input.player_id,
        table_id: input.table_id,
        type: input.type,
        amount: input.amount,
        chips: input.chips || null,
        operator_id: user.id,
        shift_id: input.shift_id || null,
        tips_recipient_employee_id: input.tips_recipient_employee_id ?? null,
      };

      const result = await offlineMutation({
        table: "transactions",
        operation: "insert",
        payload,
        meta: { type: input.type, amount: input.amount },
      });

      if (result.error) throw new Error(result.error);
      return { offline: result.offline };
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["transactions"] });
      const { getBusinessDate } = await import("@/lib/business-day");
      const today = getBusinessDate();
      const prevTxs = qc.getQueryData(["transactions", casinoId, today]);

      const optimisticTx = {
        id: `optimistic-${Date.now()}`,
        casino_id: casinoId,
        player_id: vars.player_id,
        table_id: vars.table_id,
        type: vars.type,
        amount: vars.amount,
        chips: vars.chips || null,
        operator_id: user?.id,
        shift_id: vars.shift_id || null,
        tips_recipient_employee_id: vars.tips_recipient_employee_id ?? null,
        created_at: new Date().toISOString(),
        _optimistic: true,
      };

      qc.setQueryData(["transactions", casinoId, today], (old: any[] = []) => [optimisticTx, ...old]);
      const label =
        vars.type === "buy" || vars.type === "in" ? "IN" :
        vars.type === "tips_live"  ? "TIPS · Live Game" :
        vars.type === "tips_poker" ? "TIPS · Club Poker" :
        vars.type === "tips_floor" ? "TIPS · Floor" :
        "OUT";
      toast.success(`${label} recorded: TZS ${formatNumberSpaces(vars.amount)}`);
      return { prevTxs, today };
    },
    onError: (e, _vars, context) => {
      if (context?.prevTxs !== undefined) {
        qc.setQueryData(["transactions", casinoId, context.today], context.prevTxs);
      }
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["player-economy"] });
      qc.invalidateQueries({ queryKey: ["tips"] });
    },
  });
};
