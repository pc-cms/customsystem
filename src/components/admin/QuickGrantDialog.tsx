import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { formatNumberSpaces } from "@/lib/currency";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormGrid } from "@/components/ui/form-grid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ExpiryPreset = "lifetime" | "7d" | "30d" | "fixed";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: { id: string; full_name: string; casino_id: string | null; casino_name?: string | null } | null;
}

const fmt = (n: number) => formatNumberSpaces(n ?? 0);

const QuickGrantDialog = ({ open, onOpenChange, player }: Props) => {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<number>(100000);
  const [source, setSource] = useState<"manual_am" | "cashback">("manual_am");
  const [pool, setPool] = useState<"am_budget" | "house">("am_budget");
  const [expiry, setExpiry] = useState<ExpiryPreset>("30d");
  const [fixedDate, setFixedDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(100000);
      setSource("manual_am");
      setPool("am_budget");
      setExpiry("30d");
      setFixedDate("");
      setNotes("");
    }
  }, [open]);

  const issue = useMutation({
    mutationFn: async () => {
      if (!player || !player.casino_id) throw new Error("Player has no casino assigned");
      const lifetime_mode =
        expiry === "lifetime"
          ? "lifetime"
          : expiry === "fixed"
            ? "fixed_business_date"
            : "days_after_redeem";
      const lifetime_days = expiry === "7d" ? 7 : expiry === "30d" ? 30 : null;
      const { error } = await supabase.rpc("am_issue_grant" as any, {
        p_player_id: player.id,
        p_casino_id: player.casino_id,
        p_amount: amount,
        p_source: source,
        p_funding_pool: pool,
        p_lifetime_mode: lifetime_mode,
        p_lifetime_days: lifetime_days,
        p_fixed_date: expiry === "fixed" ? fixedDate || null : null,
        p_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Granted ${fmt(amount)} to ${player?.full_name}`);
      qc.invalidateQueries({ queryKey: ["recent_grants"] });
      qc.invalidateQueries({ queryKey: ["am_budget"] });
      qc.invalidateQueries({ queryKey: ["house_fund"] });
      qc.invalidateQueries({ queryKey: ["player_promo_balance"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick Grant"
      description={player ? `Issue promo credits to ${player.full_name}` : ""}
      size="lg"
    >
      {player && (
        <div className="flex items-center gap-2 mb-4">
          <Badge>{player.full_name}</Badge>
          {player.casino_name && <Badge variant="outline">{player.casino_name}</Badge>}
        </div>
      )}

      <FormGrid>
        <div>
          <Label>Amount</Label>
          <NumberInput
            value={amount}
            onValueChange={(v) => setAmount(v ?? 0)}
          />
        </div>
        <div>
          <Label>Source</Label>
          <Select value={source} onValueChange={(v) => setSource(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual_am">Manual (AM)</SelectItem>
              <SelectItem value="cashback">Cashback</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Funding pool</Label>
          <Select value={pool} onValueChange={(v) => setPool(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="am_budget">AM Budget</SelectItem>
              <SelectItem value="house">House Fund</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Expiry</Label>
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryPreset)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days after redeem</SelectItem>
              <SelectItem value="30d">30 days after redeem</SelectItem>
              <SelectItem value="fixed">Fixed business date…</SelectItem>
              <SelectItem value="lifetime">No expiry</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {expiry === "fixed" && (
          <div className="md:col-span-2">
            <Label>Expires on</Label>
            <Input type="date" value={fixedDate} onChange={(e) => setFixedDate(e.target.value)} />
          </div>
        )}
        <div className="md:col-span-2">
          <Label>Notes (optional)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason / reference" />
        </div>
      </FormGrid>

      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={() => issue.mutate()}
          disabled={
            issue.isPending ||
            !player ||
            !player.casino_id ||
            amount <= 0 ||
            (expiry === "fixed" && !fixedDate)
          }
        >
          {issue.isPending ? "Issuing…" : `Issue ${fmt(amount)}`}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};

export default QuickGrantDialog;
