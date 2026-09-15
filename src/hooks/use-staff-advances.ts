/**
 * Staff salary advances — one sheet per month, printable, and pulled into
 * payroll on Refresh (payroll_apply_advances sums them into salary_advances).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export interface StaffAdvance {
  id: string;
  casino_id: string;
  employee_id: string;
  year: number;
  month: number;
  advance_date: string;
  amount: number;
  note: string | null;
  paid_out: boolean;
  created_at: string;
}

export const useStaffAdvances = (year: number, month: number) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["staff_advances", activeCasinoId, year, month],
    queryFn: async (): Promise<StaffAdvance[]> => {
      const { data, error } = await supabase
        .from("staff_advances" as any)
        .select("*")
        .eq("casino_id", activeCasinoId!)
        .eq("year", year)
        .eq("month", month)
        .order("advance_date", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as StaffAdvance[]) || [];
    },
    enabled: !!activeCasinoId,
  });
};

export const useSaveStaffAdvance = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<StaffAdvance>) => {
      const payload: any = {
        casino_id: activeCasinoId,
        employee_id: input.employee_id,
        year: input.year,
        month: input.month,
        advance_date: input.advance_date,
        amount: input.amount ?? 0,
        note: input.note ?? null,
        paid_out: input.paid_out ?? false,
      };
      if (!input.id) payload.created_by = user?.id ?? null;
      const q = input.id
        ? supabase.from("staff_advances" as any).update(payload).eq("id", input.id)
        : supabase.from("staff_advances" as any).insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff_advances"] });
      toast.success("Advance saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteStaffAdvance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_advances" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff_advances"] });
      toast.success("Advance removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
