/**
 * POS Shift hooks — current waiter's open shift, open/close shift, Z-report.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type PosShiftType = "day" | "night";

export type PosShift = {
  id: string;
  casino_id: string;
  waiter_user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  business_date: string | null;
  shift_type: PosShiftType;
  handover_from_shift_id: string | null;
  z_report: PosZReport | null;
  created_at: string;
};

/**
 * Suggest a shift segment from current EAT wall-clock.
 * Only two shift types: Day & Night. The "evening" moment is a HANDOVER (not a shift).
 *  - day:   06:00 – 17:59 (opens in morning, handover in evening)
 *  - night: 18:00 – 05:59 (opens at evening handover, closes in morning)
 */
export function suggestShiftType(): PosShiftType {
  const h = parseInt(
    new Date().toLocaleString("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      hour: "2-digit",
      hour12: false,
    }),
    10,
  );
  if (h >= 6 && h < 18) return "day";
  return "night";
}


export type PosZReportTotals = {
  gross_tzs: number;
  cash: number;
  card: number;
  comp_player: number;
  comp_house: number;
};

export type PosZReportCounts = {
  tabs_closed: number;
  tabs_voided: number;
  orders_total: number;
  orders_void: number;
};

export type PosZReportLine = {
  category_name?: string;
  item_id?: string;
  item_name?: string;
  qty: number;
  total_tzs: number;
};

export type PosZReport = {
  shift_id: string;
  casino_id: string;
  waiter_user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  totals: PosZReportTotals;
  expected_cash: number;
  cash_delta: number;
  counts: PosZReportCounts;
  by_category: PosZReportLine[];
  by_item: PosZReportLine[];
  computed_at: string;
};

const key = (casinoId: string | null, userId: string | null) =>
  ["pos-shift", "current", casinoId, userId] as const;

export function usePosCurrentShift(casinoId: string | null, userId: string | null) {
  return useQuery({
    queryKey: key(casinoId, userId),
    enabled: !!casinoId && !!userId,
    queryFn: async (): Promise<PosShift | null> => {
      const { data, error } = await supabase
        .from("pos_shifts")
        .select("*")
        .eq("casino_id", casinoId!)
        .eq("waiter_user_id", userId!)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PosShift | null;
    },
  });
}

export function useOpenPosShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      casino_id: string;
      waiter_user_id: string;
      opening_cash: number;
      shift_type: PosShiftType;
    }) => {
      const { data, error } = await supabase
        .from("pos_shifts")
        .insert({
          casino_id: input.casino_id,
          waiter_user_id: input.waiter_user_id,
          opening_cash: input.opening_cash,
          shift_type: input.shift_type,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as PosShift;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.casino_id, vars.waiter_user_id) });
    },
  });
}

/**
 * Handover shift: atomically close the outgoing shift and open a new one
 * for the incoming waiter (opening_cash = closing_cash).
 */
export function useHandoverShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      closing_shift_id: string;
      new_waiter_user_id: string;
      new_shift_type: PosShiftType;
      closing_cash: number;
    }): Promise<{ closed_shift_id: string; new_shift_id: string; z_report: PosZReport }> => {
      const { data, error } = await supabase.rpc("pos_handover_shift", {
        _closing_shift_id: input.closing_shift_id,
        _new_waiter_user_id: input.new_waiter_user_id,
        _new_shift_type: input.new_shift_type,
        _closing_cash: input.closing_cash,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-shift"] });
      qc.invalidateQueries({ queryKey: ["pos-tabs"] });
      qc.invalidateQueries({ queryKey: ["pos-zreport"] });
    },
  });
}


/** Any open POS shift in a casino (used by Pit quick-order). */
export function usePosAnyOpenShift(casinoId: string | null) {
  return useQuery({
    queryKey: ["pos-shift", "any-open", casinoId],
    enabled: !!casinoId,
    queryFn: async (): Promise<PosShift | null> => {
      const { data, error } = await supabase
        .from("pos_shifts")
        .select("*")
        .eq("casino_id", casinoId!)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PosShift | null;
    },
    ...liveQueryOptions(),
  });
}

/** Preview Z-report for an OPEN shift (closing_cash treated as 0 until close). Read-only. */
export function usePosZReportPreview(shiftId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["pos-zreport", "preview", shiftId],
    enabled: !!shiftId && enabled,
    queryFn: async (): Promise<PosZReport> => {
      const { data, error } = await supabase.rpc("pos_compute_z_report", { _shift_id: shiftId! });
      if (error) throw error;
      return data as unknown as PosZReport;
    },
  });
}

export function useClosePosShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { shift_id: string; closing_cash: number }): Promise<PosZReport> => {
      const { data, error } = await supabase.rpc("pos_close_shift", {
        _shift_id: input.shift_id,
        _closing_cash: input.closing_cash,
      });
      if (error) throw error;
      return data as unknown as PosZReport;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-shift"] });
      qc.invalidateQueries({ queryKey: ["pos-tabs"] });
      qc.invalidateQueries({ queryKey: ["pos-zreport"] });
    },
  });
}
