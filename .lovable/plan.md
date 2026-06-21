# POS Phase 3C — Status

- **3C-1 IMPLEMENTED (v1.3.400)** — recipe-affecting modifiers backend + manager UI.
- 3C-2 pending — bottleneck availability view/RPC + waiter/manager UI.
- 3C-3 pending — cost snapshots + COGS RPC + report page.

## 3C-1 delivered

### Tables
- `pos_modifier_recipe_effects` — modifier × ingredient × effect_type, optional `sellable_item_id` scope (NULL = global). Unique per `(modifier, scope, ingredient, effect_type)`. CHECK guards quantity/multiplier validity. RLS read=auth, write=manager/pos_manager/super_admin/surveillance.
- `pos_modifier_menu_items` — optional allow-list. Empty = unrestricted.
- `pos_order_item_modifiers.recipe_effects_snapshot jsonb` — frozen, filtered, resolved snapshot.

### Triggers / functions
- `pos_oim_allowlist_check` BEFORE INSERT on `pos_order_item_modifiers` → raises `MODIFIER_NOT_ALLOWED_FOR_ITEM` when allow-list excludes the parent item.
- `pos_order_item_modifiers_recompute` extended: writes `recipe_effects_snapshot` using item-specific-overrides-global rule, ordered remove → override → multiply → add.
- `pos_order_item_modifiers_guard` extended: allows `pos.system_recompute='on'` write to update only the snapshot column post-create.
- `pos_orders_stock_lifecycle` reads each modifier snapshot, folds effects into the base recipe (remove → override → multiply → add), emits `pos_modifier_no_base_recipe` for ad-hoc consumption on item without recipe. Reversal unchanged from 3B (idempotent mirror).

### Audit
- `pos_order_confirmed` payload now includes `modifier_effect_lines`.
- `pos_modifier_no_base_recipe` per order item when synthetic ad-hoc consumption occurs.

### Frontend
- `src/hooks/use-pos-modifier-effects.ts` — effects + allow-list CRUD.
- `src/components/pos/manager/PosModifierConfigDialog.tsx` — effects editor (global + per-item) and allow-list editor.
- `src/pages/pos/PosManagerModifiers.tsx` — added **Configure** action per modifier opening the dialog.

### Reasons unchanged from 3B
`sale`, `pos_recipe_consumption`, `order_void_reversal`, `pos_recipe_reversal`. No new movement reasons.

## Verification (DB logic)
- Allow-list empty → modifier attachable to any item.
- Allow-list non-empty + non-allowed item → `MODIFIER_NOT_ALLOWED_FOR_ITEM` at insert.
- Snapshot only contains effects scoped to the parent sellable item; specific overrides global per (ingredient, effect_type).
- `multiply_quantity=2` on espresso → coffee consumed = base × 2 per order qty.
- `add_quantity` on absent ingredient → new consumption line.
- `remove_ingredient` → ingredient not deducted.
- `override_quantity` → replaces base.
- Effect order deterministic (remove, override, multiply, add).
- Modifier on item without recipe + add/override → ad-hoc consumption + `pos_modifier_no_base_recipe` audit. multiply/remove on absent = no-op.
- Reversal mirrors stored movements; idempotent via `metadata->>'reverses'`.
- Editing effects after order confirmed has no impact on stored snapshot or reversal.
- Pending-lock on modifiers preserved.
- Z-report / payment_split / locations / problem orders / auto-close untouched.

## Next
- 3C-2: bottleneck `v_pos_item_availability` view + `pos_item_availability_detail` RPC + waiter badges + manager breakdown panel.
- 3C-3: `unit_cost_tzs_snapshot`/`cost_tzs_snapshot` columns on `pos_inventory_movements`, lifecycle populates them, `pos_cogs_report` RPC + report page.
