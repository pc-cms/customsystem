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
  mtd: { drop: number; result: number; hold: number };
};

export type TopPlayer = { casinoId: string; playerId: string; name: string; drop: number };
export type NewPlayer = { casinoId: string; playerId: string; name: string; visits: number };

const monthStart = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

// Slots rule for Boss Dashboard: per closed slot shift, effective result =
// system_shift_result − SLOTS_SHIFT_ADJUSTMENT (1,000,000). Sum across shifts.
const SLOTS_SHIFT_ADJUSTMENT = 1_000_000;

async function fetchCasinoDay(casinoId: string, businessDate: string): Promise<CasinoDay> {
  const mStart = monthStart();

  // Source of truth:
  //   Tables (Live) → RPC `compute_daily_diff` (same as Reports → Daily Balance):
  //     drop = Σ player_day_drop_cache.peak; result = Σ shifts.tables_result WHERE status='closed'.
  //   Slots → cage_slots_shifts: drop = Σ manual_drop_slots;
  //           result = Σ (system_shift_result − 1M) over shifts in status ('submitted','reviewed','closed').
  const [
    dailyTodayRes,
    dailyMtdRes,
    hcRes,
    slotsTodayRes,
    slotsMtdRes,
  ] = await Promise.all([
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
      .from("cage_slots_shifts")
      .select("status, system_shift_result, manual_drop_slots")
      .eq("casino_id", casinoId)
      .eq("business_date", businessDate),
    supabase
      .from("cage_slots_shifts")
      .select("business_date, status, system_shift_result, manual_drop_slots")
      .eq("casino_id", casinoId)
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
  ]);

  const headCount = hcRes.count ?? 0;

  // Tables today
  const todayRow = (dailyTodayRes.data || [])[0] || {};
  const liveDrop = Number(todayRow.drop_r || 0);
  const liveResult = Number(todayRow.result || 0);

  // Slots today: closed/submitted/reviewed shifts count toward the result;
  // drop is the manager-entered manual_drop_slots regardless of status.
  const slotsRows = (slotsTodayRes.data || []) as any[];
  const slotsClosedRows = slotsRows.filter(
    (r) => r.status === "closed" || r.status === "submitted" || r.status === "reviewed",
  );
  const slotsDrop = slotsRows.reduce((s, r) => s + Number(r.manual_drop_slots || 0), 0);
  const slotsResult = slotsClosedRows.reduce(
    (s, r) => s + (Number(r.system_shift_result || 0) - SLOTS_SHIFT_ADJUSTMENT),
    0,
  );

  const totalDrop = liveDrop + slotsDrop;
  const totalResult = liveResult + slotsResult;
  const hold = (d: number, r: number) => (d > 0 ? (r / d) * 100 : 0);

  // MTD
  const mtdRows = (dailyMtdRes.data || []) as any[];
  const mtdLiveDrop = mtdRows.reduce((s, r) => s + Number(r.drop_r || 0), 0);
  const mtdLiveResult = mtdRows.reduce((s, r) => s + Number(r.result || 0), 0);

  const mtdSlotsRows = (slotsMtdRes.data || []) as any[];
  const mtdSlotsClosedRows = mtdSlotsRows.filter(
    (r) => r.status === "closed" || r.status === "submitted" || r.status === "reviewed",
  );
  const mtdSlotsDrop = mtdSlotsRows.reduce((s, r) => s + Number(r.manual_drop_slots || 0), 0);
  const mtdSlotsResult = mtdSlotsClosedRows.reduce(
    (s, r) => s + (Number(r.system_shift_result || 0) - SLOTS_SHIFT_ADJUSTMENT),
    0,
  );

  const mtdDrop = mtdLiveDrop + mtdSlotsDrop;
  const mtdResult = mtdLiveResult + mtdSlotsResult;

  return {
    casinoId,
    total: { drop: totalDrop, result: totalResult, headCount, hold: hold(totalDrop, totalResult) },
    live: { drop: liveDrop, result: liveResult, headCount, hold: hold(liveDrop, liveResult) },
    slots: { drop: slotsDrop, result: slotsResult, headCount: 0, hold: hold(slotsDrop, slotsResult) },
    mtd: { drop: mtdDrop, result: mtdResult, hold: hold(mtdDrop, mtdResult) },
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
      const { data } = await supabase
        .from("player_day_drop_cache")
        .select("casino_id, player_id, peak, players(first_name, last_name, nickname)")
        .in("casino_id", casinoIds)
        .eq("business_date", today)
        .order("peak", { ascending: false })
        .limit(200);
      const rows = (data || []) as any[];
      // Top 5 per casino
      const perCasino: Record<string, TopPlayer[]> = {};
      for (const r of rows) {
        const arr = perCasino[r.casino_id] || (perCasino[r.casino_id] = []);
        if (arr.length >= 5) continue;
        const p = r.players || {};
        const name = p.nickname || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "—";
        arr.push({ casinoId: r.casino_id, playerId: r.player_id, name, drop: Number(r.peak || 0) });
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
      const playerIds = Array.from(new Set(Array.from(uniq.values()).map((v) => v.playerId)));
      const { data: counts } = await supabase
        .from("casino_visits")
        .select("player_id")
        .in("player_id", playerIds);
      const cmap = new Map<string, number>();
      (counts || []).forEach((r: any) => cmap.set(r.player_id, (cmap.get(r.player_id) || 0) + 1));
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

