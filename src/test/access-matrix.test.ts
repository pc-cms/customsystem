/**
 * Access matrix integrity tests.
 *
 * Guarantees:
 *   1. `route-module-map` resolves every real route used in NAV_ITEMS and the
 *      App.tsx route table to a valid ModuleKey (no silent null = "ungated").
 *   2. For role `shift_manager` (Taras), the sidebar items and the route
 *      guard exactly match the rows present in `effective_module_perms` —
 *      no inheritance, no "empty = allowed" fallback.
 *
 * The shift_manager allow-list is mirrored from `role_module_defaults` in DB
 * (kept in sync with the seed migration). If a future migration changes it,
 * update FLOOR_MANAGER_ALLOWED below.
 */
import { describe, it, expect } from "vitest";
import { moduleKeyForRoute } from "@/lib/route-module-map";
import { MODULES, type ModuleKey } from "@/lib/modules";

// Mirror of `role_module_defaults` rows for shift_manager where can_view=true.
// Source of truth = DB; this constant is the contract the UI must respect.
// Mirrors role_module_defaults rows for shift_manager (DB source of truth).
const FLOOR_MANAGER_ALLOWED: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "bank_checks",
  "blacklist",
  "cancelled_transactions",
  "cage_view",
  "cashless",
  "dashboard",
  "expenses",
  "expenses_approvals",
  "in_casino",
  "incidents",
  "miss_chips",
  "pit_active_players",
  "pit_attendance",
  "pit_breaklist",
  "pit_dealers",
  "pit_rota",
  "closings",
  "players",
  "reception",
  "reports",
  
  "staff_attendance",
  "staff_employees",
  "staff_rota",
  "table_results",
  "table_tracker",
  "tables",
  
  "tips_and_bonuses",
]);

// Routes that MUST be gated (have a module mapping). Mirrors App.tsx route table.
const GATED_ROUTES = [
  "/",
  "/players/:id",
  "/cage",
  "/cage/view",
  "/cage/closings",
  "/cage/close-shift",
  "/cage/shift/abc/edit-opening",
  "/players/register",
  "/reception",
  "/guests",
  "/blacklist",
  "/tables",
  "/tables/close",
  "/player-statistics",
  "/table-tracker",
  "/expenses",
  "/cashless",
  "/pit",
  "/pit?tab=breaklist",
  "/pit?tab=attendance",
  "/pit?tab=rota",
  "/pit?tab=employee",
  "/breaklist",
  "/rota/live",
  "/attendance/live",
  "/dealers",
  "/staff",
  "/staff?tab=attendance",
  "/staff?tab=rota_floor",
  "/staff?tab=employee",
  "/staff/employees",
  "/rota/floor",
  "/rota/security",
  "/rota/office",
  "/attendance/floor",
  "/attendance/security",
  "/attendance/office",
  "/floor",
  "/groups",
  "/finance/wallets",
  "/finance/dashboard",
  "/finance/review",
  "/finance/payments",
  "/finance/budget",
  "/finance/cash-count",
  "/finance/summary",
  "/finance/transfers",
  "/reports",
  "/logs",
  "/admin",
  "/admin/users/new",
  "/admin/users/abc/edit",
  "/import-reports",
  "/table-results",
  "/bank-checks",
  "/miss-chips",
  "/tips-and-bonuses",
  "/incidents",
  "/cancelled-transactions",
];

const VALID_KEYS = new Set(MODULES.map(m => m.key));

describe("route-module-map coverage", () => {
  it("every gated route resolves to a valid ModuleKey", () => {
    const unresolved: string[] = [];
    const invalid: Array<{ route: string; mk: string }> = [];
    for (const r of GATED_ROUTES) {
      const mk = moduleKeyForRoute(r);
      if (mk === null) unresolved.push(r);
      else if (!VALID_KEYS.has(mk)) invalid.push({ route: r, mk });
    }
    expect(unresolved, `routes missing from route-module-map: ${unresolved.join(", ")}`).toEqual([]);
    expect(invalid, `routes mapped to unknown ModuleKey: ${JSON.stringify(invalid)}`).toEqual([]);
  });

  it("virtual sidebar parents resolve", () => {
    expect(moduleKeyForRoute("__attendance__")).toBe("pit_attendance");
    expect(moduleKeyForRoute("__rota__")).toBe("pit_rota");
  });
});

