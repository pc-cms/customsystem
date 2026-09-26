import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MgmtAttRow, MgmtPerson, MgmtRotaRow, MgmtSlot } from "@/hooks/use-management-rota";
import type { ShiftCode } from "@/hooks/use-shift-codes";

const eatDate = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
const eatMinutes = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
};
const minutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

export function resolveDutyManagers(
  now: Date,
  slots: MgmtSlot[],
  rota: MgmtRotaRow[],
  attendance: MgmtAttRow[],
  people: MgmtPerson[],
  codes: ShiftCode[],
): Record<string, string> {
  const today = eatDate(now);
  const yesterday = eatDate(new Date(now.getTime() - 86_400_000));
  const currentMinute = eatMinutes(now);
  const bySlot = new Map(slots.filter((s) => s.block === "casino").map((s) => [s.id, s]));
  const byPerson = new Map(people.filter((p) => p.is_active && p.kind === "manager").map((p) => [p.id, p.name]));
  const absent = new Set(attendance.filter((a) => a.value === "A" || a.value === "L" || a.value === "S")
    .map((a) => `${a.slot_id}|${a.date}`));
  const byCode = new Map(codes.filter((c) => c.department === "management" && c.is_working)
    .map((c) => [`${c.casino_id}|${c.code}`, c]));
  const matches: Record<string, { start: number; names: string[] }> = {};

  for (const row of rota) {
    if (!row.shift || (row.date !== today && row.date !== yesterday)) continue;
    const slot = bySlot.get(row.slot_id);
    if (!slot?.casino_id || !slot.person_id || absent.has(`${row.slot_id}|${row.date}`)) continue;
    const name = byPerson.get(slot.person_id);
    const code = byCode.get(`${slot.casino_id}|${row.shift}`);
    if (!name || !code?.start_time || !code.end_time) continue;
    const dayOffset = row.date === yesterday ? -1440 : 0;
    const start = minutes(code.start_time) + dayOffset;
    let end = minutes(code.end_time) + dayOffset;
    if (end <= start) end += 1440;
    if (currentMinute < start || currentMinute >= end) continue;
    const prior = matches[slot.casino_id];
    if (!prior || start > prior.start) matches[slot.casino_id] = { start, names: [name] };
    else if (start === prior.start && !prior.names.includes(name)) prior.names.push(name);
  }

  return Object.fromEntries(Object.entries(matches).map(([id, match]) => [id, match.names.join(" · ")]));
}

export function useDutyManagers(enabled: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const today = eatDate(now);
  const yesterday = eatDate(new Date(now.getTime() - 86_400_000));
  const months = [...new Set([today.slice(0, 7), yesterday.slice(0, 7)])];
  const { data } = useQuery({
    queryKey: ["boss-duty-managers", today, yesterday],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [slotsRes, rotaRes, attRes, peopleRes, codesRes] = await Promise.all([
        supabase.from("management_slots" as any).select("id, block, casino_id, month, slot_index, person_id").eq("block", "casino").in("month", months),
        supabase.from("management_rota" as any).select("slot_id, date, shift").gte("date", yesterday).lte("date", today),
        supabase.from("management_attendance" as any).select("slot_id, date, value").gte("date", yesterday).lte("date", today),
        supabase.from("management_people" as any).select("id, name, kind, is_active").eq("is_active", true).eq("kind", "manager"),
        supabase.from("shift_codes" as any).select("casino_id, department, code, start_time, end_time, is_working").eq("department", "management"),
      ]);
      for (const result of [slotsRes, rotaRes, attRes, peopleRes, codesRes]) {
        if (result.error) throw result.error;
      }
      return {
        slots: (slotsRes.data ?? []) as unknown as MgmtSlot[],
        rota: (rotaRes.data ?? []) as unknown as MgmtRotaRow[],
        attendance: (attRes.data ?? []) as unknown as MgmtAttRow[],
        people: (peopleRes.data ?? []) as unknown as MgmtPerson[],
        codes: (codesRes.data ?? []) as unknown as ShiftCode[],
      };
    },
  });

  return useMemo(() => data ? resolveDutyManagers(now, data.slots, data.rota, data.attendance, data.people, data.codes) : {}, [now, data]);
}