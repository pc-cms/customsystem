import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { UNIFIED_SHIFT_COLORS } from "@/lib/shift-colors";
import { buildDisplayNames, splitFullName } from "@/lib/display-name";
import { invalidateEmployeeCaches } from "@/lib/invalidate-employees";

export type StaffDepartment = "security" | "cashier" | "bartender" | "hostess" | "waiter" | "cleaner" | "it" | "hr" | "driver" | "reception";

export interface StaffMember {
  id: string;
  casino_id: string;
  name: string;
  department: StaffDepartment;
  is_active: boolean;
  salary: number | null;
  contract_start: string | null;
  contract_end: string | null;
  onboarding_date: string | null;
  created_at: string;
}

export const DEPARTMENT_LABELS: Record<StaffDepartment, string> = {
  security: "Security",
  cashier: "Cashiers",
  bartender: "Bar",
  hostess: "Hostess",
  waiter: "Waiters",
  cleaner: "Housekeeping",
  it: "IT",
  hr: "HR",
  driver: "Driver",
  reception: "Reception",
};

export const DEPARTMENT_ORDER: StaffDepartment[] = [
  "security", "cashier", "bartender", "hostess", "waiter", "cleaner", "reception", "it", "hr", "driver",
];

// Rota group definitions
export const ROTA_GROUPS = {
  floor: {
    label: "Floor",
    departments: ["cashier", "bartender", "hostess", "waiter", "cleaner", "reception"] as StaffDepartment[],
    shifts: ["D", "N", "L", "E", "O"] as const,
    shiftLabels: { D: "12:30", N: "20:45", L: "Leave", E: "17:45", O: "Off" } as Record<string, string>,
  },
  security: {
    label: "Security",
    departments: ["security"] as StaffDepartment[],
    shifts: ["D", "M", "N", "G", "L", "E", "O"] as const,
    shiftLabels: { D: "06:00", M: "13:45", N: "17:45", G: "21:45", L: "Leave", E: "17:45", O: "Off" } as Record<string, string>,
  },
  office: {
    label: "Office",
    departments: ["it", "hr", "driver"] as StaffDepartment[],
    shifts: ["D", "N", "L", "E", "O"] as const,
    shiftLabels: { D: "12:30", N: "20:45", L: "Leave", E: "17:45", O: "Off" } as Record<string, string>,
  },
} as const;

export type RotaGroupKey = keyof typeof ROTA_GROUPS;

const STAFF_SHIFTS = ["D", "N", "L", "E", "O"] as const;

export const STAFF_SHIFT_LABELS: Record<string, string> = {
  D: "12:30",
  N: "20:45",
  L: "Leave",
  E: "17:45",
  O: "Off",
};

export const STAFF_SHIFT_COLORS = UNIFIED_SHIFT_COLORS;

// Phase 3: read employees (non-Live-Game), alias employee_id → staff_id, write employee_id (DB triggers fill legacy staff_id).

const mapDept = (department: string, position: string | null): StaffDepartment => {
  // "Floor" is the canonical bucket for all non-gaming staff — dispatch by position.
  if (department === "Floor") {
    switch (position) {
      case "Bartender":   return "bartender";
      case "Cashier":     return "cashier";
      case "Cleaner":
      case "Housekeeper": return "cleaner";
      case "Hostess":     return "hostess";
      case "Waiter":      return "waiter";
      case "Receptionist":
      case "Reception":   return "reception";
      default:            return "cleaner";
    }
  }
  switch (department) {
    case "Security":    return "security";
    case "Cash Desk":   return "cashier";
    case "Bar":         return "bartender";
    case "Slots":       return position === "Waiter" ? "waiter" : "hostess";
    case "Housekeeper": return "cleaner";
    case "Office":      return position === "HR" ? "hr" : "it";
    default:            return "cleaner";
  }
};

export const mapEmployeeToStaff = (e: any): StaffMember => {
  const split = splitFullName(e.full_name);
  const first = (e.first_name && String(e.first_name).trim()) || split.first;
  // Show FIRST NAME only by default; disambiguation appends last-name initials
  // when two people in the same list share the same first name.
  const displayName = first || (e.full_name && String(e.full_name).trim()) || "";
  return {
    id: e.id,
    casino_id: e.casino_id,
    name: displayName,
    department: mapDept(e.department, e.position),
    is_active: e.payroll_status === "active",
    salary: e.basic_salary != null ? Number(e.basic_salary) : null,
    contract_start: e.contract_start,
    contract_end: e.contract_end,
    onboarding_date: e.onboarding_date,
    created_at: e.created_at,
  };
};

export const normalizeEmployeesToStaff = (raw: any[]): StaffMember[] => {
  const inputs = raw.map((e: any) => {
    const split = splitFullName(e.full_name);
    const first = (e.first_name && String(e.first_name).trim()) || split.first || (e.full_name || "").trim();
    return {
      id: e.id,
      first,
      last: (e.last_name && String(e.last_name).trim()) || split.last,
    };
  });
  const dispMap = buildDisplayNames(inputs);
  return raw.map((e: any) => {
    const m = mapEmployeeToStaff(e);
    return { ...m, name: dispMap.get(m.id) || m.name };
  });
};

export const useStaffMembers = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["staff_members", casinoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("casino_id", casinoId!)
        .neq("department", "Pit")
        .order("department")
        .order("full_name");
      if (error) throw error;
      const raw = data ?? [];
      return normalizeEmployeesToStaff(raw);
    },
    enabled: !!casinoId,
    ...liveQueryOptions(), // 30 min — staff roster changes rarely
                              // persisted cache cannot render an empty rota/attendance grid.
  });
};

