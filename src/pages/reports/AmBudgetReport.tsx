import { useMemo, useState } from "react";
import { Briefcase, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

export default function AmBudgetReport() {
  const { activeCasinoId } = useCasino();
  const today = new Date().toISOString().slice(0, 10);
  const initial = presetRange("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [reason, setReason] = useState("all");
  const [amFilter, setAmFilter] = useState("all");

  const { data: amUsers = [] } = useQuery({
    queryKey: ["am-users-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles!inner(id, full_name, email)")
        .eq("role", "account_manager");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: ledger = [], isLoading } = useQuery({
    queryKey: ["am_budget_ledger_admin", activeCasinoId, from, to, reason, amFilter],
    queryFn: async () => {
      let q = supabase
        .from("am_budget_ledger")
        .select("id, am_user_id, casino_id, delta, reason, ref_type, created_at, casinos(name)")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`);
      if (activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      if (amFilter !== "all") q = q.eq("am_user_id", amFilter);
      if (reason !== "all") q = q.ilike("reason", `%${reason}%`);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of amUsers) m.set(u.user_id, u.profiles?.full_name ?? u.profiles?.email ?? u.user_id.slice(0, 8));
    return m;
  }, [amUsers]);

  const totals = useMemo(() => {
    let topup = 0, issued = 0;
    for (const r of ledger) {
      const d = Number(r.delta);
      if (d > 0) topup += d; else issued += d;
    }
    return { topup, issued, net: topup + issued };
  }, [ledger]);

  const exportXlsx = async () => {
    const rows: (string | number | null)[][] = [
      ["Date", "AM", "Casino", "Reason", "Ref", "Delta"],
      ...ledger.map((r) => [
        fmtDateTime(r.created_at),
        userMap.get(r.am_user_id) ?? r.am_user_id.slice(0, 8),
        r.casinos?.name ?? "—",
        r.reason,
        r.ref_type ?? "",
        Number(r.delta ?? 0),
      ]),
    ];
    await downloadXlsx(`am-budget-report-${today}.xlsx`, [{ name: "Ledger", rows }]);
  };

  return (
    <PageShell>
      <PageHeader icon={Briefcase} title="AM Budget Report" subtitle="Network-wide AM funding ledger">
        <Button variant="outline" size="sm" onClick={exportXlsx} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export
        </Button>
      </PageHeader>

      <PageSection title="Filters">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <Label>AM</Label>
            <Select value={amFilter} onValueChange={setAmFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All AMs</SelectItem>
                {amUsers.map((u: any) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.profiles?.full_name ?? u.profiles?.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="top">Top-up</SelectItem>
                <SelectItem value="grant">Grant / issue</SelectItem>
                <SelectItem value="cashback">Cashback</SelectItem>
                <SelectItem value="reversal">Reversal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageSection>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PageSection title="Top-ups"><div className="text-2xl font-mono cms-amount-positive">+{fmt(totals.topup)}</div></PageSection>
        <PageSection title="Issued"><div className="text-2xl font-mono cms-amount-negative">{fmt(totals.issued)}</div></PageSection>
        <PageSection title="Net"><div className="text-2xl font-mono">{fmt(totals.net)}</div></PageSection>
      </div>

      <PageSection title={`Ledger (${ledger.length})`} bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">AM</th>
                <th className="text-left p-2">Casino</th>
                <th className="text-left p-2">Reason</th>
                <th className="text-left p-2">Ref</th>
                <th className="text-right p-2">Delta</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && ledger.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No entries</td></tr>}
              {ledger.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-2 text-xs">{fmtDateTime(r.created_at)}</td>
                  <td className="p-2">{userMap.get(r.am_user_id) ?? r.am_user_id.slice(0, 8)}</td>
                  <td className="p-2">{r.casinos?.name ?? "—"}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{r.reason}</Badge></td>
                  <td className="p-2 text-xs text-muted-foreground">{r.ref_type ?? "—"}</td>
                  <td className={`p-2 text-right font-mono font-bold ${Number(r.delta) >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                    {Number(r.delta) >= 0 ? "+" : ""}{fmt(Number(r.delta))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
}
