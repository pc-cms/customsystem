import { lazy, Suspense, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DayClosingsTab from "./DayClosingsTab";
import OtherIncomesTab from "./OtherIncomesTab";
import RatesTab from "./RatesTab";
import JpTab from "./JpTab";
import { BalanceBanner } from "@/components/office/BalanceBanner";

const FinancesMoneyChangePage = lazy(() => import("@/pages/finances/FinancesMoneyChangePage"));
const FinancesWalletsPage = lazy(() => import("@/pages/finances/FinancesWalletsPage"));
const FinancesBudgetPage = lazy(() => import("@/pages/finances/FinancesBudgetPage"));
const FinancesBudgetVsActualPage = lazy(() => import("@/pages/finances/FinancesBudgetVsActualPage"));
const FinancesBudgetDifferencePage = lazy(() => import("@/pages/finances/FinancesBudgetDifferencePage"));
const FinancesMonthlyReportPage = lazy(() => import("@/pages/finances/FinancesMonthlyReportPage"));

// Flat, alphabetically sorted top-level tabs — no nested sub-tabs.
// Balance was merged into Wallets (2026-07-20) — legacy `?tab=balance` redirects.
const TABS = [
  { value: "actual", label: "Actual" },
  { value: "budget", label: "Budget" },
  { value: "day-closings", label: "Day Closings" },
  { value: "difference", label: "Difference" },
  { value: "jp", label: "JP" },
  { value: "money-change", label: "Money Change" },
  { value: "monthly-report", label: "Monthly Report" },
  { value: "other-incomes", label: "Other Incomes" },
  { value: "rates", label: "Rates" },
  { value: "wallets", label: "Wallets" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const DEFAULT_TAB: TabValue = "wallets";

export default function OfficePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") || DEFAULT_TAB;
  // Legacy redirect: balance → wallets (merged 2026-07-20)
  const normalised: TabValue = raw === "balance" ? "wallets" : (raw as TabValue);
  const tab: TabValue = TABS.some((t) => t.value === normalised) ? normalised : DEFAULT_TAB;

  useEffect(() => {
    if (raw === "balance") {
      const next = new URLSearchParams(params);
      next.set("tab", "wallets");
      setParams(next, { replace: true });
    }
  }, [raw, params, setParams]);

  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <BalanceBanner />
      <Tabs value={tab} onValueChange={onChange}>
        <TabsList className="h-9 flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
        {tab === "actual" && <FinancesBudgetVsActualPage />}
        {tab === "budget" && <FinancesBudgetPage />}
        {tab === "day-closings" && <DayClosingsTab />}
        {tab === "difference" && <FinancesBudgetDifferencePage />}
        {tab === "money-change" && <FinancesMoneyChangePage />}
        {tab === "monthly-report" && <FinancesMonthlyReportPage />}
        {tab === "other-incomes" && <OtherIncomesTab />}
        {tab === "rates" && <RatesTab />}
        {tab === "wallets" && <FinancesWalletsPage />}
      </Suspense>
    </div>
  );
}
