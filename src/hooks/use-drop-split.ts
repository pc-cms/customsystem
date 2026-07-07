/**
 * NEP-split hooks — call DB RPCs `compute_tables_drop_split` and
 * `compute_player_drop_split` to get authoritative Drop R / Recycled.
 *
 * These RPCs walk the FULL player history (lifetime NEP) and attribute
 * external/recycled portions of each cash-in inside the requested window.
 *
 * IMPORTANT: We store the result as a plain Record<string, TableSplit>, not
 * Map. react-query's IndexedDB persister uses JSON, and `JSON.stringify(map)`
 * yields `"{}"` — so persisted Maps come back EMPTY on hydrate, which silently
 * zeroes Drop R for every row until the next refetch. A plain object survives
 * the JSON round-trip intact.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";

export type TableSplit = { dropR: number; recycled: number };
export type SplitLookup = {
  get(id: string | null | undefined): TableSplit | undefined;
  forEach(cb: (value: TableSplit, key: string) => void): void;
  values(): TableSplit[];
  size: number;
};

const toLookup = (rec: Record<string, TableSplit>): SplitLookup => ({
  get: (id) => (id ? rec[id] : undefined),
  forEach: (cb) => { for (const k of Object.keys(rec)) cb(rec[k], k); },
  values: () => Object.values(rec),
  get size() { return Object.keys(rec).length; },
});

const PAGE_SIZE = 1000;

const fetchPaged = async <T,>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
};

/** Returns a Map-like lookup keyed by table_id. */
export const useTablesDropSplit = (fromIso: string | null, toIso: string | null) => {
  const { casinoId } = useAuth();
  const q = useQuery({
    queryKey: ["tables-drop-split", casinoId, fromIso, toIso],
    queryFn: async (): Promise<Record<string, TableSplit>> => {
      if (!casinoId || !fromIso || !toIso) return {};
      const { data, error } = await supabase.rpc("compute_tables_drop_split" as any, {
        _casino_id: casinoId,
        _from: fromIso,
        _to: toIso,
      });
      if (error) throw error;
      const rec: Record<string, TableSplit> = {};
      (data || []).forEach((r: any) => {
        if (r?.table_id) rec[r.table_id] = {
          dropR: Number(r.drop_r) || 0,
          recycled: Number(r.drop_recycled) || 0,
        };
      });
      return rec;
    },
    enabled: !!casinoId && !!fromIso && !!toIso,
    ...liveQueryOptionsWithFallback(60_000),
  });
  const data = useMemo(() => toLookup(q.data ?? {}), [q.data]);
  return { ...q, data };
};

/** Returns a Map-like lookup keyed by player_id. */
export const usePlayersDropSplit = (fromIso: string | null, toIso: string | null) => {
  const { casinoId } = useAuth();
  const q = useQuery({
    queryKey: ["players-drop-split", casinoId, fromIso, toIso],
    queryFn: async (): Promise<Record<string, TableSplit>> => {
      if (!casinoId || !fromIso || !toIso) return {};
      const { data, error } = await supabase.rpc("compute_players_drop_split" as any, {
        _casino_id: casinoId,
        _from: fromIso,
        _to: toIso,
      });
      if (error) throw error;
      const rec: Record<string, TableSplit> = {};
      (data || []).forEach((r: any) => {
        if (r?.player_id) rec[r.player_id] = {
          dropR: Number(r.drop_r) || 0,
          recycled: Number(r.drop_recycled) || 0,
        };
      });
      return rec;
    },
    enabled: !!casinoId && !!fromIso && !!toIso,
    ...liveQueryOptionsWithFallback(60_000),
  });
  const data = useMemo(() => toLookup(q.data ?? {}), [q.data]);
  return { ...q, data };
};

/** Returns { dropR, recycled } for a single player over [from, to] (defaults to lifetime). */
export const usePlayerDropSplit = (
  playerId: string | null | undefined,
  fromIso?: string,
  toIso?: string
) => {
  return useQuery({
    queryKey: ["player-drop-split", playerId, fromIso || "lifetime", toIso || "now"],
    queryFn: async () => {
      if (!playerId) return { dropR: 0, recycled: 0 } as TableSplit;
      const { data, error } = await supabase.rpc("compute_player_drop_split" as any, {
        _player_id: playerId,
        _from: fromIso || "-infinity",
        _to: toIso || "infinity",
      });
      if (error) throw error;
      const row = (data || [])[0];
      return { dropR: Number(row?.drop_r) || 0, recycled: Number(row?.drop_recycled) || 0 };
    },
    enabled: !!playerId,
    staleTime: 1000 * 60,
  });
};

/**
 * Per-table Drop R for a single business day, read from the
 * `table_day_drop_cache` materialized cache (maintained by DB triggers on
 * `transactions`). Updates arrive via Realtime on the cache table itself —
 * no need to wait for the heavy `compute_tables_drop_split` RPC walk.
 *
 * Use this as the primary source for the CURRENT business day on dashboards
 * (Dashboard, Tables). Keep the RPC for historical days where the cache is
 * not maintained.
 */
