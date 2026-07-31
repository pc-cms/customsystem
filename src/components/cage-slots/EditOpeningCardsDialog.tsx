import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Pencil, Save, ShieldAlert, CreditCard } from "lucide-react";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  shift: Tables<"cage_slots_shifts">;
  currentValue: number;
  cardDepositValue?: number;
  /** Prefilled new value (e.g. from quick +1 / −1 buttons). Defaults to currentValue. */
  initialValue?: number;
  open: boolean;
  onClose: () => void;
}

/**
 * EditOpeningCardsDialog — manager-only edit of opening card count on an
 * already-open slots cage shift. Records before/after to activity_logs.
 * Analog of EditOpeningChipsDialog for Live Game cage chips.
 */
const EditOpeningCardsDialog = ({ shift, currentValue, cardDepositValue, initialValue, open, onClose }: Props) => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();

  const seed = initialValue ?? currentValue;

  const [showOverride, setShowOverride] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [newCount, setNewCount] = useState<number>(seed);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setShowOverride(true);
      setUnlocked(false);
      setManagerId(null);
      setNewCount(seed);
      setReason("");
      onClose();
    }
  };

  const handleConfirmOverride = (mgrId: string) => {
    setManagerId(mgrId);
    setUnlocked(true);
    setShowOverride(false);
    setNewCount(seed);
  };

  const delta = newCount - currentValue;

  const handleSave = async () => {
    if (!casinoId || !managerId) return;
    if (newCount === currentValue) { toast.info("No changes"); return; }
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }
    setSaving(true);
    try {
      // Upsert — if no card row exists for this shift (rare, but possible if
      // the row was never created at shift open), insert it; otherwise update.
      const depositValue = Number(cardDepositValue || 5000);
      const { data: upserted, error } = await supabase
        .from("cage_slots_cards")
        .upsert(
          {
            cage_slots_shift_id: shift.id,
            casino_id: (shift as any).casino_id,
            opening_card_count: newCount,
            card_deposit_value_tzs: depositValue,
          } as any,
          { onConflict: "cage_slots_shift_id" }
        )
        .select("opening_card_count");
      if (error) throw error;
      if (!upserted || upserted.length === 0) {
        throw new Error("Upsert returned no rows — check RLS / permissions");
      }

      await logAction(casinoId, "edit", "SLOTS_OPENING_CARDS_EDITED", {
        shift_id: shift.id,
        manager_id: managerId,
        reason: reason.trim(),
        old: currentValue,
        new: newCount,
        delta,
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cage-slots-cards", shift.id], refetchType: "active" }),
        qc.invalidateQueries({ queryKey: ["cage-slots-active-shift"], refetchType: "active" }),
        qc.invalidateQueries({ queryKey: ["cage-slots-shift", shift.id], refetchType: "active" }),
      ]);
      toast.success(`Opening cards updated to ${upserted[0].opening_card_count}`);
      handleOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (showOverride) {
    return (
      <ManagerOverrideDialog
        open={open && showOverride}
        onClose={() => handleOpenChange(false)}
        onConfirm={handleConfirmOverride}
        title="Edit Opening Cards"
        description="Manager authentication required to edit slots shift opening card count. All changes are recorded in the audit log."
        actionType="SLOTS_OPENING_CARDS_EDIT_REQUESTED"
        actionDetails={{ shift_id: shift.id }}
      />
    );
  }

  return (
    <Dialog open={open && unlocked} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit Opening Cards
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 flex gap-2 text-xs">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Card-counter only — not money. Every change is logged with manager identity and reason.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border border-border p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Old</p>
            <p className="font-mono font-bold">{currentValue}</p>
          </div>
          <div className="rounded border border-border p-2">
            <p className="text-[9px] uppercase text-muted-foreground">New</p>
            <p className="font-mono font-bold">{newCount}</p>
          </div>
          <div className="rounded border border-border p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Δ</p>
            <p className={`font-mono font-bold ${delta > 0 ? "cms-amount-positive" : delta < 0 ? "cms-amount-negative" : ""}`}>
              {delta > 0 ? "+" : ""}{delta}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Opening Cards Count</p>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            <NumberInput
              value={newCount || ""}
              onChange={v => setNewCount(Number(v) || 0)}
              className="no-spin h-9 w-32 text-right font-mono"
              placeholder="0"
            />
            <span className="text-xs text-muted-foreground">cards</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reason (required)</p>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explain why opening cards need to be corrected…"
            rows={2}
            className={`text-sm ${!reason.trim() ? "border-destructive/60 focus-visible:ring-destructive/40" : ""}`}
          />
          {!reason.trim() && (
            <p className="text-[10px] font-medium text-destructive flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Reason must be filled to save
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || newCount === currentValue || !reason.trim()} className="gap-1.5">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save & Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditOpeningCardsDialog;
