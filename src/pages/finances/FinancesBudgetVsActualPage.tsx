import { useMemo, useState, Fragment, createContext, useContext } from "react";
import { BarChart3, AlertTriangle, Download } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { YearSelect } from "@/components/ui/year-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { useFinBudget, useFinExpenses, useFinCategories } from "@/hooks/use-fin";
import { useFinDailyRatesForDate } from "@/hooks/use-fin-daily-rates";
import { formatNumberSpaces } from "@/lib/currency";
import { formatMoneyCompact } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import ExcelJS from "exceljs";

const CompactCtx = createContext(false);
const useFmt = () => {
  const compact = useContext(CompactCtx);
  return (n: number) => (compact ? formatMoneyCompact(Math.round(n)) : formatNumberSpaces(Math.round(n)));
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Ccy = "TZS" | "USD";
type Bucket = { tzs: number; usd: number };
const emptyBucket = (): Bucket => ({ tzs: 0, usd: 0 });

interface Triple {
  plan: Bucket;
  actual: Bucket;
}

const grand = (b: Bucket, rate: number) => b.tzs + b.usd * rate;

function VarianceCell({ plan, actual }: { plan: number; actual: number }) {
  const variance = actual - plan;
  const pct = plan > 0 ? (variance / plan) * 100 : actual > 0 ? null : 0;
  const over = variance > 0.5;
  const under = variance < -0.5;
  const cls = over ? "cms-amount-negative" : under ? "cms-amount-positive" : "text-muted-foreground";
  const sign = variance > 0 ? "+" : "";
  return (
    <>
      <td className={`px-1.5 text-right font-mono tabular-nums ${cls}`}>
        {variance === 0 && plan === 0 && actual === 0 ? "·" : `${sign}${formatNumberSpaces(Math.round(variance))}`}
      </td>
      <td className={`px-1.5 text-right font-mono tabular-nums text-[10px] ${cls}`}>
        {pct === null ? "—" : plan === 0 && actual === 0 ? "·" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`}
      </td>
    </>
  );
}

function PlanActualGroup({ plan, actual }: { plan: number; actual: number }) {
  return (
    <>
      <td className="px-1.5 text-right font-mono tabular-nums text-muted-foreground">
        {plan ? formatNumberSpaces(Math.round(plan)) : "·"}
      </td>
      <td className="px-1.5 text-right font-mono tabular-nums">
        {actual ? formatNumberSpaces(Math.round(actual)) : "·"}
      </td>
      <VarianceCell plan={plan} actual={actual} />
    </>
  );
}

export default function FinancesBudgetVsActualPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [drill, setDrill] = useState<{ catId: string; catName: string; ccy?: Ccy } | null>(null);

  const { data: categories = [] } = useFinCategories();
  const { data: budget = [] } = useFinBudget(year);
  const { data: expenses = [] } = useFinExpenses({
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  });
  const { data: ratesMap = {} } = useFinDailyRatesForDate();
  const usdRate = Number(ratesMap.USD) || 0;

  const expenseCats = useMemo(
    () => (categories as any[]).filter((c) => !c.is_income),
    [categories]
  );

  // planned[catId][month] = { tzs, usd }
  const planned = useMemo(() => {
    const m: Record<string, Record<number, Bucket>> = {};
    (budget as any[]).forEach((b) => {
      const cat = b.category_id;
      const mo = b.month;
      m[cat] = m[cat] || {};
      m[cat][mo] = m[cat][mo] || emptyBucket();
      const amt = Number(b.planned_amount || 0);
      if (b.currency === "USD") m[cat][mo].usd += amt;
      else m[cat][mo].tzs += amt;
    });
    return m;
  }, [budget]);

  // actual[catId][month] = { tzs, usd } — native amount per currency
  const actual = useMemo(() => {
    const m: Record<string, Record<number, Bucket>> = {};
    (expenses as any[]).forEach((e) => {
      if (e.voided_at || !e.fin_category_id) return;
      const mo = new Date(e.business_date).getMonth() + 1;
      m[e.fin_category_id] = m[e.fin_category_id] || {};
      m[e.fin_category_id][mo] = m[e.fin_category_id][mo] || emptyBucket();
      const native = Number(e.amount || 0);
      if (e.currency === "USD") m[e.fin_category_id][mo].usd += native;
      else m[e.fin_category_id][mo].tzs += native;
    });
    return m;
  }, [expenses]);

  /** Aggregate plan/actual for category over [fromMo..toMo] inclusive. */
  const aggregate = (catId: string, fromMo: number, toMo: number): Triple => {
    const plan = emptyBucket();
    const act = emptyBucket();
    for (let mo = fromMo; mo <= toMo; mo++) {
      const p = planned[catId]?.[mo];
      const a = actual[catId]?.[mo];
      if (p) { plan.tzs += p.tzs; plan.usd += p.usd; }
      if (a) { act.tzs += a.tzs; act.usd += a.usd; }
    }
    return { plan, actual: act };
  };

  // Group categories by group_code
  const grouped = useMemo(() => {
    const map = new Map<string, { code: string; name: string; rows: any[] }>();
    expenseCats.forEach((c) => {
      const code = c.group_code || "_";
      if (!map.has(code)) map.set(code, { code, name: c.group_name || code, rows: [] });
      map.get(code)!.rows.push(c);
    });
    return Array.from(map.values());
  }, [expenseCats]);

  const overrunCount = useMemo(() => {
    let n = 0;
    expenseCats.forEach((c) => {
      const t = aggregate(c.id, month, month);
      const planG = grand(t.plan, usdRate);
      const actG = grand(t.actual, usdRate);
      if (planG > 0 && actG > planG) n++;
    });
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseCats, planned, actual, month, usdRate]);

  const drillRows = useMemo(() => {
    if (!drill) return [];
    return (expenses as any[]).filter((e) => {
      if (e.voided_at || e.fin_category_id !== drill.catId) return false;
      const mo = new Date(e.business_date).getMonth() + 1;
      if (mo !== month) return false;
      if (drill.ccy && e.currency !== drill.ccy) return false;
      return true;
    });
  }, [drill, expenses, month]);

  const drillTotal = drillRows.reduce(
    (s: number, r: any) => s + Number(r.amount_tzs || r.amount || 0),
    0
  );

  const renderRow = (cat: any, label?: string, bold = false) => {
    const mTriple = aggregate(cat.id, month, month);
    const yTriple = aggregate(cat.id, 1, month);
    const mGrandPlan = grand(mTriple.plan, usdRate);
    const mGrandAct = grand(mTriple.actual, usdRate);
    const yGrandPlan = grand(yTriple.plan, usdRate);
    const yGrandAct = grand(yTriple.actual, usdRate);
    const rowCls = bold ? "font-semibold bg-muted/30" : "hover:bg-muted/20";
    return (
      <tr key={cat.id} className={`border-t border-border ${rowCls}`}>
        <td
          className={`sticky left-0 z-[1] bg-background px-2 py-1 ${bold ? "bg-muted/30" : ""} cursor-pointer hover:text-primary`}
          onClick={() => !bold && setDrill({ catId: cat.id, catName: cat.name })}
        >
          {label ?? cat.name}
        </td>
        {/* MONTH · TZS */}
        <PlanActualGroup plan={mTriple.plan.tzs} actual={mTriple.actual.tzs} />
        {/* MONTH · USD */}
        <PlanActualGroup plan={mTriple.plan.usd} actual={mTriple.actual.usd} />
        {/* MONTH · Grand TZS */}
        <PlanActualGroup plan={mGrandPlan} actual={mGrandAct} />
        {/* YTD · TZS */}
        <PlanActualGroup plan={yTriple.plan.tzs} actual={yTriple.actual.tzs} />
        {/* YTD · USD */}
        <PlanActualGroup plan={yTriple.plan.usd} actual={yTriple.actual.usd} />
        {/* YTD · Grand TZS */}
        <PlanActualGroup plan={yGrandPlan} actual={yGrandAct} />
      </tr>
    );
  };

  // Subtotal row builder for group or grand total
  const renderAggRow = (key: string, label: string, ids: string[], extraCls = "") => {
    const sum = (fromMo: number, toMo: number): Triple => {
      const t: Triple = { plan: emptyBucket(), actual: emptyBucket() };
      ids.forEach((id) => {
        const a = aggregate(id, fromMo, toMo);
        t.plan.tzs += a.plan.tzs; t.plan.usd += a.plan.usd;
        t.actual.tzs += a.actual.tzs; t.actual.usd += a.actual.usd;
      });
      return t;
    };
    const m = sum(month, month);
    const y = sum(1, month);
    const mGP = grand(m.plan, usdRate), mGA = grand(m.actual, usdRate);
    const yGP = grand(y.plan, usdRate), yGA = grand(y.actual, usdRate);
    return (
      <tr key={key} className={`border-t border-border font-semibold bg-muted/40 ${extraCls}`}>
        <td className="sticky left-0 z-[1] bg-muted/40 px-2 py-1">{label}</td>
        <PlanActualGroup plan={m.plan.tzs} actual={m.actual.tzs} />
        <PlanActualGroup plan={m.plan.usd} actual={m.actual.usd} />
        <PlanActualGroup plan={mGP} actual={mGA} />
        <PlanActualGroup plan={y.plan.tzs} actual={y.actual.tzs} />
        <PlanActualGroup plan={y.plan.usd} actual={y.actual.usd} />
        <PlanActualGroup plan={yGP} actual={yGA} />
      </tr>
    );
  };

  const exportXlsx = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Variance ${year}-${String(month).padStart(2, "0")}`);
    const monthLabel = `${MONTHS[month - 1]} ${year}`;
    const ytdLabel = `YTD ${MONTHS[0]}–${MONTHS[month - 1]}`;
    const sections = ["TZS", "USD", "Grand TZS"];
    const sub = ["Plan", "Actual", "Var", "%"];

    const top = ["Category"];
    [monthLabel, ytdLabel].forEach((p) => {
      sections.forEach((s) => {
        sub.forEach((x) => top.push(`${p} · ${s} ${x}`));
      });
    });
    ws.addRow(top);
    ws.getRow(1).font = { bold: true };

    const writeAgg = (label: string, ids: string[], bold = false) => {
      const sum = (fromMo: number, toMo: number): Triple => {
        const t: Triple = { plan: emptyBucket(), actual: emptyBucket() };
        ids.forEach((id) => {
          const a = aggregate(id, fromMo, toMo);
          t.plan.tzs += a.plan.tzs; t.plan.usd += a.plan.usd;
          t.actual.tzs += a.actual.tzs; t.actual.usd += a.actual.usd;
        });
        return t;
      };
      const periods = [sum(month, month), sum(1, month)];
      const row: any[] = [label];
      periods.forEach((t) => {
        const buckets: Array<[number, number]> = [
          [t.plan.tzs, t.actual.tzs],
          [t.plan.usd, t.actual.usd],
          [grand(t.plan, usdRate), grand(t.actual, usdRate)],
        ];
        buckets.forEach(([p, a]) => {
          const v = a - p;
          const pct = p > 0 ? v / p : 0;
          row.push(Math.round(p), Math.round(a), Math.round(v), pct);
        });
      });
      const r = ws.addRow(row);
      if (bold) r.font = { bold: true };
      for (let i = 2; i <= row.length; i++) {
        const colInSection = (i - 2) % 4;
        r.getCell(i).numFmt = colInSection === 3 ? "+0%;-0%;0%" : "# ##0;[Red](# ##0);-";
      }
    };

    grouped.forEach((g) => {
      const groupRow = ws.addRow([g.name]);
      groupRow.font = { bold: true };
      groupRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
      g.rows.forEach((c) => writeAgg(c.name, [c.id]));
      writeAgg(`${g.name} subtotal`, g.rows.map((c) => c.id), true);
    });
    writeAgg("Grand Total", expenseCats.map((c) => c.id), true);

    ws.columns.forEach((col, i) => { col.width = i === 0 ? 32 : 13; });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = `variance-${year}-${String(month).padStart(2, "0")}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const ytdLabel = `YTD ${MONTHS[0]}–${MONTHS[month - 1]}`;

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        title="Planned vs Actual"
        subtitle="Per category · TZS + USD + Grand TZS · Month + YTD"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <FinanceCasinoSwitcher />
          {overrunCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" />
              {overrunCount} overrun{overrunCount === 1 ? "" : "s"}
            </Badge>
          )}
          <YearSelect value={year} onChange={setYear} />
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportXlsx}>
            <Download className="w-3.5 h-3.5 mr-1" />XLSX
          </Button>
        </div>
      </PageHeader>

      <PageSection card={false}>
        {usdRate === 0 && (
          <div className="mb-2 text-xs text-muted-foreground">
            ⚠ No USD rate set for today — Grand TZS columns ignore USD amounts.
          </div>
        )}
        <div className="rounded-md border border-border overflow-auto max-h-[78vh]">
          <table className="text-xs" style={{ minWidth: 2400 }}>
            <thead className="sticky top-0 z-[2]">
              <tr className="bg-muted">
                <th rowSpan={3} className="sticky left-0 z-[3] bg-muted px-2 py-2 text-left border-r border-border min-w-[220px]">
                  Category
                </th>
                <th colSpan={12} className="px-2 py-1 text-center border-l border-border">{monthLabel}</th>
                <th colSpan={12} className="px-2 py-1 text-center border-l border-border">{ytdLabel}</th>
              </tr>
              <tr className="bg-muted">
                {["TZS", "USD", "Grand TZS", "TZS", "USD", "Grand TZS"].map((label, i) => (
                  <th key={i} colSpan={4} className="px-2 py-1 text-center border-l border-border">{label}</th>
                ))}
              </tr>
              <tr className="bg-muted">
                {Array.from({ length: 6 }).map((_, gi) => (
                  <Fragment key={gi}>
                    <th className="px-1.5 py-1 text-right text-muted-foreground border-l border-border min-w-[95px]">Plan</th>
                    <th className="px-1.5 py-1 text-right min-w-[95px]">Actual</th>
                    <th className="px-1.5 py-1 text-right min-w-[85px]">Var</th>
                    <th className="px-1.5 py-1 text-right min-w-[55px]">%</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <Fragment key={g.code}>
                  <tr className="bg-muted/60">
                    <td
                      className="sticky left-0 z-[1] bg-muted/60 px-2 py-1 font-semibold text-[11px] uppercase tracking-wide"
                      colSpan={25}
                    >
                      {g.name}
                    </td>
                  </tr>
                  {g.rows.map((c: any) => renderRow(c))}
                  {renderAggRow(`sub-${g.code}`, `${g.name} subtotal`, g.rows.map((c: any) => c.id))}
                </Fragment>
              ))}
              {renderAggRow("grand-total", "Grand Total", expenseCats.map((c) => c.id), "bg-primary/10")}
            </tbody>
          </table>
        </div>
      </PageSection>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {drill?.catName} · {MONTHS[month - 1]} {year}
              {drill?.ccy ? ` · ${drill.ccy}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border border-border overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Wallet</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Ccy</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">TZS</th>
                </tr>
              </thead>
              <tbody>
                {drillRows.map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1 font-mono">{fmtDate(r.business_date)}</td>
                    <td className="px-3 py-1">{r.fin_wallets?.name || "—"}</td>
                    <td className="px-3 py-1">{r.description || "—"}</td>
                    <td className="px-3 py-1 text-right">{r.currency}</td>
                    <td className="px-3 py-1 text-right font-mono">{formatNumberSpaces(Number(r.amount || 0))}</td>
                    <td className="px-3 py-1 text-right font-mono">{formatNumberSpaces(Number(r.amount_tzs || 0))}</td>
                  </tr>
                ))}
                {!drillRows.length && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No transactions</td></tr>
                )}
              </tbody>
              {drillRows.length > 0 && (
                <tfoot className="bg-muted sticky bottom-0">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right font-semibold">Total TZS ({drillRows.length})</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{formatNumberSpaces(drillTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
