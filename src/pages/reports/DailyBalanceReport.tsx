/**
 * Reports → Daily Balance Sheet.
 *
 * Recreates the legacy "БАЛАНС" monthly spreadsheet: one row per business date,
 * grouped column blocks (two-level header) and sticky
 * Total / Average footer rows. All figures in TZS.
 *
 * Column model: every section shows ONE headline "total" column when collapsed;
 * clicking the group header reveals its component columns.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet2, ChevronLeft, ChevronRight, Info } from "lucide-react";

import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CurrencyCashTable from "@/components/reports/CurrencyCashTable";
import DrillHeader from "@/components/reports/DrillHeader";
import { useCasino } from "@/lib/casino-context";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { formulaText } from "@/lib/monthly-balance-formulas";
import {
  useDailyBalanceReport, useSetCreditDeposit, useSetBankBalance,
  useMonthStart, useSetMonthStart,
  type DailyBalanceRow, type ManualLegacyField, type MonthStartField,
  type WalletBalance,
} from "@/hooks/use-daily-balance-report";
import DrillTable, { type DrillRow } from "@/components/reports/DrillTable";
import { demoDailyBalanceRows } from "@/lib/demo-report-data";

type SectionKey = "incomes" | "diff" | "expenses" | "office" | "transfers" | "money" | "balances";

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

/** Numeric FLOW fields — summed across the month. */
const BASE_KEYS: (keyof DailyBalanceRow)[] = [
  "casino_result", "tables_result", "slots_result", "live_cash_result", "slots_diff",
  "bar_result", "tips_tables", "tips_slots", "chip_difference", "diff_total",
  "transfer_cage_manager", "transfer_bank",
  "expenses", "bank_expenses", "money_in", "money_out", "fin_result",
  "day_total", "cash_desk_result", "day_balance", "collection_bank",
  "other_income", "jp", "missed_cards",
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
      { id: "result", label: "Casino Result", total: true, value: (r) => num(r, "casino_result") },
      { id: "tables_result", label: "Live Game", value: (r) => num(r, "tables_result") },
      { id: "slots_result", label: "Slots", value: (r) => num(r, "slots_result") },
      { id: "bar_result", label: "Bar", value: (r) => num(r, "bar_result") },
      { id: "jp", label: "JP", value: (r) => num(r, "jp") },
      { id: "tips_total", label: "Tips", value: (r) => num(r, "tips_tables") + num(r, "tips_slots") },
    ],
  },
  {
    key: "diff",
    label: "Diff",
    cols: [
      { id: "diff_total", label: "Diff", total: true, value: (r) => num(r, "diff_total") },
      { id: "chip_difference", label: "Chip Diff", value: (r) => num(r, "chip_difference") },
      { id: "slots_diff", label: "Slots Diff", value: (r) => num(r, "slots_diff") },
      { id: "missed_cards", label: "Missed Cards", value: (r) => num(r, "missed_cards") },
    ],
  },
  {
    key: "transfers",
    label: "Cage & transfers",
    cols: [
      { id: "cage_casino", label: "Cage Casino", total: true, value: (r) => num(r, "cage_casino") },
      { id: "transfer_cage_manager", label: "Internal Transfer", value: (r) => num(r, "transfer_cage_manager") },
      { id: "cage_manager", label: "Cage Manager", total: true, value: (r) => num(r, "cage_manager") },
      { id: "transfer_bank", label: "Bank Transfer", value: (r) => num(r, "transfer_bank") },
    ],
  },
  {
    key: "money",
    label: "Bank",
    cols: [
      { id: "bank_total", label: "Bank", total: true, value: (r) => num(r, "bank_tzs") + num(r, "bank_usd") },
      { id: "bank_tzs", label: "Bank TZS", value: (r) => num(r, "bank_tzs") },
      { id: "bank_usd", label: "Bank USD", value: (r) => num(r, "bank_usd") },
      { id: "collections", label: "Collections", value: (r) => num(r, "collections") },
    ],
  },

  {
    key: "expenses",
    label: "Expenses",
    cols: [
      { id: "expenses", label: "Expenses", total: true, value: (r) => num(r, "expenses") },
    ],
  },
  {
    key: "office",
    label: "Office",
    cols: [
      { id: "office_total", label: "Office", total: true, value: (r) => num(r, "money_in") - num(r, "money_out") },
      { id: "money_in", label: "+", value: (r) => num(r, "money_in") },
      { id: "money_out", label: "−", value: (r) => num(r, "money_out") },
    ],
  },

  {
    key: "balances",
    label: "Variance",
    cols: [
      { id: "money_total", label: "Money", total: true, value: (r) => num(r, "money_total") },
      { id: "balance", label: "Variance", total: true, value: (r) => num(r, "balance") },
    ],
  },

];

