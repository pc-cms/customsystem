import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { toast } from "@/hooks/use-toast";
import { formatNumberSpaces } from "@/lib/currency";
import {
  useClosePosTab,
  useCreateCompBudgetOverride,
  isCompBudgetExceeded,
  type PaymentSplit,
  type PosTab,
} from "@/hooks/use-pos-tabs";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tab: PosTab | null;
  onClosed?: () => void;
}

export const CloseBillDialog = ({ open, onOpenChange, tab, onClosed }: Props) => {
  const closeMut = useClosePosTab();
  const createOverride = useCreateCompBudgetOverride();
  const [cash, setCash] = useState("0");
  const [card, setCard] = useState("0");
  const [compPlayer, setCompPlayer] = useState("0");
  const [compHouse, setCompHouse] = useState("0");
  const [playerCharge, setPlayerCharge] = useState("0");

  // Comp-budget override flow state
  const [overridePromptOpen, setOverridePromptOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [mgrDialogOpen, setMgrDialogOpen] = useState(false);
  const [overrideErrorMsg, setOverrideErrorMsg] = useState("");

  const total = tab?.total_tzs ?? 0;
  const hasPlayer = !!tab?.player_id;

  useEffect(() => {
    if (open && tab) {
      setCash(String(total));
      setCard("0");
      setCompPlayer("0");
      setCompHouse("0");
      setPlayerCharge("0");
      setOverridePromptOpen(false);
      setMgrDialogOpen(false);
      setOverrideReason("");
      setOverrideErrorMsg("");
    }
  }, [open, tab, total]);

  const sum = useMemo(() => {
    return (Number(cash) || 0) + (Number(card) || 0)
      + (Number(compPlayer) || 0) + (Number(compHouse) || 0)
      + (Number(playerCharge) || 0);
  }, [cash, card, compPlayer, compHouse, playerCharge]);

  const delta = sum - total;
  const valid = delta === 0 && total > 0;

  const buildSplit = (): PaymentSplit => ({
    cash: Math.round(Number(cash) || 0),
    card: Math.round(Number(card) || 0),
    comp_player: Math.round(Number(compPlayer) || 0),
    comp_house: Math.round(Number(compHouse) || 0),
    player_charge: Math.round(Number(playerCharge) || 0),
  });

  const monthStart = (): string => {
    // Local Africa/Dar_es_Salaam first-of-month YYYY-MM-01
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Dar_es_Salaam",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    return `${fmt}-01`;
  };

  const handle = async () => {
    if (!tab) return;
    if (!valid) {
      toast({ title: "Split must sum to total", variant: "destructive" });
      return;
    }
    const split = buildSplit();
    if ((split.comp_player ?? 0) > 0 && !hasPlayer) {
      toast({ title: "Comp player not available for walk-in tabs", variant: "destructive" });
      return;
    }
    if ((split.player_charge ?? 0) > 0 && !hasPlayer) {
      toast({ title: "Charge to tab requires a player tab", variant: "destructive" });
      return;
    }
    try {
      await closeMut.mutateAsync({ tab_id: tab.id, total_tzs: total, payment_split: split });
      toast({ title: "Bill closed" });
      onOpenChange(false);
      onClosed?.();
    } catch (e: any) {
      if (isCompBudgetExceeded(e)) {
        setOverrideErrorMsg(e?.message || "Monthly house-comp budget would be exceeded");
        setOverridePromptOpen(true);
        return;
      }
      const msg = String(e?.message ?? "");
      if (msg.includes("PLAYER_CHARGE_REQUIRES_PLAYER")) {
        toast({ title: "Player Charge needs a linked player",
          description: "Charge to player tab can only be used for tabs opened against a registered player.",
          variant: "destructive" });
        return;
      }
      if (msg.includes("COMP_PLAYER_REQUIRES_PLAYER")) {
        toast({ title: "Comp · player needs a linked player",
          description: "Comp · player can only be used for tabs opened against a registered player.",
          variant: "destructive" });
        return;
      }
      toast({ title: "Failed to close", description: e?.message, variant: "destructive" });
    }
  };

  const handleManagerConfirmed = async (managerId: string) => {
    setMgrDialogOpen(false);
    if (!tab) return;
    const split = buildSplit();
    try {
      const overrideId = await createOverride.mutateAsync({
        casino_id: tab.casino_id,
        tab_id: tab.id,
        month_start: monthStart(),
        amount_tzs: split.comp_house ?? 0,
        manager_user_id: managerId,
        reason: overrideReason.trim(),
      });
      await closeMut.mutateAsync({
        tab_id: tab.id,
        total_tzs: total,
        payment_split: split,
        comp_override_id: overrideId,
      });
      toast({ title: "Bill closed with manager override" });
      setOverridePromptOpen(false);
      onOpenChange(false);
      onClosed?.();
    } catch (e: any) {
      toast({ title: "Override failed", description: e?.message, variant: "destructive" });
    }
  };


  const fillCharge = () => {
    if (!hasPlayer) return;
    setCash("0"); setCard("0"); setCompPlayer("0"); setCompHouse("0");
    setPlayerCharge(String(total));
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Close bill" size="lg">
      <div className="space-y-4">
        <div className="rounded-md bg-muted/40 px-4 py-3 flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-2xl font-bold font-mono tabular-nums">
            {formatNumberSpaces(total)} <span className="text-sm">TZS</span>
          </span>
        </div>

        <FormGrid>
          <FormField span={6} label="Cash">
            <Input type="number" inputMode="numeric" value={cash}
              onChange={(e) => setCash(e.target.value)} className="text-lg" />
          </FormField>
          <FormField span={6} label="Card">
            <Input type="number" inputMode="numeric" value={card}
              onChange={(e) => setCard(e.target.value)} className="text-lg" />
          </FormField>
          <FormField span={6} label="Comp · player"
            hint={!hasPlayer ? "Only available for player tabs" : undefined}>
            <Input type="number" inputMode="numeric" value={compPlayer}
              onChange={(e) => setCompPlayer(e.target.value)}
              disabled={!hasPlayer} className="text-lg" />
          </FormField>
          <FormField span={6} label="Comp · house">
            <Input type="number" inputMode="numeric" value={compHouse}
              onChange={(e) => setCompHouse(e.target.value)} className="text-lg" />
          </FormField>
          <FormField
            span={12}
            label="Charge to player tab"
            hint={!hasPlayer ? "Walk-in tabs cannot be charged" : "Postpaid — settled later in Cage"}
          >
            <div className="flex gap-2">
              <Input type="number" inputMode="numeric" value={playerCharge}
                onChange={(e) => setPlayerCharge(e.target.value)}
                disabled={!hasPlayer} className="text-lg" />
              <Button type="button" variant="outline" disabled={!hasPlayer} onClick={fillCharge}>
                Full
              </Button>
            </div>
          </FormField>
        </FormGrid>

        <div className={`rounded-md px-4 py-2 flex items-center justify-between text-sm ${
          delta === 0
            ? "bg-cms-amount-positive/10 text-cms-amount-positive"
            : "bg-cms-amount-negative/10 text-cms-amount-negative"
        }`}>
          <span>Sum {formatNumberSpaces(sum)}</span>
          <span>
            {delta === 0 ? "Balanced" : `Δ ${delta > 0 ? "+" : ""}${formatNumberSpaces(delta)}`}
          </span>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handle} disabled={!valid || closeMut.isPending}>
            {closeMut.isPending ? "Closing…" : "Confirm & close"}
          </Button>
        </ResponsiveDialogFooter>
      </div>

      <ResponsiveDialog
        open={overridePromptOpen}
        onOpenChange={setOverridePromptOpen}
        title="Comp budget exceeded"
        description="Closing this bill would exceed the monthly house-comp budget. A manager must approve and a reason is required."
        size="md"
      >
        <div className="space-y-3">
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive font-mono whitespace-pre-wrap break-words">
            {overrideErrorMsg}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb_reason">Reason (required, min 3 chars)</Label>
            <Input
              id="cb_reason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="VIP retention, owner approval, etc."
            />
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setOverridePromptOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={overrideReason.trim().length < 3}
              onClick={() => setMgrDialogOpen(true)}
            >
              Request manager override
            </Button>
          </ResponsiveDialogFooter>
        </div>
      </ResponsiveDialog>

      <ManagerOverrideDialog
        open={mgrDialogOpen}
        onClose={() => setMgrDialogOpen(false)}
        onConfirm={handleManagerConfirmed}
        title="Approve comp budget override"
        description={`House-comp ${formatNumberSpaces(Math.round(Number(compHouse) || 0))} TZS over monthly limit.`}
        actionType="POS_COMP_BUDGET_OVERRIDE"
        actionDetails={{
          tab_id: tab?.id,
          amount_tzs: Math.round(Number(compHouse) || 0),
          reason: overrideReason,
        }}
      />
    </ResponsiveDialog>
  );
};


export default CloseBillDialog;
