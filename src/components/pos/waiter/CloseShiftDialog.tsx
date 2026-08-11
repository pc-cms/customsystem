/**
 * Close POS shift: preview Z-report + closing cash + REQUIRED closing stock count.
 * Server enforces: no open tabs, immutability after close, permission check.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { FormField, FormGrid } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { toast } from "@/hooks/use-toast";
import { formatNumberSpaces } from "@/lib/currency";
import {
  useClosePosShift,
  usePosZReportPreview,
  type PosShift,
  type PosZReport,
} from "@/hooks/use-pos-shift";
import { useSavePosStockCount } from "@/hooks/use-pos-stock-counts";
import ZReportView from "./ZReportView";
import StockCountPanel from "./StockCountPanel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shift: PosShift | null;
  openTabsCount: number;
  onClosed: (z: PosZReport) => void;
}

export const CloseShiftDialog = ({ open, onOpenChange, shift, openTabsCount, onClosed }: Props) => {
  const closeMut = useClosePosShift();
  const saveCountMut = useSavePosStockCount();
  const { data: preview, isLoading } = usePosZReportPreview(shift?.id ?? null, open);
  const [closingCash, setClosingCash] = useState("0");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open && preview) {
      setClosingCash(String(preview.expected_cash ?? 0));
    }
  }, [open, preview]);

  useEffect(() => {
    if (open) setCounts({});
  }, [open]);

  const previewWithCash: PosZReport | null = preview
    ? {
        ...preview,
        closing_cash: Math.round(Number(closingCash) || 0),
        cash_delta: Math.round(Number(closingCash) || 0) - preview.expected_cash,
      }
    : null;

  const countedItems = Object.keys(counts).length;
  const busy = closeMut.isPending || saveCountMut.isPending;
  const canClose = openTabsCount === 0 && !!shift && !!preview && countedItems > 0 && !busy;

  const handle = async () => {
    if (!shift) return;
    if (openTabsCount > 0) {
      toast({ title: "Close all open tabs first", variant: "destructive" });
      return;
    }
    if (countedItems === 0) {
      toast({ title: "Closing stock count required", description: "Enter at least one counted item.", variant: "destructive" });
      return;
    }
    try {
      // 1. Save closing stock count first — attaches to shift while still open.
      await saveCountMut.mutateAsync({
        shift_id: shift.id,
        count_type: "close",
        items: Object.entries(counts).map(([item_id, counted_qty]) => ({ item_id, counted_qty })),
      });
      // 2. Close shift.
      const z = await closeMut.mutateAsync({
        shift_id: shift.id,
        closing_cash: Math.round(Number(closingCash) || 0),
      });
      toast({ title: "Shift closed" });
      onClosed(z);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed to close shift", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Close shift · Z-report" size="xl">
      <div className="space-y-4">
        {openTabsCount > 0 && (
          <div className="rounded-md bg-cms-amount-negative/10 text-cms-amount-negative px-3 py-2 text-sm">
            {openTabsCount} open tab(s) must be closed first.
          </div>
        )}

        <FormGrid>
          <FormField span={6} label="Closing cash in drawer">
            <NumberInput
              decimals={0}
              value={Number(closingCash) || 0}
              onValueChange={(v) => setClosingCash(String(v ?? 0))}
              className="text-lg"
            />
          </FormField>
          <FormField span={6} label="Expected">
            <div className="h-10 flex items-center font-mono tabular-nums">
              {preview ? formatNumberSpaces(preview.expected_cash) : "—"} TZS
            </div>
          </FormField>
        </FormGrid>

        {isLoading && <div className="text-sm text-muted-foreground">Computing report…</div>}
        {previewWithCash && <ZReportView z={previewWithCash} />}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Stock count · closing
            </p>
            <span className="text-[10px] text-muted-foreground">
              Enter actual shelf qty per item. Expected qty is hidden; variance is recorded for the manager report.
            </span>
          </div>
          <StockCountPanel value={counts} onChange={setCounts} />
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handle} disabled={!canClose}>
            {saveCountMut.isPending ? "Saving count…" : closeMut.isPending ? "Closing…" : "Confirm & close shift"}
          </Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
};

export default CloseShiftDialog;