/** Money columns — blanked for the days that precede the recorded Start. */
const MONEY_IDS = new Set([
  "cage_casino", "cage_manager", "transfer_cage_manager", "transfer_bank",
  "bank_total", "bank_tzs", "bank_usd", "money_total", "balance", "collections",
]);


/** Columns typed by hand — mapped to their `fin_legacy_balance` field. */
const MANUAL_FIELDS: Record<string, ManualLegacyField | undefined> = {
  tips_total: "tips_tables",
  transfer_cage_manager: "office_transfer",
  transfer_bank: "collection_bank",
};



/** Start row → editable opening fields in `fin_month_start`. */
const START_FIELDS: Record<string, MonthStartField | undefined> = {
  cage_casino: "cage_casino",
  cage_manager: "cage_manager",
  bank_tzs: "bank_tzs",
  bank_usd: "bank_usd",
};



/**
 * Flat palette: no tints, no translucency. Cells stay on `--card`; sections are
 * told apart by a coloured header underline only.
 */
const ZONE_BG: Record<SectionKey, string> = {
  incomes: "bg-card",
  diff: "bg-card",
  transfers: "bg-card",
  money: "bg-card",
  expenses: "bg-card",
  office: "bg-card",
  balances: "bg-card",
};

/** Section accent — a solid underline under the header cell. */
const ZONE_HEAD: Record<SectionKey, string> = {
  incomes: "bg-muted border-b-success",
  diff: "bg-muted border-b-warning",
  transfers: "bg-muted border-b-info",
  money: "bg-muted border-b-primary",
  expenses: "bg-muted border-b-destructive",
  office: "bg-muted border-b-accent-foreground",
  balances: "bg-muted border-b-foreground",
};

/** Columns whose sign carries meaning — rendered with an explicit + / − and colour. */
const SIGNED_IDS = new Set([
  "result", "tables_result", "slots_result", "bar_result", "jp", "tips_total",
  "diff_total", "chip_difference", "slots_diff", "missed_cards",
  "office_total", "balance",
]);


/** Section → the headline column that carries the expand arrow (first total col). */
const SECTION_ANCHOR: Record<string, string> = Object.fromEntries(
  SECTIONS.filter((s) => s.cols.some((c) => !c.total)).map((s) => [
    s.key,
    (s.cols.find((c) => c.total) ?? s.cols[0]).id,
  ]),
);



/** Pinned lead column, rendered right after Date. */
const LEAD_COL: Col & { section: SectionKey } = {
  id: "fin_result", label: "Fin Result", total: true, section: "balances",
  value: (r) => num(r, "fin_result"),
};

/** Non-headline columns are "details" — hidden until their section is expanded. */
const ALL_COLS: (Col & { section: SectionKey })[] = [
  LEAD_COL,
  ...SECTIONS.flatMap((s) => s.cols.map((c) => ({ ...c, detail: !c.total, section: s.key }))),
];


/** Every money column gets a per-column heat fill (scaled inside its own column). */
const HEAT_IDS = new Set(ALL_COLS.map((c) => c.id));

/** Columns that open a right-hand breakdown panel when a cell is clicked. */
const DRILL_IDS = new Set([
  "chip_difference", "cage_casino", "cage_manager", "transfer_cage_manager", "transfer_bank",
]);



