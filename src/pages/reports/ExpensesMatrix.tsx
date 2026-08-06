/**
 * Reports → Expenses by category.
 *
 * Categories (rows, alphabetical) × days of the selected month (columns).
 * Opened from the Expenses column of Casino Monthly Balance. All figures TZS.
 */
import { useMemo, useState } from "react";
import { Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCasino } from "@/lib/casino-context";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useExpensesMatrix, type ExpenseCategoryRow, type ExpenseScope } from "@/hooks/use-expenses-matrix";
import { demoExpensesMatrix } from "@/lib/demo-report-data";

const currentMonth = () => new Date().toISOString().slice(0, 7);

const SCOPE_TITLE: Record<ExpenseScope, string> = {
  all: "Expenses by Category",
  casino: "Expenses · Casino",
  office: "Expenses · Office",
};

const ExpensesMatrixPage = ({
  scope = "all",
  demo = false,
}: { scope?: ExpenseScope; demo?: boolean }) => {
  const { activeCasino } = useCasino();
  const [month, setMonth] = useSessionState(`exp-matrix-month${demo ? "-demo" : ""}`, currentMonth());
  const [cell, setCell] = useState<{ code: string; label: string; day: string | null } | null>(null);
  const query = useExpensesMatrix(month, scope, !demo);
  const data = demo ? demoExpensesMatrix(month, scope === "office" ? "office" : "casino") : query.data;
  const isLoading = !demo && query.isLoading;


  const rows = data?.rows ?? [];
  const days = data?.days ?? [];

  const stepMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  };

  /** Max spend in a single cell — drives the heat fill intensity. */
  const heatMax = useMemo(
    () => Math.max(1, ...rows.flatMap((r) => Object.values(r.byDay).map((v) => Math.abs(v)))),
    [rows],
  );

  const HEAT = [
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_10%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_20%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_32%,hsl(var(--card)))]",
  ];
  const heatClass = (v: number) => {
    if (!v) return undefined;
    const ratio = Math.abs(v) / heatMax;
    return HEAT[ratio > 0.66 ? 2 : ratio > 0.33 ? 1 : 0];
  };

  const money = (n: number) =>
    !n
      ? <span className="text-muted-foreground/50">·</span>
      : <span className="font-semibold text-foreground">{formatMoneyFull(Math.round(n))}</span>;

  const columns: ColumnDef<ExpenseCategoryRow>[] = [
    {
      key: "label",
      header: "Category",
      style: { width: 200, minWidth: 200 },
      accessor: (r) => (
        <div className="truncate whitespace-nowrap text-[11px] font-semibold text-foreground" title={r.label}>
          {r.label}
        </div>
      ),
      sortValue: (r) => r.label,
      cellClassName: () => "py-0.5 leading-tight bg-card",
      headerClassName:
        "whitespace-nowrap border-b-2 border-border bg-muted font-bold uppercase tracking-wide text-foreground",
    },
    ...days.map<ColumnDef<ExpenseCategoryRow>>((d) => ({
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
              setCell({ code: r.code, label: r.label, day: d });
            }}
          >
            {money(v)}
          </span>
        );
      },
      sortValue: (r) => r.byDay[d] || 0,
      headerClassName:
        "whitespace-nowrap border-l border-border border-b-2 font-bold text-foreground bg-muted",
      cellClassName: (r: ExpenseCategoryRow) =>
        cn(
          "py-0.5 whitespace-nowrap border-l border-border/60 font-mono text-[11px] leading-tight tabular-nums",
          heatClass(r.byDay[d] || 0) ?? "bg-card",
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
            setCell({ code: r.code, label: r.label, day: null });
          }}
        >
          {money(r.total)}
        </span>
      ),
      sortValue: (r) => r.total,
      headerClassName:
        "whitespace-nowrap border-l-2 border-border border-b-2 font-bold uppercase tracking-wide text-foreground bg-muted",
      cellClassName: () =>
        "py-0.5 whitespace-nowrap border-l-2 border-border bg-[color-mix(in_srgb,hsl(var(--muted))_55%,hsl(var(--card)))] font-mono text-[11px] font-bold leading-tight tabular-nums",
    },
  ];


  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  const footerRows = rows.length
    ? [
        {
          key: "total",
          className: "font-bold border-t-2 border-border bg-muted",
          cell: (col: ColumnDef<ExpenseCategoryRow>) => {
            if (col.key === "label")
              return (
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                  Total
                </span>
              );
            const v =
              col.key === "total"
                ? grandTotal
                : rows.reduce((s, r) => s + (r.byDay[col.key as string] || 0), 0);
            return (
              <span
                className={cn(
                  "whitespace-nowrap font-mono text-[11px] font-bold tabular-nums",
                  col.key === "total" && "text-primary",
                )}
              >
                {v ? formatMoneyFull(Math.round(v)) : "·"}
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
    if (cell.day) return data.items[`${cell.code}|${cell.day}`] ?? [];
    return days
      .flatMap((d) => data.items[`${cell.code}|${d}`] ?? [])
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cell, data, days]);

  const cellTotal = cellItems.reduce((s, it) => s + it.amount, 0);

  return (
    <PageShell>
      <PageHeader
        icon={Receipt}
        title="Expenses by Category"
        subtitle="Category × day matrix for the selected month — all figures in TZS"
        context={activeCasino?.name}
      >
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {rows.length} categories · {formatMoneyFull(Math.round(grandTotal))}
        </span>
      </PageHeader>

      <div className="mb-3 flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stepMonth(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1">
          <span className="min-w-[130px] text-center text-sm font-semibold tracking-wide">{monthLabel}</span>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="h-7 w-[136px] text-xs"
          />
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stepMonth(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <PageSection card={false}>
        <div className="max-h-[74vh] overflow-auto rounded-md border border-border">
          <SmartTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.code}
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
            <SheetTitle className="flex items-baseline justify-between gap-3">
              <span>{cell ? `${cell.label} · ${cell.day ? fmtDate(cell.day) : monthLabel}` : ""}</span>
              <span className="font-mono text-sm tabular-nums">{formatMoneyFull(Math.round(cellTotal))}</span>
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              {cellItems.length} {cellItems.length === 1 ? "entry" : "entries"} ·{" "}
              {cell?.day ? "day total" : "month total"}
            </p>
          </SheetHeader>
          <div className="mt-4 rounded-md border border-border">
            {cellItems.map((it) => (
              <div key={it.id} className="border-b border-border/60 px-2 py-1.5 text-xs last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {!cell?.day && (
                      <span className="mr-2 font-mono text-[10px] text-muted-foreground">{fmtDate(it.date)}</span>
                    )}
                    {it.description || "—"}
                  </span>
                  <span className="font-mono tabular-nums">{formatMoneyFull(Math.round(it.amount))}</span>
                </div>
                {it.wallet && <div className="text-[10px] text-muted-foreground">{it.wallet}</div>}
              </div>
            ))}
            {!cellItems.length && (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">No entries</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
};

export default ExpensesMatrixPage;
