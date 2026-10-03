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
  /** Sub-department (unit) key; null = legacy department-level code. */
  unit: string | null;
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

export const useShiftCodes = (casinoId: string | null | undefined, department: ShiftDept | null | undefined, unit: string | null = null) => {
  const q = useAllShiftCodes();
  const list = (q.data || []).filter((c) => c.casino_id === casinoId && c.department === department && (c.unit ?? null) === unit);
  return { ...q, data: list };
};

/** code → hours map for a casino+department (undefined while none configured). */
export const useShiftHoursMap = (casinoId: string | null | undefined, department: ShiftDept | null | undefined, unit: string | null = null) => {
  const { data } = useShiftCodes(casinoId, department, unit);
  if (!data.length) return undefined;
  const m: Record<string, number> = {};
  for (const c of data) m[c.code.toUpperCase()] = c.is_working ? Number(c.hours) : 0;
  return m;
};

/**
 * unit → (code → hours) for a casino+department. Each sub-department has its
 * own codes; units without codes fall back to the department-level map.
 */
export const useUnitHoursMaps = (casinoId: string | null | undefined, department: ShiftDept | null | undefined) => {
  const q = useAllShiftCodes();
  const out: Record<string, Record<string, number>> = {};
  for (const c of q.data || []) {
    if (c.casino_id !== casinoId || c.department !== department) continue;
    const k = c.unit ?? "";
    (out[k] ||= {})[c.code.toUpperCase()] = c.is_working ? Number(c.hours) : 0;
  }
  return (unit: string | null | undefined): Record<string, number> | undefined =>
    (unit && out[unit]) || out[""] || undefined;
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
    mutationFn: async (row: Partial<ShiftCode> & { casino_id: string; department: ShiftDept; code: string; unit?: string | null }) => {
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

/** Legend text for a code: "10:00–18:00 · 8h"; null when the code has no times. */
export const formatShiftCodeLegend = (c: ShiftCode | undefined): string | null => {
  if (!c || !c.is_working || !c.start_time || !c.end_time) return null;
  const h = Number(c.hours);
  return `${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)} · ${Number.isInteger(h) ? h : h.toFixed(2).replace(/0+$/, "")}h`;
};

const LEGACY_START: Record<string, string> = { D: "06:00", M: "08:00", A: "10:00", SW: "16:00", E: "18:00", N: "20:00" };
const NON_WORKING = new Set(["O", "L", "V", "A", "S", "SP", "EM", "ESW", "EN"]);

/** Sort codes chronologically by start time; non-working codes go last. */
export const sortShiftsByTime = (codes: readonly string[], configured: ShiftCode[]): string[] => {
  const key = (code: string): [number, number, string] => {
    const c = configured.find((x) => x.code.toUpperCase() === code);
    if (c && !c.is_working) return [1, 9999, code];
    if (!c && NON_WORKING.has(code)) return [1, 9999, code];
    const t = c?.start_time || LEGACY_START[code];
    if (!t) return [0, 9998, code];
    const [h, m] = t.split(":").map(Number);
    return [0, h * 60 + (m || 0), code];
  };
  return [...codes].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
};
