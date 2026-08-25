/**
 * Read helpers for ACE finance snapshots pushed by the local ACE collector
 * (edge function `ace-finance-ingest`). Read-only — writes are server-side.
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AceLiveSlots } from "@/lib/boss-display-metrics";

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
  active_credits: number | null;
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
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
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
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
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

/** ACE live feed is only trusted while it is at most 15 minutes old. */
export const ACE_LIVE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Live ACE slots result for a location, already gated by freshness.
 * `fresh === false` means callers MUST keep their existing calculation.
 */
export function useAceLiveSlotsResult(locationCode: string | null | undefined) {
  const { data } = useAceFinanceLive(locationCode);
  const receivedAt = data?.received_at ? new Date(data.received_at).getTime() : null;
  const ageMs = receivedAt ? Date.now() - receivedAt : null;
  const fresh = ageMs != null && ageMs >= 0 && ageMs <= ACE_LIVE_MAX_AGE_MS;
  return {
    fresh,
    totalDrop: fresh ? Number(data?.total_drop ?? 0) : null,
    netWin: fresh ? Number(data?.net_win ?? 0) : null,
    activeCredits:
      fresh && data?.active_credits != null ? Number(data.active_credits) : null,
    winCashdesk:
      fresh && (data as any)?.win_cashdesk != null ? Number((data as any).win_cashdesk) : null,

    ageMs,
    periodLabel: data?.period_label ?? null,
    receivedAt: data?.received_at ?? null,
  };
}


/**
 * Applied ACE closed snapshots for one casino in a business-date range.
 * Returns a map business_date → jackpot_slip_out (ACE-only figure, never JP IN).
 */
export function useAceJackpotSlipOutByDate(
  casinoId: string | null | undefined,
  fromDate: string,
  toDate: string,
) {
  return useQuery({
    enabled: !!casinoId && !!fromDate && !!toDate,
    queryKey: ["ace-jp-slip-out", casinoId, fromDate, toDate],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from("ace_finance_snapshots" as any)
        .select("business_date, jackpot_slip_out, apply_status, period_id")
        .eq("casino_id", casinoId!)
        .gt("period_id", 0)
        .eq("apply_status", "applied")
        .gte("business_date", fromDate)
        .lte("business_date", toDate);
      if (error) throw error;
      const m = new Map<string, number>();
      ((data ?? []) as any[]).forEach((r) => {
        if (!r.business_date) return;
        m.set(r.business_date, (m.get(r.business_date) || 0) + Number(r.jackpot_slip_out || 0));
      });
      return m;
    },
    staleTime: 60_000,
  });
}


/**
 * Batched live ACE slots feed for several locations at once.
 * Returns a map location_code → gated live figures, so the Boss Dashboard can
 * derive the SAME displayed metrics for cards and for the company total.
 */
export function useAceLiveSlotsResultMany(locationCodes: (string | null)[]) {
  const codes = locationCodes.filter(Boolean) as string[];
  const results = useQueries({
    queries: codes.map((code) => ({
      queryKey: ["ace-finance-live", code],
      queryFn: async (): Promise<AceFinanceSnapshot | null> => {
        const { data, error } = await supabase
          .from("ace_finance_snapshots" as any)
          .select("*")
          .eq("location_code", code)
          .eq("period_id", 0)
          .maybeSingle();
        if (error) throw error;
        return (data ?? null) as unknown as AceFinanceSnapshot | null;
      },
      staleTime: 10_000,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    })),
  });

  const map: Record<string, AceLiveSlots> = {};
  codes.forEach((code, i) => {
    const data = results[i]?.data ?? null;
    const receivedAt = data?.received_at ? new Date(data.received_at).getTime() : null;
    const ageMs = receivedAt ? Date.now() - receivedAt : null;
    const fresh = ageMs != null && ageMs >= 0 && ageMs <= ACE_LIVE_MAX_AGE_MS;
    map[code] = {
      fresh,
      totalDrop: fresh ? Number(data?.total_drop ?? 0) : null,
      winCashdesk:
        fresh && (data as any)?.win_cashdesk != null ? Number((data as any).win_cashdesk) : null,
      activeCredits:
        fresh && data?.active_credits != null ? Number(data.active_credits) : null,
      ageMs,
      periodLabel: data?.period_label ?? null,
    };
  });
  return map;
}
