/**
 * /pos/reports — sales overview for waiters/managers (current shift / day / range).
 * Manual scope only: read-only aggregates over pos_tabs/pos_orders/pos_order_items.
 */
import { useMemo, useState } from "react";
import { BarChart3, Calendar } from "lucide-react";
import { format } from "date-fns";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCasino } from "@/lib/casino-context";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { usePosReport } from "@/hooks/use-pos-reports";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";

const KPI = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="cms-panel p-3">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="font-mono text-xl font-bold tabular-nums leading-tight">{value}</div>
    {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
  </div>
);

export default function PosReports() {
  const { activeCasinoId } = useCasino();
  const todayQ = useEffectiveBusinessDate();
  const today = todayQ.data ?? format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);

  const range = useMemo(() => ({ from, to }), [from, to]);
  const { data, isLoading } = usePosReport(activeCasinoId, range);

  const setQuick = (kind: "today" | "7d" | "30d") => {
    const t = today;
    setTo(t);
    if (kind === "today") setFrom(t);
    else {
      const d = new Date(t + "T00:00:00");
      d.setDate(d.getDate() - (kind === "7d" ? 6 : 29));
      setFrom(format(d, "yyyy-MM-dd"));
    }
  };

  const totals = data?.totals;

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        title="POS Reports"
        subtitle={`${fmtDateOnly(from)} → ${fmtDateOnly(to)}`}
      >
        <Button variant="outline" size="sm" onClick={() => setQuick("today")}>Today</Button>
        <Button variant="outline" size="sm" onClick={() => setQuick("7d")}>7d</Button>
        <Button variant="outline" size="sm" onClick={() => setQuick("30d")}>30d</Button>
      </PageHeader>

      <PageSection>
        <div className="cms-panel p-3 mb-3 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">From</div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">To</div>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
          <KPI label="Gross sales" value={formatNumberSpaces(totals?.gross_tzs ?? 0)} sub="TZS" />
          <KPI label="Bills closed" value={String(totals?.bills_closed ?? 0)} />
          <KPI label="Avg ticket" value={formatNumberSpaces(totals?.avg_ticket ?? 0)} sub="TZS" />
          <KPI label="Voided" value={String(totals?.bills_voided ?? 0)}
            sub={`${((totals?.void_rate ?? 0) * 100).toFixed(1)}% rate`} />
          <KPI label="Charge to tab (legacy)" value={formatNumberSpaces(totals?.player_charge ?? 0)} sub="TZS postpaid" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="Money" value={formatNumberSpaces(totals?.money ?? 0)} sub="TZS revenue" />
          <KPI label="Credits" value={formatNumberSpaces(totals?.credits ?? 0)} sub="promo wallet" />
          <KPI label="Free" value={formatNumberSpaces(totals?.free ?? 0)} sub="hospitality · not revenue" />
          <KPI label="Legacy card/comp" value={formatNumberSpaces((totals?.card ?? 0) + (totals?.comp_player ?? 0) + (totals?.comp_house ?? 0))} sub="history" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By waiter */}
          <div className="cms-panel">
            <div className="px-3 py-2 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
              By waiter
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-xs uppercase text-muted-foreground">Waiter</th>
                  <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Orders</th>
                  <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Voided</th>
                  <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Comp</th>
                  <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Paid sales</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && (data?.byWaiter ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No data</td></tr>
                )}
                {(data?.byWaiter ?? []).map(w => (
                  <tr key={w.waiter_user_id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2">{w.waiter_name}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{w.orders}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {w.voided > 0 ? <Badge variant="destructive">{w.voided}</Badge> : "·"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{w.comp_orders || "·"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumberSpaces(w.paid_sales_tzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top items */}
          <div className="cms-panel">
            <div className="px-3 py-2 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Top items
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-xs uppercase text-muted-foreground">Item</th>
                  <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Qty</th>
                  <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && (data?.topItems ?? []).length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No data</td></tr>
                )}
                {(data?.topItems ?? []).map(it => (
                  <tr key={it.item_id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2">{it.item_name}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumberSpaces(it.revenue_tzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PageSection>
    </PageShell>
  );
}
