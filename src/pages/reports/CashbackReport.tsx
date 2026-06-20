import { useState, useMemo } from "react";
import { Gift } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import { fmtDateTime } from "@/lib/format-date";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

export default function CashbackReport() {
  const { activeCasinoId } = useCasino();
  const initial = presetRange("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ["cashback_report", activeCasinoId, from, to],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      const { data, error } = await supabase
        .from("promo_grants")
        .select("id, amount, remaining, status, issued_business_date, expires_business_date, created_at, player_id, players(full_name, phone)")
        .eq("casino_id", activeCasinoId)
        .eq("source", "cashback")
        .gte("issued_business_date", from)
        .lte("issued_business_date", to)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const byPlayer = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; count: number; total: number; remaining: number }>();
    for (const g of grants) {
      const k = g.player_id;
      const cur = m.get(k) ?? { name: g.players?.full_name ?? "—", phone: g.players?.phone ?? "—", count: 0, total: 0, remaining: 0 };
      cur.count++;
      cur.total += Number(g.amount || 0);
      cur.remaining += Number(g.remaining || 0);
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [grants]);

  const total = grants.reduce((s, g) => s + Number(g.amount || 0), 0);
  const remaining = grants.reduce((s, g) => s + Number(g.remaining || 0), 0);

  return (
    <PageShell>
      <PageHeader icon={Gift} title="Cashback Report" subtitle="Cashback credits issued per player and period">
        <DateRangePresets
          preset={preset}
          from={from}
          to={to}
          onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
        />
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PageSection title="Total issued"><div className="text-3xl font-mono">{fmt(total)}</div><div className="text-sm text-muted-foreground">{grants.length} grants</div></PageSection>
        <PageSection title="Remaining balance"><div className="text-3xl font-mono">{fmt(remaining)}</div></PageSection>
        <PageSection title="Unique players"><div className="text-3xl font-mono">{byPlayer.length}</div></PageSection>
      </div>

      <PageSection title="By Player" bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Player</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-right p-2">Grants</th>
                <th className="text-right p-2">Total</th>
                <th className="text-right p-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {byPlayer.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No cashback in range</td></tr>}
              {byPlayer.map(([pid, v]) => (
                <tr key={pid} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-2">{v.name}</td>
                  <td className="p-2 text-xs">{v.phone}</td>
                  <td className="p-2 text-right">{v.count}</td>
                  <td className="p-2 text-right font-mono">{fmt(v.total)}</td>
                  <td className="p-2 text-right font-mono">{fmt(v.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </PageSection>

      <PageSection title={`Detail (${grants.length})`} bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Player</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-right p-2">Remaining</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-border/50">
                  <td className="p-2 text-xs">{fmtDateTime(g.created_at)}</td>
                  <td className="p-2">{g.players?.full_name ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{fmt(g.amount)}</td>
                  <td className="p-2 text-right font-mono">{fmt(g.remaining)}</td>
                  <td className="p-2 text-xs">{g.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
}
