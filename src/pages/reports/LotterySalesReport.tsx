import { useState } from "react";
import { Ticket } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import { fmtDateTime } from "@/lib/format-date";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

const LotterySalesReport = () => {
  const { activeCasinoId } = useCasino();
  const initial = presetRange("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["lottery-sales", activeCasinoId, from, to],
    queryFn: async () => {
      if (!activeCasinoId) return [] as any[];
      const fromIso = `${from}T00:00:00Z`;
      const toIso = `${to}T23:59:59Z`;
      const { data, error } = await (supabase.from as any)("lottery_tickets")
        .select("id, ticket_number, paid_credits, purchased_at, purchased_via, players(full_name), lotteries!inner(name, casino_id, draw_business_date)")
        .gte("purchased_at", fromIso)
        .lte("purchased_at", toIso)
        .eq("lotteries.casino_id", activeCasinoId)
        .order("purchased_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!activeCasinoId,
    staleTime: 60_000,
  });

  let totalCredits = 0;
  let totalCash = 0;
  const byLottery: Record<string, { count: number; credits: number; cash: number }> = {};
  for (const r of rows) {
    const lname = r.lotteries?.name || "—";
    byLottery[lname] ??= { count: 0, credits: 0, cash: 0 };
    byLottery[lname].count += 1;
    const amt = Number(r.paid_credits) || 0;
    if (r.purchased_via === "cashier_cash") {
      byLottery[lname].cash += amt;
      totalCash += amt;
    } else {
      byLottery[lname].credits += amt;
      totalCredits += amt;
    }
  }

  return (
    <PageShell>
      <PageHeader icon={Ticket} title="Lottery Sales" subtitle="Tickets purchased per lottery — cash vs promo credits">
        <DateRangePresets
          preset={preset}
          from={from}
          to={to}
          onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
        />
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PageSection title="Tickets">
          <div className="text-3xl font-mono">{rows.length}</div>
          <div className="text-sm text-muted-foreground">In selected range</div>
        </PageSection>
        <PageSection title="Promo Credits">
          <div className="text-3xl font-mono">{fmt(totalCredits)}</div>
        </PageSection>
        <PageSection title="Cash">
          <div className="text-3xl font-mono">{fmt(totalCash)}</div>
        </PageSection>
      </div>

      <PageSection title="By Lottery" bodyClassName="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase">
              <th className="text-left p-2">Lottery</th>
              <th className="text-right p-2">Tickets</th>
              <th className="text-right p-2">Credits</th>
              <th className="text-right p-2">Cash</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byLottery).map(([k, v]) => (
              <tr key={k} className="border-b border-border/50">
                <td className="p-2">{k}</td>
                <td className="p-2 text-right">{v.count}</td>
                <td className="p-2 text-right font-mono">{fmt(v.credits)}</td>
                <td className="p-2 text-right font-mono">{fmt(v.cash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageSection>

      <PageSection title={`Detail (${rows.length})`} bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Purchased</th>
                <th className="text-left p-2">Lottery</th>
                <th className="text-left p-2">Player</th>
                <th className="text-right p-2">Ticket #</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-left p-2">Paid via</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No tickets in range</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-2 text-xs">{fmtDateTime(r.purchased_at)}</td>
                  <td className="p-2">{r.lotteries?.name ?? "—"}</td>
                  <td className="p-2">{r.players?.full_name ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{r.ticket_number}</td>
                  <td className="p-2 text-right font-mono">{fmt(Number(r.paid_credits) || 0)}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{r.purchased_via}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
};

export default LotterySalesReport;
