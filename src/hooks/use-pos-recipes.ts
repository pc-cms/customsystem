/**
 * POS Recipes — foundation only (Phase 3A).
 * Recipe tables exist and can be edited by managers. They DO NOT yet affect
 * stock deduction — Phase 1 direct-stock lifecycle remains authoritative until 3B.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PosRecipe = {
  id: string;
  casino_id: string;
  sellable_item_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PosRecipeItem = {
  id: string;
  recipe_id: string;
  ingredient_item_id: string;
  quantity: number;
  unit: string | null;
  waste_percent: number;
  created_at: string;
  updated_at: string;
};

const k = (casinoId: string | null) => ["pos-recipes", casinoId] as const;

export function usePosRecipes(casinoId: string | null) {
  return useQuery({
    queryKey: k(casinoId),
    enabled: !!casinoId,
    queryFn: async (): Promise<PosRecipe[]> => {
      const { data, error } = await supabase
        .from("pos_recipes")
        .select("*")
        .eq("casino_id", casinoId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PosRecipe[];
    },
    staleTime: 30_000,
  });
}

export function usePosRecipeItems(recipeId: string | null) {
  return useQuery({
    queryKey: ["pos-recipe-items", recipeId],
    enabled: !!recipeId,
    queryFn: async (): Promise<PosRecipeItem[]> => {
      const { data, error } = await supabase
        .from("pos_recipe_items")
        .select("*")
        .eq("recipe_id", recipeId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as PosRecipeItem[];
    },
  });
}

export function useUpsertPosRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<PosRecipe> & { casino_id: string; sellable_item_id: string; name: string },
    ): Promise<string> => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        casino_id: input.casino_id,
        sellable_item_id: input.sellable_item_id,
        name: input.name,
        is_active: input.is_active ?? true,
        updated_at: new Date().toISOString(),
      };
      if (input.id) {
        const { error } = await supabase.from("pos_recipes").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase.from("pos_recipes").insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: k(v.casino_id) }),
  });
}

export function useArchivePosRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("pos_recipes")
        .update({ is_active: input.is_active, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-recipes"] }),
  });
}

export function useUpsertRecipeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PosRecipeItem> & { recipe_id: string; ingredient_item_id: string; quantity: number }) => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        recipe_id: input.recipe_id,
        ingredient_item_id: input.ingredient_item_id,
        quantity: input.quantity,
        unit: input.unit ?? null,
        waste_percent: input.waste_percent ?? 0,
        updated_at: new Date().toISOString(),
      };
      const { error } = input.id
        ? await supabase.from("pos_recipe_items").update(payload).eq("id", input.id)
        : await supabase.from("pos_recipe_items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-recipe-items"] }),
  });
}

export function useDeleteRecipeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_recipe_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-recipe-items"] }),
  });
}

/** Manager action: create a default 1:1 recipe (sellable item consumes itself, qty 1). */
export function useCreateDefaultRecipe() {
  const upsertRecipe = useUpsertPosRecipe();
  const upsertItem = useUpsertRecipeItem();
  return useMutation({
    mutationFn: async (input: { casino_id: string; sellable_item_id: string; name: string }) => {
      const recipeId = await upsertRecipe.mutateAsync({
        casino_id: input.casino_id,
        sellable_item_id: input.sellable_item_id,
        name: input.name,
        is_active: true,
      });
      await upsertItem.mutateAsync({
        recipe_id: recipeId,
        ingredient_item_id: input.sellable_item_id,
        quantity: 1,
      });
      return recipeId;
    },
  });
}
