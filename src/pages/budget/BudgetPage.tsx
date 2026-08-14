/**
 * Budget section — Actual · Budget · Difference.
 * Moved out of Office into its own FINANCE entry (2026-08-14).
 */
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { OfficeShell } from "@/components/office/office-shell";

const FinancesBudgetPage = lazy(() => import("@/pages/finances/FinancesBudgetPage"));
const FinancesBudgetVsActualPage = lazy(() => import("@/pages/finances/FinancesBudgetVsActualPage"));
const FinancesBudgetDifferencePage = lazy(() => import("@/pages/finances/FinancesBudgetDifferencePage"));

const TABS = [
  { value: "actual", label: "Actual" },
  { value: "budget", label: "Budget" },
  { value: "difference", label: "Difference" },
] as const;

type TabValue = (typeof TABS)[number]["value"];
const DEFAULT_TAB: TabValue = "budget";

export default function BudgetPage() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get("tab") || DEFAULT_TAB) as TabValue;
  const tab: TabValue = TABS.some((t) => t.value === raw) ? raw : DEFAULT_TAB;

  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <OfficeShell
      storageKey="budget.period"
      tabs={TABS}
      tab={tab}
      onTabChange={onChange}
      showPeriod={false}
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
        {tab === "actual" && <FinancesBudgetVsActualPage />}
        {tab === "budget" && <FinancesBudgetPage />}
        {tab === "difference" && <FinancesBudgetDifferencePage />}
      </Suspense>
    </OfficeShell>
  );
}
