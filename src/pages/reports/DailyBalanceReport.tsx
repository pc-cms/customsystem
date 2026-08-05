/**
 * Reports → Daily Balance Sheet.
 *
 * Recreates the legacy "БАЛАНС" monthly spreadsheet: one row per business date,
 * grouped column blocks (two-level header), weekly subtotal rows and sticky
 * Total / Average footer rows. All figures in TZS.
 *
 * Column model: every section shows ONE headline "total" column when collapsed;
 * clicking the group header reveals its component columns.
 */
import { useMemo, useState } from "react";
import { Wallet2, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartTable, type ColumnDef, type SortState } from "@/components/ui/smart-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCasino } from "@/lib/casino-context";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { formulaText } from "@/lib/monthly-balance-formulas";
import {
  useDailyBalanceReport, useSetCreditDeposit, useSetBankBalance, type DailyBalanceRow,
} from "@/hooks/use-daily-balance-report";

type SectionKey = "incomes" | "expenses" | "transfers" | "money" | "balances";

const num = (r: DailyBalanceRow, k: keyof DailyBalanceRow) => Number(r[k] || 0);

type Col = {
  id: string;
  label: string;
  /** Section headline (always visible). */
  total?: boolean;
  /** Component column — visible only when the section is expanded. */
  detail?: boolean;
  value: (r: DailyBalanceRow) => number;
};

/** Numeric FLOW fields — summed across week / month rows. */
const BASE_KEYS: (keyof DailyBalanceRow)[] = [
  "casino_result", "tables_result", "slots_result", "live_cash_result", "slots_diff",
  "chip_difference", "transfer_cage_manager", "transfer_bank",
  "expenses", "bank_expenses", "money_in", "money_out",
  "day_total", "cash_desk_result", "day_balance", "collection_bank",
];

/** SNAPSHOT fields — end-of-day stock values, never summed (last value wins). */
const SNAPSHOT_KEYS: (keyof DailyBalanceRow)[] = [
  "cage_casino", "cage_manager", "bank_tzs", "bank_usd", "money_total", "balance",
];

const SECTIONS: { key: SectionKey; label: string; cols: Col[] }[] = [
  {
    key: "incomes",
    label: "Casino result",
    cols: [
      { id: "result", label: "Result", total: true, value: (r) => num(r, "casino_result") },
      { id: "live_cash_result", label: "Live", value: (r) => num(r, "live_cash_result") },
      { id: "tables_result", label: "Table", value: (r) => num(r, "tables_result") },
      { id: "chip_difference", label: "Chip Diff", value: (r) => num(r, "chip_difference") },
      { id: "slots_diff", label: "Slots Diff", value: (r) => num(r, "slots_diff") },
    ],
  },
  {
    key: "transfers",
    label: "Cage & transfers",
    cols: [
      { id: "cage_casino", label: "Cage Casino", total: true, value: (r) => num(r, "cage_casino") },
      { id: "transfer_cage_manager", label: "Transfer → Manager", value: (r) => num(r, "transfer_cage_manager") },
      { id: "cage_manager", label: "Cage Manager", total: true, value: (r) => num(r, "cage_manager") },
      { id: "transfer_bank", label: "Transfer → Bank", value: (r) => num(r, "transfer_bank") },
    ],
  },
  {
    key: "money",
    label: "Bank",
    cols: [
      { id: "bank_tzs", label: "Bank TZS", value: (r) => num(r, "bank_tzs") },
      { id: "bank_usd", label: "Bank USD", value: (r) => num(r, "bank_usd") },
    ],
  },
  {
    key: "expenses",
    label: "Flows",
    cols: [
      { id: "expenses", label: "Expenses", total: true, value: (r) => num(r, "expenses") },
      { id: "money_in", label: "IN", value: (r) => num(r, "money_in") },
      { id: "money_out", label: "OUT", value: (r) => num(r, "money_out") },
    ],
  },
  {
    key: "balances",
    label: "Balance",
    cols: [
      { id: "money_total", label: "Money", total: true, value: (r) => num(r, "money_total") },
      { id: "balance", label: "Balance", total: true, value: (r) => num(r, "balance") },
    ],
  },
];

