import { useMemo, useState } from "react";
import { TrendingDown } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { YearSelect } from "@/components/ui/year-select";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { useFinBudget, useFinExpenses, useFinCategories } from "@/hooks/use-fin";
import { formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Difference = Plan − Actual (positive = under budget, negative = over). */
export default function FinancesBudgetDifferencePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { data: categories = [] } = useFinCategories();
  const { data: budget = [] } = useFinBudget(year);
  const { data: expenses = [] } = useFinExpenses({ from: `${year}-01-01`, to: `${year}-12-31` });

  const planned = useMemo(() => {
    const m: Record<string, Record<number, number>> = {};
    (budget || []).forEach((b: any) => {
      m[b.category_id] = m[b.category_id] || {};
      m[b.category_id][b.month] = (m[b.category_id][b.month] || 0) + Number(b.planned_amount || 0);
    });
    return m;
  }, [budget]);

  const actual = useMemo(() => {
    const m: Record<string, Record<number, number>> = {};
    expenses.forEach((e: any) => {
      if (e.voided_at || !e.fin_category_id) return;
      const mo = new Date(e.business_date).getMonth() + 1;
      m[e.fin_category_id] = m[e.fin_category_id] || {};
      m[e.fin_category_id][mo] = (m[e.fin_category_id][mo] || 0) + Number(e.amount_tzs || e.amount || 0);
    });
    return m;
  }, [expenses]);

  const expenseCats = useMemo(() => categories.filter((c: any) => !c.is_income), [categories]);

  return (
    <PageShell>
      <PageHeader icon={TrendingDown} title="Budget · Difference" subtitle="Plan − Actual per month · negative = overrun">
        <FinanceCasinoSwitcher />
        <YearSelect value={year} onChange={setYear} />
      </PageHeader>
      <PageSection card={false}>
        <div className="rounded-md border border-border overflow-auto max-h-[75vh] bg-card">
          <table className="text-[11px] border-collapse min-w-[1600px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-background [&>th]:bg-background [&>th]:h-8 [&>th]:px-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[10px] [&>th]:text-muted-foreground [&>th]:border-b [&>th]:border-border">
                <th className="text-left sticky left-0 z-30 min-w-[220px]">Category</th>
                {MONTHS.map((m) => <th key={m} className="text-right w-[104px] min-w-[104px]">{m}</th>)}
                <th className="text-right w-[120px] min-w-[120px] sticky right-0 z-30 border-l border-border">YTD</th>
              </tr>
            </thead>
            <tbody>
              {expenseCats.map((c: any) => {
                let ytd = 0;
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30 [&>td]:h-8 [&>td]:align-middle">
                    <td className="text-left sticky left-0 z-10 bg-card pl-2 pr-3 whitespace-nowrap border-r border-border">
                      <span className="text-muted-foreground text-[9px] uppercase mr-1">{c.group_code}</span>
                      <span className="truncate inline-block max-w-[260px] align-middle">{c.name}</span>
                    </td>
                    {MONTHS.map((_, i) => {
                      const p = planned[c.id]?.[i + 1] || 0;
                      const a = actual[c.id]?.[i + 1] || 0;
                      const diff = p - a;
                      ytd += diff;
                      const hasData = p > 0 || a > 0;
                      return (
                        <td key={i} className="text-right pr-1.5 font-mono tabular-nums whitespace-nowrap">
                          {hasData ? (
                            <span className={cn(diff < 0 ? "cms-amount-negative font-semibold" : diff > 0 ? "cms-amount-positive" : "text-muted-foreground")}>
                              {formatNumberSpaces(diff)}
                            </span>
                          ) : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      );
                    })}
                    <td className="text-right pr-2 sticky right-0 z-10 bg-card border-l border-border font-mono tabular-nums whitespace-nowrap">
                      <span className={cn(ytd < 0 ? "cms-amount-negative font-semibold" : ytd > 0 ? "cms-amount-positive" : "text-muted-foreground")}>
                        {ytd ? formatNumberSpaces(ytd) : "·"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageSection>

    </PageShell>
  );
}
