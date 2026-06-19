/**
 * FloorTipsReport — per-employee breakdown of Floor tips collected by cashier.
 * Unified Day/Week/Month/Year/Custom picker.
 */
import { useMemo, useState } from "react";
import { UserCheck } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { useTipsByRange } from "@/hooks/use-tips";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";

export default function FloorTipsReport() {
  const initial = presetRange("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const { data: rows = [] } = useTipsByRange("tips_floor", from, to);

  const byEmployee = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number; details: typeof rows }>();
    rows.forEach(r => {
      const k = r.tips_recipient_employee_id || "unknown";
      const name = r.employees?.full_name || "Unknown";
      const cur = m.get(k) || { name, total: 0, count: 0, details: [] as any };
      cur.total += Number(r.amount) || 0;
      cur.count += 1;
      cur.details.push(r);
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const periodTotal = byEmployee.reduce((s, r) => s + r.total, 0);

  return (
    <PageShell>
      <PageHeader icon={UserCheck} title="Floor Tips" subtitle="Cashier-recorded Floor tips">
        <DateRangePresets
          preset={preset}
          from={from}
          to={to}
          onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
        />
      </PageHeader>

      <PageSection>
        <div className="cms-panel p-3 mb-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground uppercase tracking-wider">Period Total</span>
          <span className="font-mono text-2xl font-bold">{formatCurrency(periodTotal)}</span>
        </div>

        <div className="cms-panel">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Employee</th>
                <th className="text-right px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Tips Count</th>
                <th className="text-right px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.length === 0 ? (
                <tr><td colSpan={3} className="text-center text-muted-foreground py-6">No floor tips in this period</td></tr>
              ) : byEmployee.map(e => (
                <tr key={e.name} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.count}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="cms-panel mt-3">
            <div className="cms-header text-xs">Recent Tips ({rows.length})</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Employee</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map(r => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{fmtDate(r.business_date)}</td>
                    <td className="px-3 py-2">{r.employees?.full_name || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}
