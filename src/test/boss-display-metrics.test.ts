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
  // Closed-day slots: drop_slots / net_win from fin_day_closing.
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
  netWin: 8_000_000,
  winCashdesk: 99_000_000, // must never be used for the displayed result
  activeCredits: 3_000_000,
  ageMs: 60_000,
  periodLabel: "Live",
  ...over,
});

describe("deriveDisplayedToday", () => {
  it("uses fresh ACE net_win minus active_credits (never win_cashdesk)", () => {
    const d = deriveDisplayedToday(day(), ace())!;
    expect(d.usesAce).toBe(true);
    expect(d.slots.result).toBe(5_000_000); // 8M net win − 3M credits
    expect(d.slots.drop).toBe(50_000_000);
  });

  it("falls back to the closed-day net_win when ACE is stale", () => {
    const d = deriveDisplayedToday(
      day(),
      ace({ fresh: false, totalDrop: null, netWin: null, activeCredits: null }),
    )!;
    expect(d.usesAce).toBe(false);
    expect(d.slots.drop).toBe(10_000_000);
    expect(d.slots.result).toBe(1_000_000);
    expect(d.total.drop).toBe(110_000_000);
    expect(d.total.result).toBe(21_000_000);
  });

  it("marks slots unavailable when there is no source at all", () => {
    const d = deriveDisplayedToday(
      day({ slotsAvailable: false, slots: { drop: 0, result: 0, headCount: 0, hold: 0 } }),
      null,
    )!;
    expect(d.slotsDropAvailable).toBe(false);
    expect(d.slotsResultAvailable).toBe(false);
    expect(d.slotsAvailable).toBe(false);
    // Total is strictly the displayed tables figure.
    expect(d.total.drop).toBe(100_000_000);
    expect(d.total.result).toBe(20_000_000);
  });

  it("never double-counts Slots Drop when ACE replaces a closed-day figure", () => {
    const d = deriveDisplayedToday(day(), ace())!;
    // tables 100M + ACE slots 50M — the closed-day 10M must NOT be added.
    expect(d.total.drop).toBe(150_000_000);
    expect(d.total.result).toBe(25_000_000); // 20M tables + 5M slots
    expect(d.total.hold).toBeCloseTo((25 / 150) * 100, 6);
  });

  it("computes hold only when drop > 0", () => {
    const zero = { drop: 0, result: 0, headCount: 0, hold: 0 };
    const d = deriveDisplayedToday(day({ live: zero, slots: zero, slotsAvailable: true }), null)!;
    expect(d.total.hold).toBe(0);
  });
});

describe("sumDisplayedToday", () => {
  it("equals the sum of the values displayed on the casino cards", () => {
    const a = deriveDisplayedToday(day(), ace());
    const b = deriveDisplayedToday(day({ casinoId: "c2" }), null);
    const sum = sumDisplayedToday([a, b, null]);
    expect(sum.drop).toBe(a!.total.drop + b!.total.drop);
    expect(sum.result).toBe(a!.total.result + b!.total.result);
    expect(sum.headCount).toBe(84);
    expect(sum.hold).toBeCloseTo((sum.result / sum.drop) * 100, 6);
  });
});

describe("deriveDisplayedMonthly", () => {
  it("splits Tables / Slots from closed Day Closing figures (no ACE)", () => {
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
