/**
 * useHourlyCheckDue — drives the red "Check" reminder banner in the Cage Live
 * and Cage Slots page headers.
 *
 * Time-window rules (Africa/Dar_es_Salaam, GMT+3, no DST):
 *   - There are 13 reminder windows per business day, each 20 minutes wide,
 *     centered on the top of every hour from 09:00 to 21:00 EAT:
 *       08:50 → 09:10, 09:50 → 10:10, …, 20:50 → 21:10.
 *   - The banner is DUE when "now" falls inside one of these windows AND no
 *     cash check of the requested kind was recorded in the same window.
 *   - Outside any window the banner is hidden.
 *
 * Kinds:
 *   - "live"  → checks the `cash_counts` table where count_type='check'.
 *   - "slots" → checks the `cage_slots_cash_counts` table where count_type='check'.
 *
 * The hook polls every 30s so the banner appears/disappears without a manual
 * refresh. Cashier saves a check → on next poll (max 30s) the banner is gone.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";

export type HourlyCheckKind = "live" | "slots";

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT+3

// Earliest / latest window center (hour-of-day, EAT)
const FIRST_HOUR = 9;
const LAST_HOUR = 21;

type Window = { start: Date; end: Date; centerHour: number } | null;

/** Returns the active reminder window (if `now` falls in one), else null. */
export const getCurrentCheckWindow = (now: Date = new Date()): Window => {
  const eatMs = now.getTime() + EAT_OFFSET_MS;
  const eat = new Date(eatMs);
  // Work in EAT components — using UTC getters on the shifted date.
  const hour = eat.getUTCHours();
  const minute = eat.getUTCMinutes();

  // Determine which window (centerHour) "now" is in:
  //  - minute >= 50 → window centered on (hour + 1)
  //  - minute <= 10 → window centered on (hour)
  //  - otherwise   → no active window
  let centerHour: number | null = null;
  if (minute >= 50) centerHour = hour + 1;
  else if (minute <= 10) centerHour = hour;

  if (centerHour === null) return null;
  if (centerHour < FIRST_HOUR || centerHour > LAST_HOUR) return null;

  // Build window bounds in EAT (then convert to real UTC Date for queries).
  const dayBase = Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate());
  const startEat = dayBase + (centerHour - 1) * 60 * 60 * 1000 + 50 * 60 * 1000;
  const endEat = dayBase + centerHour * 60 * 60 * 1000 + 10 * 60 * 1000;
  // Convert EAT epoch back to actual UTC by subtracting the offset.
  return {
    start: new Date(startEat - EAT_OFFSET_MS),
    end: new Date(endEat - EAT_OFFSET_MS),
    centerHour,
  };
};

export interface HourlyCheckState {
  due: boolean;
  /** Window end time formatted as HH:10 EAT (e.g. "21:10"). Null when no active window. */
  windowEndLabel: string | null;
}

const formatEatHHmm = (d: Date): string => {
  const eat = new Date(d.getTime() + EAT_OFFSET_MS);
  const hh = String(eat.getUTCHours()).padStart(2, "0");
  const mm = String(eat.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

export const useHourlyCheckDue = (kind: HourlyCheckKind): HourlyCheckState => {
  const { activeCasinoId: casinoId } = useCasino();

  // Compute the current window once per render. The query refetches every 30s,
  // which also re-runs this hook (React Query change → re-render), so the
  // window naturally rolls forward without a separate ticker.
  const window = getCurrentCheckWindow();

  const q = useQuery({
    queryKey: [
      "hourly-check-due",
      kind,
      casinoId,
      window?.start.toISOString() ?? null,
    ],
    enabled: !!casinoId && !!window,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<boolean> => {
      if (!casinoId || !window) return false;
      const table = kind === "live" ? "cash_counts" : "cage_slots_cash_counts";
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("casino_id", casinoId)
        .eq("count_type", "check")
        .gte("created_at", window.start.toISOString())
        .lt("created_at", window.end.toISOString());
      if (error) throw error;
      return (count ?? 0) === 0; // due = no check recorded yet in this window
    },
  });

  return {
    due: !!window && q.data === true,
    windowEndLabel: window ? formatEatHHmm(window.end) : null,
  };
};
