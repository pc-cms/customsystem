import { useMemo, useState } from "react";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Check, X } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { TablePane, ErrorPane } from "@/components/finances/TablePane";
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
import { cn } from "@/lib/utils";
import { useOfficePeriod } from "@/components/office/office-shell";
import { defaultPostingDate, isOutsideWindow } from "@/lib/office-posting-date";
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
  const { data: rows = [], isLoading, isError, refetch } = useInterCasinoTransfers();
  const { activeCasinoId, isSummaryMode, accessibleCasinos } = useCasino();

  const send = useSendInterCasino();
  const accept = useAcceptInterCasino();
  const resolve = useResolveInterCasino();

  const { period } = useOfficePeriod();
  const range = { from: period.from, to: period.to };

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    business_date: defaultPostingDate(range),
    wallet_id: "",
    to_casino_id: "",
    amount: 0,
    note: "",
    repayable: true,
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
        repayable: form.repayable,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ ...form, amount: 0, note: "" });
        },
      },
    );
  };

  // ---------- All transfers table ----------
  const allColumns: ColumnDef<InterCasinoTransfer>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 104 },
      headerClassName: "text-left",
      cellClassName: "text-left",
      sortValue: (r) => r.business_date,
      accessor: (r) => <span className="font-mono text-xs whitespace-nowrap">{fmtDate(r.business_date)}</span>,
    },
    {
      key: "from",
      header: "From",
      type: "text",
      sortValue: (r) => r.from_casino?.name ?? "",
      accessor: (r) => (
        <span className="text-xs">
          {r.from_casino?.name} · <span className="text-muted-foreground">{r.from_wallet?.name}</span>
        </span>
      ),
    },
    {
      key: "to",
      header: "To",
      type: "text",
      sortValue: (r) => r.to_casino?.name ?? "",
      accessor: (r) => (
        <span className="text-xs">
          {r.to_casino?.name} · <span className="text-muted-foreground">{r.to_wallet?.name || "—"}</span>
        </span>
      ),
    },
    {
      key: "dir",
      header: "Dir",
      type: "status",
      style: { width: 72 },
      accessor: (r) => {
        const isOut = r.from_casino_id === activeCasinoId;
        return isOut || isSummaryMode ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-cms-amount-negative">
            <ArrowUpRight className="w-3.5 h-3.5" /> OUT
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-cms-amount-positive">
            <ArrowDownLeft className="w-3.5 h-3.5" /> IN
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      type: "money",
      style: { width: 150 },
      sortValue: (r) => Number(r.amount),
      accessor: (r) => {
        const isOut = r.from_casino_id === activeCasinoId;
        return (
          <span
            className={cn(
              "font-mono tabular-nums font-semibold whitespace-nowrap",
              isOut ? "text-cms-amount-negative" : "text-cms-amount-positive",
            )}
          >
            {isOut ? "−" : "+"}
            {formatNumberSpaces(Number(r.amount))} {r.currency}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      type: "status",
      style: { width: 140 },
      sortValue: (r) => r.status,
      accessor: (r) => (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Badge variant="outline" className={STATUS_STYLE[r.status]}>
            {r.status}
          </Badge>
          {(r as any).repayable ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600">
              DEBT
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "note",
      header: "Note",
      type: "text",
      accessor: (r) => (
        <span className="block max-w-[320px] truncate text-xs text-muted-foreground" title={r.note || undefined}>
          {r.note}
          {r.resolution_note ? ` · ${r.resolution_note}` : ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      type: "actions",
      style: { width: 88 },
      accessor: (r) =>
        r.status === "pending" && outgoingPending.some((p) => p.id === r.id) ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ transfer_id: r.id, action: "cancelled" })}
          >
            Cancel
          </Button>
        ) : null,
    },
  ];

  // ---------- Incoming (to confirm) table ----------
  const incomingColumns: ColumnDef<InterCasinoTransfer>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 104 },
      headerClassName: "text-left",
      cellClassName: "text-left",
      sortValue: (r) => r.business_date,
      accessor: (r) => <span className="font-mono text-xs whitespace-nowrap">{fmtDate(r.business_date)}</span>,
    },
    {
      key: "from",
      header: "From",
      type: "text",
      accessor: (r) => (
        <div className="text-xs">
          {r.from_casino?.name} · <span className="text-muted-foreground">{r.from_wallet?.name}</span>
          {r.note ? <div className="text-muted-foreground">{r.note}</div> : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      type: "money",
      style: { width: 150 },
      accessor: (r) => (
        <span className="font-mono tabular-nums text-cms-amount-positive whitespace-nowrap">
          +{formatNumberSpaces(Number(r.amount))} {r.currency}
        </span>
      ),
    },
    {
      key: "wallet",
      header: "Credit to wallet",
      type: "text",
      style: { width: 240 },
      accessor: (r) => {
        const options = (wallets as any[]).filter(
          (w) => w.currency === r.currency && w.casino_id === r.to_casino_id,
        );
        return (
          <Select
            value={acceptWallet[r.id] || ""}
            onValueChange={(v) => setAcceptWallet((s) => ({ ...s, [r.id]: v }))}
          >
            <SelectTrigger className="h-8 w-56">
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
        );
      },
    },
    {
      key: "actions",
      header: "Action",
      type: "actions",
      style: { width: 210 },
      accessor: (r) => (
        <span className="whitespace-nowrap">
          <Button
            size="sm"
            className="h-8"
            disabled={!acceptWallet[r.id] || accept.isPending}
            onClick={() => accept.mutate({ transfer_id: r.id, to_wallet_id: acceptWallet[r.id] })}
          >
            <Check className="w-4 h-4" /> Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-1 h-8"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ transfer_id: r.id, action: "rejected" })}
          >
            <X className="w-4 h-4" /> Reject
          </Button>
        </span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={ArrowLeftRight}
        title="Inter-Casino"
        subtitle="Paired transfers between casinos · receiver confirms into a same-currency wallet"
      >
        <FinanceCasinoSwitcher allowNetwork={true} />
        {!isSummaryMode && (
          <Button
            className="h-9"
            onClick={() => {
              setForm((f) => ({ ...f, business_date: defaultPostingDate(range) }));
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4" /> New Transfer
          </Button>
        )}
      </PageHeader>

      {isError && <ErrorPane message="Failed to load inter-casino transfers" onRetry={() => refetch()} />}

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
            <TablePane>
              {/* Transfer ledger is small (dozens of rows) — no virtualization. */}
              <SmartTable<InterCasinoTransfer>
                data={rows as InterCasinoTransfer[]}
                columns={allColumns}
                rowKey={(r) => r.id}
                bare
                scroll={false}
                stickyHeader
                virtualize={false}
                loading={isLoading}
                empty="No inter-casino transfers"
                rowClassName={(r) => ROW_STYLE[r.status] || "hover:bg-muted/40"}
              />
            </TablePane>
          </TabsContent>

          <TabsContent value="incoming" className="mt-3">
            <TablePane>
              <SmartTable<InterCasinoTransfer>
                data={incoming}
                columns={incomingColumns}
                rowKey={(r) => r.id}
                bare
                scroll={false}
                stickyHeader
                virtualize={false}
                loading={isLoading}
                empty="Nothing to confirm"
              />
            </TablePane>
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
              className={cn(
                isOutsideWindow(form.business_date, range) &&
                  "border-amber-500 text-amber-600 dark:text-amber-400",
              )}
              title={
                isOutsideWindow(form.business_date, range)
                  ? "Date is outside the selected month window"
                  : "Posting date"
              }
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
          <FormField span={12} label="Repayable (creates a debt at the receiver)">
            <div className="flex h-9 items-center gap-2">
              <Switch
                checked={form.repayable}
                onCheckedChange={(v) => setForm({ ...form, repayable: v })}
              />
              <span className="text-xs text-muted-foreground">
                {form.repayable
                  ? "The receiving casino books this as a liability to be repaid."
                  : "Plain funding — no liability is created."}
              </span>
            </div>
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
