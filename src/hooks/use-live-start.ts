import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { getBusinessDate, nowEAT } from "@/lib/business-day";
import { parseStartHour, liveOpsAllowedAt, startLabel } from "@/lib/live-hours";
import { toast } from "sonner";

export interface LiveStartEvent {
  id: string;
  casino_id: string;
  business_date: string;
  event_type: "start" | "correction";
  effective_start_time: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Effective LIVE START for a casino/business day.
 * Falls back to `casinos.shift_start` when no explicit event exists.
 */
export function useLiveStart(dateOverride?: string) {
  const { activeCasinoId } = useCasino();
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessDate = dateOverride || serverBusinessDate || getBusinessDate();

  const q = useQuery({
    queryKey: ["live-start", activeCasinoId, businessDate],
    enabled: !!activeCasinoId && !!businessDate,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: eff }, { data: events }] = await Promise.all([
        (supabase as any).rpc("get_effective_live_start", {
          _casino_id: activeCasinoId,
          _business_date: businessDate,
        }),
        (supabase as any)
          .from("live_operation_start_events")
          .select("*")
          .eq("casino_id", activeCasinoId)
          .eq("business_date", businessDate)
          .order("created_at", { ascending: true }),
      ]);
      return {
        effective: (eff as string) || null,
        events: ((events || []) as LiveStartEvent[]),
      };
    },
  });

  const effective = q.data?.effective ?? null;
  const events = q.data?.events ?? [];
  const startHour = parseStartHour(effective);

  return {
    businessDate,
    isLoading: q.isLoading,
    /** raw effective value, e.g. "18:00" */
    effective,
    /** normalised "HH:00" */
    label: startLabel(effective),
    startHour,
    events,
    /** an explicit START event exists for this casino/day */
    started: events.some((e) => e.event_type === "start"),
    startEvent: events.find((e) => e.event_type === "start") ?? null,
    lastEvent: events.length ? events[events.length - 1] : null,
    /** live operations (open table / LIVE cashdesk) allowed right now */
    allowedNow: liveOpsAllowedAt(nowEAT(), startHour),
  };
}

export function useStartLive() {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ businessDate, time }: { businessDate: string; time: string }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { data, error } = await (supabase as any).rpc("live_start_begin", {
        _casino_id: activeCasinoId,
        _business_date: businessDate,
        _time: time,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-start"] });
      toast.success("Live operations started");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCorrectLiveStart() {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ businessDate, time, reason }: { businessDate: string; time: string; reason: string }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { data, error } = await (supabase as any).rpc("live_start_correct", {
        _casino_id: activeCasinoId,
        _business_date: businessDate,
        _time: time,
        _reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-start"] });
      toast.success("Live start corrected");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
