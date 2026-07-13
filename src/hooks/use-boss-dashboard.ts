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

async function fetchCasinoDay(casinoId: string, businessDate: string): Promise<CasinoDay> {
  const mStart = monthStart();

  // Result source of truth = Daily Balance (`fin_day_closing.tables_result` / `slots_result`).
  // Fallback for today (day not closed yet): sum `shifts.tables_result` for the business day
  // and `cage_slots_shifts.slots_result`.
  // Drop stays authoritative: player_day_drop_cache (live) + cage_slots_shifts.manual_drop_slots.
  const dayStartIso = `${businessDate}T04:00:00.000Z`;
  const nextDay = new Date(businessDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayEndIso = `${nextDay.toISOString().slice(0, 10)}T04:00:00.000Z`;

  const [
    dropTodayRes,
    hcRes,
    slotsRes,
    closingTodayRes,
    shiftsTodayRes,
    mtdDropRes,
    mtdSlotsRes,
    mtdClosingsRes,
  ] = await Promise.all([
    // Live drop today from player_day_drop_cache (authoritative)
    supabase
      .from("player_day_drop_cache")
      .select("peak")
      .eq("casino_id", casinoId)
      .eq("business_date", businessDate),
    // Head count (active visits today)
    supabase
      .from("casino_visits")
      .select("id", { count: "exact", head: true })
      .eq("casino_id", casinoId)
      .eq("date", businessDate)
      .is("checked_out_at", null),
    // Slots today (drop + result fallback)
    supabase
      .from("cage_slots_shifts")
      .select("manual_drop_slots, slots_result")
      .eq("casino_id", casinoId)
      .eq("business_date", businessDate),
    // Daily Balance for today (may not exist yet)
    supabase
      .from("fin_day_closing")
      .select("tables_result, slots_result")
      .eq("casino_id", casinoId)
      .eq("business_date", businessDate)
      .maybeSingle(),
    // Live result fallback: shifts.tables_result for the business day
    supabase
      .from("shifts")
      .select("tables_result")
      .eq("casino_id", casinoId)
      .gte("opened_at", dayStartIso)
      .lt("opened_at", dayEndIso),
    // MTD live drop from player_day_drop_cache
    supabase
      .from("player_day_drop_cache")
      .select("peak")
      .eq("casino_id", casinoId)
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
    // MTD slots (drop)
    supabase
      .from("cage_slots_shifts")
      .select("manual_drop_slots")
      .eq("casino_id", casinoId)
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
    // MTD result from Daily Balance
    supabase
      .from("fin_day_closing")
      .select("tables_result, slots_result")
      .eq("casino_id", casinoId)
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
  ]);

  const liveDrop = (dropTodayRes.data || []).reduce((s: number, r: any) => s + Number(r.peak || 0), 0);
  const headCount = hcRes.count ?? 0;

  const slotsRows = slotsRes.data || [];
  const slotsDrop = slotsRows.reduce((s: number, r: any) => s + Number(r.manual_drop_slots || 0), 0);
  const slotsFallback = slotsRows.reduce((s: number, r: any) => s + Number(r.slots_result || 0), 0);
  const shiftsFallback = (shiftsTodayRes.data || []).reduce(
    (s: number, r: any) => s + Number(r.tables_result || 0),
    0,
  );

  // Prefer Daily Balance; fall back to live aggregates when no closing exists yet.
  const closing = closingTodayRes.data as any | null;
  const liveResult =
    closing && closing.tables_result != null ? Number(closing.tables_result) : shiftsFallback;
  const slotsResult =
    closing && closing.slots_result != null ? Number(closing.slots_result) : slotsFallback;

  const totalDrop = liveDrop + slotsDrop;
  const totalResult = liveResult + slotsResult;
  const hold = (d: number, r: number) => (d > 0 ? (r / d) * 100 : 0);

  const mtdLiveDrop = (mtdDropRes.data || []).reduce((s: number, r: any) => s + Number(r.peak || 0), 0);
  const mtdSlotsDrop = (mtdSlotsRes.data || []).reduce(
    (s: number, r: any) => s + Number(r.manual_drop_slots || 0),
    0,
  );
  const mtdDrop = mtdLiveDrop + mtdSlotsDrop;
  const mtdResult = (mtdClosingsRes.data || []).reduce(
    (s: number, r: any) => s + Number(r.tables_result || 0) + Number(r.slots_result || 0),
    0,
  );

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

