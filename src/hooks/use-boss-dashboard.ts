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
  //     drop = Σ player_day_drop_cache.peak (same source as Player Statistics);
  //     result = Σ shifts.tables_result WHERE status='closed'.
  //   Slots → temporarily disabled on Boss TV (all zeros) by request.
  const [dailyTodayRes, dailyMtdRes, hcRes] = await Promise.all([
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
  ]);

  const headCount = hcRes.count ?? 0;

  const todayRow = (dailyTodayRes.data || [])[0] || {};
  const liveDrop = Number(todayRow.drop_r || 0);
  const liveResult = Number(todayRow.result || 0);

  // Slots: intentionally zeroed on Boss TV for now.
  const slotsDrop = 0;
  const slotsResult = 0;

  const totalDrop = liveDrop + slotsDrop;
  const totalResult = liveResult + slotsResult;
  const hold = (d: number, r: number) => (d > 0 ? (r / d) * 100 : 0);

  const mtdRows = (dailyMtdRes.data || []) as any[];
  const mtdLiveDrop = mtdRows.reduce((s, r) => s + Number(r.drop_r || 0), 0);
  const mtdLiveResult = mtdRows.reduce((s, r) => s + Number(r.result || 0), 0);
  const mtdDrop = mtdLiveDrop;
  const mtdResult = mtdLiveResult;

  return {
    casinoId,
    total: { drop: totalDrop, result: totalResult, headCount, hold: hold(totalDrop, totalResult) },
    live: { drop: liveDrop, result: liveResult, headCount, hold: hold(liveDrop, liveResult) },
    slots: { drop: 0, result: 0, headCount: 0, hold: 0 },
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

