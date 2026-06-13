/**
 * Map sidebar nav routes (and route paths) → ModuleKey for the Permission Matrix.
 *
 * Single source of truth for both:
 *   - Sidebar visibility (AppSidebar filters NAV_ITEMS through this map)
 *   - Route guard (App.tsx RoleGuard checks the matrix via this map)
 *
 * Conventions:
 *   - Returns null only for genuinely auxiliary routes that should NOT be
 *     gated (e.g. virtual placeholders without a real screen).
 *   - When in doubt, map to the closest ModuleKey — never leave a real
 *     screen ungated, otherwise shift_manager / custom roles will see it
 *     even if the matrix excludes it.
 */
import type { ModuleKey } from "@/lib/modules";

export const moduleKeyForRoute = (to: string, label?: string): ModuleKey | null => {
  // Virtual sidebar parents (group expanders) — gated by their primary module
  if (to === "__attendance__") return "pit_attendance";
  if (to === "__rota__") return "pit_rota";

  const [base, q = ""] = to.split("?");
  const tab = new URLSearchParams(q).get("tab");

  // ============= OVERVIEW =============
  if (base === "/") return "dashboard";

  // ============= PIT — flat URLs (Phase 2) =============
  if (base === "/breaklist") return "pit_breaklist";
  if (base === "/rota/live") return "pit_rota";
  if (base === "/attendance/live") return "pit_attendance";
  if (base === "/dealers") return "pit_dealers";

  // Legacy /pit?tab=… (kept for redirects + bookmarks)
  if (base === "/pit") {
    if (tab === "breaklist") return "pit_breaklist";
    if (tab === "attendance") return "pit_attendance";
    if (tab === "employee") return "pit_dealers";
    if (tab === "rota") return "pit_rota";
    return "pit_rota";
  }

  // ============= STAFF / FLOOR — flat URLs =============
  if (base === "/staff/employees") return "staff_employees";
  if (base === "/staff/playlist") return "employee_playlist";
  if (base === "/rota/floor" || base === "/rota/security" || base === "/rota/office") return "staff_rota";
  if (base === "/attendance/floor" || base === "/attendance/security" || base === "/attendance/office") return "staff_attendance";
  if (base === "/staff/master") return "staff_master";
  if (base === "/attendance/monthly") return "staff_master";

  // Legacy /staff?tab=… (redirects)
  if (base === "/staff" || base === "/floor") {
    if (tab === "attendance") return "staff_attendance";
    if (tab === "employee") return "staff_employees";
    if (tab && tab.startsWith("rota_")) return "staff_rota";
    return "staff_employees";
  }

  // ============= PAYROLL =============
  if (base === "/payroll" || base.startsWith("/payroll/") || base.startsWith("/payroll-")) return "payroll";

  // ============= TABLES & TRACKERS =============
  if (base === "/tables") return "tables";
  if (base === "/tables/close") return "tables";
  if (base === "/tables/analytics") return "table_tracker";
  if (base === "/table-tracker") return "table_tracker";
  if (base === "/table-results") return "table_results";

  // ============= PLAYERS =============
  if (base === "/active-players" || base === "/player-statistics") return "pit_active_players";
  if (base === "/player-tracker") return "pit_active_players";
  if (base === "/players" || base.startsWith("/players/")) return "players";
  if (base === "/blacklist") return "blacklist";
  if (base === "/reception") return "reception";
  if (base === "/guests") return "in_casino";
  if (base === "/groups") return "groups";

  // ============= CAGE =============
  // /cage = cashier transactional surface; /cage/view = read-only history.
  if (base === "/cage") return "cage";
  if (base === "/cage/view") return "cage_view";
  if (base === "/cage/closings") return "closings";
  if (base === "/closings") return "closings";
  if (base === "/cage/close-shift") return "cage";
  if (base.startsWith("/cage/shift/")) return "cage";
  // Slots Expenses lives inside the Cage Slots surface and must follow the
  // same gating — independent of the generic `expenses` module override.
  if (base === "/cage-slots/expenses") return "cage_slots";
  if (base === "/cage-slots" || base.startsWith("/cage-slots/")) return "cage_slots";

  // ============= EXPENSES / CASHLESS =============
  if (base === "/expenses") return "expenses";
  if (base === "/expenses/daily") return "daily_expenses";
  if (base === "/expenses/approvals") return "expenses_approvals";
  if (base === "/cashless") return "cashless";
  if (base === "/transfers") return "cashless";

  // (expenses/cashless mapped above)

  // ============= FINANCE =============
  if (base === "/bank-checks") return "bank_checks";
  if (base === "/finance/budget") return "finance_budget";
  if (base === "/finance/cash-count") return "finance_cash_count";
  if (base === "/finance/review") return "finance_review";
  if (base === "/finance/dashboard") return "finance_dashboard";
  if (base === "/finance/expenses" || base === "/finance/payments") return "finance_payments";
  if (base === "/finance/summary") return "finance_summary";
  if (base === "/finance/transfers") return "finance_payments";
  if (base === "/finances/inter-casino") return "finance_payments";
  if (base === "/finance/wallets") return "finance_wallets";

  // New Finances module (/finances/*) — reuses existing finance_* module keys
  if (base === "/finances/dashboard") return "finance_dashboard";
  if (base === "/office") return "finance_review";
  if (base === "/finances/expenses") return "finance_payments";
  if (base === "/finances/budget") return "finance_budget";
  if (base === "/finances/budget-vs-actual") return "finance_budget";
  if (base === "/finances/monthly-report") return "finance_summary";
  if (base === "/finances/excel-import") return "finance_budget";
  if (base === "/finances/audit-log") return "finance_summary";
  if (base === "/finances/aliases") return "finance_budget";

  // ============= REPORTS =============
  if (base === "/miss-chips") return "miss_chips";
  if (base === "/reports") return "reports";
  if (base === "/business-days") return "reports";
  if (base === "/weekly-bonus") return "tips_and_bonuses";
  if (base === "/monthly-tips") return "tips_and_bonuses";
  if (base === "/tips-and-bonuses") return "tips_and_bonuses";
  if (base === "/reports/poker-tips") return "tips_and_bonuses";
  if (base === "/reports/floor-tips") return "tips_and_bonuses";
  if (base === "/hr/warnings") return "hr_warnings";
  if (base === "/cancelled-transactions") return "cancelled_transactions";

  // ============= PIT EXTRAS =============
  if (base === "/pitbook") return null;
  if (base === "/incidents") return "incidents";

  // ============= SYSTEM =============
  if (base === "/import-reports") return "import_reports";
  if (base === "/logs") return "logs";
  // Premier Club / AM admin surfaces — gated by their own module keys (NOT 'admin').
  if (base === "/admin/promo-codes") return "promo_codes";
  if (base === "/admin/promo-grants") return "promo_grants";
  if (base === "/admin/lotteries") return "lotteries";
  if (base === "/admin/shop") return "shop_catalog";
  if (base === "/admin/shop/orders") return "shop_orders";
  if (base === "/admin/am-budget") return "am_budget";
  if (base === "/admin/am-performance") return "am_performance";
  if (base === "/admin/kyc") return "kyc_reviews";
  if (base === "/admin/fm-topups") return "fm_topups";

  // Premier Club / AM reports
  if (base === "/reports/promo-issuance") return "report_promo_issuance";
  if (base === "/reports/promo-redemptions") return "report_promo_redemptions";
  if (base === "/reports/promo-expiry") return "report_promo_expiry";
  if (base === "/reports/promo-codes") return "report_promo_codes";
  if (base === "/reports/cashback") return "report_cashback";
  if (base === "/reports/lottery-sales") return "report_lottery_sales";
  if (base === "/reports/am-budget") return "report_am_budget";

  if (base === "/admin" || base.startsWith("/admin/")) return "admin";


  // ============= MARKETING =============
  if (base === "/marketing/campaigns") return "marketing_campaigns";
  if (base.startsWith("/marketing/campaigns/")) return "marketing_campaigns";

  // ============= CRM =============
  if (base === "/crm/players" || base.startsWith("/crm/")) return "crm_players";

  // ============= POS / BAR =============
  // POS surfaces are gated by dedicated POS roles + PosLayout cross-role
  // whitelist (manager/finance). They are intentionally NOT routed through
  // the Permission Matrix.
  if (base === "/pos" || base.startsWith("/pos/")) return null;

  // Label-based fallback (rare)
  if (label === "CCTV") return "cctv";

  // Unknown route — leave ungated. Add an entry above when introducing a new screen.
  return null;
};
