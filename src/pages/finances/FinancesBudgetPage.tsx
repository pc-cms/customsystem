import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YearSelect } from "@/components/ui/year-select";
import { useFinBudget, useFinCategories, useUpsertFinBudget } from "@/hooks/use-fin";
import { useFinDailyRatesForDate } from "@/hooks/use-fin-daily-rates";
import { formatNumberSpaces } from "@/lib/currency";
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

const fmt = (n: number) => (n ? formatNumberSpaces(n) : "");
const fmtT = (n: number) => formatNumberSpaces(n || 0);

export default function FinancesBudgetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [sortKey, setSortKey] = useState<SortKey>("group");

  const { data: categoriesRaw = [] } = useFinCategories();
  const { data: budgetRows = [] } = useFinBudget(year);
  const upsert = useUpsertFinBudget();
  const { data: ratesMap = {} } = useFinDailyRatesForDate();
  const usdRate = Number(ratesMap.USD || 0);

  // categoryId → currency → month → amount
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

  // Group rows for "group" sort: insert group header + subtotal rows.
  const showGroups = sortKey === "group";

  const onCommit = (categoryId: string, currency: Cur, month: number, prev: number, raw: string) => {
    const v = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(v) || v === prev) return;
    upsert.mutate({ year, month, category_id: categoryId, currency, planned_amount: v });
  };

  // Bottom totals per month
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

  const subColW = 110;
  const monthW = subColW * 2;
  const catW = 240;
  const yearW = 130;

  // Group rows into sections for rendering
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
      </PageHeader>

      <PageSection card={false} bodyClassName="p-0">
        <div
          className="rounded-md border border-border overflow-auto bg-card"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          <table className="text-[11px] border-collapse" style={{ minWidth: catW + 12 * monthW + 2 * yearW }}>
            <thead className="bg-muted/40 sticky top-0 z-30">
              <tr className="[&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[10px] [&>th]:text-muted-foreground">
                <th
                  rowSpan={2}
                  className="text-left sticky left-0 z-40 bg-muted/40 px-3 py-2 border-r border-border align-middle"
                  style={{ width: catW, minWidth: catW }}
                >
                  Category
                </th>
                {MONTHS.map((m) => (
                  <th
                    key={m}
                    colSpan={2}
                    className="text-center border-l border-border px-1 py-1"
                    style={{ width: monthW, minWidth: monthW }}
                  >
                    {m}
                  </th>
                ))}
                <th
                  rowSpan={2}
                  className="text-right sticky right-[130px] z-40 bg-muted/40 border-l border-border px-2 py-2 align-middle"
                  style={{ width: yearW, minWidth: yearW }}
                  title="Plan Year TZS — Σ12 (если введён один месяц → ×12)"
                >
                  Plan Year TZS
                </th>
                <th
                  rowSpan={2}
                  className="text-right sticky right-0 z-40 bg-muted/40 border-l border-border px-2 py-2 align-middle"
                  style={{ width: yearW, minWidth: yearW }}
                  title="Plan Year USD — Σ12 (если введён один месяц → ×12)"
                >
                  Plan Year USD
                </th>
              </tr>
              <tr className="[&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[9px] [&>th]:text-muted-foreground/80">
                {MONTHS.map((_, i) => (
                  <>
                    <th
                      key={`tzs-${i}`}
                      className="text-right border-l border-border px-1 py-1 bg-muted/30"
                      style={{ width: subColW, minWidth: subColW }}
                    >
                      TZS
                    </th>
                    <th
                      key={`usd-${i}`}
                      className="text-right px-1 py-1 bg-muted/30"
                      style={{ width: subColW, minWidth: subColW }}
                    >
                      USD
                    </th>
                  </>
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
                  <>
                    {showGroups && (
                      <tr className="bg-muted/30 border-t border-border">
                        <td
                          className="sticky left-0 z-20 bg-muted/30 px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-foreground border-r border-border"
                        >
                          {sec.groupName}
                        </td>
                        <td colSpan={24 + 2} />
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
                          className="border-t border-border hover:bg-muted/20 [&>td]:h-7 [&>td]:align-middle"
                        >
                          <td
                            className="sticky left-0 z-10 bg-card px-3 whitespace-nowrap border-r border-border"
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
                            return (
                              <>
                                <td key={`t-${m}`} className="border-l border-border p-0">
                                  <Cell
                                    value={tzs}
                                    onCommit={(raw) => onCommit(c.id, "TZS", m, tzs, raw)}
                                  />
                                </td>
                                <td key={`u-${m}`} className="p-0">
                                  <Cell
                                    value={usd}
                                    onCommit={(raw) => onCommit(c.id, "USD", m, usd, raw)}
                                  />
                                </td>
                              </>
                            );
                          })}
                          <td className="sticky right-[130px] z-10 bg-card border-l border-border text-right pr-2 font-mono tabular-nums">
                            {yTzs ? fmt(yTzs) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                          <td className="sticky right-0 z-10 bg-card border-l border-border text-right pr-2 font-mono tabular-nums">
                            {yUsd ? fmt(yUsd) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                        </tr>
                      );
                    })}

                    {showGroups && (
                      <tr className="border-t border-border bg-muted/20 font-semibold [&>td]:h-7">
                        <td className="sticky left-0 z-10 bg-muted/20 px-3 text-[10px] uppercase tracking-wider text-muted-foreground border-r border-border">
                          Σ {sec.groupName}
                        </td>
                        {MONTHS.map((_, i) => (
                          <>
                            <td
                              key={`st-${i}`}
                              className="border-l border-border text-right pr-2 font-mono tabular-nums"
                            >
                              {subTzs[i] ? fmt(subTzs[i]) : ""}
                            </td>
                            <td
                              key={`su-${i}`}
                              className="text-right pr-2 font-mono tabular-nums text-muted-foreground"
                            >
                              {subUsd[i] ? fmt(subUsd[i]) : ""}
                            </td>
                          </>
                        ))}
                        <td className="sticky right-[130px] z-10 bg-muted/20 border-l border-border text-right pr-2 font-mono tabular-nums">
                          {fmt(subYearTzs)}
                        </td>
                        <td className="sticky right-0 z-10 bg-muted/20 border-l border-border text-right pr-2 font-mono tabular-nums text-muted-foreground">
                          {fmt(subYearUsd)}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>

            <tfoot className="sticky bottom-0 z-30">
              {/* Total TZS row */}
              <tr className="bg-muted/60 border-t-2 border-border font-semibold [&>td]:h-7">
                <td className="sticky left-0 z-30 bg-muted/60 px-3 text-[10px] uppercase tracking-wider border-r border-border">
                  Total TZS
                </td>
                {MONTHS.map((_, i) => (
                  <>
                    <td
                      key={`tt-${i}`}
                      className="border-l border-border text-right pr-2 font-mono tabular-nums"
                    >
                      {fmtT(monthTotals.tzs[i])}
                    </td>
                    <td key={`tg-${i}`} />
                  </>
                ))}
                <td className="sticky right-[130px] z-30 bg-muted/60 border-l border-border text-right pr-2 font-mono tabular-nums">
                  {fmtT(yearTotalTzs)}
                </td>
                <td className="sticky right-0 z-30 bg-muted/60 border-l border-border" />
              </tr>
              {/* Total USD row */}
              <tr className="bg-muted/60 font-semibold [&>td]:h-7">
                <td className="sticky left-0 z-30 bg-muted/60 px-3 text-[10px] uppercase tracking-wider border-r border-border text-muted-foreground">
                  Total USD
                </td>
                {MONTHS.map((_, i) => (
                  <>
                    <td key={`ut-${i}`} className="border-l border-border" />
                    <td
                      key={`uu-${i}`}
                      className="text-right pr-2 font-mono tabular-nums text-muted-foreground"
                    >
                      {fmtT(monthTotals.usd[i])}
                    </td>
                  </>
                ))}
                <td className="sticky right-[130px] z-30 bg-muted/60 border-l border-border" />
                <td className="sticky right-0 z-30 bg-muted/60 border-l border-border text-right pr-2 font-mono tabular-nums text-muted-foreground">
                  {fmtT(yearTotalUsd)}
                </td>
              </tr>
              {/* Grand TZS row */}
              <tr className="bg-primary/10 border-t border-border font-bold [&>td]:h-8">
                <td className="sticky left-0 z-30 bg-primary/10 px-3 text-[10px] uppercase tracking-wider border-r border-border">
                  Grand TZS
                </td>
                {MONTHS.map((_, i) => {
                  const gtzs = monthTotals.tzs[i] + monthTotals.usd[i] * (usdRate || 0);
                  return (
                    <td
                      key={`gt-${i}`}
                      colSpan={2}
                      className="border-l border-border text-right pr-2 font-mono tabular-nums"
                    >
                      {fmtT(gtzs)}
                    </td>
                  );
                })}
                <td
                  colSpan={2}
                  className="sticky right-0 z-30 bg-primary/10 border-l border-border text-right pr-2 font-mono tabular-nums"
                >
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

function Cell({ value, onCommit }: { value: number; onCommit: (raw: string) => void }) {
  return (
    <Input
      type="number"
      step="0.01"
      defaultValue={value || ""}
      key={value}
      className={cn(
        "h-7 px-1.5 text-right font-mono tabular-nums text-[11px] rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:bg-background w-full",
        !value && "text-muted-foreground/40",
      )}
      onBlur={(e) => onCommit((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
