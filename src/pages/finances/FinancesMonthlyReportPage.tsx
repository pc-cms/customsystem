import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, ChevronRight, ChevronDown, Download, Pencil, Trash2, Plus } from "lucide-react";
import { EditExpenseDialog, type EditableExpense } from "@/components/expenses/EditExpenseDialog";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { OfficeActions, useOfficePeriod } from "@/components/office/office-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonthlyReport, type ReportCategory, type ReportGroup, type ReportExpense } from "@/hooks/use-fin-monthly-report";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { useModuleWrite } from "@/hooks/use-module-permissions";
import { useUpsertFinBudgetCell, useRenameFinCategory, useFinCategories, useArchiveFinCategory, useCreateFinCategory, useRenameFinGroup } from "@/hooks/use-fin";


import { InlineNumberCell } from "@/components/finances/InlineNumberCell";
import { MonthlyReportActions } from "@/components/finances/MonthlyReportActions";
import { useMonthFinance } from "@/hooks/use-fin-month-finance";
import { InlineTextCell } from "@/components/finances/InlineTextCell";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { cn } from "@/lib/utils";


const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const fmt = (n: number) => (n ? formatNumberSpaces(n) : "—");
/** Like fmt but always shows 0 (used in totals rows so empty groups still display a number). */
const fmtT = (n: number) => formatNumberSpaces(n || 0);
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—");

const cls = (n: number) => (n < 0 ? "cms-amount-negative" : n > 0 ? "cms-amount-positive" : "text-muted-foreground");

/**
 * Budget heat-map for "% spent" (actual / plan).
 *  < 90%        → green   (well under budget)
 *  90% – 100%   → neutral (on track)
 *  100% – 110%  → yellow  (slightly over)
 *  110% – 120%  → orange  (over)
 *  > 120%       → red     (significantly over)
 *  null/no plan → muted
 */
const pctTone = (spentRatio: number | null | undefined) => {
  if (spentRatio == null || !Number.isFinite(spentRatio)) return "text-muted-foreground";
  if (spentRatio > 1.2) return "text-red-500 font-semibold";
  if (spentRatio > 1.1) return "text-orange-500 font-semibold";
  if (spentRatio > 1.0) return "text-yellow-500";
  if (spentRatio >= 0.9) return "text-foreground";
  return "text-emerald-500";
};

/**
 * USD distinction:
 *  - `USD_COL`  → visible vertical-stripe background, applied to every USD <th>/<td>.
 *  - The `$` sign lives in the column header (header-size, muted color); body cells render numbers only.
 */
const USD_COL = "bg-muted/70 dark:bg-muted/40";
/** Renders an amount; falls back to muted "—" for zero/empty. */
const UsdAmt = ({ value, total = false, className }: { value: number; total?: boolean; className?: string }) => {
  const txt = total ? fmtT(value) : fmt(value);
  if (txt === "—") return <span className="text-muted-foreground">—</span>;
  return <span className={className}>{txt}</span>;
};



const CASINO_CODE: Record<string, string> = { arusha: "A", mwanza: "M", dodoma: "D", mbeya: "B" };

