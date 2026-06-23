/**
 * Eagerly prefetch lazy-loaded route chunks.
 *
 * Two strategies:
 *  1. After login: warm ALL chunks in idle time so the app is fully reachable
 *     offline and switching tabs never shows a flash of Suspense loader.
 *  2. On link hover/focus/touchstart in the sidebar: prefetch THIS chunk
 *     immediately so the click is instant even on cold cache.
 */

type Loader = () => Promise<unknown>;

// Single source of truth: path → dynamic-import loader.
// Used for both hover-prefetch (precise match) and the post-login warm-up
// (Object.values).
export const pathLoaders: Record<string, Loader> = {
  "/": () => import("@/pages/Dashboard"),
  "/players/:id": () => import("@/pages/PlayerProfile"),
  "/cage": () => import("@/pages/Cage"),
  "/cage/view": () => import("@/pages/cage/CageViewPage"),
  "/cage/close-shift": () => import("@/pages/cage/CloseShiftPage"),
  "/cage/shift/:id/edit-opening": () => import("@/pages/cage/EditOpeningChipsPage"),
  "/players/register": () => import("@/pages/cage/RegisterPlayerPage"),
  "/tables": () => import("@/pages/Tables"),
  "/tables/close": () => import("@/pages/tables/CloseTablesPage"),
  "/expenses": () => import("@/components/ExpensesRouter"),
  "/expenses/approvals": () => import("@/pages/ExpensesApprovals"),
  "/logs": () => import("@/pages/Logs"),
  "/breaklist": () => import("@/pages/flat/PitFlat"),
  "/rota/live": () => import("@/pages/flat/PitFlat"),
  "/attendance/live": () => import("@/pages/flat/PitFlat"),
  "/dealers": () => import("@/pages/flat/PitFlat"),
  "/staff/employees": () => import("@/pages/flat/StaffFlat"),
  "/staff/playlist": () => import("@/pages/EmployeePlaylist"),
  "/rota/floor": () => import("@/pages/flat/StaffFlat"),
  "/rota/security": () => import("@/pages/flat/StaffFlat"),
  "/rota/office": () => import("@/pages/flat/StaffFlat"),
  "/attendance/floor": () => import("@/pages/flat/StaffFlat"),
  "/attendance/security": () => import("@/pages/flat/StaffFlat"),
  "/attendance/office": () => import("@/pages/flat/StaffFlat"),
  "/groups": () => import("@/pages/Groups"),
  "/reports": () => import("@/pages/Reports"),
  "/admin": () => import("@/pages/Admin"),
  "/admin/users/new": () => import("@/pages/admin/UserNewPage"),
  "/admin/users/:id/edit": () => import("@/pages/admin/UserEditPage"),
  "/admin/sync-log": () => import("@/pages/admin/SyncLogPage"),
  "/finances/dashboard": () => import("@/pages/finances/FinancesDashboardPage"),
  "/finances/expenses": () => import("@/pages/finances/FinancesExpensesPage"),
  "/finances/budget": () => import("@/pages/finances/FinancesBudgetHubPage"),
  "/finances/monthly-report": () => import("@/pages/finances/FinancesMonthlyReportPage"),
  "/finances/excel-import": () => import("@/pages/finances/FinancesExcelImportPage"),
  "/finances/audit-log": () => import("@/pages/finances/FinancesAuditLogPage"),
  "/finances/aliases": () => import("@/pages/finances/FinancesAliasesPage"),
  "/finances/inter-casino": () => import("@/pages/finances/FinancesInterCasinoPage"),
  "/office": () => import("@/pages/office/OfficePage"),
  "/reception": () => import("@/pages/Reception"),
  "/guests": () => import("@/pages/Guests"),
  "/blacklist": () => import("@/pages/Blacklist"),
  "/import-reports": () => import("@/pages/ImportReports"),
  "/bank-checks": () => import("@/pages/BankChecks"),
  "/miss-chips": () => import("@/pages/MissChips"),
  "/cancelled-transactions": () => import("@/pages/CancelledTransactions"),
  "/table-tracker": () => import("@/pages/TableTracker"),
  "/player-statistics": () => import("@/pages/PlayerStatistics"),
  "/cashless": () => import("@/pages/Cashless"),
  "/transfers": () => import("@/pages/Transfers"),
  "/incidents": () => import("@/pages/Incidents"),
  "/weekly-bonus": () => import("@/pages/WeeklyBonus"),
  "/monthly-tips": () => import("@/pages/MonthlyTips"),
  "/staff/master": () => import("@/pages/StaffMaster"),
  "/attendance/monthly": () => import("@/pages/AttendanceMonthly"),
  "/payroll": () => import("@/pages/Payroll"),
  "/payroll/dashboard": () => import("@/pages/payroll/PayrollDashboardPage"),
  "/payroll/settings": () => import("@/pages/payroll/PayrollSettingsPage"),
  "/payroll/bank-export": () => import("@/pages/payroll/PayrollBankExportPage"),
};

