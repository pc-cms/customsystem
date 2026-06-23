import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { getBusinessDate } from "@/lib/business-day";
import { toast } from "sonner";

const BD_CACHE_KEY = (casinoId: string) => `cms.businessDate.${casinoId}`;

function readBusinessDateCache(casinoId: string): string | null {
  try {
    const raw = localStorage.getItem(BD_CACHE_KEY(casinoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: string; ts: number };
    return parsed?.value ?? null;
  } catch {
    return null;
  }
}

function writeBusinessDateCache(casinoId: string, value: string) {
  try {
    localStorage.setItem(BD_CACHE_KEY(casinoId), JSON.stringify({ value, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

/**
 * Returns the currently OPEN business date for this casino.
 *
 * Resilient ordering (prevents infinite spinners during outages):
 *  1. Seed with cached value from localStorage so first render never spins.
 *  2. RPC call to `get_current_business_date`.
 *  3. On RPC failure (network down, edge timeout): fall back to the cached
 *     value if present, otherwise to the local 11:00-EAT calculation.
 *  4. Never throw — callers always receive a date string.
 */
export function useEffectiveBusinessDate() {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["effective-business-date", casinoId],
    queryFn: async (): Promise<string> => {
      if (!casinoId) return getBusinessDate();
      try {
        const { data, error } = await supabase.rpc("get_current_business_date", {
          _casino_id: casinoId,
        });
        if (error || !data) {
          return readBusinessDateCache(casinoId) ?? getBusinessDate();
        }
        const value = data as string;
        writeBusinessDateCache(casinoId, value);
        return value;
      } catch {
        return readBusinessDateCache(casinoId) ?? getBusinessDate();
      }
    },
    initialData: () =>
      casinoId ? readBusinessDateCache(casinoId) ?? undefined : undefined,
    // The local cache is only a paint-time seed. It must never pin yesterday's
    // business day after opening the PWA/browser, otherwise Tables/Dashboard can
    // boot on the previous date until the interval fires.
    initialDataUpdatedAt: 0,
    enabled: !!casinoId,
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
    retry: (failureCount) => navigator.onLine && failureCount < 1,
    networkMode: "always",
  });
}

/** Most recent closure record (or null). */
export function useLastBusinessDayClosure() {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["last-business-day-closure", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data, error } = await supabase
        .from("business_day_closures")
        .select("*")
        .eq("casino_id", casinoId)
        .order("business_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });
}

/** Manual close. Authorized DB-side: Pit or Manager only. */
export function useCloseBusinessDay() {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async () => {
      if (!casinoId) throw new Error("No casino");
      const { data, error } = await supabase.rpc("close_business_day", {
        _casino_id: casinoId,
        _method: "manual",
        _force_close_cycles: false,
      });
      if (error) throw error;
      return data as { status: string; business_date: string; open?: any };
    },
    onSuccess: (res) => {
      qc.invalidateQueries();
      if (res?.status === "already_closed") {
        toast.info(`Day ${res.business_date} is already closed`);
      } else if (res?.status === "has_open_cycles") {
        const open = res.open || {};
        const parts: string[] = [];
        if (open.open_cage_shifts?.length) parts.push(`${open.open_cage_shifts.length} cage shift(s)`);
        if (open.active_sessions?.length) parts.push(`${open.active_sessions.length} active player session(s)`);
        if (open.open_visits?.length) parts.push(`${open.open_visits.length} open visit(s)`);
        toast.error(`Cannot close day — open: ${parts.join(", ") || "unknown"}`);
      } else {
        toast.success(`Business day ${res.business_date} closed`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Set of YYYY-MM-DD dates that have been closed for this casino in [from, to]. */
export function useClosedBusinessDates(fromDate: string, toDate: string) {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["closed-business-dates", casinoId, fromDate, toDate],
    queryFn: async (): Promise<Set<string>> => {
      if (!casinoId) return new Set();
      const { data, error } = await supabase
        .from("business_day_closures")
        .select("business_date")
        .eq("casino_id", casinoId)
        .gte("business_date", fromDate)
        .lte("business_date", toDate);
      if (error) return new Set();
      return new Set((data || []).map((r: any) => r.business_date as string));
    },
    enabled: !!casinoId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