export default function FinancesMonthlyReportPage() {
  const now = new Date();
  const { accessibleCasinos, activeCasinoId } = useCasino();
  const isPremier = typeof window !== "undefined" && /(?:^|\.)premier\./.test(window.location.hostname);

  const { period } = useOfficePeriod();
  const year = period.year;
  const month = period.month;
  const [scope, setScope] = useState<string>(activeCasinoId || "");
  // Casino comes from the global casino context — no per-casino buttons here.
  useEffect(() => {
    setScope((s) => (s === "network" ? s : activeCasinoId || ""));
  }, [activeCasinoId]);


  const [expanded, setExpanded] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EditableExpense | null>(null);


  const { roles } = useAuth();
  const canWriteBudget = useModuleWrite("finance_budget");
  const canEdit = roles.includes("super_admin") || roles.includes("finance_manager") || canWriteBudget;
  const isNetwork = scope === "network";
  const editMode = canEdit && !isNetwork;

  const upsertBudget = useUpsertFinBudgetCell();
  const renameCategory = useRenameFinCategory();
  const archiveCategory = useArchiveFinCategory();
  const createCategory = useCreateFinCategory();
  const renameGroup = useRenameFinGroup();

  
  const { data: allCats } = useFinCategories();

  const { data: monthFinance } = useMonthFinance(
    isNetwork ? null : scope || activeCasinoId || null,
    year,
    month,
  );
  const { data, isLoading } = useMonthlyReport({ year, month, ytd: false, scope: scope || activeCasinoId || "" });

  const toggle = (id: string) => setExpanded((e) => (e === id ? null : id));

  const exportXlsx = async () => {
    if (!data) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 8 }] });
    const scopeName = scope === "network" ? "Network" : (accessibleCasinos.find((c) => c.id === scope)?.name || "");

    // Title block
    ws.mergeCells("A1:K1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `${scopeName} · ${MONTHS[month - 1]} ${year}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    // Incomes
    ws.getCell("A3").value = "Incomes";
    ws.getCell("A3").font = { bold: true };
    [["Table Result", data.incomes.table_result], ["Slot Result", data.incomes.slot_result], ["Bar Income", data.incomes.bar_income], ["Commissions", data.incomes.commissions], ["Total in TZS", data.incomes.total]]
      .forEach(([label, v], i) => {
        ws.getCell(`G${4 + i}`).value = label as string;
        ws.getCell(`H${4 + i}`).value = v as number;
        ws.getCell(`H${4 + i}`).numFmt = "# ##0";
        if (label === "Total in TZS") {
          ws.getCell(`G${4 + i}`).font = { bold: true };
          ws.getCell(`H${4 + i}`).font = { bold: true };
        }
      });

    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } } as const;
    const groupFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } } as const;
    const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } } as const;

    let r = 10;
    const COLS = 11; // Category + Plan(2) + Actual(4) + Remaining(4)
    const lastCol = "K";
    const pctCols = new Set([7, 11]); // Actual %, Remain %
    const writeHeader = () => {
      const headers = ["Category", "Plan TZS", "Plan USD", "Actual TZS", "Actual USD", "Actual Grand TZS", "Actual %", "Remain TZS", "Remain USD", "Remain Grand TZS", "Remain %"];
      headers.forEach((h, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10 };
        cell.fill = headerFill as any;
        cell.alignment = { horizontal: i === 0 ? "left" : "right" };
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
      });
      r++;
    };

    const writeCatRow = (c: typeof data.groups[number]["categories"][number]) => {
      const actPct = c.plan_month_grand_tzs ? c.actual_grand_tzs / c.plan_month_grand_tzs : null;
      const remPct = c.plan_month_grand_tzs ? c.remain_grand_tzs / c.plan_month_grand_tzs : null;
      const row = ws.getRow(r);
      row.values = [c.name, c.plan_month_tzs, c.plan_month_usd, c.actual_tzs, c.actual_usd, c.actual_grand_tzs, actPct, c.remain_tzs, c.remain_usd, c.remain_grand_tzs, remPct];
      for (let i = 2; i <= COLS; i++) {
        const cell = row.getCell(i);
        cell.numFmt = pctCols.has(i) ? "0%" : "# ##0;[Red](# ##0);—";
        cell.alignment = { horizontal: "right" };
      }
      r++;
    };

    const writeTotalRow = (t: typeof data.groups[number]["totals"]) => {
      const actPct = t.plan_month_grand_tzs ? t.actual_grand_tzs / t.plan_month_grand_tzs : null;
      const remPct = t.plan_month_grand_tzs ? t.remain_grand_tzs / t.plan_month_grand_tzs : null;
      const tr = ws.getRow(r);
      tr.values = ["Total", t.plan_month_tzs, t.plan_month_usd, t.actual_tzs, t.actual_usd, t.actual_grand_tzs, actPct, t.remain_tzs, t.remain_usd, t.remain_grand_tzs, remPct];
      for (let i = 1; i <= COLS; i++) {
        const cell = tr.getCell(i);
        cell.font = { bold: true };
        cell.fill = totalFill as any;
        if (i > 1) {
          cell.numFmt = pctCols.has(i) ? "0%" : "# ##0;[Red](# ##0);—";
          cell.alignment = { horizontal: "right" };
        }
      }
      r += 2;
    };

    for (const g of data.groups) {
      ws.mergeCells(`A${r}:${lastCol}${r}`);
      const gc = ws.getCell(`A${r}`);
      gc.value = g.name;
      gc.font = { bold: true, size: 12 };
      gc.fill = groupFill as any;
      r++;
      writeHeader();
      for (const c of g.categories) writeCatRow(c);
      writeTotalRow(g.totals);
    }

    // Collections section (excluded from grand)
    if (data.collections) {
      const col = data.collections;
      ws.mergeCells(`A${r}:${lastCol}${r}`);
      const cc = ws.getCell(`A${r}`);
      cc.value = col.name;
      cc.font = { bold: true, size: 12 };
      cc.fill = groupFill as any;
      r++;
      writeHeader();
      for (const c of col.categories) writeCatRow(c);
      writeTotalRow(col.totals);
    }


    // Grand total
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    ws.getCell(`A${r}`).value = "GRAND TOTAL";
    ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    ws.getCell(`A${r}`).fill = totalFill as any;
    r++;
    const g = data.grand;
    const gActPct = g.plan_month_grand_tzs ? g.actual_grand_tzs / g.plan_month_grand_tzs : null;
    const gRemPct = g.plan_month_grand_tzs ? g.remain_grand_tzs / g.plan_month_grand_tzs : null;
    const gr = ws.getRow(r);
    gr.values = ["", g.plan_month_tzs, g.plan_month_usd, g.actual_tzs, g.actual_usd, g.actual_grand_tzs, gActPct, g.remain_tzs, g.remain_usd, g.remain_grand_tzs, gRemPct];
    for (let i = 2; i <= COLS; i++) {
      const cell = gr.getCell(i);
      cell.font = { bold: true };
      cell.numFmt = pctCols.has(i) ? "0%" : "# ##0;[Red](# ##0);—";
      cell.alignment = { horizontal: "right" };
    }

    // Column widths
    ws.getColumn(1).width = 36;
    for (let i = 2; i <= COLS; i++) ws.getColumn(i).width = 14;


    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Monthly_Report_${year}_${String(month).padStart(2, "0")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      <OfficeActions>
        {data?.usd_rate ? (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            USD→TZS @ {formatNumberSpaces(Math.round(data.usd_rate))}
          </span>
        ) : null}
        {isPremier && (
          <Button
            variant={scope === "network" ? "default" : "outline"}
            size="sm"
            onClick={() => setScope(scope === "network" ? activeCasinoId || "" : "network")}
          >
            Network
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!data}><Download className="w-4 h-4" /> XLSX</Button>
      </OfficeActions>


      {/* SUMMARY — Incomes + Budget (Plan/Actual/Remain) + Profit & Net Balance, single compact table */}
      {data && <SummaryBlock data={data} />}

      {/* GROUPS */}
      {isLoading && <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>}
      {data?.groups.map((g) => (
        <GroupTable
          key={g.code}
          group={g}
          expandedId={expanded}
          onToggle={toggle}
          isNetwork={isNetwork}
          editMode={editMode}
          year={year}
          month={month}
          allCategories={allCats || []}
          onPlanCommit={(catId, currency, amount) =>
            upsertBudget.mutate({ year, month, category_id: catId, currency, planned_amount: amount })
          }
          onRenameCategory={(catId, newName) =>
            renameCategory.mutate({ id: catId, name: newName })
          }
          onArchiveCategory={(catId) => archiveCategory.mutate(catId)}
          onAddCategory={(name) => createCategory.mutate({ group_code: g.code, group_name: g.name, name, is_income: false })}
          onRenameGroup={(newName) => renameGroup.mutate({ group_code: g.code, name: newName })}

          onEditExpense={(e) => setEditRow({
            id: e.id,
            fin_category_id: e.fin_category_id,
            wallet_id: e.wallet_id,
            amount: e.amount,
            currency: e.currency,
            description: e.description,
            player_id: e.player_id,
            player_name: e.player_name,
            source: e.source,
          })}
        />
      ))}

      {/* COLLECTIONS — owner withdrawals, group table below operating groups */}
      {data?.collections && (
        <GroupTable
          key={data.collections.code}
          group={data.collections}
          expandedId={expanded}
          onToggle={toggle}
          isNetwork={isNetwork}
          editMode={editMode}
          year={year}
          month={month}
          allCategories={allCats || []}
          onPlanCommit={(catId, currency, amount) =>
            upsertBudget.mutate({ year, month, category_id: catId, currency, planned_amount: amount })
          }
          onRenameCategory={(catId, newName) =>
            renameCategory.mutate({ id: catId, name: newName })
          }
          onArchiveCategory={(catId) => archiveCategory.mutate(catId)}
          onAddCategory={(name) => createCategory.mutate({ group_code: data.collections!.code, group_name: data.collections!.name, name, is_income: false })}
          onRenameGroup={(newName) => renameGroup.mutate({ group_code: data.collections!.code, name: newName })}
          onEditExpense={(e) => setEditRow({
            id: e.id,
            fin_category_id: e.fin_category_id,
            wallet_id: e.wallet_id,
            amount: e.amount,
            currency: e.currency,
            description: e.description,
            player_id: e.player_id,
            player_name: e.player_name,
            source: e.source,
          })}
        />
      )}


      {!isNetwork && (
        <MonthlyReportActions
          casinoId={scope || activeCasinoId || null}
          year={year}
          month={month}
          finance={monthFinance ?? null}
          canFinance={canEdit}
        />
      )}

      <EditExpenseDialog
        open={!!editRow}
        onOpenChange={(o) => { if (!o) setEditRow(null); }}
        expense={editRow}
      />
    </PageShell>
  );
}


