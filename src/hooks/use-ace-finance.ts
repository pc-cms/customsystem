/**
 * Read helpers for ACE finance snapshots pushed by the local ACE collector
 * (edge function `ace-finance-ingest`). Read-only — writes are server-side.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AceFinanceSnapshot {
  id: string;
  location_code: string;
  period_id: number;
  period_label: string;
  total_drop: number;
  net_win: number;
  win_cashdesk: number;
  cashless_money_difference: number;
  jackpot_slip_out: number;
  source: string;
  is_live: boolean;
  received_at: string;
  updated_at: string;
}

/** Latest snapshot received for one location (live row included). */
export function useAceFinanceLatest(locationCode: string | null | undefined) {
  return useQuery({
    enabled: !!locationCode,
    queryKey: ["ace-finance-latest", locationCode],
    queryFn: async (): Promise<AceFinanceSnapshot | null> => {
      const { data, error } = await supabase
        .from("ace_finance_latest" as any)
        .select("*")
        .eq("location_code", locationCode!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AceFinanceSnapshot | null;
    },
    staleTime: 30_000,
  });
}

/** The live (period_id = 0) row for one location. */
export function useAceFinanceLive(locationCode: string | null | undefined) {
  return useQuery({
    enabled: !!locationCode,
    queryKey: ["ace-finance-live", locationCode],
    queryFn: async (): Promise<AceFinanceSnapshot | null> => {
      const { data, error } = await supabase
        .from("ace_finance_snapshots" as any)
        .select("*")
        .eq("location_code", locationCode!)
        .eq("period_id", 0)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AceFinanceSnapshot | null;
    },
    staleTime: 30_000,
  });
}

/** Recent closed periods for one location, newest first. */
export function useAceFinancePeriods(locationCode: string | null | undefined, limit = 30) {
  return useQuery({
    enabled: !!locationCode,
    queryKey: ["ace-finance-periods", locationCode, limit],
    queryFn: async (): Promise<AceFinanceSnapshot[]> => {
      const { data, error } = await supabase
        .from("ace_finance_snapshots" as any)
        .select("*")
        .eq("location_code", locationCode!)
        .gt("period_id", 0)
        .order("period_id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as AceFinanceSnapshot[];
    },
    staleTime: 60_000,
  });
}
