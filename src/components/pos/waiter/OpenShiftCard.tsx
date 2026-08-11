/**
 * OpenShiftCard — bartender opens a Day or Night shift.
 * On open we also REQUIRE the opening stock count (count_type='open'),
 * saved immediately after the shift is created.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { toast } from "@/hooks/use-toast";
import { useOpenPosShift, suggestShiftType, type PosShiftType } from "@/hooks/use-pos-shift";
import { useSavePosStockCount } from "@/hooks/use-pos-stock-counts";
import { formatNumberSpaces } from "@/lib/currency";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StockCountPanel from "./StockCountPanel";

interface Props {
  casinoId: string;
  userId: string;
}

const SEGMENTS: { value: PosShiftType; label: string }[] = [
  { value: "day", label: "Day · opening" },
  { value: "night", label: "Night · post-handover" },
];

export const OpenShiftCard = ({ casinoId, userId }: Props) => {
  const open = useOpenPosShift();
  const saveCount = useSavePosStockCount();
  const [cash, setCash] = useState("0");
  const [shiftType, setShiftType] = useState<PosShiftType>(suggestShiftType());
  const [counts, setCounts] = useState<Record<string, number>>({});

  const countedItems = Object.keys(counts).length;
  const handle = async () => {
    const n = Number(cash);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Opening cash must be a non-negative number", variant: "destructive" });
      return;
    }
    if (countedItems === 0) {
      toast({ title: "Opening stock count required", description: "Enter at least one counted item.", variant: "destructive" });
      return;
    }
    try {
      const newShift = await open.mutateAsync({
        casino_id: casinoId,
        waiter_user_id: userId,
        opening_cash: Math.round(n),
        shift_type: shiftType,
      });
      // Attach opening count to the freshly opened shift.
      await saveCount.mutateAsync({
        shift_id: newShift.id,
        count_type: "open",
        items: Object.entries(counts).map(([item_id, counted_qty]) => ({ item_id, counted_qty })),
      });
      toast({ title: `${shiftType[0].toUpperCase()}${shiftType.slice(1)} shift opened` });
    } catch (e: any) {
      toast({ title: "Failed to open shift", description: e?.message, variant: "destructive" });
    }
  };

  const busy = open.isPending || saveCount.isPending;

  return (
    <div className="max-w-2xl mx-auto mt-12 p-6 rounded-md border border-border bg-card space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Open POS shift</h2>
        <p className="text-sm text-muted-foreground">
          Choose your shift segment, enter the cash in the POS register and count opening stock.
        </p>
      </div>

      <FormGrid>
        <FormField span={12} label="Shift segment" required>
          <Tabs value={shiftType} onValueChange={(v) => setShiftType(v as PosShiftType)}>
            <TabsList className="grid grid-cols-2 w-full">
              {SEGMENTS.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </FormField>

        <FormField span={12} label="Opening cash (TZS)" required>
          <NumberInput
            decimals={0}
            value={Number(cash) || 0}
            onValueChange={(v) => setCash(String(v ?? 0))}
            className="text-lg"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">
            Preview: {formatNumberSpaces(Number(cash) || 0)} TZS
          </p>
        </FormField>
      </FormGrid>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Stock count · opening
          </p>
          <span className="text-[10px] text-muted-foreground">
            Enter actual shelf qty per item. Expected qty is hidden; variance is recorded for the manager report.
          </span>
        </div>
        <StockCountPanel value={counts} onChange={setCounts} />
      </div>

      <Button className="w-full h-12 text-base" onClick={handle} disabled={busy}>
        {busy ? "Opening…" : "Open shift"}
      </Button>
    </div>
  );
};

export default OpenShiftCard;
