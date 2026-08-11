import { useState } from "react";
import { Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fmtDateOnly } from "@/lib/format-date";
import { formatNumberSpaces } from "@/lib/currency";

const fmt = (n: number) => formatNumberSpaces(n ?? 0);

export default function PromoExpiryReport() {
  const { activeCasinoId } = useCasino();
  const [days, setDays] = useState(14);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ["promo_expiry", activeCasinoId, days],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      const { data, error } = await supabase
        .from("promo_grants")
        .select("id, amount, remaining, source, funding_pool, expires_business_date, status, player_id, players(full_name, phone)")
        .eq("casino_id", activeCasinoId)
        .eq("status", "active")
        .gt("remaining", 0)
        .gte("expires_business_date", today)
        .lte("expires_business_date", horizon)
        .order("expires_business_date", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const totalRemaining = grants.reduce((s, g) => s + Number(g.remaining || 0), 0);
  const byDate: Record<string, { count: number; sum: number }> = {};
  for (const g of grants) {
    const d = g.expires_business_date ?? "—";
    byDate[d] ??= { count: 0, sum: 0 };
    byDate[d].count++;
    byDate[d].sum += Number(g.remaining || 0);
  }

  return (
    <PageShell>
      <PageHeader icon={Clock} title="Promo Expiry" subtitle="Active grants nearing expiry" />

      <PageSection title="Horizon">
        <div className="flex items-end gap-4">
          <div>
            <Label>Days ahead</Label>
            <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 14)} className="w-24" />
          </div>
          <div className="text-sm text-muted-foreground">
            From <span className="font-mono">{today}</span> to <span className="font-mono">{horizon}</span>
          </div>
        </div>
      </PageSection>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PageSection title="Total at risk">
          <div className="text-3xl font-mono">{fmt(totalRemaining)}</div>
          <div className="text-sm text-muted-foreground">{grants.length} grants</div>
        </PageSection>
        <PageSection title="By expiry date" bodyClassName="p-0">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(byDate).map(([d, v]) => (
                <tr key={d} className="border-b border-border/50">
                  <td className="p-2 font-mono">{d === "—" ? "—" : fmtDateOnly(d)}</td>
                  <td className="p-2 text-right">{v.count}</td>
                  <td className="p-2 text-right font-mono">{fmt(v.sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PageSection>
      </div>

      <PageSection title={`Detail (${grants.length})`} bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Expires</th>
                <th className="text-left p-2">Player</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-right p-2">Remaining</th>
                <th className="text-right p-2">Original</th>
                <th className="text-left p-2">Source</th>
                <th className="text-left p-2">Pool</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && grants.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No grants expiring in this window</td></tr>}
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-2 text-xs font-mono">{g.expires_business_date ? fmtDateOnly(g.expires_business_date) : "—"}</td>
                  <td className="p-2">{g.players?.full_name ?? "—"}</td>
                  <td className="p-2 text-xs">{g.players?.phone ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{fmt(g.remaining)}</td>
                  <td className="p-2 text-right font-mono text-muted-foreground">{fmt(g.amount)}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{g.source}</Badge></td>
                  <td className="p-2 text-xs">{g.funding_pool}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
}
