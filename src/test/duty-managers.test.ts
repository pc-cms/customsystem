import { describe, expect, it } from "vitest";
import { resolveDutyManagers } from "@/hooks/use-duty-managers";
import type { MgmtAttRow, MgmtPerson, MgmtRotaRow, MgmtSlot } from "@/hooks/use-management-rota";
import type { ShiftCode } from "@/hooks/use-shift-codes";

const slots = ["D", "M", "N"].map((id) => ({ id, block: "casino", casino_id: "arusha", person_id: id, month: "2026-09" })) as MgmtSlot[];
const people = ["D", "M", "N"].map((id) => ({ id, name: id, kind: "manager", is_active: true })) as MgmtPerson[];
const codes = [["D", "10:00", "18:00"], ["M", "13:00", "21:00"], ["N", "18:00", "06:00"]].map(([code, start_time, end_time]) => ({ casino_id: "arusha", department: "management", code, start_time, end_time, is_working: true })) as ShiftCode[];
const rota = ["D", "M", "N"].map((shift) => ({ slot_id: shift, shift, date: "2026-09-26" })) as MgmtRotaRow[];
const atEat = (day: string, time: string) => new Date(`${day}T${time}+03:00`);

describe("duty manager by EAT time", () => {
  it("chooses the latest starting shift during overlap", () => {
    expect(resolveDutyManagers(atEat("2026-09-26", "12:00"), slots, rota, [], people, codes).arusha).toBe("D");
    expect(resolveDutyManagers(atEat("2026-09-26", "14:00"), slots, rota, [], people, codes).arusha).toBe("M");
    expect(resolveDutyManagers(atEat("2026-09-26", "20:00"), slots, rota, [], people, codes).arusha).toBe("N");
  });

  it("keeps yesterday's night manager through 06:00 and respects absence", () => {
    expect(resolveDutyManagers(atEat("2026-09-27", "02:00"), slots, rota, [], people, codes).arusha).toBe("N");
    expect(resolveDutyManagers(atEat("2026-09-27", "06:00"), slots, rota, [], people, codes).arusha).toBeUndefined();
    const absence = [{ slot_id: "N", date: "2026-09-26", value: "A" }] as MgmtAttRow[];
    expect(resolveDutyManagers(atEat("2026-09-26", "22:00"), slots, rota, absence, people, codes).arusha).toBeUndefined();
  });
});