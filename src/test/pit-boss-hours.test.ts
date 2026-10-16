import { describe, it, expect } from "vitest";
import { parseAttValue, pitBossHours } from "@/lib/attendance-code";
describe("pit boss tips hours 11/11/8/8", () => {
  it("middle shift = 11 even if attendance says 9", () => expect(pitBossHours(parseAttValue("9"), "M")).toBe(11));
  it("night shift = 8 even if attendance says 12", () => expect(pitBossHours(parseAttValue("12"), "N")).toBe(8));
  it("sick keeps 0", () => expect(pitBossHours(parseAttValue("S"), "M")).toBe(0));
  it("late partial keeps actual", () => expect(pitBossHours(parseAttValue("6L"), "M")).toBe(6));
});