/**
 * Summary block — one compact table combining Incomes, Budget (Plan / Actual / Remain)
 * and Result (Profit / Collections / Net Balance). Remain = Plan/Month − Actual everywhere.
 */
const SummaryBlock = ({ data }: { data: import("@/hooks/use-fin-monthly-report").MonthlyReport }) => {
  const inc = data.incomes;
  const cash = data.cash;
  const kpi = data.kpi;
  const g = data.grand;
  const closed = data.month?.status === "closed";
  const closedAt = data.month?.closed_at || null;
  const pctTxt = (n: number, d: number) => (d ? pct(n / d) : "—");


  const cardHeader =
    "h-8 px-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border";
  const card = "rounded-md border border-border bg-card overflow-hidden flex flex-col";

  /** Dense label/value line used by all three detail cards. */
  const Line = ({
    label,
    v,
    hint,
    strong,
    signed,
    placeholder,
  }: {
    label: string;
    v?: number;
    hint?: string;
    strong?: boolean;
    signed?: boolean;
    placeholder?: string;
  }) => (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 px-3 border-t border-border",
        strong ? "h-10 bg-muted/30" : "h-8",
      )}
    >
      <span
        className={cn(
          "truncate",
          strong ? "text-[12px] font-semibold" : "text-[11px] text-muted-foreground",
        )}
      >
        {label}
        {hint ? <span className="ml-1 text-[10px] text-muted-foreground/70">· {hint}</span> : null}
      </span>
      {placeholder ? (
        <span className="font-mono text-[11px] text-muted-foreground/70 whitespace-nowrap">{placeholder}</span>
      ) : (
        <span
          className={cn(
            "font-mono tabular-nums whitespace-nowrap",
            strong ? "text-[15px] font-bold" : "text-[13px] font-semibold",
            signed ? cls(v || 0) : undefined,
          )}
        >
          {fmtT(v || 0)}
        </span>
      )}
    </div>
  );

  const KpiCard = ({
    label,
    v,
    formula,
    tone,
  }: {
    label: string;
    v: number;
    formula: string;
    tone?: "neutral" | "signed";
  }) => (
    <div className="rounded-md border border-border bg-card px-4 py-3 flex flex-col gap-1" title={formula}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-mono tabular-nums text-[24px] leading-none font-bold",
          tone === "signed" ? cls(v) : undefined,
        )}
      >
        {fmtT(v)}
      </div>
      <div className="text-[10px] text-muted-foreground/80 leading-snug">{formula}</div>
    </div>
  );

  return (
    <PageSection
      title="Month Summary"
      card={false}
      titleRight={
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border",
            closed
              ? "border-border bg-muted text-muted-foreground"
              : "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {closed ? `Closed${closedAt ? ` · ${fmtDateOnly(closedAt)}` : ""}` : "Open"}
        </span>
      }
    >
      {/* DETAIL GROUPS */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* A · INCOME */}
        <div className={card}>
          <div className={cardHeader}>
            <span>Income</span>
            <span className="normal-case tracking-normal text-[10px]">TZS</span>
          </div>
          <Line label="Table Result" v={inc.table_result} signed />
          <Line label="Slot Result" v={inc.slot_result} signed />
          <Line label="Bar Income" v={inc.bar_income} />
          <Line label="Commission" v={inc.commission} signed />
          <Line label="Agent Commission" v={inc.agent_commission} signed />
          <Line label="Fee" v={inc.fee} signed />
          <Line label="Total Income" v={kpi.total_income} strong signed />
        </div>

        {/* B · EXPENSES & OBLIGATIONS */}
        <div className={card}>
          <div className={cardHeader}>
            <span>Expenses &amp; Obligations</span>
            <span className="normal-case tracking-normal text-[10px]">
              {pctTxt(g.actual_grand_tzs, g.plan_month_grand_tzs)} of plan
            </span>
          </div>
          <Line label="Budget" hint="plan, Grand TZS" v={g.plan_month_grand_tzs} />
          <Line label="Total Actual Expenses" v={cash.expenses_actual} />
          <Line label="Unplanned Expenses" hint="total this month" v={cash.unplanned_expenses} />
          <Line label="· paid" v={cash.unplanned_paid} />
          <Line label="· unpaid" v={cash.unplanned_unpaid} />
          <Line label="Liabilities" hint="outstanding, closing" v={cash.liabilities} />
          <Line label="Liability Repayments" hint="cash out this month" v={cash.liability_payments} />
          <Line label="Collections" hint="cash already withdrawn" v={cash.collections_actual} />
          <Line label="Remain vs Budget" v={g.remain_grand_tzs} strong signed />
        </div>

        {/* C · CASH ADJUSTMENTS */}
        <div className={card}>
          <div className={cardHeader}>
            <span>Cash Adjustments</span>
            <span className="normal-case tracking-normal text-[10px]">not income</span>
          </div>
          <Line label="Opening Basic Float" v={cash.basic_float_opening} />
          <Line label="Float Adjustments (±)" v={cash.basic_float_add} signed />
          <Line label="Current Basic Float" v={cash.basic_float_current} strong />
          <Line label="Tips &amp; Bonuses (±)" v={inc.tips_bonus} signed />
          <Line label="JP (±)" v={inc.jp} signed />
          <Line label="Investment" v={inc.investment} signed />
          <Line label="Office" v={inc.office} signed />
          <Line label="Intercompany cash effect" v={cash.intercompany_cash} signed />
          <Line label="Card Balance adjustment" v={cash.card_balance} signed />
          <Line label="Miss Chips adjustment" v={cash.miss_chips} signed />
          <Line label="Miss Cards adjustment" v={cash.miss_cards} signed />
          <Line label="Available for Collection" v={cash.available_for_collection} strong />
        </div>
      </div>

      {/* D · KPI */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Total Income"
          v={kpi.total_income}
          tone="signed"
          formula="Table Result + Slot Result + Bar Income + Commissions"
        />
        <KpiCard
          label={closed ? "Final Profit" : "Expected Profit"}
          v={kpi.expected_profit}
          tone="signed"
          formula={
            closed
              ? "Total Income − Total Actual Expenses − Liabilities outstanding"
              : "Total Income − Budget − Unplanned − Liabilities outstanding"
          }
        />
        <KpiCard
          label="Cash Position"
          v={kpi.cash_position}
          tone="signed"
          formula="Float + Income ± wallet movements − Actual Expenses − Paid Unplanned − Liability Repayments − Collections"
        />
        <KpiCard
          label="Manager Bonus"
          v={kpi.manager_bonus}
          formula={
            closed
              ? "max(0, 5% × (Total Income − Total Actual Expenses))"
              : "max(0, 5% × (Total Income − Budget − Unplanned))"
          }
        />
      </div>


      {data.usd_rate > 0 && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Grand TZS uses USD→TZS @ {formatNumberSpaces(Math.round(data.usd_rate))}
        </div>
      )}
    </PageSection>
  );
};


