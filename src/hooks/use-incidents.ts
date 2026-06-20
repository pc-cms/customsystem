/**
 * Incidents — CCTV/Manager violation log.
 * - List incidents for the current casino (default last 30 days).
 * - Insert new incident (CCTV / Manager / Super admin).
 * - Immutable: no updates, no deletes (per core principles).
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type Incident = {
  id: string;
  casino_id: string;
  incident_date: string;
  incident_time: string;
  cctv_observer: string | null;
  manager: string | null;
  department: string | null;
  employees: string | null;
  table_name: string | null;
  dealer_name: string | null;
  inspector_name: string | null;
  violation_type: string | null;
  incident: string;
  outcome: string | null;
  points: number;
  comments: string | null;
  photo_url: string | null;
  created_by: string | null;
  created_at: string;
};

export type IncidentInput = Omit<Incident, "id" | "casino_id" | "created_by" | "created_at">;

/**
 * Filter options:
 *  - days: keep incidents within last N calendar days (legacy).
 *  - businessDate: 07:00 → 07:00 EAT window for the given calendar date.
 *    Returns rows where (incident_date = D AND time >= 07:00)
 *                    OR (incident_date = D+1 AND time < 07:00).
 */
export const useIncidents = (
  days: number | null = null,
  businessDate: string | null = null,
  range: { from: string; to: string } | null = null,
) => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();

  const sinceDate = days != null
    ? (() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); })()
    : null;

  const nextDate = businessDate
    ? (() => { const d = new Date(businessDate + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })()
    : null;

  const query = useQuery({
    queryKey: ["incidents", casinoId, days, businessDate, range?.from, range?.to],
    queryFn: async () => {
      if (!casinoId) return [] as Incident[];
      let q = supabase
        .from("incidents")
        .select("*")
        .eq("casino_id", casinoId);
      if (businessDate && nextDate) {
        q = q.or(
          `and(incident_date.eq.${businessDate},incident_time.gte.11:00:00),` +
          `and(incident_date.eq.${nextDate},incident_time.lt.11:00:00)`,
        );
      } else if (range && range.from && range.to) {
        q = q.gte("incident_date", range.from).lte("incident_date", range.to);
      } else if (sinceDate) {
        q = q.gte("incident_date", sinceDate);
      }
      const { data, error } = await q
        .order("incident_date", { ascending: true })
        .order("incident_time", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data || []) as Incident[];
    },
    enabled: !!casinoId,
  });
      return (data || []) as Incident[];
    },
    enabled: !!casinoId,
  });

  useEffect(() => {
    if (!casinoId) return;
    const channel = supabase
      .channel(`casino:${casinoId}:incidents`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents", filter: `casino_id=eq.${casinoId}` },
        () => qc.invalidateQueries({ queryKey: ["incidents", casinoId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [casinoId, qc]);

  return query;
};

export const useCreateIncident = () => {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IncidentInput) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload = {
        ...input,
        casino_id: casinoId,
        created_by: user.id,
      };
      const { data, error } = await supabase.from("incidents").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents", casinoId] }),
  });
};

// Full edit allowed; DB trigger writes audit trail of every changed field.
export type IncidentFollowupPatch = Partial<Omit<Incident, "id" | "casino_id" | "created_by" | "created_at">>;

export const useUpdateIncidentFollowup = () => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: IncidentFollowupPatch }) => {
      const { data, error } = await supabase
        .from("incidents")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents", casinoId] }),
  });
};

