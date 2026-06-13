import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

export type BusinessDayClosure = {
  id: string;
  casino_id: string;
  business_date: string;
  closed_at: string;
  closed_by: string | null;
  closed_method: string;
  snapshot: Record<string, any[]>;
};

export type SnapshotSection =
  | "cash_counts" | "expenses" | "cashless"
  | "table_tracker" | "chip_snapshots" | "breaklist" | "player_stats";

export const FINANCIAL_SECTIONS: SnapshotSection[] = ["cash_counts", "expenses", "cashless"];
export const PIT_SECTIONS: SnapshotSection[] = ["table_tracker", "chip_snapshots", "breaklist", "player_stats"];

export type EditPatch = {
  row_index: number;
  field: string;
  before: any;
  after: any;
};

export const canEditSection = (
  section: SnapshotSection,
  roles: string[],
): boolean => {
  const isSuper = roles.includes("super_admin");
  const isManager = roles.includes("manager") || roles.includes("shift_manager");
  const isFinance = roles.includes("finance_manager");
  if (FINANCIAL_SECTIONS.includes(section)) return isFinance || isSuper;
  if (PIT_SECTIONS.includes(section)) return isManager || isSuper;
  return false;
};

export function useBusinessDayHistory(month: string /* YYYY-MM */) {
  const { roles } = useAuth();
  const { activeCasinoId, isSummaryMode } = useCasino();
  const isSuper = roles.includes("super_admin");
  const canSee = roles.includes("manager") || roles.includes("finance_manager") || isSuper;

  return useQuery({
    queryKey: ["business-day-history", activeCasinoId ?? "__all__", month, isSummaryMode],
    queryFn: async (): Promise<BusinessDayClosure[]> => {
      if (!canSee) return [];
      const start = `${month}-01`;
      const [y, m] = month.split("-").map(Number);
      const next = new Date(y, m, 1);
      const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
      let q = supabase
        .from("business_day_closures")
        .select("*")
        .gte("business_date", start)
        .lt("business_date", end)
        .order("business_date", { ascending: false })
        .order("closed_at", { ascending: false });
      // Per Core rule: scope strictly by current subdomain casino. Only premier (isSummaryMode) sees all.
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BusinessDayClosure[];
    },
    enabled: canSee && (isSummaryMode || !!activeCasinoId),
  });
}

export function useEditBusinessDaySnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      closure_id: string;
      section: SnapshotSection;
      patches: EditPatch[];
    }) => {
      if (args.patches.length === 0) return { status: "noop", changes: 0 };
      const { data, error } = await supabase.rpc("edit_business_day_snapshot", {
        _closure_id: args.closure_id,
        _section: args.section,
        _patches: args.patches as any,
      });
      if (error) throw error;
      return data as { status: string; changes: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["business-day-history"] });
      qc.invalidateQueries({ queryKey: ["activity-logs"] });
      if (res?.changes) toast.success(`Saved ${res.changes} change(s)`);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to save"),
  });
}
