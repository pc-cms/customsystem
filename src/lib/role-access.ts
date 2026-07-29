// Role-based data visibility configuration
// Controls what financial/sensitive data each role can see

type AppRole = "cashier" | "cashier_slots" | "pit" | "manager" | "shift_manager" | "reception" | "finance_manager" | "surveillance" | "super_admin" | "hr" | "pos_waiter" | "pos_bartender" | "pos_manager" | "boss" | "general_manager";

export type FinancialScope = "all" | "shift" | "none";

/**
 * Determines the financial data visibility scope for a user based on their roles.
 * - "all":   Full historical financial data (manager, finance_manager, surveillance, super_admin)
 * - "shift": Current business-day only (pit). Manager Override toggle lifts the limit
 *            but still uses the "shift" filter unless the toggle is active.
 * - "none":  No financial data at all (cashier, reception, hr).
 *
 * NOTE: Cashier sees their own active shift transactions inside the Cage UI itself,
 * but in player-card / player-report contexts they get "none" — no lifetime totals.
 */
export const getFinancialScope = (roles: string[]): FinancialScope => {
  if (roles.includes("boss") || roles.includes("general_manager") || roles.includes("manager") || roles.includes("finance_manager") || roles.includes("surveillance") || roles.includes("super_admin")) {
    return "all";
  }
  if (roles.includes("pit") || roles.includes("shift_manager")) {
    return "shift";
  }
  return "none";
};

/**
 * Whether the user can see player financial details (drop, cashout, result).
 */
export const canSeePlayerFinancials = (roles: string[]): boolean => {
  return getFinancialScope(roles) !== "none";
};

/**
 * Whether the user can see all-time historical data vs only current shift.
 */
export const canSeeAllTimeData = (roles: string[]): boolean => {
  return getFinancialScope(roles) === "all";
};

/**
 * Highest-priority role for the user. UI must NEVER list multiple roles —
 * always show only the primary one (or hide entirely).
 */
const ROLE_PRIORITY: AppRole[] = [
  "super_admin", "boss", "general_manager", "finance_manager", "manager", "shift_manager", "hr",
  "pit", "cashier", "cashier_slots", "reception", "surveillance",
  "pos_manager", "pos_bartender", "pos_waiter",
];

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  boss: "Boss",
  general_manager: "General Manager",
  finance_manager: "Finance",
  manager: "Manager",
  shift_manager: "Shift Manager",
  hr: "HR",
  pit: "Pit",
  cashier: "Cashier Live",
  cashier_slots: "Cashier Slots",
  reception: "Reception",
  surveillance: "Surveillance",
  pos_manager: "Bar Manager",
  pos_bartender: "Bartender",
  pos_waiter: "Waiter",
};

export const getPrimaryRole = (roles: string[]): AppRole | null => {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return (roles[0] as AppRole) || null;
};

export const getPrimaryRoleLabel = (roles: string[]): string => {
  const r = getPrimaryRole(roles);
  return r ? ROLE_LABELS[r] : "";
};

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* Mirror of the `public.role_capabilities` table. Every role is its   */
/* own entity — roles are NOT aliases of each other. Two roles may     */
/* share capabilities today and diverge tomorrow by editing this map   */
/* (and the DB table) instead of touching call sites.                  */
/* ------------------------------------------------------------------ */

export type Capability =
  | "manage.ops"
  | "manage.core"
  | "manage.finance"
  | "view.all_casinos"
  | "manage.roles";

export const ROLE_CAPABILITIES: Partial<Record<AppRole, Capability[]>> = {
  manager: ["manage.ops", "manage.core"],
  general_manager: ["manage.ops", "manage.core", "manage.finance", "view.all_casinos"],
  shift_manager: ["manage.ops"],
  finance_manager: ["manage.finance", "view.all_casinos"],
  boss: ["view.all_casinos"],
  super_admin: ["manage.ops", "manage.core", "manage.finance", "view.all_casinos", "manage.roles"],
};

export const hasCapability = (roles: string[], cap: Capability): boolean =>
  roles.some(r => ROLE_CAPABILITIES[r as AppRole]?.includes(cap));

/** Roles that unlock the manager-level UI surface (core management). */
export const canManage = (roles: string[]): boolean => hasCapability(roles, "manage.core");

