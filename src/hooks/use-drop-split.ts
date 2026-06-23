/**
 * NEP-split hooks — call DB RPCs `compute_tables_drop_split` and
 * `compute_player_drop_split` to get authoritative Drop R / Recycled.
 *
 * These RPCs walk the FULL player history (lifetime NEP) and attribute
 * external/recycled portions of each cash-in inside the requested window.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type TableSplit = { dropR: number; recycled: number };

/** Returns Map<table_id, { dropR, recycled }> for casino over [from, to]. */
export const useTablesDropSplit = (fromIso: string | null, toIso: string | null) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["tables-drop-split", casinoId, fromIso, toIso],
    queryFn: async () => {
      if (!casinoId || !fromIso || !toIso) return new Map<string, TableSplit>();
      const { data, error } = await supabase.rpc("compute_tables_drop_split" as any, {
        _casino_id: casinoId,
        _from: fromIso,
        _to: toIso,
      });
      if (error) throw error;
      const m = new Map<string, TableSplit>();
      (data || []).forEach((r: any) => {
        m.set(r.table_id, { dropR: Number(r.drop_r) || 0, recycled: Number(r.drop_recycled) || 0 });
      });
      return m;
    },
    enabled: !!casinoId && !!fromIso && !!toIso,
    staleTime: 1000 * 30,
    refetchInterval: 60_000,
    select: (d: any) => (d instanceof Map ? d : new Map<string, TableSplit>(Object.entries(d ?? {}))),
  });
};

/** Returns Map<player_id, { dropR, recycled }> for casino over [from, to]. */
export const usePlayersDropSplit = (fromIso: string | null, toIso: string | null) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["players-drop-split", casinoId, fromIso, toIso],
    queryFn: async () => {
      if (!casinoId || !fromIso || !toIso) return new Map<string, TableSplit>();
      const { data, error } = await supabase.rpc("compute_players_drop_split" as any, {
        _casino_id: casinoId,
        _from: fromIso,
        _to: toIso,
      });
      if (error) throw error;
      const m = new Map<string, TableSplit>();
      (data || []).forEach((r: any) => {
        m.set(r.player_id, { dropR: Number(r.drop_r) || 0, recycled: Number(r.drop_recycled) || 0 });
      });
      return m;
    },
    enabled: !!casinoId && !!fromIso && !!toIso,
    staleTime: 1000 * 30,
    refetchInterval: 60_000,
    select: (d: any) => (d instanceof Map ? d : new Map<string, TableSplit>(Object.entries(d ?? {}))),
  });
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
