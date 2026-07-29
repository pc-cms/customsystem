/**
 * Reports → Daily Balance Sheet.
 *
 * Recreates the legacy "БАЛАНС" monthly spreadsheet: one row per business date,
 * grouped column blocks (two-level header), weekly subtotal rows and sticky
 * Total / Average footer rows. All figures in TZS.
 */
import { useMemo, useState } from "react";
import { Wallet2, ChevronDown, ChevronRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef, type SortState } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCasino } from "@/lib/casino-context";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoney, formatMoneyFull, type MoneyDisplayMode } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useDailyBalanceReport, useSetCreditDeposit, type DailyBalanceRow } from "@/hooks/use-daily-balance-report";

type SectionKey = "incomes" | "expenses" | "transfers" | "money" | "balances";

type Col = { key: keyof DailyBalanceRow; label: string; detail?: boolean };

/**
 * Column layout by business meaning. Each section shows its headline columns;
 * `detail` columns appear only when the section is expanded.
 */
const SECTIONS: { key: SectionKey; label: string; cols: Col[] }[] = [
  {
    key: "incomes",
    label: "Incomes",
    cols: [
      { key: "casino_result", label: "Result" },
      { key: "tables_result", label: "Live", detail: true },
      { key: "slots_result", label: "Slots (net)", detail: true },
      { key: "bar_result", label: "Bar", detail: true },
      { key: "credit_deposit", label: "Credit / Deposit" },
    ],
  },
  {
    key: "expenses",
    label: "Expenses",
    cols: [
      { key: "expenses", label: "Expenses" },
      { key: "bank_expenses", label: "Bank Expenses", detail: true },
    ],
  },
  {
    key: "transfers",
    label: "Transfers",
    cols: [
      { key: "collection_bank", label: "Collection → Bank" },
      { key: "office_transfer", label: "Int. Transfer" },
      { key: "office_in", label: "Office In", detail: true },
      { key: "office_out", label: "Office Out", detail: true },
    ],
  },
  {
    key: "money",
    label: "Money",
    cols: [
      { key: "cage_cash", label: "Cage Cash" },
      { key: "office_cash", label: "Office Safe" },
      { key: "bank_account", label: "Bank Account" },
      { key: "bank_terminal", label: "Terminal (net)", detail: true },
      { key: "bank_fee", label: "Fee 3%", detail: true },
    ],
  },
  {
    key: "balances",
    label: "Balances",
    cols: [
      { key: "day_total", label: "Day Total" },
      { key: "cash_desk_result", label: "Cash Desk" },
      { key: "day_balance", label: "Day Balance" },
      { key: "chip_difference", label: "Chip Diff", detail: true },
      { key: "tips_tables", label: "Tips Tables", detail: true },
      { key: "tips_slots", label: "Tips Slots", detail: true },
    ],
  },
];

const ALL_COLS: (Col & { section: SectionKey })[] = SECTIONS.flatMap((s) =>
  s.cols.map((c) => ({ ...c, section: s.key })),
);

/** Columns that get the heat fill. */
const HEAT_KEYS = new Set(["casino_result", "day_total", "day_balance", "cash_desk_result"]);

