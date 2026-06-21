/**
 * POS Tabs hooks — open tabs of the shift + close/void.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PosTab = {
  id: string;
  casino_id: string;
  shift_id: string;
  opened_by_user_id: string;
  opened_at: string;
  closed_at: string | null;
  closed_by_user_id: string | null;
  player_id: string | null;
  player_name: string | null;
  walkin_label: string | null;
  status: "open" | "closed" | "voided";
  total_tzs: number;
  payment_split: PaymentSplit | null;
  expense_id: string | null;
  void_reason: string | null;
  business_date: string | null;
  pos_location_id: string | null;
};

export type PaymentSplit = {
  cash?: number;
  card?: number;
  comp_player?: number;
  comp_house?: number;
  /** Postpaid: charged to the player's account, settled later in Cage. Requires player_id. */
  player_charge?: number;
};

const kOpen = (casinoId: string | null, shiftId: string | null) =>
  ["pos-tabs", "open", casinoId, shiftId] as const;

export function usePosOpenTabs(casinoId: string | null, shiftId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: kOpen(casinoId, shiftId),
    enabled: !!casinoId && !!shiftId,
    queryFn: async (): Promise<PosTab[]> => {
      const { data, error } = await supabase
        .from("pos_tabs")
        .select("*")
        .eq("casino_id", casinoId!)
        .eq("shift_id", shiftId!)
        .eq("status", "open")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PosTab[];
    },
  });

  useEffect(() => {
    if (!casinoId || !shiftId) return;
    const channel = supabase
      .channel(`casino:${casinoId}:pos-tabs-${shiftId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_tabs", filter: `shift_id=eq.${shiftId}` },
        () => qc.invalidateQueries({ queryKey: kOpen(casinoId, shiftId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [casinoId, shiftId, qc]);

  return q;
}

/** Closed + voided tabs of a shift, newest first. Used for receipt reprint history. */
export function usePosShiftClosedTabs(casinoId: string | null, shiftId: string | null) {
  return useQuery({
    queryKey: ["pos-tabs", "closed", casinoId, shiftId],
    enabled: !!casinoId && !!shiftId,
    queryFn: async (): Promise<PosTab[]> => {
      const { data, error } = await supabase
        .from("pos_tabs")
        .select("*")
        .eq("casino_id", casinoId!)
        .eq("shift_id", shiftId!)
        .in("status", ["closed", "voided"])
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PosTab[];
    },
    staleTime: 10_000,
  });
}

export function useOpenPosTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      casino_id: string;
      shift_id: string;
      opened_by_user_id: string;
      player_id?: string | null;
      player_name?: string | null;
      walkin_label?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("pos_tabs")
        .insert({
          casino_id: input.casino_id,
          shift_id: input.shift_id,
          opened_by_user_id: input.opened_by_user_id,
          player_id: input.player_id ?? null,
          player_name: input.player_name ?? null,
          walkin_label: input.walkin_label ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as PosTab;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: kOpen(v.casino_id, v.shift_id) });
    },
  });
}

export function useClosePosTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tab_id: string;
      total_tzs: number;
      payment_split: PaymentSplit;
      comp_override_id?: string | null;
    }) => {
      const patch: Record<string, any> = {
        status: "closed",
        payment_split: input.payment_split as any,
      };
      if (input.comp_override_id) patch.comp_override_id = input.comp_override_id;
      const { error } = await supabase
        .from("pos_tabs")
        .update(patch as any)
        .eq("id", input.tab_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-tabs"] }),
  });
}

/**
 * Create a comp-budget override row that authorizes a tab close which would
 * otherwise be blocked by the monthly house-comp budget trigger. Returns the
 * new override id, ready to pass into useClosePosTab.
 */
export function useCreateCompBudgetOverride() {
  return useMutation({
    mutationFn: async (input: {
      casino_id: string;
      tab_id: string;
      month_start: string; // YYYY-MM-01
      amount_tzs: number;
      manager_user_id: string;
      reason: string;
    }): Promise<string> => {
      const { data, error } = await supabase
        .from("pos_comp_budget_overrides")
        .insert({
          casino_id: input.casino_id,
          tab_id: input.tab_id,
          month_start: input.month_start,
          amount_tzs: input.amount_tzs,
          manager_user_id: input.manager_user_id,
          reason: input.reason,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
  });
}

export const COMP_BUDGET_EXCEEDED = "COMP_BUDGET_EXCEEDED";
export const isCompBudgetExceeded = (err: unknown): boolean =>
  typeof (err as any)?.message === "string" &&
  (err as any).message.includes(COMP_BUDGET_EXCEEDED);


export function useVoidPosTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tab_id: string; reason: string }) => {
      const { error } = await supabase
        .from("pos_tabs")
        .update({ status: "voided", void_reason: input.reason })
        .eq("id", input.tab_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-tabs"] }),
  });
}
