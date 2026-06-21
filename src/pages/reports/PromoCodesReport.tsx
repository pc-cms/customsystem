import { useMemo } from "react";
import { Tag, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { useSessionState } from "@/hooks/use-session-state";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

export default function PromoCodesReport() {
  const { activeCasinoId } = useCasino();
  const [status, setStatus] = useSessionState<"all" | "redeemed" | "active" | "expired">("status", "all");
  const [search, setSearch] = useSessionState("search", "");

  const { data: campaigns = [] } = useQuery({
    queryKey: ["promo-campaigns-report", activeCasinoId],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      const { data, error } = await supabase
        .from("promo_campaigns")
        .select("id, name, casino_id")
        .eq("casino_id", activeCasinoId);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const campaignIds = useMemo(() => campaigns.map((c) => c.id), [campaigns]);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["promo_codes_report", campaignIds, status, search],
    queryFn: async () => {
      if (campaignIds.length === 0) return [];
      let q = supabase
        .from("promo_codes")
        .select("id, code, campaign_id, amount, code_kind, batch_label, current_uses, max_uses_total, code_active_from, code_active_until, assigned_player_id, redeemed_at, redeemed_by_player_id, created_at")
        .in("campaign_id", campaignIds);
      if (search.trim()) q = q.ilike("code", `%${search.trim()}%`);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(3000);
      if (error) throw error;
      let rows = (data as any[]) ?? [];
      const now = new Date();
      rows = rows.filter((r) => {
        const expired = r.code_active_until && new Date(r.code_active_until) < now;
        const used = r.current_uses >= (r.max_uses_total ?? 1) || !!r.redeemed_at;
        if (status === "redeemed") return used;
        if (status === "active") return !used && !expired;
        if (status === "expired") return expired && !used;
        return true;
      });
      return rows;
    },
    enabled: campaignIds.length > 0,
  });

  const campaignMap = useMemo(() => new Map(campaigns.map((c: any) => [c.id, c.name])), [campaigns]);

  const totals = useMemo(() => {
    let redeemed = 0, active = 0, expired = 0, totalAmount = 0, redeemedAmount = 0;
    const now = new Date();
    for (const r of codes) {
      const used = r.current_uses >= (r.max_uses_total ?? 1) || !!r.redeemed_at;
      const isExpired = r.code_active_until && new Date(r.code_active_until) < now;
      totalAmount += Number(r.amount || 0);
      if (used) { redeemed++; redeemedAmount += Number(r.amount || 0); }
      else if (isExpired) expired++;
      else active++;
    }
    return { redeemed, active, expired, totalAmount, redeemedAmount, total: codes.length };
  }, [codes]);

  const exportXlsx = async () => {
    const rows: (string | number | null)[][] = [
      ["Code", "Campaign", "Kind", "Batch", "Amount", "Uses", "Max", "Active From", "Active Until", "Redeemed At", "Created"],
      ...codes.map((r) => [
        r.code,
        campaignMap.get(r.campaign_id) ?? "—",
        r.code_kind,
        r.batch_label ?? "",
        Number(r.amount ?? 0),
        r.current_uses ?? 0,
        r.max_uses_total ?? 1,
        r.code_active_from ?? "",
        r.code_active_until ?? "",
        r.redeemed_at ?? "",
        r.created_at,
      ]),
    ];
    await downloadXlsx(`promo-codes-${new Date().toISOString().slice(0, 10)}.xlsx`, [{ name: "Codes", rows }]);
  };

  return (
    <PageShell>
      <PageHeader icon={Tag} title="Promo Codes Report" subtitle="Generated codes, status and redemption history">
        <Button variant="outline" size="sm" onClick={exportXlsx} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export
        </Button>
      </PageHeader>

      <PageSection title="Filters">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="redeemed">Redeemed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Search code</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ABCD1234" />
          </div>
        </div>
      </PageSection>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PageSection title="Total"><div className="text-2xl font-mono">{totals.total}</div></PageSection>
        <PageSection title="Active"><div className="text-2xl font-mono">{totals.active}</div></PageSection>
        <PageSection title="Redeemed"><div className="text-2xl font-mono cms-amount-positive">{totals.redeemed}</div></PageSection>
        <PageSection title="Expired"><div className="text-2xl font-mono cms-amount-negative">{totals.expired}</div></PageSection>
        <PageSection title="Value (redeemed / total)">
          <div className="text-sm font-mono">{fmt(totals.redeemedAmount)} / {fmt(totals.totalAmount)}</div>
        </PageSection>
      </div>

      <PageSection title={`Detail (${codes.length})`} bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Campaign</th>
                <th className="text-left p-2">Kind</th>
                <th className="text-left p-2">Batch</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-right p-2">Uses</th>
                <th className="text-left p-2">Until</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && codes.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No codes</td></tr>}
              {codes.map((r) => {
                const used = r.current_uses >= (r.max_uses_total ?? 1) || !!r.redeemed_at;
                const isExpired = r.code_active_until && new Date(r.code_active_until) < new Date();
                const label = used ? "redeemed" : isExpired ? "expired" : "active";
                const variant = used ? "default" : isExpired ? "destructive" : "outline";
                return (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="p-2 font-mono">{r.code}</td>
                    <td className="p-2">{campaignMap.get(r.campaign_id) ?? "—"}</td>
                    <td className="p-2 text-xs">{r.code_kind}</td>
                    <td className="p-2 text-xs">{r.batch_label ?? "—"}</td>
                    <td className="p-2 text-right font-mono">{fmt(r.amount)}</td>
                    <td className="p-2 text-right font-mono">{r.current_uses ?? 0}/{r.max_uses_total ?? 1}</td>
                    <td className="p-2 text-xs">{r.code_active_until ? fmtDateTime(r.code_active_until) : "—"}</td>
                    <td className="p-2"><Badge variant={variant as any} className="text-xs">{label}</Badge></td>
                    <td className="p-2 text-xs">{r.redeemed_at ? fmtDateTime(r.redeemed_at) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
}