const reverseDept = (d: StaffDepartment): { department: string; position: string } => {
  switch (d) {
    case "security":  return { department: "Security", position: "Security" };
    case "cashier":   return { department: "Floor",    position: "Cashier" };
    case "bartender": return { department: "Floor",    position: "Bartender" };
    case "hostess":   return { department: "Floor",    position: "Hostess" };
    case "waiter":    return { department: "Floor",    position: "Waiter" };
    case "cleaner":   return { department: "Floor",    position: "Cleaner" };
    case "reception": return { department: "Floor",    position: "Receptionist" };
    case "it":
    case "driver":    return { department: "Office",   position: "IT" };
    case "hr":        return { department: "Office",   position: "HR" };
  }
};

export const useCreateStaffMember = () => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, department }: { name: string; department: StaffDepartment }) => {
      const r = reverseDept(department);
      const { error } = await supabase
        .from("employees")
        .insert({ casino_id: casinoId!, full_name: name, department: r.department, position: r.position, basic_salary: 0, payroll_status: "active" });
      if (error) throw error;
    },
    onSuccess: () => invalidateEmployeeCaches(qc),
  });
};

export const useUpdateStaffMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, salary, contract_start, contract_end, onboarding_date, is_active, photo_url }: { id: string; name?: string; salary?: number | null; contract_start?: string | null; contract_end?: string | null; onboarding_date?: string | null; is_active?: boolean; photo_url?: string | null }) => {
      const patch: any = {};
      if (name !== undefined) patch.full_name = name;
      if (salary !== undefined) patch.basic_salary = salary ?? 0;
      if (contract_start !== undefined) patch.contract_start = contract_start;
      if (contract_end !== undefined) patch.contract_end = contract_end;
      if (onboarding_date !== undefined) patch.onboarding_date = onboarding_date;
      if (is_active !== undefined) patch.payroll_status = is_active ? "active" : "inactive";
      if (photo_url !== undefined) patch.photo_url = photo_url;
      const { error } = await supabase.from("employees").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateEmployeeCaches(qc),
  });
};

export const useDeleteStaffMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // FK ON DELETE RESTRICT blocks if history exists; soft-deactivate instead.
      const { error } = await supabase.from("employees").update({ payroll_status: "inactive" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateEmployeeCaches(qc),
  });
};

const aliasStaffRow = (r: any) => ({ ...r, staff_id: r.employee_id });

export const useStaffRotaRange = (startDate: string, endDate: string) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["staff_rota", casinoId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_rota").select("*")
        .eq("casino_id", casinoId!).gte("date", startDate).lte("date", endDate);
      if (error) throw error;
      return (data ?? []).map(aliasStaffRow);
    },
    enabled: !!casinoId,
  });
};

export const useSetStaffRota = () => {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staff_id, date, shift }: { staff_id: string; date: string; shift: string }) => {
      const { error } = await supabase
        .from("staff_rota")
        .upsert({
          casino_id: casinoId!,
          employee_id: staff_id,
          date,
          shift,
          created_by: user!.id,
        } as any, { onConflict: "casino_id,employee_id,date" });
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["staff_rota"] });
      qc.setQueriesData({ queryKey: ["staff_rota"] }, (old: any[] | undefined) => {
        if (!old) return old;
        const idx = old.findIndex((r: any) => r.staff_id === vars.staff_id && r.date === vars.date);
        if (idx >= 0) {
          const copy = [...old];
          copy[idx] = { ...copy[idx], shift: vars.shift };
          return copy;
        }
        return [...old, { staff_id: vars.staff_id, employee_id: vars.staff_id, date: vars.date, shift: vars.shift, casino_id: casinoId }];
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["staff_rota"] }),
  });
};

export const useDeleteStaffRota = () => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staff_id, date }: { staff_id: string; date: string }) => {
      const { error } = await supabase
        .from("staff_rota").delete()
        .eq("casino_id", casinoId!).eq("employee_id", staff_id).eq("date", date);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["staff_rota"] });
      qc.setQueriesData({ queryKey: ["staff_rota"] }, (old: any[] | undefined) => {
        if (!old) return old;
        return old.filter((r: any) => !(r.staff_id === vars.staff_id && r.date === vars.date));
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["staff_rota"] }),
  });
};

export const useStaffAttendanceRange = (startDate: string, endDate: string) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["staff_attendance", casinoId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance").select("*")
        .eq("casino_id", casinoId!).gte("date", startDate).lte("date", endDate);
      if (error) throw error;
      return (data ?? []).map(aliasStaffRow);
    },
    enabled: !!casinoId,
  });
};

export const useSetStaffAttendance = () => {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staff_id, date, value }: { staff_id: string; date: string; value: string }) => {
      const { error } = await supabase
        .from("staff_attendance")
        .upsert({
          casino_id: casinoId!,
          employee_id: staff_id,
          date,
          value,
          recorded_by: user!.id,
        } as any, { onConflict: "casino_id,employee_id,date" });
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["staff_attendance"] });
      qc.setQueriesData({ queryKey: ["staff_attendance"] }, (old: any[] | undefined) => {
        if (!old) return old;
        const idx = old.findIndex((a: any) => a.staff_id === vars.staff_id && a.date === vars.date);
        if (idx >= 0) {
          const copy = [...old];
          copy[idx] = { ...copy[idx], value: vars.value };
          return copy;
        }
        return [...old, { staff_id: vars.staff_id, employee_id: vars.staff_id, date: vars.date, value: vars.value, casino_id: casinoId }];
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["staff_attendance"] }),
  });
};
