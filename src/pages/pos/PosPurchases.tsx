/**
 * /pos/purchases — Bar purchases ledger + create dialog.
 * Creates a pos_purchases header + items via pos_create_purchase RPC.
 * Auto-emits a pending-approval expense at the slots cage.
 */
import { useMemo, useState } from "react";
import { Plus, ShoppingCart, X, ChevronDown, ChevronRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCasino } from "@/lib/casino-context";
import { usePosMenuItems } from "@/hooks/use-pos-menu";
import {
  usePosPurchases,
  usePosPurchaseItems,
  useCreatePosPurchase,
  type PosPurchaseRow,
} from "@/hooks/use-pos-purchases";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { toast } from "@/hooks/use-toast";

type Draft = { item_id: string; qty: string; unit_cost_tzs: string };

export default function PosPurchases() {
  const { activeCasinoId } = useCasino();
  const { data: rows = [], isLoading } = usePosPurchases(activeCasinoId);
  const { data: menuItems = [] } = usePosMenuItems(activeCasinoId);
  const createMut = useCreatePosPurchase();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"bulk" | "single">("single");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([{ item_id: "", qty: "", unit_cost_tzs: "" }]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setType("single");
    setSupplier("");
    setNotes("");
    setDrafts([{ item_id: "", qty: "", unit_cost_tzs: "" }]);
  };

  const total = useMemo(
    () =>
      drafts.reduce((s, d) => {
        const q = Number(d.qty) || 0;
        const c = Number(d.unit_cost_tzs) || 0;
        return s + Math.floor(q * c);
      }, 0),
    [drafts],
  );

  const updateDraft = (i: number, patch: Partial<Draft>) => {
    setDrafts((arr) => arr.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  };

  const addLine = () => setDrafts((arr) => [...arr, { item_id: "", qty: "", unit_cost_tzs: "" }]);
  const removeLine = (i: number) =>
    setDrafts((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  const submit = async () => {
    if (!activeCasinoId) return;
    const items = drafts
      .filter((d) => d.item_id && Number(d.qty) > 0 && Number(d.unit_cost_tzs) >= 0)
      .map((d) => ({
        item_id: d.item_id,
        qty: Number(d.qty),
        unit_cost_tzs: Number(d.unit_cost_tzs),
      }));
    if (items.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }
    try {
      await createMut.mutateAsync({
        casino_id: activeCasinoId,
        purchase_type: type,
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
        items,
      });
      toast({
        title: "Purchase recorded",
        description: "Pending approval in slots cage expenses.",
      });
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={ShoppingCart}
        title="Bar purchases"
        subtitle="Single bottles or bulk lists. Generates pending expense at slots cage."
      >
        <Button onClick={() => setOpen(true)} disabled={!activeCasinoId}>
          <Plus className="w-4 h-4 mr-1" />
          New purchase
        </Button>
      </PageHeader>

      <PageSection>
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">
            No purchases yet. Click "New purchase" to record one.
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2 text-right">Total (TZS)</th>
                  <th className="px-3 py-2">Expense</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <PurchaseRow
                    key={r.id}
                    row={r}
                    expanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      <ResponsiveDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
        title="New bar purchase"
        description="Records stock-in, updates moving average cost, creates pending cage expense."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as "bulk" | "single")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single bottle</SelectItem>
                  <SelectItem value="bulk">Bulk list</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Supplier (optional)</label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. ABC Liquors" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice ref, etc." />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Items</div>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-3 h-3 mr-1" />Add line
              </Button>
            </div>
            <div className="space-y-2">
              {drafts.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_120px_32px] gap-2 items-center">
                  <Select value={d.item_id} onValueChange={(v) => updateDraft(i, { item_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select item…" /></SelectTrigger>
                    <SelectContent>
                      {menuItems.filter(m => m.is_active).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <NumberInput
                    decimals={0}
                    placeholder="Qty"
                    value={d.qty === "" ? "" : Number(d.qty)}
                    onValueChange={(v) => updateDraft(i, { qty: v == null ? "" : String(v) })}
                  />
                  <NumberInput
                    decimals={2}
                    placeholder="Unit cost"
                    value={d.unit_cost_tzs === "" ? "" : Number(d.unit_cost_tzs)}
                    onValueChange={(v) => updateDraft(i, { unit_cost_tzs: v == null ? "" : String(v) })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(i)}
                    disabled={drafts.length === 1}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatNumberSpaces(total)} TZS
            </span>
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createMut.isPending || total <= 0}>
            {createMut.isPending ? "Saving…" : "Record purchase"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>
    </PageShell>
  );
}

function PurchaseRow({
  row,
  expanded,
  onToggle,
}: {
  row: PosPurchaseRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: items = [] } = usePosPurchaseItems(expanded ? row.id : null);
  return (
    <>
      <tr className="border-t border-border hover:bg-accent/30 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-3 py-2">
          <div>{row.business_date ? fmtDateOnly(row.business_date) : "—"}</div>
          <div className="text-xs text-muted-foreground">{fmtDateTime(row.created_at)}</div>
        </td>
        <td className="px-3 py-2">
          <Badge variant={row.purchase_type === "bulk" ? "default" : "secondary"}>
            {row.purchase_type}
          </Badge>
        </td>
        <td className="px-3 py-2">{row.supplier || "—"}</td>
        <td className="px-3 py-2 text-muted-foreground">{row.notes || "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums font-medium">
          {formatNumberSpaces(row.total_tzs)}
        </td>
        <td className="px-3 py-2">
          {row.expense_id ? (
            <Badge variant="outline">Pending approval</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-6 py-3">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Item</th>
                  <th className="text-right py-1">Qty</th>
                  <th className="text-right py-1">Unit cost</th>
                  <th className="text-right py-1">Line total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-border/50">
                    <td className="py-1">{it.item_name}</td>
                    <td className="py-1 text-right tabular-nums">{it.qty}</td>
                    <td className="py-1 text-right tabular-nums">{formatNumberSpaces(it.unit_cost_tzs)}</td>
                    <td className="py-1 text-right tabular-nums">{formatNumberSpaces(it.line_total_tzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
