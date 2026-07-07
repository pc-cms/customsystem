import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { LogLookups, NameMap } from "@/lib/format-log";

/**
 * Fetches name lookup maps used by the audit-log formatter so that UUIDs
 * (dealer_id / player_id / table_id / operator_id) become readable names.
 * Scoped to the current casino.
 */
export const useLogLookups = () => {
  const { casinoId } = useAuth();
  return useQuery<LogLookups>({
    queryKey: ["log-lookups", casinoId],
    queryFn: async () => {
      if (!casinoId) return {};
      const [dealersRes, playersRes, tablesRes, profilesRes] = await Promise.all([
        supabase.from("employees").select("id, full_name").eq("casino_id", casinoId).eq("department", "Pit"),
        supabase.from("players").select("id, full_name").eq("casino_id", casinoId),
        supabase.from("gaming_tables").select("id, name").eq("casino_id", casinoId),
        supabase.from("profiles").select("id, display_name"),
      ]);

      const dealers: NameMap = {};
      (dealersRes.data ?? []).forEach((r: any) => { dealers[r.id] = r.full_name; });
      const players: NameMap = {};
      (playersRes.data ?? []).forEach((r: any) => { players[r.id] = r.full_name; });
      const tables: NameMap = {};
      (tablesRes.data ?? []).forEach((r: any) => { tables[r.id] = r.name; });
      const users: NameMap = {};
      (profilesRes.data ?? []).forEach((r: any) => { users[r.id] = r.display_name ?? ""; });

      return { dealers, players, tables, users };
    },
    enabled: !!casinoId,
    ...liveQueryOptionsWithFallback(60000),
  });
};
