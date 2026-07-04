import { useState } from "react";
import { Ticket, Plus, Lock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format-date";
import { useCasino } from "@/lib/casino-context";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

const LotteriesPage = () => {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    draw_business_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    ticket_price_credits: 10000,
    max_tickets_per_player: 1,
    total_tickets_cap: 0,
    prize_fund_description: "",
  });

  const { data: lotteries = [], isLoading } = useQuery({
    queryKey: ["lotteries", activeCasinoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotteries")
        .select("*, lottery_tickets(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lotteries").insert({
        casino_id: activeCasinoId,
        name: form.name,
        description: form.description || null,
        draw_business_date: form.draw_business_date,
        ticket_price_credits: form.ticket_price_credits,
        max_tickets_per_player: form.max_tickets_per_player || null,
        total_tickets_cap: form.total_tickets_cap || null,
        prize_fund_description: form.prize_fund_description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lottery created");
      qc.invalidateQueries({ queryKey: ["lotteries"] });
      setDlg(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: async (id: string) => {
      const user = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("lotteries")
        .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: user })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lottery closed");
      qc.invalidateQueries({ queryKey: ["lotteries"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageShell>
      <PageHeader icon={Ticket} title="Lotteries" subtitle="Create and manage lottery draws — draw is performed offline">
        <Button onClick={() => setDlg(true)}>
          <Plus className="size-4" /> New Lottery
        </Button>
      </PageHeader>

      <PageSection title="All Lotteries" bodyClassName="p-0">
        <DataTable>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase">
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Draw Date</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Max/Player</th>
              <th className="text-right p-2">Tickets Sold</th>
              <th className="text-left p-2">Status</th>
              <th className="text-right p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && lotteries.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No lotteries</td></tr>}
            {lotteries.map((l: any) => (
              <tr key={l.id} className="border-b border-border/50 hover:bg-muted/20">
                <td className="p-2 font-medium">{l.name}</td>
                <td className="p-2">{fmtDate(l.draw_business_date)}</td>
                <td className="p-2 text-right font-mono">{fmt(l.ticket_price_credits)}</td>
                <td className="p-2 text-right font-mono">{l.max_tickets_per_player ?? "∞"}</td>
                <td className="p-2 text-right font-mono">{l.lottery_tickets?.[0]?.count ?? 0}</td>
                <td className="p-2">
                  <Badge variant={l.status === "open" ? "default" : "secondary"} className="text-xs">{l.status}</Badge>
                </td>
                <td className="p-2 text-right">
                  {l.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => close.mutate(l.id)} disabled={close.isPending}>
                      <Lock className="size-3.5" /> Close
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </PageSection>

      <ResponsiveDialog open={dlg} onOpenChange={setDlg} title="New Lottery" size="lg">
        <FormGrid>
          <div className="col-span-full">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Draw Business Date *</Label>
            <Input type="date" value={form.draw_business_date}
              onChange={(e) => setForm({ ...form, draw_business_date: e.target.value })} />
          </div>
          <div>
            <Label>Ticket Price (credits) *</Label>
            <Input type="number" min={1} value={form.ticket_price_credits}
              onChange={(e) => setForm({ ...form, ticket_price_credits: +e.target.value || 0 })} />
          </div>
          <div>
            <Label>Max Tickets per Player (0 = unlimited)</Label>
            <Input type="number" min={0} value={form.max_tickets_per_player}
              onChange={(e) => setForm({ ...form, max_tickets_per_player: +e.target.value || 0 })} />
          </div>
          <div>
            <Label>Total Cap (0 = unlimited)</Label>
            <Input type="number" min={0} value={form.total_tickets_cap}
              onChange={(e) => setForm({ ...form, total_tickets_cap: +e.target.value || 0 })} />
          </div>
          <div className="col-span-full">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="col-span-full">
            <Label>Prize Fund Description</Label>
            <Textarea value={form.prize_fund_description}
              onChange={(e) => setForm({ ...form, prize_fund_description: e.target.value })} rows={2} />
          </div>
        </FormGrid>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setDlg(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.name || !form.ticket_price_credits || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>
    </PageShell>
  );
};

export default LotteriesPage;
