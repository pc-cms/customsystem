import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DayClosingsTab from "./DayClosingsTab";
import OtherIncomesTab from "./OtherIncomesTab";
import RatesTab from "./RatesTab";
import BalanceTab from "./BalanceTab";
import { BalanceBanner } from "@/components/office/BalanceBanner";

const FinancesMoneyChangePage = lazy(() => import("@/pages/finances/FinancesMoneyChangePage"));
const FinancesWalletsPage = lazy(() => import("@/pages/finances/FinancesWalletsPage"));

const TABS = [
  { value: "balance", label: "Balance" },
  { value: "wallets", label: "Wallets" },
  { value: "day-closings", label: "Day Closings" },
  { value: "money-change", label: "Money Change" },
  { value: "other-incomes", label: "Other Incomes" },
  { value: "rates", label: "Rates" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const DEFAULT_TAB: TabValue = "balance";

export default function OfficePage() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get("tab") || DEFAULT_TAB) as TabValue;
  const tab: TabValue = TABS.some((t) => t.value === raw) ? raw : DEFAULT_TAB;

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
        {tab === "balance" && <BalanceTab />}
        {tab === "safe" && <FinancesOfficeSafePage />}
        {tab === "day-closings" && <DayClosingsTab />}
        {tab === "money-change" && <FinancesMoneyChangePage />}
        {tab === "wallets" && <FinancesWalletsPage />}
        {tab === "other-incomes" && <OtherIncomesTab />}
        {tab === "rates" && <RatesTab />}
      </Suspense>
    </div>
  );
}
