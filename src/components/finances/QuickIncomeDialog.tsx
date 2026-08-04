/**
 * Quick income dialog for a fixed source (JP / Fee ...).
 * Writes into fin_other_incomes — affects the wallet balance immediately.
 */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { useFinWallets } from "@/hooks/use-fin";
import { useAddOtherIncome, type OtherIncomeSource } from "@/hooks/use-other-incomes";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: OtherIncomeSource;
  title: string;
  defaultDate?: string;
};

export default function QuickIncomeDialog({ open, onOpenChange, source, title, defaultDate }: Props) {
  const { data: wallets = [] } = useFinWallets();
  const add = useAddOtherIncome();

  const [businessDate, setBusinessDate] = useState(
    defaultDate || new Date().toISOString().slice(0, 10),
  );
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setBusinessDate(defaultDate || new Date().toISOString().slice(0, 10));
      setWalletId("");
      setAmount("");
      setNote("");
    }
  }, [open, defaultDate]);

  const activeWallet = (wallets as any[]).find((w) => w.id === walletId);

  const submit = async () => {
    if (!walletId) return toast.error("Select a wallet");
    const amt = Number(amount);
    if (!amt) return toast.error("Enter an amount");
    await add.mutateAsync({
      business_date: businessDate,
      wallet_id: walletId,
      source,
      currency: activeWallet?.currency || "TZS",
      amount: amt,
      note: note || null,
    } as any);
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title}>
      <FormGrid>
        <FormField span={6} label="Business Date">
          <Input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
        </FormField>
        <FormField span={6} label="Wallet">
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger>
              <SelectValue placeholder="Select wallet…" />
            </SelectTrigger>
            <SelectContent>
              {(wallets as any[]).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} · {w.currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField span={6} label={`Amount (${activeWallet?.currency || "TZS"})`}>
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0 (use minus for deduction)"
          />
        </FormField>
        <FormField span={6} label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>
      </FormGrid>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={add.isPending}>
          {add.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
