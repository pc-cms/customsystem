import { useMemo, useRef, useState, Fragment } from "react";
import { Target, ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YearSelect } from "@/components/ui/year-select";
import { useFinBudget, useFinCategories, useUpsertFinBudget } from "@/hooks/use-fin";
import { useFinDailyRatesForDate } from "@/hooks/use-fin-daily-rates";
import { formatNumberSpaces } from "@/lib/currency";
import { formatMoneyCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENCIES = ["TZS", "USD"] as const;
type Cur = (typeof CURRENCIES)[number];

type SortKey = "group" | "name" | "year_tzs" | "year_usd";

const planYear = (months: Record<number, number>): number => {
  const vals = Object.values(months).filter((v) => v > 0);
  if (vals.length === 0) return 0;
  if (vals.length === 1) return vals[0] * 12;
  return vals.reduce((s, v) => s + v, 0);
};

export default function FinancesBudgetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [sortKey, setSortKey] = useState<SortKey>("group");
  const [compact, setCompact] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1..12

  const fmtN = (n: number) => (n ? (compact ? formatMoneyCompact(n) : formatNumberSpaces(n)) : "");
  const fmtT = (n: number) => (compact ? formatMoneyCompact(n || 0) : formatNumberSpaces(n || 0));

  const { data: categoriesRaw = [] } = useFinCategories();
  const { data: budgetRows = [] } = useFinBudget(year);
  const upsert = useUpsertFinBudget();
  const { data: ratesMap = {} } = useFinDailyRatesForDate();
  const usdRate = Number(ratesMap.USD || 0);

  const grid = useMemo(() => {
    const map: Record<string, Record<Cur, Record<number, number>>> = {};
    (budgetRows || []).forEach((b: any) => {
      const cur = (b.currency as Cur) || "TZS";
      if (cur !== "TZS" && cur !== "USD") return;
      map[b.category_id] = map[b.category_id] || { TZS: {}, USD: {} };
      map[b.category_id][cur][b.month] = Number(b.planned_amount);
    });
    return map;
  }, [budgetRows]);

  const categories = useMemo(
    () => (categoriesRaw || []).filter((c: any) => !c.is_income && c.is_active),
    [categoriesRaw],
  );

  const sorted = useMemo(() => {
    const list = [...categories];
    if (sortKey === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortKey === "year_tzs" || sortKey === "year_usd") {
      const cur: Cur = sortKey === "year_tzs" ? "TZS" : "USD";
      list.sort((a, b) => planYear(grid[b.id]?.[cur] || {}) - planYear(grid[a.id]?.[cur] || {}));
    } else {
      list.sort(
        (a, b) =>
          (a.group_code || "").localeCompare(b.group_code || "") ||
          a.sort_order - b.sort_order ||
          a.name.localeCompare(b.name),
      );
    }
    return list;
  }, [categories, sortKey, grid]);

  const showGroups = sortKey === "group";

  const onCommit = (categoryId: string, currency: Cur, month: number, prev: number, raw: string) => {
    const v = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(v) || v === prev) return;
    upsert.mutate({ year, month, category_id: categoryId, currency, planned_amount: v });
  };

  const monthTotals = useMemo(() => {
    const tot: { tzs: number[]; usd: number[] } = {
      tzs: Array(12).fill(0),
      usd: Array(12).fill(0),
    };
    categories.forEach((c: any) => {
      const g = grid[c.id];
      if (!g) return;
      for (let m = 1; m <= 12; m++) {
        tot.tzs[m - 1] += g.TZS?.[m] || 0;
        tot.usd[m - 1] += g.USD?.[m] || 0;
      }
    });
    return tot;
  }, [grid, categories]);

  const yearTotalTzs = monthTotals.tzs.reduce((s, v) => s + v, 0);
  const yearTotalUsd = monthTotals.usd.reduce((s, v) => s + v, 0);
  const yearGrandTzs = yearTotalTzs + yearTotalUsd * (usdRate || 0);

  const subColW = compact ? 70 : 110;
  const monthW = subColW * 2;
  const catW = 240;
  const yearW = compact ? 100 : 130;
  const minW = catW + 12 * monthW + 2 * yearW;

  type Section = { groupCode: string; groupName: string; rows: any[] };
  const sections: Section[] = useMemo(() => {
    if (!showGroups) return [{ groupCode: "", groupName: "", rows: sorted }];
    const acc: Section[] = [];
    sorted.forEach((c: any) => {
      const last = acc[acc.length - 1];
      if (!last || last.groupCode !== c.group_code) {
        acc.push({ groupCode: c.group_code, groupName: c.group_name || c.group_code, rows: [c] });
      } else {
        last.rows.push(c);
      }
    });
    return acc;
  }, [sorted, showGroups]);

  // Scroll snap by month
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollByMonths = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * monthW, behavior: "smooth" });
  };

  const isSelMonth = (i: number) => i + 1 === selectedMonth;
  const selBg = "bg-primary/15";
  const selBgStrong = "bg-primary/25";
  const stickyLeftEdge = "ring-1 ring-inset ring-border shadow-[2px_0_0_0_hsl(var(--border))]";
  const stickyRightEdge = "ring-1 ring-inset ring-border shadow-[-2px_0_0_0_hsl(var(--border))]";

  return (
    <PageShell>
      <PageHeader icon={Target} title="Budget" subtitle="Per-casino · per-category · per-month · TZS + USD inline">
        <FinanceCasinoSwitcher allowNetwork={false} />
        <YearSelect value={year} onChange={setYear} />
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="group">Group → Name</SelectItem>
            <SelectItem value="name">Name A → Z</SelectItem>
            <SelectItem value="year_tzs">Plan Year TZS ↓</SelectItem>
            <SelectItem value="year_usd">Plan Year USD ↓</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={compact ? "default" : "outline"}
          onClick={() => setCompact((v) => !v)}
          title="Toggle compact (K/M) display"
        >
          {compact ? "Compact" : "Full"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => scrollByMonths(-1)} aria-label="Previous month">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => scrollByMonths(1)} aria-label="Next month">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </PageHeader>

      <PageSection card={false} bodyClassName="p-0">
        <div
          ref={scrollRef}
          className="rounded-md border border-border overflow-auto bg-card"
          style={{
            maxHeight: "calc(100vh - 220px)",
            scrollSnapType: "x mandatory",
            scrollPaddingLeft: catW,
          }}
        >
          <table className="text-[11px] border-separate border-spacing-0" style={{ minWidth: minW }}>
            <colgroup>
              <col style={{ width: catW, minWidth: catW }} />
              {MONTHS.map((_, i) => (
                <Fragment key={`cg-${i}`}>
                  <col style={{ width: subColW, minWidth: subColW }} />
                  <col style={{ width: subColW, minWidth: subColW }} />
                </Fragment>
              ))}
              <col style={{ width: yearW, minWidth: yearW }} />
              <col style={{ width: yearW, minWidth: yearW }} />
            </colgroup>

            <thead className="sticky top-0 z-30">
              <tr className="bg-background [&>th]:bg-background [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[10px] [&>th]:text-muted-foreground">
                <th
                  rowSpan={2}
                   className={cn("text-left sticky left-0 z-40 px-3 py-2 border-b border-border align-middle bg-background", stickyLeftEdge)}
                >
                  Category
                </th>
                {MONTHS.map((m, i) => (
                  <th
                    key={m}
                    colSpan={2}
                    className={cn(
                      "text-center border-l-2 border-border border-b px-1 py-1 cursor-pointer select-none transition-colors [scroll-snap-stop:always]",
                      isSelMonth(i) ? `${selBgStrong} text-foreground` : "hover:bg-muted/50",
                    )}
                    style={{
                      scrollSnapAlign: "start",
                      width: monthW,
                      minWidth: monthW,
                    }}
                    onClick={() => setSelectedMonth(i + 1)}
                    title="Click to highlight column"
                  >
                    {m}
                  </th>
                ))}
                <th
                  rowSpan={2}
                   className={cn("text-right sticky z-40 border-b border-border px-2 py-2 align-middle bg-background border-l-2 border-border", stickyRightEdge)}
                  style={{ right: yearW }}
                  title="Plan Year TZS — Σ12 (если введён один месяц → ×12)"
                >
                  Plan Year TZS
                </th>
                <th
                  rowSpan={2}
                   className={cn("text-right sticky right-0 z-40 border-b border-border px-2 py-2 align-middle bg-background border-l-2 border-border", stickyRightEdge)}
                  title="Plan Year USD — Σ12 (если введён один месяц → ×12)"
                >
                  Plan Year USD
                </th>
              </tr>
              <tr className="bg-background [&>th]:bg-background [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[9px] [&>th]:text-muted-foreground/80">
                {MONTHS.map((_, i) => (
                  <Fragment key={`sub-${i}`}>
                    <th
                      className={cn(
                        "text-right border-l-2 border-border border-b px-1 py-1",
                        isSelMonth(i) && selBg,
                      )}
                    >
                      TZS
                    </th>
                    <th
                      className={cn(
                        "text-right border-l border-border/40 border-b px-1 py-1",
                        isSelMonth(i) && selBg,
                      )}
                    >
                      USD
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>

            <tbody>
              {sections.map((sec) => {
                const subTzs = Array(12).fill(0);
                const subUsd = Array(12).fill(0);
                sec.rows.forEach((c: any) => {
                  const g = grid[c.id];
                  if (!g) return;
                  for (let m = 1; m <= 12; m++) {
                    subTzs[m - 1] += g.TZS?.[m] || 0;
                    subUsd[m - 1] += g.USD?.[m] || 0;
                  }
                });
                const subYearTzs = subTzs.reduce((s, v) => s + v, 0);
                const subYearUsd = subUsd.reduce((s, v) => s + v, 0);

                return (
                  <Fragment key={sec.groupCode || "all"}>
                    {showGroups && (
                      <tr className="bg-muted border-t border-border">
                        <td
                          className={cn("sticky left-0 z-20 bg-muted px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-foreground", stickyLeftEdge)}
                        >
                          {sec.groupName}
                        </td>
                        <td colSpan={24 + 2} className="bg-muted" />
                      </tr>
                    )}

                    {sec.rows.map((c: any) => {
                      const tzsRow = grid[c.id]?.TZS || {};
                      const usdRow = grid[c.id]?.USD || {};
                      const yTzs = planYear(tzsRow);
                      const yUsd = planYear(usdRow);
                      return (
                        <tr
                          key={c.id}
                          className="border-t border-border hover:bg-muted/40 [&>td]:h-7 [&>td]:align-middle"
                        >
                          <td
                            className={cn("sticky left-0 z-10 bg-card px-3 whitespace-nowrap", stickyLeftEdge)}
                            title={c.name}
                          >
                            {!showGroups && (
                              <span className="text-muted-foreground text-[9px] uppercase mr-1.5">
                                {c.group_code}
                              </span>
                            )}
                            <span className="truncate inline-block align-middle" style={{ maxWidth: catW - 40 }}>
                              {c.name}
                            </span>
                          </td>
                          {MONTHS.map((_, i) => {
                            const m = i + 1;
                            const tzs = tzsRow[m] || 0;
                            const usd = usdRow[m] || 0;
                            const sel = isSelMonth(i);
                            return (
                              <Fragment key={`r-${c.id}-${m}`}>
                                <td className={cn("border-l-2 border-border p-0", sel && selBg)}>
                                  <Cell
                                    value={tzs}
                                    compact={compact}
                                    onCommit={(raw) => onCommit(c.id, "TZS", m, tzs, raw)}
                                  />
                                </td>
                                <td className={cn("border-l border-border/40 p-0", sel && selBg)}>
                                  <Cell
                                    value={usd}
                                    compact={compact}
                                    onCommit={(raw) => onCommit(c.id, "USD", m, usd, raw)}
                                  />
                                </td>
                              </Fragment>
                            );
                          })}
                          <td className={cn("sticky z-10 bg-card text-right pr-2 font-mono tabular-nums whitespace-nowrap border-l-2 border-border", stickyRightEdge)} style={{ right: yearW }}>
                            {yTzs ? fmtN(yTzs) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                          <td className={cn("sticky right-0 z-10 bg-card text-right pr-2 font-mono tabular-nums whitespace-nowrap border-l-2 border-border", stickyRightEdge)}>
                            {yUsd ? fmtN(yUsd) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                        </tr>
                      );
                    })}

                    {showGroups && (
                      <tr className="border-t border-border bg-muted font-semibold [&>td]:h-7">
                        <td className={cn("sticky left-0 z-10 bg-muted px-3 text-[10px] uppercase tracking-wider text-muted-foreground", stickyLeftEdge)}>
                          Σ {sec.groupName}
                        </td>
                        {MONTHS.map((_, i) => {
                          const sel = isSelMonth(i);
                          return (
                            <Fragment key={`s-${sec.groupCode}-${i}`}>
                              <td
                                className={cn(
                                  "border-l-2 border-border text-right pr-2 font-mono tabular-nums whitespace-nowrap",
                                  sel && selBg,
                                )}
                              >
                                {subTzs[i] ? fmtN(subTzs[i]) : ""}
                              </td>
                              <td
                                className={cn(
                                  "border-l border-border/40 text-right pr-2 font-mono tabular-nums text-muted-foreground whitespace-nowrap",
                                  sel && selBg,
                                )}
                              >
                                {subUsd[i] ? fmtN(subUsd[i]) : ""}
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className={cn("sticky z-10 bg-muted text-right pr-2 font-mono tabular-nums whitespace-nowrap border-l-2 border-border", stickyRightEdge)} style={{ right: yearW }}>
                          {fmtN(subYearTzs)}
                        </td>
                        <td className={cn("sticky right-0 z-10 bg-muted text-right pr-2 font-mono tabular-nums text-muted-foreground whitespace-nowrap border-l-2 border-border", stickyRightEdge)}>
                          {fmtN(subYearUsd)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>

            <tfoot className="sticky bottom-0 z-30">
              <tr className="bg-secondary/80 backdrop-blur font-semibold border-t-2 border-primary/40 [&>td]:h-7">
                <td className="sticky left-0 z-40 bg-secondary px-3 text-[10px] uppercase tracking-wider shadow-[1px_0_0_0_hsl(var(--border))]">
                  Total TZS
                </td>
                {MONTHS.map((_, i) => {
                  const sel = isSelMonth(i);
                  return (
                    <Fragment key={`ft-tzs-${i}`}>
                      <td
                        className={cn(
                          "border-l-2 border-border text-right pr-2 font-mono tabular-nums whitespace-nowrap bg-secondary/80",
                          sel && selBgStrong,
                        )}
                      >
                        {fmtT(monthTotals.tzs[i])}
                      </td>
                      <td className={cn("border-l border-border/40 bg-secondary/80", sel && selBgStrong)} />
                    </Fragment>
                  );
                })}
                <td className="sticky z-40 bg-secondary text-right pr-2 font-mono tabular-nums whitespace-nowrap shadow-[-1px_0_0_0_hsl(var(--border))]" style={{ right: yearW }}>
                  {fmtT(yearTotalTzs)}
                </td>
                <td className="sticky right-0 z-40 bg-secondary shadow-[-1px_0_0_0_hsl(var(--border))]" />
              </tr>
              <tr className="bg-secondary/80 backdrop-blur font-semibold border-t border-border [&>td]:h-7">
                <td className="sticky left-0 z-40 bg-secondary px-3 text-[10px] uppercase tracking-wider text-muted-foreground shadow-[1px_0_0_0_hsl(var(--border))]">
                  Total USD
                </td>
                {MONTHS.map((_, i) => {
                  const sel = isSelMonth(i);
                  return (
                    <Fragment key={`ft-usd-${i}`}>
                      <td className={cn("border-l-2 border-border bg-secondary/80", sel && selBgStrong)} />
                      <td
                        className={cn(
                          "border-l border-border/40 text-right pr-2 font-mono tabular-nums text-muted-foreground whitespace-nowrap bg-secondary/80",
                          sel && selBgStrong,
                        )}
                      >
                        {fmtT(monthTotals.usd[i])}
                      </td>
                    </Fragment>
                  );
                })}
                <td className="sticky z-40 bg-secondary shadow-[-1px_0_0_0_hsl(var(--border))]" style={{ right: yearW }} />
                <td className="sticky right-0 z-40 bg-secondary text-right pr-2 font-mono tabular-nums text-muted-foreground whitespace-nowrap shadow-[-1px_0_0_0_hsl(var(--border))]">
                  {fmtT(yearTotalUsd)}
                </td>
              </tr>
              <tr className="bg-primary/15 backdrop-blur font-bold border-t border-primary/40 [&>td]:h-8">
                <td className="sticky left-0 z-40 bg-primary/20 px-3 text-[10px] uppercase tracking-wider shadow-[1px_0_0_0_hsl(var(--border))]">
                  Grand TZS
                </td>
                {MONTHS.map((_, i) => {
                  const sel = isSelMonth(i);
                  const gtzs = monthTotals.tzs[i] + monthTotals.usd[i] * (usdRate || 0);
                  return (
                    <td
                      key={`fg-${i}`}
                      colSpan={2}
                      className={cn(
                        "border-l-2 border-border text-right pr-2 font-mono tabular-nums whitespace-nowrap bg-primary/15",
                        sel && "bg-primary/30",
                      )}
                    >
                      {fmtT(gtzs)}
                    </td>
                  );
                })}
                <td colSpan={2} className="sticky right-0 z-40 bg-primary/20 text-right pr-2 font-mono tabular-nums whitespace-nowrap shadow-[-1px_0_0_0_hsl(var(--border))]">
                  {fmtT(yearGrandTzs)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {usdRate > 0 ? (
          <div className="text-[10px] text-muted-foreground px-3 py-2">
            Grand TZS = Σ TZS + Σ USD × {formatNumberSpaces(Math.round(usdRate))} (USD→TZS today, Office Rates)
          </div>
        ) : (
          <div className="text-[10px] text-amber-600 px-3 py-2">
            USD→TZS rate not set in Office → Rates · Grand TZS не учитывает USD
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}

function Cell({ value, compact, onCommit }: { value: number; compact: boolean; onCommit: (raw: string) => void }) {
  const [local, setLocal] = useState<string>(value ? String(value) : "");
  const [focused, setFocused] = useState(false);
  const display = !focused && compact && value ? formatMoneyCompact(value) : local;
  return (
    <Input
      value={display}
      onFocus={(e) => { setFocused(true); setLocal(value ? String(value) : ""); e.currentTarget.select(); }}
      onChange={(e) => setLocal(e.target.value.replace(/[^\d.-]/g, ""))}
      onBlur={() => { setFocused(false); onCommit(local); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-7 rounded-none border-0 bg-transparent text-right font-mono tabular-nums text-[11px] px-1 focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-primary/5"
      placeholder=""
    />
  );
}
