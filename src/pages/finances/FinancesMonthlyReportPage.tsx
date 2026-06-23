import { useMemo, useState } from "react";
import { FileSpreadsheet, ChevronRight, ChevronDown, Download, Pencil, Trash2, Plus } from "lucide-react";
import { EditExpenseDialog, type EditableExpense } from "@/components/expenses/EditExpenseDialog";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YearSelect } from "@/components/ui/year-select";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonthlyReport, type ReportCategory, type ReportGroup, type ReportExpense } from "@/hooks/use-fin-monthly-report";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { useUpsertFinBudgetCell, useRenameFinCategory, useFinCategories, useArchiveFinCategory, useCreateFinCategory, useRenameFinGroup } from "@/hooks/use-fin";


import { InlineNumberCell } from "@/components/finances/InlineNumberCell";
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
 *  - `USD_COL`  → faint vertical-stripe background, applied to every USD <th>/<td>.
 *  - `UsdGlyph` → small sky-blue "$" prefix shown next to USD numerics.
 *    Skipped automatically when the rendered amount is the muted "—" placeholder.
 */
const USD_COL = "bg-muted/40 dark:bg-muted/20";
const UsdGlyph = ({ show = true }: { show?: boolean }) =>
  show ? (
    <span className="mr-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">$</span>
  ) : null;
/** Renders an amount with leading $ glyph; falls back to muted "—" for zero/empty. */
const UsdAmt = ({ value, total = false, className }: { value: number; total?: boolean; className?: string }) => {
  const txt = total ? fmtT(value) : fmt(value);
  if (txt === "—") return <span className="text-muted-foreground">—</span>;
  return (
    <span className={className}>
      <UsdGlyph />
      {txt}
    </span>
  );
};


const CASINO_CODE: Record<string, string> = { arusha: "A", mwanza: "M", dodoma: "D", mbeya: "B" };

