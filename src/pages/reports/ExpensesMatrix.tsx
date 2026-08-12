/**
 * Reports → Expenses by category.
 *
 * Rows are the 17 fixed MAIN categories (+ Unallocated) × days of the selected
 * month. Each main row expands into its subcategories (fin_categories).
 * Opened from the Expenses column of Casino Monthly Balance. All figures TZS.
 */
import { useMemo, useState, useEffect } from "react";
import { Receipt, ChevronLeft, ChevronRight, ChevronDown, ChevronRightIcon } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCasino } from "@/lib/casino-context";
import { useSearchParams } from "react-router-dom";
import { useSessionState } from "@/hooks/use-session-state";
import DrillHeader from "@/components/reports/DrillHeader";
import DrillTable from "@/components/reports/DrillTable";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useExpensesMatrix, type ExpenseScope } from "@/hooks/use-expenses-matrix";
import { demoExpensesMatrix } from "@/lib/demo-report-data";

const currentMonth = () => new Date().toISOString().slice(0, 7);

const SCOPE_TITLE: Record<ExpenseScope, string> = {
  all: "Expenses by Category",
  casino: "Expenses · Casino",
  office: "Expenses · Office",
};

/** One rendered line: a main category or one of its subcategories. */
type Row = {
  key: string;
  kind: "main" | "sub";
  /** Underlying category codes behind the line (main = all its subs). */
  codes: string[];
  label: string;
  byDay: Record<string, number>;
  total: number;
  mainCode: string;
  subCount: number;
};

