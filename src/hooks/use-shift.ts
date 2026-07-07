import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";
import { offlineMutation } from "@/lib/offline-mutation";

// ============ LAST CLOSED SHIFT (for carrying over rates) ============
export const useLastClosedShift = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["last-closed-shift", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data, error } = await supabase
        .from("shifts")
        .select("exchange_rates, closing_count, closed_at")
        .eq("casino_id", casinoId)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    ...liveQueryOptions(),
    refetchOnMount: "always",
  });
};

// ============ ACTIVE SHIFT ============
export const useActiveShift = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["active-shift", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("casino_id", casinoId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    // Hot KPI: active shift drives Cage / Pit headers; must always be fresh.
    ...liveQueryOptions(),
    refetchOnMount: "always",
  });
};

export const useOpenShift = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      exchange_rates: Record<string, number>;
      opening_float: Record<string, any>;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      // Pre-attempt audit trail: records the user even if RLS blocks the INSERT.
      await logAction(casinoId, "system", "SHIFT_OPEN_ATTEMPT", {
        opening_total: Number((input.opening_float as any)?.totals?.total_tzs) || 0,
      });
      const { data, error } = await supabase
        .from("shifts")
        .insert({
          casino_id: casinoId,
          opened_by: user.id,
          exchange_rates: input.exchange_rates,
          opening_float: input.opening_float,
        } as any)
        .select()
        .single();
      if (error) {
        await logAction(casinoId, "system", "SHIFT_OPEN_FAILED", {
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        if (error.message?.includes("shifts_one_open_per_casino")) {
          throw new Error("A shift is already open");
        }
        throw error;
      }
      await logAction(casinoId, "system", "SHIFT_OPENED", { shift_id: data.id });

      // Seed an "opening" cash check so the cashier (and history) sees the
      // exact float the shift opened with — same shape as a manual check.
      const f = input.opening_float || {};
      const totals = (f.totals || {}) as Record<string, any>;
      const openingTotal = Number(totals.total_tzs) || 0;
      try {
        await supabase.from("cash_counts").insert({
          casino_id: casinoId,
          shift_id: data.id,
          count_type: "check" as any,
          currency: "ALL",
          denominations: {
            chips: f.chips || {},
            cash: f.cash || {},
            bank: f.bank || {},
            mobile: f.mobile || {},
            totals: {
              ...totals,
              expected: openingTotal,
              counted: openingTotal,
              difference: 0,
              balanced: true,
              is_opening: true,
            },
          },
          total: openingTotal,
          counted_by: user.id,
        } as any);
      } catch (e) {
        console.error("Failed to seed opening cash check", e);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-shift"] });
      toast.success("Shift opened");
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useCloseShift = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      closing_count: Record<string, any>;
      closing_cash: Record<string, any>;
      notes: string;
      // Per-provider Cashless IN/OUT totals (manual cashier entry, with
      // gray hints from /cashless transactions). Persisted to dedicated
      // `shifts.cashless_in_providers` / `cashless_out_providers` columns.
      cashless_in_providers?: Record<string, number>;
      cashless_out_providers?: Record<string, number>;
      // The fields below are intentionally IGNORED on the server side —
      // they're sent only as a UI-side reference and are overwritten by the
      // authoritative `compute_shift_close` RPC result before persisting.
      cash_result?: number;
      miss_total?: number;
      shift_result?: number;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");

      // 1. CASH RESULT = NET cash earned during the shift (closing cash −
      //    opening cash float), excluding chips. Reflects only the money the
      //    shift actually generated, not the starting float.
      const cc = (input.closing_count as any)?.totals || {};
      const of = (input.closing_cash as any) || {};
      const countedTotal = Number(cc.total_tzs || 0);
      const countedChips = Number(cc.chips_tzs || 0);
      const countedCash = countedTotal - countedChips;
      const cashDeltaFromUI = Number(of.cash_delta);
      const cashResultFinal = Number.isFinite(cashDeltaFromUI)
        ? cashDeltaFromUI
        : (countedTotal > 0
            ? countedCash
            : Number(input.cash_result ?? 0));

      const missTotalFinal = Number(input.miss_total ?? (input.closing_count as any)?.chip_miss_total ?? 0);

      // 2. Persist the closing snapshot first. The DB trigger writes
      //    shifts.miss_total from closing_count and recomputes balance using
      //    the new row, avoiding stale pre-close values.
      const tablesResultFinal = Number(input.shift_result ?? 0);

      // Pre-attempt audit trail: captures cashier's intended snapshot even if
      // RLS blocks the UPDATE. Lets us see WHO tried to close, WHAT they entered,
      // and WHY the database refused.
      await logAction(casinoId, "system", "SHIFT_CLOSE_ATTEMPT", {
        shift_id: input.shift_id,
        cash_result: cashResultFinal,
        miss_total: missTotalFinal,
        shift_result: tablesResultFinal,
        closing_count_totals: (input.closing_count as any)?.totals,
        chips: (input.closing_count as any)?.chips,
        chip_miss: (input.closing_count as any)?.chip_miss,
        cash: (input.closing_count as any)?.cash,
        mobile: (input.closing_count as any)?.mobile,
        bank: (input.closing_count as any)?.bank,
        offline: !navigator.onLine,
      });

      const closingNotes = navigator.onLine
        ? input.notes
        : `[OFFLINE CLOSE — pending server reconciliation]\n${input.notes}`;

      const updatePayload = {
        status: "closed" as const,
        closed_at: new Date().toISOString(),
        closed_by: user.id,
        closing_count: {
          ...input.closing_count,
          ...(navigator.onLine ? {} : { requires_review: true, closed_offline: true }),
        },
        closing_cash: {
          ...input.closing_cash,
          cash_result: cashResultFinal,
          shift_result: tablesResultFinal,
        },
        notes: closingNotes,
        cash_result: cashResultFinal,
        miss_total: missTotalFinal,
        shift_result: tablesResultFinal,
        cashless_in_providers: input.cashless_in_providers ?? {},
        cashless_out_providers: input.cashless_out_providers ?? {},
      };

      // OFFLINE PATH — queue the UPDATE; DB trigger will reconcile on sync.
      // We deliberately skip compute_shift_close RPC (server-side balance
      // verification) until the row actually reaches the database.
      if (!navigator.onLine) {
        const res = await offlineMutation({
          table: "shifts",
          operation: "update",
          payload: { ...updatePayload, _match: { id: input.shift_id } },
          meta: { kind: "SHIFT_CLOSE", shift_id: input.shift_id },
        });
        if (res.error) throw new Error(res.error);
        await logAction(casinoId, "system", "SHIFT_CLOSED_OFFLINE", {
          shift_id: input.shift_id,
          queued: true,
          requires_review: true,
        });
        return;
      }

      const { error } = await supabase
        .from("shifts")
        .update(updatePayload as any)
        .eq("id", input.shift_id);
      if (error) {
        await logAction(casinoId, "system", "SHIFT_CLOSE_FAILED", {
          shift_id: input.shift_id,
          stage: "update_shifts",
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        throw error;
      }

      // 3. Verify through the authoritative DB function after the row exists
      //    as closed. This is a functional check, not a source for UI values.
      const { data: rpcData, error: rpcError } = await (supabase as any)
        .rpc("compute_shift_close", { p_shift_id: input.shift_id });
      if (rpcError) {
        await logAction(casinoId, "system", "SHIFT_CLOSE_FAILED", {
          shift_id: input.shift_id,
          stage: "compute_shift_close_rpc",
          message: rpcError.message,
          code: (rpcError as any).code,
          details: (rpcError as any).details,
          hint: (rpcError as any).hint,
        });
        throw rpcError;
      }
      await logAction(casinoId, "system", "SHIFT_CLOSED", {
        shift_id: input.shift_id,
        server_totals: rpcData,
      });

      // Seed a "closing" cash check so the closing snapshot shows up in the
      // cashier check history alongside the opening seed and mid-shift checks.
      // Same shape as a manual check; marked with is_closing for the UI tag.
      try {
        const closing = (input.closing_count || {}) as Record<string, any>;
        const totals = (closing.totals || {}) as Record<string, any>;
        const closingTotal = Number(totals.total_tzs) || 0;
        await supabase.from("cash_counts").insert({
          casino_id: casinoId,
          shift_id: input.shift_id,
          count_type: "check" as any,
          currency: "ALL",
          denominations: {
            chips: closing.chips || {},
            cash: closing.cash || {},
            bank: closing.bank || {},
            mobile: closing.mobile || {},
            totals: {
              ...totals,
              expected: closingTotal,
              counted: closingTotal,
              difference: 0,
              balanced: true,
              is_closing: true,
            },
          },
          total: closingTotal,
          counted_by: user.id,
        } as any);
      } catch (e) {
        console.error("Failed to seed closing cash check", e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-shift"] });
      qc.invalidateQueries({ queryKey: ["last-closed-shift"] });
      toast.success(navigator.onLine ? "Shift closed" : "Shift queued for sync — requires manager review on reconnect");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ============ CASH COUNTS ============
export const useCashCounts = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cash-counts", shiftId],
    queryFn: async () => {
      if (!shiftId) return [];
      const { data, error } = await supabase
        .from("cash_counts")
        .select("*")
        .eq("shift_id", shiftId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!shiftId,
  });
};

export const useCreateCashCount = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      count_type: "opening" | "closing" | "check";
      currency: string;
      denominations: Record<string, any>;
      total: number;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload = {
        casino_id: casinoId,
        shift_id: input.shift_id,
        count_type: input.count_type as any,
        currency: input.currency,
        denominations: input.denominations,
        total: input.total,
        counted_by: user.id,
      };
      const res = await offlineMutation({
        table: "cash_counts",
        operation: "insert",
        payload,
        meta: { kind: "CASH_COUNT", shift_id: input.shift_id },
      });
      if (res.error) throw new Error(res.error);
      await logAction(casinoId, "system", "CASH_COUNT", {
        shift_id: input.shift_id,
        type: input.count_type,
        currency: input.currency,
        total: input.total,
        offline: res.offline,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-counts"] });
      toast.success("Cash count recorded");
    },
    onError: (e) => toast.error(e.message),
  });
};
