/**
 * Checkout: tenders money / credits / free, any mix. Sum must equal retail total.
 * Server RPC pos_close_tab_v2 validates and redeems credits (idempotent).
 * 100% FREE tabs are closed by a manager at end of shift (not here).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { FormField, FormGrid } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { toast } from "@/hooks/use-toast";
import { formatNumberSpaces } from "@/lib/currency";
import { useCheckoutPosTab, type PosTab } from "@/hooks/use-pos-tabs";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tab: PosTab;
  onClosed?: () => void;
}

export const CheckoutDialog = ({ open, onOpenChange, tab, onClosed }: Props) => {
  const checkout = useCheckoutPosTab();
  const total = Number(tab.total_tzs) || 0;
  const isGuest = !tab.player_id;
  const [money, setMoney] = useState(0);
  const [credits, setCredits] = useState(0);
  const [free, setFree] = useState(0);
  const idem = useMemo(() => crypto.randomUUID(), [open, tab.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) { setMoney(total); setCredits(0); setFree(0); }
  }, [open, total]);

  const sum = money + credits + free;
  const diff = total - sum;
  const fullFree = total > 0 && free === total;
  const valid = diff === 0 && !(isGuest && credits > 0) && !fullFree;

  const submit = async () => {
    try {
      await checkout.mutateAsync({ tab_id: tab.id, money, credits, free, idem });
      toast({ title: "Tab closed" });
      onOpenChange(false);
      onClosed?.();
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Checkout · ${formatNumberSpaces(total)} TZS`} size="md">
      <div className="space-y-3">
        <FormGrid>
          <FormField span={4} label="Money">
            <NumberInput decimals={0} min={0} value={money} onValueChange={(v) => setMoney(Math.max(0, v ?? 0))} className="text-lg" />
          </FormField>
          <FormField span={4} label={isGuest ? "Credits (players only)" : "Credits"}>
            <NumberInput decimals={0} min={0} value={credits} disabled={isGuest}
              onValueChange={(v) => setCredits(Math.max(0, v ?? 0))} className="text-lg" />
          </FormField>
          <FormField span={4} label="Free">
            <NumberInput decimals={0} min={0} value={free} onValueChange={(v) => setFree(Math.max(0, v ?? 0))} className="text-lg" />
          </FormField>
        </FormGrid>
        <div className="flex justify-between text-sm font-mono tabular-nums">
          <span className="text-muted-foreground">Remaining</span>
          <span className={diff === 0 ? "" : "cms-amount-negative"}>{formatNumberSpaces(diff)}</span>
        </div>
        {fullFree && (
          <p className="text-xs text-muted-foreground">
            A 100% FREE tab stays open and is closed by a POS manager at end of shift.
          </p>
        )}
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || checkout.isPending}>
            {checkout.isPending ? "Closing…" : "Confirm checkout"}
          </Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
};

export default CheckoutDialog;
