/**
 * Company → Daily Balance (Office Monthly Balance).
 *
 * Company-wide daily ledger: gaming Result, Diff, the three money pots
 * (Cage Casino / Cage Office / Bank), Expenses, internal transfers and
 * collections (OUT / IN). Every money cell drills down to the wallets it is
 * made of. All figures TZS.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DrillHeader from "@/components/reports/DrillHeader";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoneyFull } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import {
  useOfficeBalanceReport,
  type DrillLine,
  type OfficeBalanceRow,
} from "@/hooks/use-office-balance-report";
import { demoOfficeBalance } from "@/lib/demo-report-data";
import StartBalanceDialog from "@/components/reports/StartBalanceDialog";
import { useAuth } from "@/lib/auth-context";

const currentMonth = () => new Date().toISOString().slice(0, 7);

type Zone = "result" | "money" | "spend" | "balance";

/** Table row = a real business day, plus one synthetic "Start" opening row. */
type Row = OfficeBalanceRow & { kind: "day" | "start" };

const ZONE_HEAD: Record<Zone, string> = {
  result: "bg-[color-mix(in_srgb,hsl(var(--primary))_16%,hsl(var(--card)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--warning))_16%,hsl(var(--card)))]",
  spend: "bg-[color-mix(in_srgb,hsl(var(--destructive))_14%,hsl(var(--card)))]",
  balance: "bg-muted",
};
const ZONE_BG: Record<Zone, string> = {
  result: "bg-[color-mix(in_srgb,hsl(var(--primary))_4%,hsl(var(--card)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--warning))_4%,hsl(var(--card)))]",
  spend: "bg-[color-mix(in_srgb,hsl(var(--destructive))_4%,hsl(var(--card)))]",
  balance: "bg-[color-mix(in_srgb,hsl(var(--muted))_45%,hsl(var(--card)))]",
};

const FORMULAS: Record<string, string> = {
  result: "Tables + Slots (net of card balance) + Bar + JP of every casino",
  diff: "Miss chips + players card balance of the day",
  cage_casino: "Live cage + Slots cage at closing, per casino (money only, chips excluded)",
  cage_office: "Wallets flagged as Office — currency safes and mobile money",
  bank: "Bank wallets at the end of the day (all casinos, TZS-valued)",
  expenses: "Operating expenses of the day (collections excluded)",
  transfer_casino: "Office → Casino transfers. Internal move — not part of the Balance formula",
  collections_net: "Collections: minus = money paid out of the company, plus = money returned",
  money_total: "Cage Casino + Cage Office + Bank at the end of the day",
  balance:
    "Balance = Money yesterday + Result ± Diff − Expenses − OUT/IN − Money today\nShould stay at zero.",
};

