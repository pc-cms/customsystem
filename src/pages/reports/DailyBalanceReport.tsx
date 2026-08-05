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
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { useCasino } from "@/lib/casino-context";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { formulaText } from "@/lib/monthly-balance-formulas";
import {
  useDailyBalanceReport, useSetCreditDeposit, useSetBankBalance, type DailyBalanceRow,
} from "@/hooks/use-daily-balance-report";

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
  "expenses", "fees", "bank_expenses", "money_in", "money_out", "fin_result",
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
      { id: "result", label: "Casino Result", total: true, value: (r) => num(r, "casino_result") },
      { id: "tables_result", label: "Live Game", value: (r) => num(r, "tables_result") },
      { id: "slots_result", label: "Slots", value: (r) => num(r, "slots_result") },
      { id: "bar_result", label: "Bar", value: (r) => num(r, "bar_result") },
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
    ],
  },
  {
    key: "expenses",
    label: "Expenses",
    cols: [
      { id: "expenses", label: "Expenses", total: true, value: (r) => num(r, "expenses") },
      { id: "fees", label: "Fees", total: true, value: (r) => num(r, "fees") },
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
    label: "Balance",
    cols: [
      { id: "money_total", label: "Money", total: true, value: (r) => num(r, "money_total") },
      { id: "balance", label: "Balance", total: true, value: (r) => num(r, "balance") },
    ],
  },
];

/**
 * Per-section column zone tint — OPAQUE (mixed against --card) so that sticky
 * frozen columns never let scrolling content bleed through. Static literals so
 * Tailwind's JIT scanner picks them up.
 */
const ZONE_BG: Record<SectionKey, string> = {
  incomes: "bg-[color-mix(in_srgb,hsl(var(--success))_5%,hsl(var(--card)))]",
  diff: "bg-[color-mix(in_srgb,hsl(var(--warning))_6%,hsl(var(--card)))]",
  transfers: "bg-[color-mix(in_srgb,hsl(var(--info))_6%,hsl(var(--card)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--primary))_5%,hsl(var(--card)))]",
  expenses: "bg-[color-mix(in_srgb,hsl(var(--destructive))_5%,hsl(var(--card)))]",
  office: "bg-[color-mix(in_srgb,hsl(var(--accent))_18%,hsl(var(--card)))]",
  balances: "bg-[color-mix(in_srgb,hsl(var(--muted))_45%,hsl(var(--card)))]",
};

const ZONE_HEAD: Record<SectionKey, string> = {
  incomes: "bg-[color-mix(in_srgb,hsl(var(--success))_14%,hsl(var(--muted)))]",
  diff: "bg-[color-mix(in_srgb,hsl(var(--warning))_16%,hsl(var(--muted)))]",
  transfers: "bg-[color-mix(in_srgb,hsl(var(--info))_16%,hsl(var(--muted)))]",
  money: "bg-[color-mix(in_srgb,hsl(var(--primary))_13%,hsl(var(--muted)))]",
  expenses: "bg-[color-mix(in_srgb,hsl(var(--destructive))_14%,hsl(var(--muted)))]",
  office: "bg-[color-mix(in_srgb,hsl(var(--accent))_40%,hsl(var(--muted)))]",
  balances: "bg-muted",
};

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

/** Manually entered opening balance for the month (carried over from the previous month). */
const StartingBalanceTile = ({
  storageKey, hint, onChange,
}: { storageKey: string; hint?: string; onChange?: (v: number) => void }) => {
  const [value, setValue] = useState<number>(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    return raw ? Number(raw) || 0 : 0;
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    setValue(raw ? Number(raw) || 0 : 0);
    setEditing(false);
  }, [storageKey]);

  const commit = () => {
    const next = Number(String(draft).replace(/[^\d.-]/g, "")) || 0;
    setValue(next);
    window.localStorage.setItem(storageKey, String(next));
    setEditing(false);
    onChange?.(next);
  };

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Starting Balance</div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full bg-transparent font-mono text-lg tabular-nums outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(value ? String(value) : "");
            setEditing(true);
          }}
          className={cn(
            "block w-full text-left font-mono text-lg tabular-nums",
            value < 0 ? "cms-amount-negative" : "cms-amount-positive",
          )}
        >
          {formatMoneyFull(Math.round(value))}
        </button>
      )}
      <div className="text-[10px] text-muted-foreground">{hint ?? "Manual · click to edit"}</div>
    </div>
  );
};

