/**
 * PokerTipsReport — daily breakdown of Club Poker tips collected by cashier.
 * Unified Day/Week/Month/Year/Custom picker.
 */
import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { useTipsByRange } from "@/hooks/use-tips";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";

export default function PokerTipsReport() {
  const initial = presetRange("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const { data: rows = [] } = useTipsByRange("tips_poker", from, to);

  const byDay = useMemo(() => {
    const m = new Map<string, { total: number; count: number; tables: Set<string> }>();
    rows.forEach(r => {
      const k = r.business_date;
      const cur = m.get(k) || { total: 0, count: 0, tables: new Set<string>() };
      cur.total += Number(r.amount) || 0;
      cur.count += 1;
      if (r.gaming_tables?.name) cur.tables.add(r.gaming_tables.name);
      m.set(k, cur);
    });
    return Array.from(m.entries())
      .map(([d, v]) => ({ date: d, total: v.total, count: v.count, tables: Array.from(v.tables).join(", ") }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  const periodTotal = byDay.reduce((s, r) => s + r.total, 0);

  return (
    <PageShell>
      <PageHeader icon={Coins} title="Poker Tips" subtitle="Cashier-recorded Club Poker tips">
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
                <th className="text-left px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Tables</th>
                <th className="text-right px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Tips Count</th>
                <th className="text-right px-3 py-2 text-xs font-medium uppercase text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {byDay.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground py-6">No poker tips in this period</td></tr>
              ) : byDay.map(r => (
                <tr key={r.date} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-mono">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.tables || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.count}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>
    </PageShell>
  );
}