const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const from = `${m}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from, to: `${m}-${String(last).padStart(2, "0")}` };
};

const today = () => new Date().toISOString().slice(0, 10);

/** Table row = a real business day, plus one synthetic "Start" opening row. */
type Row = DailyBalanceRow & { kind: "day" | "start" };

/** Manual Credit / Deposit entry — saved per day on blur. */
const CreditCell = ({ date, value }: { date: string; value: number }) => {
  const save = useSetCreditDeposit();
  const [draft, setDraft] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : value ? String(Math.round(value)) : "0";
  return (
    <Input
      value={shown}
      placeholder="0"
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

/** Manual figure stored in `fin_legacy_balance` — inline editor, saved on blur. */
const ManualCell = ({
  date, value, field, width = "w-28",
}: { date: string; value: number; field: ManualLegacyField; width?: string }) => {
  const save = useSetBankBalance();
  const [draft, setDraft] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const rounded = Math.round(value);
  const shown = editing ? draft : rounded ? String(rounded) : "0";
  return (
    <Input
      value={shown}
      placeholder="0"
      inputMode="numeric"
      title="Manual entry"
      onClick={(e) => e.stopPropagation()}
      onFocus={() => { setEditing(true); setDraft(rounded ? String(rounded) : ""); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.-]/g, ""))}
      onBlur={() => {
        setEditing(false);
        const v = Number(draft || 0);
        if (Number.isFinite(v) && v !== rounded) save.mutate({ date, field, value: v });
      }}
      className={cn("h-6 px-1 text-right font-mono text-xs tabular-nums", width)}
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

/** Opening money of the month — sum of the Start row (read-only tile). */
const StartingBalanceTile = ({ value, hint }: { value: number; hint?: string }) => (
  <div className="rounded-md border border-border bg-card px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Starting Balance</div>
    <div
      className={cn(
        "font-mono text-lg tabular-nums",
        value < 0 ? "cms-amount-negative" : "cms-amount-positive",
      )}
    >
      {formatMoneyFull(Math.round(value))}
    </div>
    <div className="text-[10px] text-muted-foreground">
      {hint ?? (value ? "From the Start row" : "Start row is empty — fill it in the table")}
    </div>
  </div>
);

/** Editable cell of the synthetic "Start" row — persisted in `fin_month_start`. */
const StartCell = ({
  month, field, value,
}: { month: string; field: MonthStartField; value: number }) => {
  const save = useSetMonthStart(month);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const rounded = Math.round(value);
  const shown = editing ? draft : rounded ? String(rounded) : "0";
  return (
    <Input
      value={shown}
      placeholder="0"
      inputMode="numeric"
      title="Opening balance — manual"
      onClick={(e) => e.stopPropagation()}
      onFocus={() => { setEditing(true); setDraft(rounded ? String(rounded) : ""); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.-]/g, ""))}
      onBlur={() => {
        setEditing(false);
        const v = Number(draft || 0);
        if (Number.isFinite(v) && v !== rounded) save.mutate({ field, value: v });
      }}
      className="h-6 w-28 px-1 text-right font-mono text-xs font-semibold tabular-nums"
    />
  );
};


/**
 * Cash summarised per currency (no denomination breakdown) — every currency is
 * listed even when zero: CUR | amount | rate | TZS.
 */
const DenomTable = ({
  rows,
  mobile,
}: {
  rows: { currency: string; denomination: number; quantity: number; tzs: number }[];
  mobile?: Record<string, number>;
}) => <CurrencyCashTable rows={rows} mobile={mobile} />;


/** Wallet balances → unified drill rows (name already carries the currency). */
const walletRows = (wallets?: WalletBalance[]): DrillRow[] =>
  (wallets ?? []).map((w) => {
    const units = w.units ?? w.balance;
    return {
      label: w.name,
      units,
      rate: (w.currency || "TZS") === "TZS" ? 1 : units ? w.balance / units : 0,
      tzs: w.balance,
    };
  });


const DailyBalanceReport = ({ demo = false }: { demo?: boolean }) => {
  const { activeCasino } = useCasino();
  const navigate = useNavigate();
  const [month, setMonth] = useSessionState(demo ? "dbr-demo-month" : "dbr-month", currentMonth());
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  /** Fixed display options — every column is always shown, in full figures. */
  const heatmap = true;
  
  /** Cell drill-down: which column of which row is being inspected. */
  const [drill, setDrill] = useState<{ row: DailyBalanceRow; col: string } | null>(null);

  /** Opening money of the month — stored in `fin_month_start`, editable in the Start row. */
  const { data: monthStart } = useMonthStart(month);
  const startFields = {
    cage_casino: Number(monthStart?.cage_casino || 0),
    cage_manager: Number(monthStart?.cage_manager || 0),
    bank_tzs: Number(monthStart?.bank_tzs || 0),
    bank_usd: Number(monthStart?.bank_usd || 0),
  };
  const startBalance =
    startFields.cage_casino + startFields.cage_manager + startFields.bank_tzs + startFields.bank_usd;





  /** Shift the selected month by ±1. */
  const stepMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  const { from, to } = monthBounds(month);
  const live = useDailyBalanceReport(from, to, { enabled: !demo, startBalance });
  const rows = useMemo<DailyBalanceRow[]>(
    () => (demo ? demoDailyBalanceRows(month) : live.data ?? []),
    [demo, month, live.data],
  );
  const isLoading = !demo && live.isLoading;

  const toggleExpand = (g: SectionKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  /** Sum of every source field across the month — feeds Total / Average rows. */
  const grandRow = useMemo(() => {
    const acc = {} as DailyBalanceRow;
    // Open (not yet closed) business days carry no figures at all.
    const closed = rows.filter((r) => r.day_closed);
    for (const k of BASE_KEYS) {
      (acc as unknown as Record<string, number>)[k as string] = closed.reduce((s, r) => s + num(r, k), 0);
    }
    // Snapshot (stock) columns take the last closed day, never a sum.
    const last = closed.length ? closed[closed.length - 1] : null;
    for (const k of SNAPSHOT_KEYS) {
      (acc as unknown as Record<string, number>)[k as string] = last ? num(last, k) : 0;
    }
    return acc;
  }, [rows]);


  const daysWithData = useMemo(() => rows.filter((r) => r.hasSystemData || r.legacy).length, [rows]);

  /** Last business date that has live system data — highlighted with a yellow stripe. */
  const lastClosedRow = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const withData = sorted.filter((r) => r.day_closed && r.hasSystemData);
    if (withData.length) return withData[withData.length - 1];
    // Demo / legacy rows carry no `hasSystemData` flag — fall back to the last closed day.
    const closed = sorted.filter((r) => r.day_closed);
    return closed.length ? closed[closed.length - 1] : null;
  }, [rows]);
  const lastClosedDate = lastClosedRow?.date ?? null;

  /** Collapsed sections show only their headline column(s). */
  const visibleMoneyCols = useMemo(
    () => [LEAD_COL, ...ALL_COLS.filter((c) => c.id !== LEAD_COL.id && (!c.detail || expanded.has(c.section)))],
    [expanded],
  );

  /**
   * Flat grid: no heat fills, no tinted rows. Only the "open day" row keeps a
   * neutral muted background so unfinished days stay obvious.
   */
  const rowBg = (r: Row): string | undefined =>
    !r.day_closed ? "bg-muted" : undefined;


  /** "Start" opening row + plain day rows (no weekly subtotals in this grid). */
  const displayRows = useMemo<Row[]>(
    () => [
      {
        ...({} as DailyBalanceRow),
        date: `${month}-00`,
        weekday: "",
        day_closed: true,
        balance: startBalance,
        money_total: startBalance,
        kind: "start" as const,
      } as Row,
      ...rows.map((r) => ({ ...r, kind: "day" as const })),
    ],
    [rows, startBalance, month],
  );


  /** Full figures only — no compact M / K suffixes anywhere in this grid. */
  const blank = <span className="text-muted-foreground">0</span>;
  /**
   * `signed` columns show an explicit + / − and are coloured by sign;
   * plain stock columns stay neutral.
   */
  const money = (n: number, signed = false) =>
    !n ? blank : (
      <span
        className={
          n < 0 ? "cms-amount-negative" : signed ? "cms-amount-positive" : undefined
        }
      >
        {signed && n > 0 ? "+" : ""}
        {formatMoneyFull(n)}
      </span>
    );



  /** Column hover highlight — the whole column plus its header light up. */
  const [hoverCol, setHoverCol] = useState<string | null>(null);


  const columns: ColumnDef<Row>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 74, minWidth: 74 },
      accessor: (r) =>
        r.kind === "start" ? (
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-foreground">
            Start
          </span>
        ) : (
          <span className="whitespace-nowrap">
            <span className={cn("font-mono text-[12px] font-semibold tabular-nums", r.date === today() && "text-primary")}>
              {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
            </span>
            {r.legacy && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">imp</Badge>}
          </span>
        ),
      headerClassName: "whitespace-nowrap border-b-2 border-b-foreground bg-muted font-bold uppercase tracking-wide text-foreground",
      cellClassName: (r: Row) =>
        cn(
          "py-0.5 leading-tight",
          r.kind === "start"
            ? "border-b-2 border-b-border bg-muted"
            : rowBg(r) ?? "bg-card",
        ),
    },


    ...visibleMoneyCols.map<ColumnDef<Row>>((c, i) => {
      const first = i === 0 || visibleMoneyCols[i - 1].section !== c.section;
      const tip = formulaText(c.id);
      const isAnchor = SECTION_ANCHOR[c.section] === c.id;
      const isOpen = expanded.has(c.section);
      const hot = hoverCol === c.id;
      return {
        key: c.id,
        header: (
          <span
            className="inline-flex items-center gap-1"
            onMouseEnter={() => setHoverCol(c.id)}
            onMouseLeave={() => setHoverCol(null)}
          >
            {isAnchor && (
              <button
                type="button"
                aria-label={isOpen ? `Collapse ${c.label}` : `Expand ${c.label}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); toggleExpand(c.section); }}
              >
                {isOpen
                  ? <ChevronLeft className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            {c.label}
            {tip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line text-xs">
                  {tip}
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        ),
        type: "money" as const,
        style: i === 0 ? { width: 132, minWidth: 132 } : undefined,
        accessor: (r) => {
          const wrap = (node: React.ReactNode) => (
            <span
              className="block w-full"
              onMouseEnter={() => setHoverCol(c.id)}
              onMouseLeave={() => setHoverCol(null)}
            >
              {node}
            </span>
          );
          // Opening row: editable opening money + carried-over totals.
          if (r.kind === "start") {
            if (!demo && START_FIELDS[c.id])
              return wrap(
                <StartCell month={month} field={START_FIELDS[c.id]!} value={startFields[START_FIELDS[c.id]!]} />,
              );
            if (c.id === "bank_total")
              return wrap(
                <span className="font-semibold">
                  {money(Math.round(startFields.bank_tzs + startFields.bank_usd))}
                </span>,
              );
            return wrap(
              c.id === "balance" || c.id === "money_total"
                ? <span className="font-semibold">{money(Math.round(startBalance))}</span>
                : blank,
            );
          }

          // Business day still open → no figures in any column.
          if (!r.day_closed) return wrap(blank);
          // Days before the recorded Start keep results & expenses only.
          if (r.money_hidden && MONEY_IDS.has(c.id)) return wrap(blank);

          if (r.kind === "day" && c.id === "credit_deposit")
            return wrap(<CreditCell date={r.date} value={num(r, "credit_deposit")} />);
          if (r.kind === "day" && MANUAL_FIELDS[c.id])
            return wrap(
              <ManualCell date={r.date} field={MANUAL_FIELDS[c.id]} value={c.value(r)} />,
            );
          if (r.kind === "day" && c.id === "bank_usd")
            return wrap(
              <span title={`${money(Math.round(num(r, "bank_usd_raw")))} USD`}>
                {money(Math.round(num(r, "bank_usd")))}
              </span>,
            );
          const rendered = money(Math.round(c.value(r)), SIGNED_IDS.has(c.id));

          if (c.id === "expenses")
            return wrap(
              <span
                className="cursor-pointer underline-offset-2 hover:underline"
                onClick={(e) => { e.stopPropagation(); navigate(demo ? "/demo/expenses-casino" : "/reports/expenses-casino"); }}
              >
                {rendered}
              </span>,
            );
          if (DRILL_IDS.has(c.id))
            return wrap(
              <span
                className="cursor-pointer underline-offset-2 hover:underline"
                onClick={(e) => { e.stopPropagation(); setDrill({ row: r, col: c.id }); }}
              >
                {rendered}
              </span>,
            );
          return wrap(rendered);
        },

        headerClassName: cn(
          "whitespace-nowrap border-b-2 text-[12px] uppercase tracking-wide",
          ZONE_HEAD[c.section],
          first ? "border-l-2 border-l-border" : "border-l border-l-border/60",
          c.total ? "font-extrabold text-foreground" : "font-bold text-foreground",
          hot && "text-primary",
        ),

        cellClassName: (r: Row) =>
          cn(
            "py-0.5 whitespace-nowrap font-mono text-[11px] leading-tight tabular-nums",
            first ? "border-l-2 border-l-border" : "border-l border-l-border/40",
            c.total ? "font-semibold text-foreground" : "text-foreground",
            r.kind === "start"
              ? "border-b-2 border-b-border bg-muted font-semibold"
              : rowBg(r) ?? ZONE_BG[c.section],
            hot && "!bg-muted",
          ),




      };
    }),
  ];

  const footerRows = rows.length
    ? [
        {
          key: "total",
          className: "border-t-2 border-border bg-muted font-bold",
          cell: (col: ColumnDef<Row>) => {
            if (col.key === "date")
              return <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Total</span>;

            const c = ALL_COLS.find((x) => x.id === col.key);
            const v = c ? Math.round(c.value(grandRow)) : 0;
            const tip = formulaText(col.key);
            const signed = SIGNED_IDS.has(String(col.key));
            return (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span
                  className={cn(
                    "font-mono text-[11px] font-bold tabular-nums",
                    v < 0 ? "cms-amount-negative" : signed && v > 0 ? "cms-amount-positive" : undefined,
                  )}
                >
                  {signed && v > 0 ? "+" : ""}
                  {formatMoneyFull(v)}
                </span>


                {tip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 shrink-0 opacity-40 hover:opacity-100" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
                      {tip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
            );
          },
        },
        {
          key: "avg",
          className: "bg-muted/70 text-muted-foreground",
          cell: (col: ColumnDef<Row>) => {
            if (col.key === "date")
              return <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg / day</span>;
            const c = ALL_COLS.find((x) => x.id === col.key);
            const v = c ? Math.round(c.value(grandRow) / (daysWithData || 1)) : 0;
            return <span className="whitespace-nowrap font-mono text-[11px] tabular-nums">{formatMoneyFull(v)}</span>;
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
        icon={Wallet2}
        title="Casino Monthly Balance"
        subtitle="Result · Cage · Bank · Money — rebuilt from live data, all figures in TZS"
        context={demo ? "Demo" : activeCasino?.name}
      >
        {demo && <Badge variant="outline" className="mr-2">DEMO DATA</Badge>}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {daysWithData} days · {visibleMoneyCols.length} columns
        </span>
      </PageHeader>


      {/* KPI tiles: two-row layout */}
      {/* Row 1: Finance Result · Month picker · Office */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <Tile
          label="Finance Result"
          value={num(grandRow, "fin_result")}
          hint="Casino result − expenses + office net"
        />
        <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stepMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[130px] text-center text-sm font-semibold tracking-wide">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stepMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Tile
          label="Office"
          value={num(grandRow, "money_in") - num(grandRow, "money_out")}
          hint="IN − OUT"
        />
      </div>

      {/* Row 2: Starting Balance · Casino Result · Money · Expenses · Balance */}
      <div className="mb-3 grid grid-cols-5 gap-2">
        <StartingBalanceTile
          value={startBalance}
          hint={startBalance ? `Opening ${monthLabel}` : `Opening ${monthLabel} · fill the Start row`}
        />

        <Tile label="Casino Result" value={num(grandRow, "casino_result")} hint="Live Game + Slots + Bar" />
        <Tile
          label="Money"
          value={Number(lastClosedRow?.money_total || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
        <Tile label="Expenses" value={-num(grandRow, "expenses")} />

        <Tile
          label="Variance"
          value={Number(lastClosedRow?.balance || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
      </div>


      <PageSection card={false}>
        <div className="max-h-[72vh] overflow-auto rounded-md border border-border">
          <SmartTable
            data={displayRows}
            columns={columns}
            rowKey={(r) => `${r.kind}:${r.date}`}
            loading={isLoading}
            stickyColumns={[0, 74]}
            stickyHeader
            // The outer wrapper owns the scrolling — otherwise the inner
            // overflow container swallows `position: sticky` on the header.
            scroll={false}
            footerRows={footerRows}
            bare
            virtualize={false}
            // No zebra: with 20+ columns the stripes fight the row highlights.
            className="[&_tbody_tr:nth-child(odd)]:bg-transparent"
            empty={<div className="py-10 text-center text-sm text-muted-foreground">No data for this month</div>}
          />
        </div>
      </PageSection>

      {/* The generic per-day panel was removed — only per-cell drill-downs open now. */}



      {/* Cell breakdown panel */}
      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle asChild>
              <div>
                {drill && (
                  <DrillHeader
                    source={ALL_COLS.find((c) => c.id === drill.col)?.label ?? ""}
                    date={drill.row.date}
                    amount={num(drill.row, drill.col as keyof DailyBalanceRow)}
                  />
                )}
              </div>
            </SheetTitle>
          </SheetHeader>
          {drill && (
            <div className="mt-4 space-y-3 text-xs">
              {drill.col === "chip_difference" && (
                <DrillTable
                  title="Miss chips by denomination"
                  rows={(drill.row.chips_detail ?? []).map((c) => ({
                    label: `Chip ${formatMoneyFull(c.denomination)}`,
                    units: c.miss,
                    rate: c.denomination,
                    tzs: c.miss * c.denomination,
                  }))}
                  totalLabel="Chip diff"
                  total={num(drill.row, "chip_difference")}
                />
              )}
              {drill.col === "cage_casino" && (
                <>
                  <DenomTable
                    rows={drill.row.cage_detail?.cash ?? []}
                    mobile={drill.row.cage_detail?.mobile ?? {}}
                  />

                  <DrillTable
                    title="Cashless"
                    rows={(drill.row.cage_detail?.cashless ?? []).map((c) => ({
                      label: c.name, units: c.amount, rate: 1, tzs: c.amount,
                    }))}
                  />
                  <DrillTable
                    title="Slots cage"
                    rows={[{
                      label: "Closing total",
                      units: drill.row.cage_detail?.slots_total ?? 0,
                      rate: 1,
                      tzs: drill.row.cage_detail?.slots_total ?? 0,
                    }]}
                    totalLabel="Cage Casino"
                    total={num(drill.row, "cage_casino")}
                  />
                </>
              )}
              {drill.col === "cage_manager" && (
                <DrillTable
                  title="Office wallets"
                  rows={walletRows(drill.row.office_wallets)}
                  totalLabel="Cage Manager"
                  total={num(drill.row, "cage_manager")}
                />
              )}
              {(drill.col === "bank_tzs" || drill.col === "bank_usd") && (
                <DrillTable
                  title="Bank wallets"
                  rows={walletRows(
                    (drill.row.bank_wallets ?? []).filter((w) =>
                      drill.col === "bank_tzs"
                        ? (w.currency || "TZS") === "TZS"
                        : (w.currency || "TZS") !== "TZS",
                    ),
                  )}
                  totalLabel={drill.col === "bank_tzs" ? "Bank TZS" : "Bank USD"}
                  total={num(drill.row, drill.col as keyof DailyBalanceRow)}
                />
              )}
              {(drill.col === "transfer_cage_manager" || drill.col === "transfer_bank") && (
                <DrillTable
                  title="Transfers"
                  rows={(
                    drill.col === "transfer_bank"
                      ? drill.row.transfers_bank ?? []
                      : drill.row.transfers_manager ?? []
                  ).map((t) => ({
                    label: `${t.from} → ${t.to}`, units: t.amount, rate: 1, tzs: t.amount,
                  }))}
                  totalLabel="Total"
                  total={num(drill.row, drill.col as keyof DailyBalanceRow)}
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>

    </TooltipProvider>
  );
};

export default DailyBalanceReport;
