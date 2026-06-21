---
name: POS modifier recipe effects
description: 3C-1 — modifier × ingredient effect rules with optional per-item scope, allow-list, snapshot, lifecycle integration
type: feature
---
Phase 3C-1 (v1.3.400). Recipe-affecting modifiers.

**Tables**
- `pos_modifier_recipe_effects(modifier_id, sellable_item_id NULL=global, ingredient_item_id, effect_type, quantity, multiplier, unit, waste_percent, sort_order)`. Unique per `(modifier, COALESCE(scope), ingredient, effect_type)`. CHECK enforces multiplier>0 for multiply; quantity>=0 for add/override.
- `pos_modifier_menu_items(modifier_id, menu_item_id, casino_id)` allow-list. Empty rows = unrestricted.
- `pos_order_item_modifiers.recipe_effects_snapshot jsonb` frozen at attach time.

**Rules**
- Effect scope resolution: load global+specific; per `(ingredient, effect_type)` specific overrides global.
- Apply order in lifecycle: remove → override → multiply → add.
- Allow-list enforced server-side by trigger `pos_oim_allowlist_check` raising `MODIFIER_NOT_ALLOWED_FOR_ITEM`.
- Snapshot frozen — manager edits don't affect already-attached order_item_modifiers.
- Recompute trigger allowed to update snapshot column even after pending lock via `pos.system_recompute='on'` GUC.
- Modifier on item without recipe + add/override creates ad-hoc `pos_recipe_consumption` rows and emits `pos_modifier_no_base_recipe` audit. multiply/remove against absent base = no-op.
- Reversal unchanged from 3B: mirror stored rows; idempotent via `metadata->>'reverses'`.

**UI**
- Manager → Modifiers → "Configure" → effects table (global/per-item) + allow-list checkboxes.
- Waiter UI unchanged; existing attach flow gets snapshot automatically.
