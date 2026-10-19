import { describe, expect, it } from "vitest";
import { filterExpensePrintRows } from "@/lib/expense-print-source";

// Mixed rows within the caller's existing casino/day/shift/currency scope.
const rows = [
  { id: "live", source: "live_game", amount: 100, approved: true },
  { id: "live-pending", source: "live_game", amount: 20, approved: false },
  { id: "slots", source: "slots", amount: 200, approved: true },
  { id: "slots-pending", source: "slots", amount: 30, approved: false },
  { id: "office", source: "office", amount: 900, approved: true },
  { id: "legacy", source: null, amount: 800, approved: true },
];
const sum = (items: typeof rows) => items.reduce((total, row) => total + row.amount, 0);

describe("Expense print source boundary", () => {
  it("keeps both cash desks and excludes Office and unspecified sources from rows and sum", () => {
    const cash = filterExpensePrintRows(rows, "cash_desks");
    expect(cash.map(row => row.id)).toEqual(["live", "live-pending", "slots", "slots-pending"]);
    expect(sum(cash)).toBe(350);
  });

  it("keeps Live reprint approval scope unchanged and never includes Slots or Office", () => {
    expect(sum(filterExpensePrintRows(rows, "live_game"))).toBe(120);
  });

  it("keeps Slots and Total approved-only sums with separate desk attribution", () => {
    const live = filterExpensePrintRows(rows, "live_game").filter(row => row.approved);
    const slots = filterExpensePrintRows(rows, "slots").filter(row => row.approved);
    expect(sum(live)).toBe(100);
    expect(sum(slots)).toBe(200);
    expect(sum([...live, ...slots])).toBe(300);
  });

  it("retains Office rows and total for the source-neutral print template", () => {
    const office = filterExpensePrintRows(rows, "office");
    expect(office.map(row => row.id)).toEqual(["office"]);
    expect(sum(office)).toBe(900);
    expect(rows).toHaveLength(6);
  });
});