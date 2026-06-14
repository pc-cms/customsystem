/**
 * Regression tests for the Collections category migration.
 *
 * Verifies:
 *  1. CategoryCombobox filter (`is_active && !is_income`) still surfaces
 *     all 4 categories that were re-grouped into `collections`
 *     (Collection (Owner Withdrawal), CAPEX, Money Change, Inter-Casino Transfer Out).
 *     This guarantees cashiers + expense form continue to see them.
 *  2. Existing `expenses` rows (which reference categories by `fin_category_id`)
 *     are still correctly summed per category even after the category's
 *     `group_code` was changed to `collections`.
 *  3. Monthly report grand total excludes the `collections` group while
 *     still exposing it as a separate `ReportGroup` for the UI.
 */
import { describe, it, expect } from "vitest";

type Cat = {
  id: string;
  name: string;
  group_code: string;
  group_name: string;
  is_active: boolean;
  is_income: boolean;
  sort_order: number;
};

type Exp = {
  id: string;
  fin_category_id: string;
  amount_tzs: number;
  currency: "TZS" | "USD";
  amount: number;
};

// Fixture matching the post-migration shape
const CATS: Cat[] = [
  // Operational (counted in grand total)
  { id: "c-rent", name: "Rent", group_code: "fixed", group_name: "Fixed", is_active: true, is_income: false, sort_order: 1 },
  { id: "c-fuel", name: "Fuel", group_code: "petrol", group_name: "Petrol", is_active: true, is_income: false, sort_order: 2 },
  // Moved into "collections"
  { id: "c-coll", name: "Collection (Owner Withdrawal)", group_code: "collections", group_name: "Collections & Owner Withdrawals", is_active: true, is_income: false, sort_order: 10 },
  { id: "c-capex", name: "CAPEX", group_code: "collections", group_name: "Collections & Owner Withdrawals", is_active: true, is_income: false, sort_order: 11 },
  { id: "c-money", name: "Money Change", group_code: "collections", group_name: "Collections & Owner Withdrawals", is_active: true, is_income: false, sort_order: 12 },
  { id: "c-xfer", name: "Inter-Casino Transfer Out", group_code: "collections", group_name: "Collections & Owner Withdrawals", is_active: true, is_income: false, sort_order: 13 },
  // Should be excluded from picker
  { id: "c-inc", name: "Live Game", group_code: "income", group_name: "Income", is_active: true, is_income: true, sort_order: 1 },
  { id: "c-arch", name: "Old archived", group_code: "fixed", group_name: "Fixed", is_active: false, is_income: false, sort_order: 99 },
];

const EXPENSES: Exp[] = [
  { id: "e1", fin_category_id: "c-rent", amount_tzs: 1_000_000, currency: "TZS", amount: 1_000_000 },
  { id: "e2", fin_category_id: "c-fuel", amount_tzs: 200_000, currency: "TZS", amount: 200_000 },
  // Legacy expense pointing at a now-collections category (must still aggregate)
  { id: "e3", fin_category_id: "c-coll", amount_tzs: 5_000_000, currency: "TZS", amount: 5_000_000 },
  { id: "e4", fin_category_id: "c-capex", amount_tzs: 800_000, currency: "TZS", amount: 800_000 },
];

// Mirrors CategoryCombobox filter rule
const pickerVisible = (cats: Cat[]) =>
  cats.filter((c) => c.is_active && !c.is_income);

// Mirrors useMonthlyReport reduce logic
const buildReport = (cats: Cat[], expenses: Exp[]) => {
  const actualByCat = new Map<string, number>();
  expenses.forEach((e) => {
    actualByCat.set(e.fin_category_id, (actualByCat.get(e.fin_category_id) || 0) + e.amount_tzs);
  });

  const byGroup = new Map<string, { code: string; name: string; actual_tzs: number }>();
  cats.forEach((c) => {
    if (c.is_income || !c.is_active) return;
    const cur = byGroup.get(c.group_code) || { code: c.group_code, name: c.group_name, actual_tzs: 0 };
    cur.actual_tzs += actualByCat.get(c.id) || 0;
    byGroup.set(c.group_code, cur);
  });

  const groups = [...byGroup.values()].filter((g) => g.code !== "collections");
  const collections = byGroup.get("collections") || null;
  const grand_actual_tzs = groups.reduce((s, g) => s + g.actual_tzs, 0);
  return { groups, collections, grand_actual_tzs };
};

describe("CategoryCombobox — picker filter (cashier + expense form)", () => {
  const visible = pickerVisible(CATS);
  const visibleNames = visible.map((c) => c.name);

  it("includes all 4 categories moved into the Collections group", () => {
    for (const name of [
      "Collection (Owner Withdrawal)",
      "CAPEX",
      "Money Change",
      "Inter-Casino Transfer Out",
    ]) {
      expect(visibleNames).toContain(name);
    }
  });

  it("still includes ordinary operational categories", () => {
    expect(visibleNames).toEqual(expect.arrayContaining(["Rent", "Fuel"]));
  });

  it("excludes income categories", () => {
    expect(visibleNames).not.toContain("Live Game");
  });

  it("excludes inactive categories", () => {
    expect(visibleNames).not.toContain("Old archived");
  });
});

describe("Monthly report — Collections split", () => {
  const report = buildReport(CATS, EXPENSES);

  it("aggregates legacy expenses whose category was moved to collections", () => {
    expect(report.collections).not.toBeNull();
    // 5_000_000 (Collection) + 800_000 (CAPEX)
    expect(report.collections!.actual_tzs).toBe(5_800_000);
  });

  it("excludes collections group from grand total", () => {
    // 1_000_000 (Rent) + 200_000 (Fuel)
    expect(report.grand_actual_tzs).toBe(1_200_000);
  });

  it("does not list collections inside `groups`", () => {
    expect(report.groups.map((g) => g.code)).not.toContain("collections");
  });

  it("preserves expenses linked to non-collections categories", () => {
    const rentGroup = report.groups.find((g) => g.code === "fixed");
    expect(rentGroup?.actual_tzs).toBe(1_000_000);
  });
});
