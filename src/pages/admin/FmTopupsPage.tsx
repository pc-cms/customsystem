import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { useCasino } from "@/lib/casino-context";
import { fmtDateTime } from "@/lib/format-date";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

export default function FmTopupsPage() {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();

  const { data: casinos = [] } = useQuery({
    queryKey: ["casinos-all-fm"],
    queryFn: async () => {
      const { data, error } = await supabase.from("casinos").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: amUsers = [] } = useQuery({
    queryKey: ["am-users"],
    queryFn: async () => {
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "account_manager");
      if (rErr) throw rErr;
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      if (pErr) throw pErr;
      return (profs ?? []).map((p: any) => ({
        user_id: p.user_id,
        profiles: { id: p.user_id, full_name: p.display_name, email: null },
      }));
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["pp-campaigns-fm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("premier_promo_campaigns")
        .select("id, name, casino_id, total_cap, used_amount, active, casinos(name)")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: amBalances = [] } = useQuery({
    queryKey: ["am-balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("am_budgets")
        .select("id, am_user_id, casino_id, balance, casinos(name)");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: houseFunds = [] } = useQuery({
    queryKey: ["house-funds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("house_promo_fund")
        .select("casino_id, balance, updated_at");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  // --- AM top-up form ---
  const [amTarget, setAmTarget] = useState("");
  const [amCasino, setAmCasino] = useState(activeCasinoId ?? "");
  const [amAmount, setAmAmount] = useState(0);
  const [amNote, setAmNote] = useState("");

  // --- House top-up form ---
  const [hCasino, setHCasino] = useState(activeCasinoId ?? "");
  const [hAmount, setHAmount] = useState(0);
  const [hNote, setHNote] = useState("");

  // --- Campaign top-up form ---
  const [cTarget, setCTarget] = useState("");
  const [cAmount, setCAmount] = useState(0);
  const [cNote, setCNote] = useState("");

  const handleAm = async () => {
    if (!amTarget || !amCasino || amAmount <= 0) return;
    const { error } = await supabase.rpc("fm_topup_am_budget", {
      p_am_user_id: amTarget, p_casino_id: amCasino, p_amount: amAmount, p_note: amNote || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Topped up AM budget by ${fmt(amAmount)}`);
    setAmAmount(0); setAmNote("");
    qc.invalidateQueries({ queryKey: ["am-balances"] });
  };

  const handleHouse = async () => {
    if (!hCasino || hAmount <= 0) return;
    const { error } = await supabase.rpc("fm_topup_house_promo_fund", {
      p_casino_id: hCasino, p_amount: hAmount, p_note: hNote || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Topped up house fund by ${fmt(hAmount)}`);
    setHAmount(0); setHNote("");
    qc.invalidateQueries({ queryKey: ["house-funds"] });
  };

  const handleCampaign = async () => {
    if (!cTarget || cAmount <= 0) return;
    const { error } = await supabase.rpc("fm_topup_campaign_budget", {
      p_campaign_id: cTarget, p_amount: cAmount, p_note: cNote || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Increased campaign cap by ${fmt(cAmount)}`);
    setCAmount(0); setCNote("");
    qc.invalidateQueries({ queryKey: ["pp-campaigns-fm"] });
  };

  const amBalanceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of amBalances) m.set(`${b.am_user_id}:${b.casino_id}`, Number(b.balance || 0));
    return m;
  }, [amBalances]);

  const casinoMap = useMemo(() => new Map(casinos.map((c: any) => [c.id, c.name])), [casinos]);

  return (
    <PageShell>
      <PageHeader icon={Banknote} title="FM Top-ups" subtitle="Fund AM budgets, house promo funds, and campaign caps" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PageSection title="Account Manager Budget">
          <div className="space-y-3">
            <div>
              <Label>Account Manager</Label>
              <Select value={amTarget} onValueChange={setAmTarget}>
                <SelectTrigger><SelectValue placeholder="Select AM…" /></SelectTrigger>
                <SelectContent>
                  {amUsers.map((u: any) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.profiles?.full_name ?? u.profiles?.email ?? u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Casino</Label>
              <Select value={amCasino} onValueChange={setAmCasino}>
                <SelectTrigger><SelectValue placeholder="Select casino…" /></SelectTrigger>
                <SelectContent>{casinos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {amTarget && amCasino && (
              <p className="text-xs text-muted-foreground">
                Current balance: <span className="font-mono">{fmt(amBalanceMap.get(`${amTarget}:${amCasino}`) ?? 0)}</span>
              </p>
            )}
            <div>
              <Label>Amount</Label>
              <NumberInput value={amAmount} onChange={(v) => setAmAmount(Number(v) || 0)} />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={amNote} onChange={(e) => setAmNote(e.target.value)} placeholder="optional" />
            </div>
            <Button onClick={handleAm} disabled={!amTarget || !amCasino || amAmount <= 0} className="w-full">Top up AM</Button>
          </div>
        </PageSection>

        <PageSection title="House Promo Fund">
          <div className="space-y-3">
            <div>
              <Label>Casino</Label>
              <Select value={hCasino} onValueChange={setHCasino}>
                <SelectTrigger><SelectValue placeholder="Select casino…" /></SelectTrigger>
                <SelectContent>{casinos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {hCasino && (
              <p className="text-xs text-muted-foreground">
                Current balance: <span className="font-mono">{fmt(Number(houseFunds.find((f: any) => f.casino_id === hCasino)?.balance ?? 0))}</span>
              </p>
            )}
            <div>
              <Label>Amount</Label>
              <NumberInput value={hAmount} onChange={(v) => setHAmount(Number(v) || 0)} />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={hNote} onChange={(e) => setHNote(e.target.value)} placeholder="optional" />
            </div>
            <Button onClick={handleHouse} disabled={!hCasino || hAmount <= 0} className="w-full">Top up House Fund</Button>
          </div>
        </PageSection>

        <PageSection title="Premier Campaign Cap">
          <div className="space-y-3">
            <div>
              <Label>Campaign</Label>
              <Select value={cTarget} onValueChange={setCTarget}>
                <SelectTrigger><SelectValue placeholder="Select campaign…" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.casinos?.name} · cap {fmt(c.total_cap)} / used {fmt(c.used_amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Increase cap by</Label>
              <NumberInput value={cAmount} onChange={(v) => setCAmount(Number(v) || 0)} />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={cNote} onChange={(e) => setCNote(e.target.value)} placeholder="optional" />
            </div>
            <Button onClick={handleCampaign} disabled={!cTarget || cAmount <= 0} className="w-full">Increase Cap</Button>
          </div>
        </PageSection>
      </div>

      <PageSection title="Current AM Balances" bodyClassName="p-0">
        <DataTable>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase">
              <th className="text-left p-2">AM User</th>
              <th className="text-left p-2">Casino</th>
              <th className="text-right p-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {amBalances.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No AM budgets allocated yet</td></tr>}
            {amBalances.map((b: any) => {
              const u = amUsers.find((x: any) => x.user_id === b.am_user_id);
              return (
                <tr key={b.id} className="border-b border-border/50">
                  <td className="p-2">{u?.profiles?.full_name ?? u?.profiles?.email ?? b.am_user_id.slice(0, 8)}</td>
                  <td className="p-2">{b.casinos?.name ?? casinoMap.get(b.casino_id) ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{fmt(b.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </PageSection>

      <PageSection title="House Funds" bodyClassName="p-0">
        <DataTable>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase">
              <th className="text-left p-2">Casino</th>
              <th className="text-right p-2">Balance</th>
              <th className="text-left p-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {houseFunds.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No house funds yet</td></tr>}
            {houseFunds.map((f: any) => (
              <tr key={f.casino_id} className="border-b border-border/50">
                <td className="p-2">{casinoMap.get(f.casino_id) ?? f.casino_id.slice(0, 8)}</td>
                <td className="p-2 text-right font-mono">{fmt(f.balance)}</td>
                <td className="p-2 text-xs text-muted-foreground">{fmtDateTime(f.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </PageSection>
    </PageShell>
  );
}
