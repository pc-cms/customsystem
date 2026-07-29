/**
 * Reports → Daily Balance Sheet.
 *
 * Recreates the legacy "БАЛАНС" monthly spreadsheet: one row per business date,
 * grouped column blocks and a sticky Total footer row.
 * All figures in TZS. Data comes from the live system; months that predate the
 * system can be filled with the legacy Excel importer.
 */
import { useMemo, useState } from "react";
import { Wallet2, ChevronDown, ChevronRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { useCasino } from "@/lib/casino-context";
import { useSessionState } from "@/hooks/use-session-state";
import { formatMoney, type MoneyDisplayMode } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useDailyBalanceReport, useSetCreditDeposit, type DailyBalanceRow } from "@/hooks/use-daily-balance-report";

type SectionKey = "incomes" | "expenses" | "transfers" | "money" | "balances";

type Col = { key: keyof DailyBalanceRow; label: string; detail?: boolean };

/**
 * Column layout by business meaning. Each section shows its headline columns;
 * `detail` columns appear only when the section is expanded (chevron).
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

const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const from = `${m}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from, to: `${m}-${String(last).padStart(2, "0")}` };
};

const today = () => new Date().toISOString().slice(0, 10);



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

const DailyBalanceReport = () => {

  const { activeCasino } = useCasino();
  const [month, setMonth] = useSessionState("dbr-month", currentMonth());
  const [sections, setSections] = useState<Set<SectionKey>>(new Set(SECTIONS.map((s) => s.key)));
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  const [hideEmpty, setHideEmpty] = useSessionState("dbr-hide-empty", true);
  const [moneyMode, setMoneyMode] = useSessionState<MoneyDisplayMode>("dbr-money", "compact");

  const { from, to } = monthBounds(month);
  const { data: rows = [], isLoading } = useDailyBalanceReport(from, to);

  const on = (g: SectionKey) => sections.has(g);
  const toggle = (g: SectionKey) =>
    setSections((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  const toggleExpand = (g: SectionKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of ALL_COLS) acc[c.key as string] = rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
    return acc;
  }, [rows]);

  /** Always-visible columns (manual entry / day formulas). */
  const ALWAYS = new Set(["credit_deposit", "day_total", "day_balance"]);

  /** Columns whose every value is 0 across the month (candidates for hiding). */
  const emptyCols = useMemo(() => {
    const s = new Set<string>();
    for (const c of ALL_COLS) {
      if (ALWAYS.has(c.key as string)) continue;
      if (rows.every((r) => !Number(r[c.key]))) s.add(c.key as string);
    }
    return s;
  }, [rows]);

  const money = (n: number) =>
    !n ? <span className="text-muted-foreground">·</span> : (
      <span className={n < 0 ? "cms-amount-negative" : undefined}>{formatMoney(n, moneyMode)}</span>
    );

  const visibleMoneyCols = ALL_COLS.filter(
    (c) =>
      on(c.section) &&
      (!c.detail || expanded.has(c.section)) &&
      !(hideEmpty && emptyCols.has(c.key as string)),
  );

  const sectionLabel = (k: SectionKey) => SECTIONS.find((s) => s.key === k)!.label;

  const columns: ColumnDef<DailyBalanceRow>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      accessor: (r) => (
        <span className="whitespace-nowrap font-mono">
          <span className={r.date === today() ? "font-semibold text-primary" : undefined}>
            {fmtDate(r.date)}
          </span>{" "}
          <span className="text-muted-foreground text-[11px]">{r.weekday}</span>
          {r.legacy && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">imp</Badge>}
        </span>
      ),
      sortValue: (r) => r.date,
    },
    ...visibleMoneyCols.map<ColumnDef<DailyBalanceRow>>((c, i) => {
      const first = i === 0 || visibleMoneyCols[i - 1].section !== c.section;
      return {
        key: c.key as string,
        header: first ? `${sectionLabel(c.section).toUpperCase()} · ${c.label}` : c.label,
        type: "money" as const,
        accessor: (r) =>
          c.key === "credit_deposit" ? (
            <CreditCell date={r.date} value={Number(r.credit_deposit || 0)} />
          ) : (
            money(Math.round(Number(r[c.key] || 0)))
          ),
        sortValue: (r) => Number(r[c.key] || 0),
        headerClassName: cn(
          "whitespace-nowrap",
          first && "border-l border-border",
          (c.key === "day_total" || c.key === "day_balance") && "font-semibold",
        ),
        cellClassName: cn(
          first && "border-l border-border",
          (c.key === "day_total" || c.key === "day_balance") && "font-semibold bg-muted/20",
        ),
      };
    }),
  ];

  return (
    <PageShell>
      <PageHeader
        icon={Wallet2}
        title="Daily Balance Sheet"
        subtitle="Legacy balance layout rebuilt from live data — all figures in TZS"
        context={activeCasino?.name}
      />

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
          ...SECTIONS.map((g) => (
            <div key={g.key} className="flex items-center gap-0.5 rounded-md border border-border px-0.5">
              <Toggle
                size="sm"
                pressed={on(g.key)}
                onPressedChange={() => toggle(g.key)}
                className="h-7 px-2 text-xs"
              >
                {g.label}
              </Toggle>
              {g.cols.some((c) => c.detail) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-6"
                  title={expanded.has(g.key) ? "Collapse details" : "Expand details"}
                  onClick={() => toggleExpand(g.key)}
                >
                  {expanded.has(g.key) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          )),

          <Toggle
            key="hide-empty"
            size="sm"
            pressed={hideEmpty}
            onPressedChange={() => setHideEmpty(!hideEmpty)}
            className="h-8 px-2 text-xs"
          >
            Hide empty
          </Toggle>,
          <Toggle
            key="compact"
            size="sm"
            pressed={moneyMode === "compact"}
            onPressedChange={() => setMoneyMode(moneyMode === "compact" ? "full" : "compact")}
            className="h-8 px-2 text-xs"
          >
            Short numbers
          </Toggle>,
        ]}
        right={
          <div className="text-xs text-muted-foreground">
            {rows.filter((r) => r.hasSystemData).length} days with data · {visibleMoneyCols.length} columns
          </div>
        }
      />

      <PageSection card={false}>
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
          <SmartTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.date}
            defaultSort={{ key: "date", dir: "asc" }}
            loading={isLoading}
            stickyFirstColumn
            bare
            virtualize={false}
            rowClassName={(r) =>
              cn(
                "font-mono tabular-nums",
                (r.weekday === "Sat" || r.weekday === "Sun") && "bg-muted/30",
                r.date === today() && "ring-1 ring-inset ring-primary/40",
                r.legacy && "bg-muted/20",
              )
            }
            empty={<div className="py-10 text-center text-muted-foreground text-sm">No data for this month</div>}
          />
          {/* Sticky total row */}
          {rows.length > 0 && (
            <div className="sticky bottom-0 z-10 flex items-center gap-4 overflow-x-auto border-t border-border bg-card px-3 py-2 text-xs font-mono">
              <span className="font-sans font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
              {visibleMoneyCols.map((c) => (
                <span key={c.key as string} className="whitespace-nowrap">
                  <span className="text-muted-foreground">{c.label}: </span>
                  <span className={Number(totals[c.key as string]) < 0 ? "cms-amount-negative" : undefined}>
                    {formatMoney(Math.round(Number(totals[c.key as string] || 0)), moneyMode)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </PageSection>
    </PageShell>
  );
};

export default DailyBalanceReport;
