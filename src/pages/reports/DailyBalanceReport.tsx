/**
 * Reports → Daily Balance Sheet.
 *
 * Recreates the legacy "БАЛАНС" monthly spreadsheet: one row per business date,
 * grouped column blocks, month KPI tiles on top and a sticky Total footer row.
 * All figures in TZS. Data comes from the live system; months that predate the
 * system can be filled with the legacy Excel importer.
 */
import { useMemo, useRef, useState } from "react";
import { Wallet2, Download, Upload, Loader2 } from "lucide-react";
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
import { downloadXlsx } from "@/lib/excel-export";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDailyBalanceReport, type DailyBalanceRow } from "@/hooks/use-daily-balance-report";

type GroupKey = "results" | "cage" | "office" | "bank" | "chips" | "tips";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "results", label: "Results" },
  { key: "cage", label: "Cage" },
  { key: "office", label: "Office Safe" },
  { key: "bank", label: "Bank" },
  { key: "chips", label: "Chips" },
  { key: "tips", label: "Tips" },
];

const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const from = `${m}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from, to: `${m}-${String(last).padStart(2, "0")}` };
};

const today = () => new Date().toISOString().slice(0, 10);

/** All money columns in display order, with their group + label. */
const MONEY_COLS: { key: keyof DailyBalanceRow; label: string; group: GroupKey | null; first?: boolean }[] = [
  { key: "casino_result", label: "Casino Result", group: "results", first: true },
  { key: "cash_desk_result", label: "Cash Desk", group: "results" },
  { key: "tables_result", label: "Tables", group: "results" },
  { key: "slots_result", label: "Slots (net)", group: "results" },
  { key: "bar_result", label: "Bar", group: "results" },
  { key: "credit_deposit", label: "Credit / Deposit", group: "results" },
  { key: "day_total", label: "Day Total", group: "results" },
  { key: "day_balance", label: "Day Balance", group: "results" },
  { key: "cage_cash", label: "Cage Cash", group: "cage", first: true },
  { key: "collection_bank", label: "Collection → Bank", group: "cage" },
  { key: "office_cash", label: "Office Safe", group: "office", first: true },
  { key: "office_in", label: "Office In", group: "office" },
  { key: "office_out", label: "Office Out", group: "office" },
  { key: "office_transfer", label: "Int. Transfer", group: "office" },
  { key: "bank_terminal", label: "Terminal (net)", group: "bank", first: true },
  { key: "bank_fee", label: "Fee 3%", group: "bank" },
  { key: "bank_account", label: "Bank Account", group: "bank" },
  { key: "bank_expenses", label: "Bank Expenses", group: "bank" },
  { key: "chip_difference", label: "Chip Diff", group: "chips", first: true },
  { key: "chips_float", label: "Chips Float", group: "chips" },
  { key: "tips_tables", label: "Tips Tables", group: "tips", first: true },
  { key: "tips_slots", label: "Tips Slots", group: "tips" },
  { key: "expenses", label: "Expenses", group: null, first: true },
];


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
  const qc = useQueryClient();
  const [month, setMonth] = useSessionState("dbr-month", currentMonth());
  const [groups, setGroups] = useState<Set<GroupKey>>(new Set(GROUPS.map((g) => g.key)));
  const [hideEmpty, setHideEmpty] = useSessionState("dbr-hide-empty", true);
  const [moneyMode, setMoneyMode] = useSessionState<MoneyDisplayMode>("dbr-money", "compact");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { from, to } = monthBounds(month);
  const { data: rows = [], isLoading } = useDailyBalanceReport(from, to);

  const on = (g: GroupKey) => groups.has(g);
  const toggle = (g: GroupKey) =>
    setGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of MONEY_COLS) acc[c.key as string] = rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
    return acc;
  }, [rows]);

  /** Always-visible columns (manual entry / day formulas). */
  const ALWAYS = new Set(["credit_deposit", "day_total", "day_balance"]);

  /** Columns whose every value is 0 across the month (candidates for hiding). */
  const emptyCols = useMemo(() => {
    const s = new Set<string>();
    for (const c of MONEY_COLS) {
      if (ALWAYS.has(c.key as string)) continue;
      if (rows.every((r) => !Number(r[c.key]))) s.add(c.key as string);
    }
    return s;
  }, [rows]);

  const money = (n: number) =>
    !n ? <span className="text-muted-foreground">·</span> : (
      <span className={n < 0 ? "cms-amount-negative" : undefined}>{formatMoney(n, moneyMode)}</span>
    );

  const visibleMoneyCols = MONEY_COLS.filter(
    (c) => (!c.group || on(c.group)) && !(hideEmpty && emptyCols.has(c.key as string)),
  );

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
    {
      key: "rate_usd",
      header: "USD",
      type: "int",
      accessor: (r) => <span className="text-muted-foreground">{formatMoney(r.rate_usd, "full")}</span>,
      sortValue: (r) => r.rate_usd,
    },
    ...visibleMoneyCols.map<ColumnDef<DailyBalanceRow>>((c) => ({
      key: c.key as string,
      header: c.label,
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
        c.first && "border-l border-border",
        (c.key === "day_total" || c.key === "day_balance") && "font-semibold",
      ),
      cellClassName: cn(
        c.first && "border-l border-border",
        (c.key === "day_total" || c.key === "day_balance") && "font-semibold bg-muted/20",
      ),
    })),
  ];


  const doExport = async () => {
    const header = ["Date", "Day", "USD Rate", ...visibleMoneyCols.map((c) => c.label)];
    const body = rows.map((r) => [
      r.date,
      r.weekday,
      r.rate_usd,
      ...visibleMoneyCols.map((c) => Math.round(Number(r[c.key] || 0))),
    ]);
    const totalRow = ["TOTAL", "", "", ...visibleMoneyCols.map((c) => Math.round(totals[c.key as string] || 0))];
    await downloadXlsx(`balance-${activeCasino?.slug ?? "casino"}-${month}.xlsx`, [
      { name: `Balance ${month}`, rows: [header, ...body, totalRow] },
    ]);
  };

  const doImport = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("casino_id", activeCasino?.id ?? "");
      const { data, error } = await supabase.functions.invoke("fin-balance-import", { body: fd });
      if (error) throw error;
      toast.success(`Imported ${(data as any)?.saved ?? 0} days`);
      qc.invalidateQueries({ queryKey: ["daily-balance-report"] });
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const tiles: { label: string; value: number }[] = [
    { label: "Casino Result", value: totals.casino_result },
    { label: "Cash Desk", value: totals.cash_desk_result },
    { label: "Tables", value: totals.tables_result },
    { label: "Slots (net)", value: totals.slots_result },
    { label: "Bar / POS", value: totals.bar_result },
    { label: "Expenses", value: totals.expenses },
    { label: "Collections", value: totals.collection_bank },
    { label: "Terminal", value: totals.bank_terminal },
    { label: "Bank Fee", value: totals.bank_fee },
    { label: "Chip Diff", value: totals.chip_difference },
    { label: "Tips Tables", value: totals.tips_tables },
    { label: "Tips Slots", value: totals.tips_slots },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={Wallet2}
        title="Daily Balance Sheet"
        subtitle="Legacy balance layout rebuilt from live data — all figures in TZS"
        context={activeCasino?.name}
      >
        <Button variant="outline" size="sm" onClick={doExport}>
          <Download className="w-4 h-4 mr-2" /> Export
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }}
        />
        <Button size="sm" disabled={importing} onClick={() => fileRef.current?.click()}>
          {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Import
        </Button>
      </PageHeader>

      {/* KPI tiles first — month at a glance */}
      <PageSection card={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border border-border bg-card px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{t.label}</div>
              <div
                className={cn(
                  "font-mono text-sm tabular-nums",
                  Number(t.value) < 0 ? "cms-amount-negative" : Number(t.value) > 0 ? "cms-amount-positive" : "text-muted-foreground",
                )}
              >
                {formatMoney(Math.round(Number(t.value || 0)), "full")}
              </div>
            </div>
          ))}
        </div>
      </PageSection>

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
          ...GROUPS.map((g) => (
            <Toggle
              key={g.key}
              size="sm"
              pressed={on(g.key)}
              onPressedChange={() => toggle(g.key)}
              className="h-8 px-2 text-xs"
            >
              {g.label}
            </Toggle>
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