export default function FinancesMonthlyReportPage() {
  const now = new Date();
  const { accessibleCasinos, activeCasinoId } = useCasino();
  const isPremier = typeof window !== "undefined" && /(?:^|\.)premier\./.test(window.location.hostname);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [scope, setScope] = useState<string>(activeCasinoId || "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EditableExpense | null>(null);


  const { roles } = useAuth();
  const canEdit = roles.includes("super_admin") || roles.includes("finance_manager");
  const isNetwork = scope === "network";
  const editMode = canEdit && !isNetwork;

  const upsertBudget = useUpsertFinBudgetCell();
  const renameCategory = useRenameFinCategory();
  const archiveCategory = useArchiveFinCategory();
  const createCategory = useCreateFinCategory();
  const renameGroup = useRenameFinGroup();

  
  const { data: allCats } = useFinCategories();

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
    [["Live Game", data.incomes.live_game], ["Slots", data.incomes.slots], ["Other Incomes", data.incomes.other], ["Total in TZS", data.incomes.total]]
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
      <PageHeader
        icon={FileSpreadsheet}
        title="Monthly Report"
        subtitle="Plan vs Actual, with drill-down per category"
        belowHeader={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <YearSelect value={year} onChange={setYear} className="w-32" />

            <div className="flex items-center gap-2 ml-2">
              {data?.usd_rate ? (
                <span className="text-[10px] text-muted-foreground">USD→TZS @ {formatNumberSpaces(Math.round(data.usd_rate))}</span>
              ) : null}
            </div>
            <Tabs value={scope || activeCasinoId || ""} onValueChange={setScope} className="ml-auto">
              <TabsList>
                {accessibleCasinos.map((c) => (
                  <TabsTrigger key={c.id} value={c.id}>{c.name.replace(/\s*Cloud$/, "")}</TabsTrigger>
                ))}
                {isPremier && <TabsTrigger value="network">Network</TabsTrigger>}
              </TabsList>
            </Tabs>
          </div>
        }
      >
        <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!data}><Download className="w-4 h-4" /> XLSX</Button>
      </PageHeader>

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
  const incomes = data.incomes;
  const g = data.grand;
  const collectionsTzs = data.collections?.totals.actual_grand_tzs ?? 0;
  const profit = incomes.total - g.actual_grand_tzs;
  const netBalance = profit - collectionsTzs;
  const pctTxt = (n: number, d: number) => (d ? pct(n / d) : "—");

  const cardHeader = "h-8 px-3 flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border";
  const card = "rounded-md border-2 border-border bg-card overflow-hidden flex flex-col";

  return (
    <PageSection title="Month Summary" card={false}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.5fr_0.9fr] gap-3">

        {/* ───── INCOMES ───── */}
        <div className={card}>
          <div className={cardHeader}>Incomes</div>
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-muted/20">
              <tr className="[&>th]:h-7 [&>th]:px-3 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[10px] [&>th]:text-muted-foreground [&>th]:whitespace-nowrap">
                <th className="text-left">Source</th>
                <th className="text-right w-[120px]">TZS</th>
                <th className={cn("text-right w-[90px] pr-3", USD_COL)}>$ USD</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {[
                ["Live Game", incomes.live_game],
                ["Slots", incomes.slots],
                ["Other", incomes.other],
              ].map(([label, v]) => (
                <tr key={label as string} className="border-t border-border [&>td]:h-7 [&>td]:px-3">
                  <td className="font-sans text-muted-foreground">{label}</td>
                  <td className="text-right">{fmtT(v as number)}</td>
                  <td className={cn("text-right text-muted-foreground pr-3", USD_COL)}>—</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-bold [&>td]:h-8 [&>td]:px-3">
                <td className="font-sans">Total Income</td>
                <td className="text-right">{fmtT(incomes.total)}</td>
                <td className={cn("text-right text-muted-foreground pr-3", USD_COL)}>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ───── BUDGET ───── */}
        <div className={card}>
          <div className={cardHeader}>Budget · Plan vs Actual</div>
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-muted/20">
              <tr className="[&>th]:h-7 [&>th]:px-3 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[10px] [&>th]:text-muted-foreground [&>th]:whitespace-nowrap">
                <th className="text-left w-[70px]">Ccy</th>
                <th className="text-right">Plan</th>
                <th className="text-right">Actual</th>
                <th className="text-right border-l border-border">Remain</th>
                <th className="text-right w-[56px] pr-3">%</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {/* TZS row */}
              <tr className="border-t border-border [&>td]:h-7 [&>td]:px-3">
                <td className="font-sans text-muted-foreground">TZS</td>
                <td className="text-right">{fmtT(g.plan_month_tzs)}</td>
                <td className="text-right">{fmtT(g.actual_tzs)}</td>
                <td className={cn("text-right border-l border-border", cls(g.remain_tzs))}>{fmtT(g.remain_tzs)}</td>
                <td className={cn("text-right pr-3", pctTone(g.plan_month_tzs ? g.actual_tzs / g.plan_month_tzs : null))}>
                  {pctTxt(g.actual_tzs, g.plan_month_tzs)}
                </td>
              </tr>
              {/* USD row */}
              <tr className={cn("border-t border-border [&>td]:h-7 [&>td]:px-3", USD_COL)}>
                <td className="font-sans text-sky-600 dark:text-sky-400 font-semibold">$ USD</td>
                <td className="text-right"><UsdAmt value={g.plan_month_usd} total /></td>
                <td className="text-right"><UsdAmt value={g.actual_usd} total /></td>
                <td className={cn("text-right border-l border-border", cls(g.remain_usd))}><UsdAmt value={g.remain_usd} total /></td>
                <td className={cn("text-right pr-3", pctTone(g.plan_month_usd ? g.actual_usd / g.plan_month_usd : null))}>
                  {pctTxt(g.actual_usd, g.plan_month_usd)}
                </td>
              </tr>
              {/* Grand TZS row */}
              <tr className="border-t-2 border-border bg-muted/30 font-bold [&>td]:h-8 [&>td]:px-3">
                <td className="font-sans">Grand TZS</td>
                <td className="text-right">{fmtT(g.plan_month_grand_tzs)}</td>
                <td className="text-right">{fmtT(g.actual_grand_tzs)}</td>
                <td className={cn("text-right border-l border-border", cls(g.remain_grand_tzs))}>{fmtT(g.remain_grand_tzs)}</td>
                <td className={cn("text-right pr-3", pctTone(g.plan_month_grand_tzs ? g.actual_grand_tzs / g.plan_month_grand_tzs : null))}>
                  {pctTxt(g.actual_grand_tzs, g.plan_month_grand_tzs)}
                </td>
              </tr>
            </tbody>
          </table>
          {data.usd_rate > 0 && (
            <div className="mt-auto text-[10px] text-muted-foreground px-3 py-1.5 border-t border-border">
              Grand TZS uses USD→TZS @ {formatNumberSpaces(Math.round(data.usd_rate))}
            </div>
          )}
        </div>

        {/* ───── RESULT ───── */}
        <div className={card}>
          <div className={cardHeader}>Result</div>
          <table className="w-full text-[12px] border-collapse">
            <tbody className="font-mono tabular-nums">
              <tr className="border-t border-border [&>td]:px-3 [&>td]:py-1.5">
                <td className="font-sans">
                  <div>Profit</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Income − Actual</div>
                </td>
                <td className={cn("text-right pr-3 align-middle", cls(profit))}>{fmtT(profit)}</td>
              </tr>
              <tr className="border-t border-border [&>td]:px-3 [&>td]:py-1.5">
                <td className="font-sans">
                  <div>Collections</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Owner withdrawals</div>
                </td>
                <td className="text-right pr-3 align-middle">{fmtT(collectionsTzs)}</td>
              </tr>
              <tr className="border-t-2 border-border bg-muted/30 font-bold [&>td]:px-3 [&>td]:py-2">
                <td className="font-sans">
                  <div>Net Balance</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Profit − Collections</div>
                </td>
                <td className={cn("text-right pr-3 align-middle text-[13px]", cls(netBalance))}>{fmtT(netBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
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
              <th className={cn("text-right w-[80px]", USD_COL)}>$ USD</th>
              <th className="text-right w-[110px] border-l border-border">TZS</th>
              <th className={cn("text-right w-[80px]", USD_COL)}>$ USD</th>
              <th className="text-right w-[110px]" title="Σ amount_tzs (TZS + USD converted)">Grand TZS</th>
              <th className="text-right w-[56px]">%</th>
              <th className="text-right w-[110px] border-l border-border">TZS</th>
              <th className={cn("text-right w-[80px]", USD_COL)}>$ USD</th>
              <th className="text-right w-[110px]">Grand Total</th>
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
              <td className={cn("text-right font-mono tabular-nums border-l border-border", cls(t.remain_tzs))}>{fmtT(t.remain_tzs)}</td>
              <td className={cn("text-right font-mono tabular-nums", USD_COL, cls(t.remain_usd))}><UsdAmt value={t.remain_usd} total /></td>
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
          <div className="flex items-center justify-end gap-0.5">
            <UsdGlyph show={!!c.plan_month_usd} />
            <InlineNumberCell
              value={c.plan_month_usd}
              disabled={!editMode}
              onCommit={(v) => onPlanCommit(c.id, "USD", v)}
            />
          </div>
        </td>
        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(c.actual_tzs)}</td>
        <td className={cn("text-right font-mono tabular-nums", USD_COL)}><UsdAmt value={c.actual_usd} /></td>
        <td className="text-right font-mono tabular-nums">{fmt(c.actual_grand_tzs)}</td>
        <td className={cn("text-right font-mono tabular-nums", pctTone(spent))}>{actPct}</td>
        <td className={cn("text-right font-mono tabular-nums border-l border-border", cls(c.remain_tzs))}>{fmt(c.remain_tzs)}</td>
        <td className={cn("text-right font-mono tabular-nums", USD_COL, cls(c.remain_usd))}><UsdAmt value={c.remain_usd} /></td>
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
