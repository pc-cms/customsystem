import { lazy, Suspense, useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { DensityProvider } from "@/lib/density";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { CasinoProvider, useCasino, getSlugFromHostname } from "@/lib/casino-context";
import { BrandingProvider } from "@/lib/branding";
import { AppLayout } from "@/components/layout/AppLayout";
import { createIDBPersister } from "@/lib/query-persister";
import { usePrefetchCriticalData } from "@/hooks/use-prefetch";
import { useRealtimeSubscriptions } from "@/hooks/use-realtime";
import { initSyncEngine } from "@/lib/sync-engine";
import { clearSelectedPlayer } from "@/hooks/use-selected-player";
import Login from "@/pages/Login";
const Landing = lazy(() => import("@/pages/Landing"));
const PosLayout = lazy(() => import("@/pages/pos/PosLayout"));
const PosLogin = lazy(() => import("@/pages/pos/PosLogin"));
const PosWaiter = lazy(() => import("@/pages/pos/PosWaiter"));
const PosBar = lazy(() => import("@/pages/pos/PosBar"));
const PosManager = lazy(() => import("@/pages/pos/PosManager"));
const PosManagerMenu = lazy(() => import("@/pages/pos/PosManagerMenu"));
const PosManagerInventory = lazy(() => import("@/pages/pos/PosManagerInventory"));
const PosReports = lazy(() => import("@/pages/pos/PosReports"));
const PosCharges = lazy(() => import("@/pages/pos/PosCharges"));
const PosPurchases = lazy(() => import("@/pages/pos/PosPurchases"));
const PosManagerPricing = lazy(() => import("@/pages/pos/PosManagerPricing"));
const PosManagerStockCounts = lazy(() => import("@/pages/pos/PosManagerStockCounts"));
const PosShiftReconciliation = lazy(() => import("@/pages/pos/PosShiftReconciliation"));
const PosPlayerAnalytics = lazy(() => import("@/pages/pos/PosPlayerAnalytics"));
const PosManagerProblemOrders = lazy(() => import("@/pages/pos/PosManagerProblemOrders"));
const PosManagerLocations = lazy(() => import("@/pages/pos/PosManagerLocations"));
const PosManagerModifiers = lazy(() => import("@/pages/pos/PosManagerModifiers"));
const PosManagerRecipes = lazy(() => import("@/pages/pos/PosManagerRecipes"));
const PosManagerCogs = lazy(() => import("@/pages/pos/PosManagerCogs"));


// Lazy-loaded pages — each becomes a separate chunk
const Dashboard = lazy(() => import("@/pages/Dashboard"));

const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const Cage = lazy(() => import("@/pages/Cage"));
const Tables = lazy(() => import("@/pages/Tables"));
const Expenses = lazy(() => import("@/components/ExpensesRouter"));
const Logs = lazy(() => import("@/pages/Logs"));

const Pit = lazy(() => import("@/pages/Pit"));
const PitFlat = () => null; // referenced below as named imports
const BreaklistPage = lazy(() => import("@/pages/flat/PitFlat").then(m => ({ default: m.BreaklistPage })));
const PitRotaPage = lazy(() => import("@/pages/flat/PitFlat").then(m => ({ default: m.PitRotaPage })));
const PitAttendancePage = lazy(() => import("@/pages/flat/PitFlat").then(m => ({ default: m.PitAttendancePage })));
const DealersPage = lazy(() => import("@/pages/flat/PitFlat").then(m => ({ default: m.DealersPage })));
const StaffEmployeesPage = lazy(() => import("@/pages/flat/StaffFlat").then(m => ({ default: m.StaffEmployeesPage })));
const EmployeePlaylist = lazy(() => import("@/pages/EmployeePlaylist"));
const RotaFloorPage = lazy(() => import("@/pages/flat/StaffFlat").then(m => ({ default: m.RotaFloorPage })));
const RotaSecurityPage = lazy(() => import("@/pages/flat/StaffFlat").then(m => ({ default: m.RotaSecurityPage })));
const RotaOfficePage = lazy(() => import("@/pages/flat/StaffFlat").then(m => ({ default: m.RotaOfficePage })));
const AttendanceFloorPage = lazy(() => import("@/pages/flat/StaffFlat").then(m => ({ default: m.AttendanceFloorPage })));
const AttendanceSecurityPage = lazy(() => import("@/pages/flat/StaffFlat").then(m => ({ default: m.AttendanceSecurityPage })));
const AttendanceOfficePage = lazy(() => import("@/pages/flat/StaffFlat").then(m => ({ default: m.AttendanceOfficePage })));
const Groups = lazy(() => import("@/pages/Groups"));
const Reports = lazy(() => import("@/pages/Reports"));
const Admin = lazy(() => import("@/pages/Admin"));
const Staff = lazy(() => import("@/pages/Staff"));
const FinancesDashboardPage = lazy(() => import("@/pages/finances/FinancesDashboardPage"));
const FinancesWalletsPage = lazy(() => import("@/pages/finances/FinancesWalletsPage"));
const FinancesExpensesPage = lazy(() => import("@/pages/finances/FinancesExpensesPage"));
const FinancesDayClosingPage = lazy(() => import("@/pages/finances/FinancesDayClosingPage"));
const FinancesMoneyChangePage = lazy(() => import("@/pages/finances/FinancesMoneyChangePage"));
const FinancesOfficeSafePage = lazy(() => import("@/pages/finances/FinancesOfficeSafePage"));
const FinancesBudgetHubPage = lazy(() => import("@/pages/finances/FinancesBudgetHubPage"));
const FinancesMonthlyReportPage = lazy(() => import("@/pages/finances/FinancesMonthlyReportPage"));
const FinancesExcelImportPage = lazy(() => import("@/pages/finances/FinancesExcelImportPage"));
const FinancesAuditLogPage = lazy(() => import("@/pages/finances/FinancesAuditLogPage"));
const FinancesAliasesPage = lazy(() => import("@/pages/finances/FinancesAliasesPage"));
const FinancesInterCasinoPage = lazy(() => import("@/pages/finances/FinancesInterCasinoPage"));
const OfficePage = lazy(() => import("@/pages/office/OfficePage"));
const Reception = lazy(() => import("@/pages/Reception"));
const Guests = lazy(() => import("@/pages/Guests"));
const Blacklist = lazy(() => import("@/pages/Blacklist"));
const ImportReports = lazy(() => import("@/pages/ImportReports"));

const BankChecks = lazy(() => import("@/pages/BankChecks"));
const MissChips = lazy(() => import("@/pages/MissChips"));
const PokerTipsReport = lazy(() => import("@/pages/reports/PokerTipsReport"));
const FloorTipsReport = lazy(() => import("@/pages/reports/FloorTipsReport"));
const CancelledTransactions = lazy(() => import("@/pages/CancelledTransactions"));
const TableTracker = lazy(() => import("@/pages/TableTracker"));

const PlayerStatistics = lazy(() => import("@/pages/PlayerStatistics"));
const Cashless = lazy(() => import("@/pages/Cashless"));
const Transfers = lazy(() => import("@/pages/Transfers"));

const Incidents = lazy(() => import("@/pages/Incidents"));
const CloseShiftPage = lazy(() => import("@/pages/cage/CloseShiftPage"));
const RegisterPlayerPage = lazy(() => import("@/pages/cage/RegisterPlayerPage"));
const EditOpeningChipsPage = lazy(() => import("@/pages/cage/EditOpeningChipsPage"));
const CageClosingsPage = lazy(() => import("@/pages/cage/CageClosingsPage"));
const CageViewPage = lazy(() => import("@/pages/cage/CageViewPage"));
// ClosingsPage retired — merged into /reports (tabs: total, live, slots, expenses).
// DailyExpensesPage and SlotsExpenses removed — unified into /expenses.
const CageSlots = lazy(() => import("@/pages/CageSlots"));
const SlotsTipsCdPage = lazy(() => import("@/pages/cage/SlotsTipsCdPage"));


const ExpensesApprovals = lazy(() => import("@/pages/ExpensesApprovals"));
const CloseTablesPage = lazy(() => import("@/pages/tables/CloseTablesPage"));
const MarketingCampaigns = lazy(() => import("@/pages/marketing/MarketingCampaigns"));
const MarketingCampaignDetail = lazy(() => import("@/pages/marketing/MarketingCampaignDetail"));
const CrmPlayers = lazy(() => import("@/pages/crm/CrmPlayers"));

const UserNewPage = lazy(() => import("@/pages/admin/UserNewPage"));
const UserEditPage = lazy(() => import("@/pages/admin/UserEditPage"));
const SyncLogPage = lazy(() => import("@/pages/admin/SyncLogPage"));
const SyncQueuePage = lazy(() => import("@/pages/admin/SyncQueuePage"));
const PromoCodesPage = lazy(() => import("@/pages/admin/PromoCodesPage"));
const ShopCatalogPage = lazy(() => import("@/pages/admin/ShopCatalogPage"));
const ShopOrdersPage = lazy(() => import("@/pages/admin/ShopOrdersPage"));
const LotteriesPage = lazy(() => import("@/pages/admin/LotteriesPage"));
const PromoGrantsPage = lazy(() => import("@/pages/admin/PromoGrantsPage"));
const KycReviewsPage = lazy(() => import("@/pages/admin/KycReviewsPage"));
const AmBudgetPage = lazy(() => import("@/pages/admin/AmBudgetPage"));
const AmPerformancePage = lazy(() => import("@/pages/admin/AmPerformancePage"));
const PromoIssuanceReport = lazy(() => import("@/pages/reports/PromoIssuanceReport"));
const PromoRedemptionsReport = lazy(() => import("@/pages/reports/PromoRedemptionsReport"));
const PromoExpiryReport = lazy(() => import("@/pages/reports/PromoExpiryReport"));
const CashbackReport = lazy(() => import("@/pages/reports/CashbackReport"));
const AmBudgetReport = lazy(() => import("@/pages/reports/AmBudgetReport"));
const FmTopupsPage = lazy(() => import("@/pages/admin/FmTopupsPage"));
const PromoCodesReport = lazy(() => import("@/pages/reports/PromoCodesReport"));
const LotterySalesReport = lazy(() => import("@/pages/reports/LotterySalesReport"));
const TipsAndBonuses = lazy(() => import("@/pages/TipsAndBonuses"));
const HrWarnings = lazy(() => import("@/pages/hr/Warnings"));
const StaffMaster = lazy(() => import("@/pages/StaffMaster"));
const AttendanceMonthly = lazy(() => import("@/pages/AttendanceMonthly"));
const Payroll = lazy(() => import("@/pages/Payroll"));
const PayrollPeriodPage = lazy(() => import("@/pages/payroll/PayrollPeriodPage"));
const PayrollDashboardPage = lazy(() => import("@/pages/payroll/PayrollDashboardPage"));
const PayrollSettingsPage = lazy(() => import("@/pages/payroll/PayrollSettingsPage"));
const PayrollBankExportPage = lazy(() => import("@/pages/payroll/PayrollBankExportPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const ClubLayout = lazy(() => import("@/pages/club/ClubLayout"));
const ClubLanding = lazy(() => import("@/pages/club/ClubLanding"));
const ClubLogin = lazy(() => import("@/pages/club/ClubLogin"));
const ClubRegister = lazy(() => import("@/pages/club/ClubRegister"));
const ClubWallet = lazy(() => import("@/pages/club/ClubWallet"));
const ClubShop = lazy(() => import("@/pages/club/ClubShop"));
const ClubTickets = lazy(() => import("@/pages/club/ClubTickets"));
const ClubProfile = lazy(() => import("@/pages/club/ClubProfile"));
const ClubVerifyWizard = lazy(() => import("@/pages/club/ClubVerifyWizard"));
const ClubPrivacyPolicy = lazy(() => import("@/pages/club/legal/PrivacyPolicy"));
const ClubDataProtection = lazy(() => import("@/pages/club/legal/DataProtection"));
const ClubResponsibleGaming = lazy(() => import("@/pages/club/legal/ResponsibleGaming"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Step 1 (UX plan): tabs must feel instant. Realtime keeps the cache
      // fresh in the background (module channels mounted at the App level),
      // so re-entering a previously opened tab should NOT trigger a refetch.
      // Hooks that need shorter staleness override this explicitly
      // (current-shift, business-day-closure, shift_tables_result_total = 0).
      staleTime: 1000 * 60 * 5, // 5 min default — Realtime patches dominate
      gcTime: 1000 * 60 * 60 * 24, // 24h — keep in cache for offline
      // Returning to a tab / focusing the window must NOT cascade refetches:
      // cache is already current (Realtime). Manual "Resync all data" in
      // Settings covers the cold-start-on-new-PC scenario.
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      // M8: Do NOT auto-refetch every query on reconnect — that causes a
      // request storm on flaky links and brings the UI down again. The
      // offline sync engine + Realtime catch-up handle reconnects.
      refetchOnReconnect: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
      // Network mode "offlineFirst" lets queries serve cached data without
      // marking them as errored when the browser is offline — prevents
      // every list/page from flashing red mid-outage.
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});


const persister = createIDBPersister();

// Loading spinner for lazy-loaded pages
const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const FullScreenLoader = ({ label = "Loading CMS..." }: { label?: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-muted-foreground font-mono text-sm">{label}</p>
    </div>
  </div>
);

// Route → access is now driven by the Permission Matrix (single source of truth).
// We resolve each route to a module key via `moduleKeyForRoute` and check the
// user's effective allow-list. Super admin bypasses. Routes with no module
// mapping (auxiliary screens) are not gated here.
import { moduleKeyForRoute as resolveRouteModule } from "@/lib/route-module-map";
import { useMyModulePermissions } from "@/hooks/use-module-permissions";

// Legacy /pit?tab=… → flat /breaklist|/rota/live|/attendance/live|/dealers
const LegacyPitRedirect = () => {
  const tab = new URLSearchParams(window.location.search).get("tab");
  const target =
    tab === "rota" ? "/rota/live" :
    tab === "attendance" ? "/attendance/live" :
    tab === "employee" ? "/dealers" :
    "/breaklist";
  return <Navigate to={target} replace />;
};

// Legacy /staff?tab=… or /floor?tab=… → flat /staff/employees|/rota/*|/attendance/*
const LegacyStaffRedirect = () => {
  const sp = new URLSearchParams(window.location.search);
  const tab = sp.get("tab");
  const group = sp.get("group") || "floor";
  let target = "/staff/employees";
  if (tab === "attendance") target = `/attendance/${group}`;
  else if (tab === "rota_floor") target = "/rota/floor";
  else if (tab === "rota_security") target = "/rota/security";
  else if (tab === "rota_office") target = "/rota/office";
  return <Navigate to={target} replace />;
};

const RoleGuard = ({ path, children }: { path: string; children: React.ReactNode }) => {
  const { roles } = useAuth();
  const { data: allowedModules, isLoading } = useMyModulePermissions();
  const isSuper = roles.includes("super_admin");
  if (isSuper) return <>{children}</>;

  const moduleKey = resolveRouteModule(path);
  // No mapping → not gated by matrix (auxiliary route)
  if (!moduleKey) return <>{children}</>;

  // Still loading → render nothing yet (avoid flicker / wrong redirect)
  if (isLoading || allowedModules === undefined) return <FullScreenLoader />;

  if (!allowedModules.has(moduleKey)) {
    const fallback = roles.includes("cashier") ? "/cage" : roles.includes("cashier_slots") ? "/cage-slots" : "/";
    const target = path === "/" ? fallback : "/";
    // Prevent infinite redirect loop when the fallback itself is not allowed
    // (e.g. user lacks Dashboard module → "/" → "/" → replaceState storm).
    if (target === path) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center gap-2">
          <h2 className="text-lg font-bold">No access</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Your account does not have permission to view any module on this casino.
            Please contact a manager.
          </p>
        </div>
      );
    }
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
};

const getDefaultRoute = (roles: string[]) => {
  // POS-only users go straight to the POS app
  const isPosOnly = (roles.includes("pos_waiter") || roles.includes("pos_bartender") || roles.includes("pos_manager"))
    && !roles.some(r => ["manager","pit","cashier","reception","finance_manager","surveillance","super_admin","hr","shift_manager","cashier_slots"].includes(r));
  if (isPosOnly) {
    if (roles.includes("pos_bartender") && !roles.includes("pos_waiter")) return "/pos/bar";
    if (roles.includes("pos_manager") && !roles.includes("pos_waiter")) return "/pos/manager";
    return "/pos/waiter";
  }
  if (roles.includes("super_admin")) return "/admin";
  // Security-only users on premier will be handled by CCTV mode, but default route still needed
  if (roles.includes("surveillance") && !roles.some(r => ["manager", "pit", "cashier", "reception", "finance_manager", "super_admin", "hr"].includes(r))) {
    return "/";
  }
  if (roles.includes("hr") && !roles.some(r => ["manager", "pit", "cashier", "reception", "finance_manager", "surveillance", "super_admin"].includes(r))) {
    return "/staff/employees";
  }
  if (roles.includes("reception") && !roles.some(r => ["manager", "pit", "cashier", "finance_manager", "surveillance", "super_admin", "hr"].includes(r))) {
    return "/reception";
  }
  if (roles.includes("cashier") && !roles.some(r => ["manager", "pit", "reception", "finance_manager", "surveillance", "super_admin", "hr", "cashier_slots"].includes(r))) {
    return "/cage";
  }
  if (roles.includes("cashier_slots") && !roles.some(r => ["manager", "pit", "reception", "finance_manager", "surveillance", "super_admin", "hr", "cashier"].includes(r))) {
    return "/cage-slots";
  }
  return "/";
};

const ProtectedRoutes = () => {
  const { user, loading } = useAuth();


  // Prefetch critical data in background
  usePrefetchCriticalData();

  // Adaptive realtime subscriptions (full/polling/off based on connection quality)
  useRealtimeSubscriptions();

  // Initialize offline sync engine on mount
  useEffect(() => { initSyncEngine(); }, []);

  // M8: Staggered refetch after reconnect. The critical operational queries
  // are invalidated one at a time (250ms apart) so a flaky link doesn't get
  // hit by 30+ parallel requests the instant it comes back up.
  useEffect(() => {
    const KEYS = [
      "shifts", "transactions", "cage-transfers", "cash-counts",
      "visits", "active-players", "gaming_tables", "chip_counts",
    ];
    const onReconnect = async () => {
      for (const k of KEYS) {
        queryClient.invalidateQueries({ queryKey: [k] });
        await new Promise((r) => setTimeout(r, 250));
      }
    };
    window.addEventListener("cms:reconnected", onReconnect);
    return () => window.removeEventListener("cms:reconnected", onReconnect);
  }, []);

  if (loading) {
    return <FullScreenLoader />;
  }
  if (!user) return <Navigate to="/login" replace />;


  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<RoleGuard path="/"><Dashboard /></RoleGuard>} />
          <Route path="/players" element={<Navigate to="/player-statistics" replace />} />
          <Route path="/players/:id" element={<RoleGuard path="/players/:id"><PlayerProfile /></RoleGuard>} />
          
          <Route path="/cage" element={<RoleGuard path="/cage"><ErrorBoundary><Cage /></ErrorBoundary></RoleGuard>} />
          <Route path="/cage/view" element={<RoleGuard path="/cage/view"><ErrorBoundary><CageViewPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/cage/close-shift" element={<RoleGuard path="/cage"><ErrorBoundary><CloseShiftPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/cage/closings" element={<Navigate to="/reports?tab=live" replace />} />
          <Route path="/closings" element={<Navigate to="/reports?tab=total" replace />} />
          <Route path="/cage/shift/:id/edit-opening" element={<RoleGuard path="/cage"><ErrorBoundary><EditOpeningChipsPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/cage-slots" element={<RoleGuard path="/cage-slots"><ErrorBoundary><CageSlots /></ErrorBoundary></RoleGuard>} />
          <Route path="/cage-slots/cashless" element={<Navigate to="/cashless" replace />} />
          <Route path="/cage-slots/transfers" element={<Navigate to="/transfers" replace />} />
          <Route path="/cage-slots/tips" element={<RoleGuard path="/cage-slots"><ErrorBoundary><SlotsTipsCdPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/cage-slots/expenses" element={<Navigate to="/expenses" replace />} />
          <Route path="/cage-slots/report/:id" element={<Navigate to="/reports?tab=slots" replace />} />
          <Route path="/players/register" element={<RoleGuard path="/reception"><ErrorBoundary><RegisterPlayerPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/expenses/approvals" element={<RoleGuard path="/expenses/approvals"><ErrorBoundary><ExpensesApprovals /></ErrorBoundary></RoleGuard>} />
          <Route path="/reception" element={<RoleGuard path="/reception"><Reception /></RoleGuard>} />
          <Route path="/guests" element={<RoleGuard path="/guests"><Guests /></RoleGuard>} />
          
          <Route path="/blacklist" element={<RoleGuard path="/blacklist"><Blacklist /></RoleGuard>} />
          <Route path="/tables" element={<RoleGuard path="/tables"><Tables /></RoleGuard>} />
          <Route path="/tables/close" element={<RoleGuard path="/tables"><ErrorBoundary><CloseTablesPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/active-players" element={<Navigate to="/player-statistics" replace />} />
          <Route path="/player-statistics" element={<RoleGuard path="/player-statistics"><PlayerStatistics /></RoleGuard>} />
          <Route path="/player-tracker" element={<Navigate to="/player-statistics" replace />} />
          <Route path="/table-tracker" element={<RoleGuard path="/table-tracker"><TableTracker /></RoleGuard>} />
          <Route path="/tables/analytics" element={<Navigate to="/table-tracker" replace />} />
          <Route path="/expenses" element={<RoleGuard path="/expenses"><Expenses /></RoleGuard>} />
          <Route path="/expenses/daily" element={<Navigate to="/expenses" replace />} />
          <Route path="/cashless" element={<RoleGuard path="/cashless"><Cashless /></RoleGuard>} />
          <Route path="/transfers" element={<RoleGuard path="/transfers"><Transfers /></RoleGuard>} />
          {/* Phase 2 flat URLs — Pit (Live Game) */}
          <Route path="/breaklist" element={<RoleGuard path="/breaklist"><ErrorBoundary><BreaklistPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/rota/live" element={<RoleGuard path="/rota/live"><ErrorBoundary><PitRotaPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/attendance/live" element={<RoleGuard path="/attendance/live"><ErrorBoundary><PitAttendancePage /></ErrorBoundary></RoleGuard>} />
          <Route path="/dealers" element={<RoleGuard path="/dealers"><ErrorBoundary><DealersPage /></ErrorBoundary></RoleGuard>} />

          {/* Phase 2 flat URLs — Floor Staff */}
          <Route path="/staff/employees" element={<RoleGuard path="/staff/employees"><ErrorBoundary><StaffEmployeesPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/staff/playlist" element={<RoleGuard path="/staff/playlist"><ErrorBoundary><EmployeePlaylist /></ErrorBoundary></RoleGuard>} />
          <Route path="/rota/floor" element={<RoleGuard path="/rota/floor"><ErrorBoundary><RotaFloorPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/rota/security" element={<RoleGuard path="/rota/security"><ErrorBoundary><RotaSecurityPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/rota/office" element={<RoleGuard path="/rota/office"><ErrorBoundary><RotaOfficePage /></ErrorBoundary></RoleGuard>} />
          <Route path="/attendance/floor" element={<RoleGuard path="/attendance/floor"><ErrorBoundary><AttendanceFloorPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/attendance/security" element={<RoleGuard path="/attendance/security"><ErrorBoundary><AttendanceSecurityPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/attendance/office" element={<RoleGuard path="/attendance/office"><ErrorBoundary><AttendanceOfficePage /></ErrorBoundary></RoleGuard>} />

          {/* Legacy → flat-URL redirects (keep bookmarks alive) */}
          <Route path="/pit" element={<LegacyPitRedirect />} />
          <Route path="/staff" element={<LegacyStaffRedirect />} />
          <Route path="/floor" element={<LegacyStaffRedirect />} />
          <Route path="/groups" element={<RoleGuard path="/groups"><Groups /></RoleGuard>} />
          <Route path="/finances" element={<Navigate to="/finances/dashboard" replace />} />
          <Route path="/finance" element={<Navigate to="/finances/dashboard" replace />} />
          <Route path="/finances/dashboard" element={<RoleGuard path="/finances/dashboard"><ErrorBoundary><FinancesDashboardPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/office" element={<RoleGuard path="/finances/day-closing"><ErrorBoundary><OfficePage /></ErrorBoundary></RoleGuard>} />
          <Route path="/finances/expenses" element={<RoleGuard path="/finances/expenses"><ErrorBoundary><FinancesExpensesPage /></ErrorBoundary></RoleGuard>} />
          
          <Route path="/finances/inter-casino" element={<RoleGuard path="/finances/inter-casino"><ErrorBoundary><FinancesInterCasinoPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/finance/transfers" element={<Navigate to="/finances/inter-casino" replace />} />
          <Route path="/finances/budget" element={<RoleGuard path="/finances/budget"><ErrorBoundary><FinancesBudgetHubPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/finances/budget-vs-actual" element={<Navigate to="/finances/budget?tab=actual" replace />} />
          <Route path="/finances/variance" element={<Navigate to="/finances/budget?tab=actual" replace />} />
          <Route path="/finances/monthly-report" element={<RoleGuard path="/finances/monthly-report"><ErrorBoundary><FinancesMonthlyReportPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/finances/annual-analytics" element={<Navigate to="/finances/monthly-report" replace />} />
          <Route path="/finances/excel-import" element={<RoleGuard path="/finances/excel-import"><ErrorBoundary><FinancesExcelImportPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/finances/audit-log" element={<RoleGuard path="/finances/audit-log"><ErrorBoundary><FinancesAuditLogPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/finances/aliases" element={<RoleGuard path="/finances/aliases"><ErrorBoundary><FinancesAliasesPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/reports" element={<RoleGuard path="/reports"><Reports /></RoleGuard>} />
          <Route path="/stats" element={<Navigate to="/player-statistics" replace />} />
          <Route path="/logs" element={<RoleGuard path="/logs"><Logs /></RoleGuard>} />
          <Route path="/admin" element={<RoleGuard path="/admin"><Admin /></RoleGuard>} />
          <Route path="/admin/users/new" element={<RoleGuard path="/admin"><ErrorBoundary><UserNewPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/users/:id/edit" element={<RoleGuard path="/admin"><ErrorBoundary><UserEditPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/sync-log" element={<RoleGuard path="/admin"><ErrorBoundary><SyncLogPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/sync-queue" element={<RoleGuard path="/admin"><ErrorBoundary><SyncQueuePage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/promo-codes" element={<RoleGuard path="/admin/promo-codes"><ErrorBoundary><PromoCodesPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/shop" element={<RoleGuard path="/admin/shop"><ErrorBoundary><ShopCatalogPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/shop/orders" element={<RoleGuard path="/admin/shop/orders"><ErrorBoundary><ShopOrdersPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/lotteries" element={<RoleGuard path="/admin/lotteries"><ErrorBoundary><LotteriesPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/promo-grants" element={<RoleGuard path="/admin/promo-grants"><ErrorBoundary><PromoGrantsPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/kyc" element={<RoleGuard path="/admin/kyc"><ErrorBoundary><KycReviewsPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/am-budget" element={<RoleGuard path="/admin/am-budget"><ErrorBoundary><AmBudgetPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/am-performance" element={<RoleGuard path="/admin/am-performance"><ErrorBoundary><AmPerformancePage /></ErrorBoundary></RoleGuard>} />
          <Route path="/reports/promo-issuance" element={<ErrorBoundary><PromoIssuanceReport /></ErrorBoundary>} />
          <Route path="/reports/promo-redemptions" element={<ErrorBoundary><PromoRedemptionsReport /></ErrorBoundary>} />
          <Route path="/reports/promo-expiry" element={<ErrorBoundary><PromoExpiryReport /></ErrorBoundary>} />
          <Route path="/reports/cashback" element={<ErrorBoundary><CashbackReport /></ErrorBoundary>} />
          <Route path="/reports/am-budget" element={<RoleGuard path="/admin"><ErrorBoundary><AmBudgetReport /></ErrorBoundary></RoleGuard>} />
          <Route path="/admin/fm-topups" element={<RoleGuard path="/admin"><ErrorBoundary><FmTopupsPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/reports/promo-codes" element={<ErrorBoundary><PromoCodesReport /></ErrorBoundary>} />
          <Route path="/reports/lottery-sales" element={<ErrorBoundary><LotterySalesReport /></ErrorBoundary>} />
          <Route path="/import-reports" element={<RoleGuard path="/import-reports"><ImportReports /></RoleGuard>} />
          <Route path="/table-results" element={<Navigate to="/reports?tab=table-results" replace />} />
          <Route path="/bank-checks" element={<RoleGuard path="/bank-checks"><BankChecks /></RoleGuard>} />
          <Route path="/miss-chips" element={<RoleGuard path="/miss-chips"><MissChips /></RoleGuard>} />
          <Route path="/cancelled-transactions" element={<RoleGuard path="/cancelled-transactions"><CancelledTransactions /></RoleGuard>} />
          <Route path="/weekly-bonus" element={<Navigate to="/tips-and-bonuses?tab=weekly" replace />} />
          <Route path="/monthly-tips" element={<Navigate to="/tips-and-bonuses?tab=monthly" replace />} />
          <Route path="/tips-and-bonuses" element={<RoleGuard path="/tips-and-bonuses"><ErrorBoundary><TipsAndBonuses /></ErrorBoundary></RoleGuard>} />
          <Route path="/hr/warnings" element={<RoleGuard path="/hr/warnings"><ErrorBoundary><HrWarnings /></ErrorBoundary></RoleGuard>} />

          <Route path="/reports/miss-chips" element={<Navigate to="/miss-chips" replace />} />
          <Route path="/reports/poker-tips" element={<Navigate to="/tips-and-bonuses?tab=poker" replace />} />
          <Route path="/reports/floor-tips" element={<Navigate to="/tips-and-bonuses?tab=floor" replace />} />
          <Route path="/incidents" element={<RoleGuard path="/incidents"><ErrorBoundary><Incidents /></ErrorBoundary></RoleGuard>} />
          <Route path="/staff/master" element={<RoleGuard path="/staff/master"><ErrorBoundary><StaffMaster /></ErrorBoundary></RoleGuard>} />
          <Route path="/attendance/monthly" element={<RoleGuard path="/attendance/monthly"><ErrorBoundary><AttendanceMonthly /></ErrorBoundary></RoleGuard>} />
          <Route path="/payroll" element={<RoleGuard path="/payroll"><ErrorBoundary><Payroll /></ErrorBoundary></RoleGuard>} />
          <Route path="/payroll/dashboard" element={<RoleGuard path="/payroll/dashboard"><ErrorBoundary><PayrollDashboardPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/payroll/settings" element={<RoleGuard path="/payroll/settings"><ErrorBoundary><PayrollSettingsPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/payroll/bank-export" element={<RoleGuard path="/payroll/bank-export"><ErrorBoundary><PayrollBankExportPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/payroll/:id" element={<RoleGuard path="/payroll/:id"><ErrorBoundary><PayrollPeriodPage /></ErrorBoundary></RoleGuard>} />
          <Route path="/marketing" element={<Navigate to="/marketing/campaigns" replace />} />
          <Route path="/marketing/campaigns" element={<RoleGuard path="/marketing/campaigns"><ErrorBoundary><MarketingCampaigns /></ErrorBoundary></RoleGuard>} />
          <Route path="/marketing/campaigns/:id" element={<RoleGuard path="/marketing/campaigns/:id"><ErrorBoundary><MarketingCampaignDetail /></ErrorBoundary></RoleGuard>} />
          <Route path="/crm" element={<Navigate to="/crm/players" replace />} />
          <Route path="/crm/players" element={<RoleGuard path="/crm/players"><ErrorBoundary><CrmPlayers /></ErrorBoundary></RoleGuard>} />
        </Route>
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
      </Routes>
    </ErrorBoundary>
  );
};

const PlayerPreviewRouteReset = () => {
  const location = useLocation();

  useEffect(() => {
    clearSelectedPlayer();
  }, [location.pathname]);

  return null;
};

const AppRoutes = () => {
  const { user, loading, roles } = useAuth();
  const detectedSlug = getSlugFromHostname();

  // Root domain → landing page (no auth required)
  if (detectedSlug === "__landing__") {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    );
  }

  // club.casinosystem.app → Premier Club PWA only (no staff app)
  if (detectedSlug === "__club__") {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<ClubLayout />}>
            <Route path="/" element={<ClubLanding />} />
            <Route path="/club" element={<Navigate to="/" replace />} />
            <Route path="/club/login" element={<ClubLogin />} />
            <Route path="/club/register" element={<ClubRegister />} />
            <Route path="/club/wallet" element={<ClubWallet />} />
            <Route path="/club/shop" element={<ClubShop />} />
            <Route path="/club/tickets" element={<ClubTickets />} />
            <Route path="/club/profile" element={<ClubProfile />} />
            <Route path="/club/verify" element={<ClubVerifyWizard />} />
            <Route path="/club/privacy" element={<ClubPrivacyPolicy />} />
            <Route path="/club/data-protection" element={<ClubDataProtection />} />
            <Route path="/club/responsible-gaming" element={<ClubResponsibleGaming />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (loading) return <FullScreenLoader label="Restoring session..." />;
  const defaultRoute = user ? getDefaultRoute(roles) : "/";
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/pos/login" element={<PosLogin />} />
        <Route element={<ClubLayout />}>
          <Route path="/club" element={<Navigate to="/club/login" replace />} />
          <Route path="/club/login" element={<ClubLogin />} />
          <Route path="/club/register" element={<ClubRegister />} />
          <Route path="/club/wallet" element={<ClubWallet />} />
          <Route path="/club/shop" element={<ClubShop />} />
          <Route path="/club/tickets" element={<ClubTickets />} />
          <Route path="/club/profile" element={<ClubProfile />} />
          <Route path="/club/verify" element={<ClubVerifyWizard />} />
          <Route path="/club/privacy" element={<ClubPrivacyPolicy />} />
          <Route path="/club/data-protection" element={<ClubDataProtection />} />
          <Route path="/club/responsible-gaming" element={<ClubResponsibleGaming />} />
        </Route>
        <Route path="/pos" element={<PosLayout />}>
          <Route index element={<Navigate to="/pos/waiter" replace />} />
          <Route path="waiter" element={<PosWaiter />} />
          <Route path="bar" element={<PosBar />} />
          <Route path="manager" element={<PosManager />} />
          <Route path="manager/menu" element={<PosManagerMenu />} />
          <Route path="manager/inventory" element={<PosManagerInventory />} />
          <Route path="manager/pricing" element={<PosManagerPricing />} />
          <Route path="manager/stock-counts" element={<PosManagerStockCounts />} />
          <Route path="manager/shift-reconciliation" element={<PosShiftReconciliation />} />
          <Route path="manager/player-analytics" element={<PosPlayerAnalytics />} />
          <Route path="manager/problem-orders" element={<PosManagerProblemOrders />} />
          <Route path="manager/locations" element={<PosManagerLocations />} />
          <Route path="manager/modifiers" element={<PosManagerModifiers />} />
          <Route path="manager/recipes" element={<PosManagerRecipes />} />
          <Route path="manager/cogs" element={<PosManagerCogs />} />

          <Route path="reports" element={<PosReports />} />
          <Route path="charges" element={<PosCharges />} />
          <Route path="purchases" element={<PosPurchases />} />
        </Route>
        <Route path="/login" element={user ? <Navigate to={defaultRoute} replace /> : <Login />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <ThemeProvider>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24h
        buster: "v4-skip-map-set-dehydration",
        dehydrateOptions: {
          // Skip queries whose data is a Map/Set — JSON dehydration loses
          // them and on restore `.get()` blows up ("Se.get is not a function").
          shouldDehydrateQuery: (q) => {
            const d = q.state.data;
            if (d instanceof Map || d instanceof Set) return false;
            return q.state.status === "success";
          },
        },
      }}
    >
      <TooltipProvider>
        <AuthProvider>
          <DensityProvider>
            <CasinoProvider>
              <BrandingProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <PlayerPreviewRouteReset />
                  <AppRoutes />
                </BrowserRouter>
              </BrandingProvider>
            </CasinoProvider>
          </DensityProvider>
        </AuthProvider>
      </TooltipProvider>
    </PersistQueryClientProvider>
  </ThemeProvider>
);

export default App;
