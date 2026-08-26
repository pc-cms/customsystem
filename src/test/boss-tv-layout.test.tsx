/**
 * Dashboard TV — number sizing helper, density scale and structural
 * distinctness of the three styles. Formulas are covered by
 * boss-display-metrics.test.ts; this file only asserts presentation behaviour.
 */
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  autoNumSize,
  fmtSigned,
  fmtMoney,
  fmtPct,
  NUM_COMFORT_LEN,
} from "@/components/boss/tv/primitives";
import { tvDensityVars, TV_DENSITY_MULT, TV_BASE } from "@/components/boss/tv/density";
import { LiveStage } from "@/components/boss/tv/live-stage";
import type { TvCasino } from "@/components/boss/tv/types";
import type { DisplayedToday } from "@/lib/boss-display-metrics";

describe("autoNumSize", () => {
  it("keeps the nominal size for short values", () => {
    expect(autoNumSize("xl", "1 250")).toBe("xl");
    expect(autoNumSize("md", "12.5%")).toBe("md");
  });

  it("does NOT shrink 9-12 digit TZS values (width fitting handles those)", () => {
    expect(autoNumSize("xl", fmtMoney(12_500_000))).toBe("xl");
    expect(autoNumSize("lg", fmtMoney(1_250_000_000))).toBe("lg");
    expect(autoNumSize("md", fmtSigned(-994_784_123))).toBe("md");
    expect(autoNumSize("md", fmtMoney(123_456_789_012))).toBe("md");
  });

  it("steps down at most once and only for extreme strings", () => {
    const extreme = "−123 456 789 012 345";
    expect(extreme.length).toBeGreaterThan(NUM_COMFORT_LEN);
    expect(autoNumSize("xl", extreme)).toBe("lg");
    expect(autoNumSize("xs", extreme)).toBe("xs");
  });

  it("handles negatives and >100% percentages", () => {
    expect(fmtSigned(-994_784)).toContain("−");
    expect(fmtPct(153.7)).toBe("153.7%");
    expect(autoNumSize("lg", fmtPct(153.7))).toBe("lg");
  });
});

describe("TV density scale", () => {
  it("exposes every typography variable", () => {
    const vars = tvDensityVars("xl") as Record<string, string>;
    for (const k of [
      "--tv-u",
      "--tv-num-sm",
      "--tv-num-md",
      "--tv-num-lg",
      "--tv-label",
      "--tv-city",
      "--tv-top-name",
      "--tv-clock",
    ]) {
      expect(vars[k]).toBeTruthy();
    }
  });

  it("scales monotonically S < M < L < XL", () => {
    const mults = (["s", "m", "l", "xl"] as const).map((d) => TV_DENSITY_MULT[d]);
    for (let i = 1; i < mults.length; i++) expect(mults[i]).toBeGreaterThan(mults[i - 1]);
    expect(TV_DENSITY_MULT.xl).toBe(1);
    const xl = (tvDensityVars("xl") as Record<string, string>)["--tv-u"];
    const s = (tvDensityVars("s") as Record<string, string>)["--tv-u"];
    expect(xl).not.toBe(s);
  });

  it("hits the FHD XL targets (px @1920 width)", () => {
    // Casino TOTAL 26-32, Tables/Slots 21-25, KPI 28-34, names 24-30, labels 11-14.
    expect(TV_BASE.numMd).toBeGreaterThanOrEqual(26);
    expect(TV_BASE.numMd).toBeLessThanOrEqual(32);
    expect(TV_BASE.numSm).toBeGreaterThanOrEqual(21);
    expect(TV_BASE.numSm).toBeLessThanOrEqual(25);
    expect(TV_BASE.numLg).toBeGreaterThanOrEqual(28);
    expect(TV_BASE.numLg).toBeLessThanOrEqual(34);
    expect(TV_BASE.city).toBeGreaterThanOrEqual(24);
    expect(TV_BASE.city).toBeLessThanOrEqual(30);
    expect(TV_BASE.topName).toBeGreaterThanOrEqual(18);
    expect(TV_BASE.topName).toBeLessThanOrEqual(23);
    expect(TV_BASE.label).toBeGreaterThanOrEqual(11);
    expect(TV_BASE.label).toBeLessThanOrEqual(14);
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

  it("numeric cells clip safely, stay right aligned and use the density vars", () => {
    const r = renderStyle("dark-gold");
    const nums = r.container.querySelectorAll<HTMLElement>("[data-num-size]");
    expect(nums.length).toBeGreaterThan(0);
    nums.forEach((n) => {
      expect(n.className).toContain("min-w-0");
      expect(n.className).toContain("overflow-hidden");
      expect(n.className).toContain("text-right");
      expect(n.className).toContain("tabular-nums");
      expect(n.getAttribute("data-num-var") ?? "").toContain("--tv-num-");
      // never truncated with an ellipsis
      expect(n.className).not.toContain("truncate");
    });
    cleanup();
  });
});
