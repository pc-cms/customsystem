/**
 * Module catalog — used by Permission Matrix in admin UI.
 * Each module = a logical area of the app that can be granted/denied per user.
 *
 * IMPORTANT: This is an ALLOW-LIST overlay on top of the user's role.
 * If no rows exist for a user → role defaults apply (no change).
 * If at least one row exists → only modules with can_view=true are visible.
 *
 * RLS still enforced server-side; this only controls UI navigation visibility.
 */
export type ModuleKey =
  | "dashboard"
  | "pit_rota"
  | "pit_breaklist"
  | "pit_attendance"
  | "pit_active_players"
  | "pit_dealers"
  | "cage"
  | "cage_view"
  | "closings"
  | "daily_expenses"
  | "cage_slots"
  | "tables"
  | "table_tracker"
  | "table_results"
  | "players"
  | "blacklist"
  | "reception"
  | "reception_checkin"
  | "reception_register"
  | "reception_update"
  | "in_casino"
  | "bank_checks"
  | "expenses"
  | "expenses_approvals"
  | "cashless"
  | "finance_dashboard"
  | "finance_wallets"
  | "finance_cash_count"
  | "finance_budget"
  | "finance_review"
  | "finance_transfers"
  | "finance_summary"
  | "finance_payments"
  | "reports"
  | "miss_chips"
  | "cancelled_transactions"
  | "tips_and_bonuses"
  | "hr_warnings"
  | "incidents"
  | "pit_book"
  | "groups"
  | "staff_employees"
  | "employee_playlist"
  | "staff_rota"
  | "staff_attendance"
  | "staff_master"
  | "payroll"
  | "logs"
  | "cctv"
  | "cctv_dashboard"
  | "import_reports"
  | "marketing_campaigns"
  | "crm_players"
  | "kyc_reviews"
  | "promo_codes"
  | "promo_grants"
  | "lotteries"
  | "shop_catalog"
  | "shop_orders"
  | "am_budget"
  | "am_performance"
  | "fm_topups"
  | "report_promo_issuance"
  | "report_promo_redemptions"
  | "report_promo_expiry"
  | "report_promo_codes"
  | "report_cashback"
  | "report_lottery_sales"
  | "report_am_budget"
  | "admin";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  group: "Operations" | "Players" | "Finance" | "Reports" | "Club" | "System";
}


