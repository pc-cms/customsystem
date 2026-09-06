import { invalidateFinance } from "@/lib/fin-invalidate";
import { useMemo, useState } from "react";
import { Landmark, Save, ChevronDown, ChevronRight, History } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { useFinWallets, useFinWalletBalances } from "@/hooks/use-fin";
import { formatNumberSpaces, CASH_DENOMS, allDenoms} from "@/lib/currency";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { fmtDateTime } from "@/lib/format-date";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const Money = ({ v }: { v: number }) => (
  <span className={`font-mono ${v < 0 ? "cms-amount-negative" : "cms-amount-positive"}`}>
    {formatNumberSpaces(v)}
  </span>
);

const Variance = ({ v }: { v: number }) => {
  if (v === 0) return <span className="font-mono text-muted-foreground">0</span>;
  return (
    <span className={`font-mono font-semibold ${v < 0 ? "cms-amount-negative" : "cms-amount-positive"}`}>
      {v > 0 ? "+" : ""}{formatNumberSpaces(v)}
    </span>
  );
};

export default function FinancesOfficeSafePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId } = useCasino();
  const { data: wallets = [] } = useFinWallets();
  const { data: balances } = useFinWalletBalances();
  const [counts, setCounts] = useState<Record<string, Record<number, number>>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const byCurrency = useMemo(() => {
    const m = new Map<string, { wallets: any[]; total: number; counted: number }>();
    wallets.forEach((w: any) => {
      const bal = Number(balances?.get(w.id) || 0);
      const cnt = cashSum(counts[w.id] || {});
      const cur = m.get(w.currency) || { wallets: [], total: 0, counted: 0 };
      cur.wallets.push({ ...w, balance: bal, counted: cnt });
      cur.total += bal;
      cur.counted += cnt;
      m.set(w.currency, cur);
    });
    return Array.from(m.entries()).sort();
  }, [wallets, balances, counts]);

  const totalVariance = byCurrency.reduce((s, [, info]) => s + (info.counted - info.total), 0);

  const saveReconciliation = async () => {
    if (!user || !activeCasinoId) return;
    setSaving(true);
    try {
      const lines = wallets
        .filter((w: any) => counts[w.id] && cashSum(counts[w.id]) > 0)
        .map((w: any) => ({
          wallet_id: w.id,
          wallet_name: w.name,
          currency: w.currency,
          ledger: Number(balances?.get(w.id) || 0),
          counted: cashSum(counts[w.id]),
          variance: cashSum(counts[w.id]) - Number(balances?.get(w.id) || 0),
          denominations: counts[w.id],
        }));
      if (!lines.length) {
        toast.error("Enter at least one denomination count");
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("fin_audit_log").insert({
        casino_id: activeCasinoId,
        actor: user.id,
        action: "office_safe_reconciliation",
        entity_table: "fin_wallets",
        entity_id: null,
        meta: { lines, note, business_date: new Date().toISOString().slice(0, 10) },
      } as any);
      if (error) throw error;
      invalidateFinance(qc);
      toast.success(`Reconciliation saved · ${lines.length} wallet${lines.length === 1 ? "" : "s"}`);
      setCounts({});
      setOpen({});
      setNote("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={Landmark}
        title="Office Safe"
        subtitle="Physical count vs ledger balance · per wallet, per denomination"
      >
        <div className="flex items-center gap-3 text-xs">
          <FinanceCasinoSwitcher allowNetwork={false} />
          <span className="text-muted-foreground uppercase tracking-wider">Net variance</span>
          <Variance v={totalVariance} />
          <Button size="sm" onClick={saveReconciliation} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1" />
            Save Reconciliation
          </Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="count">
        <TabsList>
          <TabsTrigger value="count">Reconcile</TabsTrigger>
          <TabsTrigger value="history"><History className="w-3.5 h-3.5 mr-1" />History</TabsTrigger>
        </TabsList>

        <TabsContent value="count" className="space-y-3">
          {byCurrency.map(([cur, info]) => {
            const variance = info.counted - info.total;
            return (
              <PageSection
                key={cur}
                title={cur}
                titleRight={
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">Ledger</span>
                    <Money v={info.total} />
                    <span className="text-muted-foreground">Counted</span>
                    <span className="font-mono">{formatNumberSpaces(info.counted)}</span>
                    <span className="text-muted-foreground">Δ</span>
                    <Variance v={variance} />
                  </div>
                }
              >
                <div className="divide-y divide-border">
                  {info.wallets.map((w: any) => {
                    const isOpen = !!open[w.id];
                    const wVar = w.counted - w.balance;
                    const denoms = allDenoms(w.currency);
                    return (
                      <div key={w.id}>
                        <button
                          type="button"
                          onClick={() => setOpen({ ...open, [w.id]: !isOpen })}
                          className="w-full flex justify-between items-center py-1.5 text-sm hover:bg-muted/30 px-2 rounded"
                        >
                          <span className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span className="text-muted-foreground text-xs uppercase">{w.kind}</span>
                            {w.name}
                          </span>
                          <div className="flex items-center gap-4 text-xs">
                            <Money v={w.balance} />
                            {w.counted > 0 && (
                              <>
                                <span className="font-mono">{formatNumberSpaces(w.counted)}</span>
                                <Variance v={wVar} />
                              </>
                            )}
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-6 py-3 bg-muted/20 max-w-md">
                            <CashDenomInput
                              values={counts[w.id] || {}}
                              onChange={(v) => setCounts({ ...counts, [w.id]: v })}
                              denoms={denoms}
                              currency={w.currency}
                              size="sm"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </PageSection>
            );
          })}

          {!byCurrency.length && <div className="text-center text-muted-foreground py-8">No wallets configured</div>}

          <PageSection title="Reconciliation note">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional comment to attach to the saved reconciliation (visible in Audit Log)…"
              rows={2}
            />
          </PageSection>
        </TabsContent>

        <TabsContent value="history">
          <ReconciliationHistory casinoId={activeCasinoId} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ReconciliationHistory({ casinoId }: { casinoId: string | null }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["office-safe-history", casinoId],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data } = await supabase
        .from("fin_audit_log")
        .select("*")
        .eq("casino_id", casinoId)
        .eq("action", "office_safe_reconciliation")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!casinoId,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  if (!rows.length) {
    return <div className="text-center text-muted-foreground py-8 text-sm">No reconciliations yet</div>;
  }
  return (
    <div className="rounded-md border border-border divide-y divide-border">
      {rows.map((r: any) => {
        const meta = r.meta || {};
        const lines: any[] = meta.lines || [];
        const totalVar = lines.reduce((s, l) => s + Number(l.variance || 0), 0);
        const isOpen = openId === r.id;
        return (
          <div key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : r.id)}
              className="w-full flex justify-between items-center px-3 py-2 text-sm hover:bg-muted/30"
            >
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span className="font-mono text-xs">{fmtDateTime(r.created_at)}</span>
                <span className="text-muted-foreground text-xs">· {lines.length} wallet{lines.length === 1 ? "" : "s"}</span>
                {meta.note && <span className="text-xs text-muted-foreground truncate max-w-xs">— {meta.note}</span>}
              </span>
              <Variance v={totalVar} />
            </button>
            {isOpen && (
              <div className="px-3 py-2 bg-muted/20 space-y-3">
                {lines.map((l, i) => {
                  const denoms = l.denominations || {};
                  const denomKeys = Object.keys(denoms)
                    .map(Number)
                    .filter((n) => denoms[n] > 0)
                    .sort((a, b) => b - a);
                  return (
                    <div key={i} className="text-xs border border-border rounded p-2 bg-background">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold">{l.wallet_name} <span className="text-muted-foreground">· {l.currency}</span></span>
                        <span className="flex items-center gap-3 font-mono">
                          <span>L: {formatNumberSpaces(l.ledger)}</span>
                          <span>C: {formatNumberSpaces(l.counted)}</span>
                          <Variance v={l.variance} />
                        </span>
                      </div>
                      <div className="grid grid-cols-6 gap-1 mt-1">
                        {denomKeys.map((d) => (
                          <div key={d} className="flex justify-between font-mono text-muted-foreground">
                            <span>{formatNumberSpaces(d)}</span>
                            <span>×{denoms[d]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
