/**
 * useCashChecksByBusinessDate — fetches all cash_counts of count_type='check'
 * for the user's casino on a given business date (Africa/Dar_es_Salaam, 07:00 rollover).
 *
 * A check belongs to the BUSINESS DAY of its shift, not to the calendar day of
 * its `created_at`. This matters for the closing seed (inserted right after
 * midnight EAT — technically next calendar day, but operationally it closes the
 * previous business day). We resolve membership via the shift's `opened_at`:
 *  - find shifts whose `opened_at` falls in the business-day window
 *  - return all cash_counts attached to those shifts
 *  - plus orphan checks (no shift_id) whose `created_at` falls in the window
 *
 * Slots checks are also included (source='slots'), normalised to the same shape
 * so the Cage View checks tab can render both with a single popup viewer.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const businessDayWindowUtc = (businessDate: string) => {
  // Africa/Dar_es_Salaam = UTC+3 fixed (no DST). Business day starts 05:00 EAT
  // → 02:00 UTC of the same calendar date, ends 02:00 UTC of next date.
  const start = new Date(`${businessDate}T02:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

export type UnifiedCashCheck = {
  id: string;
  source: "live" | "slots";
  created_at: string;
  counted_by: string | null;
  denominations: any;
  total: number;
  // Original row kept for viewer
  _raw: any;
};

export const useCashChecksByBusinessDate = (businessDate: string | undefined, enabled = true) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["cash-checks-by-date", casinoId, businessDate],
    queryFn: async (): Promise<UnifiedCashCheck[]> => {
      if (!casinoId || !businessDate) return [];
      const { start, end } = businessDayWindowUtc(businessDate);

      // ---- LIVE GAME ----
      const { data: shifts, error: shiftErr } = await supabase
        .from("shifts")
        .select("id")
        .eq("casino_id", casinoId)
        .gte("opened_at", start)
        .lt("opened_at", end);
      if (shiftErr) throw shiftErr;
      const shiftIds = (shifts || []).map((s: any) => s.id);

      const liveByShiftPromise = shiftIds.length
        ? supabase
            .from("cash_counts")
            .select("*")
            .eq("casino_id", casinoId)
            .eq("count_type", "check")
            .in("shift_id", shiftIds)
        : Promise.resolve({ data: [], error: null } as any);

      const liveOrphanPromise = supabase
        .from("cash_counts")
        .select("*")
        .eq("casino_id", casinoId)
        .eq("count_type", "check")
        .is("shift_id", null)
        .gte("created_at", start)
        .lt("created_at", end);

      // ---- SLOTS ----
      const { data: slotsShifts, error: slotsShiftErr } = await supabase
        .from("cage_slots_shifts")
        .select("id")
        .eq("casino_id", casinoId)
        .eq("business_date", businessDate);
      if (slotsShiftErr) throw slotsShiftErr;
      const slotsShiftIds = (slotsShifts || []).map((s: any) => s.id);

      const slotsChecksPromise = slotsShiftIds.length
        ? supabase
            .from("cage_slots_cash_counts")
            .select("*")
            .eq("casino_id", casinoId)
            .in("cage_slots_shift_id", slotsShiftIds)
        : Promise.resolve({ data: [], error: null } as any);

      const [byShift, orphan, slotsRes] = await Promise.all([
        liveByShiftPromise,
        liveOrphanPromise,
        slotsChecksPromise,
      ]);
      if ((byShift as any).error) throw (byShift as any).error;
      if (orphan.error) throw orphan.error;
      if ((slotsRes as any).error) throw (slotsRes as any).error;

      const liveMerged = [...((byShift as any).data || []), ...(orphan.data || [])];
      const seen = new Set<string>();
      const unifiedLive: UnifiedCashCheck[] = liveMerged
        .filter((r: any) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        })
        .map((r: any) => ({
          id: r.id,
          source: "live",
          created_at: r.created_at,
          counted_by: r.counted_by ?? null,
          denominations: r.denominations,
          total: Number(r.total ?? 0),
          _raw: r,
        }));

      const unifiedSlots: UnifiedCashCheck[] = ((slotsRes as any).data || []).map((r: any) => ({
        id: r.id,
        source: "slots",
        created_at: r.created_at,
        counted_by: r.counted_by ?? null,
        denominations: r.denominations,
        total: Number(r.total_tzs ?? 0),
        _raw: r,
      }));

      const all = [...unifiedLive, ...unifiedSlots];
      all.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return all;
    },
    enabled: enabled && !!casinoId && !!businessDate,
  });
};
