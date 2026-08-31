/**
 * useBossDashboard — cross-casino aggregation for the Boss TV Dashboard.
 *
 * For the current business day, per selected casino:
 *   - Total / Live / Slots: Drop, Result, Hold%, Head Count
 * Plus cross-casino aggregates:
 *   - Top 5 players by drop today (per casino)
 *   - New players today (visits_count <= 3) across all
 *   - MTD Total Drop / Result / Hold per casino
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBusinessDate } from "@/lib/business-day";
import { closedDaySlotsResult } from "@/lib/boss-display-metrics";

export type CasinoMetric = {
  drop: number;
  result: number;
  headCount: number;
  hold: number; // %
};

export type CasinoDay = {
  casinoId: string;
  total: CasinoMetric;
  live: CasinoMetric;
  slots: CasinoMetric;
  /** false while the business day is still open and no ACE feed exists → show `·` */
  slotsAvailable: boolean;
  mtd: { drop: number; result: number; hold: number };
  /**
   * Monthly (MTD) split — SAME sources as Analytics → Statistics (Total Report):
   *   Tables Drop   → player_day_drop_cache.peak (via `compute_daily_diff`)
   *   Tables Result → fin_day_closing.tables_result (+ today's live figure)
   *   Slots Drop    → fin_day_closing.drop_slots, fallback cage_slots_shifts.manual_drop_slots
   *   Slots Result  → fin_day_closing.cashdesk_win − players_card_balance
   */
  mtdTables: CasinoMetric;
  mtdSlots: CasinoMetric;
  /**
   * true when at least one monthly slots SOURCE record exists (a closed
   * Day Closing or a closed cage-slots shift). A legit closed 0 is DATA →
   * render 0 / 0.0%; no source at all → render `—`.
   */
  mtdSlotsAvailable: boolean;

};



export type TopPlayer = { casinoId: string; playerId: string; name: string; drop: number };
export type NewPlayer = { casinoId: string; playerId: string; name: string; visits: number };

const monthStart = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

