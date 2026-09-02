import { describe, expect, it } from "vitest";
import { hasExpenseManagementAccess, isExpenseSourceLocked } from "@/lib/expense-access";

describe("expense access for composite roles", () => {
  it("does not lock Super Admin to a cashier source", () => {
    const roles = ["cashier", "pit", "manager", "reception", "super_admin"];

    expect(hasExpenseManagementAccess(roles)).toBe(true);
    expect(isExpenseSourceLocked(roles)).toBe(false);
  });

  it("keeps a cashier locked to their operational source", () => {
    expect(hasExpenseManagementAccess(["cashier"])).toBe(false);
    expect(isExpenseSourceLocked(["cashier"])).toBe(true);
  });

  it("grants the full expense view to every management role", () => {
    for (const role of ["manager", "shift_manager", "general_manager", "finance_manager", "super_admin"]) {
      expect(hasExpenseManagementAccess([role]), role).toBe(true);
      expect(isExpenseSourceLocked([role]), role).toBe(false);
    }
  });
});