import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateChipEmission, useChipEmissions } from "@/hooks/use-chip-conservation";
import { CHIP_DENOMS, formatChipLabel, formatNumberSpaces } from "@/lib/currency";
import { useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import ChipToken from "@/components/ChipToken";
import { Plus, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

export const ChipEmissionDialog = ({ trigger }: { trigger?: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [denomination, setDenomination] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState("");
  const create = useCreateChipEmission();
  const { data: history = [] } = useChipEmissions();
  const visibleDenoms = useVisibleChipDenoms();

  const handleSubmit = async () => {
    const denom = Number(denomination);
    const qty = Number(quantity);
    if (!denom || !qty || !reason.trim()) return;
    await create.mutateAsync({ denomination: denom, quantity_added: qty, reason });
    setDenomination("");
    setQuantity("");
    setReason("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Chip Emission
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Chip Emission</DialogTitle>
          <DialogDescription>
            Increase initial baseline (e.g., new chip purchase, replacing lost batch).
            This is permanent and audited.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            Chip Emission permanently increases the initial baseline. Use only when physically adding new chips. Miss Chips archive is not affected.
          </div>
        </div>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Denomination</Label>
            <Select value={denomination} onValueChange={setDenomination}>
              <SelectTrigger><SelectValue placeholder="Select denomination" /></SelectTrigger>
              <SelectContent>
                {visibleDenoms.map((d) => (
                  <SelectItem key={d} value={String(d)}>{formatChipLabel(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity to add</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g., 100"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., New shipment from supplier, expansion of floor"
              rows={3}
            />
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-1">Recent emissions</div>
            <ScrollArea className="h-32 rounded border">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {history.slice(0, 20).map((h) => (
                    <tr key={h.id} className="border-b border-border/40">
                      <td className="px-2 py-1">{new Date(h.created_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-2 py-1"><ChipToken denom={h.denomination} /></td>
                      <td className="px-2 py-1 text-right">+{formatNumberSpaces(h.quantity_added)}</td>
                      <td className="px-2 py-1 text-muted-foreground truncate max-w-[180px]">{h.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!denomination || !quantity || !reason.trim() || create.isPending}
          >
            {create.isPending ? "Saving…" : "Confirm Emission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
