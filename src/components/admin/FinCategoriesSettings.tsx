import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { useFinCategories, useUpsertFinCategory } from "@/hooks/use-fin";

const GROUPS = [
  ["fixed", "Fixed Costs & Government Licences"],
  ["tax", "Monthly Variable Government Taxes"],
  ["variable", "Other Variable Expenses"],
  ["salary", "Salary Expenses"],
  ["petrol", "Petrol Expenses"],
  ["additional", "Additional Expenses"],
  ["income", "Income / Collection / CAPEX / Transfers"],
  ["collections", "Collections"],
];

export const FinCategoriesSettings = () => {
  const { data: cats = [] } = useFinCategories();
  const upsert = useUpsertFinCategory();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", group_code: "fixed", group_name: "Fixed Costs & Government Licences", sort_order: 0, is_income: false, is_active: true });

  const byGroup = GROUPS.map(([code, name]) => ({ code, name, items: cats.filter((c: any) => c.group_code === code) }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setForm({ name: "", group_code: "fixed", group_name: "Fixed Costs & Government Licences", sort_order: 0, is_income: false, is_active: true }); setOpen(true); }}>
          <Plus className="w-4 h-4" /> New Category
        </Button>
      </div>
      {byGroup.map((g) => (
        <div key={g.code} className="rounded-md border border-border">
          <div className="bg-muted px-3 py-2 text-xs uppercase font-semibold">{g.name}</div>
          <table className="w-full text-sm">
            <tbody>
              {g.items.map((c: any) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-1.5">{c.name}</td>
                  <td className="text-right pr-3">
                    <Button variant="ghost" size="sm" onClick={() => { setForm(c); setOpen(true); }}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={form.id ? "Edit category" : "New category"}>
        <FormGrid>
          <FormField span={6} label="Group">
            <Select value={form.group_code} onValueChange={(v) => {
              const g = GROUPS.find(([c]) => c === v)!;
              setForm({ ...form, group_code: v, group_name: g[1] });
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GROUPS.map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField span={4} label="Sort"><Input type="number" value={form.sort_order || 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></FormField>
          <FormField span={4} label="Is income"><input type="checkbox" checked={!!form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} /></FormField>
          <FormField span={4} label="Active"><input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /></FormField>
        </FormGrid>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={async () => { await upsert.mutateAsync(form); setOpen(false); }}>Save</Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
};
