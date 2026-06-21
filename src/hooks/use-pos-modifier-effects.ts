/**
 * Phase 3C-1 — Hooks for modifier recipe effects + per-modifier allow-list.
 *
 * pos_modifier_recipe_effects:
 *   - global rows (sellable_item_id IS NULL) apply to any item
 *   - item-specific rows (sellable_item_id = X) override global per
 *     (ingredient_item_id, effect_type)
 * pos_modifier_menu_items:
 *   - empty list = modifier is unrestricted
 *   - non-empty = modifier can only be attached to those menu_items;
 *     DB trigger pos_oim_allowlist_check enforces this server-side.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PosModifierRecipeEffect = {
  id: string;
  casino_id: string;
  modifier_id: string;
  sellable_item_id: string | null;
  ingredient_item_id: string;
  effect_type: "add_quantity" | "multiply_quantity" | "override_quantity" | "remove_ingredient";
  quantity: number | null;
  multiplier: number | null;
  unit: string | null;
  waste_percent: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PosModifierMenuItem = {
  modifier_id: string;
  menu_item_id: string;
  casino_id: string;
  created_at: string;
};

const effectsKey = (modifierId: string | null) => ["pos-modifier-effects", modifierId] as const;
const allowKey = (modifierId: string | null) => ["pos-modifier-allowlist", modifierId] as const;

export function usePosModifierEffects(modifierId: string | null) {
  return useQuery({
    queryKey: effectsKey(modifierId),
    enabled: !!modifierId,
    queryFn: async (): Promise<PosModifierRecipeEffect[]> => {
      const { data, error } = await supabase
        .from("pos_modifier_recipe_effects")
        .select("*")
        .eq("modifier_id", modifierId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as PosModifierRecipeEffect[];
    },
  });
}

export function useUpsertPosModifierEffect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<PosModifierRecipeEffect> & {
        casino_id: string;
        modifier_id: string;
        ingredient_item_id: string;
        effect_type: PosModifierRecipeEffect["effect_type"];
      },
    ) => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        casino_id: input.casino_id,
        modifier_id: input.modifier_id,
        sellable_item_id: input.sellable_item_id ?? null,
        ingredient_item_id: input.ingredient_item_id,
        effect_type: input.effect_type,
        quantity: input.quantity ?? null,
        multiplier: input.multiplier ?? null,
        unit: input.unit ?? null,
        waste_percent: input.waste_percent ?? 0,
        sort_order: input.sort_order ?? 0,
        updated_at: new Date().toISOString(),
      };
      const { error } = input.id
        ? await supabase.from("pos_modifier_recipe_effects").update(payload).eq("id", input.id)
        : await supabase.from("pos_modifier_recipe_effects").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: effectsKey(v.modifier_id) }),
  });
}

export function useDeletePosModifierEffect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; modifier_id: string }) => {
      const { error } = await supabase
        .from("pos_modifier_recipe_effects")
        .delete()
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: effectsKey(v.modifier_id) }),
  });
}

export function usePosModifierAllowList(modifierId: string | null) {
  return useQuery({
    queryKey: allowKey(modifierId),
    enabled: !!modifierId,
    queryFn: async (): Promise<PosModifierMenuItem[]> => {
      const { data, error } = await supabase
        .from("pos_modifier_menu_items")
        .select("*")
        .eq("modifier_id", modifierId!);
      if (error) throw error;
      return (data ?? []) as PosModifierMenuItem[];
    },
  });
}

/** Sync allow-list: insert missing, delete removed. Empty list = unrestricted. */
export function useSetPosModifierAllowList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      modifier_id: string;
      casino_id: string;
      menu_item_ids: string[];
    }) => {
      const { data: existing, error: e1 } = await supabase
        .from("pos_modifier_menu_items")
        .select("menu_item_id")
        .eq("modifier_id", input.modifier_id);
      if (e1) throw e1;
      const have = new Set((existing ?? []).map((r) => r.menu_item_id));
      const want = new Set(input.menu_item_ids);

      const toAdd = [...want].filter((id) => !have.has(id));
      const toRemove = [...have].filter((id) => !want.has(id));

      if (toAdd.length) {
        const { error } = await supabase.from("pos_modifier_menu_items").insert(
          toAdd.map((menu_item_id) => ({
            modifier_id: input.modifier_id,
            menu_item_id,
            casino_id: input.casino_id,
          })),
        );
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from("pos_modifier_menu_items")
          .delete()
          .eq("modifier_id", input.modifier_id)
          .in("menu_item_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: allowKey(v.modifier_id) }),
  });
}
