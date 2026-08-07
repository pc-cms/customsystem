/**
 * Company → Office Monthly Balance.
 *
 * Company-wide head-office grid: IN from each casino, office cage, bank,
 * office expenses, transfers back to casinos and payouts (OUT / AK).
 * All figures TZS.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CurrencyCashTable from "@/components/reports/CurrencyCashTable";
import DrillHeader from "@/components/reports/DrillHeader";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useOfficeBalanceReport, type OfficeBalanceRow } from "@/hooks/use-office-balance-report";
import { demoOfficeBalance } from "@/lib/demo-report-data";
import StartingBalanceTile, { readStartingBalance } from "@/components/reports/StartingBalanceTile";

const currentMonth = () => new Date().toISOString().slice(0, 7);

type Zone = "result" | "in" | "money" | "spend" | "balance";

/** Table row = a real business day, plus one synthetic "Start" opening row. */
type Row = OfficeBalanceRow & { kind: "day" | "start" };

const ZONE_HEAD: Record<Zone, string> = {
  result: "bg-[color-mix(in_srgb,hsl(var(--primary))_16%,hsl(var(--card)))]",
  in: "bg-[color-mix(in_srgb,hsl(var(--success))_16%,hsl(var(--card)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--warning))_16%,hsl(var(--card)))]",
  spend: "bg-[color-mix(in_srgb,hsl(var(--destructive))_14%,hsl(var(--card)))]",
  balance: "bg-muted",
};
const ZONE_BG: Record<Zone, string> = {
  result: "bg-[color-mix(in_srgb,hsl(var(--primary))_4%,hsl(var(--card)))]",
  in: "bg-[color-mix(in_srgb,hsl(var(--success))_4%,hsl(var(--card)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--warning))_4%,hsl(var(--card)))]",
  spend: "bg-[color-mix(in_srgb,hsl(var(--destructive))_4%,hsl(var(--card)))]",
  balance: "bg-[color-mix(in_srgb,hsl(var(--muted))_45%,hsl(var(--card)))]",
};

const FORMULAS: Record<string, string> = {
  in_total: "Σ collections received from every casino",
  cage_office: "Running office cash: previous + IN − Expenses − Transfer → Casino − OUT",
  bank: "Bank wallet balances at the end of the day (all casinos, TZS-valued)",
  expenses: "Office-source expenses of the day (collections excluded)",
  transfer_casino: "Money sent from the office back into the casinos",
  out_ak: "IK settlement: minus = payout out of the company, plus = money received from IK",
  balance: "Balance = Money yesterday + IN − Expenses − Transfer → Casino − OUT − Money today\nMoney = Cage + Bank. Should stay near zero.",
};

