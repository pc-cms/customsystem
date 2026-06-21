import { useMemo, useState } from "react";
import { ChefHat, Plus, Trash2, Archive, ArchiveRestore } from "lucide-react";
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
import { usePosMenuItems } from "@/hooks/use-pos-menu";
import {
  usePosRecipes,
  usePosRecipeItems,
  useUpsertPosRecipe,
  useArchivePosRecipe,
  useUpsertRecipeItem,
  useDeleteRecipeItem,
  useCreateDefaultRecipe,
  type PosRecipe,
} from "@/hooks/use-pos-recipes";
import { toast } from "@/hooks/use-toast";
import {
  usePosItemAvailabilityDetail,
  statusLabel,
  statusBadgeClass,
} from "@/hooks/use-pos-item-availability";
import { cn } from "@/lib/utils";

export default function PosManagerRecipes() {
  const { activeCasinoId } = useCasino();
  const { roles } = useAuth();
  const rs = roles as readonly string[];
  const canEdit = rs.includes("pos_manager") || rs.includes("super_admin");

  const { data: items = [] } = usePosMenuItems(activeCasinoId);
  const { data: recipes = [], isLoading } = usePosRecipes(activeCasinoId);
  const upsert = useUpsertPosRecipe();
  const archive = useArchivePosRecipe();
  const createDefault = useCreateDefaultRecipe();

  const itemById = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.id, it.name);
    return m;
  }, [items]);

  const [editor, setEditor] = useState<PosRecipe | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [draft, setDraft] = useState<{ sellable_item_id?: string; name?: string }>({});

  const sellableItems = items.filter((it) => it.is_active);

  const handleCreate = async () => {
    if (!activeCasinoId || !draft.sellable_item_id || !draft.name?.trim()) {
      toast({ title: "Item and name required", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        casino_id: activeCasinoId,
        sellable_item_id: draft.sellable_item_id,
        name: draft.name.trim(),
      });
      toast({ title: "Recipe created" });
      setNewDialog(false);
      setDraft({});
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleDefault = (itemId: string, itemName: string) => {
    if (!activeCasinoId) return;
    if (!window.confirm(`Create default 1:1 recipe for "${itemName}"?\nThis records that the item consumes itself, qty 1. Stock deduction is unchanged in Phase 3A.`)) return;
    createDefault.mutate(
      { casino_id: activeCasinoId, sellable_item_id: itemId, name: `${itemName} (1:1)` },
      {
        onSuccess: () => toast({ title: "Default recipe created" }),
        onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const itemsWithoutRecipe = sellableItems.filter(
    (it) => !recipes.some((r) => r.sellable_item_id === it.id && r.is_active),
  );

  return (
    <PageShell>
      <PageHeader title="Recipes / BOM" subtitle="Foundation only — stock deduction stays on legacy path in Phase 3A" icon={ChefHat}>
        {canEdit && (
          <Button onClick={() => setNewDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> New recipe
          </Button>
        )}
      </PageHeader>

      <PageSection bodyClassName="p-0" title="Recipes">
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader>Sellable item</DTHeader>
              <DTHeader>Recipe name</DTHeader>
              <DTHeader>Status</DTHeader>
              <DTHeader className="text-right">Actions</DTHeader>
            </DTRow>
          </DTHead>
          <DTBody>
            {isLoading ? (
              <DTRow><DTCell colSpan={4} className="text-center text-muted-foreground">Loading…</DTCell></DTRow>
            ) : recipes.length === 0 ? (
              <DTRow><DTCell colSpan={4} className="text-center text-muted-foreground">No recipes yet.</DTCell></DTRow>
            ) : recipes.map((r) => (
              <DTRow key={r.id}>
                <DTCell className="font-medium">{itemById.get(r.sellable_item_id) ?? r.sellable_item_id}</DTCell>
                <DTCell>{r.name}</DTCell>
                <DTCell>
                  {r.is_active
                    ? <Badge variant="secondary">Active (inert in 3A)</Badge>
                    : <Badge variant="outline">Archived</Badge>}
                </DTCell>
                <DTCell className="text-right">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditor(r)}>Open</Button>
                      <Button
                        variant="ghost" size="icon"
                        title={r.is_active ? "Archive" : "Unarchive"}
                        onClick={() => archive.mutate({ id: r.id, is_active: !r.is_active })}
                      >
                        {r.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </DTCell>
              </DTRow>
            ))}
          </DTBody>
        </DataTable>
        <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
          Recipes are foundation tables only in Phase 3A. Stock still deducts via legacy direct path
          for every item. The recipe-aware engine ships in Phase 3B.
        </div>
      </PageSection>

      {itemsWithoutRecipe.length > 0 && canEdit && (
        <PageSection title="Items without recipe" bodyClassName="p-0">
          <DataTable>
            <DTHead>
              <DTRow>
                <DTHeader>Item</DTHeader>
                <DTHeader>Stock</DTHeader>
                <DTHeader className="text-right">Default recipe</DTHeader>
              </DTRow>
            </DTHead>
            <DTBody>
              {itemsWithoutRecipe.slice(0, 50).map((it) => (
                <DTRow key={it.id}>
                  <DTCell className="font-medium">{it.name}</DTCell>
                  <DTCell className="text-muted-foreground">
                    {it.stock_qty == null ? "—" : `×${it.stock_qty}`}
                    <span className="ml-2 text-[10px] uppercase">Uses legacy direct deduction</span>
                  </DTCell>
                  <DTCell className="text-right">
                    {it.stock_qty != null && (
                      <Button variant="outline" size="sm" onClick={() => handleDefault(it.id, it.name)}>
                        Create 1:1
                      </Button>
                    )}
                  </DTCell>
                </DTRow>
              ))}
            </DTBody>
          </DataTable>
        </PageSection>
      )}

      <ResponsiveDialog
        open={newDialog}
        onOpenChange={setNewDialog}
        title="New recipe"
        size="form"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Sellable item</label>
            <Select
              value={draft.sellable_item_id ?? ""}
              onValueChange={(v) => {
                const it = items.find((x) => x.id === v);
                setDraft({ sellable_item_id: v, name: draft.name || (it ? it.name : "") });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent className="max-h-[40vh]">
                {sellableItems.map((it) => (
                  <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Recipe name</label>
            <Input
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="House Mojito v1"
            />
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={upsert.isPending}>Create</Button>
          </ResponsiveDialogFooter>
        </div>
      </ResponsiveDialog>

      <RecipeEditor
        recipe={editor}
        onClose={() => setEditor(null)}
        items={items}
        canEdit={canEdit}
      />
    </PageShell>
  );
}

function RecipeEditor({
  recipe, onClose, items, canEdit,
}: {
  recipe: PosRecipe | null;
  onClose: () => void;
  items: ReturnType<typeof usePosMenuItems>["data"];
  canEdit: boolean;
}) {
  const { data: lines = [] } = usePosRecipeItems(recipe?.id ?? null);
  const upsertItem = useUpsertRecipeItem();
  const deleteItem = useDeleteRecipeItem();
  const [draft, setDraft] = useState<{ ingredient_item_id?: string; quantity?: number; unit?: string; waste_percent?: number }>({});

  const itemMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items ?? []) m.set(it.id, it.name);
    return m;
  }, [items]);

  const handleAdd = async () => {
    if (!recipe || !draft.ingredient_item_id || !draft.quantity || draft.quantity <= 0) {
      toast({ title: "Ingredient and quantity required", variant: "destructive" });
      return;
    }
    try {
      await upsertItem.mutateAsync({
        recipe_id: recipe.id,
        ingredient_item_id: draft.ingredient_item_id,
        quantity: draft.quantity,
        unit: draft.unit ?? null,
        waste_percent: draft.waste_percent ?? 0,
      });
      setDraft({});
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <ResponsiveDialog
      open={!!recipe}
      onOpenChange={(o) => !o && onClose()}
      title={recipe ? `Recipe · ${recipe.name}` : ""}
      size="table"
    >
      {recipe && (
        <div className="space-y-3">
          <DataTable>
            <DTHead>
              <DTRow>
                <DTHeader>Ingredient</DTHeader>
                <DTHeader className="text-right">Qty</DTHeader>
                <DTHeader>Unit</DTHeader>
                <DTHeader className="text-right">Waste %</DTHeader>
                <DTHeader></DTHeader>
              </DTRow>
            </DTHead>
            <DTBody>
              {lines.length === 0 ? (
                <DTRow><DTCell colSpan={5} className="text-center text-muted-foreground">No ingredients yet.</DTCell></DTRow>
              ) : lines.map((ln) => (
                <DTRow key={ln.id}>
                  <DTCell className="font-medium">{itemMap.get(ln.ingredient_item_id) ?? ln.ingredient_item_id}</DTCell>
                  <DTCell className="text-right tabular-nums">{ln.quantity}</DTCell>
                  <DTCell className="text-muted-foreground">{ln.unit ?? "—"}</DTCell>
                  <DTCell className="text-right tabular-nums">{ln.waste_percent}%</DTCell>
                  <DTCell className="text-right">
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => deleteItem.mutate(ln.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </DTCell>
                </DTRow>
              ))}
            </DTBody>
          </DataTable>

          {canEdit && (
            <div className="rounded-md border border-border p-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
              <Select
                value={draft.ingredient_item_id ?? ""}
                onValueChange={(v) => setDraft({ ...draft, ingredient_item_id: v })}
              >
                <SelectTrigger className="sm:col-span-2"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                <SelectContent className="max-h-[40vh]">
                  {(items ?? []).map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number" step="0.01" placeholder="Qty"
                value={draft.quantity ?? ""}
                onChange={(e) => setDraft({ ...draft, quantity: parseFloat(e.target.value) || undefined })}
              />
              <Input
                placeholder="Unit (ml, g…)"
                value={draft.unit ?? ""}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
              <div className="flex gap-2">
                <Input
                  type="number" step="0.1" placeholder="Waste %"
                  value={draft.waste_percent ?? ""}
                  onChange={(e) => setDraft({ ...draft, waste_percent: parseFloat(e.target.value) || 0 })}
                />
                <Button onClick={handleAdd} disabled={upsertItem.isPending}>Add</Button>
              </div>
            </div>
          )}
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </ResponsiveDialogFooter>
        </div>
      )}
    </ResponsiveDialog>
  );
}
