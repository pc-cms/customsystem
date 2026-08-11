/**
 * Company → Daily Balance: manual entry of the month's opening money
 * (Cage Casino / Cage Office / Bank). Stored in `fin_report_start`
 * (scope = "company") and used as the Start row of the report.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { OfficeStart } from "@/hooks/use-office-balance-report";
import { formatNumberSpaces } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  start?: OfficeStart;
}

const numOf = (v: string) => {
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const StartBalanceDialog = ({ open, onOpenChange, start }: Props) => {
  const qc = useQueryClient();
  const [cageCasino, setCageCasino] = useState("0");
  const [cageOffice, setCageOffice] = useState("0");
  const [bank, setBank] = useState("0");

  useEffect(() => {
    if (!open) return;
    setCageCasino(String(start?.cage_casino ?? 0));
    setCageOffice(String(start?.cage_office ?? 0));
    setBank(String(start?.bank ?? 0));
  }, [open, start]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("fin_report_start" as any)
        .upsert(
          {
            scope: "company",
            cage_casino: numOf(cageCasino),
            cage_office: numOf(cageOffice),
            bank: numOf(bank),
          } as any,
          { onConflict: "scope" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office-balance-report"] });
      toast.success("Starting balance saved");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save starting balance"),
  });

  const total = numOf(cageCasino) + numOf(cageOffice) + numOf(bank);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Starting balance</DialogTitle>
          <DialogDescription>
            Opening money of the report. Every following day carries over from here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sb-cage">Cage Casino</Label>
            <Input id="sb-cage" inputMode="decimal" value={cageCasino} onChange={(e) => setCageCasino(e.target.value)} className="font-mono tabular-nums" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-office">Cage Office</Label>
            <Input id="sb-office" inputMode="decimal" value={cageOffice} onChange={(e) => setCageOffice(e.target.value)} className="font-mono tabular-nums" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-bank">Bank</Label>
            <Input id="sb-bank" inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} className="font-mono tabular-nums" />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono font-bold tabular-nums">{formatNumberSpaces(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StartBalanceDialog;