const OfficeBalanceReport = ({ demo = false }: { demo?: boolean }) => {
  const [month, setMonth] = useSessionState(demo ? "obr-demo-month" : "obr-month", currentMonth());
  const [inOpen, setInOpen] = useSessionState(demo ? "obr-demo-in-open" : "obr-in-open", false);
  const [drill, setDrill] = useState<{ row: Row; col: string; label: string; amount: number } | null>(null);
  const navigate = useNavigate();
  /** Opening money of the month (Cage + Bank) — manual, per month. */
  const startKey = `${demo ? "obr-demo" : "obr"}-start-${month}`;
  const [startBalance, setStartBalance] = useState(0);
  useEffect(() => { setStartBalance(readStartingBalance(startKey)); }, [startKey]);
  const query = useOfficeBalanceReport(month, !demo, startBalance);
  const data = demo ? demoOfficeBalance(month) : query.data;
  const startMoney = demo ? data?.start_money ?? 0 : startBalance;
  const rows = data?.rows ?? [];
  const casinos = data?.casinos ?? [];
  const stats = data?.casino_stats ?? {};

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
      balance: last?.balance ?? 0,
      byCasino: Object.fromEntries(
        casinos.map((c) => [c.id, flow((r) => r.in_by_casino[c.id] || 0)]),
      ) as Record<string, number>,
    };
  }, [rows, casinos]);

  /** "Start" opening row + the plain day rows. */
  const displayRows = useMemo<Row[]>(
    () => [
      {
        ...({} as OfficeBalanceRow),
        date: `${month}-00`,
        weekday: "",
        in_by_casino: {},
        in_total: 0,
        cage_office: startMoney,
        bank: 0,
        expenses: 0,
        transfer_casino: 0,
        out_ak: 0,
        fin_result: 0,
        money_total: startMoney,
        balance: startMoney,
        expenses_detail: [],
        in_detail: [],
        out_detail: [],
        kind: "start" as const,
      } as Row,
      ...rows.map((r) => ({ ...r, kind: "day" as const })),
    ],
    [rows, startMoney, month],
  );

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

  const cellCls = (zone: Zone, first: boolean) => (r: Row) =>
    cn(
      "py-0.5 whitespace-nowrap font-mono text-[11px] leading-tight tabular-nums",
      r.kind === "start"
        ? "border-b-4 border-b-primary/70 bg-[color-mix(in_srgb,hsl(var(--primary))_12%,hsl(var(--card)))]"
        : ZONE_BG[zone],
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

  const drillCell = (col: string, label?: string) => (r: Row, v: number) => (
    <span
      className={cn(v && "cursor-pointer underline-offset-2 hover:underline")}
      onClick={(e) => {
        if (!v) return;
        e.stopPropagation();
        setDrill({ row: r, col, label: label ?? col.toUpperCase(), amount: v });
      }}
    >
      {money(v)}
    </span>
  );

  const columns: ColumnDef<Row>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 78, minWidth: 78 },
      accessor: (r) =>
        r.kind === "start" ? (
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-foreground">
            Start
          </span>
        ) : (
          <span className="whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums">
            {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">{r.weekday}</span>
          </span>
        ),
      sortValue: (r) => r.date,
      headerClassName:
        "whitespace-nowrap border-b-4 border-b-primary/70 bg-muted text-[12px] font-extrabold uppercase tracking-wide text-foreground",
      cellClassName: (r: Row) =>
        cn(
          "py-0.5 leading-tight",
          r.kind === "start"
            ? "border-b-4 border-b-primary/70 bg-[color-mix(in_srgb,hsl(var(--primary))_12%,hsl(var(--card)))]"
            : "bg-card",
        ),
    },
    
    ...(inOpen ? casinos : []).map<ColumnDef<Row>>((c, i) => ({
      key: `in_${c.id}`,
      header: head(`IN · ${c.name}`, "in_total"),
      type: "money" as const,
      style: { minWidth: 118 },
      accessor: (r) => drillCell("in", `IN · ${c.name}`)(r, r.in_by_casino[c.id] || 0),
      sortValue: (r) => r.in_by_casino[c.id] || 0,
      headerClassName: headCls("in", i === 0),
      cellClassName: cellCls("in", i === 0),
    })),
    {
      key: "in_total",
      header: (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setInOpen(!inOpen); }}
            className="inline-flex items-center gap-1 rounded px-0.5 hover:bg-foreground/10"
            aria-label={inOpen ? "Collapse IN by casino" : "Expand IN by casino"}
          >
            {inOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            IN Total
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line text-xs">
              {FORMULAS.in_total}
            </TooltipContent>
          </Tooltip>
        </span>
      ),
      type: "money",
      style: { minWidth: 124 },
      accessor: (r) => drillCell("in", "IN Total")(r, r.in_total),
      sortValue: (r) => r.in_total,
      headerClassName: headCls("in", !inOpen),
      cellClassName: cellCls("in", !inOpen),
    },
    {
      key: "cage_office",
      header: head("Cage", "cage_office"),
      type: "money",
      style: { minWidth: 128 },
      accessor: (r) => drillCell("cage", "Cage · Office")(r, r.cage_office),
      sortValue: (r) => r.cage_office,
      headerClassName: headCls("money", true),
      cellClassName: cellCls("money", true),
    },

    {
      key: "bank",
      header: head("Bank", "bank"),
      type: "money",
      style: { minWidth: 128 },
      accessor: (r) => drillCell("bank", "Bank")(r, r.bank),
      sortValue: (r) => r.bank,
      headerClassName: headCls("money", false),
      cellClassName: cellCls("money", false),
    },
    {
      key: "expenses",
      header: head("Expenses", "expenses"),
      type: "money",
      style: { minWidth: 124 },
      accessor: (r) => (
        <span
          className={cn(r.expenses && "cursor-pointer underline-offset-2 hover:underline")}
          onClick={(e) => {
            if (!r.expenses) return;
            e.stopPropagation();
            navigate(`${demo ? "/demo" : "/reports"}/expenses-office?month=${month}&date=${r.date}`);
          }}
        >
          {money(r.expenses)}
        </span>
      ),
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
      header: head("IK (+/−)", "out_ak"),
      type: "money",
      style: { minWidth: 124 },
      accessor: (r) => {
        const v = -r.out_ak; // out = money leaving the company (−), inflow from IK (+)
        return (
          <span
            className={cn(
              "font-semibold",
              v < 0 && "cms-amount-negative",
              v > 0 && "cms-amount-positive",
              v && "cursor-pointer underline-offset-2 hover:underline",
            )}
            onClick={(e) => { if (!v) return; e.stopPropagation(); setDrill({ row: r, col: "out", label: "IK (+/−)", amount: v }); }}
          >
            {v ? formatMoneyFull(Math.round(v)) : <span className="text-muted-foreground">{demo ? "0" : "·"}</span>}
          </span>
        );
      },
      sortValue: (r) => -r.out_ak,
      headerClassName: headCls("spend", false),
      cellClassName: cellCls("spend", false),
    },
    {
      key: "balance",
      header: head("Balance", "balance"),
      type: "money",
      style: { minWidth: 130 },
      accessor: (r) => (
        <span className="font-bold">{money(r.balance)}</span>
      ),
      sortValue: (r) => r.balance,
      headerClassName: headCls("balance", true),
      cellClassName: cellCls("balance", true),
    },
  ];

  const footerRows = rows.length
    ? [
        {
          key: "total",
          className: "border-t-2 border-border bg-muted font-bold",
          cell: (col: ColumnDef<Row>) => {
            if (col.key === "date")
              return <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Total</span>;
            const k = String(col.key);
            const raw = k.startsWith("in_") && k !== "in_total"
              ? totals.byCasino[k.slice(3)] ?? 0
              : (totals as unknown as Record<string, number>)[k] ?? 0;
            const v = k === "out_ak" ? -raw : raw;
            return (
              <span className={cn(
                "whitespace-nowrap font-mono text-[11px] font-bold tabular-nums",
                v < 0 && "cms-amount-negative",
                k === "out_ak" && v > 0 && "cms-amount-positive",
              )}>
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

        {/* Row 1 — Month */}
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

        {/* Row 2 — per-casino Fin Result */}
        {casinos.length > 0 && (
          <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[...casinos].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
              const s = stats[c.id] ?? { result: 0, expenses: 0, profit: 0 };
              return (
                <div key={c.id} className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.name}</div>
                  <div className={cn("font-mono text-xl font-bold tabular-nums", s.profit < 0 ? "cms-amount-negative" : "cms-amount-positive")}>
                    {formatMoneyFull(Math.round(s.profit))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Fin Result</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Row 3 — Start / IN Total / Office Expenses / Money Total / IK */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <StartingBalanceTile
            storageKey={startKey}
            readOnly={demo}
            value={startMoney}
            hint={demo ? "Carried over from the previous month" : "Cage + Bank carried over · click to edit"}
            onChange={setStartBalance}
          />
          {([
            ["IN Total", totals.in_total, "Σ collections received from every casino"],
            ["Office Expenses", -Math.abs(totals.expenses), "Office-source expenses of the month"],
            ["Money Total", totals.cage_office + totals.bank, "Cage + Bank at the end of the month"],
            ["IK (+/−)", -totals.out_ak, "Minus = payout out, plus = received from IK"],
          ] as const).map(([label, value, hint]) => (
            <div key={label} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className={cn("font-mono text-xl font-bold tabular-nums", value < 0 ? "cms-amount-negative" : "cms-amount-positive")}>
                {formatMoneyFull(Math.round(value))}
              </div>
              <div className="text-[10px] text-muted-foreground">{hint}</div>
            </div>
          ))}
        </div>




        <PageSection card={false}>
          <div className="max-h-[72vh] overflow-auto rounded-md border border-border">
            <SmartTable
              data={displayRows}
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
              <SheetTitle asChild>
                <div>
                  {drill && (
                    <DrillHeader
                      source={drill.label}
                      date={drill.row.date}
                      amount={drill.amount}
                      signed={drill.col === "out"}
                    />
                  )}
                </div>
              </SheetTitle>
            </SheetHeader>
            {drill?.col === "cage" ? (
              <div className="mt-4">
                <CurrencyCashTable
                  rows={drill.row.cage_detail ?? []}
                  totalLabel="Total cage"
                  total={drill.row.cage_office}
                  mobile={drill.row.mobile_detail ?? {}}
                />
              </div>
            ) : drill?.col === "bank" ? (
              <div className="mt-4">
                <CurrencyCashTable
                  title="Bank by currency"
                  rows={(drill.row.bank_detail ?? []).map((b) => ({
                    currency: b.currency,
                    denomination: 1,
                    quantity: b.amount,
                    tzs: b.tzs,
                  }))}
                  totalLabel="Total bank"
                  total={drill.row.bank}
                />
              </div>
            ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-border text-xs">
              {drillRows.map((d, i) => (
                <div key={`${d.label}-${i}`} className="flex items-center justify-between border-b border-border/60 px-2 py-1.5 last:border-0">
                  <span className="truncate text-muted-foreground">{d.label}</span>
                  <span className="font-mono tabular-nums">{formatMoneyFull(Math.round(d.value))}</span>
                </div>
              ))}
              {!drillRows.length && <div className="px-2 py-4 text-center text-muted-foreground">No entries</div>}
              </div>
            </div>
            )}

          </SheetContent>
        </Sheet>
      </PageShell>
    </TooltipProvider>
  );
};

export default OfficeBalanceReport;