/** Simple label / amount list used by the cell breakdown panel. */
const DrillList = ({
  title, rows, totalLabel, total,
}: {
  title?: string;
  rows: { label: string; value: number }[];
  totalLabel?: string;
  total?: number;
}) => (
  <div>
    {title && (
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
    )}
    <div className="rounded-md border border-border">
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className="flex items-center justify-between border-b border-border/60 px-2 py-1 last:border-0"
        >
          <span className="text-muted-foreground">{r.label}</span>
          <span className={cn("font-mono tabular-nums", r.value < 0 && "cms-amount-negative")}>
            {r.value ? formatMoneyFull(Math.round(r.value)) : "·"}
          </span>
        </div>
      ))}
      {!rows.length && <div className="px-2 py-3 text-center text-muted-foreground">No data</div>}
      {totalLabel != null && (
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-2 py-1 font-semibold">
          <span>{totalLabel}</span>
          <span className={cn("font-mono tabular-nums", (total ?? 0) < 0 && "cms-amount-negative")}>
            {formatMoneyFull(Math.round(total ?? 0))}
          </span>
        </div>
      )}
    </div>
  </div>
);

const DailyBalanceReport = () => {
  const { activeCasino } = useCasino();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [month, setMonth] = useSessionState("dbr-month", currentMonth());
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  /** Fixed display options — every column is always shown, in full figures. */
  const heatmap = true;
  const [detail, setDetail] = useState<DailyBalanceRow | null>(null);
  /** Cell drill-down: which column of which row is being inspected. */
  const [drill, setDrill] = useState<{ row: DailyBalanceRow; col: string } | null>(null);

  const startKey = `dbr-start-balance:${activeCasino?.id ?? "none"}:${month}`;
  const [startBalance, setStartBalance] = useState(0);
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(startKey) : null;
    setStartBalance(raw ? Number(raw) || 0 : 0);
  }, [startKey]);




  /** Shift the selected month by ±1. */
  const stepMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

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
    const withData = rows.filter((r) => r.day_closed && r.hasSystemData).sort((a, b) => a.date.localeCompare(b.date));
    return withData.length ? withData[withData.length - 1] : null;
  }, [rows]);
  const lastClosedDate = lastClosedRow?.date ?? null;

  /** Collapsed sections show only their headline column(s). */
  const visibleMoneyCols = useMemo(
    () => [LEAD_COL, ...ALL_COLS.filter((c) => c.id !== LEAD_COL.id && (!c.detail || expanded.has(c.section)))],
    [expanded],
  );

  /** Max abs value per heat column — drives the fill intensity. */
  const heatMax = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of ALL_COLS) {
      if (!HEAT_IDS.has(c.id)) continue;
      m[c.id] = Math.max(1, ...rows.filter((r) => r.day_closed).map((r) => Math.abs(c.value(r))));
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
   * Priority: open day > last closed day > today > weekend > (cell heat).
   */
  const rowBg = (r: Row): string | undefined => {
    // Open (not yet closed) business days are tinted with an OPAQUE mix so
    // sticky frozen columns do not let scrolling content bleed through.
    if (!r.day_closed) return "bg-[color-mix(in_srgb,hsl(var(--muted))_30%,hsl(var(--card)))]";
    if (r.date === lastClosedDate)
      return "bg-[color-mix(in_srgb,hsl(var(--warning))_14%,hsl(var(--card)))]";
    if (r.date === today())
      return "bg-[color-mix(in_srgb,hsl(var(--primary))_10%,hsl(var(--card)))]";
    if (r.weekday === "Sat" || r.weekday === "Sun")
      return "bg-[color-mix(in_srgb,hsl(var(--muted))_40%,hsl(var(--card)))]";
    return undefined;
  };

  /** Plain day rows — weekly subtotals were removed from this report. */
  const displayRows = useMemo<Row[]>(
    () => rows.map((r) => ({ ...r, kind: "day" as const })),
    [rows],
  );

  /** Full figures only — no compact M / K suffixes anywhere in this grid. */
  const money = (n: number) =>
    !n ? <span className="text-muted-foreground">·</span> : (
      <span className={n < 0 ? "cms-amount-negative" : undefined}>{formatMoneyFull(n)}</span>
    );

  /** Column hover highlight — the whole column plus its header light up. */
  const [hoverCol, setHoverCol] = useState<string | null>(null);


  const columns: ColumnDef<Row>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 74, minWidth: 74 },
      accessor: (r) => (
          <span className="whitespace-nowrap">
            <span className={cn("font-mono text-[12px] font-semibold tabular-nums", r.date === today() && "text-primary")}>
              {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
            </span>
            {r.legacy && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">imp</Badge>}
          </span>
        ),
      headerClassName: "whitespace-nowrap border-b-2 border-border bg-muted font-bold uppercase tracking-wide text-foreground",
      cellClassName: (r: Row) => cn("py-0.5 leading-tight", rowBg(r) ?? "bg-card"),
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
                  ? <ChevronLeft className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
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
          // Business day still open → no figures in any column.
          if (!r.day_closed) return wrap(<span className="text-muted-foreground">·</span>);
          if (r.kind === "day" && c.id === "credit_deposit")
            return wrap(<CreditCell date={r.date} value={num(r, "credit_deposit")} />);
          if (r.kind === "day" && c.id === "bank_tzs")
            return wrap(<BankCell date={r.date} field="bank_account" value={num(r, "bank_tzs")} manual={!!r.bank_tzs_manual} />);
          if (r.kind === "day" && c.id === "bank_usd")
            return wrap(<BankCell date={r.date} field="bank_account_usd" value={num(r, "bank_usd_raw")} manual={!!r.bank_usd_manual} />);
          const rendered = money(Math.round(c.value(r)));
          if (c.id === "expenses")
            return wrap(
              <span
                className="cursor-pointer underline-offset-2 hover:underline"
                onClick={(e) => { e.stopPropagation(); navigate("/reports/expenses-matrix"); }}
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
          "whitespace-nowrap border-b-2 border-border uppercase tracking-wide",
          ZONE_HEAD[c.section],
          first ? "border-l-2 border-l-border" : "border-l border-l-border/60",
          c.total ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
          hot && "text-primary",
        ),
        cellClassName: (r: Row) =>
          cn(
            "py-0.5 whitespace-nowrap font-mono text-[11px] leading-tight tabular-nums",
            first ? "border-l-2 border-l-border" : "border-l border-l-border/40",
            c.total ? "font-semibold text-foreground" : "text-foreground/70",
            rowBg(r)
              ?? (r.day_closed ? heatClass(c, Math.round(c.value(r))) : undefined)
              ?? ZONE_BG[c.section],
            hot && "ring-1 ring-inset ring-primary/40",
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
            return (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className={cn("font-mono text-[11px] font-bold tabular-nums", v < 0 && "cms-amount-negative")}>
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
        context={activeCasino?.name}
      >
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
          storageKey={`dbr-start-balance:${activeCasino?.id ?? "none"}:${month}`}
          hint={`Opening ${monthLabel} · manual`}
        />
        <Tile label="Casino Result" value={num(grandRow, "casino_result")} hint="Live Game + Slots + Bar" />
        <Tile
          label="Money"
          value={Number(lastClosedRow?.money_total || 0)}
          hint={lastClosedDate ? fmtDate(lastClosedDate) : undefined}
        />
        <Tile label="Expenses" value={-num(grandRow, "expenses")} />

        <Tile
          label="Balance"
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
            
            footerRows={footerRows}
            onRowClick={(r) => r.kind === "day" && setDetail(r)}
            bare
            virtualize={false}
            // No zebra: with 20+ columns the stripes fight the row highlights.
            className="[&_tbody_tr:nth-child(odd)]:bg-transparent"
            empty={<div className="py-10 text-center text-sm text-muted-foreground">No data for this month</div>}
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

      {/* Cell breakdown panel */}
      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {drill
                ? `${ALL_COLS.find((c) => c.id === drill.col)?.label ?? ""} · ${fmtDate(drill.row.date)}`
                : ""}
            </SheetTitle>
          </SheetHeader>
          {drill && (
            <div className="mt-4 space-y-3 text-xs">
              {drill.col === "chip_difference" && (
                <DrillList
                  rows={(drill.row.chips_detail ?? []).map((c) => ({
                    label: `${formatMoneyFull(c.denomination)} × ${c.miss}`,
                    value: c.miss * c.denomination,
                  }))}
                  totalLabel="Chip diff"
                  total={num(drill.row, "chip_difference")}
                />
              )}
              {drill.col === "cage_casino" && (
                <>
                  <DrillList
                    title="Cash by denomination"
                    rows={(drill.row.cage_detail?.cash ?? []).map((c) => ({
                      label: `${c.currency} ${formatMoneyFull(c.denomination)} × ${c.quantity}`,
                      value: c.tzs,
                    }))}
                  />
                  <DrillList
                    title="Cashless"
                    rows={(drill.row.cage_detail?.cashless ?? []).map((c) => ({
                      label: c.name, value: c.amount,
                    }))}
                  />
                  <DrillList
                    title="Slots cage"
                    rows={[{ label: "Closing total", value: drill.row.cage_detail?.slots_total ?? 0 }]}
                    totalLabel="Cage Casino"
                    total={num(drill.row, "cage_casino")}
                  />
                </>
              )}
              {drill.col === "cage_manager" && (
                <DrillList
                  title="Office wallets"
                  rows={(drill.row.office_wallets ?? []).map((w) => ({
                    label: `${w.name} (${w.currency})`, value: w.balance,
                  }))}
                  totalLabel="Cage Manager"
                  total={num(drill.row, "cage_manager")}
                />
              )}
              {(drill.col === "transfer_cage_manager" || drill.col === "transfer_bank") && (
                <DrillList
                  rows={(
                    drill.col === "transfer_bank"
                      ? drill.row.transfers_bank ?? []
                      : drill.row.transfers_manager ?? []
                  ).map((t) => ({ label: `${t.from} → ${t.to}`, value: t.amount }))}
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
