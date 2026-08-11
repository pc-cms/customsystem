import { useState } from "react";
import { Ticket, Plus, Copy } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { formatNumberSpaces } from "@/lib/currency";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format-date";

const PromoCodesPage = () => {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    campaign_id: "",
    code_kind: "batch" as "batch" | "single",
    count: 10,
    amount: 100000,
    batch_label: "",
    per_player_limit: 1,
    grant_lifetime_mode: "lifetime",
    grant_lifetime_days: 7,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["premier_promo_campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("premier_promo_campaigns")
        .select("id, name, active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["promo_codes_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("id, code, campaign_id, amount, code_kind, batch_id, batch_label, assigned_player_id, current_uses, max_uses_total, redeemed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("promo-generate-codes", {
        body: {
          campaign_id: form.campaign_id,
          amount: form.amount,
          code_kind: form.code_kind,
          count: form.code_kind === "single" ? 1 : form.count,
          batch_label: form.batch_label || null,
          per_player_limit: form.per_player_limit,
          grant_lifetime_mode: form.grant_lifetime_mode,
          grant_lifetime_days: form.grant_lifetime_mode === "days_after_redeem" ? form.grant_lifetime_days : null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Generated ${data?.count ?? 0} code(s)`);
      qc.invalidateQueries({ queryKey: ["promo_codes_admin"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const copyAll = (batchId: string | null) => {
    const list = codes.filter((c) => c.batch_id === batchId).map((c) => c.code).join("\n");
    navigator.clipboard.writeText(list);
    toast.success("Codes copied to clipboard");
  };

  return (
    <PageShell>
      <PageHeader icon={Ticket} title="Promo Codes" subtitle="Generate, track and report promo codes by campaign">
        <Button onClick={() => setDialogOpen(true)} disabled={campaigns.length === 0}>
          <Plus className="size-4" /> Generate Codes
        </Button>
      </PageHeader>

      <PageSection title="All Codes" bodyClassName="p-0">
        <DataTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Campaign</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-left p-2">Kind</th>
                <th className="text-left p-2">Batch</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Created</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && codes.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No codes yet</td></tr>}
              {codes.map((c) => {
                const camp = campaigns.find((x) => x.id === c.campaign_id);
                const used = (c.current_uses ?? 0) > 0 || c.redeemed_at;
                return (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-2 font-mono font-semibold">{c.code}</td>
                    <td className="p-2">{camp?.name ?? "—"}</td>
                    <td className="p-2 text-right font-mono">{formatNumberSpaces(c.amount ?? 0)}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">{c.code_kind}</Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {c.batch_label ?? (c.batch_id ? c.batch_id.slice(0, 8) : "—")}
                    </td>
                    <td className="p-2">
                      {used
                        ? <Badge variant="secondary" className="text-xs">Used</Badge>
                        : <Badge className="text-xs">Active</Badge>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{fmtDateTime(c.created_at)}</td>
                    <td className="p-2 text-right">
                      {c.batch_id && (
                        <Button size="sm" variant="ghost" onClick={() => copyAll(c.batch_id)} title="Copy whole batch">
                          <Copy className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      </PageSection>

      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Generate Promo Codes" size="lg">
        <FormGrid>
          <div>
            <Label>Campaign</Label>
            <Select value={form.campaign_id} onValueChange={(v) => setForm({ ...form, campaign_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={form.code_kind} onValueChange={(v: any) => setForm({ ...form, code_kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single (1 code)</SelectItem>
                <SelectItem value="batch">Batch (multiple)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.code_kind === "batch" && (
            <div>
              <Label>Count</Label>
              <NumberInput min={1} max={1000} value={form.count}
                onValueChange={(v) => setForm({ ...form, count: Math.max(1, Math.min(1000, v ?? 1)) })} />
            </div>
          )}
          <div>
            <Label>Amount (credits per code)</Label>
            <NumberInput min={1} value={form.amount}
              onValueChange={(v) => setForm({ ...form, amount: Math.max(0, v ?? 0) })} />
          </div>
          <div>
            <Label>Batch Label (optional)</Label>
            <Input value={form.batch_label}
              onChange={(e) => setForm({ ...form, batch_label: e.target.value })}
              placeholder="e.g. Instagram Post Mar 2026" />
          </div>
          <div>
            <Label>Per-Player Limit</Label>
            <NumberInput min={1} value={form.per_player_limit}
              onValueChange={(v) => setForm({ ...form, per_player_limit: Math.max(1, v ?? 1) })} />
          </div>
          <div>
            <Label>Grant Lifetime</Label>
            <Select value={form.grant_lifetime_mode} onValueChange={(v) => setForm({ ...form, grant_lifetime_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lifetime">Lifetime (no expiry)</SelectItem>
                <SelectItem value="days_after_redeem">Days after redeem</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.grant_lifetime_mode === "days_after_redeem" && (
            <div>
              <Label>Days</Label>
              <Input type="number" min={1} value={form.grant_lifetime_days}
                onChange={(e) => setForm({ ...form, grant_lifetime_days: Math.max(1, +e.target.value || 7) })} />
            </div>
          )}
        </FormGrid>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => generate.mutate()}
            disabled={!form.campaign_id || generate.isPending}
          >
            {generate.isPending ? "Generating…" : "Generate"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>
    </PageShell>
  );
};

export default PromoCodesPage;
