import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DayClosingsTab from "./DayClosingsTab";
import OtherIncomesTab from "./OtherIncomesTab";
import RatesTab from "./RatesTab";
import JpTab from "./JpTab";
import CollectionsTab from "./CollectionsTab";


import { OfficeShell } from "@/components/office/office-shell";


const WalletDayGridTab = lazy(() => import("./WalletDayGridTab"));
const FinancesWalletsPage = lazy(() => import("@/pages/finances/FinancesWalletsPage"));
const FinancesMonthlyReportPage = lazy(() => import("@/pages/finances/FinancesMonthlyReportPage"));
const FinancesInterCasinoPage = lazy(() => import("@/pages/finances/FinancesInterCasinoPage"));
const FinancesBankImportPage = lazy(() => import("@/pages/finances/FinancesBankImportPage"));


// Finance top tabs — fixed business order (Stage 2A, 2026-09-01):
// Day Closings | Bank | Cashless | Jackpots | Transactions | Wallets | Report | Collections
// Values (routes) are unchanged — only order and display labels.
// Balance was merged into Wallets (2026-07-20) — legacy `?tab=balance` redirects.
// Actual / Budget / Difference moved to their own /budget section (2026-08-14).
// Import Statement / Inter-Casino / Rates moved to the left sidebar (2026-09-01):
// they stay valid `?tab=` values (routes preserved) but no longer show in the strip.
// Tips & Bonuses left the Finance strip (2026-09-01) — `?tab=tips-bonuses`
// redirects to the Management page at /tips-and-bonuses.
const TABS = [
  { value: "day-closings", label: "Day Closings" },
  { value: "expenses", label: "Expenses" },
  { value: "bank", label: "Bank" },
  { value: "cashless", label: "Cashless" },
  { value: "jp", label: "Jackpots" },
  { value: "other-incomes", label: "Transactions" },
  { value: "wallets", label: "Wallets" },
  { value: "monthly-report", label: "Report" },
  { value: "collections", label: "Collections" },
] as const;

/** Pages that moved from the tab strip to the left sidebar (under Office). */
const SIDEBAR_PAGES = ["import-statement", "inter-casino", "rates"] as const;

type TabValue = (typeof TABS)[number]["value"] | (typeof SIDEBAR_PAGES)[number];

const DEFAULT_TAB: TabValue = "wallets";

const isValidTab = (v: string): v is TabValue =>
  TABS.some((t) => t.value === v) || (SIDEBAR_PAGES as readonly string[]).includes(v);

/** Tabs that moved to /budget — old links keep working. */
const BUDGET_TABS = new Set(["actual", "budget", "difference"]);

export default function OfficePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("tab") || DEFAULT_TAB;
  // Legacy redirect: balance → wallets (merged 2026-07-20)
  const normalised = raw === "balance" || raw === "money-change" ? "wallets" : raw;
  const tab: TabValue = isValidTab(normalised) ? normalised : DEFAULT_TAB;
  // Sidebar pages render without the tab strip — they own their PageHeader.
  const isSidebarPage = (SIDEBAR_PAGES as readonly string[]).includes(tab);

  useEffect(() => {
    if (BUDGET_TABS.has(raw)) {
      navigate(`/budget?tab=${raw}`, { replace: true });
      return;
    }
    // Tips & Bonuses moved to Management — old Finance URLs keep working.
    if (raw === "tips-bonuses") {
      navigate("/tips-and-bonuses?tab=tips", { replace: true });
      return;
    }
    if (raw === "balance" || raw === "money-change") {
      const next = new URLSearchParams(params);
      next.set("tab", "wallets");
      setParams(next, { replace: true });
    }
  }, [raw, params, setParams, navigate]);

  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <OfficeShell
      storageKey="office.period"
      tabs={TABS}
      tab={tab}
      onTabChange={onChange}
      showPeriod={!isSidebarPage}
      hideToolbar={isSidebarPage}
      monthControl={tab === "monthly-report"}
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
        {tab === "bank" && <WalletDayGridTab groups={["banks"]} title="Bank" />}
        {tab === "cashless" && (
          <WalletDayGridTab groups={["mobile_money", "digital_wallets", "selcom"]} title="Cashless" />
        )}
        {tab === "collections" && <CollectionsTab />}
        {tab === "day-closings" && <DayClosingsTab />}
        {tab === "import-statement" && <FinancesBankImportPage />}
        {tab === "inter-casino" && <FinancesInterCasinoPage />}
        {tab === "jp" && <JpTab />}

        {tab === "monthly-report" && <FinancesMonthlyReportPage />}
        {tab === "other-incomes" && <OtherIncomesTab />}
        {tab === "rates" && <RatesTab />}
        {tab === "wallets" && <FinancesWalletsPage />}
      </Suspense>
    </OfficeShell>
  );
}
