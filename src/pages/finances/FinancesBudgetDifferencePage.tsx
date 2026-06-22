import { useMemo, useRef, useState, Fragment } from "react";
import { TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { YearSelect } from "@/components/ui/year-select";
import { Button } from "@/components/ui/button";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { useFinBudget, useFinExpenses, useFinCategories } from "@/hooks/use-fin";
import { formatNumberSpaces } from "@/lib/currency";
import { formatMoneyCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Difference = Plan − Actual (positive = under budget, negative = over). */
export default function FinancesBudgetDifferencePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [compact, setCompact] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const { data: categories = [] } = useFinCategories();
  const { data: budget = [] } = useFinBudget(year);
  const { data: expenses = [] } = useFinExpenses({ from: `${year}-01-01`, to: `${year}-12-31` });

  const fmt = (n: number) => (compact ? formatMoneyCompact(n) : formatNumberSpaces(n));

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

  // Column totals
  const colTotals = useMemo(() => {
    const arr = Array(12).fill(0);
    expenseCats.forEach((c: any) => {
      for (let i = 0; i < 12; i++) {
        const p = planned[c.id]?.[i + 1] || 0;
        const a = actual[c.id]?.[i + 1] || 0;
        arr[i] += p - a;
      }
    });
    return arr;
  }, [expenseCats, planned, actual]);
  const ytdGrand = colTotals.reduce((s, v) => s + v, 0);

  const monthW = compact ? 80 : 104;
  const catW = 220;
  const ytdW = 120;
  const minW = catW + 12 * monthW + ytdW;

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollByMonths = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * monthW, behavior: "smooth" });
  };

  const isSel = (i: number) => i + 1 === selectedMonth;
  const selBg = "bg-primary/15";
  const selBgStrong = "bg-primary/25";
  const stickyLeftEdge = "ring-1 ring-inset ring-border shadow-[2px_0_0_0_hsl(var(--border))]";
  const stickyRightEdge = "ring-1 ring-inset ring-border shadow-[-2px_0_0_0_hsl(var(--border))]";

  return (
    <PageShell>
      <PageHeader icon={TrendingDown} title="Budget · Difference" subtitle="Plan − Actual per month · negative = overrun">
        <FinanceCasinoSwitcher />
        <YearSelect value={year} onChange={setYear} />
        <Button size="sm" variant={compact ? "default" : "outline"} onClick={() => setCompact((v) => !v)}>
          {compact ? "Compact" : "Full"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => scrollByMonths(-1)}><ChevronLeft className="w-4 h-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => scrollByMonths(1)}><ChevronRight className="w-4 h-4" /></Button>
      </PageHeader>
      <PageSection card={false}>
        <div
          ref={scrollRef}
          className="rounded-md border border-border overflow-auto max-h-[75vh] bg-card"
          style={{ scrollSnapType: "x mandatory", scrollPaddingLeft: catW }}
        >
          <table className="text-[11px] border-separate border-spacing-0" style={{ minWidth: minW }}>
            <colgroup>
              <col style={{ width: catW, minWidth: catW }} />
              {MONTHS.map((_, i) => <col key={i} style={{ width: monthW, minWidth: monthW }} />)}
              <col style={{ width: ytdW, minWidth: ytdW }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="bg-background [&>th]:bg-background [&>th]:h-8 [&>th]:px-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[10px] [&>th]:text-muted-foreground [&>th]:border-b [&>th]:border-border">
                <th className={cn("text-left sticky left-0 z-30 bg-background", stickyLeftEdge)}>Category</th>
                {MONTHS.map((m, i) => (
                  <th
                    key={m}
                    className={cn(
                      "text-right cursor-pointer select-none transition-colors border-l border-border [scroll-snap-stop:always]",
                      isSel(i) ? `${selBgStrong} text-foreground` : "hover:bg-muted/50",
                    )}
                    style={{ scrollSnapAlign: "start" }}
                    onClick={() => setSelectedMonth(i + 1)}
                  >
                    {m}
                  </th>
                ))}
                <th className={cn("text-right sticky right-0 z-30 bg-background border-l-2 border-border", stickyRightEdge)}>YTD</th>
              </tr>
            </thead>
            <tbody>
              {expenseCats.map((c: any) => {
                let ytd = 0;
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30 [&>td]:h-8 [&>td]:align-middle">
                    <td className={cn("text-left sticky left-0 z-10 bg-card pl-2 pr-3 whitespace-nowrap", stickyLeftEdge)}>
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
                        <td key={i} className={cn("text-right pr-1.5 font-mono tabular-nums whitespace-nowrap border-l border-border", isSel(i) && selBg)}>
                          {hasData ? (
                            <span className={cn(diff < 0 ? "cms-amount-negative font-semibold" : diff > 0 ? "cms-amount-positive" : "text-muted-foreground")}>
                              {fmt(diff)}
                            </span>
                          ) : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      );
                    })}
                    <td className={cn("text-right pr-2 sticky right-0 z-10 bg-card border-l-2 border-border font-mono tabular-nums whitespace-nowrap", stickyRightEdge)}>
                      <span className={cn(ytd < 0 ? "cms-amount-negative font-semibold" : ytd > 0 ? "cms-amount-positive" : "text-muted-foreground")}>
                        {ytd ? fmt(ytd) : "·"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-30">
              <tr className="bg-primary/15 font-bold border-t-2 border-primary/40 [&>td]:h-8">
                <td className={cn("sticky left-0 z-40 bg-primary px-2 text-[10px] uppercase tracking-wider text-primary-foreground", stickyLeftEdge)}>
                  Σ Difference
                </td>
                {colTotals.map((v, i) => (
                  <td
                    key={i}
                    className={cn(
                      "text-right pr-1.5 font-mono tabular-nums whitespace-nowrap bg-primary/15 border-l border-border",
                      isSel(i) && "bg-primary/30",
                    )}
                  >
                    <span className={v < 0 ? "cms-amount-negative" : v > 0 ? "cms-amount-positive" : "text-muted-foreground"}>
                      {v ? fmt(v) : "·"}
                    </span>
                  </td>
                ))}
                <td className={cn("sticky right-0 z-40 bg-primary border-l-2 border-border text-right pr-2 font-mono tabular-nums whitespace-nowrap text-primary-foreground", stickyRightEdge)}>
                  <span className={ytdGrand < 0 ? "cms-amount-negative" : ytdGrand > 0 ? "cms-amount-positive" : "text-muted-foreground"}>
                    {ytdGrand ? fmt(ytdGrand) : "·"}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </PageSection>

    </PageShell>
  );
}
