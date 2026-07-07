/**
 * use-staff-warnings — HR inbox of staff issues (absent / suspend / sick / late).
 * Rows are auto-managed by a DB trigger on dealer_attendance + staff_attendance.
 * UI only reads them and lets authorized roles edit the `comment` field.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

export type WarningKind = "absent" | "suspend" | "sick" | "late";

export interface StaffWarningRow {
  id: string;
  casino_id: string;
  employee_id: string;
  business_date: string;
  kind: WarningKind;
  comment: string;
  source_table: string;
  created_at: string;
  updated_at: string;
  employees?: { full_name: string; department: string | null } | null;
}

export const useStaffWarnings = (startIso: string, endIso: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["staff_warnings", activeCasinoId, startIso, endIso],
    enabled: !!activeCasinoId,
    queryFn: async (): Promise<StaffWarningRow[]> => {
      const { data, error } = await supabase
        .from("staff_warnings" as any)
        .select("*, employees:employee_id(full_name, department)")
        .eq("casino_id", activeCasinoId!)
        .gte("business_date", startIso)
        .lte("business_date", endIso)
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any;
    },
    ...liveQueryOptions(),
  });
};

export const useUpdateWarningComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
      const { error } = await supabase
        .from("staff_warnings" as any)
        .update({ comment })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff_warnings"] });
      toast.success("Comment saved");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save comment"),
  });
};

/**
 * Upsert a comment for a single (employee, business_date) warning row.
 * Used from the Break List inline hint — the warning row itself is created
 * by the DB trigger when attendance value flips to A/SP/S/L; we just attach
 * the operator's comment to it. If the row does not yet exist (race with the
 * attendance mutation), we retry once after 250ms.
 */
export const useUpsertWarningCommentByKey = () => {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employee_id, business_date, comment }: {
      employee_id: string; business_date: string; comment: string;
    }) => {
      if (!activeCasinoId) throw new Error("No active casino");
      const tryUpdate = async () => {
        const { data, error } = await supabase
          .from("staff_warnings" as any)
          .update({ comment })
          .eq("casino_id", activeCasinoId)
          .eq("employee_id", employee_id)
          .eq("business_date", business_date)
          .select("id");
        if (error) throw error;
        return (data || []) as any[];
      };
      let updated = await tryUpdate();
      if (updated.length === 0) {
        await new Promise(r => setTimeout(r, 250));
        updated = await tryUpdate();
      }
      return updated.length > 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_warnings"] }),
  });
};