export const MODULES: ModuleDef[] = [
  // Overview
  { key: "dashboard", label: "Dashboard", group: "Operations" },

  // PIT
  { key: "pit_rota", label: "Live Rota", group: "Operations" },
  { key: "pit_breaklist", label: "Breaklist", group: "Operations" },
  { key: "pit_attendance", label: "Live Attendance", group: "Operations" },
  { key: "pit_active_players", label: "Player Tracking", group: "Operations" },
  { key: "pit_dealers", label: "Live Game Dealers", group: "Operations" },
  { key: "incidents", label: "Incidents", group: "Operations" },
  { key: "pit_book", label: "Pit Book", group: "Operations" },

  // Tables
  { key: "tables", label: "Tables", group: "Operations" },
  { key: "table_tracker", label: "Table Check", group: "Operations" },
  { key: "table_results", label: "Table Results", group: "Reports" },

  // Cage / Cashier
  { key: "cage", label: "Cage Live Game (Cashier)", group: "Operations" },
  { key: "cage_view", label: "Cage History (Read-only)", group: "Operations" },
  { key: "cage_slots", label: "Cage Slots", group: "Operations" },
  { key: "closings", label: "Closings", group: "Operations" },
  { key: "cashless", label: "Cashless", group: "Operations" },
  { key: "tips_and_bonuses", label: "Tips & Bonuses", group: "Operations" },

  // Players
  { key: "players", label: "Players", group: "Players" },
  { key: "in_casino", label: "Guests", group: "Players" },
  { key: "blacklist", label: "Blacklist", group: "Players" },
  { key: "groups", label: "Groups", group: "Players" },
  { key: "reception", label: "Reception", group: "Players" },
  { key: "reception_checkin", label: "Reception · Check-in", group: "Players" },
  { key: "reception_register", label: "Reception · Register", group: "Players" },
  { key: "reception_update", label: "Reception · Update Data", group: "Players" },
  { key: "crm_players", label: "Player CRM", group: "Players" },
  { key: "kyc_reviews", label: "KYC Reviews (AM)", group: "Club" },

  // Finance
  { key: "bank_checks", label: "Bank", group: "Finance" },
  { key: "expenses", label: "Expenses", group: "Finance" },
  { key: "daily_expenses", label: "Daily Expenses", group: "Finance" },
  { key: "expenses_approvals", label: "Expenses Approvals", group: "Finance" },
  { key: "finance_dashboard", label: "Finance Dashboard", group: "Finance" },
  { key: "finance_wallets", label: "Wallets", group: "Finance" },
  { key: "finance_cash_count", label: "Cash Count", group: "Finance" },
  { key: "finance_budget", label: "Budget", group: "Finance" },
  { key: "finance_review", label: "Daily Review", group: "Finance" },
  { key: "finance_transfers", label: "Inter-Casino Transfers", group: "Finance" },
  { key: "finance_summary", label: "Finance Summary", group: "Finance" },
  { key: "finance_payments", label: "Monthly Expenses", group: "Finance" },
  { key: "payroll", label: "Payroll", group: "Finance" },

  // Reports
  { key: "reports", label: "Reports", group: "Reports" },
  { key: "miss_chips", label: "Miss Chips Report", group: "Reports" },
  { key: "cancelled_transactions", label: "Cancelled Transactions", group: "Reports" },
  { key: "import_reports", label: "Import Reports", group: "Reports" },
  { key: "logs", label: "Activity Logs", group: "Reports" },

  // Staff / HR / System
  { key: "staff_employees", label: "Floor Staff Employees", group: "System" },
  { key: "employee_playlist", label: "Employee List", group: "System" },
  { key: "staff_rota", label: "Floor Staff Rota", group: "System" },
  { key: "staff_attendance", label: "Floor Staff Attendance", group: "System" },
  { key: "staff_master", label: "Staff Master (HR)", group: "System" },
  { key: "hr_warnings", label: "HR Warnings", group: "System" },
  { key: "cctv", label: "CCTV", group: "System" },
  { key: "cctv_dashboard", label: "CCTV Dashboard", group: "System" },
  { key: "marketing_campaigns", label: "Marketing Campaigns", group: "Operations" },
  { key: "admin", label: "Admin Panel", group: "System" },

  // Club / Premier Promo
  { key: "promo_codes", label: "Promo Codes", group: "Club" },
  { key: "promo_grants", label: "Promo Grants", group: "Club" },
  { key: "lotteries", label: "Lotteries", group: "Club" },
  { key: "shop_catalog", label: "Shop Catalog", group: "Club" },
  { key: "shop_orders", label: "Shop Orders", group: "Club" },
  { key: "am_budget", label: "My AM Budget", group: "Club" },
  { key: "am_performance", label: "AM Performance", group: "Club" },
  { key: "fm_topups", label: "FM Top-ups", group: "Club" },
  { key: "report_promo_issuance", label: "Report · Issuance", group: "Club" },
  { key: "report_promo_redemptions", label: "Report · Redemptions", group: "Club" },
  { key: "report_promo_expiry", label: "Report · Expiry", group: "Club" },
  { key: "report_promo_codes", label: "Report · Codes", group: "Club" },
  { key: "report_cashback", label: "Report · Cashback", group: "Club" },
  { key: "report_lottery_sales", label: "Report · Lottery Sales", group: "Club" },
  { key: "report_am_budget", label: "Report · AM Budget", group: "Club" },
];

export const MODULE_GROUPS = ["Operations", "Players", "Finance", "Reports", "Club", "System"] as const;