const OfficeBalanceReport = ({ demo = false }: { demo?: boolean }) => {
  const [month, setMonth] = useSessionState(demo ? "obr-demo-month" : "obr-month", currentMonth());
  const [drill, setDrill] = useState<
    { row: Row; col: string; label: string; amount: number; lines: DrillLine[] } | null
  >(null);
  const [startOpen, setStartOpen] = useState(false);
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canEditStart =
    !demo && roles.some((r) => ["super_admin", "finance_manager"].includes(r));

  const query = useOfficeBalanceReport(month, !demo);
  const data = demo ? demoOfficeBalance(month) : query.data;
  const startMoney = data?.start_money ?? 0;
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
      result: flow((r) => r.result),
      diff: flow((r) => r.diff),
      expenses: flow((r) => r.expenses),
      transfer_casino: flow((r) => r.transfer_casino),
      collections_net: flow((r) => r.collections_net),
      fin_result: flow((r) => r.fin_result),
      cage_casino: last?.cage_casino ?? 0,
      cage_office: last?.cage_office ?? 0,
      bank: last?.bank ?? 0,
      money_total: last?.money_total ?? 0,
      balance: last?.balance ?? 0,
    };
  }, [rows]);

  /** "Start" opening row + the plain day rows. */
  const displayRows = useMemo<Row[]>(() => {
    const start = data?.start;
    const empty: DrillLine[] = [];
    return [
      {
        date: `${month}-00`,
        weekday: "",
        status: "recorded",
        result: 0,
        diff: 0,
        cage_casino: start?.cage_casino ?? 0,
        cage_office: start?.cage_office ?? 0,
        bank: start?.bank ?? 0,
        expenses: 0,
        transfer_casino: 0,
        collections_net: 0,
        money_total: startMoney,
        balance: 0,
        fin_result: 0,
        cage_casino_detail: empty,
        cage_office_detail: empty,
        bank_detail: empty,
        result_detail: empty,
        diff_detail: empty,
        expenses_detail: empty,
        transfer_detail: empty,
        collections_detail: empty,
        kind: "start" as const,
      },
      ...rows.map((r) => ({ ...r, kind: "day" as const })),
    ];
  }, [rows, startMoney, month, data?.start]);

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

  /** Every money cell opens the same drill panel, fed by its own lines. */
  const drillCell =
    (col: string, label: string, pick: (r: Row) => DrillLine[], signed = false) =>
    (r: Row, v: number) => (
      <span
        className={cn(
          v && "cursor-pointer underline-offset-2 hover:underline",
          signed && v < 0 && "cms-amount-negative",
          signed && v > 0 && "cms-amount-positive",
          signed && "font-semibold",
        )}
        onClick={(e) => {
          if (!v) return;
          e.stopPropagation();
          setDrill({ row: r, col, label, amount: v, lines: pick(r) });
        }}
      >
        {signed
          ? v ? formatMoneyFull(Math.round(v)) : <span className="text-muted-foreground">{demo ? "0" : "·"}</span>
          : money(v)}
      </span>
    );

  const columns: ColumnDef<Row>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 92, minWidth: 92 },
      accessor: (r) =>
        r.kind === "start" ? (
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-foreground">
            Start
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums">
            {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
            <span className="text-[10px] font-normal text-muted-foreground">{r.weekday}</span>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                r.status === "recorded" ? "bg-success" : "bg-warning",
              )}
              title={r.status === "recorded" ? "Recorded" : "Pending — wallets not recorded yet"}
            />
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
    {
      key: "result",
      header: head("Result", "result"),
      type: "money",
      style: { minWidth: 124 },
      accessor: (r) => drillCell("result", "Result", (x) => x.result_detail)(r, r.result),
      sortValue: (r) => r.result,
      headerClassName: headCls("result", true),
      cellClassName: cellCls("result", true),
    },
    {
      key: "diff",
      header: head("Diff", "diff"),
      type: "money",
      style: { minWidth: 110 },
      accessor: (r) => drillCell("diff", "Diff", (x) => x.diff_detail, true)(r, r.diff),
      sortValue: (r) => r.diff,
      headerClassName: headCls("result", false),
      cellClassName: cellCls("result", false),
    },
    {
      key: "cage_casino",
      header: head("Cage Casino", "cage_casino"),
      type: "money",
      style: { minWidth: 132 },
      accessor: (r) =>
        drillCell("cage_casino", "Cage Casino", (x) => x.cage_casino_detail)(r, r.cage_casino),
      sortValue: (r) => r.cage_casino,
      headerClassName: headCls("money", true),
      cellClassName: cellCls("money", true),
    },
    {
      key: "cage_office",
      header: head("Cage Office", "cage_office"),
      type: "money",
      style: { minWidth: 128 },
      accessor: (r) =>
        drillCell("cage_office", "Cage Office", (x) => x.cage_office_detail)(r, r.cage_office),
      sortValue: (r) => r.cage_office,
      headerClassName: headCls("money", false),
      cellClassName: cellCls("money", false),
    },
    {
      key: "bank",
      header: head("Bank", "bank"),
      type: "money",
      style: { minWidth: 128 },
      accessor: (r) => drillCell("bank", "Bank", (x) => x.bank_detail)(r, r.bank),
      sortValue: (r) => r.bank,
      headerClassName: headCls("money", false),
      cellClassName: cellCls("money", false),
    },
    {
      key: "money_total",
      header: head("Money Total", "money_total"),
      type: "money",
      style: { minWidth: 134 },
      accessor: (r) => (
        <span className="font-semibold">{money(r.money_total)}</span>
      ),
      sortValue: (r) => r.money_total,
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
      style: { minWidth: 140 },
      accessor: (r) =>
        drillCell("transfer", "Transfer → Casino", (x) => x.transfer_detail)(r, r.transfer_casino),
      sortValue: (r) => r.transfer_casino,
      headerClassName: headCls("spend", false),
      cellClassName: cellCls("spend", false),
    },
    {
      key: "collections_net",
      header: head("OUT / IN", "collections_net"),
      type: "money",
      style: { minWidth: 128 },
      // Positive collections = money OUT of the company → shown as minus.
      accessor: (r) =>
        drillCell("collections", "OUT / IN", (x) => x.collections_detail, true)(r, -r.collections_net),
      sortValue: (r) => -r.collections_net,
      headerClassName: headCls("spend", false),
      cellClassName: cellCls("spend", false),
    },
    {
      key: "balance",
      header: head("Balance", "balance"),
      type: "money",
      style: { minWidth: 130 },
      accessor: (r) => <span className="font-bold">{money(r.balance)}</span>,
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
            const raw = (totals as unknown as Record<string, number>)[k] ?? 0;
            const v = k === "collections_net" ? -raw : k === "balance" ? totals.balance : raw;
            return (
              <span
                className={cn(
                  "whitespace-nowrap font-mono text-[11px] font-bold tabular-nums",
                  v < 0 && "cms-amount-negative",
                  k === "collections_net" && v > 0 && "cms-amount-positive",
                )}
              >
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

  return (
    <TooltipProvider delayDuration={100}>
      <PageShell>
        <PageHeader
          icon={Building2}
          title="Company Daily Balance"
          subtitle="Company-wide ledger — result, money in cage / office / bank, expenses and collections (TZS)"
        >
          {demo && <Badge variant="outline" className="mr-2">DEMO DATA</Badge>}
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {rows.length} days · {casinos.length} casinos
          </span>
          {canEditStart && (
            <Button variant="outline" size="sm" className="ml-2" onClick={() => setStartOpen(true)}>
              Edit Start
            </Button>
          )}
        </PageHeader>

        {canEditStart && (
          <StartBalanceDialog open={startOpen} onOpenChange={setStartOpen} start={data?.start} />
        )}


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

        {/* Row 3 — Start / Result / Expenses / Money Total / OUT-IN */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {([
            ["Start", startMoney, "Money carried over from the previous month"],
            ["Result", totals.result + totals.diff, "Gaming result ± diff of the month"],
            ["Expenses", -Math.abs(totals.expenses), "Operating expenses of the month"],
            ["Money Total", totals.money_total, "Cage Casino + Office + Bank at the end of the month"],
            ["OUT / IN", -totals.collections_net, "Minus = paid out of the company, plus = returned"],
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
                      signed={drill.col === "collections" || drill.col === "diff"}
                    />
                  )}
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 text-xs">
              <DrillTable
                rows={(drill?.lines ?? []).map((d) => ({
                  label: d.sub ? `${d.label} (${d.sub})` : d.label,
                  units: d.value,
                  rate: 1,
                  tzs: d.value,
                }))}
                total={drill?.amount}
                emptyText="No entries"
              />
            </div>
          </SheetContent>
        </Sheet>
      </PageShell>
    </TooltipProvider>
  );
};

export default OfficeBalanceReport;
