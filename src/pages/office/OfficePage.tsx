import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DayClosingsTab from "./DayClosingsTab";
import OtherIncomesTab from "./OtherIncomesTab";
import RatesTab from "./RatesTab";
import JpTab from "./JpTab";
import { BalanceBanner } from "@/components/office/BalanceBanner";
import { OfficeShell } from "@/components/office/office-shell";


const WalletDayGridTab = lazy(() => import("./WalletDayGridTab"));
const FinancesWalletsPage = lazy(() => import("@/pages/finances/FinancesWalletsPage"));
const FinancesMonthlyReportPage = lazy(() => import("@/pages/finances/FinancesMonthlyReportPage"));


// Flat, alphabetically sorted top-level tabs — no nested sub-tabs.
// Balance was merged into Wallets (2026-07-20) — legacy `?tab=balance` redirects.
// Actual / Budget / Difference moved to their own /budget section (2026-08-14).
const TABS = [
  { value: "bank", label: "Bank" },
  { value: "cashless", label: "Cashless" },
  { value: "day-closings", label: "Day Closings" },
  { value: "jp", label: "JP" },
  
  { value: "monthly-report", label: "Monthly Report" },
  { value: "other-incomes", label: "Transactions" },
  { value: "rates", label: "Rates" },
  { value: "wallets", label: "Wallets" },
] as const;


type TabValue = (typeof TABS)[number]["value"];

const DEFAULT_TAB: TabValue = "wallets";

/** Tabs that moved to /budget — old links keep working. */
const BUDGET_TABS = new Set(["actual", "budget", "difference"]);

export default function OfficePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("tab") || DEFAULT_TAB;
  // Legacy redirect: balance → wallets (merged 2026-07-20)
  const normalised: TabValue = raw === "balance" || raw === "money-change" ? "wallets" : (raw as TabValue);
  const tab: TabValue = TABS.some((t) => t.value === normalised) ? normalised : DEFAULT_TAB;

  useEffect(() => {
    if (BUDGET_TABS.has(raw)) {
      navigate(`/budget?tab=${raw}`, { replace: true });
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
      showPeriod={tab !== "rates"}
      banner={<BalanceBanner />}
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
        {tab === "day-closings" && <DayClosingsTab />}
        {tab === "jp" && <JpTab />}
        {tab === "monthly-report" && <FinancesMonthlyReportPage />}
        {tab === "other-incomes" && <OtherIncomesTab />}
        {tab === "rates" && <RatesTab />}
        {tab === "wallets" && <FinancesWalletsPage />}
      </Suspense>
    </OfficeShell>
  );
}
