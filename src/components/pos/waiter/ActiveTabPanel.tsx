import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Receipt, CreditCard, Printer, Plus } from "lucide-react";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";
import {
  usePosTabOrders,
  useVoidPosOrder,
  useUpdatePosOrderNotes,
  type PosOrderStatus,
  type PosOrderWithItems,
} from "@/hooks/use-pos-orders";
import type { PosTab } from "@/hooks/use-pos-tabs";
import {
  usePosModifiers,
  usePosOrderItemModifiers,
  useAttachModifier,
  useDetachModifier,
} from "@/hooks/use-pos-modifiers";

import { toast } from "@/hooks/use-toast";
import CloseBillDialog from "./CloseBillDialog";
import PayNowDialog from "./PayNowDialog";
import ReceiptDialog from "./ReceiptDialog";
import PlayerPosStatusBadge from "@/components/pos/PlayerPosStatusBadge";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Props {
  tab: PosTab | null;
  casinoId: string;
  shiftId: string;
  userId: string;
}

const STATUS_CHIP: Record<PosOrderStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
  preparing: { label: "Preparing", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  ready: { label: "Ready", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  served: { label: "Served", cls: "bg-muted/60 text-muted-foreground" },
  void: { label: "Void", cls: "bg-cms-amount-negative/15 text-cms-amount-negative line-through" },
};

export const ActiveTabPanel = ({ tab, casinoId, shiftId, userId }: Props) => {
  const { data: orders = [], isLoading } = usePosTabOrders(tab?.id ?? null, casinoId);
  const voidOrder = useVoidPosOrder();
  const updateNotes = useUpdatePosOrderNotes();
  const [closeDialog, setCloseDialog] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [payNowOrder, setPayNowOrder] = useState<PosOrderWithItems | null>(null);
  const [modItemId, setModItemId] = useState<string | null>(null);

  const orderItemIds = useMemo(
    () => orders.flatMap((o) => o.items.map((it) => it.id)),
    [orders],
  );
  const { data: allModifiers = [] } = usePosOrderItemModifiers(orderItemIds);
  const modsByItem = useMemo(() => {
    const m = new Map<string, typeof allModifiers>();
    for (const x of allModifiers) {
      const arr = m.get(x.order_item_id) ?? [];
      arr.push(x);
      m.set(x.order_item_id, arr);
    }
    return m;
  }, [allModifiers]);
  const itemOrderStatus = useMemo(() => {
    const m = new Map<string, PosOrderStatus>();
    for (const o of orders) for (const it of o.items) m.set(it.id, o.status);
    return m;
  }, [orders]);


  if (!tab) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-6">
        <Receipt className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Select a tab or open a new one to start.</p>
      </div>
    );
  }

  const label = tab.player_id ? tab.player_name || "Player" : `Walk-in · ${tab.walkin_label}`;

  const handleVoid = async (orderId: string) => {
    try {
      await voidOrder.mutateAsync({ order_id: orderId });
      toast({ title: "Order voided" });
    } catch (e: any) {
      toast({ title: "Cannot void", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate flex items-center gap-2">
              <span className="truncate">{label}</span>
              <PlayerPosStatusBadge playerId={tab.player_id} casinoId={tab.casino_id} />
            </div>
            <div className="text-xs text-muted-foreground">Opened {fmtDateTime(tab.opened_at)}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Total</div>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {formatNumberSpaces(tab.total_tzs)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No items yet. Tap menu to add.</div>
        ) : (
          <ul className="divide-y divide-border">
            {orders.map((o) => {
              const chip = STATUS_CHIP[o.status];
              const canVoid = o.status === "pending" || o.status === "preparing";
              const canPayNow = canVoid && o.total_tzs > 0;
              const canEditNote = o.status === "pending";
              const notes = (o as any).notes as string | null;
              return (
                <li key={o.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {o.items.map((it) => {
                        const mods = modsByItem.get(it.id) ?? [];
                        return (
                          <div key={it.id}>
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                              <span className={cn("truncate", o.status === "void" && "line-through opacity-60")}>
                                {it.item_name} <span className="text-muted-foreground">×{it.qty}</span>
                              </span>
                              <span className="font-mono tabular-nums">{formatNumberSpaces(it.line_total_tzs)}</span>
                            </div>
                            {mods.length > 0 && (
                              <div className="pl-3 flex flex-wrap gap-1 mt-0.5">
                                {mods.map((m) => (
                                  <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                    + {m.modifier_name_snapshot}
                                    {m.price_tzs_delta_snapshot !== 0 && (
                                      <span className="ml-1 font-mono tabular-nums">
                                        ({m.price_tzs_delta_snapshot > 0 ? "+" : ""}{formatNumberSpaces(m.price_tzs_delta_snapshot)})
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                            {o.status === "pending" && (
                              <button
                                type="button"
                                onClick={() => setModItemId(it.id)}
                                className="mt-0.5 text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                              >
                                <Plus className="h-3 w-3" /> {mods.length > 0 ? "Edit modifiers" : "Add modifiers"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {(notes || canEditNote) && (
                        <button
                          type="button"
                          disabled={!canEditNote}
                          onClick={() => {
                            if (!canEditNote) return;
                            const next = window.prompt("Edit note (blank to clear):", notes ?? "");
                            if (next === null) return;
                            void updateNotes.mutateAsync({
                              order_id: o.id,
                              notes: next.trim() ? next.trim() : null,
                            }).catch((e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }));
                          }}
                          className={cn(
                            "mt-1 text-left text-xs italic w-full px-2 py-1 rounded",
                            notes ? "bg-muted/60 text-foreground" : "text-muted-foreground",
                            canEditNote ? "hover:bg-accent/40" : "opacity-80 cursor-default",
                          )}
                        >
                          📝 {notes || (canEditNote ? "Add a note…" : "")}
                        </button>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <Badge className={chip.cls} variant="secondary">{chip.label}</Badge>
                        <span className="text-[11px] text-muted-foreground">{fmtDateTime(o.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canPayNow && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPayNowOrder(o)}
                          title="Pay now"
                        >
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                      {canVoid && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleVoid(o.id)}
                          title="Void"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

        )}
      </div>

      <div className="p-3 border-t border-border flex gap-2">
        <Button
          variant="outline"
          className="h-12"
          onClick={() => setReceiptOpen(true)}
          title="Preview / print receipt"
        >
          <Printer className="h-4 w-4" />
        </Button>
        <Button
          className="flex-1 h-12 text-base"
          disabled={tab.total_tzs <= 0}
          onClick={() => setCloseDialog(true)}
        >
          Close bill · {formatNumberSpaces(tab.total_tzs)} TZS
        </Button>
      </div>

      <CloseBillDialog
        open={closeDialog}
        onOpenChange={setCloseDialog}
        tab={tab}
        onClosed={() => setReceiptOpen(true)}
      />
      <ReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} tab={tab} />
      <PayNowDialog
        open={!!payNowOrder}
        onOpenChange={(o) => { if (!o) setPayNowOrder(null); }}
        parentTab={tab}
        order={payNowOrder}
        casinoId={casinoId}
        shiftId={shiftId}
        userId={userId}
      />
    </div>
  );
};

export default ActiveTabPanel;
