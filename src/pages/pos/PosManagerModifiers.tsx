import { useState } from "react";
import { Sparkles, Plus, Archive, ArchiveRestore, Settings } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { DataTable, DTBody, DTCell, DTHead, DTHeader, DTRow } from "@/components/ui/data-table";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import {
  usePosModifiers,
  useUpsertPosModifier,
  useArchivePosModifier,
  type PosModifier,
} from "@/hooks/use-pos-modifiers";
import { formatNumberSpaces } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import { PosModifierConfigDialog } from "@/components/pos/manager/PosModifierConfigDialog";

export default function PosManagerModifiers() {
  const { activeCasinoId } = useCasino();
  const { roles } = useAuth();
  const rs = roles as readonly string[];
  const canEdit = rs.includes("pos_manager") || rs.includes("super_admin");
  const { data: modifiers = [], isLoading } = usePosModifiers(activeCasinoId, false);
  const upsert = useUpsertPosModifier();
  const archive = useArchivePosModifier();
  const [edit, setEdit] = useState<Partial<PosModifier> | null>(null);
  const [configFor, setConfigFor] = useState<PosModifier | null>(null);


  const handleSave = async () => {
    if (!edit || !activeCasinoId || !edit.name?.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: edit.id,
        casino_id: activeCasinoId,
        name: edit.name.trim(),
        price_tzs_delta: edit.price_tzs_delta ?? 0,
        is_active: edit.is_active ?? true,
        sort_order: edit.sort_order ?? 0,
      });
      toast({ title: edit.id ? "Modifier updated" : "Modifier created" });
      setEdit(null);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <PageShell>
      <PageHeader title="Modifiers" subtitle="Extra Milk, No Ice, Double Shot — per-unit price delta" icon={Sparkles}>
        {canEdit && (
          <Button onClick={() => setEdit({ price_tzs_delta: 0, is_active: true, sort_order: 0 })}>
            <Plus className="h-4 w-4 mr-2" /> New modifier
          </Button>
        )}
      </PageHeader>

      <PageSection bodyClassName="p-0">
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader>Name</DTHeader>
              <DTHeader className="text-right">Δ price / unit</DTHeader>
              <DTHeader>Sort</DTHeader>
              <DTHeader>Status</DTHeader>
              <DTHeader className="text-right">Actions</DTHeader>
            </DTRow>
          </DTHead>
          <DTBody>
            {isLoading ? (
              <DTRow><DTCell colSpan={5} className="text-center text-muted-foreground">Loading…</DTCell></DTRow>
            ) : modifiers.length === 0 ? (
              <DTRow><DTCell colSpan={5} className="text-center text-muted-foreground">No modifiers yet.</DTCell></DTRow>
            ) : modifiers.map((m) => (
              <DTRow key={m.id}>
                <DTCell className="font-medium">{m.name}</DTCell>
                <DTCell className="text-right font-mono tabular-nums">
                  {m.price_tzs_delta > 0 ? "+" : ""}{formatNumberSpaces(m.price_tzs_delta)}
                </DTCell>
                <DTCell className="tabular-nums">{m.sort_order}</DTCell>
                <DTCell>
                  {m.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Archived</Badge>}
                </DTCell>
                <DTCell className="text-right">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setConfigFor(m)}>
                        <Settings className="h-4 w-4 mr-1" /> Configure
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEdit(m)}>Edit</Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={m.is_active ? "Archive" : "Unarchive"}
                        onClick={() => archive.mutate({ id: m.id, is_active: !m.is_active })}
                      >
                        {m.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}

                </DTCell>
              </DTRow>
            ))}
          </DTBody>
        </DataTable>
        <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
          Modifier price applies per unit:{" "}
          <code className="font-mono">line_total = (unit + Σ delta) × qty</code>. Modifiers can only be
          added/changed while an order is still in <strong>pending</strong> status; the bartender
          confirming the order locks them.
        </div>
      </PageSection>

      <ResponsiveDialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? "Edit modifier" : "New modifier"}
        size="form"
      >
        {edit && (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Name</label>
              <Input
                value={edit.name ?? ""}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="Extra Milk"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Price delta (TZS, per unit)</label>
              <Input
                type="number"
                value={edit.price_tzs_delta ?? 0}
                onChange={(e) => setEdit({ ...edit, price_tzs_delta: parseInt(e.target.value) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Can be 0 (display-only) or negative (discount).
              </p>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Sort order</label>
              <Input
                type="number"
                value={edit.sort_order ?? 0}
                onChange={(e) => setEdit({ ...edit, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>
            <ResponsiveDialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={upsert.isPending}>Save</Button>
            </ResponsiveDialogFooter>
          </div>
        )}
      </ResponsiveDialog>
    </PageShell>
  );
}
