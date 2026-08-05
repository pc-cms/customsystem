import { invalidateFinance } from "@/lib/fin-invalidate";
import { useMemo, useState } from "react";
import { Building2, Plus, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { useFinWallets, useFinWalletTx } from "@/hooks/use-fin";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Inter-Casino — manual standalone IN / OUT entries per casino.
 * No paired transactions, no cross-casino link. The finance director sees both
 * sides naturally in the network-wide summary report.
 */
export default function FinancesInterCasinoPage() {
  const { data: wallets = [] } = useFinWallets();
  const { data: allTx = [] } = useFinWalletTx();
  const { user } = useAuth();
  const { activeCasinoId, isSummaryMode } = useCasino();
  const qc = useQueryClient();

  const rows = useMemo(
    () => (allTx as any[]).filter((t) => t.kind === "inter_casino"),
    [allTx],
  );

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    business_date: new Date().toISOString().slice(0, 10),
    wallet_id: "",
    direction: "IN" as "IN" | "OUT",
    amount: 0,
    note: "",
  });

  const submit = async () => {
    if (!user || !activeCasinoId) return toast.error("Pick a casino first");
    if (!form.wallet_id || !form.amount) return toast.error("Wallet and amount required");
    const w = (wallets as any[]).find((x) => x.id === form.wallet_id);
    if (!w) return;
    const signed = form.direction === "IN" ? Math.abs(form.amount) : -Math.abs(form.amount);
    const fx = Number(w.fx_rate || 1);
    setBusy(true);
    const { error } = await supabase.from("fin_wallet_tx").insert({
      casino_id: activeCasinoId,
      wallet_id: form.wallet_id,
      kind: "inter_casino",
      amount: signed,
      currency: w.currency,
      fx_rate: fx,
      amount_tzs: signed * fx,
      business_date: form.business_date,
      note: `[${form.direction}] ${form.note || ""}`.trim(),
      created_by: user.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Inter-casino entry recorded");
    setOpen(false);
    setForm({ ...form, amount: 0, note: "" });
    invalidateFinance(qc);
  };

  return (
    <PageShell>
      <PageHeader
        icon={Building2}
        title="Inter-Casino"
        subtitle="Manual IN / OUT between casinos — no automatic pairing"
      >
        <FinanceCasinoSwitcher allowNetwork={true} />
        {!isSummaryMode && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> New Entry
          </Button>
        )}
      </PageHeader>

      <PageSection card={false}>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Casino</th>
                <th className="px-3 py-2 text-left">Wallet</th>
                <th className="px-3 py-2 text-center">Dir</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => {
                const isIn = Number(r.amount) >= 0;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(r.business_date)}</td>
                    <td className="px-3 py-1.5 text-xs">{r.fin_wallets?.name?.split(" ")[0] || "—"}</td>
                    <td className="px-3 py-1.5">{r.fin_wallets?.name}</td>
                    <td className="px-3 py-1.5 text-center">
                      {isIn ? (
                        <span className="inline-flex items-center gap-1 text-cms-amount-positive">
                          <ArrowDownLeft className="w-3.5 h-3.5" /> IN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-cms-amount-negative">
                          <ArrowUpRight className="w-3.5 h-3.5" /> OUT
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right font-mono ${
                        isIn ? "text-cms-amount-positive" : "text-cms-amount-negative"
                      }`}
                    >
                      {formatNumberSpaces(Math.abs(Number(r.amount)))} {r.currency}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.note}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground py-6">
                    No inter-casino entries
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageSection>

      <ResponsiveDialog open={open} onOpenChange={setOpen} title="New inter-casino entry">
        <FormGrid>
          <FormField span={4} label="Business date">
            <Input
              type="date"
              value={form.business_date}
              onChange={(e) => setForm({ ...form, business_date: e.target.value })}
            />
          </FormField>
          <FormField span={4} label="Wallet">
            <Select
              value={form.wallet_id}
              onValueChange={(v) => setForm({ ...form, wallet_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wallet" />
              </SelectTrigger>
              <SelectContent>
                {(wallets as any[]).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} ({w.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={4} label="Direction">
            <Select
              value={form.direction}
              onValueChange={(v: "IN" | "OUT") => setForm({ ...form, direction: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN">IN (+ balance)</SelectItem>
                <SelectItem value="OUT">OUT (− balance)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="Amount">
            <Input
              type="number"
              step="0.01"
              value={form.amount || ""}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </FormField>
          <FormField span={12} label="Note">
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Counterparty casino / reason"
            />
          </FormField>
        </FormGrid>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !form.wallet_id || !form.amount} onClick={submit}>
            Record
          </Button>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}
