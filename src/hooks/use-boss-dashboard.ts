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

  // ── Live game: sum IN transactions per casino for today (drop),
  //    result via chip snapshots aggregate (actual - expected) * denom.
  const [dropRes, snapRes, hcRes, slotsRes, mtdDropRes, mtdSnapRes, mtdSlotsRes] = await Promise.all([
    // Live drop today (transactions IN/BUY)
    supabase
      .from("transactions")
      .select("amount")
      .eq("casino_id", casinoId)
      .eq("business_date", businessDate)
      .is("cancelled_at", null)
      .in("type", ["in", "buy"]),
    // Live result today (chip snapshots via RPC)
    supabase.rpc("chip_snapshots_latest", {
      _casino_id: casinoId,
      _date: businessDate,
    }),
    // Head count (active visits today)
    supabase
      .from("casino_visits")
      .select("id", { count: "exact", head: true })
      .eq("casino_id", casinoId)
      .eq("date", businessDate)
      .is("checked_out_at", null),
    // Slots today
    supabase
      .from("cage_slots_shifts")
      .select("manual_drop_slots, slots_result")
      .eq("casino_id", casinoId)
      .eq("business_date", businessDate),
    // MTD live drop from player_day_drop_cache (single source of truth for Total drop)
    supabase
      .from("player_day_drop_cache")
      .select("peak")
      .eq("casino_id", casinoId)
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
    // MTD live result: sum of all snapshots' actual-expected for the month
    // (cheap proxy: latest per day is used per-day, but sum here suffices for TV)
    supabase
      .from("chip_snapshots")
      .select("actual_quantity, expected_quantity, denomination, location_type")
      .eq("casino_id", casinoId)
      .gte("date", mStart)
      .lte("date", businessDate)
      .eq("location_type", "table"),
    // MTD slots
    supabase
      .from("cage_slots_shifts")
      .select("manual_drop_slots, slots_result")
      .eq("casino_id", casinoId)
      .gte("business_date", mStart)
      .lte("business_date", businessDate),
  ]);

  const liveDrop = (dropRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const liveResult = ((snapRes.data as any[]) || [])
    .filter((r) => r.location_type === "table")
    .reduce((s, r) => s + (Number(r.actual_quantity || 0) - Number(r.expected_quantity || 0)) * Number(r.denomination || 0), 0);
  const headCount = hcRes.count ?? 0;

  const slotsRows = slotsRes.data || [];
  const slotsDrop = slotsRows.reduce((s: number, r: any) => s + Number(r.manual_drop_slots || 0), 0);
  const slotsResult = slotsRows.reduce((s: number, r: any) => s + Number(r.slots_result || 0), 0);

  const totalDrop = liveDrop + slotsDrop;
  const totalResult = liveResult + slotsResult;
  const hold = (d: number, r: number) => (d > 0 ? (r / d) * 100 : 0);

  const mtdDrop = (mtdDropRes.data || []).reduce((s: number, r: any) => s + Number(r.peak || 0), 0);
  const mtdLiveResult = (mtdSnapRes.data || []).reduce(
    (s: number, r: any) => s + (Number(r.actual_quantity || 0) - Number(r.expected_quantity || 0)) * Number(r.denomination || 0),
    0,
  );
  const mtdSlotsResult = (mtdSlotsRes.data || []).reduce((s: number, r: any) => s + Number(r.slots_result || 0), 0);
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

