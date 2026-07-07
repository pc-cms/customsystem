/**
 * G4 · Player CRM hooks.
 * One server-side aggregated list + mutations to update CRM metadata.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type CrmSegment = "vip" | "regular" | "new" | "dormant" | "custom";

export interface CrmPlayerRow {
  player_id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  phone: string;
  photo_url: string | null;
  category: string;
  status: string;
  birth_date: string | null;
  card_number: string | null;
  segment: CrmSegment;
  segment_locked: boolean;
  host_user_id: string | null;
  host_name: string | null;
  last_contact_at: string | null;
  last_contact_note: string;
  custom_tags: string[];
  birthday_card_sent_year: number | null;
  last_visit: string | null;
  visits_90d: number;
  visits_total: number;
  created_at: string;
}

export const useCrmPlayers = (casinoId: string | null) => {
  return useQuery({
    queryKey: ["crm-players", casinoId],
    enabled: !!casinoId,
    queryFn: async (): Promise<CrmPlayerRow[]> => {
      const { data, error } = await supabase.rpc("crm_players_list" as any, {
        _casino: casinoId,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        visits_90d: Number(r.visits_90d || 0),
        visits_total: Number(r.visits_total || 0),
      })) as CrmPlayerRow[];
    },
    ...liveQueryOptionsWithFallback(60000),
  });
};

export interface CrmUpdate {
  player_id: string;
  casino_id: string;
  host_user_id?: string | null;
  segment?: CrmSegment;
  segment_locked?: boolean;
  last_contact_note?: string;
  last_contact_at?: string | null;
  custom_tags?: string[];
  birthday_card_sent_year?: number | null;
}

export const useUpsertCrm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CrmUpdate) => {
      const { player_id, casino_id, ...rest } = input;
      const { error } = await supabase
        .from("player_crm" as any)
        .upsert({ player_id, casino_id, ...rest } as any, {
          onConflict: "player_id",
        });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-players", vars.casino_id] });
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    },
  });
};

export const useRecalcSegments = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (casinoId: string) => {
      const { data, error } = await supabase.rpc("player_segment_recalc" as any, {
        _casino: casinoId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, casinoId) => {
      qc.invalidateQueries({ queryKey: ["crm-players", casinoId] });
      toast({ title: "Segments recalculated", description: `${n ?? 0} players updated` });
    },
    onError: (e: any) => {
      toast({ title: "Recalc failed", description: e?.message, variant: "destructive" });
    },
  });
};

/** Hosts pool — staff profiles for the casino (used in host assignment dropdown). */
export const useCasinoHosts = (casinoId: string | null) => {
  return useQuery({
    queryKey: ["casino-hosts", casinoId],
    enabled: !!casinoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .eq("casino_id", casinoId!)
        .is("disabled_at", null)
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as { user_id: string; display_name: string }[];
    },
    ...liveQueryOptionsWithFallback(300000),
  });
};