type EditCallbacks = {
  editMode: boolean;
  year: number;
  month: number;
  allCategories: { id: string; name: string; group_name: string | null; group_code: string | null; is_active: boolean; is_income: boolean }[];
  onPlanCommit: (catId: string, currency: "TZS" | "USD", amount: number) => void;
  onRenameCategory: (catId: string, newName: string) => void;
  onArchiveCategory: (catId: string) => void;
  onEditExpense: (e: ReportExpense) => void;
  onAddCategory: (name: string) => void;
  onRenameGroup: (newName: string) => void;
};

const GroupTable = ({ group, expandedId, onToggle, isNetwork, ...edit }: {
  group: ReportGroup;
  expandedId: string | null;
  onToggle: (id: string) => void;
  isNetwork: boolean;
} & EditCallbacks) => {

  const { editMode, onAddCategory, onRenameGroup } = edit;
  const colCount = 11; // Category + Plan(2) + Actual(4) + Remaining(4)
  const titleNode = editMode ? (
    <div className="min-w-[220px]">
      <InlineTextCell value={group.name} onCommit={(v) => { if (v.trim() && v.trim() !== group.name) onRenameGroup(v.trim()); }} />
    </div>
  ) : group.name;
  const handleAdd = () => {
    const name = window.prompt(`New category in "${group.name}":`)?.trim();
    if (name) onAddCategory(name);
  };
  const t = group.totals;
  const tSpent = t.plan_month_grand_tzs ? t.actual_grand_tzs / t.plan_month_grand_tzs : null;
  const actPct = tSpent == null ? "—" : pct(tSpent);
  const remPct = t.plan_month_grand_tzs ? pct(t.remain_grand_tzs / t.plan_month_grand_tzs) : "—";
  return (
    <PageSection
      title={titleNode}
      titleRight={editMode ? (
        <Button variant="outline" size="sm" onClick={handleAdd} className="h-7 gap-1">
          <Plus className="w-3 h-3" /> Add category
        </Button>
      ) : undefined}
      card={false}
    >
      <div className="rounded-md border border-border overflow-auto bg-card">
        <table className="w-full text-[13px] border-collapse">
          <thead className="bg-muted/40">
            <tr className="[&>th]:h-8 [&>th]:px-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[11px] [&>th]:text-muted-foreground [&>th]:whitespace-nowrap">
              <th rowSpan={2} className="text-left sticky left-0 z-10 bg-muted/40 min-w-[220px] align-bottom">Category</th>
              <th colSpan={2} className="text-center border-l border-border">Plan</th>
              <th colSpan={4} className="text-center border-l border-border">Actual</th>
              <th colSpan={4} className="text-center border-l border-border">Remaining</th>
            </tr>
            <tr className="[&>th]:h-8 [&>th]:px-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[11px] [&>th]:text-muted-foreground [&>th]:whitespace-nowrap border-t border-border">
              <th className="text-right w-[110px] border-l border-border">TZS</th>
              <th className={cn("text-right w-[80px]", USD_COL)}>$</th>
              <th className="text-right w-[110px] border-l border-border">TZS</th>
              <th className={cn("text-right w-[80px]", USD_COL)}>$</th>
              <th className="text-right w-[110px]" title="Σ amount_tzs (TZS + USD converted)">Grand TZS</th>
              <th className="text-right w-[56px]">%</th>
              <th className="text-right w-[110px] border-l border-border">TZS</th>
              <th className={cn("text-right w-[80px]", USD_COL)}>$</th>
              <th className="text-right w-[110px]">Grand TZS</th>
              <th className="text-right w-[56px] pr-3">%</th>
            </tr>

          </thead>
          <tbody>
            {group.categories.map((c) => (
              <Row
                key={c.id}
                c={c}
                expanded={expandedId === c.id}
                onToggle={() => onToggle(c.id)}
                isNetwork={isNetwork}
                colCount={colCount}
                {...edit}
              />
            ))}

            {editMode && (
              <tr className="border-t border-dashed border-border [&>td]:h-8 [&>td]:px-2">
                <td colSpan={colCount} className="text-left">
                  <button
                    onClick={handleAdd}
                    className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add category to {group.name}
                  </button>
                </td>
              </tr>
            )}

            <tr className="bg-muted/40 font-semibold border-t-2 border-border [&>td]:h-9 [&>td]:px-2 [&>td]:align-middle">
              <td className="sticky left-0 z-10 bg-muted/40">Total</td>
              <td className="text-right font-mono tabular-nums border-l border-border">{fmtT(t.plan_month_tzs)}</td>
              <td className={cn("text-right font-mono tabular-nums", USD_COL)}><UsdAmt value={t.plan_month_usd} total /></td>
              <td className="text-right font-mono tabular-nums border-l border-border">{fmtT(t.actual_tzs)}</td>
              <td className={cn("text-right font-mono tabular-nums", USD_COL)}><UsdAmt value={t.actual_usd} total /></td>
              <td className="text-right font-mono tabular-nums">{fmtT(t.actual_grand_tzs)}</td>
              <td className={cn("text-right font-mono tabular-nums", pctTone(tSpent))}>{actPct}</td>
              <td className="text-right font-mono tabular-nums border-l border-border">{fmtT(t.remain_tzs)}</td>
              <td className={cn("text-right font-mono tabular-nums", USD_COL)}><UsdAmt value={t.remain_usd} total /></td>
              <td className={cn("text-right font-mono tabular-nums", cls(t.remain_grand_tzs))}>{fmtT(t.remain_grand_tzs)}</td>

              <td className={cn("text-right font-mono tabular-nums pr-3", pctTone(tSpent))}>{remPct}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageSection>
  );
};


