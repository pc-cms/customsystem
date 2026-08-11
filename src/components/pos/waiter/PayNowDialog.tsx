/**
 * PayNowDialog — instant cash/card payment for a single order line on a tab.
 *
 * Strategy (no schema changes, immutability respected):
 *   1. Create a NEW walk-in mini-tab in the same shift labelled "Pay-now · <parent>".
 *   2. Re-issue every item of the source order as a fresh order on that mini-tab,
 *      already marked `served` (it was an existing kitchen line, just being paid).
 *   3. Close the mini-tab with the chosen cash/card split.
 *   4. Void the original order on the parent tab so totals don't double-count.
 *
 * Only available while the source order is still `pending` or `preparing`
 * (same gate as Void). Comp payments are NOT offered here — they belong on
 * the parent tab's Close bill flow with full audit context.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { toast } from "@/hooks/use-toast";
import { formatNumberSpaces } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useClosePosTab } from "@/hooks/use-pos-tabs";
import { useVoidPosOrder } from "@/hooks/use-pos-orders";
import type { PosOrderWithItems } from "@/hooks/use-pos-orders";
import type { PosTab } from "@/hooks/use-pos-tabs";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  parentTab: PosTab | null;
  order: PosOrderWithItems | null;
  casinoId: string;
  shiftId: string;
  userId: string;
}

export const PayNowDialog = ({
  open, onOpenChange, parentTab, order, casinoId, shiftId, userId,
}: Props) => {
  const close = useClosePosTab();
  const voidOrder = useVoidPosOrder();
  const total = order?.total_tzs ?? 0;
  const [cash, setCash] = useState("0");
  const [card, setCard] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setCash(String(total)); setCard("0"); }
  }, [open, total]);

  const sum = (Number(cash) || 0) + (Number(card) || 0);
  const valid = sum === total && total > 0;

  const submit = async () => {
    if (!order || !parentTab || !valid) return;
    setBusy(true);
    try {
      const parentLabel = parentTab.player_id
        ? parentTab.player_name || "Player"
        : parentTab.walkin_label || "Walk-in";

      // 1. Mini walk-in tab
      const { data: mini, error: tErr } = await supabase
        .from("pos_tabs")
        .insert({
          casino_id: casinoId,
          shift_id: shiftId,
          opened_by_user_id: userId,
          walkin_label: `Pay-now · ${parentLabel}`,
        })
        .select("id")
        .single();
      if (tErr) throw tErr;

      // 2. Re-issue each item as a served order on the mini tab
      for (const it of order.items) {
        const { data: o, error: oErr } = await supabase
          .from("pos_orders")
          .insert({
            casino_id: casinoId,
            shift_id: shiftId,
            tab_id: mini.id,
            waiter_user_id: userId,
            status: "served",
          })
          .select("id")
          .single();
        if (oErr) throw oErr;
        const { error: iErr } = await supabase.from("pos_order_items").insert({
          order_id: o.id,
          item_id: it.item_id,
          item_name: it.item_name,
          qty: it.qty,
          unit_price_tzs: it.unit_price_tzs,
          line_total_tzs: it.line_total_tzs,
        });
        if (iErr) throw iErr;
      }

      // 3. Close the mini tab
      await close.mutateAsync({
        tab_id: mini.id,
        total_tzs: total,
        payment_split: {
          cash: Math.round(Number(cash) || 0),
          card: Math.round(Number(card) || 0),
        },
      });

      // 4. Void original on parent tab so totals don't double up
      await voidOrder.mutateAsync({ order_id: order.id, reason: "Paid via Pay-now" });

      toast({ title: "Paid", description: "Receipt closed for this item" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Pay-now failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const itemName = order?.items?.[0]?.item_name ?? "";
  const itemLine = order?.items?.length === 1
    ? `${itemName} ×${order.items[0].qty}`
    : `${order?.items?.length ?? 0} items`;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Pay now" size="md">
      <div className="space-y-4">
        <div className="rounded-md bg-muted/40 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Item</div>
          <div className="font-medium truncate">{itemLine}</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Amount</span>
            <span className="text-2xl font-bold font-mono tabular-nums">
              {formatNumberSpaces(total)} <span className="text-sm">TZS</span>
            </span>
          </div>
        </div>

        <FormGrid>
          <FormField span={6} label="Cash">
            <NumberInput
              decimals={0}
              value={Number(cash) || 0}
              onValueChange={(v) => setCash(String(v ?? 0))}
              className="text-lg"
            />
          </FormField>
          <FormField span={6} label="Card">
            <NumberInput
              decimals={0}
              value={Number(card) || 0}
              onValueChange={(v) => setCard(String(v ?? 0))}
              className="text-lg"
            />
          </FormField>
        </FormGrid>

        <div className={`rounded-md px-4 py-2 flex items-center justify-between text-sm ${
          valid
            ? "bg-cms-amount-positive/10 text-cms-amount-positive"
            : "bg-cms-amount-negative/10 text-cms-amount-negative"
        }`}>
          <span>Sum {formatNumberSpaces(sum)}</span>
          <span>{valid ? "Balanced" : `Δ ${sum - total > 0 ? "+" : ""}${formatNumberSpaces(sum - total)}`}</span>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? "Processing…" : "Confirm payment"}
          </Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
};

export default PayNowDialog;
