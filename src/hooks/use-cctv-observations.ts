/**
 * Pitbook hook — CCTV ↔ Pit communication via cctv_observations.
 * - List recent observations (default last 7 days) for the current casino.
 * - Insert new observation (CCTV / Manager / Super admin).
 * - Acknowledge observation (Pit / Manager / Super admin).
 * - Realtime subscription for instant updates.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type CctvObservation = {
  id: string;
  casino_id: string;
  observer_id: string;
  observation_type: string;
  subject_type: "general" | "player" | "table";
  player_id: string | null;
  table_id: string | null;
  content: string;
  shift_id: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
};

export const useCctvObservations = (days = 7) => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const query = useQuery({
    queryKey: ["cctv-observations", casinoId, days],
    queryFn: async () => {
      if (!casinoId) return [] as CctvObservation[];
      const { data, error } = await supabase
        .from("cctv_observations")
        .select("*")
        .eq("casino_id", casinoId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as CctvObservation[];
    },
    enabled: !!casinoId,
  });

  // Realtime: invalidate on any change for this casino
  useEffect(() => {
    if (!casinoId) return;
    const channel = supabase
      .channel(`casino:${casinoId}:cctv-obs`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cctv_observations", filter: `casino_id=eq.${casinoId}` },
        () => qc.invalidateQueries({ queryKey: ["cctv-observations", casinoId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [casinoId, qc]);

  return query;
};

export const useCreateObservation = () => {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      content: string;
      subject_type?: "general" | "player" | "table";
      player_id?: string | null;
      table_id?: string | null;
      observation_type?: string;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload = {
        casino_id: casinoId,
        observer_id: user.id,
        observation_type: input.observation_type || "general",
        subject_type: input.subject_type || "general",
        player_id: input.player_id ?? null,
        table_id: input.table_id ?? null,
        content: input.content,
      };
      const { data, error } = await supabase.from("cctv_observations").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cctv-observations", casinoId] }),
  });
};

export const useAcknowledgeObservation = () => {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("cctv_observations")
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cctv-observations", casinoId] }),
  });
};
