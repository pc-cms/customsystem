import { useSessionState } from "@/hooks/use-session-state";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import { fmtDateTime, fmtDateOnly } from "@/lib/format-date";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

const PromoIssuanceReport = () => {
  const { activeCasinoId } = useCasino();
  const initial = presetRange("month");
  const [preset, setPreset] = useSessionState<DatePreset>("preset", "month");
  const [from, setFrom] = useSessionState("from", initial.from);
  const [to, setTo] = useSessionState("to", initial.to);

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ["promo_issuance", activeCasinoId, from, to],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      const { data, error } = await supabase
        .from("promo_grants")
        .select("id, amount, source, funding_pool, issued_business_date, expires_business_date, status, created_at, created_by, players(full_name)")
        .eq("casino_id", activeCasinoId)
        .gte("issued_business_date", from)
        .lte("issued_business_date", to)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const bySource: Record<string, { count: number; total: number }> = {};
  const byPool: Record<string, { count: number; total: number }> = {};
  let total = 0;
  for (const g of grants) {
    total += g.amount;
    bySource[g.source] ??= { count: 0, total: 0 };
    bySource[g.source].count++;
    bySource[g.source].total += g.amount;
    byPool[g.funding_pool] ??= { count: 0, total: 0 };
    byPool[g.funding_pool].count++;
    byPool[g.funding_pool].total += g.amount;
  }

  return (
    <PageShell>
      <PageHeader icon={TrendingUp} title="Promo Issuance" subtitle="Promo credits issued per period, source and funding pool">
        <DateRangePresets
          preset={preset}
          from={from}
          to={to}
          onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
        />
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PageSection title="Totals">
          <div className="text-3xl font-mono">{fmt(total)}</div>
          <div className="text-sm text-muted-foreground">{grants.length} grants</div>
        </PageSection>
        <PageSection title="By Source" bodyClassName="p-0">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(bySource).map(([k, v]) => (
                <tr key={k} className="border-b border-border/50">
                  <td className="p-2"><Badge variant="outline" className="text-xs">{k}</Badge></td>
                  <td className="p-2 text-right">{v.count}</td>
                  <td className="p-2 text-right font-mono">{fmt(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PageSection>
        <PageSection title="By Funding Pool" bodyClassName="p-0">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(byPool).map(([k, v]) => (
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

      <PageSection title={`Detail (${grants.length})`} bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Issued</th>
                <th className="text-left p-2">Player</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-left p-2">Source</th>
                <th className="text-left p-2">Pool</th>
                <th className="text-left p-2">Expires</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && grants.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No grants in range</td></tr>}
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-2 text-xs">{fmtDateTime(g.created_at)}</td>
                  <td className="p-2">{g.players?.full_name ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{fmt(g.amount)}</td>
                  <td className="p-2 text-xs">{g.source}</td>
                  <td className="p-2 text-xs">{g.funding_pool}</td>
                  <td className="p-2 text-xs">{g.expires_business_date ? fmtDateOnly(g.expires_business_date) : "—"}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{g.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
};

export default PromoIssuanceReport;
