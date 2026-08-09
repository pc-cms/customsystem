/**
 * Management Rota / Attendance — network-wide (all casinos at once).
 *
 * Structure:
 *  - management_people : global roster (managers + CCTV), no casino binding.
 *  - management_slots  : per (block, casino, month) slots; a person is picked
 *                        into a slot, so anyone can be assigned to any city.
 *  - management_rota   : one shift (D/M/N/L) per slot per day. For CCTV slots
 *                        the shift is always 18:00–06:00, so instead of a shift
 *                        the city (city_casino_id) is picked.
 *  - management_attendance : manual A/L/S overrides on top of the rota.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type MgmtBlock = "casino" | "office" | "cctv";
export type MgmtShift = "D" | "M" | "N" | "L";

export type MgmtPerson = {
  id: string;
  name: string;
  kind: "manager" | "cctv";
  is_active: boolean;
  sort_order: number;
};

export type MgmtSlot = {
  id: string;
  block: MgmtBlock;
  casino_id: string | null;
  month: string;
  slot_index: number;
  person_id: string | null;
};

export type MgmtRotaRow = {
  id: string;
  slot_id: string;
  date: string;
  shift: MgmtShift | null;
  city_casino_id: string | null;
};

export type MgmtAttRow = {
  id: string;
  slot_id: string;
  date: string;
  value: "A" | "L" | "S" | null;
};

/** Manager shift → planned hours. CCTV is always 12h. */
export const MGMT_SHIFT_HOURS: Record<string, number> = { D: 8, M: 8, N: 12, L: 0 };
export const MGMT_SHIFT_LABELS: Record<MgmtShift, string> = {
  D: "10:00–18:00",
  M: "13:00–21:00",
  N: "18:00–06:00",
  L: "Leave",
};
export const CCTV_HOURS = 12;

/** 3-letter city codes used inside CCTV cells. */
export const CITY_CODES: Record<string, string> = {
  arusha: "ARU",
  mwanza: "MWZ",
  mbeya: "MBI",
  dodoma: "DOD",
};

export const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(dim).padStart(2, "0")}`, days: dim };
};

export const useManagementPeople = () =>
  useQuery({
    queryKey: ["management-people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_people" as any)
        .select("*")
        .eq("is_active", true)
        .order("kind")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as MgmtPerson[];
    },
    staleTime: 5 * 60_000,
  });

export const useManagementSlots = (month: string) =>
  useQuery({
    queryKey: ["management-slots", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_slots" as any)
        .select("*")
        .eq("month", month)
        .order("slot_index");
      if (error) throw error;
      return (data || []) as unknown as MgmtSlot[];
    },
  });

export const useManagementRota = (month: string) => {
  const { from, to } = monthBounds(month);
  return useQuery({
    queryKey: ["management-rota", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_rota" as any)
        .select("*")
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return (data || []) as unknown as MgmtRotaRow[];
    },
  });
};

export const useManagementAttendance = (month: string) => {
  const { from, to } = monthBounds(month);
  return useQuery({
    queryKey: ["management-attendance", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_attendance" as any)
        .select("*")
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return (data || []) as unknown as MgmtAttRow[];
    },
  });
};

/** Ensure slots exist for a month — copies the previous month's people. */
export const useEnsureManagementSlots = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, casinoIds, perBlock = 4 }: { month: string; casinoIds: string[]; perBlock?: number }) => {
      const { data: existing } = await supabase
        .from("management_slots" as any)
        .select("id")
        .eq("month", month)
        .limit(1);
      if (existing && existing.length) return false;

      // Seed from the previous month so people stay in place.
      const [y, m] = month.split("-").map(Number);
      const prevD = new Date(y, m - 2, 1);
      const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
      const { data: prevSlots } = await supabase
        .from("management_slots" as any)
        .select("block, casino_id, slot_index, person_id")
        .eq("month", prev);
      const prevMap = new Map<string, string | null>();
      for (const s of (prevSlots || []) as any[]) {
        prevMap.set(`${s.block}|${s.casino_id ?? ""}|${s.slot_index}`, s.person_id);
      }

      const rows: any[] = [];
      const push = (block: MgmtBlock, casino_id: string | null) => {
        for (let i = 1; i <= perBlock; i++) {
          rows.push({
            block,
            casino_id,
            month,
            slot_index: i,
            person_id: prevMap.get(`${block}|${casino_id ?? ""}|${i}`) ?? null,
          });
        }
      };
      casinoIds.forEach((id) => push("casino", id));
      push("office", null);
      push("cctv", null);
      const { error } = await supabase.from("management_slots" as any).insert(rows);
      if (error) throw error;
      return true;
    },
    onSuccess: (created, vars) => {
      if (created) qc.invalidateQueries({ queryKey: ["management-slots", vars.month] });
    },
  });
};

export const useAddManagementSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ block, casinoId, month, nextIndex }: { block: MgmtBlock; casinoId: string | null; month: string; nextIndex: number }) => {
      const { error } = await supabase
        .from("management_slots" as any)
        .insert({ block, casino_id: casinoId, month, slot_index: nextIndex });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["management-slots", v.month] }),
  });
};

export const useSetSlotPerson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slotId, personId }: { slotId: string; personId: string | null; month: string }) => {
      const { error } = await supabase
        .from("management_slots" as any)
        .update({ person_id: personId })
        .eq("id", slotId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["management-slots", v.month] }),
  });
};

export const useSetManagementRota = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slotId,
      date,
      shift,
      cityCasinoId,
    }: { slotId: string; date: string; shift: MgmtShift | null; cityCasinoId: string | null; month: string }) => {
      if (!shift && !cityCasinoId) {
        const { error } = await supabase.from("management_rota" as any).delete().eq("slot_id", slotId).eq("date", date);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("management_rota" as any)
        .upsert({ slot_id: slotId, date, shift, city_casino_id: cityCasinoId }, { onConflict: "slot_id,date" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["management-rota", v.month] }),
  });
};

export const useSetManagementAttendance = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ slotId, date, value }: { slotId: string; date: string; value: "A" | "L" | "S" | null; month: string }) => {
      if (!value) {
        const { error } = await supabase.from("management_attendance" as any).delete().eq("slot_id", slotId).eq("date", date);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("management_attendance" as any)
        .upsert({ slot_id: slotId, date, value, recorded_by: user?.id ?? null }, { onConflict: "slot_id,date" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["management-attendance", v.month] }),
  });
};