const ALL_COLS: (Col & { section: SectionKey })[] = SECTIONS.flatMap((s) =>
  s.cols.map((c) => ({ ...c, section: s.key })),
);


/** Every money column gets a per-column heat fill (scaled inside its own column). */
const HEAT_IDS = new Set(ALL_COLS.map((c) => c.id));


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
      className="h-6 w-24 px-1 text-right font-mono text-xs tabular-nums"
    />
  );
};

/** Manual bank balance (TZS or USD) — inline editor, saved per day on blur. */
const BankCell = ({
  date, value, field, manual,
}: { date: string; value: number; field: "bank_account" | "bank_account_usd"; manual: boolean }) => {
  const save = useSetBankBalance();
  const [draft, setDraft] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const rounded = Math.round(value);
  const shown = editing ? draft : rounded ? String(rounded) : "";
  return (
    <Input
      value={shown}
      placeholder={rounded ? undefined : "·"}
      inputMode="numeric"
      title={manual ? "Manual entry" : "Computed from wallets — type to override"}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => { setEditing(true); setDraft(rounded ? String(rounded) : ""); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.-]/g, ""))}
      onBlur={() => {
        setEditing(false);
        const v = Number(draft || 0);
        if (Number.isFinite(v) && v !== rounded) save.mutate({ date, field, value: v });
      }}
      className={cn(
        "h-6 w-28 px-1 text-right font-mono text-xs tabular-nums",
        !manual && "border-dashed text-muted-foreground",
      )}
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
  const [heatmap, setHeatmap] = useSessionState("dbr-heatmap", true);
  /** Fixed display options — toolbar reduced to Heatmap + Columns only. */
  const moneyMode = "compact" as const;
  const weeks = true;
  const [sort, setSort] = useState<SortState | null>({ key: "date", dir: "asc" });
  const [detail, setDetail] = useState<DailyBalanceRow | null>(null);

  const { from, to } = monthBounds(month);
  const { data: rows = [], isLoading } = useDailyBalanceReport(from, to);

  const toggleExpand = (g: SectionKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  /** Sum of every source field across the month — feeds Total / Average rows. */
  const grandRow = useMemo(() => {
    const acc = {} as DailyBalanceRow;
    for (const k of BASE_KEYS) {
      (acc as unknown as Record<string, number>)[k as string] = rows.reduce((s, r) => s + num(r, k), 0);
    }
    // Snapshot (stock) columns take the last day of the period, never a sum.
    const last = rows.length ? rows[rows.length - 1] : null;
    for (const k of SNAPSHOT_KEYS) {
      (acc as unknown as Record<string, number>)[k as string] = last ? num(last, k) : 0;
    }
    return acc;
  }, [rows]);


  const daysWithData = useMemo(() => rows.filter((r) => r.hasSystemData || r.legacy).length, [rows]);

  /** Last business date that has live system data — highlighted with a yellow stripe. */
  const lastClosedRow = useMemo(() => {
    const withData = rows.filter((r) => r.hasSystemData).sort((a, b) => a.date.localeCompare(b.date));
    return withData.length ? withData[withData.length - 1] : null;
  }, [rows]);
  const lastClosedDate = lastClosedRow?.date ?? null;

  /** Columns whose every value is 0 across the month (candidates for hiding). */
  const emptyCols = useMemo(() => {
    const s = new Set<string>();
    for (const c of ALL_COLS) {
      if (c.total || c.id === "credit_deposit") continue;
      if (rows.every((r) => !Math.round(c.value(r)))) s.add(c.id);
    }
    return s;
  }, [rows]);

  /**
   * Visible columns: section headlines always; component columns only for
   * expanded sections. "Hide empty" never applies inside an expanded section —
   * expanding must always reveal the full breakdown.
   */
  const visibleMoneyCols = useMemo(
    () =>
      ALL_COLS.filter((c) => {
        if (!c.detail) return !(hideEmpty && emptyCols.has(c.id));
        return expanded.has(c.section);
      }),
    [hideEmpty, emptyCols, expanded],
  );

  /** Max abs value per heat column — drives the fill intensity. */
  const heatMax = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of ALL_COLS) {
      if (!HEAT_IDS.has(c.id)) continue;
      m[c.id] = Math.max(1, ...rows.map((r) => Math.abs(c.value(r))));
    }
    return m;
  }, [rows]);

  // NOTE: all cell tints must be OPAQUE — sticky (frozen) columns would
  // otherwise let scrolling cells bleed through. We blend against --card
  // with color-mix instead of using alpha. Classes are static literals so
  // Tailwind's JIT scanner picks them up.
  const HEAT_POS = [
    "bg-[color-mix(in_srgb,hsl(var(--success))_6%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--success))_11%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--success))_18%,hsl(var(--card)))]",
  ];
  const HEAT_NEG = [
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_6%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_11%,hsl(var(--card)))]",
    "bg-[color-mix(in_srgb,hsl(var(--destructive))_18%,hsl(var(--card)))]",
  ];

  const heatClass = (col: Col, v: number) => {
    if (!heatmap || !HEAT_IDS.has(col.id) || !v) return undefined;
    const ratio = Math.abs(v) / (heatMax[col.id] || 1);
    const step = ratio > 0.66 ? 2 : ratio > 0.33 ? 1 : 0;
    return (v > 0 ? HEAT_POS : HEAT_NEG)[step];
  };

  /**
   * Single background layer per row — prevents stacked translucent fills.
   * Priority: week > last closed day > today > weekend > (cell heat).
   */
  const rowBg = (r: Row): string | undefined => {
    if (r.kind === "week") return "bg-muted";
    if (r.date === lastClosedDate)
      return "bg-[color-mix(in_srgb,hsl(var(--warning))_14%,hsl(var(--card)))]";
    if (r.date === today())
      return "bg-[color-mix(in_srgb,hsl(var(--primary))_10%,hsl(var(--card)))]";
    if (r.weekday === "Sat" || r.weekday === "Sun")
      return "bg-[color-mix(in_srgb,hsl(var(--muted))_40%,hsl(var(--card)))]";
    return undefined;
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
      for (const k of BASE_KEYS) {
        (agg as unknown as Record<string, number>)[k as string] = bucket.reduce(
          (s, r) => s + num(r, k),
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

  /** Two-level header groups: leading Date column + one entry per visible section. */
  const groupHeader = useMemo(() => {
    const groups: {
      key: string; label?: string; span: number; expandable?: boolean;
      expanded?: boolean; hiddenCount?: number; onToggle?: () => void; sticky?: number;
    }[] = [{ key: "date", label: "Day", span: 1, sticky: 0 }];
    for (const s of SECTIONS) {
      const span = visibleMoneyCols.filter((c) => c.section === s.key).length;
      if (!span) continue;
      groups.push({
        key: s.key,
        label: s.label,
        span,
        expandable: true,
        expanded: expanded.has(s.key),
        hiddenCount: s.cols.filter((c) => c.detail).length,
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
      style: { width: 132, minWidth: 132 },
      accessor: (r) =>
        r.kind === "week" ? (
          <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {r.label}
          </span>
        ) : (
          <span className="whitespace-nowrap">
            <span className={cn("font-mono tabular-nums", r.date === today() && "font-semibold text-primary")}>
              {fmtDate(r.date)}
            </span>{" "}
            <span className="text-[11px] text-muted-foreground">{r.weekday}</span>
            {r.legacy && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">imp</Badge>}
          </span>
        ),
      sortValue: (r) => r.date,
      cellClassName: (r: Row) => cn("py-1", rowBg(r), r.kind === "week" && "font-semibold"),
    },
    ...visibleMoneyCols.map<ColumnDef<Row>>((c, i) => {
      const first = i === 0 || visibleMoneyCols[i - 1].section !== c.section;
      return {
        key: c.id,
        header: c.label,
        type: "money" as const,
        style: i === 0 ? { width: 120, minWidth: 120 } : undefined,
        accessor: (r) =>
          c.id === "credit_deposit" && r.kind === "day" ? (
            <CreditCell date={r.date} value={num(r, "credit_deposit")} />
          ) : (
            money(Math.round(c.value(r)))
          ),
        sortValue: (r) => c.value(r),
        headerClassName: cn(
          "whitespace-nowrap",
          first && "border-l border-border",
          c.total ? "font-semibold text-foreground" : "font-normal text-muted-foreground",
        ),
        cellClassName: (r: Row) =>
          cn(
            "py-1 font-mono tabular-nums",
            first && "border-l border-border",
            c.total ? "font-semibold" : "text-muted-foreground",
            r.kind === "week" && "font-semibold",
            rowBg(r) ?? (r.kind === "day" ? heatClass(c, Math.round(c.value(r))) : undefined),
          ),
      };
    }),
  ];

  const footerRows = rows.length
    ? [
        {
          key: "total",
          className: "font-semibold",
          cell: (col: ColumnDef<Row>) => {
            if (col.key === "date")
              return <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total</span>;
            const c = ALL_COLS.find((x) => x.id === col.key);
            const v = c ? Math.round(c.value(grandRow)) : 0;
            return (
              <span className={cn("font-mono tabular-nums", v < 0 && "cms-amount-negative")}>
                {formatMoney(v, moneyMode)}
              </span>
            );
          },
        },
        {
          key: "avg",
          className: "text-muted-foreground",
          cell: (col: ColumnDef<Row>) => {
            if (col.key === "date")
              return <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Average / day</span>;
            const c = ALL_COLS.find((x) => x.id === col.key);
            const v = c ? Math.round(c.value(grandRow) / (daysWithData || 1)) : 0;
            return <span className="font-mono tabular-nums">{formatMoney(v, moneyMode)}</span>;
          },
        },
      ]
    : undefined;

  return (
    <PageShell>
      <PageHeader
        icon={Wallet2}
        title="Casino Monthly Balance"
        subtitle="Result · Cage · Bank · Money — rebuilt from live data, all figures in TZS"
        context={activeCasino?.name}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {daysWithData} days · {visibleMoneyCols.length} columns
          </span>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="h-8 w-[150px] text-xs"
          />
        </div>
      </PageHeader>

      {/* KPI tiles */}
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Result (month)" value={num(grandRow, "casino_result")} />
        <Tile label="Expenses (month)" value={-num(grandRow, "expenses")} />
        <Tile label="IN − OUT (month)" value={num(grandRow, "money_in") - num(grandRow, "money_out")} />
        <Tile
          label="Cage Casino"
          value={Number(lastClosedRow?.cage_casino || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
        <Tile
          label="Cage Manager"
          value={Number(lastClosedRow?.cage_manager || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
        <Tile
          label="Balance"
          value={Number(lastClosedRow?.balance || 0)}

          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
      </div>

      <PageSection card={false}>
        <div className="relative pt-10">
          <Toggle
            size="sm"
            pressed={hideEmpty}
            onPressedChange={() => setHideEmpty(!hideEmpty)}
            title={hideEmpty ? "Show all columns" : "Hide empty columns"}
            className="absolute top-0 left-0 z-20 h-8 gap-1 px-2 text-xs"
          >
            <Columns3 className="h-3.5 w-3.5" />
            {hideEmpty ? "Show columns" : "Hide empty"}
          </Toggle>
          <Toggle
            size="sm"
            pressed={heatmap}
            onPressedChange={() => setHeatmap(!heatmap)}
            title="Toggle heatmap"
            className="absolute top-0 right-0 z-20 h-8 gap-1 px-2 text-xs"
          >
            <Flame className="h-3.5 w-3.5" />
            Heatmap
          </Toggle>
          <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
          <SmartTable
            data={displayRows}
            columns={columns}
            rowKey={(r) => `${r.kind}:${r.date}`}
            sort={sort}
            onSortChange={setSort}
            loading={isLoading}
            stickyColumns={[0, 132]}
            groupHeader={groupHeader}
            footerRows={footerRows}
            onRowClick={(r) => r.kind === "day" && setDetail(r)}
            bare
            virtualize={false}
            // No zebra: with 20+ columns the stripes fight the row highlights.
            className="[&_tbody_tr:nth-child(odd)]:bg-transparent"
            empty={<div className="py-10 text-center text-sm text-muted-foreground">No data for this month</div>}
          />
          </div>
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
                      const v = Math.round(c.value(detail));
                      return (
                        <div
                          key={c.id}
                          className={cn(
                            "flex items-center justify-between border-b border-border/60 px-2 py-1 text-xs last:border-0",
                            c.total && "bg-muted/40 font-semibold",
                          )}
                        >
                          <span className={c.total ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
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