async function fetchCasinoDay(casinoId: string, businessDate: string): Promise<CasinoDay> {
  const mStart = monthStart();

  // Source of truth (aligned with Dashboard TV → Monthly Report):
  //   Drop            → RPC `compute_daily_diff` (Σ player_day_drop_cache.peak)
  //   Tables (open)   → Chips Check: latest chip-count snapshots per table
  //   Tables (closed) → `fin_day_closing.tables_result`
  //   Slots           → ONLY closed days: cashdesk_win − players_card_balance.
  //                     While the day is open (and no fresh ACE feed) slots show `·`
  //                     — an open cage-slots shift is a draft, not a result.
  const [dailyTodayRes, dailyMtdRes, hcRes, closingsRes, snapRes, slotShiftsRes] = await Promise.all([
    (supabase as any).rpc("compute_daily_diff", {
      _casino_id: casinoId, _from: businessDate, _to: businessDate,
    }),
    (supabase as any).rpc("compute_daily_diff", {
      _casino_id: casinoId, _from: mStart, _to: businessDate,
    }),
    supabase
      .from("casino_visits")
      .select("id", { count: "exact", head: true })
      .eq("casino_id", casinoId)
      .eq("date", businessDate)
      .is("checked_out_at", null),
    supabase
      .from("fin_day_closing")
      .select("business_date, tables_result, slots_result, net_win, cashdesk_win, players_card_balance, drop_slots")
      .eq("casino_id", casinoId)
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
    (supabase as any).rpc("chip_snapshots_latest", { _casino_id: casinoId, _date: businessDate }),
    // Statistics fallback for monthly Slots Drop when Day Closing has no ACE figure.
    supabase
      .from("cage_slots_shifts")
      .select("business_date, manual_drop_slots")
      .eq("casino_id", casinoId)
      .eq("status", "closed")
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
  ]);


  const headCount = hcRes.count ?? 0;

  const todayRow = (dailyTodayRes.data || [])[0] || {};
  const liveDrop = Number(todayRow.drop_r || 0);

  const closings = (closingsRes.data || []) as any[];
  const todayClosing = closings.find((r) => r.business_date === businessDate);

  // Result of a CLOSED day (approved source):
  //   tables_result + (cashdesk_win − players_card_balance).
  const closedSlotsResult = (r: any) => closedDaySlotsResult(r);
  const closedDayResult = (r: any) =>
    Number(r.tables_result || 0) + closedSlotsResult(r);


  // Live tables result from the latest chip count per table (same as casino dashboards)
  const snapResult = ((snapRes.data || []) as any[]).reduce((acc, r) => {
    if (r.location_type !== "table" || !r.location_id) return acc;
    return acc + (Number(r.actual_quantity || 0) - Number(r.expected_quantity || 0)) * Number(r.denomination || 0);
  }, 0);

  const liveResult = todayClosing
    ? Number(todayClosing.tables_result || 0)
    : snapResult;

  const slotsAvailable = !!todayClosing;
  const slotsDrop = todayClosing ? Number(todayClosing.drop_slots || 0) : 0;
  // Displayed Slots Result for a CLOSED day = cashdesk_win − players_card_balance.
  const slotsResult = todayClosing ? closedSlotsResult(todayClosing) : 0;

  const totalDrop = liveDrop + slotsDrop;
  const totalResult = liveResult + slotsResult;
  const hold = (d: number, r: number) => (d > 0 ? (r / d) * 100 : 0);

  const mtdRows = (dailyMtdRes.data || []) as any[];

  // ---- Monthly (MTD) — CLOSED Day Closings ONLY, exactly like the Company
  // Report. The still-open business day never contributes to any MTD figure.
  //   Table Result = Σ fin_day_closing.tables_result
  //   Slot Result  = Σ per day (cashdesk_win − players_card_balance)   [signed]
  //   Tables Drop  = Σ drop cache, restricted to those closed days
  const shiftDropByDate = new Map<string, number>();
  for (const s of ((slotShiftsRes as any).data || []) as any[]) {
    shiftDropByDate.set(
      s.business_date,
      (shiftDropByDate.get(s.business_date) || 0) + Number(s.manual_drop_slots || 0),
    );
  }
  let mtdSlotsDrop = 0;
  let mtdSlotsResult = 0;
  let mtdTablesResult = 0;
  const closingDates = new Set<string>();
  for (const c of closings) {
    closingDates.add(c.business_date);
    const aceDrop = Number(c.drop_slots || 0);
    mtdSlotsDrop += aceDrop !== 0 ? aceDrop : shiftDropByDate.get(c.business_date) || 0;
    mtdSlotsResult += closedSlotsResult(c);
    mtdTablesResult += Number(c.tables_result || 0);
  }
  for (const [d, v] of shiftDropByDate) if (!closingDates.has(d)) mtdSlotsDrop += v;
  // Availability = EXISTENCE of a source record, never "value is non-zero".
  const mtdSlotsAvailable = closings.length > 0 || shiftDropByDate.size > 0;

  const mtdTablesDrop = mtdRows
    .filter((r) => closingDates.has(String(r.business_date)))
    .reduce((s, r) => s + Number(r.drop_r || 0), 0);

  const mtdDrop = mtdTablesDrop + mtdSlotsDrop;
  const mtdResult = mtdTablesResult + mtdSlotsResult;


  return {
    casinoId,
    total: { drop: totalDrop, result: totalResult, headCount, hold: hold(totalDrop, totalResult) },
    live: { drop: liveDrop, result: liveResult, headCount, hold: hold(liveDrop, liveResult) },
    slots: { drop: slotsDrop, result: slotsResult, headCount: 0, hold: hold(slotsDrop, slotsResult) },
    slotsAvailable,
    mtd: { drop: mtdDrop, result: mtdResult, hold: hold(mtdDrop, mtdResult) },
    mtdTables: {
      drop: mtdTablesDrop,
      result: mtdTablesResult,
      headCount: 0,
      hold: hold(mtdTablesDrop, mtdTablesResult),
    },
    mtdSlots: {
      drop: mtdSlotsDrop,
      result: mtdSlotsResult,
      headCount: 0,
      hold: hold(mtdSlotsDrop, mtdSlotsResult),
    },
    mtdSlotsAvailable,
  };


}



