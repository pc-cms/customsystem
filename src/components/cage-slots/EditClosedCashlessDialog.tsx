/**
 * Manager-only dialog to backfill per-provider Cashless Balance on an
 * already-closed Slots PC shift. Required when the cashier originally
 * entered only the total (left provider grid empty) — printed Balance
 * column then renders as dashes.
 *
 * Writes:
 *  - cage_slots_shifts.cashless_final_providers (object)
 *  - cage_slots_shifts.cashless_final (sum)
 *
 * Requires manager password via ManagerOverrideDialog.
 */
import { useEffect, useState } from "react";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { FormField, FormGrid } from "@/components/ui/form-grid";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatNumberSpaces } from "@/lib/currency";
import { MOBILE_PROVIDERS } from "@/components/cage/CageHelpers";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  current: Record<string, number>;
}

export const EditClosedCashlessDialog = ({ open, onClose, shiftId, current }: Props) => {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, number>>({});
  const [showManager, setShowManager] = useState(false);

  useEffect(() => {
    if (open) {
      const init: Record<string, number> = {};
      MOBILE_PROVIDERS.forEach(p => { init[p] = Number(current?.[p] || 0); });
      setValues(init);
    }
  }, [open, current]);

  const total = MOBILE_PROVIDERS.reduce((s, p) => s + Number(values[p] || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("cage_slots_shifts")
        .update({
          cashless_final_providers: values,
          cashless_final: total,
        } as any)
        .eq("id", shiftId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Cashless balance updated" });
      qc.invalidateQueries({ queryKey: ["cage-slots-history"] });
      qc.invalidateQueries({ queryKey: ["slots-closing-totals"] });
      qc.invalidateQueries({ queryKey: ["slots-shift-report"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e?.message, variant: "destructive" }),
  });

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()} title="Edit Cashless Balance" size="form">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Backfill per-provider closing balance on this closed shift. The sum is written to <code>cashless_final</code>; manager password is required.
          </p>
          <FormGrid>
            {MOBILE_PROVIDERS.map(p => (
              <FormField key={p} span={6} label={p}>
                <NumberInput
                  value={values[p] || 0}
                  onChange={(v) => setValues(prev => ({ ...prev, [p]: Number(v) || 0 }))}
                />
              </FormField>
            ))}
          </FormGrid>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold">{formatNumberSpaces(total)} TZS</span>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => setShowManager(true)} disabled={save.isPending} className="gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Save · Manager Password
            </Button>
          </ResponsiveDialogFooter>
        </div>
      </ResponsiveDialog>

      <ManagerOverrideDialog
        open={showManager}
        onClose={() => setShowManager(false)}
        onConfirm={() => { setShowManager(false); save.mutate(); }}
        title="Manager Confirmation"
        description="Confirm cashless balance backfill on closed shift."
        actionType="CAGE_SLOTS_EDIT_CASHLESS"
        actionDetails={{ shift_id: shiftId, providers: values, total }}
      />
    </>
  );
};

export default EditClosedCashlessDialog;
