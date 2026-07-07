/**
 * Per-casino daily FX rates (TZS base). Office-owned.
 * Cage should read today's rate from here on shift open (Phase next).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { FOREIGN_CURRENCIES } from "@/lib/currency";
import { toast } from "sonner";


export type FinDailyRate = {
  id: string;
  casino_id: string;
  business_date: string;
  currency: string;
  rate_to_tzs: number;
  set_by: string | null;
  set_at: string;
};

/** All rates for the active casino across [from..to]. */
export const useFinDailyRates = (from: string, to: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-daily-rates", activeCasinoId, from, to],
    queryFn: async () => {
      if (!activeCasinoId) return [] as FinDailyRate[];
      const { data, error } = await supabase
        .from("fin_daily_rates")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: false });
      if (error) throw error;
      return (data || []) as FinDailyRate[];
    },
    enabled: !!activeCasinoId,
    staleTime: 1000 * 60 * 60, // 1h — daily rates set once per day
  });
};

export const useUpsertFinDailyRate = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      business_date: string;
      currency: string;
      rate_to_tzs: number;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await supabase.from("fin_daily_rates").upsert(
        {
          casino_id: activeCasinoId,
          business_date: input.business_date,
          currency: input.currency,
          rate_to_tzs: input.rate_to_tzs,
          set_at: new Date().toISOString(),
        },
        { onConflict: "casino_id,business_date,currency" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-daily-rates"] });
      qc.invalidateQueries({ queryKey: ["fin-daily-rate-today"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/** Resolve a single (date, currency) → rate. Returns null if missing. */
export const useFinDailyRate = (businessDate?: string, currency?: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-daily-rate-today", activeCasinoId, businessDate, currency],
    queryFn: async () => {
      if (!activeCasinoId || !businessDate || !currency) return null;
      if (currency === "TZS") return 1;
      const { data } = await supabase
        .from("fin_daily_rates")
        .select("rate_to_tzs")
        .eq("casino_id", activeCasinoId)
        .eq("business_date", businessDate)
        .eq("currency", currency)
        .maybeSingle();
      return data ? Number(data.rate_to_tzs) : null;
    },
    enabled: !!activeCasinoId && !!businessDate && !!currency,
    ...liveQueryOptionsWithFallback(3600000),
  });
};

/**
 * Resolve foreign-currency rates for a given business date (defaults to today's
 * effective business date). Returns a Record<currency, number> — currencies
 * without an Office-set rate are simply absent from the map.
 */
export const useFinDailyRatesForDate = (businessDate?: string) => {
  const { activeCasinoId } = useCasino();
  const { data: today } = useEffectiveBusinessDate();
  const date = businessDate ?? today;
  return useQuery({
    queryKey: ["fin-daily-rates-for-date", activeCasinoId, date],
    queryFn: async () => {
      if (!activeCasinoId || !date) return {} as Record<string, number>;
      // Auto-carry: if today's rates are missing, copy the most recent
      // prior day's value per currency. Managers may override manually.
      await supabase.rpc("ensure_fin_daily_rates", {
        _casino_id: activeCasinoId,
        _business_date: date,
      });
      const { data, error } = await supabase
        .from("fin_daily_rates")
        .select("currency, rate_to_tzs")
        .eq("casino_id", activeCasinoId)
        .eq("business_date", date)
        .in("currency", FOREIGN_CURRENCIES);
      if (error) throw error;
      const out: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const v = Number(r.rate_to_tzs);
        if (v > 0) out[r.currency] = v;
      });
      return out;
    },
    enabled: !!activeCasinoId && !!date,
  });
};

/**
 * Auto-carry today's daily rates from the most recent prior day.
 * Called on cage/slots shift open and Office → Rates load so today's
 * row is always present; managers can override the value manually.
 */
export const useEnsureDailyRates = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  const { data: today } = useEffectiveBusinessDate();
  return useMutation({
    mutationFn: async (businessDate?: string) => {
      const date = businessDate ?? today;
      if (!activeCasinoId || !date) return;
      const { error } = await supabase.rpc("ensure_fin_daily_rates", {
        _casino_id: activeCasinoId,
        _business_date: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-daily-rates"] });
      qc.invalidateQueries({ queryKey: ["fin-daily-rates-for-date"] });
      qc.invalidateQueries({ queryKey: ["fin-daily-rate-today"] });
    },
  });
};

