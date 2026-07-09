import { useMemo, useState } from "react";
import { TrendingUp, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";

const fmt = (n: number | string | null | undefined) =>
  (Number(n ?? 0)).toLocaleString("fr-FR").replace(/,/g, " ");

type Player = {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  granted: number;
  redeemed: number;
  visits: number;
  last_visit: string | null;
  nep: number;
};

type Summary = {
  kpis: { topped_up: number; granted: number; cashback: number; reversed: number; redeemed: number; nep: number };
  funnel: { players_granted: number; players_visited: number; players_redeemed: number };
  players: Player[];
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthAgoISO = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); };

const AmPerformancePage = () => {
  const { activeCasinoId } = useCasino();
  const { user, role } = useAuth() as any;

  const canPickAm = role === "super_admin" || role === "finance_manager";

  const [amId, setAmId] = useState<string>(user?.id ?? "");
  const [fromDate, setFromDate] = useState(monthAgoISO());
  const [toDate, setToDate] = useState(todayISO());

  // Load list of AMs for the picker (FM/admin only)
  const { data: amOptions = [] } = useQuery({
    queryKey: ["am_users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles(full_name)")
        .eq("role", "account_manager" as any);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: canPickAm,
  });

  const effectiveAm = canPickAm ? amId : user?.id;

  const { data: summary, isLoading } = useQuery<Summary | null>({
    queryKey: ["am_performance", effectiveAm, activeCasinoId, fromDate, toDate],
    queryFn: async () => {
      if (!effectiveAm) return null;
      const { data, error } = await supabase.rpc("am_performance_summary" as any, {
        _am_id: effectiveAm,
        _casino_id: activeCasinoId ?? null,
        _from: fromDate,
        _to: toDate,
      });
      if (error) throw error;
      return data as Summary;
    },
    enabled: !!effectiveAm,
    staleTime: 60_000,
  });

  const players = summary?.players ?? [];
  const kpis = summary?.kpis ?? { topped_up: 0, granted: 0, cashback: 0, reversed: 0, redeemed: 0, nep: 0 };
  const funnel = summary?.funnel ?? { players_granted: 0, players_visited: 0, players_redeemed: 0 };

  const conv = useMemo(() => ({
    visited: funnel.players_granted ? Math.round((funnel.players_visited / funnel.players_granted) * 100) : 0,
    redeemed: funnel.players_granted ? Math.round((funnel.players_redeemed / funnel.players_granted) * 100) : 0,
  }), [funnel]);

  const roi = kpis.granted ? (kpis.nep / kpis.granted) : 0;

  const exportCsv = async () => {
    const rows: (string | number | null)[][] = [
      ["Player", "Granted", "Redeemed", "Visits", "Last visit", "NEP", "ROI"],
      ...players.map((p) => [
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—",
        p.granted,
        p.redeemed,
        p.visits,
        p.last_visit ? fmtDate(p.last_visit) : "",
        p.nep,
        p.granted ? +(p.nep / p.granted).toFixed(2) : 0,
      ]),
    ];
    await downloadXlsx(`am-performance-${fromDate}_${toDate}.xlsx`, [{ name: "Per-player", rows }]);
  };

  return (
    <PageShell>
      <PageHeader title="AM Performance" icon={TrendingUp}>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5" disabled={!players.length}>
          <Download className="w-3.5 h-3.5" /> Export
        </Button>
      </PageHeader>

      <PageSection title="Filters">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {canPickAm && (
            <div>
              <Label className="text-xs">Account Manager</Label>
              <Select value={amId} onValueChange={setAmId}>
                <SelectTrigger><SelectValue placeholder="Pick AM" /></SelectTrigger>
                <SelectContent>
                  {amOptions.map((o: any) => (
                    <SelectItem key={o.user_id} value={o.user_id}>
                      {o.profiles?.full_name ?? o.profiles?.email ?? o.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
        </div>
      </PageSection>

      <PageSection title="KPIs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Topped up" value={kpis.topped_up} tone="positive" />
          <Kpi label="Credits issued" value={kpis.granted} tone="negative" />
          <Kpi label="Credits redeemed" value={kpis.redeemed} />
          <Kpi label="NEP (period)" value={kpis.nep} tone={kpis.nep >= 0 ? "positive" : "negative"} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <Kpi label="Cashback" value={kpis.cashback} />
          <Kpi label="Reversed" value={kpis.reversed} />
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs uppercase text-muted-foreground tracking-wider">ROI (NEP / Granted)</p>
            <p className={`font-mono text-2xl font-bold mt-1 ${roi >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
              {roi.toFixed(2)}×
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection title="Conversion funnel">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FunnelStep label="Players granted" value={funnel.players_granted} pct={100} />
          <FunnelStep label="Visited casino" value={funnel.players_visited} pct={conv.visited} />
          <FunnelStep label="Redeemed credits" value={funnel.players_redeemed} pct={conv.redeemed} />
        </div>
      </PageSection>

      <PageSection title="Per-player breakdown">
        <DataTable>
          <thead>
            <tr>
              <th className="text-left text-xs uppercase text-muted-foreground px-2 py-1.5">Player</th>
              <th className="text-right text-xs uppercase text-muted-foreground px-2 py-1.5">Granted</th>
              <th className="text-right text-xs uppercase text-muted-foreground px-2 py-1.5">Redeemed</th>
              <th className="text-right text-xs uppercase text-muted-foreground px-2 py-1.5">Visits</th>
              <th className="text-left text-xs uppercase text-muted-foreground px-2 py-1.5">Last visit</th>
              <th className="text-right text-xs uppercase text-muted-foreground px-2 py-1.5">NEP</th>
              <th className="text-right text-xs uppercase text-muted-foreground px-2 py-1.5">ROI</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-6 text-sm">Loading…</td></tr>
            ) : players.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-6 text-sm">No activity in range</td></tr>
            ) : players.map((p) => {
              const r = p.granted ? (p.nep / p.granted) : 0;
              return (
                <tr key={p.player_id} className="border-t border-border">
                  <td className="px-2 py-1.5 text-sm">{`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(p.granted)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(p.redeemed)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{p.visits}</td>
                  <td className="px-2 py-1.5 text-sm">{p.last_visit ? fmtDate(p.last_visit) : "—"}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${p.nep >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{fmt(p.nep)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${r >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{r.toFixed(2)}×</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </PageSection>
    </PageShell>
  );
};

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "positive" | "negative" }) {
  const cls = tone === "positive" ? "cms-amount-positive" : tone === "negative" ? "cms-amount-negative" : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className={`font-mono text-2xl font-bold mt-1 ${cls}`}>{fmt(value)}</p>
    </div>
  );
}

function FunnelStep({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className="font-mono text-2xl font-bold mt-1">{value}</p>
      <div className="mt-2 h-1.5 bg-muted rounded">
        <div className="h-1.5 bg-primary rounded" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{pct}% of granted</p>
    </div>
  );
}

export default AmPerformancePage;
