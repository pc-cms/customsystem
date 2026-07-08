/**
 * useCasinoSetting — typed reader/writer for public.casino_settings.
 *
 * All settings for the active casino are fetched in one query and cached.
 * Individual `useCasinoSetting(key)` calls hit the cache, so calling it from
 * many components does not multiply requests.
 *
 * Fallback chain:
 *   1. Row present in casino_settings → value
 *   2. No row → spec default from casino-settings-spec.ts
 *   3. Unknown key → null (caller must handle)
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { getSpec, SETTINGS } from "@/lib/casino-settings-spec";
import { liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { toast } from "sonner";

type Row = { key: string; value: unknown };

function useAllSettings() {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["casino-settings", activeCasinoId],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casino_settings")
        .select("key, value")
        .eq("casino_id", activeCasinoId!);
      if (error) throw error;
      const map = new Map<string, unknown>();
      for (const row of (data ?? []) as Row[]) map.set(row.key, row.value);
      return map;
    },
    ...liveQueryOptionsWithFallback(300_000),
  });
}

export interface UseSetting<T> {
  value: T;
  setValue: (v: T) => Promise<void>;
  isLoading: boolean;
  isDefault: boolean;
}

export function useCasinoSetting<T = unknown>(key: string): UseSetting<T> {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const { data: map, isLoading } = useAllSettings();
  const spec = getSpec(key);

  const stored = map?.get(key);
  const isDefault = stored === undefined;
  const value = (isDefault ? spec?.default : stored) as T;

  const mutate = useMutation({
    mutationFn: async (v: T) => {
      if (!activeCasinoId) throw new Error("no_active_casino");
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("casino_settings").upsert(
        [
          {
            casino_id: activeCasinoId,
            key,
            value: v as never,
            updated_by: userRes.user?.id ?? null,
          },
        ],
        { onConflict: "casino_id,key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino-settings", activeCasinoId] });
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  });

  return {
    value,
    setValue: (v: T) => mutate.mutateAsync(v),
    isLoading,
    isDefault,
  };
}

/**
 * Bulk export of the current casino's settings (for backup / tirage).
 * Undefined keys fall back to defaults so the export is complete.
 */
export function useSettingsExport() {
  const { data: map } = useAllSettings();
  return useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const s of SETTINGS) {
      out[s.key] = map?.has(s.key) ? map.get(s.key) : s.default;
    }
    return out;
  }, [map]);
}
