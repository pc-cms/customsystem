import { describe, it, expect } from "vitest";
import {
  availableForCollection,
  cashPosition,
  managerBonusForecast,
  managerBonusFinal,
} from "@/lib/finance-formulas";

const base = {
  floatCurrent: 1_000_000,
  totalIncome: 5_000_000,
  deposits: 200_000,
  investment: 0,
  office: 0,
  intercompanyCash: 0,
  expensesActual: 1_500_000,
  liabilityPayments: 0,
  collections: 0,
};

describe("Cash Position — paid unplanned expenses", () => {
  it("subtracts a paid unplanned row that is NOT represented in Actual Expenses exactly once", () => {
    const without = cashPosition(base);
    const with300k = cashPosition({ ...base, unplannedPaidCashNotInActual: 300_000 });
    expect(without - with300k).toBe(300_000);
    expect(with300k).toBe(1_000_000 + 5_000_000 - 200_000 - 1_500_000 - 300_000);
  });

  it("does not double count a paid unplanned row linked to an Actual Expense", () => {
    // The row is inside expensesActual → unplannedPaidCashNotInActual is 0.
    const linked = cashPosition({
      ...base,
      expensesActual: base.expensesActual + 300_000,
      unplannedPaidCashNotInActual: 0,
    });
    const notLinked = cashPosition({ ...base, unplannedPaidCashNotInActual: 300_000 });
    expect(linked).toBe(notLinked);
  });

  it("treats an omitted unplanned cash figure as zero", () => {
    expect(cashPosition(base)).toBe(cashPosition({ ...base, unplannedPaidCashNotInActual: 0 }));
  });
});

describe("Manager Bonus — Budget while open, Actual Expenses at close", () => {
  const totalIncome = 10_000_000;
  const budget = 6_000_000;

  it("open month uses Income − Budget", () => {
    expect(managerBonusForecast({ totalIncome, budget })).toBe(200_000);
  });

  it("closed month switches the base to Total Actual Expenses", () => {
    expect(managerBonusFinal({ totalIncome, expensesActual: 5_000_000 })).toBe(250_000);
  });

  it("never goes negative", () => {
    expect(managerBonusFinal({ totalIncome: 1_000, expensesActual: 9_000 })).toBe(0);
  });
});

describe("Available for Collection — manager bonus is reserved", () => {
  it("subtracts the approved bonus from the remaining profit", () => {
    expect(availableForCollection(1_000_000, 200_000, 100_000)).toBe(700_000);
  });

  it("never goes negative", () => {
    expect(availableForCollection(100_000, 200_000, 50_000)).toBe(0);
  });
});