const ExpensesMatrixPage = ({
  scope = "all",
  demo = false,
}: { scope?: ExpenseScope; demo?: boolean }) => {
  const { activeCasino } = useCasino();
  const [month, setMonth] = useSessionState(`exp-matrix-month${demo ? "-demo" : ""}`, currentMonth());
  const [cell, setCell] = useState<{ codes: string[]; label: string; day: string | null } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [params] = useSearchParams();
  /** Day highlighted when arriving from another report (?month=&date=). */
  const focusDay = params.get("date");
  const paramMonth = params.get("month");
  useEffect(() => {
    if (paramMonth && paramMonth !== month) setMonth(paramMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramMonth]);
  const query = useExpensesMatrix(month, scope, !demo);
  const data = demo ? demoExpensesMatrix(month, scope === "office" ? "office" : "casino") : query.data;
  const isLoading = !demo && query.isLoading;

  const days = data?.days ?? [];

  /** Main rows in fixed order, each followed by its subcategories when open. */
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const out: Row[] = [];
    for (const m of data.mains) {
      const subs = data.rows.filter((r) => (r.mainCode || "unallocated") === m.code);
      const byDay: Record<string, number> = {};
      let total = 0;
      subs.forEach((s) => {
        total += s.total;
        Object.entries(s.byDay).forEach(([d, v]) => { byDay[d] = (byDay[d] || 0) + v; });
      });
      out.push({
        key: `main:${m.code}`,
        kind: "main",
        codes: subs.map((s) => s.code),
        label: m.label,
        byDay,
        total,
        mainCode: m.code,
        subCount: subs.length,
      });
      if (open[m.code]) {
        subs.forEach((s) =>
          out.push({
            key: `sub:${s.code}`,
            kind: "sub",
            codes: [s.code],
            label: s.label,
            byDay: s.byDay,
            total: s.total,
            mainCode: m.code,
            subCount: 0,
          }),
        );
      }
    }
    return out;
  }, [data, open]);

  const stepMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  };

  /** Max spend in a single MAIN cell — drives the heat fill intensity. */
  const heatMax = useMemo(
    () =>
      Math.max(
        1,
        ...rows.filter((r) => r.kind === "main").flatMap((r) => Object.values(r.byDay).map((v) => Math.abs(v))),
      ),
    [rows],
  );

  const HEAT = [
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_10%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_20%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_32%,hsl(var(--card)))]",
  ];
  const heatClass = (v: number, kind: Row["kind"]) => {
    if (!v || kind !== "main") return undefined;
    const ratio = Math.abs(v) / heatMax;
    return HEAT[ratio > 0.66 ? 2 : ratio > 0.33 ? 1 : 0];
  };

  const money = (n: number, bold: boolean) =>
    !n
      ? <span className="text-muted-foreground/50">0</span>
      : <span className={cn(bold ? "font-bold text-foreground" : "font-medium text-foreground/90")}>
          {formatMoneyFull(Math.round(n))}
        </span>;

  const columns: ColumnDef<Row>[] = [
    {
      key: "label",
      header: "Category",
      style: { width: 220, minWidth: 220 },
      accessor: (r) =>
        r.kind === "main" ? (
          <button
            type="button"
            className="flex w-full items-center gap-1 truncate whitespace-nowrap text-left text-[11px] font-extrabold uppercase tracking-wide text-foreground"
            onClick={() => setOpen((o) => ({ ...o, [r.mainCode]: !o[r.mainCode] }))}
            title={r.label}
          >
            {open[r.mainCode]
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
              : <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
            <span className="truncate">{r.label}</span>
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">{r.subCount}</span>
          </button>
        ) : (
          <div className="truncate whitespace-nowrap pl-5 text-[11px] text-muted-foreground" title={r.label}>
            {r.label}
          </div>
        ),
      cellClassName: (r) =>
        cn("py-0.5 leading-tight", r.kind === "main" ? "bg-muted/40" : "bg-card"),
      headerClassName:
        "whitespace-nowrap border-b-2 border-border bg-muted text-[12px] font-extrabold uppercase tracking-wide text-foreground",
    },
    ...days.map<ColumnDef<Row>>((d) => ({
      key: d,
      header: d.slice(8),
      type: "money" as const,
      style: { minWidth: 92 },
      accessor: (r) => {
        const v = r.byDay[d] || 0;
        return (
          <span
            className={cn(v && "cursor-pointer underline-offset-2 hover:underline")}
            onClick={(e) => {
              if (!v) return;
              e.stopPropagation();
              setCell({ codes: r.codes, label: r.label, day: d });
            }}
          >
            {money(v, r.kind === "main")}
          </span>
        );
      },
      headerClassName: cn(
        "whitespace-nowrap border-l border-border border-b-2 text-[12px] font-extrabold text-foreground bg-muted",
        focusDay === d && "ring-2 ring-inset ring-primary",
      ),
      cellClassName: (r: Row) =>
        cn(
          "py-0.5 whitespace-nowrap border-l border-border/60 font-mono text-[11px] leading-tight tabular-nums",
          heatClass(r.byDay[d] || 0, r.kind) ?? (r.kind === "main" ? "bg-muted/40" : "bg-card"),
          focusDay === d && "ring-1 ring-inset ring-primary/50",
        ),
    })),
    {
      key: "total",
      header: "Total",
      type: "money",
      style: { minWidth: 104 },
      accessor: (r) => (
        <span
          className={cn(r.total && "cursor-pointer underline-offset-2 hover:underline")}
          onClick={(e) => {
            if (!r.total) return;
            e.stopPropagation();
            setCell({ codes: r.codes, label: r.label, day: null });
          }}
        >
          {money(r.total, r.kind === "main")}
        </span>
      ),
      headerClassName:
        "whitespace-nowrap border-l-2 border-border border-b-2 text-[12px] font-extrabold uppercase tracking-wide text-foreground bg-muted",
      cellClassName: () =>
        "py-0.5 whitespace-nowrap border-l-2 border-border bg-[color-mix(in_srgb,hsl(var(--muted))_55%,hsl(var(--card)))] font-mono text-[11px] font-bold leading-tight tabular-nums",
    },
  ];

  const mainRows = rows.filter((r) => r.kind === "main");
  const grandTotal = mainRows.reduce((s, r) => s + r.total, 0);

  const footerRows = rows.length
    ? [
        {
          key: "total",
          className: "font-bold border-t-2 border-border bg-muted",
          cell: (col: ColumnDef<Row>) => {
            if (col.key === "label")
              return (
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                  Total
                </span>
              );
            const v =
              col.key === "total"
                ? grandTotal
                : mainRows.reduce((s, r) => s + (r.byDay[col.key as string] || 0), 0);
            return (
              <span
                className={cn(
                  "whitespace-nowrap font-mono text-[11px] font-bold tabular-nums",
                  col.key === "total" && "text-primary",
                )}
              >
                {v ? formatMoneyFull(Math.round(v)) : "0"}
              </span>
            );
          },
        },
      ]
    : undefined;

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  /** Sheet contents: one day, or the whole month when the Total cell was clicked. */
  const cellItems = useMemo(() => {
    if (!cell || !data) return [];
    const pick = (d: string) => cell.codes.flatMap((c) => data.items[`${c}|${d}`] ?? []);
    if (cell.day) return pick(cell.day);
    return days.flatMap(pick).sort((a, b) => a.date.localeCompare(b.date));
  }, [cell, data, days]);

  const cellTotal = cellItems.reduce((s, it) => s + it.amount, 0);

  return (
    <PageShell>
      <PageHeader
        icon={Receipt}
        title={SCOPE_TITLE[scope]}
        subtitle={
          scope === "office"
            ? "Head-office expenses — main category × day matrix, all figures in TZS"
            : scope === "casino"
              ? "Casino floor expenses (Live + Slots) — main category × day matrix, TZS"
              : "Main category × day matrix for the selected month — all figures in TZS"
        }
        context={demo ? "Demo" : activeCasino?.name}
      >
        {demo && <Badge variant="outline" className="mr-2">DEMO DATA</Badge>}
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {mainRows.length} categories · {formatMoneyFull(Math.round(grandTotal))}
        </span>
      </PageHeader>

      <div className="mb-2 flex items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepMonth(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Month</span>
          <span className="min-w-[130px] text-center text-sm font-semibold tracking-wide">{monthLabel}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepMonth(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <PageSection card={false}>
        <div className="max-h-[74vh] overflow-auto rounded-md border border-border">
          <SmartTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.key}
            loading={isLoading}
            stickyColumns={[0]}
            stickyHeader
            footerRows={footerRows}
            bare
            scroll={false}
            virtualize={false}
            empty={<div className="py-10 text-center text-sm text-muted-foreground">No expenses this month</div>}
          />
        </div>
      </PageSection>

      <Sheet open={!!cell} onOpenChange={(o) => !o && setCell(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle asChild>
              <div>
                {cell && (
                  <DrillHeader
                    source={cell.label}
                    date={cell.day ?? `${month}-01`}
                    amount={cellTotal}
                  />
                )}
              </div>
            </SheetTitle>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {cell?.day ? "day total" : `month total · ${monthLabel}`}
            </div>
          </SheetHeader>
          <div className="mt-4 text-xs">
            <DrillTable
              rows={cellItems.map((it) => ({
                label: [
                  !cell?.day ? fmtDate(it.date) : null,
                  it.description || "—",
                  it.wallet || null,
                ].filter(Boolean).join(" · "),
                units: it.amount,
                rate: 1,
                tzs: it.amount,
              }))}
              total={cellTotal}
              emptyText="No entries"
            />
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
};

export default ExpensesMatrixPage;
