import { useState } from "react";
import { MapPin, Plus, Archive, ArchiveRestore } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { DataTable, DTBody, DTCell, DTHead, DTHeader, DTRow } from "@/components/ui/data-table";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import {
  usePosLocations,
  useUpsertPosLocation,
  useArchivePosLocation,
  type PosLocation,
  type PosLocationType,
} from "@/hooks/use-pos-locations";
import { toast } from "@/hooks/use-toast";

const TYPES: { value: PosLocationType; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "coffee", label: "Coffee" },
  { value: "vip_service", label: "VIP service" },
  { value: "other", label: "Other" },
];

export default function PosManagerLocations() {
  const { activeCasinoId } = useCasino();
  const { roles } = useAuth();
  const rs = roles as readonly string[];
  const canEdit = rs.includes("pos_manager") || rs.includes("super_admin");
  const { data: locations = [], isLoading } = usePosLocations(activeCasinoId, false);
  const upsert = useUpsertPosLocation();
  const archive = useArchivePosLocation();

  const [edit, setEdit] = useState<Partial<PosLocation> | null>(null);

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
        type: (edit.type as PosLocationType) ?? "bar",
        is_active: edit.is_active ?? true,
        sort_order: edit.sort_order ?? 0,
      });
      toast({ title: edit.id ? "Location updated" : "Location created" });
      setEdit(null);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <PageShell>
      <PageHeader title="POS Locations" subtitle="Bars, coffee counters, VIP service…" icon={MapPin}>
        {canEdit && (
          <Button onClick={() => setEdit({ type: "bar", is_active: true, sort_order: 0 })}>
            <Plus className="h-4 w-4 mr-2" /> New location
          </Button>
        )}
      </PageHeader>

      <PageSection bodyClassName="p-0">
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader>Name</DTHeader>
              <DTHeader>Type</DTHeader>
              <DTHeader>Sort</DTHeader>
              <DTHeader>Status</DTHeader>
              <DTHeader className="text-right">Actions</DTHeader>
            </DTRow>
          </DTHead>
          <DTBody>
            {isLoading ? (
              <DTRow><DTCell colSpan={5} className="text-center text-muted-foreground">Loading…</DTCell></DTRow>
            ) : locations.length === 0 ? (
              <DTRow><DTCell colSpan={5} className="text-center text-muted-foreground">No locations.</DTCell></DTRow>
            ) : locations.map((loc) => (
              <DTRow key={loc.id}>
                <DTCell className="font-medium">{loc.name}</DTCell>
                <DTCell>{TYPES.find(t => t.value === loc.type)?.label ?? loc.type}</DTCell>
                <DTCell className="tabular-nums">{loc.sort_order}</DTCell>
                <DTCell>
                  {loc.is_active
                    ? <Badge variant="secondary">Active</Badge>
                    : <Badge variant="outline">Archived</Badge>}
                </DTCell>
                <DTCell className="text-right">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEdit(loc)}>Edit</Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={loc.is_active ? "Archive" : "Unarchive"}
                        onClick={() => archive.mutate({ id: loc.id, is_active: !loc.is_active })}
                      >
                        {loc.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </DTCell>
              </DTRow>
            ))}
          </DTBody>
        </DataTable>
      </PageSection>

      <ResponsiveDialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? "Edit location" : "New location"}
        size="form"
      >
        {edit && (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Name</label>
              <Input
                value={edit.name ?? ""}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="Main Bar"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Type</label>
              <Select
                value={(edit.type as string) ?? "bar"}
                onValueChange={(v) => setEdit({ ...edit, type: v as PosLocationType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