export function useBossCasinoDays(casinoIds: string[]) {
  const today = getBusinessDate();
  const results = useQueries({
    queries: casinoIds.map((id) => ({
      queryKey: ["boss-dashboard-day", id, today],
      queryFn: () => fetchCasinoDay(id, today),
      enabled: !!id,
      refetchInterval: 10_000,
      staleTime: 5_000,
    })),
  });
  return {
    data: results.map((r) => r.data).filter(Boolean) as CasinoDay[],
    isLoading: results.some((r) => r.isLoading),
  };
}

export function useBossTopPlayers(casinoIds: string[]) {
  const today = getBusinessDate();
  return useQuery({
    queryKey: ["boss-top-players", casinoIds, today],
    queryFn: async () => {
      if (!casinoIds.length) return [] as TopPlayer[];
      // NOTE: `player_day_drop_cache` has NO foreign key to `players`, so a
      // PostgREST embed (`players(...)`) returns 400. Names are joined client-side.
      const { data } = await supabase
        .from("player_day_drop_cache")
        .select("casino_id, player_id, peak")
        .in("casino_id", casinoIds)
        .eq("business_date", today)
        .order("peak", { ascending: false })
        .limit(200);
      const rows = (data || []) as any[];
      const ids = [...new Set(rows.map((r) => r.player_id).filter(Boolean))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: pl } = await supabase
          .from("players")
          .select("id, first_name, last_name, nickname")
          .in("id", ids);
        for (const p of (pl || []) as any[]) {
          names.set(p.id, p.nickname || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "—");
        }
      }
      // Top 5 per casino
      const perCasino: Record<string, TopPlayer[]> = {};
      for (const r of rows) {
        const arr = perCasino[r.casino_id] || (perCasino[r.casino_id] = []);
        if (arr.length >= 5) continue;
        arr.push({ casinoId: r.casino_id, playerId: r.player_id, name: names.get(r.player_id) || "—", drop: Number(r.peak || 0) });
      }
      return Object.values(perCasino).flat();

    },
    enabled: casinoIds.length > 0,
    refetchInterval: 15_000,
  });
}

export function useBossNewPlayers(casinoIds: string[]) {
  const today = getBusinessDate();
  return useQuery({
    queryKey: ["boss-new-players", casinoIds, today],
    queryFn: async () => {
      if (!casinoIds.length) return [] as NewPlayer[];
      // Today's visits with player info
      const { data: todayVisits } = await supabase
        .from("casino_visits")
        .select("casino_id, player_id, players!inner(first_name, last_name, nickname)")
        .in("casino_id", casinoIds)
        .eq("date", today);
      const rows = (todayVisits || []) as any[];
      // Dedup (casino, player)
      const uniq = new Map<string, { casinoId: string; playerId: string; name: string }>();
      for (const r of rows) {
        const key = `${r.casino_id}:${r.player_id}`;
        if (uniq.has(key)) continue;
        const p = r.players || {};
        const name = p.nickname || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "—";
        uniq.set(key, { casinoId: r.casino_id, playerId: r.player_id, name });
      }
      if (uniq.size === 0) return [];
      // Count all-time visits per player_id via a single grouped fetch (approximate: fetch counts)
      // Count lifetime visits per player_id. PostgREST caps a single response
      // at 1000 rows, so we MUST page — otherwise long-time regulars get
      // undercounted and mislabeled as "new".
      const { fetchPaged } = await import("@/lib/fetch-paged");
      const playerIds = Array.from(new Set(Array.from(uniq.values()).map((v) => v.playerId)));
      const counts = await fetchPaged<{ player_id: string }>((from, to) =>
        supabase.from("casino_visits").select("player_id").in("player_id", playerIds).range(from, to),
      );
      const cmap = new Map<string, number>();
      counts.forEach((r) => cmap.set(r.player_id, (cmap.get(r.player_id) || 0) + 1));
      const out: NewPlayer[] = [];
      for (const v of uniq.values()) {
        const visits = cmap.get(v.playerId) || 1;
        if (visits <= 3) out.push({ ...v, visits });
      }
      return out.slice(0, 40);
    },
    enabled: casinoIds.length > 0,
    refetchInterval: 30_000,
  });
}