const routeLoaders: Loader[] = Object.values(pathLoaders);

const KEY = "cms.routePrefetch.lastRun";
const ONE_DAY = 24 * 60 * 60 * 1000;

function shouldRun(): boolean {
  try {
    const last = Number(localStorage.getItem(KEY) || "0");
    return !last || Date.now() - last > ONE_DAY;
  } catch {
    return true;
  }
}

function markRan() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function idle(cb: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (fn: () => void) => void })
    .requestIdleCallback;
  if (typeof ric === "function") ric(cb);
  else setTimeout(cb, 200);
}

async function runPool(loaders: Loader[], concurrency = 3) {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < loaders.length) {
      const my = idx++;
      try {
        await loaders[my]();
      } catch (e) {
        console.warn("[prefetch] route chunk failed", e);
      }
    }
  });
  await Promise.all(workers);
}

/**
 * Warm route chunks in the background. Idempotent — runs at most once
 * per 24h per device.
 *
 * When `allowedModules` is provided (Step 3), only chunks for routes the
 * user can actually open are warmed — Pit/Cashier don't pull Finance,
 * Payroll, KYC, Lottery JS into memory.
 *
 * When omitted (legacy callers), warms every chunk — preserves the
 * previous "fully reachable offline" behavior for super-admin / unknown.
 */
export function prefetchRouteChunks(allowedModules?: Set<string>): void {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;
  if (!shouldRun()) return;
  markRan();

  let loaders = routeLoaders;
  if (allowedModules && allowedModules.size > 0) {
    // Lazy import to avoid a hard circular dep at module-evaluation time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { moduleKeyForRoute } = require("@/lib/route-module-map") as typeof import("@/lib/route-module-map");
    loaders = Object.entries(pathLoaders)
      .filter(([path]) => {
        const mod = moduleKeyForRoute(path);
        // ungated routes (mod=null) are always warmed; gated routes must be allowed
        return mod === null || allowedModules.has(mod);
      })
      .map(([, loader]) => loader);
  }

  idle(() => {
    void runPool(loaders, 3);
  });
}

// In-flight set so hover spam doesn't re-trigger network for the same chunk.
const inflight = new Set<string>();

/**
 * Prefetch the chunk for a specific path (called on hover/focus/touchstart).
 * Strips query string and matches against pathLoaders.
 */
export function prefetchRoute(path: string): void {
  if (typeof window === "undefined") return;
  if (!path || path.startsWith("__")) return;
  const clean = path.split("?")[0].split("#")[0];
  const loader = pathLoaders[clean];
  if (!loader) return;
  if (inflight.has(clean)) return;
  inflight.add(clean);
  // Fire immediately (not idle) — user is signaling intent.
  Promise.resolve()
    .then(() => loader())
    .catch((e) => console.warn("[prefetch] hover prefetch failed", clean, e))
    .finally(() => {
      // Keep in set forever — once loaded the module is cached by the bundler.
    });
}