const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const from = `${m}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from, to: `${m}-${String(last).padStart(2, "0")}` };
};

const today = () => new Date().toISOString().slice(0, 10);

/** Table row = a real business day or an injected weekly subtotal. */
type Row = DailyBalanceRow & { kind: "day" | "week"; label?: string };

/** Manual Credit / Deposit entry — saved per day on blur. */
const CreditCell = ({ date, value }: { date: string; value: number }) => {
  const save = useSetCreditDeposit();
  const [draft, setDraft] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : value ? String(Math.round(value)) : "";
  return (
    <Input
      value={shown}
      placeholder="·"
      inputMode="numeric"
      onClick={(e) => e.stopPropagation()}
      onFocus={() => { setEditing(true); setDraft(value ? String(Math.round(value)) : ""); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.-]/g, ""))}
      onBlur={() => {
        setEditing(false);
        const v = Number(draft || 0);
        if (Number.isFinite(v) && v !== Math.round(value)) save.mutate({ date, value: v });
      }}
      className="h-6 w-24 px-1 text-right text-xs tabular-nums"
    />
  );
};

/** Compact KPI tile. */
const Tile = ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
  <div className="rounded-md border border-border bg-card px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div
      className={cn(
        "font-mono text-lg tabular-nums",
        value < 0 ? "cms-amount-negative" : "cms-amount-positive",
      )}
    >
      {formatMoneyFull(Math.round(value))}
    </div>
    {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
  </div>
);

const DailyBalanceReport = () => {
  const { activeCasino } = useCasino();
  const [month, setMonth] = useSessionState("dbr-month", currentMonth());
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  const [hideEmpty, setHideEmpty] = useSessionState("dbr-hide-empty", true);
  const [moneyMode, setMoneyMode] = useSessionState<MoneyDisplayMode>("dbr-money", "compact");
  const [heatmap, setHeatmap] = useSessionState("dbr-heatmap", true);
  const [weeks, setWeeks] = useSessionState("dbr-weeks", true);
  const [sort, setSort] = useState<SortState | null>({ key: "date", dir: "asc" });
  const [detail, setDetail] = useState<DailyBalanceRow | null>(null);

  const { from, to } = monthBounds(month);
  const { data: rows = [], isLoading } = useDailyBalanceReport(from, to);

  const detailSections = SECTIONS.filter((s) => s.cols.some((c) => c.detail));
  const allExpanded = detailSections.every((s) => expanded.has(s.key));

  const toggleExpand = (g: SectionKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  const toggleAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(detailSections.map((s) => s.key)));

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of ALL_COLS) acc[c.key as string] = rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
    return acc;
  }, [rows]);

  const daysWithData = useMemo(() => rows.filter((r) => r.hasSystemData || r.legacy).length, [rows]);

  const averages = useMemo(() => {
    const acc: Record<string, number> = {};
    const d = daysWithData || 1;
    for (const c of ALL_COLS) acc[c.key as string] = Number(totals[c.key as string] || 0) / d;
    return acc;
  }, [totals, daysWithData]);

  /** Last business date that has live system data — highlighted with a yellow stripe. */
  const lastClosedRow = useMemo(() => {
    const withData = rows.filter((r) => r.hasSystemData).sort((a, b) => a.date.localeCompare(b.date));
    return withData.length ? withData[withData.length - 1] : null;
  }, [rows]);
  const lastClosedDate = lastClosedRow?.date ?? null;

  /** Always-visible columns (manual entry / day formulas). */
  const ALWAYS = new Set(["credit_deposit", "day_total", "day_balance", "casino_result"]);

  /** Columns whose every value is 0 across the month (candidates for hiding). */
  const emptyCols = useMemo(() => {
    const s = new Set<string>();
    for (const c of ALL_COLS) {
      if (ALWAYS.has(c.key as string)) continue;
      if (rows.every((r) => !Number(r[c.key]))) s.add(c.key as string);
    }
    return s;
  }, [rows]);

  const visibleMoneyCols = ALL_COLS.filter(
    (c) => (!c.detail || expanded.has(c.section)) && !(hideEmpty && emptyCols.has(c.key as string)),
  );

  /** Max abs value per heat column — drives the fill intensity. */
  const heatMax = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of HEAT_KEYS) m[k] = Math.max(1, ...rows.map((r) => Math.abs(Number(r[k as keyof DailyBalanceRow] || 0))));
    return m;
  }, [rows]);

  const heatClass = (key: string, v: number) => {
    if (!heatmap || !HEAT_KEYS.has(key) || !v) return undefined;
    const ratio = Math.abs(v) / (heatMax[key] || 1);
    const step = ratio > 0.66 ? 3 : ratio > 0.33 ? 2 : 1;
    if (v > 0)
      return step === 3
        ? "bg-[hsl(var(--success)/0.18)]"
        : step === 2
          ? "bg-[hsl(var(--success)/0.11)]"
          : "bg-[hsl(var(--success)/0.06)]";
    return step === 3
      ? "bg-[hsl(var(--destructive)/0.18)]"
      : step === 2
        ? "bg-[hsl(var(--destructive)/0.11)]"
        : "bg-[hsl(var(--destructive)/0.06)]";
  };

  /** ISO-ish week bucket for grouping (weeks end on Sunday). */
  const displayRows = useMemo<Row[]>(() => {
    const base: Row[] = rows.map((r) => ({ ...r, kind: "day" as const }));
    const byDate = sort?.key === "date" || !sort;
    if (!weeks || !byDate || base.length === 0) return base;
    const asc = [...base].sort((a, b) => a.date.localeCompare(b.date));
    const out: Row[] = [];
    let bucket: Row[] = [];
    let n = 1;
    const flush = () => {
      if (!bucket.length) return;
      const agg = { ...bucket[bucket.length - 1] } as Row;
      for (const c of ALL_COLS) {
        (agg as unknown as Record<string, number>)[c.key as string] = bucket.reduce(
          (s, r) => s + Number(r[c.key] || 0),
          0,
        );
      }
      agg.kind = "week";
      agg.label = `Week ${n}`;
      agg.date = `${bucket[bucket.length - 1].date}~w`;
      out.push(agg);
      n += 1;
      bucket = [];
    };
    for (const r of asc) {
      out.push(r);
      bucket.push(r);
      if (r.weekday === "Sun") flush();
    }
    flush();
    return sort?.dir === "desc" ? [...out].reverse() : out;
  }, [rows, weeks, sort]);

  const money = (n: number) =>
    !n ? <span className="text-muted-foreground">·</span> : (
      <span className={n < 0 ? "cms-amount-negative" : undefined}>{formatMoney(n, moneyMode)}</span>
    );

  const sectionOf = (k: SectionKey) => SECTIONS.find((s) => s.key === k)!;

  /** Two-level header groups: leading Date column + one entry per visible section. */
  const groupHeader = useMemo(() => {
    const groups: {
      key: string; label?: string; span: number; expandable?: boolean;
      expanded?: boolean; hiddenCount?: number; onToggle?: () => void;
    }[] = [{ key: "date", label: "Day", span: 1 }];
    for (const s of SECTIONS) {
      const span = visibleMoneyCols.filter((c) => c.section === s.key).length;
      if (!span) continue;
      const hiddenCount = s.cols.filter(
        (c) => c.detail && !visibleMoneyCols.some((v) => v.key === c.key),
      ).length;
      const hasDetail = s.cols.some((c) => c.detail);
      groups.push({
        key: s.key,
        label: s.label,
        span,
        expandable: hasDetail,
        expanded: expanded.has(s.key),
        hiddenCount,
        onToggle: () => toggleExpand(s.key),
      });
    }
    return groups;
  }, [visibleMoneyCols, expanded]);

  const columns: ColumnDef<Row>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 128, minWidth: 128 },
      accessor: (r) =>
        r.kind === "week" ? (
          <span className="whitespace-nowrap font-semibold uppercase tracking-wide text-[11px] text-muted-foreground">
            {r.label}
          </span>
        ) : (
          <span className="whitespace-nowrap">
            <span className={r.date === today() ? "font-semibold text-primary" : undefined}>
              {fmtDate(r.date)}
            </span>{" "}
            <span className="text-muted-foreground text-[11px]">{r.weekday}</span>
            {r.legacy && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">imp</Badge>}
          </span>
        ),
      sortValue: (r) => r.date,
    },
    ...visibleMoneyCols.map<ColumnDef<Row>>((c, i) => {
      const first = i === 0 || visibleMoneyCols[i - 1].section !== c.section;
      const isKey = c.key === "day_total" || c.key === "day_balance";
      return {
        key: c.key as string,
        header: c.label,
        type: "money" as const,
        style: i === 0 ? { width: 116, minWidth: 116 } : undefined,
        accessor: (r) =>
          c.key === "credit_deposit" && r.kind === "day" ? (
            <CreditCell date={r.date} value={Number(r.credit_deposit || 0)} />
          ) : (
            money(Math.round(Number(r[c.key] || 0)))
          ),
        sortValue: (r) => Number(r[c.key] || 0),
        headerClassName: cn(
          "whitespace-nowrap",
          first && "border-l border-border",
          isKey && "font-semibold text-foreground",
        ),
        cellClassName: (r: Row) =>
          cn(
            "tabular-nums",
            first && "border-l border-border",
            isKey && "font-semibold",
            r.kind === "day" && heatClass(c.key as string, Math.round(Number(r[c.key] || 0))),
          ),
      };
    }),
  ];

  const footerRows = rows.length
    ? [
        {
          key: "total",
          className: "font-semibold",
          cell: (col: ColumnDef<Row>) =>
            col.key === "date" ? (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
            ) : (
              <span className={Number(totals[col.key]) < 0 ? "cms-amount-negative" : undefined}>
                {formatMoney(Math.round(Number(totals[col.key] || 0)), moneyMode)}
              </span>
            ),
        },
        {
          key: "avg",
          className: "text-muted-foreground",
          cell: (col: ColumnDef<Row>) =>
            col.key === "date" ? (
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Average / day</span>
            ) : (
              <span>{formatMoney(Math.round(Number(averages[col.key] || 0)), moneyMode)}</span>
            ),
        },
      ]
    : undefined;

  return (
    <PageShell>
      <PageHeader
        icon={Wallet2}
        title="Daily Balance Sheet"
        subtitle="Legacy balance layout rebuilt from live data — all figures in TZS"
        context={activeCasino?.name}
      />

      {/* KPI tiles */}
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Result (month)" value={Number(totals.casino_result || 0)} />
        <Tile
          label="Expenses (month)"
          value={-(Number(totals.expenses || 0) + Number(totals.bank_expenses || 0))}
        />
        <Tile label="Day Balance (month)" value={Number(totals.day_balance || 0)} />
        <Tile
          label="Cage Cash"
          value={Number(lastClosedRow?.cage_cash || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
        <Tile
          label="Office Safe"
          value={Number(lastClosedRow?.office_cash || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
        <Tile
          label="Bank Account"
          value={Number(lastClosedRow?.bank_account || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
      </div>

      <FilterBar
        search={
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="h-8 w-[150px] text-xs"
          />
        }
        filters={[
          <Button key="expand-all" variant="outline" size="sm" className="h-8 text-xs" onClick={toggleAll}>
            {allExpanded ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>,
          <Toggle key="hide-empty" size="sm" pressed={hideEmpty} onPressedChange={() => setHideEmpty(!hideEmpty)} className="h-8 px-2 text-xs">
            Hide empty
          </Toggle>,
          <Toggle key="compact" size="sm" pressed={moneyMode === "compact"} onPressedChange={() => setMoneyMode(moneyMode === "compact" ? "full" : "compact")} className="h-8 px-2 text-xs">
            Short numbers
          </Toggle>,
          <Toggle key="heat" size="sm" pressed={heatmap} onPressedChange={() => setHeatmap(!heatmap)} className="h-8 px-2 text-xs">
            Heatmap
          </Toggle>,
          <Toggle key="weeks" size="sm" pressed={weeks} onPressedChange={() => setWeeks(!weeks)} className="h-8 px-2 text-xs">
            Weekly totals
          </Toggle>,
        ]}
        right={
          <div className="text-xs text-muted-foreground">
            {daysWithData} days with data · {visibleMoneyCols.length} columns
          </div>
        }
      />

      <PageSection card={false}>
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
          <SmartTable
            data={displayRows}
            columns={columns}
            rowKey={(r) => `${r.kind}:${r.date}`}
            sort={sort}
            onSortChange={setSort}
            loading={isLoading}
            stickyColumns={[0, 128]}
            groupHeader={groupHeader}
            footerRows={footerRows}
            onRowClick={(r) => r.kind === "day" && setDetail(r)}
            bare
            virtualize={false}
            rowClassName={(r) =>
              cn(
                r.kind === "week" && "bg-muted/60 font-semibold [&_td]:bg-muted/60",
                r.kind === "day" && (r.weekday === "Sat" || r.weekday === "Sun") && "bg-muted/30",
                r.kind === "day" && r.legacy && "bg-muted/20",
                r.kind === "day" && r.date === lastClosedDate &&
                  "bg-[hsl(var(--warning)/0.12)] border-l-2 border-l-[hsl(var(--warning))]",
                r.kind === "day" && r.date === today() && "ring-1 ring-inset ring-primary/40",
              )
            }
            empty={<div className="py-10 text-center text-muted-foreground text-sm">No data for this month</div>}
          />
        </div>
      </PageSection>

      {/* Day detail panel */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {detail ? `${fmtDate(detail.date)} · ${detail.weekday}` : ""}
            </SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-4">
              <div className="text-xs text-muted-foreground">
                {detail.legacy ? "Imported (legacy sheet)" : detail.hasSystemData ? "Live system data" : "No data"}
              </div>
              {SECTIONS.map((s) => (
                <div key={s.key}>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="rounded-md border border-border">
                    {s.cols.map((c) => {
                      const v = Math.round(Number(detail[c.key] || 0));
                      return (
                        <div
                          key={c.key as string}
                          className="flex items-center justify-between border-b border-border/60 px-2 py-1 text-xs last:border-0"
                        >
                          <span className="text-muted-foreground">{c.label}</span>
                          <span className={cn("font-mono tabular-nums", v < 0 && "cms-amount-negative")}>
                            {v ? formatMoneyFull(v) : "·"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
};

export default DailyBalanceReport;
