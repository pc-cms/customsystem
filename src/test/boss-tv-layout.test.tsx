/**
 * Dashboard TV — number sizing helper + structural distinctness of the three
 * styles. Formulas are covered by boss-display-metrics.test.ts; this file only
 * asserts presentation behaviour.
 */
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { autoNumSize, fmtSigned, fmtMoney, fmtPct } from "@/components/boss/tv/primitives";
import { LiveStage } from "@/components/boss/tv/live-stage";
import type { TvCasino } from "@/components/boss/tv/types";
import type { DisplayedToday } from "@/lib/boss-display-metrics";

describe("autoNumSize", () => {
  it("keeps the nominal size for short values", () => {
    expect(autoNumSize("xl", "1 250")).toBe("xl");
    expect(autoNumSize("md", "12.5%")).toBe("md");
  });

  it("steps down for long TZS values", () => {
    expect(autoNumSize("xl", fmtMoney(1_250_000_000))).toBe("lg"); // 13 chars → 2 steps? see below
  });

  it("never goes below the smallest step", () => {
    expect(autoNumSize("xs", "−123 456 789 012")).toBe("xs");
    expect(autoNumSize("sm", "−123 456 789 012")).toBe("xs");
  });

  it("handles negatives and >100% percentages", () => {
    expect(fmtSigned(-994_784)).toContain("−");
    expect(fmtPct(153.7)).toBe("153.7%");
    expect(autoNumSize("lg", fmtPct(153.7))).toBe("lg");
  });
});

const metric = (drop: number, result: number) => ({
  drop,
  result,
  hold: drop > 0 ? (result / drop) * 100 : 0,
  headCount: 12,
});

const displayed: DisplayedToday = {
  tables: metric(120_000_000, -3_500_000),
  slots: metric(45_000_000, 2_100_000),
  total: metric(165_000_000, -1_400_000),
  slotsDropAvailable: true,
  slotsResultAvailable: true,
} as unknown as DisplayedToday;

const casinos: TvCasino[] = ["Mwanza", "Arusha"].map((name, i) => ({
  id: `c${i}`,
  name,
  slug: name.toLowerCase(),
  accent: "#E8C688",
  displayed,
  top: [
    { playerId: `p${i}a`, name: `Player ${i}A`, drop: 9_000_000, casinoId: `c${i}` },
    { playerId: `p${i}b`, name: `Player ${i}B`, drop: 4_000_000, casinoId: `c${i}` },
  ],
}));

const company = {
  drop: 330_000_000,
  result: -2_800_000,
  hold: -0.85,
  headCount: 24,
} as never;

const renderStyle = (style: "black-gold" | "red-gold" | "dark-gold") =>
  render(
    <LiveStage
      style={style}
      casinos={casinos}
      company={company}
      newPlayersCount={7}
      period="today"
      periodLabel="Aug 2026"
    />,
  );

describe("LiveStage layouts", () => {
  it("renders three structurally different boards", () => {
    const black = renderStyle("black-gold");
    expect(black.container.querySelector("[data-tv-style='black-gold']")).toBeTruthy();
    expect(black.container.querySelector("[data-tv-board='comparison-table']")).toBeTruthy();
    expect(black.container.querySelector("[data-tv-top='strip']")).toBeTruthy();
    expect(black.container.querySelector("[data-tv-board='ranking']")).toBeFalsy();
    cleanup();

    const red = renderStyle("red-gold");
    expect(red.container.querySelector("[data-tv-style='red-gold']")).toBeTruthy();
    expect(red.container.querySelector("[data-tv-board='company-hero']")).toBeTruthy();
    expect(red.container.querySelector("[data-tv-board='ranking']")).toBeTruthy();
    expect(red.container.querySelector("[data-tv-top='column']")).toBeTruthy();
    expect(red.container.querySelector("[data-tv-board='comparison-table']")).toBeFalsy();
    cleanup();

    const dark = renderStyle("dark-gold");
    expect(dark.container.querySelector("[data-tv-style='dark-gold']")).toBeTruthy();
    expect(dark.container.querySelector("[data-tv-board='casino-matrix']")).toBeTruthy();
    expect(dark.container.querySelector("[data-tv-board='company-summary']")).toBeTruthy();
    expect(dark.container.querySelector("[data-tv-board='ranking']")).toBeFalsy();
    cleanup();
  });

  it("every style renders its own brand header and Tables/Slots/Total rows", () => {
    for (const style of ["black-gold", "red-gold", "dark-gold"] as const) {
      const r = renderStyle(style);
      expect(r.container.querySelector("[data-tv-brand-header]")).toBeTruthy();
      expect(r.getAllByText("Tables").length).toBe(casinos.length);
      expect(r.getAllByText("Slots").length).toBe(casinos.length);
      expect(r.getAllByText("Total").length).toBe(casinos.length);
      cleanup();
    }
  });

  it("numeric cells clip safely and stay right aligned", () => {
    const r = renderStyle("dark-gold");
    const nums = r.container.querySelectorAll("[data-num-size]");
    expect(nums.length).toBeGreaterThan(0);
    nums.forEach((n) => {
      expect(n.className).toContain("min-w-0");
      expect(n.className).toContain("overflow-hidden");
      expect(n.className).toContain("text-right");
      expect(n.className).toContain("tabular-nums");
    });
    cleanup();
  });
});
