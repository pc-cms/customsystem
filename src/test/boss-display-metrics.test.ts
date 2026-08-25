import { describe, expect, it } from "vitest";
import {
  deriveDisplayedToday,
  deriveDisplayedMonthly,
  sumDisplayedToday,
  type AceLiveSlots,
} from "@/lib/boss-display-metrics";
import type { CasinoDay } from "@/hooks/use-boss-dashboard";

const day = (over: Partial<CasinoDay> = {}): CasinoDay => ({
  casinoId: "c1",
  live: { drop: 100_000_000, result: 20_000_000, headCount: 0, hold: 20 },
  slots: { drop: 10_000_000, result: 1_000_000, headCount: 0, hold: 10 },
  slotsAvailable: true,
  total: { drop: 110_000_000, result: 21_000_000, headCount: 42, hold: 19.09 },
  mtd: { drop: 0, result: 0, hold: 0 },
  mtdTables: { drop: 900_000_000, result: 150_000_000, headCount: 0, hold: 16.67 },
  mtdSlots: { drop: 300_000_000, result: -20_000_000, headCount: 0, hold: -6.67 },
  ...over,
});


const ace = (over: Partial<AceLiveSlots> = {}): AceLiveSlots => ({
  fresh: true,
  totalDrop: 50_000_000,
  winCashdesk: 8_000_000,
  activeCredits: 3_000_000,
  ageMs: 60_000,
  periodLabel: "Live",
  ...over,
});

describe("deriveDisplayedToday", () => {
  it("keeps base metrics when ACE is stale", () => {
    const d = deriveDisplayedToday(day(), ace({ fresh: false, totalDrop: null, winCashdesk: null }))!;
    expect(d.usesAce).toBe(false);
    expect(d.total.drop).toBe(110_000_000);
    expect(d.total.result).toBe(21_000_000);
  });

  it("replaces slots with the fresh ACE feed", () => {
    const d = deriveDisplayedToday(day(), ace())!;
    expect(d.usesAce).toBe(true);
    expect(d.slots.result).toBe(5_000_000); // 8M cashdesk − 3M credits
    expect(d.total.drop).toBe(160_000_000); // 110M + 50M
    expect(d.total.result).toBe(25_000_000); // 21M − 1M + 5M
    expect(d.total.hold).toBeCloseTo((25_000_000 / 160_000_000) * 100, 6);
  });
});

describe("sumDisplayedToday", () => {
  it("sums exactly the displayed card totals", () => {
    const a = deriveDisplayedToday(day(), ace());
    const b = deriveDisplayedToday(day({ casinoId: "c2" }), null);
    const sum = sumDisplayedToday([a, b, null]);
    expect(sum.drop).toBe(160_000_000 + 110_000_000);
    expect(sum.result).toBe(25_000_000 + 21_000_000);
    expect(sum.headCount).toBe(84);
    expect(sum.hold).toBeCloseTo((46_000_000 / 270_000_000) * 100, 6);
  });
});

describe("deriveDisplayedMonthly", () => {
  it("splits Tables / Slots and totals them (Statistics sources)", () => {
    const d = deriveDisplayedMonthly(day())!;
    expect(d.tables.drop).toBe(900_000_000);
    expect(d.slots.result).toBe(-20_000_000);
    expect(d.total.drop).toBe(1_200_000_000);
    expect(d.total.result).toBe(130_000_000);
    expect(d.total.hold).toBeCloseTo((130 / 1200) * 100, 6);
    expect(d.slotsAvailable).toBe(true);
    expect(d.usesAce).toBe(false);
  });

  it("marks slots unavailable when Statistics has no monthly slots data", () => {
    const zero = { drop: 0, result: 0, headCount: 0, hold: 0 };
    expect(deriveDisplayedMonthly(day({ mtdSlots: zero }))!.slotsAvailable).toBe(false);
  });

  it("company monthly total = sum of displayed monthly cards", () => {
    const a = deriveDisplayedMonthly(day());
    const b = deriveDisplayedMonthly(day({ casinoId: "c2" }));
    const sum = sumDisplayedToday([a, b]);
    expect(sum.drop).toBe(2_400_000_000);
    expect(sum.result).toBe(260_000_000);
  });
});
