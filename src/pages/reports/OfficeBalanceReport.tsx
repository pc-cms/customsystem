/**
 * Company → Office Monthly Balance.
 *
 * Company-wide head-office grid: IN from each casino, office cage, bank,
 * office expenses, transfers back to casinos and payouts (OUT / AK).
 * All figures TZS.
 */
import { useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useOfficeBalanceReport, type OfficeBalanceRow } from "@/hooks/use-office-balance-report";
import { demoOfficeBalance } from "@/lib/demo-report-data";

const currentMonth = () => new Date().toISOString().slice(0, 7);

type Zone = "result" | "in" | "money" | "spend";

const ZONE_HEAD: Record<Zone, string> = {
  result: "bg-[color-mix(in_srgb,hsl(var(--primary))_16%,hsl(var(--card)))]",
  in: "bg-[color-mix(in_srgb,hsl(var(--success))_16%,hsl(var(--card)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--warning))_16%,hsl(var(--card)))]",
  spend: "bg-[color-mix(in_srgb,hsl(var(--destructive))_14%,hsl(var(--card)))]",
};
const ZONE_BG: Record<Zone, string> = {
  result: "bg-[color-mix(in_srgb,hsl(var(--primary))_4%,hsl(var(--card)))]",
  in: "bg-[color-mix(in_srgb,hsl(var(--success))_4%,hsl(var(--card)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--warning))_4%,hsl(var(--card)))]",
  spend: "bg-[color-mix(in_srgb,hsl(var(--destructive))_4%,hsl(var(--card)))]",
};

const FORMULAS: Record<string, string> = {
  fin_result: "Fin Result = IN (all casinos) − Office expenses − OUT",
  in_total: "Σ collections received from every casino",
  cage_office: "Running office cash: previous + IN − Expenses − Transfer → Casino − OUT",
  bank: "Bank wallet balances at the end of the day (all casinos, TZS-valued)",
  expenses: "Office-source expenses of the day (collections excluded)",
  transfer_casino: "Money sent from the office back into the casinos",
  out_ak: "Payouts out of the company (owner / IK)",
};

