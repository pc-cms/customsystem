import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, ChevronRight, ChevronDown, Download, Pencil, Trash2, Plus } from "lucide-react";
import { EditExpenseDialog, type EditableExpense } from "@/components/expenses/EditExpenseDialog";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { OfficeHeaderActions, useOfficePeriod } from "@/components/office/office-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonthlyReport, type ReportCategory, type ReportGroup, type ReportExpense } from "@/hooks/use-fin-monthly-report";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { useModuleWrite } from "@/hooks/use-module-permissions";
import { useCancelExpenseAsManager } from "@/hooks/use-expenses";
import { useUpsertFinBudgetCell, useRenameFinCategory, useFinCategories, useArchiveFinCategory, useCreateFinCategory, useRenameFinGroup } from "@/hooks/use-fin";


import { InlineNumberCell } from "@/components/finances/InlineNumberCell";
import { MonthlyReportActions } from "@/components/finances/MonthlyReportActions";
import { useMonthFinance, useOverrideManagerBonus } from "@/hooks/use-fin-month-finance";

import { InlineTextCell } from "@/components/finances/InlineTextCell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { NumberInput } from "@/components/ui/number-input";
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
/** Amber = warning / obligation / unpaid. Never red — an obligation is not an error. */
const WARN = "text-amber-600 dark:text-amber-400";


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
  const [delRow, setDelRow] = useState<ReportExpense | null>(null);
  const cancelExpense = useCancelExpenseAsManager();


  const { roles } = useAuth();
  const canWriteBudget = useModuleWrite("finance_budget");
  const canEdit = roles.includes("super_admin") || roles.includes("finance_manager") || canWriteBudget;
  const isNetwork = scope === "network";
  const canDelete = roles.includes("super_admin") || roles.includes("finance_manager");
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
    for (const extra of [data.collections, data.capex]) {
      if (!extra) continue;
      ws.mergeCells(`A${r}:${lastCol}${r}`);
      const cc = ws.getCell(`A${r}`);
      cc.value = extra.name;
      cc.font = { bold: true, size: 12 };
      cc.fill = groupFill as any;
      r++;
      writeHeader();
      for (const c of extra.categories) writeCatRow(c);
      writeTotalRow(extra.totals);
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
      <OfficeHeaderActions>


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
      </OfficeHeaderActions>


      {/* SUMMARY — Incomes + Budget (Plan/Actual/Remain) + Profit & Net Balance, single compact table */}
      {data && (
        <SummaryBlock
          data={data}
          casinoId={isNetwork ? null : scope || activeCasinoId || null}
          canFinance={canEdit && !isNetwork}
        />
      )}


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
          onDeleteExpense={canDelete ? ((e) => setDelRow(e)) : undefined}
        />
      ))}

      {/* COLLECTIONS & CAPEX — below operating groups, excluded from grand */}
      {[data?.collections, data?.capex].filter(Boolean).map((grp) => (
        <GroupTable
          key={grp!.code}
          group={grp!}
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
          onAddCategory={(name) => createCategory.mutate({ group_code: grp!.code, group_name: grp!.name, name, is_income: false })}
          onRenameGroup={(newName) => renameGroup.mutate({ group_code: grp!.code, name: newName })}
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
          onDeleteExpense={canDelete ? ((e) => setDelRow(e)) : undefined}
        />
      ))}


      {!isNetwork && (
        <MonthlyReportActions
          casinoId={scope || activeCasinoId || null}
          year={year}
          month={month}
          finance={monthFinance ?? null}
          canFinance={canEdit}
        />
      )}

      <ResponsiveDialog
        open={!!delRow}
        onOpenChange={(o) => { if (!o) setDelRow(null); }}
        title="Delete expense"
        description="This permanently removes the record from Expenses, the Monthly Report and wallet balances. The action is written to the audit log."
      >
        {delRow && (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 text-[12px] space-y-1">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Date</span><span className="font-mono">{fmtDateOnly(delRow.business_date)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Description</span><span className="text-right">{delRow.description || "—"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Wallet</span><span>{delRow.wallet_name || "—"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Amount</span><span className="font-mono">{formatNumberSpaces(delRow.amount)} {delRow.currency || "TZS"}</span></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelRow(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={cancelExpense.isPending}
                onClick={() => {
                  const r = delRow;
                  cancelExpense.mutate(
                    { id: r.id, amount: r.amount, category: r.fin_category_id || "", approved: true, reason: "Deleted from Monthly Report" },
                    { onSuccess: () => setDelRow(null) },
                  );
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>

      <EditExpenseDialog
        open={!!editRow}
        onOpenChange={(o) => { if (!o) setEditRow(null); }}
        expense={editRow}
      />
    </PageShell>
  );
}


/**
 * Summary header — KPI tiles first, then three equal-width cards:
 * Month Summary / Income · Expenses & Obligations · Cash Adjustments.
 * Collapsible sections (Unplanned, Liabilities, Deposits) are real buttons,
 * so keyboard focus and Enter/Space work without extra handlers.
 */
const SummaryBlock = ({
  data,
  casinoId,
  canFinance,
}: {
  data: import("@/hooks/use-fin-monthly-report").MonthlyReport;
  casinoId: string | null;
  canFinance: boolean;
}) => {
  const inc = data.incomes;
  const cash = data.cash;
  const kpi = data.kpi;
  const g = data.grand;
  const mf = data.month;
  const closed = mf?.status === "closed";
  const closedAt = mf?.closed_at || null;





  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggleSection = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  /* Manager Bonus override — closed months only, reason mandatory, fully audited. */
  const bonusOverride = mf?.manager_bonus_override || null;
  const overrideBonus = useOverrideManagerBonus();
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("");

  const unplannedItems = (mf?.unplanned?.items || []).filter(
    (i) => !i.voided_at && !i.reversal_of && Number(i.amount_tzs || 0) > 0,
  );
  const liabilityItems = (mf?.liabilities?.items || []).filter((l) => !l.voided_at);
  const liabilityPayments = mf?.liabilities?.payments || [];

  const depositsTotal = cash.deposits;
  const investmentItems = cash.investment_items || [];
  const collectionCats = (data.collections?.categories || []).filter((c) => Number(c.actual_grand_tzs || 0) !== 0);
  const capexCats = (data.capex?.categories || []).filter((c) => Number(c.actual_grand_tzs || 0) !== 0);
  const capexTotal = data.capex?.totals.actual_grand_tzs || 0;

  /** Pending Est Expenses = Budget − Paid Expenses (negative = overspent). */
  const pendingEstExpenses = g.plan_month_grand_tzs - cash.expenses_actual;
  /** Current Cash Balance = Total In − Paid Expense − Deposits − Investment − Collection. */
  const currentCashBalance =
    kpi.total_income - cash.expenses_actual - cash.deposits - inc.investment - cash.collections_actual;




  const cardHeader =
    "h-10 px-3 flex items-center justify-between gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 border-b border-border";
  const card = "rounded-md border border-border bg-card overflow-hidden flex flex-col";

  /** Readable label/value line used by all three cards. */
  const Line = ({
    label,
    v,
    strong,
    signed,
    sub,
    tip,
    right,
  }: {
    label: string;
    v: number;
    strong?: boolean;
    signed?: boolean;
    sub?: boolean;
    /** Formula/explanation shown on hover AND keyboard focus. */
    tip?: string;
    /** Optional trailing control (e.g. Override button). */
    right?: React.ReactNode;
  }) => {
    const labelNode = (
      <span
        className={cn(
          "truncate leading-snug",
          strong ? "text-[16px] font-semibold" : sub ? "text-[13px] text-muted-foreground" : "text-[14px] font-medium",
          tip && "decoration-dotted underline-offset-4 underline decoration-muted-foreground/50",
        )}
      >
        {label}
      </span>
    );
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-3 border-t border-border",
          strong ? "min-h-[44px] bg-muted/30" : "min-h-[40px]",
          sub && "pl-6",
        )}
      >
        {tip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                {labelNode}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[320px] text-[12px] leading-snug">{tip}</TooltipContent>
          </Tooltip>
        ) : (
          labelNode
        )}
        <span className="flex items-center gap-2 shrink-0">
          {right}
          <span
            className={cn(
              "font-mono tabular-nums whitespace-nowrap",
              strong ? "text-[17px] font-bold" : sub ? "text-[13px]" : "text-[15px] font-semibold",
              signed ? cls(v || 0) : undefined,
            )}
          >
            {fmtT(v || 0)}
          </span>
        </span>
      </div>
    );
  };

  /** Collapsible summary row: header button + revealed detail children. */
  const Section = ({
    id,
    label,
    total,
    signed,
    tone,
    tip,
    children,
  }: {
    id: string;
    label: string;
    total: number;
    signed?: boolean;
    /** `warn` = obligation / unpaid — amber, never red. */
    tone?: "warn";
    tip?: string;
    children: React.ReactNode;
  }) => {
    const isOpen = !!open[id];
    const head = (
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => toggleSection(id)}
        className="w-full min-h-[40px] px-3 flex items-center justify-between gap-3 text-left hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "text-[14px] font-medium truncate",
              tip && "decoration-dotted underline-offset-4 underline decoration-muted-foreground/50",
            )}
          >
            {label}
          </span>
        </span>
        <span
          className={cn(
            "font-mono tabular-nums text-[15px] font-semibold whitespace-nowrap",
            tone === "warn" ? WARN : signed ? cls(total || 0) : undefined,
          )}
        >
          {fmtT(total || 0)}
        </span>
      </button>
    );
    return (
      <div className="border-t border-border">
        {tip ? (
          <Tooltip>
            <TooltipTrigger asChild>{head}</TooltipTrigger>
            <TooltipContent className="max-w-[320px] text-[12px] leading-snug">{tip}</TooltipContent>
          </Tooltip>
        ) : (
          head
        )}
        {isOpen && <div className="bg-muted/20 pb-1">{children}</div>}
      </div>
    );
  };


  const DetailRow = ({
    left,
    label,
    value,
    tag,
    tone,
  }: {
    left?: string;
    label: string;
    value: number;
    tag?: string;
    tone?: "warn";
  }) => (
    <div className="flex items-center gap-2 px-3 py-1 text-[12px] border-t border-border/40">
      {left ? <span className="w-20 shrink-0 font-mono text-muted-foreground">{left}</span> : null}
      <span className="flex-1 truncate" title={label}>{label}</span>
      {tag ? (
        <span className={cn("text-[11px] uppercase", tone === "warn" ? WARN : "text-muted-foreground")}>{tag}</span>
      ) : null}
      <span className={cn("font-mono tabular-nums w-28 text-right", tone === "warn" && WARN)}>{fmtT(value)}</span>
    </div>

  );

  /**
   * KPI tile — the formula lives in a tooltip (hover AND keyboard focus),
   * never as permanent micro-copy under the number.
   */
  const KpiCard = ({
    label,
    v,
    formula,
    tone,
    footer,
  }: {
    label: string;
    v: number;
    formula: string;
    tone?: "neutral" | "signed";
    footer?: React.ReactNode;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className="rounded-md border border-border bg-card px-4 py-3 flex flex-col gap-2 min-h-[104px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div
            className={cn(
              "font-mono tabular-nums text-[30px] leading-none font-bold",
              tone === "signed" ? cls(v) : undefined,
            )}
          >
            {fmtT(v)}
          </div>
          {footer}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px] text-[12px] leading-snug">{formula}</TooltipContent>
    </Tooltip>
  );





  return (
    <PageSection
      title="Month Summary"
      card={false}
      titleRight={
        <span
          className={cn(
            "text-[12px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border",
            closed
              ? "border-border bg-muted text-muted-foreground"
              : "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {closed ? `Closed${closedAt ? ` · ${fmtDateOnly(closedAt)}` : ""}` : "Open"}
        </span>
      }
    >
      {/* KPI TILES — Income → Budget → Paid → Pending → Profit → Cash Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-stretch">
        <KpiCard
          label="Total Income"
          v={kpi.total_income}
          tone="signed"
          formula="Table Result + Slot Result + Bar Income + Commissions"
        />
        <KpiCard
          label="Budget"
          v={g.plan_month_grand_tzs}
          formula="Planned cost base of the month (Grand TZS = TZS + USD converted)."
        />

        <KpiCard
          label="Paid Expenses"
          v={cash.expenses_actual}
          formula="Σ approved expenses actually paid in the month (Grand TZS)."
        />
        <KpiCard
          label="Pending Est Expenses"
          v={pendingEstExpenses}
          tone="signed"
          formula="Remaining planned cost base: Budget − Paid Expenses. Negative means the budget is already overspent."
        />
        <KpiCard
          label={closed ? "Final Profit" : "Current Profit"}
          v={kpi.expected_profit}
          tone="signed"
          formula={
            closed
              ? "Final · Total Income − Actual Expenses − Extra Expenses not in Actual − Liabilities (frozen at close)"
              : "Forecast · Total Income − Budget − Extra Expenses − Liabilities − Collections"
          }
        />
        <KpiCard
          label="Current Cash Balance"
          v={currentCashBalance}
          tone="signed"
          formula="Total In − Paid Expense − Deposits − Investment − Collection."
        />

      </div>


      {/* THREE EQUAL SUMMARY CARDS — exactly 5 primary rows each when collapsed */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
        {/* A · MONTH SUMMARY / INCOME */}
        <div className={card}>
          <div className={cardHeader}>
            <span>Month Summary · Income</span>
            <span className="normal-case tracking-normal text-[12px]">TZS</span>
          </div>
          <Line label="Table Result" v={inc.table_result} signed tip="Σ closed-day table results of the month." />
          <Line label="Slot Result" v={inc.slot_result} signed tip="Σ closed-day cashdesk_win of the month." />
          <Line label="Agents" v={inc.agent_commission} signed tip="Agent commission recorded on the income side." />
          <Line label="Bar Income" v={inc.bar_income} tip="POS / bar revenue counted once, in income and in cash." />

          <div className="flex-1" />

        </div>

        {/* B · EXPENSES & OBLIGATIONS */}
        <div className={card}>
          <div className={cardHeader}>
            <span>Expenses &amp; Obligations</span>
          </div>

          <Section
            id="commissions_fee"
            label="Commissions & Fee"
            total={inc.commission + inc.fee}
            signed
            tip="Commissions and Fee are income-side lines shown here for completeness; they are never deducted from this card's total."
          >
            <DetailRow label="Commissions" value={inc.commission} />
            <DetailRow label="Fee" value={inc.fee} />
          </Section>
          <Section
            id="unplanned"
            label="Extra Expenses"
            total={cash.unplanned_expenses}
            tip={`All extra expenses of the month (Manager Bonus excluded) · ${fmtT(cash.unplanned_paid)} paid · ${fmtT(cash.unplanned_unpaid)} unpaid. Expand to see each row.`}
          >
            {unplannedItems.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No extra expenses this month.</div>
            ) : (
              unplannedItems.map((i) => (
                <DetailRow
                  key={i.id}
                  left={fmtDateOnly(i.business_date)}
                  label={i.description || i.label}
                  value={i.amount_tzs}
                  tag={i.paid ? "Paid" : "Unpaid"}
                  tone={i.paid ? undefined : "warn"}
                />
              ))
            )}
          </Section>
          <Section
            id="liabilities"
            label="Liabilities"
            total={cash.liabilities}
            tone={cash.liabilities > 0 ? "warn" : undefined}
            tip="Opening + repayable funding (incl. intercompany transfers that must be repaid) + manual liabilities − repayments = closing outstanding. Non-repayable transfers and Add Float never become liabilities."
          >
            <DetailRow label="Opening" value={mf?.liabilities?.opening_tzs || 0} />
            <DetailRow label="New this month" value={mf?.liabilities?.new_tzs || 0} />
            <DetailRow label="Repaid" value={-(mf?.liabilities?.repaid_tzs || 0)} />
            <DetailRow label="Closing outstanding" value={mf?.liabilities?.closing_tzs || 0} tone={(mf?.liabilities?.closing_tzs || 0) > 0 ? "warn" : undefined} />
            {liabilityItems.map((l) => (
              <DetailRow
                key={l.id}
                left={fmtDateOnly(l.business_date)}
                label={`${l.creditor}${l.description ? ` · ${l.description}` : ""}`}
                value={l.outstanding_tzs}
                tag={l.status}
                tone={l.status === "paid" ? undefined : "warn"}
              />
            ))}
            {liabilityPayments.map((p) => (
              <DetailRow
                key={p.id}
                left={fmtDateOnly(p.business_date)}
                label={p.note || "Repayment"}
                value={-p.amount_tzs}
                tag="paid"
              />
            ))}
            {/* Transfers appear here for context only — cash/accounting logic is unchanged. */}
            <DetailRow label="Transfers · cash effect" value={cash.intercompany_cash} tag="cash" />
            <DetailRow label="Transfers · repayable to us" value={cash.intercompany_receivable} tag="receivable" />
            <DetailRow
              label="Transfers · repayable by us"
              value={cash.intercompany_liability}
              tag="payable"
              tone={cash.intercompany_liability > 0 ? "warn" : undefined}
            />
          </Section>
          <Line
            label="Manager Bonus"
            v={kpi.manager_bonus}
            right={
              <div className="flex items-center gap-2">
                {bonusOverride ? (
                  <span className={cn("text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/15", WARN)}>
                    Overridden
                  </span>
                ) : null}
                {closed && canFinance && casinoId ? (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setBonusOpen(true)}>
                    Override
                  </Button>
                ) : null}
              </div>
            }
            tip={
              closed
                ? `Frozen at close · max(0, 5% × (Total Income − Actual Expenses))${
                    bonusOverride ? ` · overridden from ${fmtT(bonusOverride.old_amount)}: ${bonusOverride.reason}` : ""
                  }`
                : "Forecast · max(0, 5% × (Total Income − Budget)). Collections never reduce the bonus."
            }
          />

          <div className="flex-1" />

        </div>

        {/* C · CASH ADJUSTMENTS */}
        <div className={card}>
          <div className={cardHeader}>
            <span>Cash Adjustments</span>
          </div>
          <Section
            id="float"
            label="Basic Float"
            total={cash.basic_float_current}
            tip="Opening Basic Float + Σ signed adjustments = current Basic Float."
          >
            <DetailRow label="Float Adjustment (±)" value={cash.basic_float_add} />
            <DetailRow label="Opening Basic Float" value={cash.basic_float_opening} />
          </Section>
          <Section
            id="deposits"
            label="Deposits"
            total={depositsTotal}
            signed
            tip="Money physically held in the cage but owed to third parties. Reported only — Deposits have no effect on Cash Position."
          >
            <DetailRow label="Card Balance" value={cash.card_balance} />
            <DetailRow label="JP (±)" value={inc.jp} />
            <DetailRow label="Miss Cards" value={cash.miss_cards} />
            <DetailRow label="Miss Chips" value={cash.miss_chips} />
            <DetailRow label="Tips & Bonuses (±)" value={inc.tips_bonus} />
          </Section>
          <Section
            id="investment"
            label="Investment"
            total={inc.investment}
            signed
            tip="Signed investment cash movements of the month. Expand to see each entry."
          >
            {investmentItems.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No investment movements this month.</div>
            ) : (
              investmentItems.map((i) => (
                <DetailRow key={i.id} left={fmtDateOnly(i.business_date)} label={i.label} value={i.amount_tzs} />
              ))
            )}
          </Section>
          <Section
            id="collections"
            label="Collections"
            total={data.collections ? data.collections.totals.actual_grand_tzs : cash.collections_actual - capexTotal}
            tip="Owner withdrawals already taken out in cash. They reduce Expected Profit, the amount still available for collection and Cash Position. Expand to see the breakdown by category."
          >
            {collectionCats.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No collections this month.</div>
            ) : (
              collectionCats.map((c) => (
                <DetailRow key={c.id} label={c.name} value={c.actual_grand_tzs} />
              ))
            )}
          </Section>
          {data.capex && (
            <Section
              id="capex"
              label="CAPEX"
              total={capexTotal}
              tip="Capital expenditure — a standalone category, separate from Collections. It still reduces Expected Profit and Cash Position."
            >
              {capexCats.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-muted-foreground">No CAPEX this month.</div>
              ) : (
                capexCats.map((c) => (
                  <DetailRow key={c.id} label={c.name} value={c.actual_grand_tzs} />
                ))
              )}
            </Section>
          )}



          <div className="flex-1" />
        </div>

      </div>


      {/* Manager Bonus override — closed months only, reason mandatory, immutable audit. */}
      <ResponsiveDialog
        open={bonusOpen}
        onOpenChange={(o) => {
          if (!o) {
            setBonusOpen(false);
            setBonusAmount("");
            setBonusReason("");
          }
        }}
        title="Override Manager Bonus"
      >
        <FormGrid>
          <FormField span={6} label="New Bonus (TZS)" required hint={`current ${fmtT(kpi.manager_bonus)}`}>
            <NumberInput
              decimals={2}
              value={bonusAmount}
              onValueChange={(v) => setBonusAmount(v == null ? "" : String(v))}
            />
          </FormField>
          <FormField span={6} label="Default at close" >
            <Input value={fmtT(mf?.manager_bonus_default || 0)} readOnly className="font-mono" />
          </FormField>
          <FormField span={12} label="Reason" required>
            <Input value={bonusReason} onChange={(e) => setBonusReason(e.target.value)} placeholder="Why is the bonus changed?" />
          </FormField>
        </FormGrid>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">
            The old value, the new value, the reason and the actor are stored permanently. Final Profit never changes —
            only the amount still available for collection.
          </span>
          <Button
            size="sm"
            disabled={!casinoId || !bonusReason.trim() || bonusAmount === "" || overrideBonus.isPending}
            onClick={() =>
              overrideBonus.mutate(
                {
                  casino_id: casinoId as string,
                  year: mf?.period?.year as number,
                  month: mf?.period?.month as number,
                  amount: Number(bonusAmount) || 0,
                  reason: bonusReason.trim(),
                },
                {
                  onSuccess: () => {
                    setBonusOpen(false);
                    setBonusAmount("");
                    setBonusReason("");
                  },
                },
              )
            }
          >
            Save Override
          </Button>
        </div>
      </ResponsiveDialog>
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
  onDeleteExpense?: (e: ReportExpense) => void;
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
      <div className="rounded-md border border-border overflow-x-auto bg-card">
        {/* Category ≈28% on desktop, the remaining width goes to the money columns.
            min-width keeps numbers readable and turns narrow screens into a scroll. */}
        <table className="w-full min-w-[1040px] table-fixed text-[14px] border-collapse [&_td.text-right]:text-[15px]">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "4%" }} />
          </colgroup>
          <thead className="bg-muted/40">
            <tr className="[&>th]:h-9 [&>th]:px-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[11px] [&>th]:text-muted-foreground [&>th]:whitespace-nowrap">
              <th rowSpan={2} className="text-left sticky left-0 z-10 bg-muted/40 align-bottom">Category</th>
              <th colSpan={2} className="text-center border-l border-border">Plan</th>
              <th colSpan={4} className="text-center border-l border-border">Actual</th>
              <th colSpan={4} className="text-center border-l border-border">Remaining</th>
            </tr>
            <tr className="[&>th]:h-9 [&>th]:px-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[11px] [&>th]:text-muted-foreground [&>th]:whitespace-nowrap border-t border-border">
              <th className="text-right border-l border-border">TZS</th>
              <th className={cn("text-right", USD_COL)}>$</th>
              <th className="text-right border-l border-border">TZS</th>
              <th className={cn("text-right", USD_COL)}>$</th>
              <th className="text-right" title="Σ amount_tzs (TZS + USD converted)">Grand TZS</th>
              <th className="text-right">%</th>
              <th className="text-right border-l border-border">TZS</th>
              <th className={cn("text-right", USD_COL)}>$</th>
              <th className="text-right">Grand TZS</th>
              <th className="text-right pr-3">%</th>
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

            <tr className="bg-muted/40 font-semibold border-t-2 border-border [&>td]:h-10 [&>td]:px-2 [&>td]:align-middle [&>td]:text-[15px]">
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


