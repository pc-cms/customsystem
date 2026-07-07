/**
 * POS Locations — Main Bar, Coffee Counter, VIP Service, …
 * Archive-only (no hard delete). Default Main Bar is auto-created per casino.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type PosLocationType = "bar" | "coffee" | "vip_service" | "other";
export type PosLocation = {
  id: string;
  casino_id: string;
  name: string;
  type: PosLocationType;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const k = (casinoId: string | null) => ["pos-locations", casinoId] as const;

export function usePosLocations(casinoId: string | null, activeOnly = true) {
  return useQuery({
    queryKey: [...k(casinoId), activeOnly],
    enabled: !!casinoId,
    queryFn: async (): Promise<PosLocation[]> => {
      let q = supabase.from("pos_locations").select("*").eq("casino_id", casinoId!);
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q.order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as PosLocation[];
    },
    staleTime: 1000 * 60 * 30, // 30 min — POS locations rarely change
  });
}

/** Ensures Main Bar exists for casino; returns its id. */
export function useEnsureDefaultLocation() {
  return useMutation({
    mutationFn: async (casinoId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("pos_get_or_create_default_location", {
        _casino_id: casinoId,
      });
      if (error) throw error;
      return data as unknown as string;
    },
  });
}

export function useUpsertPosLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PosLocation> & { casino_id: string; name: string }) => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        casino_id: input.casino_id,
        name: input.name,
        type: input.type ?? "bar",
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? 0,
        updated_at: new Date().toISOString(),
      };
      const { error } = input.id
        ? await supabase.from("pos_locations").update(payload).eq("id", input.id)
        : await supabase.from("pos_locations").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: k(v.casino_id) }),
  });
}

export function useArchivePosLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("pos_locations")
        .update({ is_active: input.is_active, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-locations"] }),
  });
}
