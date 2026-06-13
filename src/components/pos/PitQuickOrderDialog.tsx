/**
 * PitQuickOrderDialog — Pit/Manager quick F&B order for a selected player.
 *
 * Flow:
 *   1. Requires an open POS shift in this casino (any waiter). If none → block.
 *   2. Find / create an open POS tab for this player on that shift.
 *   3. Pick items + qty from the menu; on "Send to bar" each line is inserted
 *      as a pending order, picked up by the bar Kanban (PosBar).
 *
 * Source-of-truth: each line = one pos_orders row (kanban granularity).
 * Visible only to pit / manager / shift_manager via the PlayerPreviewHeader.
 */
import { useMemo, useState } from "react";
import { Minus, Plus, Send, AlertCircle } from "lucide-react";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { usePosAnyOpenShift } from "@/hooks/use-pos-shift";
import { usePosMenuCategories, usePosMenuItems, type PosMenuItem } from "@/hooks/use-pos-menu";
import { useAddPosOrder } from "@/hooks/use-pos-orders";
import { stockStatus } from "@/hooks/use-pos-inventory";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  playerId: string;
  playerName: string;
}

export const PitQuickOrderDialog = ({ open, onOpenChange, playerId, playerName }: Props) => {
  const { activeCasinoId } = useCasino();
  const { user } = useAuth();
  const casinoId = activeCasinoId || null;

  const { data: shift, isLoading: shiftLoading } = usePosAnyOpenShift(casinoId);
  const { data: categories = [] } = usePosMenuCategories(casinoId);
  const { data: items = [] } = usePosMenuItems(casinoId);
  const addOrder = useAddPosOrder();

  const activeCats = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const effectiveCat = selectedCat ?? activeCats[0]?.id ?? null;
  const filtered = useMemo(
    () => items.filter((i) => i.is_active && (!effectiveCat || i.category_id === effectiveCat)),
    [items, effectiveCat],
  );
  const itemsById = useMemo(() => {
    const m = new Map<string, PosMenuItem>();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  const cartLines = Object.entries(cart).filter(([, q]) => q > 0);
  const cartTotal = cartLines.reduce(
    (s, [id, q]) => s + (itemsById.get(id)?.price_tzs ?? 0) * q,
    0,
  );

  const bump = (id: string, delta: number, max: number | null) => {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      if (max != null && next > max) return c;
      return { ...c, [id]: next };
    });
  };

  const reset = () => { setCart({}); setSelectedCat(null); };
  const close = () => { reset(); onOpenChange(false); };

  const ensureTabId = async (shiftId: string): Promise<string> => {
    // Look for an open tab already attached to this player in this shift.
    const { data: existing, error: findErr } = await supabase
      .from("pos_tabs")
      .select("id")
      .eq("shift_id", shiftId)
      .eq("player_id", playerId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing?.id) return existing.id as string;

    // Otherwise create one. opened_by_user_id = pit's own user (audit).
    const { data: created, error: insErr } = await supabase
      .from("pos_tabs")
      .insert({
        casino_id: casinoId!,
        shift_id: shiftId,
        opened_by_user_id: user!.id,
        player_id: playerId,
        player_name: playerName,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return created.id as string;
  };

  const submit = async () => {
    if (!shift || !user || !casinoId) return;
    if (cartLines.length === 0) return;
    setSubmitting(true);
    try {
      const tabId = await ensureTabId(shift.id);
      // Each line = one order (kanban granularity). Sequential to keep audit clean.
      for (const [itemId, qty] of cartLines) {
        const it = itemsById.get(itemId);
        if (!it) continue;
        await addOrder.mutateAsync({
          casino_id: casinoId,
          shift_id: shift.id,
          tab_id: tabId,
          waiter_user_id: shift.waiter_user_id,
          item_id: it.id,
          item_name: it.name,
          unit_price_tzs: it.price_tzs,
          qty,
        });
      }
      toast({ title: "Sent to bar", description: `${cartLines.length} item(s) ordered` });
      close();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : close())}
      title={`F&B Order — ${playerName}`}
      description="Send directly to the bar for the player's open tab."
      size="3xl"
    >
      {shiftLoading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !shift ? (
        <div className="flex items-start gap-3 p-4 rounded-md border border-destructive/40 bg-destructive/5">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-destructive">No active POS shift</div>
            <div className="text-muted-foreground">
              A waiter must open a POS shift before orders can be sent to the bar.
            </div>
          </div>
        </div>
      ) : activeCats.length === 0 ? (
        <div className="p-4 text-center text-sm text-muted-foreground">
          No active menu categories. Ask the POS manager to set up the menu.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Categories */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {activeCats.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={effectiveCat === c.id ? "default" : "outline"}
                onClick={() => setSelectedCat(c.id)}
                className="shrink-0"
              >
                {c.name}
              </Button>
            ))}
          </div>

          {/* Menu grid */}
          <ScrollArea className="h-[320px] pr-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filtered.map((it) => {
                const status = stockStatus(it.stock_qty, it.low_threshold);
                const isOut = status === "out";
                const qty = cart[it.id] ?? 0;
                return (
                  <div
                    key={it.id}
                    className={cn(
                      "rounded-md border border-border p-2 flex flex-col gap-1.5 bg-card",
                      isOut && "opacity-50",
                      qty > 0 && "ring-2 ring-primary",
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-sm font-medium leading-tight">{it.name}</div>
                      {status === "low" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">Low</Badge>
                      )}
                      {isOut && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0">Out</Badge>
                      )}
                    </div>
                    <div className="font-mono text-sm tabular-nums text-muted-foreground">
                      {formatNumberSpaces(it.price_tzs)}
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={qty === 0}
                        onClick={() => bump(it.id, -1, it.stock_qty)}
                        aria-label="Decrease"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <span className="font-mono font-semibold tabular-nums text-sm w-6 text-center">
                        {qty}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={isOut}
                        onClick={() => bump(it.id, 1, it.stock_qty)}
                        aria-label="Increase"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-6">
                  No items in this category.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Cart summary */}
          <div className="rounded-md border border-border p-2 bg-muted/30">
            {cartLines.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-1">
                Pick items to build the order.
              </div>
            ) : (
              <div className="space-y-1">
                {cartLines.map(([id, q]) => {
                  const it = itemsById.get(id);
                  if (!it) return null;
                  return (
                    <div key={id} className="flex items-center justify-between text-sm">
                      <span className="truncate">
                        <span className="font-mono font-semibold tabular-nums mr-2">×{q}</span>
                        {it.name}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {formatNumberSpaces(it.price_tzs * q)}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-1 border-t border-border text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{formatNumberSpaces(cartTotal)} TZS</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
        <Button
          onClick={submit}
          disabled={!shift || cartLines.length === 0 || submitting}
          className="gap-2"
        >
          <Send className="w-4 h-4" />
          {submitting ? "Sending…" : "Send to bar"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
