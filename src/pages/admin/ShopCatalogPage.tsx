import { useState } from "react";
import { Store, Plus, Edit2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCasino } from "@/lib/casino-context";

const fmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

const empty = {
  id: null as string | null,
  name: "",
  description: "",
  sku: "",
  price_credits: 0,
  stock_qty: 0,
  photo_url: "",
  is_active: true,
};

const ShopCatalogPage = () => {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState(empty);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["shop_items", activeCasinoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        casino_id: activeCasinoId,
        name: form.name,
        description: form.description || null,
        sku: form.sku || null,
        price_credits: form.price_credits,
        stock_qty: form.stock_qty,
        photo_url: form.photo_url || null,
        is_active: form.is_active,
      };
      if (form.id) {
        const { error } = await supabase.from("shop_items").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shop_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Item updated" : "Item created");
      qc.invalidateQueries({ queryKey: ["shop_items"] });
      setDlg(false);
      setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (it: any) => {
    setForm({
      id: it.id,
      name: it.name,
      description: it.description ?? "",
      sku: it.sku ?? "",
      price_credits: it.price_credits,
      stock_qty: it.stock_qty,
      photo_url: it.photo_url ?? "",
      is_active: it.is_active,
    });
    setDlg(true);
  };

  return (
    <PageShell>
      <PageHeader icon={Store} title="Shop Catalog" subtitle="Manage rewards catalog and stock">
        <Button onClick={() => { setForm(empty); setDlg(true); }}>
          <Plus className="size-4" /> New Item
        </Button>
      </PageHeader>

      <PageSection title="Items" bodyClassName="p-0">
        <DataTable>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase">
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Stock</th>
              <th className="text-left p-2">Status</th>
              <th className="text-right p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No items</td></tr>}
            {items.map((it) => (
              <tr key={it.id} className="border-b border-border/50 hover:bg-muted/20">
                <td className="p-2 font-medium">{it.name}</td>
                <td className="p-2 text-xs text-muted-foreground">{it.sku ?? "—"}</td>
                <td className="p-2 text-right font-mono">{fmt(it.price_credits)}</td>
                <td className="p-2 text-right font-mono">{fmt(it.stock_qty)}</td>
                <td className="p-2">
                  {it.is_active
                    ? <Badge className="text-xs">Active</Badge>
                    : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(it)}>
                    <Edit2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </PageSection>

      <ResponsiveDialog open={dlg} onOpenChange={setDlg} title={form.id ? "Edit Item" : "New Shop Item"} size="lg">
        <FormGrid>
          <div className="col-span-full">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label>Price (credits) *</Label>
            <Input type="number" min={1} value={form.price_credits}
              onChange={(e) => setForm({ ...form, price_credits: +e.target.value || 0 })} />
          </div>
          <div>
            <Label>Stock Qty</Label>
            <Input type="number" min={0} value={form.stock_qty}
              onChange={(e) => setForm({ ...form, stock_qty: +e.target.value || 0 })} />
          </div>
          <div>
            <Label>Photo URL</Label>
            <Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
          </div>
          <div className="col-span-full">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>Active</Label>
          </div>
        </FormGrid>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setDlg(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || !form.price_credits || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>
    </PageShell>
  );
};

export default ShopCatalogPage;
