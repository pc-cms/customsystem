import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { PlayerZone } from "@/lib/zone-colors";

const KEY = "player_daily_zones";

export interface PlayerDailyZone {
  id: string;
  casino_id: string;
  player_id: string;
  business_date: string;
  zone: PlayerZone;
}

/** Map<player_id, zone> for a single business day in the current casino. */
export function usePlayerDailyZones(businessDate: string | undefined) {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: [KEY, casinoId, businessDate],
    // IMPORTANT: queryFn returns a plain Record so the data survives JSON
    // serialization (the persistent query cache cannot store Map instances —
    // they round-trip as `{}` and the zone column flickers empty on rehydrate).
    queryFn: async (): Promise<Record<string, PlayerZone>> => {
      if (!casinoId || !businessDate) return {};
      const { data, error } = await (supabase.from as any)("player_daily_zones")
        .select("player_id, zone")
        .eq("casino_id", casinoId)
        .eq("business_date", businessDate);
      if (error) throw error;
      const rec: Record<string, PlayerZone> = {};
      for (const r of (data || []) as Array<{ player_id: string; zone: PlayerZone }>) {
        rec[r.player_id] = r.zone;
      }
      return rec;
    },
    enabled: !!casinoId && !!businessDate,
    ...liveQueryOptions(),
    refetchInterval: 30_000,
    // React Query memoizes select output by structural equality of input,
    // so the resulting Map is stable across renders until data actually changes.
    select: (d: Record<string, PlayerZone> | Map<string, PlayerZone> | null | undefined) => {
      if (d instanceof Map) return d;
      return new Map<string, PlayerZone>(Object.entries(d ?? {}));
    },
  });
}


/** Upsert (or clear) a zone for one player on one business day. */
export function useSetPlayerDailyZone() {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      playerId, businessDate, zone,
    }: { playerId: string; businessDate: string; zone: PlayerZone | null }) => {
      if (!casinoId) throw new Error("No casino");
      const { data: existing } = await (supabase.from as any)("player_daily_zones")
        .select("id")
        .eq("casino_id", casinoId)
        .eq("player_id", playerId)
        .eq("business_date", businessDate)
        .maybeSingle();
      if (zone == null) {
        if (existing?.id) {
          const { error } = await (supabase.from as any)("player_daily_zones")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        }
        return;
      }
      if (existing?.id) {
        const { error } = await (supabase.from as any)("player_daily_zones")
          .update({ zone, updated_by: user?.id ?? null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("player_daily_zones")
          .insert({
            casino_id: casinoId,
            player_id: playerId,
            business_date: businessDate,
            zone,
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save zone"),
  });
}