export const useTablesDropCacheToday = (businessDate: string | null | undefined) => {
  const { casinoId } = useAuth();
  const q = useQuery({
    queryKey: ["tables-drop-cache-today", casinoId, businessDate],
    queryFn: async (): Promise<Record<string, TableSplit>> => {
      if (!casinoId || !businessDate) return {};
      const { data, error } = await supabase
        .from("table_day_drop_cache")
        .select("table_id, drop_r_share, recycled_share")
        .eq("casino_id", casinoId)
        .eq("business_date", businessDate);
      if (error) throw error;
      const rec: Record<string, TableSplit> = {};
      (data || []).forEach((r: any) => {
        if (!r?.table_id) return;
        const prev = rec[r.table_id] || { dropR: 0, recycled: 0 };
        rec[r.table_id] = {
          dropR: prev.dropR + (Number(r.drop_r_share) || 0),
          recycled: prev.recycled + (Number(r.recycled_share) || 0),
        };
      });
      return rec;
    },
    enabled: !!casinoId && !!businessDate,
    staleTime: 5_000,
    // Fallback polling in case a Realtime event for `table_day_drop_cache`
    // is dropped (network blip, channel reconnect). 20s keeps the UI honest
    // without hammering the DB — Realtime still delivers near-instant updates
    // in the normal path; this is only the safety net.
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });



  const data = useMemo(() => toLookup(q.data ?? {}), [q.data]);
  return { ...q, data };
};

/**
 * Per-PLAYER Drop R / Recycled for a single business day, read from the
 * `player_day_drop_cache` materialized cache. DB triggers on `transactions`
 * maintain it with per-business-day peak-NEP — the authoritative formula.
 *
 * Use as PRIMARY source for the current business day everywhere (Tables
 * seated players, Player Statistics, Player Preview). Guarantees
 *   Σ player_day_drop_cache.peak == Σ table_day_drop_cache.drop_r_share
 * so Players and Dashboard cannot drift.
 */
export const usePlayersDropCacheToday = (businessDate: string | null | undefined) => {
  const { casinoId } = useAuth();
  const q = useQuery({
    queryKey: ["players-drop-cache-today", casinoId, businessDate],
    queryFn: async (): Promise<Record<string, TableSplit>> => {
      if (!casinoId || !businessDate) return {};
      const { data, error } = await supabase
        .from("player_day_drop_cache")
        .select("player_id, peak, recycled")
        .eq("casino_id", casinoId)
        .eq("business_date", businessDate);
      if (error) throw error;
      const rec: Record<string, TableSplit> = {};
      (data || []).forEach((r: any) => {
        if (!r?.player_id) return;
        rec[r.player_id] = {
          dropR: Number(r.peak) || 0,
          recycled: Number(r.recycled) || 0,
        };
      });
      return rec;
    },
    enabled: !!casinoId && !!businessDate,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const data = useMemo(() => toLookup(q.data ?? {}), [q.data]);
  return { ...q, data };
};

/** Per-player Drop summed across [fromDate, toDate] business days (sum of daily peaks). */
export const usePlayersDropCacheRange = (
  fromDate: string | null | undefined,
  toDate: string | null | undefined,
) => {
  const { casinoId } = useAuth();
  const q = useQuery({
    queryKey: ["players-drop-cache-range", casinoId, fromDate, toDate],
    queryFn: async (): Promise<Record<string, TableSplit>> => {
      if (!casinoId || !fromDate || !toDate) return {};
      const rows = await fetchPaged<any>((from, to) => supabase
        .from("player_day_drop_cache")
        .select("player_id, peak, recycled")
        .eq("casino_id", casinoId)
        .gte("business_date", fromDate)
        .lte("business_date", toDate)
        .order("business_date", { ascending: true })
        .range(from, to)
      );
      const rec: Record<string, TableSplit> = {};
      rows.forEach((r: any) => {
        if (!r?.player_id) return;
        const prev = rec[r.player_id] || { dropR: 0, recycled: 0 };
        rec[r.player_id] = {
          dropR: prev.dropR + (Number(r.peak) || 0),
          recycled: prev.recycled + (Number(r.recycled) || 0),
        };
      });
      return rec;
    },
    enabled: !!casinoId && !!fromDate && !!toDate,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const data = useMemo(() => toLookup(q.data ?? {}), [q.data]);
  return { ...q, data };
};

/**
 * Per-business-day Drop cache for a SINGLE player (all dates, all casinos).
 * Used by PlayerProfile / PlayerVisitsBreakdown to display per-visit Drop as
 * the day's peak-NEP (matching Player Statistics). Returns a Record keyed by
 * `business_date` (YYYY-MM-DD) so callers can do day-level lookups.
 */
export type PlayerDayDropRow = { peak: number; recycled: number; totalIn: number; totalOut: number };
export const usePlayerDropCacheByDays = (playerId: string | null | undefined) => {
  const q = useQuery({
    queryKey: ["player-drop-cache-by-days", playerId],
    queryFn: async (): Promise<Record<string, PlayerDayDropRow>> => {
      if (!playerId) return {};
      const { data, error } = await supabase
        .from("player_day_drop_cache")
        .select("business_date, peak, recycled, total_in, total_out")
        .eq("player_id", playerId);
      if (error) throw error;
      const rec: Record<string, PlayerDayDropRow> = {};
      (data || []).forEach((r: any) => {
        if (!r?.business_date) return;
        const k = r.business_date as string;
        const prev = rec[k] || { peak: 0, recycled: 0, totalIn: 0, totalOut: 0 };
        rec[k] = {
          peak: prev.peak + (Number(r.peak) || 0),
          recycled: prev.recycled + (Number(r.recycled) || 0),
          totalIn: prev.totalIn + (Number(r.total_in) || 0),
          totalOut: prev.totalOut + (Number(r.total_out) || 0),
        };
      });
      return rec;
    },
    enabled: !!playerId,
    staleTime: 5_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  return q;
};