const Row = ({ c, expanded, onToggle, isNetwork, colCount, editMode, year, month, allCategories, onPlanCommit, onRenameCategory, onArchiveCategory, onEditExpense }: {
  c: ReportCategory; expanded: boolean; onToggle: () => void; isNetwork: boolean; colCount: number;
} & EditCallbacks) => {
  const spent = c.plan_month_grand_tzs ? c.actual_grand_tzs / c.plan_month_grand_tzs : null;
  const actPct = spent == null ? "—" : pct(spent);
  const remPct = c.plan_month_grand_tzs ? pct(c.remain_grand_tzs / c.plan_month_grand_tzs) : "—";
  return (
    <>
      <tr
        className={cn(
          "border-t border-border hover:bg-muted/30 cursor-pointer [&>td]:h-8 [&>td]:px-2 [&>td]:align-middle",
          expanded && "bg-muted/30",
        )}
        onClick={onToggle}
      >
        <td className="sticky left-0 z-10 bg-card">
          <div className="flex items-center gap-1 min-w-0">
            {expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            <div className="flex-1 min-w-0">
              <InlineTextCell
                value={c.name}
                disabled={!editMode}
                onCommit={(v) => onRenameCategory(c.id, v)}
              />
            </div>
            {c.expenses.length > 0 && <span className="text-[11px] text-muted-foreground shrink-0">({c.expenses.length})</span>}
            {editMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (confirm(`Archive category "${c.name}"?\n\nIt will be hidden from the Monthly Report and from new expense forms, but past expenses and budgets remain intact.`)) {
                    onArchiveCategory(c.id);
                  }
                }}
                aria-label="Archive category"
                title="Archive category"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </td>
        <td className="text-right border-l border-border">
          <InlineNumberCell
            value={c.plan_month_tzs}
            disabled={!editMode}
            onCommit={(v) => onPlanCommit(c.id, "TZS", v)}
          />
        </td>
        <td className={cn("text-right", USD_COL)}>
          <InlineNumberCell
            value={c.plan_month_usd}
            disabled={!editMode}
            onCommit={(v) => onPlanCommit(c.id, "USD", v)}
          />
        </td>

        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(c.actual_tzs)}</td>
        <td className={cn("text-right font-mono tabular-nums", USD_COL)}><UsdAmt value={c.actual_usd} /></td>
        <td className="text-right font-mono tabular-nums">{fmt(c.actual_grand_tzs)}</td>
        <td className={cn("text-right font-mono tabular-nums", pctTone(spent))}>{actPct}</td>
        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(c.remain_tzs)}</td>
        <td className={cn("text-right font-mono tabular-nums", USD_COL)}><UsdAmt value={c.remain_usd} /></td>
        <td className={cn("text-right font-mono tabular-nums", cls(c.remain_grand_tzs))}>{fmt(c.remain_grand_tzs)}</td>

        <td className={cn("text-right font-mono tabular-nums pr-3", pctTone(spent))}>{remPct}</td>
      </tr>





      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={colCount} className="px-3 py-2">
            {c.expenses.length === 0 ? (
              <div className="text-[11px] text-muted-foreground text-center py-2">No expenses recorded</div>
            ) : (
              <div className="rounded-md border border-border overflow-auto bg-card">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-muted/30">
                    <tr className="[&>th]:h-7 [&>th]:px-2 [&>th]:text-[10px] [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-muted-foreground">
                      <th className="text-left w-[88px]">Date</th>
                      {isNetwork && <th className="text-left w-[44px]">Cas</th>}
                      <th className="text-left">Description</th>
                      <th className="text-left w-[140px]">Wallet</th>
                      <th className="text-right w-[120px]">Amount</th>
                      <th className="text-right w-[120px]">TZS</th>
                      {editMode && <th className="w-[40px]"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {c.expenses.map((e) => (
                      <tr key={e.id} className="border-t border-border [&>td]:h-7 [&>td]:px-2 [&>td]:align-middle">
                        <td className="font-mono tabular-nums text-[10px] text-muted-foreground">{fmtDateOnly(e.business_date)}</td>
                        {isNetwork && <td className="font-mono text-[10px]">{CASINO_CODE[e.casino_slug || ""] || (e.casino_slug || "").slice(0, 3).toUpperCase()}</td>}
                        <td className="text-foreground"><span className="block truncate max-w-[420px]" title={e.description || ""}>{e.description || <span className="text-muted-foreground italic">—</span>}</span></td>
                        <td className="text-muted-foreground"><span className="block truncate max-w-[140px]" title={e.wallet_name || ""}>{e.wallet_name || "—"}</span></td>
                        <td className="text-right font-mono tabular-nums">
                          {formatNumberSpaces(e.amount)}
                          {e.currency && e.currency !== "TZS" && <span className="ml-1 text-[10px] text-muted-foreground">{e.currency}</span>}
                        </td>
                        <td className="text-right font-mono tabular-nums">{formatNumberSpaces(e.amount_tzs)}</td>
                        {editMode && (
                          <td className="pr-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => onEditExpense(e)}
                              aria-label="Edit expense"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold [&>td]:h-7 [&>td]:px-2">
                      <td colSpan={isNetwork ? 5 : 4}>Total · {c.expenses.length}</td>
                      <td className="text-right font-mono tabular-nums">{formatNumberSpaces(c.actual_tzs)}</td>
                      {editMode && <td />}
                    </tr>

                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};
