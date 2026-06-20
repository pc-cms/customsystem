import { useState } from "react";
import { ArrowDownToLine } from "lucide-react";
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

const PromoRedemptionsReport = () => {
  const { activeCasinoId } = useCasino();
  const initial = presetRange("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const { data: redemptions = [], isLoading } = useQuery({
    queryKey: ["promo_redemptions_report", activeCasinoId, from, to],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      const { data, error } = await supabase
        .from("promo_redemptions")
        .select("id, player_id, amount, payout_type, cashier_id, grant_breakdown, created_at, players(full_name)")
        .eq("casino_id", activeCasinoId)
        .gte("created_at", from + "T00:00:00")
        .lte("created_at", to + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const total = redemptions.reduce((s, r) => s + r.amount, 0);
  const byType: Record<string, { count: number; total: number }> = {};
  for (const r of redemptions) {
    const t = r.payout_type || "chips";
    byType[t] ??= { count: 0, total: 0 };
    byType[t].count++;
    byType[t].total += r.amount;
  }

  return (
    <PageShell>
      <PageHeader icon={ArrowDownToLine} title="Promo Redemptions" subtitle="Promo credits spent at the cage" />

      <PageSection title="Filters">
        <div className="flex gap-4 items-end">
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </PageSection>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PageSection title="Total Spent">
          <div className="text-3xl font-mono">{fmt(total)}</div>
          <div className="text-sm text-muted-foreground">{redemptions.length} redemptions</div>
        </PageSection>
        <PageSection title="By Payout Type" bodyClassName="p-0">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(byType).map(([k, v]) => (
                <tr key={k} className="border-b border-border/50">
                  <td className="p-2"><Badge variant="outline" className="text-xs">{k}</Badge></td>
                  <td className="p-2 text-right">{v.count}</td>
                  <td className="p-2 text-right font-mono">{fmt(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PageSection>
      </div>

      <PageSection title={`Detail (${redemptions.length})`} bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">When</th>
                <th className="text-left p-2">Player</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-left p-2">Payout</th>
                <th className="text-left p-2">Grants used</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && redemptions.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No redemptions</td></tr>}
              {redemptions.map((r) => {
                const breakdown = Array.isArray(r.grant_breakdown) ? r.grant_breakdown : [];
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-2 text-xs">{fmtDateTime(r.created_at)}</td>
                    <td className="p-2">{r.players?.full_name ?? "—"}</td>
                    <td className="p-2 text-right font-mono">{fmt(r.amount)}</td>
                    <td className="p-2 text-xs">{r.payout_type ?? "chips"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{breakdown.length} grant(s)</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
};

export default PromoRedemptionsReport;
