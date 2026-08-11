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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type ExpiryPreset = "lifetime" | "7d" | "30d" | "fixed";

export interface BulkGrantTarget {
  id: string;
  full_name: string;
  casino_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: BulkGrantTarget[];
  onDone?: () => void;
}

const fmt = (n: number) => formatNumberSpaces(n ?? 0);

const BulkGrantDialog = ({ open, onOpenChange, players, onDone }: Props) => {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<number>(100000);
  const [source, setSource] = useState<"manual_am" | "cashback">("manual_am");
  const [pool, setPool] = useState<"am_budget" | "house">("am_budget");
  const [expiry, setExpiry] = useState<ExpiryPreset>("30d");
  const [fixedDate, setFixedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<{ done: number; ok: number; fail: number } | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(100000);
      setSource("manual_am");
      setPool("am_budget");
      setExpiry("30d");
      setFixedDate("");
      setNotes("");
      setProgress(null);
    }
  }, [open]);

  const eligible = players.filter((p) => !!p.casino_id);
  const skipped = players.length - eligible.length;

  const issue = useMutation({
    mutationFn: async () => {
      const lifetime_mode =
        expiry === "lifetime"
          ? "lifetime"
          : expiry === "fixed"
            ? "fixed_business_date"
            : "days_after_redeem";
      const lifetime_days = expiry === "7d" ? 7 : expiry === "30d" ? 30 : null;
      let ok = 0;
      let fail = 0;
      setProgress({ done: 0, ok: 0, fail: 0 });
      for (let i = 0; i < eligible.length; i++) {
        const p = eligible[i];
        try {
          const { error } = await supabase.rpc("am_issue_grant" as any, {
            p_player_id: p.id,
            p_casino_id: p.casino_id,
            p_amount: amount,
            p_source: source,
            p_funding_pool: pool,
            p_lifetime_mode: lifetime_mode,
            p_lifetime_days: lifetime_days,
            p_fixed_date: expiry === "fixed" ? fixedDate || null : null,
            p_notes: notes || null,
          });
          if (error) { fail++; } else { ok++; }
        } catch { fail++; }
        setProgress({ done: i + 1, ok, fail });
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      if (fail === 0) toast.success(`Granted ${fmt(amount)} to ${ok} player${ok === 1 ? "" : "s"}`);
      else toast.warning(`${ok} granted · ${fail} failed`);
      qc.invalidateQueries({ queryKey: ["recent_grants"] });
      qc.invalidateQueries({ queryKey: ["am_budget"] });
      qc.invalidateQueries({ queryKey: ["house_fund"] });
      qc.invalidateQueries({ queryKey: ["player_promo_balance"] });
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => { if (!issue.isPending) onOpenChange(o); }}
      title="Bulk Grant"
      description={`Issue the same promo to ${eligible.length} selected player${eligible.length === 1 ? "" : "s"}`}
      size="lg"
    >
      <div className="flex flex-wrap gap-1.5 mb-4 max-h-32 overflow-y-auto">
        {eligible.map((p) => (
          <Badge key={p.id} variant="secondary" className="text-xs">{p.full_name}</Badge>
        ))}
        {skipped > 0 && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {skipped} skipped (no casino)
          </Badge>
        )}
      </div>

      <FormGrid>
        <div>
          <Label>Amount</Label>
          <NumberInput value={amount}
            onValueChange={(v) => setAmount(v ?? 0)} />
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

      {progress && (
        <div className="mt-4 space-y-1">
          <Progress value={(progress.done / Math.max(1, eligible.length)) * 100} />
          <div className="text-xs text-muted-foreground flex justify-between">
            <span>{progress.done} / {eligible.length}</span>
            <span>{progress.ok} ok · {progress.fail} failed</span>
          </div>
        </div>
      )}

      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={issue.isPending}>Cancel</Button>
        <Button
          onClick={() => issue.mutate()}
          disabled={
            issue.isPending ||
            eligible.length === 0 ||
            amount <= 0 ||
            (expiry === "fixed" && !fixedDate)
          }
        >
          {issue.isPending
            ? `Issuing… ${progress?.done ?? 0}/${eligible.length}`
            : `Issue ${fmt(amount)} × ${eligible.length}`}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};

export default BulkGrantDialog;
