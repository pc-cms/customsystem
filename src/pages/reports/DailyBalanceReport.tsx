/**
 * Reports → Daily Balance Sheet.
 *
 * Recreates the legacy "БАЛАНС" monthly spreadsheet: one row per business date,
 * grouped column blocks, opening/closing month rows and a Total row.
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
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

const money = (n: number) =>
  n === 0 ? <span className="text-muted-foreground">·</span> : (
    <span className={n < 0 ? "cms-amount-negative" : undefined}>{formatMoneyFull(n)}</span>
  );

const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const from = `${m}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from, to: `${m}-${String(last).padStart(2, "0")}` };
};

const DailyBalanceReport = () => {
  const { activeCasino } = useCasino();
  const qc = useQueryClient();
  const [month, setMonth] = useSessionState("dbr-month", currentMonth());
  const [groups, setGroups] = useState<Set<GroupKey>>(new Set(GROUPS.map((g) => g.key)));
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
    const sumKeys: (keyof DailyBalanceRow)[] = [
      "casino_result", "cash_desk_result", "tables_result", "slots_result", "bar_result",
      "collection_bank", "chip_difference", "tips_tables", "tips_slots",
      "office_in", "office_out", "office_transfer",
      "bank_terminal", "bank_fee", "bank_expenses", "credit_deposit", "expenses",
    ];
    for (const k of sumKeys) acc[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0);
    return acc;
  }, [rows]);

  const opening = rows[0];
  const closing = rows[rows.length - 1];

  const columns: ColumnDef<DailyBalanceRow>[] = [
    {
      key: "date", header: "Date", type: "date",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {fmtDate(r.date)} <span className="text-muted-foreground">{r.weekday}</span>
          {r.legacy && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">imp</Badge>}
        </span>
      ),
      sortValue: (r) => r.date,
    },
    { key: "rate_usd", header: "USD Rate", type: "int", accessor: (r) => formatMoneyFull(r.rate_usd), sortValue: (r) => r.rate_usd },
    { key: "casino_result", header: "Casino Result", type: "money", accessor: (r) => money(r.casino_result), sortValue: (r) => r.casino_result, hidden: () => !on("results") },
    { key: "cash_desk_result", header: "Cash Desk Result", type: "money", accessor: (r) => money(r.cash_desk_result), sortValue: (r) => r.cash_desk_result, hidden: () => !on("results") },
    { key: "tables_result", header: "Tables", type: "money", accessor: (r) => money(r.tables_result), sortValue: (r) => r.tables_result, hidden: () => !on("results") },
    { key: "slots_result", header: "Slots (net)", type: "money", accessor: (r) => money(r.slots_result), sortValue: (r) => r.slots_result, hidden: () => !on("results") },
    { key: "bar_result", header: "Bar / POS", type: "money", accessor: (r) => money(r.bar_result), sortValue: (r) => r.bar_result, hidden: () => !on("results") },
    { key: "cage_cash", header: "Cage Cash", type: "money", accessor: (r) => money(r.cage_cash), sortValue: (r) => r.cage_cash, hidden: () => !on("cage") },
    { key: "collection_bank", header: "Collection → Bank", type: "money", accessor: (r) => money(r.collection_bank), sortValue: (r) => r.collection_bank, hidden: () => !on("cage") },
    { key: "credit_deposit", header: "Credit / Deposit", type: "money", accessor: (r) => money(r.credit_deposit), sortValue: (r) => r.credit_deposit, hidden: () => !on("cage") },
    { key: "office_cash", header: "Office Safe", type: "money", accessor: (r) => money(r.office_cash), sortValue: (r) => r.office_cash, hidden: () => !on("office") },
    { key: "office_in", header: "Office In", type: "money", accessor: (r) => money(r.office_in), sortValue: (r) => r.office_in, hidden: () => !on("office") },
    { key: "office_out", header: "Office Out", type: "money", accessor: (r) => money(r.office_out), sortValue: (r) => r.office_out, hidden: () => !on("office") },
    { key: "office_transfer", header: "Internal Transfer", type: "money", accessor: (r) => money(r.office_transfer), sortValue: (r) => r.office_transfer, hidden: () => !on("office") },
    { key: "bank_terminal", header: "Terminal", type: "money", accessor: (r) => money(r.bank_terminal), sortValue: (r) => r.bank_terminal, hidden: () => !on("bank") },
    { key: "bank_fee", header: "Fee 2.5%", type: "money", accessor: (r) => money(Math.round(r.bank_fee)), sortValue: (r) => r.bank_fee, hidden: () => !on("bank") },
    { key: "bank_account", header: "Bank Account", type: "money", accessor: (r) => money(r.bank_account), sortValue: (r) => r.bank_account, hidden: () => !on("bank") },
    { key: "bank_expenses", header: "Bank Expenses", type: "money", accessor: (r) => money(r.bank_expenses), sortValue: (r) => r.bank_expenses, hidden: () => !on("bank") },
    { key: "chip_difference", header: "Chip Difference", type: "money", accessor: (r) => money(r.chip_difference), sortValue: (r) => r.chip_difference, hidden: () => !on("chips") },
    { key: "chips_float", header: "Chips Float", type: "money", accessor: (r) => money(r.chips_float), sortValue: (r) => r.chips_float, hidden: () => !on("chips") },
    { key: "tips_tables", header: "Tips Tables", type: "money", accessor: (r) => money(r.tips_tables), sortValue: (r) => r.tips_tables, hidden: () => !on("tips") },
    { key: "tips_slots", header: "Tips Slots", type: "money", accessor: (r) => money(r.tips_slots), sortValue: (r) => r.tips_slots, hidden: () => !on("tips") },
    { key: "expenses", header: "Expenses", type: "money", accessor: (r) => money(r.expenses), sortValue: (r) => r.expenses },
  ];

  const doExport = async () => {
    const visible = columns.filter((c) => !c.hidden?.({}));
    const header = visible.map((c) => String(c.header));
    const body = rows.map((r) =>
      visible.map((c) => {
        const v = (r as any)[c.key];
        return typeof v === "number" ? v : c.key === "date" ? r.date : String(v ?? "");
      }),
    );
    await downloadXlsx(`balance-${activeCasino?.slug ?? "casino"}-${month}.xlsx`, [
      { name: `Balance ${month}`, rows: [header, ...body] },
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

      <FilterBar
        search={
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="h-8 w-[150px] text-xs"
          />
        }
        filters={GROUPS.map((g) => (
          <Toggle
            key={g.key}
            size="sm"
            pressed={on(g.key)}
            onPressedChange={() => toggle(g.key)}
            className="h-8 px-2 text-xs"
          >
            {g.label}
          </Toggle>
        ))}
        right={
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground">Opening</span>
            <span>{formatMoneyFull((opening?.cage_cash ?? 0) + (opening?.office_cash ?? 0) + (opening?.bank_account ?? 0))}</span>
            <span className="text-muted-foreground">Closing</span>
            <span>{formatMoneyFull((closing?.cage_cash ?? 0) + (closing?.office_cash ?? 0) + (closing?.bank_account ?? 0))}</span>
          </div>
        }
      />

      <PageSection card={false}>
        <div className="max-h-[70vh] overflow-auto">
          <SmartTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.date}
            defaultSort={{ key: "date", dir: "asc" }}
            loading={isLoading}
            stickyFirstColumn
            rowClassName={(r) => (r.legacy ? "bg-muted/20" : undefined)}
            empty={<div className="py-10 text-center text-muted-foreground text-sm">No data for this month</div>}
          />
        </div>
      </PageSection>

      <PageSection title="Month totals">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 text-sm font-mono">
          {[
            ["Casino Result", totals.casino_result],
            ["Cash Desk", totals.cash_desk_result],
            ["Tables", totals.tables_result],
            ["Slots (net)", totals.slots_result],
            ["Bar / POS", totals.bar_result],
            ["Expenses", totals.expenses],
            ["Collections", totals.collection_bank],
            ["Terminal", totals.bank_terminal],
            ["Bank Fee", Math.round(totals.bank_fee)],
            ["Chip Difference", totals.chip_difference],
            ["Tips Tables", totals.tips_tables],
            ["Tips Slots", totals.tips_slots],
          ].map(([label, v]) => (
            <div key={String(label)} className="rounded-md border border-border p-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-sans">{label}</div>
              <div className={Number(v) < 0 ? "cms-amount-negative" : "cms-amount-positive"}>{formatMoneyFull(Number(v))}</div>
            </div>
          ))}
        </div>
      </PageSection>
    </PageShell>
  );
};

export default DailyBalanceReport;
