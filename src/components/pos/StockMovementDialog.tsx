/**
 * Stock movement dialog: delta (+ in / − out / adjustment) + reason.
 * Inserts pos_inventory_movements; DB trigger updates stock_qty.
 *
 * Phase 3D enhancement: waste / spoilage / damage / staff_consumption / tasting
 * reasons are routed through pos_record_waste RPC so cost snapshots are
 * captured immutably. Other reasons still use the direct insert hook.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormGrid } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useAddPosInventoryMovement } from "@/hooks/use-pos-inventory";
import { usePosRecordWaste, WASTE_REASON_LABELS, type WasteReason } from "@/hooks/use-pos-waste";
import type { PosMenuItem } from "@/hooks/use-pos-menu";
import { formatNumberSpaces } from "@/lib/currency";

type Direction = "in" | "out";

const PRESET_REASONS: Record<Direction, string[]> = {
  in: ["Stock-in (delivery)", "Returned by waiter", "Found / recount +"],
  out: ["Spillage", "Recount −"],
};

const WASTE_REASONS: WasteReason[] = ["waste", "spoilage", "staff_consumption", "damage", "tasting"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: PosMenuItem | null;
}

export const StockMovementDialog = ({ open, onOpenChange, item }: Props) => {
  const { user } = useAuth();
  const add = useAddPosInventoryMovement();
  const waste = usePosRecordWaste();
  const [direction, setDirection] = useState<Direction>("in");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [wasteReason, setWasteReason] = useState<WasteReason>("waste");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDirection("in");
      setQty("1");
      setReason("");
      setWasteReason("waste");
      setNotes("");
    }
  }, [open]);

  const qtyN = Number(qty) || 0;
  const delta = direction === "in" ? qtyN : -qtyN;
  const newStock = (item?.stock_qty ?? 0) + delta;

  const isWasteMode = direction === "out" && (WASTE_REASONS as string[]).includes(reason.trim());
  const valid = !!item && qtyN > 0 && (isWasteMode ? true : reason.trim().length > 0);

  const handle = async () => {
    if (!item) return;
    if (!valid) {
      toast({ title: "Enter a positive quantity and reason", variant: "destructive" });
      return;
    }
    try {
      if (isWasteMode) {
        await waste.mutateAsync({
          item_id: item.id,
          qty: qtyN,
          reason: reason.trim() as WasteReason,
          notes: notes.trim() || null,
        });
        toast({ title: `${WASTE_REASON_LABELS[reason.trim() as WasteReason]} recorded` });
      } else {
        await add.mutateAsync({
          item_id: item.id,
          delta,
          reason: reason.trim(),
          user_id: user?.id ?? null,
        });
        toast({ title: direction === "in" ? "Stock added" : "Stock removed" });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Stock movement · ${item?.name ?? ""}`} size="md">
      <div className="space-y-4">
        <div className="rounded-md bg-muted/40 px-4 py-3 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Current stock</span>
          <span className="font-mono tabular-nums text-lg">
            {item?.stock_qty != null ? formatNumberSpaces(item.stock_qty) : "—"}
          </span>
        </div>

        <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="in">+ Stock in</TabsTrigger>
            <TabsTrigger value="out">− Stock out</TabsTrigger>
          </TabsList>
        </Tabs>

        <FormGrid>
          <FormField span={6} label="Quantity" required>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField span={6} label="New stock">
            <div className="h-10 flex items-center font-mono tabular-nums">
              {formatNumberSpaces(newStock)}
            </div>
          </FormField>
        </FormGrid>

        {direction === "out" && (
          <FormGrid>
            <FormField span={12} label="Operational reason (cost snapshot)" required>
              <div className="flex flex-wrap gap-1">
                {WASTE_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      reason === r
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted hover:bg-muted/70 border-transparent"
                    }`}
                  >
                    {WASTE_REASON_LABELS[r]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                These reasons record an immutable cost snapshot and appear in the Cost Control report.
              </p>
            </FormField>
          </FormGrid>
        )}

        <FormGrid>
          <FormField span={12} label={direction === "out" ? "Other reason (free text)" : "Reason"} required={direction === "in"}>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={direction === "in" ? "e.g. Delivery from supplier" : "e.g. Spillage, Recount −, or select above"}
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {PRESET_REASONS[direction].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/70"
                >
                  {r}
                </button>
              ))}
            </div>
          </FormField>
        </FormGrid>

        {isWasteMode && (
          <FormGrid>
            <FormField span={12} label="Notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional details: batch number, cause, witness…"
                rows={2}
              />
            </FormField>
          </FormGrid>
        )}

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handle} disabled={!valid || add.isPending || waste.isPending}>
            {waste.isPending || add.isPending ? "Saving…" : "Confirm"}
          </Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
};

export default StockMovementDialog;