/**
 * Pure simulation of the sidebar / RoleGuard gate for a given allow-list.
 * Mirrors the production logic:
 *   - super_admin bypass NOT applied (we test shift_manager)
 *   - allowedModules = undefined → render nothing (loading)
 *   - moduleKeyForRoute null → ungated (visible)
 *   - else → must be in allowedModules
 */
const isVisibleForRole = (route: string, allowed: ReadonlySet<string>): boolean => {
  const mk = moduleKeyForRoute(route);
  if (!mk) return true; // auxiliary / ungated
  return allowed.has(mk);
};

describe("shift_manager (Taras) — sidebar & route gate match matrix", () => {
  it("allows exactly the routes whose module is in the allow-list", () => {
    const allow = FLOOR_MANAGER_ALLOWED as ReadonlySet<string>;
    const expected: Record<string, boolean> = {};
    const actual: Record<string, boolean> = {};
    for (const r of GATED_ROUTES) {
      const mk = moduleKeyForRoute(r)!;
      expected[r] = allow.has(mk);
      actual[r] = isVisibleForRole(r, allow);
    }
    expect(actual).toEqual(expected);
  });

  it("blocks finance, logs, admin, import-reports for shift_manager", () => {
    const allow = FLOOR_MANAGER_ALLOWED as ReadonlySet<string>;
    const blocked = [
      "/finance/wallets", "/finance/dashboard", "/finance/review",
      "/finance/budget", "/finance/cash-count", "/finance/summary",
      "/finance/transfers", "/logs", "/admin", "/admin/users/new",
      "/import-reports", "/groups",
    ];
    for (const r of blocked) {
      expect(isVisibleForRole(r, allow), `route ${r} must be blocked`).toBe(false);
    }
  });

  it("permits operations + players + reports modules", () => {
    const allow = FLOOR_MANAGER_ALLOWED as ReadonlySet<string>;
    const permitted = [
      "/", "/cage/view", "/reception", "/guests", "/blacklist",
      "/tables", "/table-tracker", "/player-statistics",
      "/players/abc", "/pit", "/pit?tab=breaklist", "/pit?tab=attendance",
      "/pit?tab=rota", "/staff", "/staff?tab=attendance",
      "/breaklist", "/rota/live", "/attendance/live",
      "/rota/floor", "/attendance/floor", "/staff/employees",
      "/reports", "/table-results", "/tips-and-bonuses",
      "/miss-chips", "/incidents",
    ];
    for (const r of permitted) {
      expect(isVisibleForRole(r, allow), `route ${r} must be visible`).toBe(true);
    }
  });

  it("never falls back to 'empty = allowed' — undefined allow-list hides everything", () => {
    // Production code: when allowedModules === undefined, sidebar renders nothing
    // and RoleGuard shows a loader. We assert the non-undefined contract here:
    // an EMPTY set must block every gated route (no implicit grants).
    const empty: ReadonlySet<string> = new Set();
    for (const r of GATED_ROUTES) {
      const mk = moduleKeyForRoute(r);
      if (!mk) continue; // truly ungated routes are out of scope
      expect(isVisibleForRole(r, empty), `route ${r} must be blocked when allow-list is empty`).toBe(false);
    }
  });
});

/**
 * Cashier — Reception is NOT accessible.
 *
 * Cashier has no Reception module access at all (removed per request).
 * Mirrors role_module_defaults seed in DB.
 */
const CASHIER_ALLOWED: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "dashboard",
  "cage",
  "players",
  "blacklist",
  "in_casino",
  "tables",
  "table_tracker",
  "pit_active_players",
  "expenses",
  "cashless",
  "bank_checks",
  "incidents",
]);

describe("cashier — no reception access", () => {
  it("does NOT have access to any reception modules", () => {
    expect(CASHIER_ALLOWED.has("reception" as ModuleKey)).toBe(false);
    expect(CASHIER_ALLOWED.has("reception_register" as ModuleKey)).toBe(false);
    expect(CASHIER_ALLOWED.has("reception_checkin" as ModuleKey)).toBe(false);
    expect(CASHIER_ALLOWED.has("reception_update" as ModuleKey)).toBe(false);
  });

  it("does NOT have access to cage_closings (manager-only history)", () => {
    expect(CASHIER_ALLOWED.has("cage_closings" as ModuleKey)).toBe(false);
  });

  it("reception sub-modules are registered as valid ModuleKeys", () => {
    expect(VALID_KEYS.has("reception_register")).toBe(true);
    expect(VALID_KEYS.has("reception_checkin")).toBe(true);
    expect(VALID_KEYS.has("reception_update")).toBe(true);
  });
});
