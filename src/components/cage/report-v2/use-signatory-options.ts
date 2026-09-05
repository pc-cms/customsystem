/**
 * Signatory options for the closing report signature lines.
 *
 * Cashiers  — cash desk employees of the shift's own casino (location scoped).
 * Managers  — the full company-wide manager directory (not location scoped).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STALE = 5 * 60 * 1000;

export const useCashierOptions = (casinoId?: string | null) =>
  useQuery({
    queryKey: ["signatory-cashiers", casinoId],
    enabled: !!casinoId,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, department, termination_date, deleted_at")
        .eq("casino_id", casinoId as string)
        .is("deleted_at", null)
        .is("termination_date", null)
        .order("full_name");
      if (error) throw error;
      return (data || [])
        .filter(e => String(e.department || "").toLowerCase().includes("cash"))
        .map(e => String(e.full_name || "").trim())
        .filter(Boolean);
    },
  });

export const useManagerOptions = () =>
  useQuery({
    queryKey: ["signatory-managers"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_people")
        .select("id, name, kind, is_active, sort_order")
        .eq("kind", "manager")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data || []).map(p => String(p.name || "").trim()).filter(Boolean);
    },
  });
