/**
 * Unplanned Expenses — Dashboard TV entry point (Floor Manager and above).
 *
 * Rows can be marked Paid (which is what reduces Cash
 * Position). Finance manager / super_admin may delete them outright; every
 * change is written to the finance audit log. All arithmetic lives
 * in `fin_month_finance`; this dialog only records intent.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinWallets } from "@/hooks/use-fin";
import {
  useMonthFinance,
  useAddUnplanned,
  useMarkUnplannedPaid,
  useDeleteUnplanned,
} from "@/hooks/use-fin-month-finance";
import { getBusinessDate } from "@/lib/business-day";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type CasinoOption = { id: string; name: string };

export const UnplannedExpensesDialog = ({
  open,
  onOpenChange,
  casinos,
  year,
  month,
  canPay,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  casinos: CasinoOption[];
  year: number;
  month: number;
  /** Finance roles only: marking Paid moves real cash. */
  canPay: boolean;
}) => {
  const [casinoId, setCasinoId] = useState<string>(casinos[0]?.id || "");
  const [date, setDate] = useState<string>(getBusinessDate());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [payWallet, setPayWallet] = useState<string>("");

  const { data: month_ } = useMonthFinance(casinoId || null, year, month);
  const { data: wallets = [] } = useFinWallets();
  const add = useAddUnplanned();
  const markPaid = useMarkUnplannedPaid();
  const removeItem = useDeleteUnplanned();

  const items = useMemo(
    () => (month_?.unplanned.items || []).filter((i) => !i.voided_at),
    [month_],
  );
  const casinoWallets = useMemo(
    () => (wallets as any[]).filter((w) => w.casino_id === casinoId),
    [wallets, casinoId],
  );

  const submit = () => {
    const amt = Number(amount);
    if (!casinoId || !description.trim() || !amt) return;
    add.mutate(
      { casino_id: casinoId, business_date: date, description: description.trim(), amount: amt },
      {
        onSuccess: () => {
          setDescription("");
          setAmount("");
        },
      },
    );
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Extra Expenses">
      <FormGrid>
        {casinos.length > 1 && (
          <FormField span={6} label="Casino">
            <Select value={casinoId} onValueChange={setCasinoId}>
              <SelectTrigger>
                <SelectValue placeholder="Select casino…" />
              </SelectTrigger>
              <SelectContent>
                {casinos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField span={6} label="Business Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField span={7} label="Description">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was spent on"
          />
        </FormField>
        <FormField span={5} label="Amount (TZS)">
          <NumberInput
            decimals={2}
            value={amount}
            onValueChange={(v) => setAmount(v == null ? "" : String(v))}
            placeholder="0"
          />
        </FormField>
      </FormGrid>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={submit} disabled={add.isPending}>
          <Plus className="w-4 h-4 mr-1" />
          {add.isPending ? "Saving…" : "Add Extra Expense"}
        </Button>
      </div>

      {canPay && casinoWallets.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
          <Select value={payWallet} onValueChange={setPayWallet}>
            <SelectTrigger className="h-8 w-[240px]">
              <SelectValue placeholder="Wallet used when marking Paid…" />
            </SelectTrigger>
            <SelectContent>
              {casinoWallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} · {w.currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3 space-y-1 max-h-[45vh] overflow-y-auto">
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No unplanned expenses recorded this month.
          </div>
        )}
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-xs border-b border-border/50 py-1.5">
            <span className="w-20 shrink-0 text-muted-foreground font-mono">
              {fmtDateOnly(i.business_date)}
            </span>
            <span className="flex-1 truncate" title={i.description || i.label}>
              {i.description || i.label}
            </span>
            <span className="font-mono tabular-nums">{formatNumberSpaces(i.amount_tzs)}</span>
            <span
              className={cn(
                "w-14 text-center text-[10px] uppercase font-semibold",
                i.paid ? "cms-amount-negative" : "text-muted-foreground",
              )}
            >
              {i.paid ? "Paid" : "Unpaid"}
            </span>
            {canPay && !i.paid && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => markPaid.mutate({ id: i.id, wallet_id: payWallet || null })}
              >
                Mark Paid
              </Button>
            )}
            {canPay && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Delete"
                onClick={() => {
                  if (confirm("Delete this extra expense? This is logged in the finance audit log.")) {
                    removeItem.mutate({ id: i.id });
                  }
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </ResponsiveDialog>
  );
};
