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

export type TableSplit = { dropR: number; recycled: number };
export type SplitLookup = {
  get(id: string | null | undefined): TableSplit | undefined;
  size: number;
};

const toLookup = (rec: Record<string, TableSplit>): SplitLookup => ({
  get: (id) => (id ? rec[id] : undefined),
  get size() { return Object.keys(rec).length; },
});

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
    staleTime: 1000 * 30,
    refetchInterval: 60_000,
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
    staleTime: 1000 * 30,
    refetchInterval: 60_000,
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