const OfficeBalanceReport = ({ demo = false }: { demo?: boolean }) => {
  const [month, setMonth] = useSessionState(demo ? "obr-demo-month" : "obr-month", currentMonth());
  const [drill, setDrill] = useState<{ row: OfficeBalanceRow; col: string } | null>(null);
  const query = useOfficeBalanceReport(month, !demo);
  const data = demo ? demoOfficeBalance(month) : query.data;
  const rows = data?.rows ?? [];
  const casinos = data?.casinos ?? [];
  const stats = data?.casino_stats ?? {};
  const casinoProfit = casinos.reduce((s, c) => s + (stats[c.id]?.profit ?? 0), 0);

  const stepMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  };

  const totals = useMemo(() => {
    const flow = (fn: (r: OfficeBalanceRow) => number) => rows.reduce((s, r) => s + fn(r), 0);
    const last = rows.length ? rows[rows.length - 1] : null;
    return {
      in_total: flow((r) => r.in_total),
      expenses: flow((r) => r.expenses),
      transfer_casino: flow((r) => r.transfer_casino),
      out_ak: flow((r) => r.out_ak),
      fin_result: flow((r) => r.fin_result),
      cage_office: last?.cage_office ?? 0,
      bank: last?.bank ?? 0,
      byCasino: Object.fromEntries(
        casinos.map((c) => [c.id, flow((r) => r.in_by_casino[c.id] || 0)]),
      ) as Record<string, number>,
    };
  }, [rows, casinos]);

  const money = (n: number) =>
    !n ? <span className="text-muted-foreground">{demo ? "0" : "·"}</span> : (
      <span className={n < 0 ? "cms-amount-negative" : undefined}>{formatMoneyFull(Math.round(n))}</span>
    );

  const headCls = (zone: Zone, first: boolean) =>
    cn(
      "whitespace-nowrap border-b-4 border-b-primary/70 text-[12px] font-extrabold uppercase tracking-wide text-foreground",
      ZONE_HEAD[zone],
      first ? "border-l-2 border-l-border" : "border-l border-l-border/60",
    );

  const cellCls = (zone: Zone, first: boolean) => () =>
    cn(
      "py-0.5 whitespace-nowrap font-mono text-[11px] leading-tight tabular-nums",
      ZONE_BG[zone],
      first ? "border-l-2 border-l-border" : "border-l border-l-border/40",
    );

  const head = (label: string, key: string) => (
    <span className="inline-flex items-center gap-1">
      {label}
      {FORMULAS[key] && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line text-xs">
            {FORMULAS[key]}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );

  const drillCell = (col: string) => (r: OfficeBalanceRow, v: number) => (
    <span
      className={cn(v && "cursor-pointer underline-offset-2 hover:underline")}
      onClick={(e) => { if (!v) return; e.stopPropagation(); setDrill({ row: r, col }); }}
    >
      {money(v)}
    </span>
  );

  const columns: ColumnDef<OfficeBalanceRow>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 78, minWidth: 78 },
      accessor: (r) => (
        <span className="whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums">
          {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{r.weekday}</span>
        </span>
      ),
      sortValue: (r) => r.date,
      headerClassName:
        "whitespace-nowrap border-b-4 border-b-primary/70 bg-muted text-[12px] font-extrabold uppercase tracking-wide text-foreground",
      cellClassName: () => "py-0.5 leading-tight bg-card",
    },
    
    ...casinos.map<ColumnDef<OfficeBalanceRow>>((c, i) => ({
      key: `in_${c.id}`,
      header: head(`IN · ${c.name}`, "in_total"),
      type: "money" as const,
      style: { minWidth: 118 },
      accessor: (r) => drillCell("in")(r, r.in_by_casino[c.id] || 0),
      sortValue: (r) => r.in_by_casino[c.id] || 0,
      headerClassName: headCls("in", i === 0),
      cellClassName: cellCls("in", i === 0),
    })),
    {
      key: "in_total",
      header: head("IN Total", "in_total"),
      type: "money",
      style: { minWidth: 124 },
      accessor: (r) => drillCell("in")(r, r.in_total),
      sortValue: (r) => r.in_total,
      headerClassName: headCls("in", false),
      cellClassName: cellCls("in", false),
    },
    {
      key: "cage_office",
      header: head("Cage Office", "cage_office"),
      type: "money",
      style: { minWidth: 128 },
      accessor: (r) => (r.cage_detail?.length ? drillCell("cage")(r, r.cage_office) : money(r.cage_office)),
      sortValue: (r) => r.cage_office,
      headerClassName: headCls("money", true),
      cellClassName: cellCls("money", true),
    },

    {
      key: "bank",
      header: head("Bank", "bank"),
      type: "money",
      style: { minWidth: 128 },
      accessor: (r) => money(r.bank),
      sortValue: (r) => r.bank,
      headerClassName: headCls("money", false),
      cellClassName: cellCls("money", false),
    },
    {
      key: "expenses",
      header: head("Expenses", "expenses"),
      type: "money",
      style: { minWidth: 124 },
      accessor: (r) => drillCell("expenses")(r, r.expenses),
      sortValue: (r) => r.expenses,
      headerClassName: headCls("spend", true),
      cellClassName: cellCls("spend", true),
    },
    {
      key: "transfer_casino",
      header: head("Transfer → Casino", "transfer_casino"),
      type: "money",
      style: { minWidth: 136 },
      accessor: (r) => money(r.transfer_casino),
      sortValue: (r) => r.transfer_casino,
      headerClassName: headCls("spend", false),
      cellClassName: cellCls("spend", false),
    },
    {
      key: "out_ak",
      header: head("OUT · IK", "out_ak"),
      type: "money",
      style: { minWidth: 124 },
      accessor: (r) => drillCell("out")(r, r.out_ak),
      sortValue: (r) => r.out_ak,
      headerClassName: headCls("spend", false),
      cellClassName: cellCls("spend", false),
    },

  ];

  const footerRows = rows.length
    ? [
        {
          key: "total",
          className: "border-t-2 border-border bg-muted font-bold",
          cell: (col: ColumnDef<OfficeBalanceRow>) => {
            if (col.key === "date")
              return <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Total</span>;
            const k = String(col.key);
            const v = k.startsWith("in_") && k !== "in_total"
              ? totals.byCasino[k.slice(3)] ?? 0
              : (totals as unknown as Record<string, number>)[k] ?? 0;
            return (
              <span className={cn("whitespace-nowrap font-mono text-[11px] font-bold tabular-nums", v < 0 && "cms-amount-negative")}>
                {v ? formatMoneyFull(Math.round(v)) : demo ? "0" : "·"}
              </span>
            );
          },
        },
      ]
    : undefined;

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  const drillRows =
    drill?.col === "expenses" ? drill.row.expenses_detail
      : drill?.col === "in" ? drill.row.in_detail
        : drill?.col === "out" ? drill.row.out_detail
          : [];

  return (
    <TooltipProvider delayDuration={100}>
      <PageShell>
        <PageHeader
          icon={Building2}
          title="Office Monthly Balance"
          subtitle="Company-wide head office grid — IN per casino, cage, bank, expenses, payouts (TZS)"
        >
          {demo && <Badge variant="outline" className="mr-2">DEMO DATA</Badge>}
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {rows.length} days · {casinos.length} casinos
          </span>
        </PageHeader>

        <div className="mb-3 flex flex-wrap items-stretch justify-center gap-2">
          {/* Profit Company — Σ casino profit − office expenses */}
          <div className="flex min-w-[200px] flex-col justify-center rounded-md border-2 border-primary/50 bg-[color-mix(in_srgb,hsl(var(--primary))_8%,hsl(var(--card)))] px-3 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Profit Company
            </div>
            <div className={cn("font-mono text-xl font-bold tabular-nums", profitCompany < 0 ? "cms-amount-negative" : "cms-amount-positive")}>
              {formatMoneyFull(Math.round(profitCompany))}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Σ profit of {casinos.length} casinos − office expenses
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Month</span>
              <span className="min-w-[130px] text-center text-sm font-semibold tracking-wide">{monthLabel}</span>
            </div>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonth())}
              className="h-7 w-[136px] text-xs"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {([
            ["Fin Result", totals.fin_result],
            ["IN Total", totals.in_total],
            ["Cage Office", totals.cage_office],
            ["Bank", totals.bank],
            ["OUT · IK", -Math.abs(totals.out_ak)],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className={cn("font-mono text-lg tabular-nums", value < 0 ? "cms-amount-negative" : "cms-amount-positive")}>
                {formatMoneyFull(Math.round(value))}
              </div>
            </div>
          ))}
        </div>

        {/* Per-casino month P&L */}
        {casinos.length > 0 && (
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {casinos.map((c) => {
              const s = stats[c.id] ?? { result: 0, expenses: 0, profit: 0 };
              return (
                <div key={c.id} className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-foreground">{c.name}</div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {([
                      ["Result", s.result],
                      ["Expenses", -Math.abs(s.expenses)],
                      ["Profit", s.profit],
                    ] as const).map(([label, value]) => (
                      <div key={label}>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
                        <div className={cn("font-mono text-[13px] font-semibold tabular-nums", value < 0 ? "cms-amount-negative" : "cms-amount-positive")}>
                          {formatMoneyFull(Math.round(value))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}


        <PageSection card={false}>
          <div className="max-h-[72vh] overflow-auto rounded-md border border-border">
            <SmartTable
              data={rows}
              columns={columns}
              rowKey={(r) => r.date}
              loading={!demo && query.isLoading}
              stickyColumns={[0]}
              stickyHeader
              footerRows={footerRows}
              bare
              scroll={false}
              virtualize={false}
              empty={<div className="py-10 text-center text-sm text-muted-foreground">No data for this month</div>}
            />
          </div>
        </PageSection>

        <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{drill ? `${drill.col.toUpperCase()} · ${fmtDate(drill.row.date)}` : ""}</SheetTitle>
            </SheetHeader>
            {drill?.col === "cage" ? (
              <div className="mt-4 overflow-hidden rounded-md border border-border text-xs">
                <div className="grid grid-cols-4 gap-1 border-b border-border bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Cur</span>
                  <span className="text-right">Denom</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">TZS</span>
                </div>
                {(drill.row.cage_detail ?? []).map((d, i) => (
                  <div key={`${d.currency}-${d.denomination}-${i}`} className="grid grid-cols-4 gap-1 border-b border-border/60 px-2 py-1 font-mono tabular-nums last:border-0">
                    <span className="text-muted-foreground">{d.currency}</span>
                    <span className="text-right">{formatMoneyFull(d.denomination)}</span>
                    <span className="text-right">{d.quantity || 0}</span>
                    <span className="text-right">{formatMoneyFull(Math.round(d.tzs))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border bg-muted/40 px-2 py-1 font-semibold">
                  <span>Total cage</span>
                  <span className="font-mono tabular-nums">{formatMoneyFull(Math.round(drill.row.cage_office))}</span>
                </div>
              </div>
            ) : (
            <div className="mt-4 rounded-md border border-border text-xs">
              {drillRows.map((d, i) => (
                <div key={`${d.label}-${i}`} className="flex items-center justify-between border-b border-border/60 px-2 py-1.5 last:border-0">
                  <span className="truncate text-muted-foreground">{d.label}</span>
                  <span className="font-mono tabular-nums">{formatMoneyFull(Math.round(d.value))}</span>
                </div>
              ))}
              {!drillRows.length && <div className="px-2 py-4 text-center text-muted-foreground">No entries</div>}
            </div>
            )}

          </SheetContent>
        </Sheet>
      </PageShell>
    </TooltipProvider>
  );
};

export default OfficeBalanceReport;
