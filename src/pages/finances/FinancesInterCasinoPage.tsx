import { useMemo, useState } from "react";
import { Building2, Plus, ArrowDownLeft, ArrowUpRight, Check, X } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { useFinWallets } from "@/hooks/use-fin";
import {
  useInterCasinoTransfers,
  useSendInterCasino,
  useAcceptInterCasino,
  useResolveInterCasino,
  type InterCasinoTransfer,
} from "@/hooks/use-inter-casino";
import { useCasino } from "@/lib/casino-context";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { toast } from "sonner";

/**
 * Inter-Casino — paired transfers between casinos.
 * Sender: `transfer_out` (negative) posts immediately.
 * Receiver: confirms and a `transfer_in` (positive) posts to the chosen wallet.
 * Reject / cancel writes a reversal back to the sender wallet.
 */
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  accepted: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

/** Row tint by transfer status. */
const ROW_STYLE: Record<string, string> = {
  pending: "bg-amber-500/5 hover:bg-amber-500/10",
  accepted: "bg-emerald-500/5 hover:bg-emerald-500/10",
  rejected: "bg-destructive/5 hover:bg-destructive/10",
  cancelled: "bg-muted/30 text-muted-foreground hover:bg-muted/50",
};


export default function FinancesInterCasinoPage() {
  const { data: wallets = [] } = useFinWallets();
  const { data: rows = [] } = useInterCasinoTransfers();
  const { activeCasinoId, isSummaryMode, accessibleCasinos } = useCasino();

  const send = useSendInterCasino();
  const accept = useAcceptInterCasino();
  const resolve = useResolveInterCasino();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    business_date: new Date().toISOString().slice(0, 10),
    wallet_id: "",
    to_casino_id: "",
    amount: 0,
    note: "",
  });
  const [acceptWallet, setAcceptWallet] = useState<Record<string, string>>({});

  const incoming = useMemo(
    () => (rows as InterCasinoTransfer[]).filter((r) => r.status === "pending" && r.to_casino_id === activeCasinoId),
    [rows, activeCasinoId],
  );
  const outgoingPending = useMemo(
    () => (rows as InterCasinoTransfer[]).filter((r) => r.status === "pending" && r.from_casino_id === activeCasinoId),
    [rows, activeCasinoId],
  );

  const submit = () => {
    if (!form.wallet_id || !form.to_casino_id || !form.amount) {
      toast.error("Wallet, destination casino and amount are required");
      return;
    }
    send.mutate(
      {
        from_wallet_id: form.wallet_id,
        to_casino_id: form.to_casino_id,
        amount: Math.abs(form.amount),
        business_date: form.business_date,
        note: form.note,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ ...form, amount: 0, note: "" });
        },
      },
    );
  };

  return (
    <PageShell>
      <PageHeader
        icon={Building2}
        title="Inter-Casino"
        subtitle="Paired transfers — money leaves one casino (−) and is confirmed on the other (+)"
      >
        <FinanceCasinoSwitcher allowNetwork={true} />
        {!isSummaryMode && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> New Transfer
          </Button>
        )}
      </PageHeader>

      <PageSection card={false}>
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Transfers</TabsTrigger>
            <TabsTrigger value="incoming">
              Incoming
              {incoming.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {incoming.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">From</th>
                    <th className="px-3 py-2 text-left">To</th>
                    <th className="px-3 py-2 text-center">Dir</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-left">Note</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(rows as InterCasinoTransfer[]).map((r) => {
                    const isOut = r.from_casino_id === activeCasinoId;
                    return (
                      <tr
                        key={r.id}
                        className={`border-t border-border ${ROW_STYLE[r.status] || "hover:bg-muted/40"}`}
                      >
                        <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(r.business_date)}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {r.from_casino?.name} · <span className="text-muted-foreground">{r.from_wallet?.name}</span>
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {r.to_casino?.name} ·{" "}
                          <span className="text-muted-foreground">{r.to_wallet?.name || "—"}</span>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {isOut || isSummaryMode ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-cms-amount-negative">
                              <ArrowUpRight className="w-3.5 h-3.5" /> OUT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-cms-amount-positive">
                              <ArrowDownLeft className="w-3.5 h-3.5" /> IN
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${
                            isOut ? "text-cms-amount-negative" : "text-cms-amount-positive"
                          }`}
                        >
                          {isOut ? "−" : "+"}
                          {formatNumberSpaces(Number(r.amount))} {r.currency}
                        </td>

                        <td className="px-3 py-1.5 text-center">
                          <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {r.note}
                          {r.resolution_note ? ` · ${r.resolution_note}` : ""}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {r.status === "pending" && outgoingPending.some((p) => p.id === r.id) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={resolve.isPending}
                              onClick={() => resolve.mutate({ transfer_id: r.id, action: "cancelled" })}
                            >
                              Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground py-6">
                        No inter-casino transfers
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="incoming" className="mt-3">
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">From</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Credit to wallet</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((r) => {
                    const options = (wallets as any[]).filter(
                      (w) => w.currency === r.currency && w.casino_id === r.to_casino_id,
                    );
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{fmtDate(r.business_date)}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.from_casino?.name} · <span className="text-muted-foreground">{r.from_wallet?.name}</span>
                          {r.note ? <div className="text-muted-foreground">{r.note}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-cms-amount-positive">
                          +{formatNumberSpaces(Number(r.amount))} {r.currency}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={acceptWallet[r.id] || ""}
                            onValueChange={(v) => setAcceptWallet((s) => ({ ...s, [r.id]: v }))}
                          >
                            <SelectTrigger className="w-56">
                              <SelectValue placeholder={`Wallet (${r.currency})`} />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((w) => (
                                <SelectItem key={w.id} value={w.id}>
                                  {w.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            disabled={!acceptWallet[r.id] || accept.isPending}
                            onClick={() =>
                              accept.mutate({ transfer_id: r.id, to_wallet_id: acceptWallet[r.id] })
                            }
                          >
                            <Check className="w-4 h-4" /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-1"
                            disabled={resolve.isPending}
                            onClick={() => resolve.mutate({ transfer_id: r.id, action: "rejected" })}
                          >
                            <X className="w-4 h-4" /> Reject
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {!incoming.length && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-6">
                        Nothing to confirm
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </PageSection>

      <ResponsiveDialog open={open} onOpenChange={setOpen} title="New inter-casino transfer">
        <FormGrid>
          <FormField span={6} label="Business date">
            <Input
              type="date"
              value={form.business_date}
              onChange={(e) => setForm({ ...form, business_date: e.target.value })}
            />
          </FormField>
          <FormField span={6} label="From wallet (money leaves)">
            <Select value={form.wallet_id} onValueChange={(v) => setForm({ ...form, wallet_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Wallet" />
              </SelectTrigger>
              <SelectContent>
                {(wallets as any[])
                  .filter((w) => !activeCasinoId || w.casino_id === activeCasinoId)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.currency})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="To casino">
            <Select value={form.to_casino_id} onValueChange={(v) => setForm({ ...form, to_casino_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Destination casino" />
              </SelectTrigger>
              <SelectContent>
                {accessibleCasinos
                  .filter((c) => c.id !== activeCasinoId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="Amount">
            <NumberInput
              decimals={2}
              value={form.amount ?? 0}
              onValueChange={(v) => setForm({ ...form, amount: v ?? 0 })}
            />
          </FormField>
          <FormField span={12} label="Note">
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Reason / reference"
            />
          </FormField>
        </FormGrid>
        <p className="mt-2 text-xs text-muted-foreground">
          The receiving casino confirms this transfer and picks the wallet — only wallets in the same currency can be
          credited.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={send.isPending || !form.wallet_id || !form.to_casino_id || !form.amount}
            onClick={submit}
          >
            Send
          </Button>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}
