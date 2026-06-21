/**
 * Phase 3C-1 — Modifier configuration dialog:
 *   - Recipe effects (add/multiply/override/remove per ingredient, global or per-item).
 *   - Optional allow-list of sellable items.
 *
 * Snapshot rule: when a waiter attaches the modifier to an order item, only the effects
 * that match the current sellable item (global ∪ specific, item-specific wins per
 * ingredient+effect_type) are frozen into the order_item_modifier snapshot. Edits made
 * here AFTER an order is confirmed do not change historical reversal.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  usePosModifierEffects,
  useUpsertPosModifierEffect,
  useDeletePosModifierEffect,
  usePosModifierAllowList,
  useSetPosModifierAllowList,
  type PosModifierRecipeEffect,
} from "@/hooks/use-pos-modifier-effects";
import { usePosMenuItems } from "@/hooks/use-pos-menu";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  casinoId: string;
  modifierId: string;
  modifierName: string;
};

const EFFECT_TYPES: PosModifierRecipeEffect["effect_type"][] = [
  "add_quantity",
  "multiply_quantity",
  "override_quantity",
  "remove_ingredient",
];

export function PosModifierConfigDialog({
  open,
  onOpenChange,
  casinoId,
  modifierId,
  modifierName,
}: Props) {
  const { data: effects = [] } = usePosModifierEffects(modifierId);
  const { data: allowList = [] } = usePosModifierAllowList(modifierId);
  const { data: items = [] } = usePosMenuItems(casinoId);
  const upsert = useUpsertPosModifierEffect();
  const remove = useDeletePosModifierEffect();
  const setAllow = useSetPosModifierAllowList();

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [draft, setDraft] = useState<Partial<PosModifierRecipeEffect> | null>(null);

  // Allow-list draft state
  const [allowDraft, setAllowDraft] = useState<Set<string> | null>(null);
  const currentAllow = useMemo(
    () => allowDraft ?? new Set(allowList.map((a) => a.menu_item_id)),
    [allowDraft, allowList],
  );

  const handleSaveEffect = async () => {
    if (!draft?.ingredient_item_id || !draft.effect_type) {
      toast({ title: "Ingredient and effect type are required", variant: "destructive" });
      return;
    }
    if (draft.effect_type === "multiply_quantity" && !(Number(draft.multiplier) > 0)) {
      toast({ title: "Multiplier must be > 0", variant: "destructive" });
      return;
    }
    if (
      (draft.effect_type === "add_quantity" || draft.effect_type === "override_quantity") &&
      !(Number(draft.quantity) >= 0)
    ) {
      toast({ title: "Quantity must be ≥ 0", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: draft.id,
        casino_id: casinoId,
        modifier_id: modifierId,
        sellable_item_id: draft.sellable_item_id ?? null,
        ingredient_item_id: draft.ingredient_item_id!,
        effect_type: draft.effect_type!,
        quantity: draft.effect_type === "remove_ingredient" ? null : (draft.quantity ?? null),
        multiplier: draft.effect_type === "multiply_quantity" ? (draft.multiplier ?? null) : null,
        unit: draft.unit ?? null,
        waste_percent: Number(draft.waste_percent ?? 0),
        sort_order: Number(draft.sort_order ?? 0),
      });
      toast({ title: draft.id ? "Effect updated" : "Effect added" });
      setDraft(null);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleSaveAllow = async () => {
    try {
      await setAllow.mutateAsync({
        modifier_id: modifierId,
        casino_id: casinoId,
        menu_item_ids: [...currentAllow],
      });
      toast({ title: "Allow-list updated" });
      setAllowDraft(null);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  // Detect overrides for the UI badge
  const overrideKeys = useMemo(() => {
    const specificKeys = new Set<string>();
    for (const e of effects) {
      if (e.sellable_item_id) specificKeys.add(`${e.ingredient_item_id}|${e.effect_type}`);
    }
    return specificKeys;
  }, [effects]);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Configure modifier — ${modifierName}`}
      size="table"
    >
      <div className="space-y-6">
        {/* Recipe Effects */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Recipe effects</h3>
            <Button
              size="sm"
              onClick={() =>
                setDraft({
                  effect_type: "add_quantity",
                  quantity: 0,
                  waste_percent: 0,
                  sort_order: 0,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Add effect
            </Button>
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left px-2 py-1">Scope</th>
                  <th className="text-left px-2 py-1">Ingredient</th>
                  <th className="text-left px-2 py-1">Effect</th>
                  <th className="text-right px-2 py-1">Qty / ×</th>
                  <th className="text-right px-2 py-1">Waste %</th>
                  <th className="text-right px-2 py-1">Sort</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {effects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted-foreground py-3">
                      No effects yet — modifier only affects price.
                    </td>
                  </tr>
                ) : (
                  effects.map((e) => {
                    const isGlobalOverridden =
                      !e.sellable_item_id &&
                      overrideKeys.has(`${e.ingredient_item_id}|${e.effect_type}`);
                    return (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-2 py-1">
                          {e.sellable_item_id ? (
                            <Badge variant="secondary">
                              {itemById.get(e.sellable_item_id)?.name ?? "specific"}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">global</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {itemById.get(e.ingredient_item_id)?.name ?? "?"}
                        </td>
                        <td className="px-2 py-1">
                          <span className="font-mono text-xs">{e.effect_type}</span>
                          {isGlobalOverridden && (
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              overridden
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          {e.effect_type === "multiply_quantity"
                            ? `×${e.multiplier}`
                            : e.effect_type === "remove_ingredient"
                              ? "—"
                              : e.quantity}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{e.waste_percent}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{e.sort_order}</td>
                        <td className="px-2 py-1 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setDraft(e)}>
                            Edit
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              remove.mutate({ id: e.id, modifier_id: modifierId })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Item-specific effects override global ones per (ingredient, effect type). Effects are
            snapshotted into the order item when the modifier is attached.
          </p>
        </section>

        {/* Allow-list */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Allowed menu items</h3>
            <div className="flex gap-2">
              {allowDraft && (
                <Button size="sm" variant="outline" onClick={() => setAllowDraft(null)}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={handleSaveAllow} disabled={setAllow.isPending}>
                Save allow-list
              </Button>
            </div>
          </div>
          {currentAllow.size === 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mb-2">
              <AlertTriangle className="h-3 w-3" /> Empty list = modifier available on every item.
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-md border border-border p-2 space-y-1">
            {items.map((it) => {
              const checked = currentAllow.has(it.id);
              return (
                <label
                  key={it.id}
                  className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-muted/50 rounded"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = new Set(currentAllow);
                      if (v) next.add(it.id);
                      else next.delete(it.id);
                      setAllowDraft(next);
                    }}
                  />
                  <span>{it.name}</span>
                </label>
              );
            })}
          </div>
        </section>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </ResponsiveDialogFooter>
      </div>

      {/* Effect editor (nested) */}
      <ResponsiveDialog
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? "Edit effect" : "New effect"}
        size="form"
      >
        {draft && (
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Scope</label>
              <Select
                value={draft.sellable_item_id ?? "__global__"}
                onValueChange={(v) =>
                  setDraft({ ...draft, sellable_item_id: v === "__global__" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">Global (any item)</SelectItem>
                  {items.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Ingredient</label>
              <Select
                value={draft.ingredient_item_id ?? ""}
                onValueChange={(v) => setDraft({ ...draft, ingredient_item_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ingredient" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Effect type</label>
              <Select
                value={draft.effect_type}
                onValueChange={(v) =>
                  setDraft({ ...draft, effect_type: v as PosModifierRecipeEffect["effect_type"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.effect_type === "multiply_quantity" ? (
              <div>
                <label className="text-xs uppercase text-muted-foreground">Multiplier</label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.multiplier ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, multiplier: parseFloat(e.target.value) })
                  }
                />
              </div>
            ) : draft.effect_type === "remove_ingredient" ? (
              <p className="text-xs text-muted-foreground">No additional fields.</p>
            ) : (
              <div>
                <label className="text-xs uppercase text-muted-foreground">Quantity</label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.quantity ?? ""}
                  onChange={(e) => setDraft({ ...draft, quantity: parseFloat(e.target.value) })}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs uppercase text-muted-foreground">Waste %</label>
                <Input
                  type="number"
                  step="0.1"
                  value={draft.waste_percent ?? 0}
                  onChange={(e) =>
                    setDraft({ ...draft, waste_percent: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground">Unit</label>
                <Input
                  value={draft.unit ?? ""}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  placeholder="ml / g"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground">Sort</label>
                <Input
                  type="number"
                  value={draft.sort_order ?? 0}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <ResponsiveDialogFooter>
              <Button variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEffect} disabled={upsert.isPending}>
                Save
              </Button>
            </ResponsiveDialogFooter>
          </div>
        )}
      </ResponsiveDialog>
    </ResponsiveDialog>
  );
}
