import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus, TrendingUp } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { OfficeActions } from "@/components/office/office-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { useFinMoneyChange, useCreateMoneyChange, useFinWallets } from "@/hooks/use-fin";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export default function FinancesMoneyChangePage() {
  const { data: rows = [] } = useFinMoneyChange();
  const { data: wallets = [] } = useFinWallets();
  const create = useCreateMoneyChange();
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<string>("");
  const [form, setForm] = useState<any>({
    business_date: new Date().toISOString().slice(0, 10),
    from_wallet_id: "", to_wallet_id: "",
    from_amount: 0, to_amount: 0, rate: 1,
    from_currency: "TZS", to_currency: "USD", note: "",
  });

  // Weighted daily rates per currency pair
  const { pairs, byPair } = useMemo(() => {
    const grouped = new Map<string, Map<string, { sumNumerator: number; sumWeight: number; count: number }>>();
    rows.forEach((r: any) => {
      if (!r.from_currency || !r.to_currency || r.from_currency === r.to_currency) return;
      const key = `${r.from_currency}→${r.to_currency}`;
      const day = String(r.business_date).slice(0, 10);
      const fromAmt = Number(r.from_amount || 0);
      const toAmt = Number(r.to_amount || 0);
      const rate = Number(r.rate || 0);
      if (!rate || !fromAmt) return;
      const m = grouped.get(key) || new Map();
      const cur = m.get(day) || { sumNumerator: 0, sumWeight: 0, count: 0 };
      cur.sumNumerator += rate * fromAmt;
      cur.sumWeight += fromAmt;
      cur.count++;
      m.set(day, cur);
      grouped.set(key, m);
    });

    const out: Record<string, { date: string; weightedRate: number; count: number; volume: number }[]> = {};
    grouped.forEach((dayMap, k) => {
      out[k] = Array.from(dayMap.entries())
        .map(([date, v]) => ({
          date,
          weightedRate: v.sumNumerator / v.sumWeight,
          count: v.count,
          volume: v.sumWeight,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    });
    return { pairs: Object.keys(out).sort(), byPair: out };
  }, [rows]);

  const activePair = pair || pairs[0] || "";
  const series = byPair[activePair] || [];

  return (
    <PageShell>
      <OfficeActions>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> New Change</Button>
      </OfficeActions>

      <Tabs defaultValue="log" className="w-full">
        <TabsList>
          <TabsTrigger value="log">Transactions</TabsTrigger>
          <TabsTrigger value="rates"><TrendingUp className="w-3.5 h-3.5 mr-1" />FX History</TabsTrigger>
        </TabsList>

        <TabsContent value="log">
          <PageSection card={false}>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase">
                  <tr><th className="px-3 py-2 text-left">Date</th><th>From</th><th className="text-right">Amount</th><th>→</th><th>To</th><th className="text-right">Amount</th><th className="text-right">Rate</th><th className="text-left">Note</th></tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(r.business_date)}</td>
                      <td>{r.fwf?.name}</td>
                      <td className="text-right font-mono">{formatNumberSpaces(Number(r.from_amount))} {r.from_currency}</td>
                      <td>→</td>
                      <td>{r.fwt?.name}</td>
                      <td className="text-right font-mono">{formatNumberSpaces(Number(r.to_amount))} {r.to_currency}</td>
                      <td className="text-right font-mono">{r.rate}</td>
                      <td className="text-xs text-muted-foreground">{r.note}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={8} className="text-center text-muted-foreground py-6">No changes</td></tr>}
                </tbody>
              </table>
            </div>
          </PageSection>
        </TabsContent>

        <TabsContent value="rates">
          <PageSection
            title="Weighted daily rates"
            titleRight={
              <Select value={activePair} onValueChange={setPair}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Pair" /></SelectTrigger>
                <SelectContent>
                  {pairs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            }
          >
            {series.length > 0 ? (
              <>
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <LineChart data={series}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                        formatter={(v: any) => Number(v).toFixed(6)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="weightedRate" name={`${activePair} rate`} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 rounded-md border border-border overflow-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-right">Weighted rate</th>
                        <th className="px-3 py-2 text-right">Volume (from)</th>
                        <th className="px-3 py-2 text-right">Tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...series].reverse().map((s) => (
                        <tr key={s.date} className="border-t border-border">
                          <td className="px-3 py-1 font-mono">{fmtDate(s.date)}</td>
                          <td className="px-3 py-1 text-right font-mono">{s.weightedRate.toFixed(6)}</td>
                          <td className="px-3 py-1 text-right font-mono">{formatNumberSpaces(s.volume)}</td>
                          <td className="px-3 py-1 text-right font-mono text-muted-foreground">{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">No cross-currency transactions yet</div>
            )}
          </PageSection>
        </TabsContent>
      </Tabs>

      <ResponsiveDialog open={open} onOpenChange={setOpen} title="New money change">
        <FormGrid>
          <FormField span={4} label="Business date"><Input type="date" value={form.business_date} onChange={(e) => setForm({ ...form, business_date: e.target.value })} /></FormField>
          <FormField span={4} label="From wallet">
            <Select value={form.from_wallet_id} onValueChange={(v) => {
              const w = wallets.find((x: any) => x.id === v);
              setForm({ ...form, from_wallet_id: v, from_currency: w?.currency || form.from_currency });
            }}>
              <SelectTrigger><SelectValue placeholder="From" /></SelectTrigger>
              <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField span={4} label="To wallet">
            <Select value={form.to_wallet_id} onValueChange={(v) => {
              const w = wallets.find((x: any) => x.id === v);
              setForm({ ...form, to_wallet_id: v, to_currency: w?.currency || form.to_currency, to_casino_id: w?.casino_id });
            }}>
              <SelectTrigger><SelectValue placeholder="To" /></SelectTrigger>
              <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField span={4} label={`From amount (${form.from_currency})`}><NumberInput decimals={2} value={form.from_amount ?? 0} onValueChange={(v) => setForm({ ...form, from_amount: v ?? 0 })} /></FormField>
          <FormField span={4} label="Rate"><NumberInput decimals={6} value={form.rate ?? 1} onValueChange={(v) => setForm({ ...form, rate: v ?? 1, to_amount: Number((Number(form.from_amount) * Number(v ?? 1)).toFixed(2)) })} /></FormField>
          <FormField span={4} label={`To amount (${form.to_currency})`}><NumberInput decimals={2} value={form.to_amount ?? 0} onValueChange={(v) => setForm({ ...form, to_amount: v ?? 0 })} /></FormField>
          <FormField span={12} label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></FormField>
        </FormGrid>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!form.from_wallet_id || !form.to_wallet_id || !form.from_amount} onClick={async () => { await create.mutateAsync(form); setOpen(false); }}>Record</Button>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}
