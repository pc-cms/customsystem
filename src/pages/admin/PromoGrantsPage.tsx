import { useState } from "react";
import { Gift, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { formatNumberSpaces } from "@/lib/currency";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDateTime, fmtDateOnly } from "@/lib/format-date";
import VerificationBonusSettings from "@/components/admin/VerificationBonusSettings";

const fmt = (n: number) => formatNumberSpaces(n ?? 0);

const PromoGrantsPage = () => {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; full_name: string } | null>(null);
  const [form, setForm] = useState({
    amount: 100000,
    source: "manual_am" as "manual_am" | "cashback",
    funding_pool: "am_budget" as "am_budget" | "house",
    lifetime_mode: "lifetime" as "lifetime" | "days_after_redeem" | "fixed_business_date",
    lifetime_days: 30,
    fixed_date: "",
    notes: "",
  });

  const { data: players = [] } = useQuery({
    queryKey: ["players_search_grant", search],
    queryFn: async () => {
      if (search.trim().length < 2) return [];
      const { data } = await supabase
        .from("players")
        .select("id, full_name, phone")
        .ilike("full_name", `%${search}%`)
        .limit(15);
      return data ?? [];
    },
    enabled: search.length >= 2,
  });

  const { data: balance } = useQuery({
    queryKey: ["am_budget", activeCasinoId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !activeCasinoId) return null;
      const { data } = await supabase
        .from("am_budgets")
        .select("balance")
        .eq("am_user_id", u.user.id)
        .eq("casino_id", activeCasinoId)
        .maybeSingle();
      return data?.balance ?? 0;
    },
  });

  const { data: house } = useQuery({
    queryKey: ["house_fund", activeCasinoId],
    queryFn: async () => {
      if (!activeCasinoId) return null;
      const { data } = await supabase
        .from("house_promo_fund")
        .select("balance")
        .eq("casino_id", activeCasinoId)
        .maybeSingle();
      return data?.balance ?? 0;
    },
  });

  const { data: recentGrants = [] } = useQuery({
    queryKey: ["recent_grants", activeCasinoId],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      const { data } = await supabase
        .from("promo_grants")
        .select("id, player_id, amount, remaining, source, funding_pool, expires_business_date, status, created_at, players(full_name)")
        .eq("casino_id", activeCasinoId)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as any[]) ?? [];
    },
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer || !activeCasinoId) throw new Error("Pick a player");
      const { data, error } = await supabase.rpc("am_issue_grant", {
        p_player_id: selectedPlayer.id,
        p_casino_id: activeCasinoId,
        p_amount: form.amount,
        p_source: form.source,
        p_funding_pool: form.funding_pool,
        p_lifetime_mode: form.lifetime_mode,
        p_lifetime_days: form.lifetime_mode === "days_after_redeem" ? form.lifetime_days : null,
        p_fixed_date: form.lifetime_mode === "fixed_business_date" ? form.fixed_date : null,
        p_notes: form.notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Grant issued");
      setSelectedPlayer(null);
      setSearch("");
      setForm({ ...form, amount: 100000, notes: "" });
      qc.invalidateQueries({ queryKey: ["recent_grants"] });
      qc.invalidateQueries({ queryKey: ["am_budget"] });
      qc.invalidateQueries({ queryKey: ["house_fund"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <PageShell>
      <PageHeader icon={Gift} title="Promo Grants" subtitle="Issue manual and cashback promo credits to players" />

      <PageSection title="New Grant">
        <FormGrid>
          <div className="md:col-span-2">
            <Label>Player</Label>
            {selectedPlayer ? (
              <div className="flex items-center gap-2 mt-1">
                <Badge>{selectedPlayer.full_name}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPlayer(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search player by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {players.length > 0 && (
                  <div className="absolute z-10 bg-popover border border-border rounded-md mt-1 w-full max-h-64 overflow-y-auto shadow-md">
                    {players.map((p: any) => (
                      <button
                        key={p.id}
                        className="block w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        onClick={() => { setSelectedPlayer(p); setSearch(""); }}
                      >
                        {p.full_name} <span className="text-muted-foreground text-xs">{p.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <Label>Amount (credits)</Label>
            <NumberInput min={1} value={form.amount}
              onValueChange={(v) => setForm({ ...form, amount: Math.max(0, v ?? 0) })} />
          </div>
          <div>
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(v: any) => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_am">Manual (AM)</SelectItem>
                <SelectItem value="cashback">Cashback</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Funding Pool</Label>
            <Select value={form.funding_pool} onValueChange={(v: any) => setForm({ ...form, funding_pool: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="am_budget">AM Budget ({fmt(balance ?? 0)})</SelectItem>
                <SelectItem value="house">House Promo Fund ({fmt(house ?? 0)})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Lifetime</Label>
            <Select value={form.lifetime_mode} onValueChange={(v: any) => setForm({ ...form, lifetime_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lifetime">No expiry</SelectItem>
                <SelectItem value="days_after_redeem">Days from today</SelectItem>
                <SelectItem value="fixed_business_date">Fixed date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.lifetime_mode === "days_after_redeem" && (
            <div>
              <Label>Days</Label>
              <Input type="number" min={1} value={form.lifetime_days}
                onChange={(e) => setForm({ ...form, lifetime_days: Math.max(1, +e.target.value || 30) })} />
            </div>
          )}
          {form.lifetime_mode === "fixed_business_date" && (
            <div>
              <Label>Expiry date</Label>
              <Input type="date" value={form.fixed_date}
                onChange={(e) => setForm({ ...form, fixed_date: e.target.value })} />
            </div>
          )}
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Reason / reference" />
          </div>
        </FormGrid>
        <div className="flex justify-end mt-4">
          <Button onClick={() => issue.mutate()} disabled={!selectedPlayer || form.amount <= 0 || issue.isPending}>
            {issue.isPending ? "Issuing…" : "Issue Grant"}
          </Button>
        </div>
      </PageSection>

      <VerificationBonusSettings casinoId={activeCasinoId} />


      <PageSection title="Recent Grants (this casino)" bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">When</th>
                <th className="text-left p-2">Player</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-right p-2">Remaining</th>
                <th className="text-left p-2">Source</th>
                <th className="text-left p-2">Pool</th>
                <th className="text-left p-2">Expires</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentGrants.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No grants yet</td></tr>
              )}
              {recentGrants.map((g: any) => (
                <tr key={g.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-2 text-xs text-muted-foreground">{fmtDateTime(g.created_at)}</td>
                  <td className="p-2">{g.players?.full_name ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{fmt(g.amount)}</td>
                  <td className="p-2 text-right font-mono">{fmt(g.remaining)}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{g.source}</Badge></td>
                  <td className="p-2 text-xs">{g.funding_pool}</td>
                  <td className="p-2 text-xs">{g.expires_business_date ? fmtDateOnly(g.expires_business_date) : "—"}</td>
                  <td className="p-2">
                    <Badge variant={g.status === "active" ? "default" : "secondary"} className="text-xs">{g.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </PageSection>
    </PageShell>
  );
};

export default PromoGrantsPage;