const Row = ({ c, expanded, onToggle, isNetwork, colCount, editMode, year, month, allCategories, onPlanCommit, onRenameCategory, onArchiveCategory, onEditExpense, onDeleteExpense }: {
  c: ReportCategory; expanded: boolean; onToggle: () => void; isNetwork: boolean; colCount: number;
} & EditCallbacks) => {
  const spent = c.plan_month_grand_tzs ? c.actual_grand_tzs / c.plan_month_grand_tzs : null;
  const actPct = spent == null ? "—" : pct(spent);
  const remPct = c.plan_month_grand_tzs ? pct(c.remain_grand_tzs / c.plan_month_grand_tzs) : "—";
  return (
    <>
      <tr
        className={cn(
          "border-t border-border hover:bg-muted/30 cursor-pointer [&>td]:h-9 [&>td]:px-2 [&>td]:align-middle",
          expanded && "bg-muted/30",
        )}
        onClick={onToggle}
      >
        <td className="sticky left-0 z-10 bg-card text-[14px]" title={c.name}>
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
                      {editMode && <th className="w-[72px]"></th>}
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
                          <td className="pr-2 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => onEditExpense(e)}
                              aria-label="Edit expense"
                              title="Edit expense"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            {onDeleteExpense && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => onDeleteExpense(e)}
                                aria-label="Delete expense"
                                title="Delete expense"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
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
