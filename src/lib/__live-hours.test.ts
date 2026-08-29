import { describe, it, expect } from "vitest";
import { breaklistSlots, trackerSlots, headCountSlots, isInLiveHours, liveOpsAllowedAt, parseStartHour } from "@/lib/live-hours";

describe("live-hours", () => {
  it("breaklist 12:00", () => {
    const s = breaklistSlots(12);
    expect(s[0]).toBe("12:00"); expect(s[1]).toBe("12:20");
    expect(s[s.length-1]).toBe("05:40"); expect(s.length).toBe((30-12)*3);
  });
  it("breaklist 18/20", () => {
    expect(breaklistSlots(18)[0]).toBe("18:00");
    expect(breaklistSlots(20)[0]).toBe("20:00");
    expect(breaklistSlots(20).at(-1)).toBe("05:40");
  });
  it("tracker slots end at Final 06:00", () => {
    expect(trackerSlots(12)[0]).toBe("12:00");
    expect(trackerSlots(19).at(-1)).toBe("06:00");
    expect(trackerSlots(20)).toEqual(["20:00","21:00","22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00"]);
  });
  it("headcount ends 05:00", () => {
    expect(headCountSlots(12).at(-1)).toBe("05:00");
    expect(headCountSlots(18)[0]).toBe("18:00");
  });
  it("live hours membership", () => {
    expect(isInLiveHours("13:00", 12)).toBe(true);
    expect(isInLiveHours("13:00", 18)).toBe(false);
    expect(isInLiveHours("02:00", 20)).toBe(true);
  });
  it("guard", () => {
    const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
    expect(liveOpsAllowedAt(at(11), 12)).toBe(false);
    expect(liveOpsAllowedAt(at(12), 12)).toBe(true);
    expect(liveOpsAllowedAt(at(3), 20)).toBe(true);
    expect(liveOpsAllowedAt(at(19), 20)).toBe(false);
  });
  it("parse + clamp", () => {
    expect(parseStartHour("18:00")).toBe(18);
    expect(parseStartHour("09:00")).toBe(12);
    expect(parseStartHour("22:00")).toBe(20);
    expect(parseStartHour(null)).toBe(18);
  });
});
