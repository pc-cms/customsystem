const EXPENSE_MANAGEMENT_ROLES = new Set([
  "manager",
  "shift_manager",
  "general_manager",
  "finance_manager",
  "super_admin",
]);

export const hasExpenseManagementAccess = (
  roles: string[],
  managerOverrideActive = false,
): boolean => managerOverrideActive || roles.some((role) => EXPENSE_MANAGEMENT_ROLES.has(role));

export const isExpenseSourceLocked = (
  roles: string[],
  managerOverrideActive = false,
): boolean => {
  if (hasExpenseManagementAccess(roles, managerOverrideActive)) return false;
  return roles.includes("cashier") || roles.includes("cashier_slots");
};