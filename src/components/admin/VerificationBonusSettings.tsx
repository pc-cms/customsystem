import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageSection } from "@/components/layout/PageShell";
import { FormGrid } from "@/components/ui/form-grid";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  casinoId: string | null | undefined;
}

export default function VerificationBonusSettings({ casinoId }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [pool, setPool] = useState<"house">("house");
  const [days, setDays] = useState(30);

  const { data } = useQuery({
    queryKey: ["casino_verification_bonus", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data } = await supabase
        .from("casinos")
        .select("verification_bonus_amount, verification_bonus_funding_pool, verification_bonus_lifetime_days")
        .eq("id", casinoId)
        .maybeSingle();
      return data;
    },
    enabled: !!casinoId,
  });

  useEffect(() => {
    if (data) {
      setAmount(Number(data.verification_bonus_amount ?? 0));
      setPool((data.verification_bonus_funding_pool as "house") ?? "house");
      setDays(Number(data.verification_bonus_lifetime_days ?? 30));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!casinoId) throw new Error("No casino");
      const { error } = await supabase
        .from("casinos")
        .update({
          verification_bonus_amount: amount,
          verification_bonus_funding_pool: pool,
          verification_bonus_lifetime_days: days,
        })
        .eq("id", casinoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification bonus settings saved");
      qc.invalidateQueries({ queryKey: ["casino_verification_bonus", casinoId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <PageSection title="Verification Bonus (Auto)">
      <p className="text-sm text-muted-foreground mb-3">
        Automatically issued to a player when AM approves their KYC. Set amount to 0 to disable.
      </p>

      <FormGrid>
        <div>
          <Label>Amount (credits)</Label>
          <NumberInput
            min={0}
            value={amount}
            onValueChange={(v) => setAmount(Math.max(0, v ?? 0))}
          />
        </div>
        <div>
          <Label>Funding Pool</Label>
          <Select value={pool} onValueChange={(v: any) => setPool(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="house">House Promo Fund</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Expires in (days, 0 = no expiry)</Label>
          <Input
            type="number"
            min={0}
            value={days}
            onChange={(e) => setDays(Math.max(0, +e.target.value || 0))}
          />
        </div>
      </FormGrid>
      <div className="flex justify-end mt-4">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !casinoId}>
          {save.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </PageSection>
  );
}
