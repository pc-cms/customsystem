import { useMemo, useState } from "react";
import { FileSpreadsheet, ChevronRight, ChevronDown, Download, Pencil, Trash2 } from "lucide-react";
import { EditExpenseDialog, type EditableExpense } from "@/components/expenses/EditExpenseDialog";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YearSelect } from "@/components/ui/year-select";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMonthlyReport, type ReportCategory, type ReportGroup, type ReportExpense } from "@/hooks/use-fin-monthly-report";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { useUpsertFinBudgetCell, useRenameFinCategory, useFinCategories, useArchiveFinCategory } from "@/hooks/use-fin";

import { useCategoryMtd } from "@/hooks/use-category-mtd";
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

const CASINO_CODE: Record<string, string> = { arusha: "A", mwanza: "M", dodoma: "D", mbeya: "B" };

export default function FinancesMonthlyReportPage() {
  const now = new Date();
  const { accessibleCasinos, activeCasinoId } = useCasino();
  const isPremier = typeof window !== "undefined" && /(?:^|\.)premier\./.test(window.location.hostname);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [showUsd, setShowUsd] = useState(false);
  const [scope, setScope] = useState<string>(activeCasinoId || "");
  const [usdRate, setUsdRate] = useState(2500);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EditableExpense | null>(null);


  const { roles } = useAuth();
  const canEdit = roles.includes("super_admin") || roles.includes("finance_manager");
  const isNetwork = scope === "network";
  const editMode = canEdit && !isNetwork;

  const upsertBudget = useUpsertFinBudgetCell();
  const renameCategory = useRenameFinCategory();
  const archiveCategory = useArchiveFinCategory();

  
  const { data: allCats } = useFinCategories();

  const { data, isLoading } = useMonthlyReport({ year, month, ytd: false, scope: scope || activeCasinoId || "" });
  const { data: mtd } = useCategoryMtd(scope || activeCasinoId || "");
  const mtdMonthLabel = mtd ? MONTHS[mtd.month - 1].slice(0, 3) : "";

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
    titleCell.value = `${scopeName} · ${ytd ? "YTD " : ""}${MONTHS[month - 1]} ${year}`;
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
    const writeHeader = () => {
      const headers = ["Category", "Plan/Year TZS", "Plan/Year USD", "Plan/Month TZS", "Plan/Month USD", "Actual TZS", "Actual USD", "%", "Remain TZS", "Remain USD", "Remain %"];
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

    for (const g of data.groups) {
      ws.mergeCells(`A${r}:K${r}`);
      const gc = ws.getCell(`A${r}`);
      gc.value = g.name;
      gc.font = { bold: true, size: 12 };
      gc.fill = groupFill as any;
      r++;
      writeHeader();

      for (const c of g.categories) {
        const remTzs = c.plan_month_tzs - c.actual_tzs;
        const remUsd = c.plan_month_usd - c.actual_usd;
        const pctVal = c.plan_month_tzs ? c.actual_tzs / c.plan_month_tzs : null;
        const remPct = c.plan_month_tzs ? remTzs / c.plan_month_tzs : null;
        const row = ws.getRow(r);
        row.values = [c.name, c.plan_year_tzs, c.plan_year_usd, c.plan_month_tzs, c.plan_month_usd, c.actual_tzs, c.actual_usd, pctVal, remTzs, remUsd, remPct];
        for (let i = 2; i <= 11; i++) {
          const cell = row.getCell(i);
          cell.numFmt = (i === 8 || i === 11) ? "0%" : "# ##0;[Red](# ##0);—";
          cell.alignment = { horizontal: "right" };
        }
        r++;
      }

      // Group total
      const tr = ws.getRow(r);
      tr.values = ["Total", g.totals.plan_year_tzs, g.totals.plan_year_usd, g.totals.plan_month_tzs, g.totals.plan_month_usd, g.totals.actual_tzs, g.totals.actual_usd,
        g.totals.plan_month_tzs ? g.totals.actual_tzs / g.totals.plan_month_tzs : null,
        g.totals.plan_month_tzs - g.totals.actual_tzs, g.totals.plan_month_usd - g.totals.actual_usd,
        g.totals.plan_month_tzs ? (g.totals.plan_month_tzs - g.totals.actual_tzs) / g.totals.plan_month_tzs : null];
      for (let i = 1; i <= 11; i++) {
        const cell = tr.getCell(i);
        cell.font = { bold: true };
        cell.fill = totalFill as any;
        if (i > 1) {
          cell.numFmt = (i === 8 || i === 11) ? "0%" : "# ##0;[Red](# ##0);—";
          cell.alignment = { horizontal: "right" };
        }
      }
      r += 2;
    }

    // Collections section (excluded from grand)
    if (data.collections) {
      const col = data.collections;
      ws.mergeCells(`A${r}:K${r}`);
      const cc = ws.getCell(`A${r}`);
      cc.value = col.name;
      cc.font = { bold: true, size: 12 };
      cc.fill = groupFill as any;
      r++;
      writeHeader();
      for (const c of col.categories) {
        const remTzs = c.plan_month_tzs - c.actual_tzs;
        const pctVal = c.plan_month_tzs ? c.actual_tzs / c.plan_month_tzs : null;
        const row = ws.getRow(r);
        row.values = [c.name, c.plan_year_tzs, c.plan_year_usd, c.plan_month_tzs, c.plan_month_usd, c.actual_tzs, c.actual_usd, pctVal, remTzs, c.plan_month_usd - c.actual_usd, c.plan_month_tzs ? remTzs / c.plan_month_tzs : null];
        for (let i = 2; i <= 11; i++) {
          const cell = row.getCell(i);
          cell.numFmt = (i === 8 || i === 11) ? "0%" : "# ##0;[Red](# ##0);—";
          cell.alignment = { horizontal: "right" };
        }
        r++;
      }
      const tr = ws.getRow(r);
      tr.values = ["Total", col.totals.plan_year_tzs, col.totals.plan_year_usd, col.totals.plan_month_tzs, col.totals.plan_month_usd, col.totals.actual_tzs, col.totals.actual_usd, null, col.totals.plan_month_tzs - col.totals.actual_tzs, col.totals.plan_month_usd - col.totals.actual_usd, null];
      for (let i = 1; i <= 11; i++) {
        const cell = tr.getCell(i);
        cell.font = { bold: true };
        cell.fill = totalFill as any;
        if (i > 1) {
          cell.numFmt = (i === 8 || i === 11) ? "0%" : "# ##0;[Red](# ##0);—";
          cell.alignment = { horizontal: "right" };
        }
      }
      r += 2;
    }


    // Grand total
    ws.mergeCells(`A${r}:K${r}`);
    ws.getCell(`A${r}`).value = "GRAND TOTAL";
    ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    ws.getCell(`A${r}`).fill = totalFill as any;
    r++;
    const gr = ws.getRow(r);
    gr.values = ["", "", "", data.grand.plan_month_tzs, data.grand.plan_month_usd, data.grand.actual_tzs, data.grand.actual_usd,
      data.grand.plan_month_tzs ? data.grand.actual_tzs / data.grand.plan_month_tzs : null,
      data.grand.plan_month_tzs - data.grand.actual_tzs, data.grand.plan_month_usd - data.grand.actual_usd, null];
    for (let i = 4; i <= 11; i++) {
      const cell = gr.getCell(i);
      cell.font = { bold: true };
      cell.numFmt = (i === 8 || i === 11) ? "0%" : "# ##0;[Red](# ##0);—";
      cell.alignment = { horizontal: "right" };
    }

    // Column widths
    ws.getColumn(1).width = 36;
    for (let i = 2; i <= 11; i++) ws.getColumn(i).width = 14;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Monthly_Report_${year}_${String(month).padStart(2, "0")}${ytd ? "_YTD" : ""}.xlsx`;
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
              <Switch id="ytd" checked={ytd} onCheckedChange={setYtd} />
              <Label htmlFor="ytd" className="text-xs">YTD</Label>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <Switch id="usd" checked={showUsd} onCheckedChange={setShowUsd} />
              <Label htmlFor="usd" className="text-xs">Show USD</Label>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <Label className="text-xs text-muted-foreground">USD rate</Label>
              <Input type="number" value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value))} className="w-24 font-mono" />
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

      {/* INCOMES */}
      <PageSection title="Incomes" card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Income label="Live Game" v={data?.incomes.live_game ?? 0} />
          <Income label="Slots" v={data?.incomes.slots ?? 0} />
          <Income label="Other Incomes" v={data?.incomes.other ?? 0} />
          <Income label="Total in TZS" v={data?.incomes.total ?? 0} bold />
        </div>
      </PageSection>

      {/* GROUPS */}
      {isLoading && <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>}
      {data?.groups.map((g) => (
        <GroupTable
          key={g.code}
          group={g}
          expandedId={expanded}
          onToggle={toggle}
          usdRate={usdRate}
          isNetwork={isNetwork}
          showUsd={showUsd}
          editMode={editMode}
          year={year}
          month={month}
          allCategories={allCats || []}
          mtd={mtd?.map || {}}
          mtdMonthLabel={mtdMonthLabel}
          onPlanCommit={(catId, currency, amount) =>
            upsertBudget.mutate({ year, month, category_id: catId, currency, planned_amount: amount })
          }
          onRenameCategory={(catId, newName) =>
            renameCategory.mutate({ id: catId, name: newName })
          }
          onArchiveCategory={(catId) => archiveCategory.mutate(catId)}

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


      {/* COLLECTIONS — owner withdrawals, excluded from Grand Total expenses */}
      {data?.collections && (
        <GroupTable
          key={data.collections.code}
          group={data.collections}
          expandedId={expanded}
          onToggle={toggle}
          usdRate={usdRate}
          isNetwork={isNetwork}
          showUsd={showUsd}
          editMode={editMode}
          year={year}
          month={month}
          allCategories={allCats || []}
          mtd={mtd?.map || {}}
          mtdMonthLabel={mtdMonthLabel}
          onPlanCommit={(catId, currency, amount) =>
            upsertBudget.mutate({ year, month, category_id: catId, currency, planned_amount: amount })
          }
          onRenameCategory={(catId, newName) =>
            renameCategory.mutate({ id: catId, name: newName })
          }
          onArchiveCategory={(catId) => archiveCategory.mutate(catId)}

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

      {/* GRAND TOTAL */}
      {data && (
        <PageSection title="Grand Total" card>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
            <Kpi label="Plan Month TZS" v={data.grand.plan_month_tzs} />
            <Kpi label="Actual TZS" v={data.grand.actual_tzs} />
            <Kpi label="Remain TZS" v={data.grand.plan_month_tzs - data.grand.actual_tzs} signed />
            <Kpi label="Collections TZS" v={data.collections?.totals.actual_tzs ?? 0} />
            <Kpi label="Expenses USD" v={Math.round(data.grand.actual_tzs / usdRate)} />
            <Kpi
              label="Net After Collections USD"
              v={Math.round((data.incomes.total - data.grand.actual_tzs - (data.collections?.totals.actual_tzs ?? 0)) / usdRate)}
              signed
            />
          </div>
        </PageSection>
      )}

      <EditExpenseDialog
        open={!!editRow}
        onOpenChange={(o) => { if (!o) setEditRow(null); }}
        expense={editRow}
      />
    </PageShell>
  );
}

const Income = ({ label, v, bold }: { label: string; v: number; bold?: boolean }) => (
  <div className="rounded-md border border-border p-3">
    <div className="text-xs uppercase text-muted-foreground">{label}</div>
    <div className={cn("font-mono mt-1", bold ? "text-lg font-bold" : "text-base")}>{fmt(v)}</div>
  </div>
);

const Kpi = ({ label, v, signed }: { label: string; v: number; signed?: boolean }) => (
  <div className="rounded-md border border-border p-3">
    <div className="text-xs uppercase text-muted-foreground">{label}</div>
    <div className={cn("font-mono mt-1 text-base font-semibold", signed && cls(v))}>{formatNumberSpaces(v)}</div>
  </div>
);

type EditCallbacks = {
  editMode: boolean;
  year: number;
  month: number;
  allCategories: { id: string; name: string; group_name: string | null; group_code: string | null; is_active: boolean; is_income: boolean }[];
  onPlanCommit: (catId: string, currency: "TZS" | "USD", amount: number) => void;
  onRenameCategory: (catId: string, newName: string) => void;
  onArchiveCategory: (catId: string) => void;
  onEditExpense: (e: ReportExpense) => void;
};

const GroupTable = ({ group, expandedId, onToggle, usdRate, isNetwork, showUsd, mtd, mtdMonthLabel, ...edit }: {
  group: ReportGroup;
  expandedId: string | null;
  onToggle: (id: string) => void;
  usdRate: number;
  isNetwork: boolean;
  showUsd: boolean;
  mtd: Record<string, number>;
  mtdMonthLabel: string;
} & EditCallbacks) => {

  const colCount = 7 + (showUsd ? 4 : 0); // Category + 5 metrics + MTD + optional 4 USD
  const groupMtd = group.categories.reduce((s, c) => s + (mtd[c.id] || 0), 0);
  return (
    <PageSection title={group.name} card={false}>
      <div className="rounded-md border border-border overflow-auto bg-card">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-muted/40">
            <tr className="[&>th]:h-7 [&>th]:px-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[10px] [&>th]:text-muted-foreground [&>th]:whitespace-nowrap">
              <th className="text-left sticky left-0 z-10 bg-muted/40 min-w-[220px]">Category</th>
              <th className="text-right w-[110px]">Plan/Year</th>
              {showUsd && <th className="text-right w-[80px]">USD</th>}
              <th className="text-right w-[110px]">Plan/Mo</th>
              {showUsd && <th className="text-right w-[80px]">USD</th>}
              <th className="text-right w-[110px] border-l border-border">Actual</th>
              {showUsd && <th className="text-right w-[80px]">USD</th>}
              <th className="text-right w-[52px]">%</th>
              <th className="text-right w-[110px] border-l border-border" title={`Month-to-date · ${mtdMonthLabel}`}>{mtdMonthLabel || "MTD"}</th>
              <th className="text-right w-[110px] border-l border-border">Remain</th>
              {showUsd && <th className="text-right w-[80px]">USD</th>}
              <th className="text-right w-[52px] pr-3">%</th>
            </tr>
          </thead>
          <tbody>
            {group.categories.map((c) => (
              <Row
                key={c.id}
                c={c}
                expanded={expandedId === c.id}
                onToggle={() => onToggle(c.id)}
                usdRate={usdRate}
                isNetwork={isNetwork}
                showUsd={showUsd}
                colCount={colCount}
                mtdValue={mtd[c.id] || 0}
                {...edit}
              />
            ))}

            <tr className="bg-muted/40 font-semibold border-t-2 border-border [&>td]:h-7 [&>td]:px-2 [&>td]:align-middle">
              <td className="sticky left-0 z-10 bg-muted/40">Total</td>
              <td className="text-right font-mono tabular-nums">{fmtT(group.totals.plan_year_tzs)}</td>
              {showUsd && <td className="text-right font-mono tabular-nums">{fmtT(group.totals.plan_year_usd)}</td>}
              <td className="text-right font-mono tabular-nums">{fmtT(group.totals.plan_month_tzs)}</td>
              {showUsd && <td className="text-right font-mono tabular-nums">{fmtT(group.totals.plan_month_usd)}</td>}
              <td className="text-right font-mono tabular-nums border-l border-border">{fmtT(group.totals.actual_tzs)}</td>
              {showUsd && <td className="text-right font-mono tabular-nums">{fmtT(group.totals.actual_usd)}</td>}
              <td className="text-right font-mono tabular-nums">{group.totals.plan_month_tzs ? pct(group.totals.actual_tzs / group.totals.plan_month_tzs) : "—"}</td>
              <td className="text-right font-mono tabular-nums border-l border-border">{fmtT(groupMtd)}</td>
              <td className={cn("text-right font-mono tabular-nums border-l border-border", cls(group.totals.plan_month_tzs - group.totals.actual_tzs))}>{fmtT(group.totals.plan_month_tzs - group.totals.actual_tzs)}</td>
              {showUsd && <td className={cn("text-right font-mono tabular-nums", cls(group.totals.plan_month_usd - group.totals.actual_usd))}>{fmtT(group.totals.plan_month_usd - group.totals.actual_usd)}</td>}
              <td className="text-right font-mono tabular-nums pr-3">{group.totals.plan_month_tzs ? pct((group.totals.plan_month_tzs - group.totals.actual_tzs) / group.totals.plan_month_tzs) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageSection>
  );
};

const Row = ({ c, expanded, onToggle, usdRate, isNetwork, showUsd, colCount, mtdValue, editMode, year, month, allCategories, onPlanCommit, onRenameCategory, onArchiveCategory, onEditExpense }: {
  c: ReportCategory; expanded: boolean; onToggle: () => void; usdRate: number; isNetwork: boolean; showUsd: boolean; colCount: number; mtdValue: number;
} & EditCallbacks) => {
  const remTzs = c.plan_month_tzs - c.actual_tzs;
  const remUsd = c.plan_month_usd - c.actual_usd;
  return (
    <>
      <tr
        className={cn(
          "border-t border-border hover:bg-muted/30 cursor-pointer [&>td]:h-7 [&>td]:px-2 [&>td]:align-middle",
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
            {c.expenses.length > 0 && <span className="text-[10px] text-muted-foreground shrink-0">({c.expenses.length})</span>}
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
        <td className="text-right">
          <InlineNumberCell value={c.plan_year_tzs} disabled onCommit={() => {}} />
        </td>
        {showUsd && (
          <td className="text-right text-muted-foreground">
            <InlineNumberCell value={c.plan_year_usd} disabled onCommit={() => {}} className="text-muted-foreground" />
          </td>
        )}
        <td className="text-right">
          <InlineNumberCell
            value={c.plan_month_tzs}
            disabled={!editMode}
            onCommit={(v) => onPlanCommit(c.id, "TZS", v)}
          />
        </td>
        {showUsd && (
          <td className="text-right text-muted-foreground">
            <InlineNumberCell
              value={c.plan_month_usd}
              disabled={!editMode}
              onCommit={(v) => onPlanCommit(c.id, "USD", v)}
              className="text-muted-foreground"
            />
          </td>
        )}
        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(c.actual_tzs)}</td>
        {showUsd && <td className="text-right font-mono tabular-nums text-muted-foreground">{fmt(c.actual_usd)}</td>}
        <td className="text-right font-mono tabular-nums">{c.plan_month_tzs ? pct(c.actual_tzs / c.plan_month_tzs) : "—"}</td>
        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(mtdValue)}</td>
        <td className={cn("text-right font-mono tabular-nums border-l border-border", cls(remTzs))}>{fmt(remTzs)}</td>
        {showUsd && <td className={cn("text-right font-mono tabular-nums text-muted-foreground", cls(remUsd))}>{fmt(remUsd)}</td>}
        <td className="text-right font-mono tabular-nums pr-3">{c.plan_month_tzs ? pct(remTzs / c.plan_month_tzs) : "—"}</td>
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
                      {showUsd && <th className="text-right w-[100px]">USD</th>}
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
                        {showUsd && <td className="text-right font-mono tabular-nums text-muted-foreground">{formatNumberSpaces(Math.round(e.amount_tzs / (usdRate || 1)))}</td>}
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
                      {showUsd && <td className="text-right font-mono tabular-nums">{formatNumberSpaces(Math.round(c.actual_tzs / (usdRate || 1)))}</td>}
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
