/**
 * Configurable shift codes per (casino, department).
 * Rota = plan, Attendance = fact — both read hours from the same codes.
 * Custom hours apply from SHIFT_CODES_FROM on; earlier months keep history.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SHIFT_CODES_FROM = "2026-09-01";
export type ShiftDept = "pit" | "floor" | "security" | "office" | "management";

export type ShiftCode = {
  id: string;
  casino_id: string;
  department: ShiftDept;
  code: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  color: string | null;
  is_working: boolean;
  sort_order: number;
};

export const useAllShiftCodes = () =>
  useQuery({
    queryKey: ["shift-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shift_codes" as any).select("*").order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as ShiftCode[];
    },
    staleTime: 5 * 60_000,
  });

export const useShiftCodes = (casinoId: string | null | undefined, department: ShiftDept | null | undefined) => {
  const q = useAllShiftCodes();
  const list = (q.data || []).filter((c) => c.casino_id === casinoId && c.department === department);
  return { ...q, data: list };
};

/** code → hours map for a casino+department (undefined while none configured). */
export const useShiftHoursMap = (casinoId: string | null | undefined, department: ShiftDept | null | undefined) => {
  const { data } = useShiftCodes(casinoId, department);
  if (!data.length) return undefined;
  const m: Record<string, number> = {};
  for (const c of data) m[c.code.toUpperCase()] = c.is_working ? Number(c.hours) : 0;
  return m;
};

/** Hours between two HH:MM times, overnight aware. */
export const hoursBetween = (start: string | null, end: string | null): number => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
};

export const useUpsertShiftCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<ShiftCode> & { casino_id: string; department: ShiftDept; code: string }) => {
      const hours = row.is_working === false ? 0 : hoursBetween(row.start_time ?? null, row.end_time ?? null);
      const payload = { ...row, code: row.code.toUpperCase(), hours };
      const { error } = row.id
        ? await supabase.from("shift_codes" as any).update(payload).eq("id", row.id)
        : await supabase.from("shift_codes" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-codes"] });
      qc.invalidateQueries({ queryKey: ["dealer-attendance"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
  });
};

export const useDeleteShiftCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_codes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift-codes"] }),
  });
};
