/**
 * Monthly Report actions — manual liabilities, repayments, Record Collection
 * and (super_admin) Reopen. Close Month and the signed Basic Float adjustment
 * live on the Wallets page and are deliberately NOT duplicated here.
 *
 * Every mutation goes through the canonical RPCs; the DB blocks anything that
 * touches a closed month, so the buttons here only mirror the server rules.
 */
import { useMemo, useState } from "react";
import { LockOpen, Plus, Banknote, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { PageSection } from "@/components/layout/PageShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinWallets } from "@/hooks/use-fin";
import { useAuth } from "@/lib/auth-context";
import {
  useAddLiability,
  usePayLiability,
  useReopenMonthReport,
  useRecordCollection,
  useMarkUnplannedPaid,
  useDeleteUnplanned,
  type MonthFinance,
} from "@/hooks/use-fin-month-finance";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { getBusinessDate } from "@/lib/business-day";
import { cn } from "@/lib/utils";

const fmt = (n: number) => formatNumberSpaces(Math.round(Number(n || 0)));

type Wallet = { id: string; name: string; currency: string; casino_id: string };

export const MonthlyReportActions = ({
  casinoId,
  year,
  month,
  finance,
  canFinance,
}: {
  /** null in network scope — actions are per-casino only. */
  casinoId: string | null;
  year: number;
  month: number;
  finance: MonthFinance | null;
  canFinance: boolean;
}) => {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const { data: walletsRaw = [] } = useFinWallets();
  const wallets = useMemo(
    () => (walletsRaw as Wallet[]).filter((w) => !casinoId || w.casino_id === casinoId),
    [walletsRaw, casinoId],
  );

  const closed = finance?.status === "closed";
  const available = Number(finance?.available_for_collection || 0);
  const collected = Number(finance?.collections || 0);
  const liabilities = finance?.liabilities?.items || [];
  const payments = finance?.liabilities?.payments || [];
  const unplanned = finance?.unplanned?.items || [];

  const addLiability = useAddLiability();
  const payLiability = usePayLiability();
  const reopenMonth = useReopenMonthReport();
  const collect = useRecordCollection();
  const markPaid = useMarkUnplannedPaid();
  const deleteUnplanned = useDeleteUnplanned();

  const [dlg, setDlg] = useState<null | "liability" | "pay" | "collect" | "paid">(null);
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getBusinessDate());
  const [dueDate, setDueDate] = useState("");
  const [creditor, setCreditor] = useState("");
  const [note, setNote] = useState("");
  const [liabilityId, setLiabilityId] = useState("");
  const [unplannedId, setUnplannedId] = useState("");

  const reset = () => {
    setDlg(null);
    setWallet("");
    setAmount("");
    setNote("");
    setCreditor("");
    setDueDate("");
    setLiabilityId("");
    setUnplannedId("");
  };

  const amt = Number(amount) || 0;
  const openLiabilities = liabilities.filter((l) => Number(l.outstanding_tzs || 0) > 0.5 && !l.voided_at);
  const selected = openLiabilities.find((l) => l.id === liabilityId) || null;

  const walletSelect = (
    <FormField span={6} label="Wallet" required>
      <Select value={wallet} onValueChange={setWallet}>
        <SelectTrigger><SelectValue placeholder="Select wallet…" /></SelectTrigger>
        <SelectContent>
          {wallets.map((w) => (
            <SelectItem key={w.id} value={w.id}>{w.name} · {w.currency}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );

  if (!casinoId) return null;

  return (
    <PageSection
      title="Month Actions"
      card={false}
      titleRight={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {closed ? "Closed · read-only except Collections" : "Open · Close Month and Adjust Float live in Wallets"}
        </span>
      }
    >
      <div className="flex flex-wrap gap-2">
        {!closed && canFinance && (
          <>
            <Button size="sm" variant="outline" onClick={() => setDlg("liability")}>
              <Plus className="w-4 h-4" /> Add Manual Liability
            </Button>
            <Button size="sm" variant="outline" disabled={!openLiabilities.length} onClick={() => setDlg("pay")}>
              <HandCoins className="w-4 h-4" /> Pay Liability
            </Button>
          </>
        )}
        {closed && canFinance && (
          <Button size="sm" onClick={() => setDlg("collect")} disabled={available <= 0}>
            <Banknote className="w-4 h-4" /> Record Collection · {fmt(available)} available
          </Button>
        )}
        {closed && isSuperAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const reason = window.prompt("Reopen reason:")?.trim();
              if (reason) reopenMonth.mutate({ casino_id: casinoId, year, month, reason });
            }}
          >
            <LockOpen className="w-4 h-4" /> Reopen Month
          </Button>
        )}
      </div>

      {/* Lists — movement, not only totals */}
      <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
        <ListCard title="Extra Expenses" subtitle={`${fmt(finance?.unplanned?.total || 0)} total`}>
          {unplanned.length === 0 && <Empty>No unplanned expenses this month.</Empty>}
          {unplanned.map((i) => (
            <Row
              key={i.id}
              left={fmtDateOnly(i.business_date)}
              label={i.description || i.label}
              value={i.amount_tzs}
              muted={!!i.voided_at}
              tag={i.voided_at ? "Storno" : i.paid ? "Paid" : "Unpaid"}
              actions={
                canFinance && !closed && !i.voided_at ? (
                  <>
                    {!i.paid && (
                      <MiniButton onClick={() => { setUnplannedId(i.id); setDlg("paid"); }}>Mark Paid</MiniButton>
                    )}
                    <MiniButton
                      onClick={() => {
                        if (window.confirm("Delete this extra expense? This is logged in the finance audit log."))
                          deleteUnplanned.mutate({ id: i.id });
                      }}
                    >
                      Delete
                    </MiniButton>
                  </>
                ) : null
              }
            />
          ))}
        </ListCard>

        <ListCard title="Liabilities" subtitle={`${fmt(finance?.liabilities?.closing_tzs || 0)} outstanding`}>
          {liabilities.length === 0 && <Empty>No liabilities.</Empty>}
          {liabilities.map((l) => (
            <Row
              key={l.id}
              left={fmtDateOnly(l.business_date)}
              label={`${l.creditor}${l.description ? ` · ${l.description}` : ""}`}
              value={l.outstanding_tzs}
              tag={l.status}
              muted={!!l.voided_at}
              actions={
                canFinance && !closed && Number(l.outstanding_tzs || 0) > 0.5 ? (
                  <MiniButton onClick={() => { setLiabilityId(l.id); setDlg("pay"); }}>Pay</MiniButton>
                ) : null
              }
            />
          ))}
          {payments.length > 0 && (
            <div className="pt-1 mt-1 border-t border-border/60">
              {payments.map((p) => (
                <Row key={p.id} left={fmtDateOnly(p.business_date)} label={p.note || "Repayment"} value={-p.amount_tzs} />
              ))}
            </div>
          )}
        </ListCard>

        <ListCard
          title="Collections"
          subtitle={`${fmt(collected)} collected · ${fmt(available)} available`}
        >
          <Row left="Cumulative" label="Collections this month" value={collected} />
          <Row left="Remaining" label="Available for Collection" value={available} />
        </ListCard>
      </div>

      {/* ── Dialogs ── */}
      <ResponsiveDialog open={dlg === "liability"} onOpenChange={(o) => !o && reset()} title="Add Manual Liability">
        <FormGrid>
          <FormField span={6} label="Creditor" required>
            <Input value={creditor} onChange={(e) => setCreditor(e.target.value)} placeholder="Who is owed" />
          </FormField>
          <FormField span={6} label="Amount (TZS)" required>
            <NumberInput decimals={2} value={amount} onValueChange={(v) => setAmount(v == null ? "" : String(v))} />
          </FormField>
          <FormField span={6} label="Business Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField span={6} label="Due Date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField span={12} label="Description">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </FormGrid>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={!creditor.trim() || amt <= 0 || addLiability.isPending}
            onClick={() =>
              addLiability.mutate(
                {
                  casino_id: casinoId,
                  creditor: creditor.trim(),
                  amount: amt,
                  business_date: date,
                  description: note.trim() || undefined,
                  due_date: dueDate || null,
                },
                { onSuccess: reset },
              )
            }
          >
            Save Liability
          </Button>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={dlg === "pay"} onOpenChange={(o) => !o && reset()} title="Pay / Part-pay Liability">
        <FormGrid>
          <FormField span={12} label="Liability" required>
            <Select value={liabilityId} onValueChange={setLiabilityId}>
              <SelectTrigger><SelectValue placeholder="Select liability…" /></SelectTrigger>
              <SelectContent>
                {openLiabilities.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.creditor} · {fmt(l.outstanding_tzs)} left
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="Amount (TZS)" required hint={selected ? `max ${fmt(selected.outstanding_tzs)}` : undefined}>
            <NumberInput decimals={2} value={amount} onValueChange={(v) => setAmount(v == null ? "" : String(v))} />
          </FormField>
          {walletSelect}
          <FormField span={6} label="Business Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField span={6} label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </FormGrid>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            Cash leaves the selected wallet once. Intercompany repayments are booked by the transfer registry.
          </span>
          <Button
            size="sm"
            disabled={!liabilityId || amt <= 0 || !wallet || payLiability.isPending}
            onClick={() =>
              payLiability.mutate(
                { liability_id: liabilityId, amount: amt, business_date: date, wallet_id: wallet, note: note.trim() || undefined },
                { onSuccess: reset },
              )
            }
          >
            Record Repayment
          </Button>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={dlg === "collect"} onOpenChange={(o) => !o && reset()} title="Record Collection">
        <FormGrid>
          <FormField span={6} label="Amount (TZS)" required hint={`available ${fmt(available)}`}>
            <NumberInput decimals={2} value={amount} onValueChange={(v) => setAmount(v == null ? "" : String(v))} />
          </FormField>
          {walletSelect}
          <FormField span={6} label="Business Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField span={6} label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </FormGrid>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            Partial collections are allowed. Final Profit and Manager Bonus stay frozen.
          </span>
          <Button
            size="sm"
            disabled={!wallet || amt <= 0 || amt > available + 0.5 || collect.isPending}
            onClick={() =>
              collect.mutate(
                { casino_id: casinoId, year, month, amount: amt, wallet_id: wallet, business_date: date, note: note.trim() || undefined },
                { onSuccess: reset },
              )
            }
          >
            Record Collection
          </Button>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={dlg === "paid"} onOpenChange={(o) => !o && reset()} title="Mark Extra Expense Paid">
        <FormGrid>
          {walletSelect}
          <FormField span={6} label="Paid Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </FormGrid>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            Cash is posted out of the selected wallet exactly once.
          </span>
          <Button
            size="sm"
            disabled={!wallet || markPaid.isPending}
            onClick={() =>
              markPaid.mutate({ id: unplannedId, wallet_id: wallet, paid_date: date }, { onSuccess: reset })
            }
          >
            Mark Paid
          </Button>
        </div>
      </ResponsiveDialog>
    </PageSection>
  );
};

const ListCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="rounded-md border border-border bg-card overflow-hidden flex flex-col">
    <div className="h-8 px-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
      <span>{title}</span>
      {subtitle ? <span className="normal-case tracking-normal">{subtitle}</span> : null}
    </div>
    <div className="px-3 py-1.5 max-h-[280px] overflow-y-auto">{children}</div>
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] text-muted-foreground py-4 text-center">{children}</div>
);

const MiniButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={onClick}>
    {children}
  </Button>
);

const Row = ({
  left,
  label,
  value,
  tag,
  muted,
  actions,
}: {
  left: string;
  label: string;
  value: number;
  tag?: string;
  muted?: boolean;
  actions?: React.ReactNode;
}) => (
  <div className={cn("flex items-center gap-2 text-[11px] border-b border-border/40 py-1.5", muted && "opacity-50 line-through")}>
    <span className="w-20 shrink-0 font-mono text-muted-foreground">{left}</span>
    <span className="flex-1 truncate" title={label}>{label}</span>
    <span className="font-mono tabular-nums">{fmt(value)}</span>
    {tag ? <span className="w-16 text-center text-[10px] uppercase text-muted-foreground">{tag}</span> : null}
    {actions ? <span className="flex gap-1">{actions}</span> : null}
  </div>
);
